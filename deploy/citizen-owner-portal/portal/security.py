"""Opaque sessions, per-purpose cryptography, CSRF and bounded database rate limits."""
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import re
import secrets
import time
from functools import wraps
from urllib.parse import urlsplit

from flask import current_app, g, request, redirect, url_for
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from .models import BrowserSession, LoginEvent, RateBucket


class PortalError(Exception):
    def __init__(self, code="msg_invalid_form", status=400):
        self.code, self.status = code, status


def digest(value, *, purpose="session"):
    key = current_app.config["OTP_HMAC_KEY"] if purpose == "otp" else current_app.config["SECRET_KEY"]
    return hmac.new(key.encode(), (purpose + "\0" + value).encode(), hashlib.sha256).hexdigest()


def csrf_token():
    return digest(g.raw_session, purpose="csrf")


def csrf_check():
    """Reject unsafe requests, logging only non-sensitive failure categories.

    Never log session cookies, form tokens, user-identifying inputs or secrets.
    """
    token = request.headers.get("X-CSRF-Token") if request.is_json else request.form.get("csrf_token", "")
    has_cookie = bool(request.cookies.get(current_app.config["SESSION_COOKIE_NAME"], ""))
    has_session = bool(getattr(g, "browser", None))
    if not isinstance(token, str) or len(token) != 64:
        current_app.logger.warning(
            "csrf_rejected reason=form_token_missing_or_wrong_length cookie_present=%s session_loaded=%s",
            has_cookie, has_session,
        )
        raise PortalError("msg_csrf_invalid", 403)
    if not hmac.compare_digest(token, csrf_token()):
        current_app.logger.warning(
            "csrf_rejected reason=token_mismatch cookie_present=%s session_loaded=%s",
            has_cookie, has_session,
        )
        raise PortalError("msg_csrf_invalid", 403)
    origin = request.headers.get("Origin")
    if origin and origin.rstrip("/") not in current_app.config["ALLOWED_ORIGINS"]:
        current_app.logger.warning(
            "csrf_rejected reason=origin_mismatch cookie_present=%s session_loaded=%s",
            has_cookie, has_session,
        )
        raise PortalError("msg_csrf_invalid", 403)
    if request.headers.get("Sec-Fetch-Site") == "cross-site":
        current_app.logger.warning(
            "csrf_rejected reason=cross_site_fetch cookie_present=%s session_loaded=%s",
            has_cookie, has_session,
        )
        raise PortalError("msg_csrf_invalid", 403)


def rate_limit(scope, limit=10, period=60, *, identity=None):
    raw = identity or (request.remote_addr or "unknown")
    key = digest(scope + "\0" + raw, purpose="rate")
    window = int(time.time()) // period * period
    insert = pg_insert if g.db.bind.dialect.name == "postgresql" else sqlite_insert
    statement = insert(RateBucket).values(key=key, window=window, count=1)
    statement = statement.on_conflict_do_update(index_elements=[RateBucket.key, RateBucket.window], set_={"count": RateBucket.count + 1}).returning(RateBucket.count)
    count = g.db.execute(statement).scalar_one()
    g.db.commit()
    if count > limit:
        raise PortalError("msg_rate_limited", 429)


def begin_session(db, user=None, *, notice=None):
    token = secrets.token_urlsafe(32)
    row = BrowserSession(token_hash=digest(token), user_id=user.id if user else None,
                         expires_at=int(time.time()) + (28_800 if user else 3600),
                         authenticated_at=int(time.time()) if user else None, notice=notice)
    db.add(row)
    db.flush()
    g.raw_session, g.browser, g.current_user = token, row, user
    g.set_session_cookie = True
    return row


def rotate_session(user=None, *, notice=None):
    previous = g.browser
    begin_session(g.db, user, notice=notice)
    # Delete challenges before their owning anonymous/authenticated browser session.
    from .models import Challenge
    for challenge in g.db.scalars(select(Challenge).where(Challenge.browser_id == previous.id)).all():
        g.db.delete(challenge)
    g.db.delete(previous)
    g.db.commit()


def load_session(*, create=True):
    token = request.cookies.get(current_app.config["SESSION_COOKIE_NAME"], "")
    row = None
    if re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
        row = g.db.scalar(select(BrowserSession).where(BrowserSession.token_hash == digest(token)))
    current = int(time.time())
    if row and row.expires_at > current and (not row.user_id or row.user and row.user.active):
        g.raw_session, g.browser, g.current_user = token, row, row.user
        g.set_session_cookie = False
    elif create:
        rate_limit("new-browser:ip", limit=300, period=3600)
        begin_session(g.db)
    else:
        # Error recovery must not send an anonymous cookie over a concurrent
        # successful login's newer authenticated cookie.
        g.raw_session, g.browser, g.current_user = token, None, None
        g.set_session_cookie = False
    g.db.commit()


def login_event(email, success, reason, user=None):
    try:
        address = ipaddress.ip_address(request.remote_addr or "")
        prefix = 24 if address.version == 4 else 48
        ip_label = str(ipaddress.ip_network(str(address) + "/" + str(prefix), strict=False))
    except ValueError:
        ip_label = "unavailable"
    g.db.add(LoginEvent(email=email[:254], name=user.name if user else "", user_id=user.id if user else None,
                        success=success, reason=reason, ip_label=ip_label,
                        user_agent=request.headers.get("User-Agent", "")[:200]))


def require_user(owner=False, *, mfa=True):
    def decorator(function):
        @wraps(function)
        def wrapped(*args, **kwargs):
            user = g.current_user
            if not user:
                return redirect(url_for("web.admin_login" if owner else "web.login", lang=g.lang))
            if owner and user.role != "owner":
                raise PortalError("msg_forbidden", 403)
            if owner and mfa and (not user.totp_enabled or not g.browser.mfa_at or g.browser.mfa_at < int(time.time()) - 600):
                g.browser.notice = "msg_mfa_required"
                g.db.commit()
                return redirect(url_for("web.admin_mfa", lang=g.lang))
            return function(*args, **kwargs)
        return wrapped
    return decorator


def valid_https_url(value, *, local_logo=False):
    if not isinstance(value, str) or len(value) > 2048 or any(ord(char) < 32 for char in value):
        return False
    if local_logo:
        return bool(re.fullmatch(r"/static/img/[A-Za-z0-9_-]+\.(?:svg|png|webp)", value))
    try:
        url = urlsplit(value)
        return url.scheme == "https" and bool(url.hostname) and not url.username and not url.password
    except ValueError:
        return False
