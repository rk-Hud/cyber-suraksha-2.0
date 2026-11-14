"""Production SMTP/Resend delivery and transactionally queued case notifications."""
from __future__ import annotations

import smtplib
import ssl
import time
from email.message import EmailMessage
from urllib.parse import urlsplit

import requests
from sqlalchemy import select, or_, and_

from .models import Notification


class DeliveryError(Exception):
    pass


COPY = {
    "en": {
        "otp_subject": "CYBER SURAKSHA 2.0 verification code",
        "otp_body": "Your CYBER SURAKSHA 2.0 verification code is {code}. It expires in 5 minutes. Never share this code. If you did not request it, ignore this message.",
        "update_subject": "CYBER SURAKSHA 2.0 case update: {reference}",
        "update_body": "The status of your support case {reference} is now {status}. Sign in at {url} to read the update. This is an independent support platform, not a government complaint portal. For financial fraud in India, contact your bank and call 1930 promptly.",
        "status": {"pending": "Pending", "in_review": "In review", "awaiting_info": "Awaiting your information", "resolved": "Resolved", "closed": "Closed"},
    },
    "hi": {
        "otp_subject": "CYBER SURAKSHA 2.0 सत्यापन कोड",
        "otp_body": "आपका CYBER SURAKSHA 2.0 सत्यापन कोड {code} है। यह 5 मिनट में समाप्त होगा। इसे किसी से साझा न करें। यदि आपने अनुरोध नहीं किया, तो इस संदेश को अनदेखा करें।",
        "update_subject": "CYBER SURAKSHA 2.0 सहायता मामले का अपडेट: {reference}",
        "update_body": "आपके सहायता मामले {reference} की स्थिति अब {status} है। अपडेट पढ़ने के लिए {url} पर प्रवेश करें। यह स्वतंत्र सहायता मंच है, सरकारी शिकायत पोर्टल नहीं। भारत में वित्तीय धोखाधड़ी होने पर तुरंत बैंक से संपर्क करें और 1930 पर कॉल करें।",
        "status": {"pending": "लंबित", "in_review": "समीक्षा में", "awaiting_info": "आपकी जानकारी की प्रतीक्षा", "resolved": "समाधान किया गया", "closed": "बंद"},
    },
    "te": {
        "otp_subject": "CYBER SURAKSHA 2.0 ధృవీకరణ కోడ్",
        "otp_body": "మీ CYBER SURAKSHA 2.0 ధృవీకరణ కోడ్ {code}. ఇది 5 నిమిషాల్లో గడువు ముగుస్తుంది. ఈ కోడ్‌ను ఎవరితోనూ పంచుకోవద్దు. మీరు అభ్యర్థించకపోతే ఈ సందేశాన్ని పట్టించుకోవద్దు.",
        "update_subject": "CYBER SURAKSHA 2.0 సహాయ కేసు నవీకరణ: {reference}",
        "update_body": "మీ సహాయ కేసు {reference} స్థితి ఇప్పుడు {status}. నవీకరణ చదవడానికి {url} లోకి ప్రవేశించండి. ఇది స్వతంత్ర సహాయ వేదిక; ప్రభుత్వ ఫిర్యాదు పోర్టల్ కాదు. భారతదేశంలో ఆర్థిక మోసం జరిగితే వెంటనే మీ బ్యాంకును సంప్రదించి 1930కు కాల్ చేయండి.",
        "status": {"pending": "పెండింగ్‌లో", "in_review": "సమీక్షలో", "awaiting_info": "మీ సమాచారం కోసం వేచి ఉంది", "resolved": "పరిష్కరించబడింది", "closed": "మూసివేయబడింది"},
    },
}


class Mailer:
    def __init__(self, config):
        self.config = config
        self.provider = config["MAIL_PROVIDER"]
        self.test_transport = config.get("MAIL_TRANSPORT") if config.get("TESTING") else None
        if config.get("MAIL_TRANSPORT") is not None and not config.get("TESTING"):
            raise ValueError("Test mail transport is forbidden outside TESTING.")
        if self.test_transport:
            return
        if self.provider == "resend":
            if not config.get("RESEND_API_KEY") or not config.get("MAIL_FROM"):
                raise ValueError("Resend delivery must be configured before enabling accounts.")
        elif self.provider == "smtp":
            if not config.get("SMTP_HOST") or not config.get("SMTP_USERNAME") or not config.get("SMTP_PASSWORD") or not config.get("MAIL_FROM"):
                raise ValueError("Authenticated SMTP delivery must be configured.")
            if config["SMTP_SECURITY"] not in ("starttls", "ssl"):
                raise ValueError("SMTP must use verified TLS.")
        else:
            raise ValueError("Configure MAIL_PROVIDER=smtp or resend.")
        for field in ("MAIL_FROM", "SMTP_HOST", "SMTP_USERNAME"):
            if any(c in str(config.get(field, "")) for c in "\r\n"):
                raise ValueError("Invalid mail configuration.")

    def send(self, recipient, subject, body, *, idempotency_key=None):
        if self.test_transport:
            return self.test_transport(recipient, subject, body, idempotency_key)
        if "\r" in recipient or "\n" in recipient or "\r" in subject or "\n" in subject:
            raise DeliveryError("invalid_recipient")
        try:
            if self.provider == "resend":
                headers = {"Authorization": "Bearer " + self.config["RESEND_API_KEY"], "Content-Type": "application/json"}
                if idempotency_key:
                    headers["Idempotency-Key"] = idempotency_key
                # Endpoint and credential destination are server-owned, never request supplied.
                response = requests.post("https://api.resend.com/emails", headers=headers,
                                         json={"from": self.config["MAIL_FROM"], "to": [recipient], "subject": subject, "text": body}, timeout=(5, 15), allow_redirects=False)
                if not 200 <= response.status_code < 300:
                    raise DeliveryError("provider_rejected")
            else:
                message = EmailMessage()
                message["From"] = self.config["MAIL_FROM"]
                message["To"] = recipient
                message["Subject"] = subject
                if idempotency_key:
                    message["Message-ID"] = "<" + idempotency_key + "@cybersuraksha.local>"
                message.set_content(body)
                context = ssl.create_default_context()
                smtp_type = smtplib.SMTP_SSL if self.config["SMTP_SECURITY"] == "ssl" else smtplib.SMTP
                options = {"host": self.config["SMTP_HOST"], "port": self.config["SMTP_PORT"], "timeout": 15}
                if self.config["SMTP_SECURITY"] == "ssl":
                    options["context"] = context
                with smtp_type(**options) as smtp:
                    if self.config["SMTP_SECURITY"] == "starttls":
                        smtp.ehlo()
                        smtp.starttls(context=context)
                        smtp.ehlo()
                    smtp.login(self.config["SMTP_USERNAME"], self.config["SMTP_PASSWORD"])
                    smtp.send_message(message)
        except DeliveryError:
            raise
        except (requests.RequestException, smtplib.SMTPException, OSError, ValueError):
            # Exceptions can carry provider credentials or addresses; expose a stable code.
            raise DeliveryError("delivery_failed") from None

    def otp(self, recipient, code, language):
        copy = COPY.get(language, COPY["en"])
        self.send(recipient, copy["otp_subject"], copy["otp_body"].format(code=code))


def dispatch_due(app, *, maximum=25):
    factory = app.extensions["portal_sessionmaker"]
    delivered = 0
    for _ in range(maximum):
        current = int(time.time())
        with factory() as db:
            job = db.scalar(select(Notification).where(
                or_(and_(Notification.status == "pending", Notification.due_at <= current),
                    and_(Notification.status == "sending", Notification.leased_at < current - 300)),
                Notification.attempts < 6,
            ).order_by(Notification.due_at).with_for_update(skip_locked=True).limit(1))
            if not job:
                break
            job.status = "sending"
            job.leased_at = current
            job.attempts += 1
            recipient = job.user.email
            language = job.language
            values = {"reference": job.reference, "status": COPY.get(language, COPY["en"])["status"][job.case_status],
                      "url": app.config["PUBLIC_BASE_URL"] + "/" + language + "/cases/" + job.complaint_id}
            identity, attempt = job.id, job.attempts
            db.commit()
        copy = COPY.get(language, COPY["en"])
        failure = None
        try:
            app.extensions["portal_mailer"].send(recipient, copy["update_subject"].format(**values), copy["update_body"].format(**values), idempotency_key="case-update-" + identity)
        except DeliveryError as error:
            failure = str(error)
        with factory() as db:
            job = db.get(Notification, identity)
            if not job or job.status != "sending" or job.attempts != attempt:
                continue
            if failure is None:
                job.status, job.sent_at, job.last_error = "sent", int(time.time()), None
                delivered += 1
            else:
                job.last_error = failure
                job.status = "dead" if attempt >= 6 else "pending"
                job.due_at = int(time.time()) + min(3600, 30 * 2 ** attempt)
            job.leased_at = None
            db.commit()
    return delivered
