from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, session
from pathlib import Path
import sqlite3
import uuid
import os
from datetime import datetime, timezone

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "cyber_suraksha.db"

app = Flask(__name__)
# Fresh local secret unless the deployer supplies a persistent environment secret.
# Never commit the value of CYBER_SURAKSHA_SECRET to source control.
app.secret_key = os.environ.get("CYBER_SURAKSHA_SECRET") or os.urandom(32)
PUBLIC_DEMO_MODE = os.environ.get("PUBLIC_DEMO_MODE", "0") == "1"
app.config.update(
    MAX_CONTENT_LENGTH=16 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE", "0") == "1",
)


class ClosingSQLiteConnection(sqlite3.Connection):
    """SQLite connection that commits/rolls back and always closes on context exit."""
    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()


def get_db():
    conn = sqlite3.connect(DB_PATH, factory=ClosingSQLiteConnection)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS incidents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reference TEXT UNIQUE NOT NULL,
                created_at TEXT NOT NULL,
                incident_type TEXT NOT NULL,
                channel TEXT NOT NULL,
                incident_date TEXT NOT NULL,
                amount REAL NOT NULL DEFAULT 0,
                contact_name TEXT NOT NULL,
                contact_phone TEXT NOT NULL,
                description TEXT NOT NULL,
                evidence_note TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'Received',
                is_demo INTEGER NOT NULL DEFAULT 0
            )
        """)
        conn.commit()


def seed_demo_data():
    samples = [
        ("CS-DEMO-001", "Phishing / fake link", "SMS", "2026-10-28", 5000,
         "Demo Citizen A", "9000000001",
         "A fictional SMS claims a bank account will be blocked and asks the user to open a link.",
         "Fictional message text only; no real URL or personal data.", "Under review"),
        ("CS-DEMO-002", "UPI / payment fraud", "UPI app", "2026-10-29", 25000,
         "Demo Citizen B", "9000000002",
         "A fictional user approved a collect request believing it was a refund.",
         "Fictional transaction reference DEMO-UPI-8821.", "Escalation guidance shown"),
        ("CS-DEMO-003", "Investment / job scam", "Social media", "2026-10-30", 12000,
         "Demo Citizen C", "9000000003",
         "A fake investment group promised guaranteed daily returns.",
         "Synthetic chat transcript; no real account details.", "Awareness guidance sent"),
    ]
    with get_db() as conn:
        count = conn.execute("SELECT COUNT(*) FROM incidents WHERE is_demo=1").fetchone()[0]
        if count == 0:
            for row in samples:
                conn.execute("""
                    INSERT OR IGNORE INTO incidents
                    (reference, created_at, incident_type, channel, incident_date, amount,
                     contact_name, contact_phone, description, evidence_note, status, is_demo)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """, (row[0], datetime.now(timezone.utc).isoformat(timespec="seconds"),
                      *row[1:]))
            conn.commit()


@app.route("/")
def dashboard():
    with get_db() as conn:
        total = conn.execute("SELECT COUNT(*) FROM incidents WHERE is_demo=1" if PUBLIC_DEMO_MODE else "SELECT COUNT(*) FROM incidents").fetchone()[0]
        open_count = conn.execute(
            "SELECT COUNT(*) FROM incidents WHERE is_demo=1 AND status NOT IN ('Closed')" if PUBLIC_DEMO_MODE else "SELECT COUNT(*) FROM incidents WHERE status NOT IN ('Closed')"
        ).fetchone()[0]
        total_amount = conn.execute(
            "SELECT COALESCE(SUM(amount),0) FROM incidents WHERE is_demo=1" if PUBLIC_DEMO_MODE else "SELECT COALESCE(SUM(amount),0) FROM incidents"
        ).fetchone()[0]
        recent = conn.execute(
            "SELECT * FROM incidents WHERE is_demo=1 ORDER BY id DESC LIMIT 8" if PUBLIC_DEMO_MODE else "SELECT * FROM incidents ORDER BY id DESC LIMIT 8"
        ).fetchall()
    return render_template("index.html", total=total, open_count=open_count,
                           total_amount=total_amount, recent=recent)


@app.route("/report", methods=["GET", "POST"])
def report():
    if request.method == "POST":
        if PUBLIC_DEMO_MODE:
            return "Public demo is read-only. Do not submit real incidents here.", 403
        incident_type = request.form.get("incident_type", "").strip()
        channel = request.form.get("channel", "").strip()
        incident_date = request.form.get("incident_date", "").strip()
        name = request.form.get("contact_name", "").strip()
        phone = request.form.get("contact_phone", "").strip()
        description = request.form.get("description", "").strip()
        evidence_note = request.form.get("evidence_note", "").strip()
        amount_text = request.form.get("amount", "0").strip()

        allowed_types = {"Phishing / fake link", "UPI / payment fraud", "Identity theft",
                         "Investment / job scam", "Social media impersonation", "Other"}
        allowed_channels = {"SMS", "Phone call", "WhatsApp", "Email", "UPI app",
                            "Social media", "Website", "Other"}

        errors = []
        if incident_type not in allowed_types:
            errors.append("Choose a valid incident type.")
        if channel not in allowed_channels:
            errors.append("Choose a valid contact channel.")
        if not incident_date:
            errors.append("Incident date is required.")
        if not name or len(name) > 80:
            errors.append("Enter a name (maximum 80 characters).")
        if not phone or len(phone) > 20:
            errors.append("Enter a contact number (maximum 20 characters).")
        if len(description) < 15 or len(description) > 2000:
            errors.append("Description must be between 15 and 2,000 characters.")
        try:
            amount = float(amount_text or 0)
            if amount < 0 or amount > 100000000:
                raise ValueError()
        except ValueError:
            errors.append("Enter a valid amount between 0 and 100,000,000.")
            amount = 0

        if errors:
            for error in errors:
                flash(error, "error")
            return render_template("report.html", form=request.form)

        reference = "CS-" + uuid.uuid4().hex[:8].upper()
        created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        with get_db() as conn:
            conn.execute("""
                INSERT INTO incidents
                (reference, created_at, incident_type, channel, incident_date, amount,
                 contact_name, contact_phone, description, evidence_note, status, is_demo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Received', 0)
            """, (reference, created_at, incident_type, channel, incident_date, amount,
                  name, phone, description, evidence_note))
            conn.commit()
        return render_template("confirmation.html", reference=reference)

    return render_template("report.html", form={})


@app.route("/incidents")
def incidents():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM incidents WHERE is_demo=1 ORDER BY id DESC" if PUBLIC_DEMO_MODE else "SELECT * FROM incidents ORDER BY id DESC").fetchall()
    return render_template("incidents.html", incidents=rows)


@app.route("/incident/<reference>")
def incident_detail(reference):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM incidents WHERE reference=? AND is_demo=1" if PUBLIC_DEMO_MODE else "SELECT * FROM incidents WHERE reference=?", (reference,)).fetchone()
    if row is None:
        return render_template("not_found.html"), 404
    return render_template("incident_detail.html", incident=row)


# Stage 3: educational UPI fraud-response simulations. All events are fictional.
FRAUD_SCENARIOS = {
    "collect_request": {
        "title": "Fake refund / UPI collect request",
        "risk": "A collect request can ask you to authorise a payment. A UPI PIN is used to authorise a debit, not to receive money.",
        "events": [
            ("09:10", "A fictional caller says a refund is waiting and asks the user to open a UPI app."),
            ("09:12", "A collect request appears with a fictional amount of ₹4,999."),
            ("09:13", "The user enters their UPI PIN, believing it will receive the refund."),
            ("09:14", "The simulator records a fictional outgoing payment of ₹4,999."),
        ],
        "actions": [
            ("call_1930", "Call 1930 immediately to report the financial cyber fraud."),
            ("bank", "Contact the bank / UPI app through its official channel and request urgent action on the transaction."),
            ("evidence", "Preserve the transaction ID, time, amount, messages and caller details; do not edit evidence."),
            ("portal", "Submit a report through the official National Cyber Crime Reporting Portal."),
            ("stop", "Do not approve further collect requests or share PINs, OTPs or passwords."),
            ("pay_recovery", "Pay the caller an additional fee to recover the money."),
            ("delete_evidence", "Delete the messages and transaction details immediately."),
            ("share_pin", "Share the UPI PIN with the caller to reverse the payment."),
        ],
        "correct": {"call_1930", "bank", "evidence", "portal", "stop"},
        "lesson": "A UPI PIN authorises a payment. Never enter it to receive a refund, prize or incoming transfer.",
    },
    "remote_access": {
        "title": "Fake customer-care / screen-sharing scam",
        "risk": "A fraudster may misuse screen-sharing or remote-access software to watch activity or manipulate the victim into authorising payments.",
        "events": [
            ("16:20", "A fictional caller pretends to be customer-care staff and says an account needs verification."),
            ("16:23", "The caller persuades the user to install a remote-access / screen-sharing app."),
            ("16:25", "The caller asks the user to open the payment app while screen sharing is active."),
            ("16:26", "The user is tricked into authorising a fictional payment of ₹8,500."),
        ],
        "actions": [
            ("call_1930", "Call 1930 immediately to report the financial cyber fraud."),
            ("bank", "Use another trusted device or official bank channel to contact the bank urgently."),
            ("disconnect", "End the remote session and disconnect the affected device from the internet if remote access is still active."),
            ("evidence", "Preserve transaction details, caller number, messages and app details."),
            ("portal", "Submit a report through the official National Cyber Crime Reporting Portal."),
            ("reinstall", "Keep following the caller's instructions and install more apps."),
            ("share_otp", "Tell the caller your OTP and UPI PIN so they can cancel the payment."),
            ("ignore", "Wait several days before contacting the bank."),
        ],
        "correct": {"call_1930", "bank", "disconnect", "evidence", "portal"},
        "lesson": "Banks do not need your OTP, UPI PIN or remote access to reverse a payment. Stop the session and contact the bank independently.",
    },
}


@app.route("/fraud-simulator", methods=["GET", "POST"])
def fraud_simulator():
    scenario_id = request.values.get("scenario", "collect_request")
    if scenario_id not in FRAUD_SCENARIOS:
        scenario_id = "collect_request"
    scenario = FRAUD_SCENARIOS[scenario_id]
    result = None
    selected = []
    if request.method == "POST":
        selected = request.form.getlist("actions")
        correct = scenario["correct"]
        correct_selected = len(set(selected) & correct)
        incorrect_selected = len(set(selected) - correct)
        score = max(0, round((correct_selected - incorrect_selected) / len(correct) * 100))
        result = {"score": score, "correct_selected": correct_selected,
                  "incorrect_selected": incorrect_selected,
                  "missed": len(correct - set(selected))}
    return render_template("fraud_simulator.html", scenario_id=scenario_id,
                           scenario=scenario, result=result, selected=selected)


@app.route("/health")
def health():
    return jsonify({"status": "ok", "application": "Cyber Suraksha", "mode": "public read-only demo" if PUBLIC_DEMO_MODE else "local prototype"})


# ---------------------------------------------------------------------------
# CYBER SURAKSHA 2.0 integrated modules: language, SOC, Zero Trust,
# responsible vulnerability disclosure, and awareness learning.
# All records seeded here are synthetic training data.
# ---------------------------------------------------------------------------

UI_TEXT = {
    "en": {
        "dashboard":"Dashboard", "report":"Report incident", "incidents":"Incident register",
        "fraud":"Fraud simulator", "soc":"SOC simulator", "zero":"Zero Trust monitor",
        "disclosure":"Vulnerability disclosure", "awareness":"Awareness centre",
        "notice":"STUDENT PROTOTYPE: Local educational demonstration only. It does not submit complaints to police, CERT-In, banks or telecom providers. Never enter real passwords, OTPs, PINs or sensitive banking details.",
        "footer":"CYBER SURAKSHA 2.0 · Educational prototype · Synthetic demo records are labelled",
        "language":"Language", "local_only":"SIMULATION ONLY: No real network, bank, device or external system is contacted.",
        "soc_title":"SOC Investigation Simulator", "soc_intro":"Practise alert triage, evidence review, severity assessment and incident documentation using fictional security events.",
        "filter_severity":"Filter severity", "filter_status":"Filter status", "all":"All", "investigate":"Investigate",
        "alert_id":"Alert ID", "severity":"Severity", "status":"Status", "category":"Category", "source_ip":"Source IP",
        "username":"Username", "event_id":"Windows Event ID", "occurred":"Occurred (UTC)", "description":"Description",
        "analyst_notes":"Analyst notes", "assessment":"Analyst assessment", "response":"Recommended response", "save":"Save investigation",
        "new":"New", "investigating":"Investigating", "contained":"Contained (simulated)", "closed":"Closed",
        "zero_title":"Zero Trust Access Monitor", "zero_intro":"Evaluate fictional access requests using identity, device, location and least-privilege signals. This is not a real access-control system.",
        "scenario":"Choose a fictional access scenario", "evaluate":"Evaluate access", "decision":"Decision", "reason":"Reason",
        "disclosure_title":"Responsible Vulnerability Disclosure", "disclosure_intro":"Practise writing a responsible report about a fictional training asset. Do not test systems without written permission.",
        "asset":"Fictional training asset", "vuln_title":"Finding title", "details":"Technical details", "remediation":"Suggested remediation", "submit":"Save local training report",
        "awareness_title":"Cyber Safety Awareness Centre", "awareness_intro":"Short lessons and quizzes in English, Hindi and Telugu.", "lesson":"Lesson", "quiz":"Knowledge check", "check_answers":"Check answers", "score":"Your score",
        "sample":"SYNTHETIC SAMPLE", "no_records":"No records match these filters.", "privacy":"Privacy reminder: use fictional data only. Do not submit real victim details, passwords, OTPs, PINs, live targets or confidential vulnerability information.",
    },
    "hi": {
        "dashboard":"डैशबोर्ड", "report":"घटना रिपोर्ट करें", "incidents":"घटना रजिस्टर", "fraud":"धोखाधड़ी सिम्युलेटर",
        "soc":"SOC सिम्युलेटर", "zero":"ज़ीरो ट्रस्ट मॉनिटर", "disclosure":"कमज़ोरी प्रकटीकरण", "awareness":"जागरूकता केंद्र",
        "notice":"छात्र प्रोटोटाइप: यह केवल स्थानीय शैक्षिक प्रदर्शन है। यह पुलिस, CERT-In, बैंक या दूरसंचार सेवा को शिकायत नहीं भेजता। असली पासवर्ड, OTP, PIN या बैंकिंग जानकारी न डालें।",
        "footer":"CYBER SURAKSHA 2.0 · शैक्षिक प्रोटोटाइप · सभी नमूना रिकॉर्ड काल्पनिक हैं",
        "language":"भाषा", "local_only":"केवल सिम्युलेशन: किसी वास्तविक नेटवर्क, बैंक, डिवाइस या बाहरी सिस्टम से संपर्क नहीं होता।",
        "soc_title":"SOC जांच सिम्युलेटर", "soc_intro":"काल्पनिक सुरक्षा घटनाओं के माध्यम से अलर्ट की जांच, साक्ष्य समीक्षा, गंभीरता निर्धारण और घटना दस्तावेज़ीकरण का अभ्यास करें।",
        "filter_severity":"गंभीरता फ़िल्टर", "filter_status":"स्थिति फ़िल्टर", "all":"सभी", "investigate":"जांच करें",
        "alert_id":"अलर्ट ID", "severity":"गंभीरता", "status":"स्थिति", "category":"श्रेणी", "source_ip":"स्रोत IP",
        "username":"उपयोगकर्ता नाम", "event_id":"Windows Event ID", "occurred":"समय (UTC)", "description":"विवरण",
        "analyst_notes":"विश्लेषक नोट्स", "assessment":"विश्लेषक आकलन", "response":"अनुशंसित प्रतिक्रिया", "save":"जांच सहेजें",
        "new":"नया", "investigating":"जांच जारी", "contained":"नियंत्रित (सिम्युलेटेड)", "closed":"बंद",
        "zero_title":"ज़ीरो ट्रस्ट एक्सेस मॉनिटर", "zero_intro":"पहचान, डिवाइस, स्थान और न्यूनतम-अधिकार संकेतों के आधार पर काल्पनिक एक्सेस अनुरोधों का मूल्यांकन करें। यह वास्तविक एक्सेस नियंत्रण प्रणाली नहीं है।",
        "scenario":"काल्पनिक एक्सेस परिदृश्य चुनें", "evaluate":"एक्सेस का मूल्यांकन करें", "decision":"निर्णय", "reason":"कारण",
        "disclosure_title":"जिम्मेदार कमज़ोरी प्रकटीकरण", "disclosure_intro":"काल्पनिक प्रशिक्षण एसेट के बारे में जिम्मेदार रिपोर्ट लिखने का अभ्यास करें। लिखित अनुमति के बिना किसी सिस्टम का परीक्षण न करें।",
        "asset":"काल्पनिक प्रशिक्षण एसेट", "vuln_title":"खोज का शीर्षक", "details":"तकनीकी विवरण", "remediation":"सुझाया गया समाधान", "submit":"स्थानीय प्रशिक्षण रिपोर्ट सहेजें",
        "awareness_title":"साइबर सुरक्षा जागरूकता केंद्र", "awareness_intro":"अंग्रेज़ी, हिंदी और तेलुगु में छोटे पाठ और क्विज़।", "lesson":"पाठ", "quiz":"ज्ञान जांच", "check_answers":"उत्तर जांचें", "score":"आपका स्कोर",
        "sample":"काल्पनिक नमूना", "no_records":"इन फ़िल्टर से कोई रिकॉर्ड नहीं मिला।", "privacy":"गोपनीयता: केवल काल्पनिक डेटा इस्तेमाल करें। असली पीड़ित विवरण, पासवर्ड, OTP, PIN या गोपनीय कमज़ोरी जानकारी न डालें।",
    },
    "te": {
        "dashboard":"డాష్‌బోర్డ్", "report":"ఘటనను నివేదించండి", "incidents":"ఘటనల రిజిస్టర్", "fraud":"మోసం సిమ్యులేటర్",
        "soc":"SOC సిమ్యులేటర్", "zero":"జీరో ట్రస్ట్ మానిటర్", "disclosure":"దుర్బలత వెల్లడి", "awareness":"అవగాహన కేంద్రం",
        "notice":"విద్యార్థి ప్రోటోటైప్: ఇది స్థానిక విద్యా ప్రదర్శన మాత్రమే. పోలీసు, CERT-In, బ్యాంకులు లేదా టెలికాం సంస్థలకు ఫిర్యాదు పంపదు. నిజమైన పాస్‌వర్డ్‌లు, OTPలు, PINలు లేదా బ్యాంకింగ్ వివరాలు నమోదు చేయవద్దు.",
        "footer":"CYBER SURAKSHA 2.0 · విద్యా ప్రోటోటైప్ · నమూనా రికార్డులన్నీ కల్పితం",
        "language":"భాష", "local_only":"సిమ్యులేషన్ మాత్రమే: నిజమైన నెట్‌వర్క్, బ్యాంక్, పరికరం లేదా బాహ్య వ్యవస్థను సంప్రదించదు.",
        "soc_title":"SOC దర్యాప్తు సిమ్యులేటర్", "soc_intro":"కల్పిత భద్రతా సంఘటనలతో అలర్ట్ ట్రయాజ్, ఆధారాల సమీక్ష, తీవ్రత అంచనా మరియు ఘటన నమోదు సాధన చేయండి.",
        "filter_severity":"తీవ్రత ఫిల్టర్", "filter_status":"స్థితి ఫిల్టర్", "all":"అన్నీ", "investigate":"దర్యాప్తు చేయండి",
        "alert_id":"అలర్ట్ ID", "severity":"తీవ్రత", "status":"స్థితి", "category":"వర్గం", "source_ip":"మూల IP",
        "username":"వినియోగదారు పేరు", "event_id":"Windows Event ID", "occurred":"సమయం (UTC)", "description":"వివరణ",
        "analyst_notes":"విశ్లేషకుడి గమనికలు", "assessment":"విశ్లేషకుడి అంచనా", "response":"సిఫార్సు చేసిన చర్య", "save":"దర్యాప్తును సేవ్ చేయండి",
        "new":"కొత్తది", "investigating":"దర్యాప్తులో ఉంది", "contained":"నియంత్రించబడింది (సిమ్యులేటెడ్)", "closed":"మూసివేయబడింది",
        "zero_title":"జీరో ట్రస్ట్ యాక్సెస్ మానిటర్", "zero_intro":"గుర్తింపు, పరికరం, స్థానం మరియు కనీస అనుమతుల ఆధారంగా కల్పిత యాక్సెస్ అభ్యర్థనలను అంచనా వేయండి. ఇది నిజమైన యాక్సెస్ నియంత్రణ వ్యవస్థ కాదు.",
        "scenario":"కల్పిత యాక్సెస్ సందర్భాన్ని ఎంచుకోండి", "evaluate":"యాక్సెస్‌ను అంచనా వేయండి", "decision":"నిర్ణయం", "reason":"కారణం",
        "disclosure_title":"బాధ్యతాయుత దుర్బలత వెల్లడి", "disclosure_intro":"కల్పిత శిక్షణ ఆస్తి గురించి బాధ్యతాయుత నివేదిక రాయడం సాధన చేయండి. లిఖిత అనుమతి లేకుండా ఏ వ్యవస్థనూ పరీక్షించవద్దు.",
        "asset":"కల్పిత శిక్షణ ఆస్తి", "vuln_title":"కనుగొన్న అంశం శీర్షిక", "details":"సాంకేతిక వివరాలు", "remediation":"సూచించిన పరిష్కారం", "submit":"స్థానిక శిక్షణ నివేదికను సేవ్ చేయండి",
        "awareness_title":"సైబర్ భద్రత అవగాహన కేంద్రం", "awareness_intro":"ఇంగ్లీష్, హిందీ మరియు తెలుగులో చిన్న పాఠాలు, క్విజ్‌లు.", "lesson":"పాఠం", "quiz":"జ్ఞాన పరీక్ష", "check_answers":"సమాధానాలను తనిఖీ చేయండి", "score":"మీ స్కోరు",
        "sample":"కల్పిత నమూనా", "no_records":"ఈ ఫిల్టర్‌లకు సరిపడే రికార్డులు లేవు.", "privacy":"గోప్యత: కల్పిత డేటానే ఉపయోగించండి. నిజమైన బాధితుల వివరాలు, పాస్‌వర్డ్‌లు, OTPలు, PINలు లేదా గోప్యమైన దుర్బలత సమాచారాన్ని నమోదు చేయవద్దు.",
    }
}

@app.before_request
def select_language():
    requested = request.args.get("lang")
    if requested in UI_TEXT:
        session["lang"] = requested

@app.context_processor
def inject_language():
    lang = session.get("lang", "en")
    return {"lang": lang, "t": UI_TEXT.get(lang, UI_TEXT["en"]), "public_demo": PUBLIC_DEMO_MODE}


def init_extended_db():
    """Additive schema only: CREATE TABLE IF NOT EXISTS; never drops or rewrites old tables."""
    with get_db() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS soc_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT, alert_id TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL, category TEXT NOT NULL, severity TEXT NOT NULL,
            source_ip TEXT NOT NULL, username TEXT NOT NULL, event_id TEXT NOT NULL,
            occurred_at TEXT NOT NULL, description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'New', analyst_notes TEXT NOT NULL DEFAULT '',
            assessment TEXT NOT NULL DEFAULT '', response TEXT NOT NULL DEFAULT '', is_demo INTEGER NOT NULL DEFAULT 1
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS zero_trust_evaluations (
            id INTEGER PRIMARY KEY AUTOINCREMENT, scenario_id TEXT NOT NULL,
            decision TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL,
            is_demo INTEGER NOT NULL DEFAULT 1
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS disclosure_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT, report_ref TEXT UNIQUE NOT NULL,
            asset TEXT NOT NULL, title TEXT NOT NULL, severity TEXT NOT NULL,
            details TEXT NOT NULL, remediation TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Saved locally',
            created_at TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0
        )""")
        conn.commit()


def seed_integrated_data():
    alerts = [
        ("SOC-DEMO-001","Repeated failed logins","Authentication","High","198.51.100.24","demo.user","4625","2026-11-01T02:10:00Z","Six failed logon attempts for a fictional account within three minutes.","Investigate"),
        ("SOC-DEMO-002","Successful login after failures","Authentication","High","198.51.100.24","demo.user","4624","2026-11-01T02:13:00Z","A successful interactive logon followed repeated failures from the same synthetic source.","Investigate"),
        ("SOC-DEMO-003","Unusual PowerShell process","Execution","Critical","192.0.2.44","demo.admin","4688","2026-11-01T03:25:00Z","Synthetic process event shows an unusual encoded-command pattern. No command is executed by this simulator.","Review process ancestry and endpoint telemetry; contain only through an authorised real EDR workflow."),
        ("SOC-DEMO-004","New local user created","Account management","Medium","192.0.2.15","demo.operator","4720","2026-11-01T04:00:00Z","A fictional local account was created outside the usual maintenance window.","Verify change approval and account owner."),
        ("SOC-DEMO-005","User added to privileged group","Privilege change","High","192.0.2.15","demo.operator","4732","2026-11-01T04:04:00Z","A fictional user was added to a sensitive local group.","Validate ticket and least-privilege requirement."),
        ("SOC-DEMO-006","Unusual file access","Data access","Low","203.0.113.19","demo.staff","4663","2026-11-01T05:12:00Z","A synthetic file-access event occurred on a training share.","Check access baseline and business context."),
        ("SOC-DEMO-007","Kerberos service ticket anomaly","Authentication","Medium","203.0.113.21","demo.service","4769","2026-11-01T05:40:00Z","A fictional service ticket request deviates from the training baseline.","Review service account usage and event correlation."),
        ("SOC-DEMO-008","Suspicious sign-in from new location","Identity","High","198.51.100.88","demo.finance","4624","2026-11-01T06:02:00Z","A synthetic sign-in appears from an unfamiliar location and device context.","Verify with the user using a trusted channel; revoke sessions only in an authorised real identity platform."),
    ]
    with get_db() as conn:
        count = conn.execute("SELECT COUNT(*) FROM soc_alerts").fetchone()[0]
        if count == 0:
            for a in alerts:
                conn.execute("""INSERT INTO soc_alerts
                    (alert_id,title,category,severity,source_ip,username,event_id,occurred_at,description,response,is_demo)
                    VALUES (?,?,?,?,?,?,?,?,?,?,1)""", a)
        conn.commit()


@app.route("/soc-simulator")
def soc_simulator():
    severity = request.args.get("severity", "All")
    status = request.args.get("status", "All")
    allowed_severity = {"All", "Critical", "High", "Medium", "Low"}
    allowed_status = {"All", "New", "Investigating", "Contained", "Closed"}
    if severity not in allowed_severity: severity = "All"
    if status not in allowed_status: status = "All"
    query = "SELECT * FROM soc_alerts WHERE 1=1"
    params = []
    if severity != "All": query += " AND severity=?"; params.append(severity)
    if status != "All": query += " AND status=?"; params.append(status)
    query += " ORDER BY CASE severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END, id"
    with get_db() as conn: alerts = conn.execute(query, params).fetchall()
    return render_template("soc_simulator.html", alerts=alerts, severity=severity, status=status)


@app.route("/soc/<alert_id>", methods=["GET", "POST"])
def soc_investigate(alert_id):
    with get_db() as conn: alert = conn.execute("SELECT * FROM soc_alerts WHERE alert_id=?", (alert_id,)).fetchone()
    if alert is None: return render_template("not_found.html"), 404
    if request.method == "POST":
        if PUBLIC_DEMO_MODE:
            return "Public demo investigation notes are read-only.", 403
        new_status = request.form.get("status", "New")
        assessment = request.form.get("assessment", "").strip()[:1000]
        notes = request.form.get("analyst_notes", "").strip()[:3000]
        allowed = {"New", "Investigating", "Contained", "Closed"}
        if new_status not in allowed:
            flash("Invalid workflow status.", "error")
        elif not notes:
            flash("Add investigation notes before saving.", "error")
        else:
            with get_db() as conn:
                conn.execute("UPDATE soc_alerts SET status=?, analyst_notes=?, assessment=? WHERE alert_id=?",
                             (new_status, notes, assessment, alert_id)); conn.commit()
            flash("Training investigation saved locally. No real system was changed.", "success")
            return redirect(url_for("soc_investigate", alert_id=alert_id))
        with get_db() as conn: alert = conn.execute("SELECT * FROM soc_alerts WHERE alert_id=?", (alert_id,)).fetchone()
    return render_template("soc_investigate.html", alert=alert)


ZERO_TRUST_SCENARIOS = {
    "managed_device": {"label":"Known employee · managed device · approved location", "identity":True,"device":True,"location":True,"mfa":True,"role":True,"reason":"Identity, managed-device posture, location, MFA and requested role all match the training policy."},
    "unknown_device": {"label":"Known employee · unknown device · approved location", "identity":True,"device":False,"location":True,"mfa":True,"role":True,"reason":"Device posture is unknown. Require device verification and additional checks before granting access."},
    "risky_location": {"label":"Known employee · managed device · unusual location", "identity":True,"device":True,"location":False,"mfa":True,"role":True,"reason":"The sign-in location is unusual for this fictional account. Deny or step up verification according to policy."},
    "excessive_privilege": {"label":"Employee requests administrator access without approval", "identity":True,"device":True,"location":True,"mfa":True,"role":False,"reason":"The requested privilege exceeds the user's approved role. Apply least privilege and require authorised approval."},
    "weak_auth": {"label":"Known employee · managed device · MFA not completed", "identity":True,"device":True,"location":True,"mfa":False,"role":True,"reason":"Multi-factor authentication is incomplete. Do not grant the protected session."},
}

@app.route("/zero-trust", methods=["GET", "POST"])
def zero_trust():
    result = None
    scenario_id = request.values.get("scenario", "managed_device")
    if scenario_id not in ZERO_TRUST_SCENARIOS: scenario_id = "managed_device"
    if request.method == "POST":
        s = ZERO_TRUST_SCENARIOS[scenario_id]
        allow = all(s[k] for k in ("identity","device","location","mfa","role"))
        decision = "ALLOW (SIMULATED)" if allow else "DENY / STEP-UP (SIMULATED)"
        reason = s["reason"]
        if not PUBLIC_DEMO_MODE:
            with get_db() as conn:
                conn.execute("INSERT INTO zero_trust_evaluations (scenario_id,decision,reason,created_at,is_demo) VALUES (?,?,?,?,1)",
                             (scenario_id, decision, reason, datetime.now(timezone.utc).isoformat(timespec="seconds")))
                conn.commit()
        result = {"decision":decision,"reason":reason,"signals":s}
    with get_db() as conn:
        history = conn.execute("SELECT * FROM zero_trust_evaluations ORDER BY id DESC LIMIT 8").fetchall()
    return render_template("zero_trust.html", scenarios=ZERO_TRUST_SCENARIOS, scenario_id=scenario_id, result=result, history=history)


@app.route("/disclosure", methods=["GET", "POST"])
def disclosure():
    errors = []
    if request.method == "POST":
        if PUBLIC_DEMO_MODE:
            return "Public demo disclosure submissions are disabled.", 403
        asset = request.form.get("asset", "").strip()
        title = request.form.get("title", "").strip()
        severity = request.form.get("severity", "Low")
        details = request.form.get("details", "").strip()
        remediation = request.form.get("remediation", "").strip()
        if not asset or len(asset) > 120: errors.append("Enter a fictional training asset name (maximum 120 characters).")
        if len(title) < 8 or len(title) > 120: errors.append("Title must be 8–120 characters.")
        if severity not in {"Critical","High","Medium","Low","Informational"}: errors.append("Choose a valid severity.")
        if len(details) < 20 or len(details) > 3000: errors.append("Details must be 20–3,000 characters.")
        if len(remediation) < 10 or len(remediation) > 1500: errors.append("Remediation must be 10–1,500 characters.")
        if errors:
            for e in errors: flash(e, "error")
        else:
            ref = "VDR-" + uuid.uuid4().hex[:8].upper()
            with get_db() as conn:
                conn.execute("INSERT INTO disclosure_reports (report_ref,asset,title,severity,details,remediation,created_at,is_demo) VALUES (?,?,?,?,?,?,?,0)",
                             (ref, asset, title, severity, details, remediation, datetime.now(timezone.utc).isoformat(timespec="seconds")))
                conn.commit()
            flash("Local training disclosure saved: " + ref + ". It was not sent to any organisation.", "success")
            return redirect(url_for("disclosure"))
    with get_db() as conn: reports = conn.execute("SELECT * FROM disclosure_reports WHERE is_demo=1 ORDER BY id DESC LIMIT 20" if PUBLIC_DEMO_MODE else "SELECT * FROM disclosure_reports ORDER BY id DESC LIMIT 20").fetchall()
    return render_template("disclosure.html", reports=reports)


AWARENESS = {
    "en": {
        "lessons":[("Spot phishing","Check the sender, domain and unexpected urgency. Do not open suspicious links or attachments."),("Protect UPI payments","A UPI PIN authorises a debit. Never share PINs or OTPs, and never approve an unexpected collect request."),("Secure your accounts","Use unique passwords, a password manager and multi-factor authentication. Review active sessions."),("Report quickly","For financial cyber fraud in India, call 1930 immediately, contact your bank and use cybercrime.gov.in.")],
        "questions":[("What does a UPI PIN do?",["Receives money","Authorises a debit","Verifies a caller"],1),("What should you do with an unexpected collect request?",["Approve quickly","Share OTP","Decline and verify independently"],2),("What is the national helpline for financial cyber fraud in India?",["1930","1000","1122"],0)]
    },
    "hi": {
        "lessons":[("फ़िशिंग पहचानें","भेजने वाले, डोमेन और अचानक बनाए गए दबाव की जांच करें। संदिग्ध लिंक या अटैचमेंट न खोलें।"),("UPI भुगतान सुरक्षित रखें","UPI PIN पैसे डेबिट करने की अनुमति देता है। PIN या OTP साझा न करें और अनजान कलेक्ट अनुरोध स्वीकार न करें।"),("अपने खाते सुरक्षित करें","अलग-अलग मजबूत पासवर्ड, पासवर्ड मैनेजर और मल्टी-फैक्टर प्रमाणीकरण इस्तेमाल करें। सक्रिय सत्र जांचें।"),("जल्दी रिपोर्ट करें","भारत में वित्तीय साइबर धोखाधड़ी पर तुरंत 1930 पर कॉल करें, बैंक से संपर्क करें और cybercrime.gov.in का उपयोग करें।")],
        "questions":[("UPI PIN किस काम आता है?",["पैसे प्राप्त करने","डेबिट की अनुमति देने","कॉलर की पहचान करने"],1),("अनजान कलेक्ट अनुरोध मिलने पर क्या करें?",["तुरंत स्वीकार करें","OTP साझा करें","अस्वीकार करें और स्वतंत्र रूप से जांचें"],2),("भारत में वित्तीय साइबर धोखाधड़ी हेल्पलाइन क्या है?",["1930","1000","1122"],0)]
    },
    "te": {
        "lessons":[("ఫిషింగ్‌ను గుర్తించండి","పంపినవారి వివరాలు, డొమైన్, అనూహ్యమైన తొందరను పరిశీలించండి. అనుమానాస్పద లింకులు లేదా అటాచ్‌మెంట్‌లు తెరవవద్దు."),("UPI చెల్లింపులను రక్షించండి","UPI PIN డెబిట్‌ను అనుమతిస్తుంది. PIN లేదా OTP పంచుకోవద్దు; తెలియని కలెక్ట్ అభ్యర్థనను ఆమోదించవద్దు."),("మీ ఖాతాలను భద్రపరచండి","ప్రత్యేకమైన బలమైన పాస్‌వర్డ్‌లు, పాస్‌వర్డ్ మేనేజర్, బహుళ-దశ ధృవీకరణ వాడండి. యాక్టివ్ సెషన్‌లను పరిశీలించండి."),("త్వరగా నివేదించండి","భారతదేశంలో ఆర్థిక సైబర్ మోసం జరిగితే వెంటనే 1930కు కాల్ చేసి, బ్యాంకును సంప్రదించి cybercrime.gov.in ఉపయోగించండి.")],
        "questions":[("UPI PIN దేనికి ఉపయోగపడుతుంది?",["డబ్బు స్వీకరించడానికి","డెబిట్‌ను అనుమతించడానికి","కాలర్‌ను ధృవీకరించడానికి"],1),("తెలియని కలెక్ట్ అభ్యర్థన వస్తే ఏమి చేయాలి?",["వెంటనే ఆమోదించాలి","OTP పంచుకోవాలి","తిరస్కరించి స్వతంత్రంగా ధృవీకరించాలి"],2),("భారతదేశంలో ఆర్థిక సైబర్ మోసం హెల్ప్‌లైన్ ఏది?",["1930","1000","1122"],0)]
    }
}

@app.route("/awareness", methods=["GET", "POST"])
def awareness():
    lang = session.get("lang", "en")
    content = AWARENESS.get(lang, AWARENESS["en"])
    score = None
    if request.method == "POST":
        answers = request.form
        correct = sum(1 for i, q in enumerate(content["questions"]) if answers.get(f"q{i}") == str(q[2]))
        score = {"correct":correct,"total":len(content["questions"])}
    return render_template("awareness.html", content=content, score=score)


init_db()
seed_demo_data()
init_extended_db()
seed_integrated_data()

if __name__ == "__main__":
    # Local-only by default. Do not expose this development server to the public internet.
    app.run(host="127.0.0.1", port=5000, debug=False)
