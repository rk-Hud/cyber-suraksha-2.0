"""Account, independently managed support cases and owner content routes."""
from __future__ import annotations

import hmac
import json
import re
import secrets
import time
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

import pyotp
from cryptography.fernet import InvalidToken
from flask import Blueprint, current_app, g, jsonify, redirect, render_template, request, send_file, url_for
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from .mail import DeliveryError
from .models import AuditEvent, BrowserSession, CaseEvent, Challenge, Complaint, LoginEvent, Notification, SiteContent, User
from .security import PortalError, csrf_token, digest, login_event, rate_limit, require_user, rotate_session, valid_https_url

web = Blueprint("web", __name__)
LANGUAGES = ("en", "hi", "te")
STATUSES = ("pending", "in_review", "awaiting_info", "resolved", "closed")
CATEGORIES = ("financial", "account", "harassment", "malware", "other")
TRANSITIONS = {
    "pending": {"in_review", "awaiting_info", "closed"},
    "in_review": {"awaiting_info", "resolved", "closed"},
    "awaiting_info": {"in_review", "resolved", "closed"},
    "resolved": {"in_review", "closed"}, "closed": {"in_review"},
}
CONTROLS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069]")


def normalize_email(value):
    if not isinstance(value, str) or len(value) > 254 or value.count("@") != 1 or any(c.isspace() for c in value):
        raise ValueError("Invalid email address.")
    local, domain = value.rsplit("@", 1)
    if not local or len(local) > 64 or local.startswith(".") or local.endswith(".") or ".." in local or not re.fullmatch(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+", local):
        raise ValueError("Invalid email address.")
    try:
        domain = domain.encode("idna").decode("ascii").lower()
    except UnicodeError:
        raise ValueError("Invalid email address.") from None
    if "." not in domain or len(domain) > 253 or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", part) for part in domain.split(".")):
        raise ValueError("Invalid email address.")
    return local.lower() + "@" + domain


def clean_text(value, minimum, maximum, code="msg_invalid_form"):
    if not isinstance(value, str) or not minimum <= len(value.strip()) <= maximum or CONTROLS.search(value):
        raise PortalError(code, 422)
    return value.strip()


def form(*names, optional=()):
    allowed = set(names) | set(optional) | {"csrf_token"}
    if set(request.form) - allowed or any(len(request.form.getlist(key)) != 1 for key in request.form):
        raise PortalError("msg_invalid_form", 422)
    if not set(names) <= set(request.form):
        raise PortalError("msg_invalid_form", 422)
    return {name: request.form.get(name, "") for name in allowed if name != "csrf_token"}


def form_email(value):
    try:
        return normalize_email(value)
    except ValueError:
        raise PortalError("msg_email_invalid", 422) from None


def password(value, confirmation=None):
    if not isinstance(value, str) or not 12 <= len(value) <= 128 or "\x00" in value or confirmation is not None and value != confirmation:
        raise PortalError("msg_password_policy", 422)
    return value


def format_time(value):
    if value is None:
        return "—"
    if isinstance(value, (int, float)):
        value = datetime.fromtimestamp(value, ZoneInfo("Asia/Kolkata"))
    else:
        value = value.astimezone(ZoneInfo("Asia/Kolkata"))
    return value.strftime("%d %b %Y · %H:%M IST")


def canonical(name, default=None):
    path = Path(current_app.config["DATA_DIR"]) / name
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    if current_app.config.get("TESTING"):
        return {} if default is None else default
    raise ValueError("Required public content is missing.")


def initialize_content(db):
    defaults = {
        "copy_en": {}, "copy_hi": {}, "copy_te": {},
        "resources": canonical("agencies.json", []),
        "advisory": {"active": False, "priority": "normal", "text": dict.fromkeys(LANGUAGES, "")},
        "branding": {"title": "CYBER SURAKSHA 2.0", "logo_url": "/static/img/cs-logo.svg", "tagline": {"en": "Learn · verify · respond", "hi": "सीखें · जाँचें · कार्रवाई करें", "te": "నేర్చుకోండి · ధృవీకరించండి · స్పందించండి"}},
    }
    for name, content in defaults.items():
        if not db.get(SiteContent, name):
            db.add(SiteContent(section=name, content=content))


def _json_value(value):
    if isinstance(value, User):
        return {key: getattr(value, key) for key in ("id", "email", "name", "role", "active", "language", "version", "totp_enabled")}
    if isinstance(value, Complaint):
        return {key: getattr(value, key) for key in ("id", "reference", "subject", "category", "status", "details", "created_at", "updated_at", "version", "user_id")}
    if isinstance(value, CaseEvent):
        return {key: getattr(value, key) for key in ("id", "sequence", "message", "author_role", "author_name", "old_status", "new_status", "created_at")}
    if isinstance(value, SiteContent):
        return {"section": value.section, "content": value.content, "version": value.version}
    if isinstance(value, LoginEvent):
        return {key: getattr(value, key) for key in ("email", "name", "success", "reason", "ip_label", "created_at")}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    if isinstance(value, dict):
        return {key: _json_value(item) for key, item in value.items() if not callable(item)}
    return value


def page(template, *, status=200, **context):
    copy = canonical("ui_" + getattr(g, "lang", "en") + ".json")
    entries = {}
    if hasattr(g, "db"):
        entries = {item.section: item.content for item in g.db.scalars(select(SiteContent)).all()}
    dictionary = {**copy, **entries.get("copy_" + getattr(g, "lang", "en"), {})}
    notice = context.pop("notice_code", None)
    browser = getattr(g, "browser", None)
    if browser and browser.notice:
        notice = browser.notice
        browser.notice = None
        g.db.commit()
    data = dict(lang=getattr(g, "lang", "en"), t=lambda key: dictionary.get(key, key),
                current_user=getattr(g, "current_user", None), csrf_token=csrf_token() if browser else "",
                format_time=format_time, site_origin=current_app.config["PUBLIC_BASE_URL"],
                year=datetime.now(ZoneInfo("Asia/Kolkata")).year,
                agencies=entries.get("resources", canonical("agencies.json", [])),
                advisory=entries.get("advisory"), branding=entries.get("branding", {}),
                values={}, notice_code=notice, error_code=None, public_registration=current_app.config["PUBLIC_REGISTRATION"] and not current_app.config["PRIVATE_MODE"])
    data.update(context)
    if current_app.config.get("TESTING") and current_app.config.get("JSON_RESPONSES"):
        return jsonify(_json_value(data)), status
    return render_template(template, **data), status


def notice(code, endpoint, **kwargs):
    g.browser.notice = code
    g.db.commit()
    return redirect(url_for(endpoint, lang=g.lang, **kwargs))


def _auth_limits(email, scope):
    rate_limit(scope + ":ip", limit=30, period=900)
    rate_limit(scope + ":email", limit=6, period=900, identity=email)


def issue_challenge(email, purpose, *, user=None, payload=None):
    rate_limit("email-send:ip", limit=30, period=3600)
    rate_limit("email-send:address", limit=6, period=3600, identity=email)
    if g.browser.pending_challenge:
        previous = g.db.get(Challenge, g.browser.pending_challenge)
        if previous:
            previous.consumed_at = int(time.time())
    identifier = str(uuid.uuid4())
    code = str(secrets.randbelow(1_000_000)).zfill(6)
    row = Challenge(id=identifier, browser_id=g.browser.id, user_id=user.id if user else None,
                    email=email, purpose=purpose, code_hash=digest(identifier + "\0" + g.browser.id + "\0" + purpose + "\0" + code, purpose="otp"),
                    payload=payload or {}, expires_at=int(time.time()) + 300)
    g.db.add(row)
    g.browser.pending_challenge = identifier
    g.db.commit()
    try:
        current_app.extensions["portal_mailer"].otp(email, code, g.lang)
    except DeliveryError:
        row.consumed_at = int(time.time())
        g.db.commit()
        raise PortalError("msg_mail_unavailable", 503) from None
    return row


def current_challenge(identifier=None, *, consume=False, code=None):
    pending = g.browser.pending_challenge
    if not pending or identifier is not None and identifier != pending:
        raise PortalError("msg_code_invalid", 422)
    statement = select(Challenge).where(Challenge.id == pending, Challenge.browser_id == g.browser.id)
    if consume:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    row = g.db.scalar(statement)
    now = int(time.time())
    if not row or row.consumed_at is not None or row.expires_at <= now or row.attempts >= 5:
        raise PortalError("msg_code_invalid", 422)
    if consume:
        row.attempts += 1
        expected = digest(row.id + "\0" + g.browser.id + "\0" + row.purpose + "\0" + str(code), purpose="otp")
        if not isinstance(code, str) or not re.fullmatch(r"[0-9]{6}", code) or not hmac.compare_digest(expected, row.code_hash):
            g.db.commit()
            raise PortalError("msg_code_invalid", 422)
        row.consumed_at = now
    return row


def revoke_sessions(user_id, *, except_id=None):
    # Password and account changes also invalidate challenges held by anonymous
    # browsers. Those sessions do not yet have a user_id of their own.
    pending = delete(Challenge).where(Challenge.user_id == user_id)
    if except_id:
        pending = pending.where(Challenge.browser_id != except_id)
    g.db.execute(pending)
    statement = select(BrowserSession.id).where(BrowserSession.user_id == user_id)
    if except_id:
        statement = statement.where(BrowserSession.id != except_id)
    ids = list(g.db.scalars(statement))
    if ids:
        g.db.execute(delete(Challenge).where(Challenge.browser_id.in_(ids)))
        g.db.execute(delete(BrowserSession).where(BrowserSession.id.in_(ids)))


def audit(action, record, **metadata):
    g.db.add(AuditEvent(actor_id=g.current_user.id, action=action, record=record, metadata_json=metadata))


@web.get("/")
def root():
    return redirect(url_for("web.home", lang="en"))


@web.get("/<any(en,hi,te):lang>/")
def home(lang):
    return page("index.html")


@web.route("/<any(en,hi,te):lang>/register", methods=["GET", "POST"])
def register(lang):
    if request.method == "GET":
        return page("portal/register.html")
    values = form("name", "email", "password", "confirm_password", "consent")
    email = form_email(values["email"])
    if (current_app.config["PRIVATE_MODE"] or not current_app.config["PUBLIC_REGISTRATION"]) and email != current_app.config["ADMIN_EMAIL"]:
        raise PortalError("msg_registration_closed", 403)
    name = clean_text(values["name"], 2, 100, "msg_name_invalid")
    chosen = password(values["password"], values["confirm_password"])
    if values["consent"] != "yes":
        raise PortalError("msg_consent_required", 422)
    _auth_limits(email, "register")
    existing = g.db.scalar(select(User).where(User.email == email))
    # Verified existing accounts never have their password or role overwritten.
    purpose = "existing_register" if existing else "register"
    payload = {"name": name, "password_hash": generate_password_hash(chosen, method="scrypt"), "language": lang} if not existing else {}
    issue_challenge(email, purpose, user=existing, payload=payload)
    return notice("msg_registration_check_email", "web.verify")


def _login(admin_mode=False):
    if request.method == "GET":
        return page("portal/login.html", admin_mode=admin_mode)
    values = form("email", "password")
    email = form_email(values["email"])
    _auth_limits(email, "login")
    user = g.db.scalar(select(User).where(User.email == email))
    secret = values["password"]
    valid = isinstance(secret, str) and len(secret) <= 128 and check_password_hash(user.password_hash if user else current_app.extensions["portal_dummy_password"], secret)
    if not valid or not user or not user.active or admin_mode and user.role != "owner":
        login_event(email, False, "credentials_rejected", user)
        g.db.commit()
        return page("portal/login.html", admin_mode=admin_mode, values={"email": email}, error_code="msg_invalid_credentials", status=401)
    issue_challenge(email, "admin_login" if admin_mode else "login", user=user)
    return redirect(url_for("web.verify", lang=g.lang))


@web.route("/<any(en,hi,te):lang>/login", methods=["GET", "POST"])
def login(lang):
    return _login()


@web.route("/<any(en,hi,te):lang>/admin/login", methods=["GET", "POST"])
def admin_login(lang):
    return _login(True)


@web.route("/<any(en,hi,te):lang>/verify", methods=["GET", "POST"])
def verify(lang):
    if request.method == "GET":
        challenge = current_challenge()
        if challenge.purpose == "reset":
            return redirect(url_for("web.reset", lang=lang))
        return page("portal/verify.html", challenge_id=challenge.id)
    values = form("challenge_id", "otp")
    rate_limit("verify:ip", limit=60, period=3600)
    challenge = current_challenge(values["challenge_id"], consume=True, code=values["otp"])
    if challenge.purpose not in ("register", "existing_register", "login", "admin_login"):
        raise PortalError("msg_code_invalid", 422)
    user = g.db.get(User, challenge.user_id) if challenge.user_id else None
    if challenge.purpose == "existing_register":
        g.db.commit()
        return notice("msg_registration_check_email", "web.login")
    if challenge.purpose == "register":
        if g.db.scalar(select(User.id).where(User.email == challenge.email)):
            g.db.commit()
            return notice("msg_registration_check_email", "web.login")
        user = User(email=challenge.email, name=challenge.payload["name"], password_hash=challenge.payload["password_hash"],
                    language=challenge.payload.get("language", lang), verified_at=int(time.time()),
                    role="owner" if challenge.email == current_app.config["ADMIN_EMAIL"] else "citizen")
        g.db.add(user)
        g.db.flush()
    if not user or not user.active or challenge.purpose == "admin_login" and user.role != "owner":
        raise PortalError("msg_invalid_credentials", 401)
    user.language = lang
    login_event(user.email, True, "password_and_email_otp", user)
    g.db.commit()
    destination = "web.admin_dashboard" if user.role == "owner" else "web.cases"
    rotate_session(user)
    return redirect(url_for(destination, lang=lang))


@web.post("/<any(en,hi,te):lang>/logout")
def logout(lang):
    rotate_session(notice="msg_logged_out")
    return redirect(url_for("web.login", lang=lang))


@web.route("/<any(en,hi,te):lang>/forgot", methods=["GET", "POST"])
def forgot(lang):
    if request.method == "GET":
        return page("portal/forgot.html")
    values = form("email")
    email = form_email(values["email"])
    _auth_limits(email, "forgot")
    user = g.db.scalar(select(User).where(User.email == email, User.active.is_(True)))
    # The same delivery/response flow applies to unknown addresses; a decoy challenge cannot modify an account.
    issue_challenge(email, "reset", user=user)
    return notice("msg_reset_check_email", "web.reset")


@web.route("/<any(en,hi,te):lang>/reset", methods=["GET", "POST"])
def reset(lang):
    if request.method == "GET":
        challenge = current_challenge()
        return page("portal/reset.html", challenge_id=challenge.id)
    values = form("challenge_id", "otp", "password", "confirm_password")
    chosen = password(values["password"], values["confirm_password"])
    rate_limit("reset:ip", limit=30, period=3600)
    challenge = current_challenge(values["challenge_id"], consume=True, code=values["otp"])
    if challenge.purpose != "reset":
        raise PortalError("msg_code_invalid", 422)
    if challenge.user_id:
        user = g.db.scalar(select(User).where(User.id == challenge.user_id).with_for_update().execution_options(populate_existing=True))
        if user and user.active:
            user.password_hash = generate_password_hash(chosen, method="scrypt")
            user.updated_at, user.version = int(time.time()), user.version + 1
            revoke_sessions(user.id, except_id=g.browser.id)
    g.db.commit()
    rotate_session(notice="msg_reset_done")
    return redirect(url_for("web.login", lang=lang))


def pagination(statement, model, *, per_page=20):
    try:
        number = int(request.args.get("page", "1"))
    except ValueError:
        raise PortalError("msg_invalid_form", 400) from None
    if not 1 <= number <= 10_000:
        raise PortalError("msg_invalid_form", 400)
    total = g.db.scalar(select(func.count()).select_from(statement.order_by(None).subquery()))
    items = g.db.scalars(statement.offset((number - 1) * per_page).limit(per_page)).all()
    return items, {"page": number, "has_next": number * per_page < total, "total": total}


@web.get("/<any(en,hi,te):lang>/cases")
@require_user()
def cases(lang):
    statement = select(Complaint).where(Complaint.user_id == g.current_user.id).order_by(Complaint.updated_at.desc())
    rows, paging = pagination(statement, Complaint)
    counts = dict(g.db.execute(select(Complaint.status, func.count()).where(Complaint.user_id == g.current_user.id).group_by(Complaint.status)).all())
    return page("portal/cases.html", cases=rows, pagination=paging, status_counts=counts)


@web.route("/<any(en,hi,te):lang>/cases/new", methods=["GET", "POST"])
@require_user()
def new_case(lang):
    if request.method == "GET":
        return page("portal/new_case.html", categories=CATEGORIES)
    values = form("subject", "category", "details", "consent")
    rate_limit("new-case:user", limit=10, period=3600, identity=g.current_user.id)
    subject = clean_text(values["subject"], 5, 160, "msg_subject_invalid")
    details = clean_text(values["details"], 20, 5000, "msg_details_invalid")
    if values["category"] not in CATEGORIES:
        raise PortalError("msg_invalid_form", 422)
    if values["consent"] != "yes":
        raise PortalError("msg_consent_required", 422)
    row = Complaint(reference="CS-" + secrets.token_hex(6).upper(), user_id=g.current_user.id,
                    subject=subject, details=details, category=values["category"], consent_at=int(time.time()))
    g.db.add(row)
    g.db.flush()
    g.db.add(CaseEvent(complaint_id=row.id, actor_id=g.current_user.id, sequence=1, author_role="citizen", author_name=g.current_user.name,
                       message=details, old_status=None, new_status="pending"))
    g.db.add(Notification(user_id=row.user_id, complaint_id=row.id, language=g.current_user.language, case_status="pending", reference=row.reference))
    g.db.commit()
    return notice("msg_case_created", "web.case_detail", case_id=row.id)


def case_record(case_id, *, lock=False):
    try:
        uuid.UUID(case_id)
    except ValueError:
        raise PortalError("msg_not_found", 404) from None
    statement = select(Complaint).where(Complaint.id == case_id)
    if g.current_user.role != "owner":
        statement = statement.where(Complaint.user_id == g.current_user.id)
    if lock:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    row = g.db.scalar(statement)
    if not row:
        raise PortalError("msg_not_found", 404)
    return row


@web.get("/<any(en,hi,te):lang>/cases/<case_id>")
@require_user()
def case_detail(lang, case_id):
    if g.current_user.role == "owner" and (not g.current_user.totp_enabled or not g.browser.mfa_at or g.browser.mfa_at < int(time.time()) - 600):
        return notice("msg_mfa_required", "web.admin_mfa")
    row = case_record(case_id)
    events = g.db.scalars(select(CaseEvent).where(CaseEvent.complaint_id == row.id).order_by(CaseEvent.sequence, CaseEvent.created_at)).all()
    return page("portal/case_detail.html", case=row, events=events, can_manage=g.current_user.role == "owner", statuses=STATUSES)


@web.post("/<any(en,hi,te):lang>/cases/<case_id>/reply")
@require_user()
def case_reply(lang, case_id):
    values = form("message")
    rate_limit("reply:user", limit=20, period=3600, identity=g.current_user.id)
    row = case_record(case_id, lock=True)
    if row.status == "closed" or g.current_user.role == "owner":
        raise PortalError("msg_forbidden", 403)
    message = clean_text(values["message"], 3, 3000, "msg_details_invalid")
    old_status = row.status
    if row.status == "awaiting_info":
        row.status = "in_review"
    row.version += 1
    row.updated_at = int(time.time())
    g.db.add(CaseEvent(complaint_id=row.id, actor_id=g.current_user.id, sequence=row.version, author_role="citizen", author_name=g.current_user.name,
                       message=message, old_status=old_status, new_status=row.status))
    if old_status != row.status:
        g.db.add(Notification(user_id=row.user_id, complaint_id=row.id, language=row.user.language, case_status=row.status, reference=row.reference))
    g.db.commit()
    return notice("msg_reply_added", "web.case_detail", case_id=row.id)


def totp_step(secret, code):
    if not isinstance(code, str) or not re.fullmatch(r"[0-9]{6}", code):
        return None
    totp = pyotp.TOTP(secret)
    current = int(time.time()) // 30
    for step in (current - 1, current, current + 1):
        if hmac.compare_digest(totp.at(step * 30), code):
            return step
    return None


@web.route("/<any(en,hi,te):lang>/admin/mfa", methods=["GET", "POST"])
@require_user(owner=True, mfa=False)
def admin_mfa(lang):
    user = g.current_user
    if request.method == "POST":
        values = form("code")
        rate_limit("totp:user", limit=6, period=300, identity=user.id)
        locked = g.db.scalar(select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True))
        try:
            secret = current_app.extensions["portal_cipher"].decrypt(locked.totp_secret.encode()).decode() if locked.totp_secret else None
        except InvalidToken:
            raise PortalError("msg_request_failed", 503) from None
        step = totp_step(secret, values["code"]) if secret else None
        if step is None or step <= locked.totp_last_step:
            raise PortalError("msg_mfa_invalid", 422)
        locked.totp_last_step = step
        g.browser.mfa_at = int(time.time())
        audit("mfa.verified", user.id)
        g.db.commit()
        return notice("msg_mfa_verified", "web.admin_dashboard")
    pending = None
    if not user.totp_enabled and g.browser.pending_totp_secret and g.browser.pending_totp_expires and g.browser.pending_totp_expires > int(time.time()):
        pending = current_app.extensions["portal_cipher"].decrypt(g.browser.pending_totp_secret.encode()).decode()
    return page("portal/admin_mfa.html", totp_enabled=user.totp_enabled, setup_secret=pending,
                setup_uri=pyotp.TOTP(pending).provisioning_uri(name=user.email, issuer_name="CYBER SURAKSHA 2.0") if pending else None)


@web.post("/<any(en,hi,te):lang>/admin/mfa/setup")
@require_user(owner=True, mfa=False)
def admin_mfa_setup(lang):
    values = form("intent", optional=("code",))
    rate_limit("totp-setup:user", limit=6, period=300, identity=g.current_user.id)
    if g.current_user.totp_enabled:
        raise PortalError("msg_forbidden", 403)
    if not g.browser.authenticated_at or g.browser.authenticated_at < int(time.time()) - 600:
        return notice("msg_mfa_required", "web.admin_login")
    if values["intent"] == "start":
        secret = pyotp.random_base32()
        g.browser.pending_totp_secret = current_app.extensions["portal_cipher"].encrypt(secret.encode()).decode()
        g.browser.pending_totp_expires = int(time.time()) + 600
        g.db.commit()
        return redirect(url_for("web.admin_mfa", lang=lang))
    if values["intent"] != "confirm" or not g.browser.pending_totp_secret or not g.browser.pending_totp_expires or g.browser.pending_totp_expires < int(time.time()):
        raise PortalError("msg_mfa_invalid", 422)
    secret = current_app.extensions["portal_cipher"].decrypt(g.browser.pending_totp_secret.encode()).decode()
    step = totp_step(secret, values["code"])
    if step is None:
        raise PortalError("msg_mfa_invalid", 422)
    locked = g.db.scalar(select(User).where(User.id == g.current_user.id).with_for_update().execution_options(populate_existing=True))
    if locked.totp_secret:
        raise PortalError("msg_forbidden", 403)
    locked.totp_secret = g.browser.pending_totp_secret
    locked.totp_last_step = step
    g.browser.pending_totp_secret = None
    g.browser.pending_totp_expires = None
    g.browser.mfa_at = int(time.time())
    audit("mfa.enabled", locked.id)
    g.db.commit()
    return notice("msg_mfa_enabled", "web.admin_dashboard")


@web.get("/<any(en,hi,te):lang>/admin")
@require_user(owner=True)
def admin_dashboard(lang):
    stats = {
        "users": g.db.scalar(select(func.count(User.id))),
        "open_cases": g.db.scalar(select(func.count(Complaint.id)).where(Complaint.status.not_in(("resolved", "closed")))),
        "total_cases": g.db.scalar(select(func.count(Complaint.id))),
        "pending_notifications": g.db.scalar(select(func.count(Notification.id)).where(Notification.status.in_(("pending", "sending", "dead")))),
    }
    recent = g.db.scalars(select(Complaint).order_by(Complaint.updated_at.desc()).limit(100)).all()
    logins = g.db.scalars(select(LoginEvent).order_by(LoginEvent.created_at.desc()).limit(100)).all()
    return page("portal/admin_dashboard.html", stats=stats, cases=recent, login_events=logins)


@web.get("/<any(en,hi,te):lang>/admin/users")
@require_user(owner=True)
def admin_users(lang):
    users, paging = pagination(select(User).order_by(User.created_at.desc()), User)
    return page("portal/admin_users.html", users=users, pagination=paging)


@web.post("/<any(en,hi,te):lang>/admin/users/<user_id>")
@require_user(owner=True)
def admin_user_update(lang, user_id):
    values = form("active", "version")
    if values["active"] not in ("yes", "no") or not re.fullmatch(r"[1-9][0-9]{0,8}", values["version"]):
        raise PortalError("msg_invalid_form", 422)
    user = g.db.scalar(select(User).where(User.id == user_id).with_for_update().execution_options(populate_existing=True))
    if not user:
        raise PortalError("msg_not_found", 404)
    if user.role == "owner" or user.id == g.current_user.id:
        raise PortalError("msg_forbidden", 403)
    if user.version != int(values["version"]):
        raise PortalError("msg_version_conflict", 409)
    user.active, user.version, user.updated_at = values["active"] == "yes", user.version + 1, int(time.time())
    if not user.active:
        revoke_sessions(user.id)
    audit("user.active", user.id, active=user.active, version=user.version)
    g.db.commit()
    return notice("msg_user_updated", "web.admin_users")


@web.post("/<any(en,hi,te):lang>/admin/cases/<case_id>")
@require_user(owner=True)
def admin_case_update(lang, case_id):
    values = form("status", "message", "version")
    if values["status"] not in STATUSES or not re.fullmatch(r"[1-9][0-9]{0,8}", values["version"]):
        raise PortalError("msg_invalid_form", 422)
    message = clean_text(values["message"], 3, 3000, "msg_details_invalid")
    row = case_record(case_id, lock=True)
    if row.version != int(values["version"]):
        raise PortalError("msg_version_conflict", 409)
    old = row.status
    if values["status"] != old and values["status"] not in TRANSITIONS[old]:
        raise PortalError("msg_invalid_transition", 422)
    row.status, row.version, row.updated_at = values["status"], row.version + 1, int(time.time())
    g.db.add(CaseEvent(complaint_id=row.id, actor_id=g.current_user.id, sequence=row.version, author_role="owner", author_name=g.current_user.name,
                       message=message, old_status=old, new_status=row.status))
    g.db.add(Notification(user_id=row.user_id, complaint_id=row.id, language=row.user.language, case_status=row.status, reference=row.reference))
    audit("case.updated", row.id, previous_status=old, status=row.status, version=row.version)
    g.db.commit()
    return notice("msg_case_updated", "web.case_detail", case_id=row.id)


def translated(value, maximum, *, empty=False):
    if not isinstance(value, dict) or set(value) != set(LANGUAGES):
        raise PortalError("msg_invalid_form", 422)
    return {language: clean_text(text, 0 if empty else 1, maximum) for language, text in value.items()}


def validate_content(section, value):
    if section.startswith("copy_") and section[5:] in LANGUAGES:
        known = canonical("ui_" + section[5:] + ".json")
        if not isinstance(value, dict) or set(value) - set(known) or len(value) > 1000:
            raise PortalError("msg_invalid_form", 422)
        return {key: clean_text(text, 1, 3000) for key, text in value.items()}
    if section == "advisory":
        if not isinstance(value, dict) or set(value) != {"active", "priority", "text"} or type(value["active"]) is not bool or value["priority"] not in ("normal", "high"):
            raise PortalError("msg_invalid_form", 422)
        return {**value, "text": translated(value["text"], 500, empty=not value["active"])}
    if section == "branding":
        if not isinstance(value, dict) or set(value) != {"title", "logo_url", "tagline"} or not valid_https_url(value["logo_url"], local_logo=True):
            raise PortalError("msg_invalid_form", 422)
        return {"title": clean_text(value["title"], 2, 100), "logo_url": value["logo_url"], "tagline": translated(value["tagline"], 150)}
    if section == "resources":
        if not isinstance(value, list) or len(value) > 100:
            raise PortalError("msg_invalid_form", 422)
        identifiers = set()
        for item in value:
            if not isinstance(item, dict) or set(item) != {"id", "acronym", "name", "region", "group", "url", "purpose", "reporting"}:
                raise PortalError("msg_invalid_form", 422)
            if not isinstance(item["id"], str) or not re.fullmatch(r"[a-z0-9-]{1,60}", item["id"]) or item["id"] in identifiers or item["group"] not in ("international", "india", "national") or not valid_https_url(item["url"]):
                raise PortalError("msg_invalid_form", 422)
            identifiers.add(item["id"])
            clean_text(item["acronym"], 1, 40)
            for field in ("name", "region", "purpose", "reporting"):
                translated(item[field], 2000)
        return value
    raise PortalError("msg_not_found", 404)


@web.get("/<any(en,hi,te):lang>/admin/content")
@require_user(owner=True)
def admin_content(lang):
    entries = g.db.scalars(select(SiteContent).order_by(SiteContent.section)).all()
    return page("portal/admin_content.html", entries=entries)


@web.post("/<any(en,hi,te):lang>/admin/content", defaults={"section": None})
@web.post("/<any(en,hi,te):lang>/admin/content/<section>")
@require_user(owner=True)
def admin_content_update(lang, section):
    values = form("section", "content", "version") if section is None else form("content", "version", optional=("section",))
    if section is None:
        section = values["section"]
    elif values.get("section") and values["section"] != section:
        raise PortalError("msg_invalid_form", 422)
    if not re.fullmatch(r"[1-9][0-9]{0,8}", values["version"]):
        raise PortalError("msg_invalid_form", 422)
    try:
        value = json.loads(values["content"], parse_constant=lambda value: (_ for _ in ()).throw(ValueError()))
    except (ValueError, TypeError, RecursionError):
        raise PortalError("msg_invalid_form", 422) from None
    value = validate_content(section, value)
    row = g.db.scalar(select(SiteContent).where(SiteContent.section == section).with_for_update().execution_options(populate_existing=True))
    if not row:
        raise PortalError("msg_not_found", 404)
    if row.version != int(values["version"]):
        raise PortalError("msg_version_conflict", 409)
    row.content, row.version, row.updated_at = value, row.version + 1, int(time.time())
    audit("content.updated", section, version=row.version)
    g.db.commit()
    return notice("msg_content_saved", "web.admin_content")


@web.get("/admin")
def admin_alias():
    return redirect(url_for("web.admin_login", lang="en"))


@web.get("/service")
def service_alias():
    return redirect(url_for("web.cases", lang="en"))


@web.get("/humans.txt")
def humans():
    return send_file(Path(current_app.config["DATA_DIR"]).parent / "humans.txt", mimetype="text/plain")


@web.get("/SECURITY.md")
def security_policy():
    return send_file(Path(current_app.config["DATA_DIR"]).parent / "SECURITY.md", mimetype="text/plain")
