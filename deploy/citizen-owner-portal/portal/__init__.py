"""CYBER SURAKSHA 2.0 authenticated citizen and owner portal.

Independently directed and owned by Jatoth Ramakrishna. Production account
features require real mail delivery and a persistent PostgreSQL database.
"""
from __future__ import annotations

import base64
import hashlib
import ipaddress
import json
import logging
import os
import secrets
import signal
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

import click
from cryptography.fernet import Fernet
from flask import Flask, g, jsonify, request
from sqlalchemy import create_engine, select, delete, text
from sqlalchemy.orm import sessionmaker
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import generate_password_hash

from .mail import Mailer, dispatch_due
from .models import Base, BrowserSession, Challenge, LoginEvent, RateBucket, SiteContent
from .security import PortalError, csrf_check, load_session, rate_limit

ROOT = Path(__file__).resolve().parents[1]
LANGUAGES = ("en", "hi", "te")


def create_app(config=None):
    app = Flask(__name__, template_folder=str(ROOT / "templates"), static_folder=str(ROOT / "static"))
    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY", ""),
        OTP_HMAC_KEY=os.environ.get("OTP_HMAC_KEY", ""),
        TOTP_ENCRYPTION_KEY=os.environ.get("TOTP_ENCRYPTION_KEY", ""),
        DATABASE_URL=os.environ.get("DATABASE_URL", ""),
        ADMIN_EMAIL=os.environ.get("ADMIN_EMAIL", ""),
        PUBLIC_BASE_URL=(os.environ.get("PUBLIC_BASE_URL") or os.environ.get("RENDER_EXTERNAL_URL") or "https://localhost").rstrip("/"),
        FORCE_HTTPS=os.environ.get("FORCE_HTTPS", "1") == "1",
        ALLOW_SQLITE=os.environ.get("ALLOW_SQLITE", "0") == "1",
        MAIL_PROVIDER=os.environ.get("MAIL_PROVIDER", ""),
        MAIL_FROM=os.environ.get("MAIL_FROM", ""),
        RESEND_API_KEY=os.environ.get("RESEND_API_KEY", ""),
        SMTP_HOST=os.environ.get("SMTP_HOST", ""),
        SMTP_PORT=int(os.environ.get("SMTP_PORT", "587")),
        SMTP_USERNAME=os.environ.get("SMTP_USERNAME", ""),
        SMTP_PASSWORD=os.environ.get("SMTP_PASSWORD", ""),
        SMTP_SECURITY=os.environ.get("SMTP_SECURITY", "starttls"),
        TRUSTED_PROXY_HOPS=int(os.environ.get("TRUSTED_PROXY_HOPS", "0")),
        LOGIN_RETENTION_DAYS=int(os.environ.get("LOGIN_RETENTION_DAYS", "30")),
        MAX_CONTENT_LENGTH=262_144,
        SESSION_COOKIE_NAME="__Host-cs_session",
        SESSION_COOKIE_SECURE=True,
        DATA_DIR=str(ROOT / "data"),
        PUBLIC_REGISTRATION=os.environ.get("PUBLIC_REGISTRATION", "0") == "1",
        PRIVATE_MODE=os.environ.get("PRIVATE_MODE", "1") == "1",
    )
    if config:
        app.config.update(config)
    for key in ("SECRET_KEY", "OTP_HMAC_KEY", "TOTP_ENCRYPTION_KEY"):
        if not isinstance(app.config[key], str) or len(app.config[key]) < 32:
            raise ValueError(key + " must be supplied securely with at least 32 characters.")
    if len({app.config[key] for key in ("SECRET_KEY", "OTP_HMAC_KEY", "TOTP_ENCRYPTION_KEY")}) != 3:
        raise ValueError("Session, OTP and TOTP encryption keys must be distinct.")
    from .routes import normalize_email
    app.config["ADMIN_EMAIL"] = normalize_email(app.config["ADMIN_EMAIL"])
    base = urlsplit(app.config["PUBLIC_BASE_URL"])
    if not base.hostname or base.username or base.password or base.query or base.fragment or base.path:
        raise ValueError("PUBLIC_BASE_URL must be an origin.")
    if base.scheme != "https" and not app.config.get("TESTING") and app.config["FORCE_HTTPS"]:
        raise ValueError("PUBLIC_BASE_URL must use HTTPS.")
    configured_hosts = os.environ.get("PUBLIC_HOSTS", base.hostname)
    if not app.config.get("TRUSTED_HOSTS"):
        app.config["TRUSTED_HOSTS"] = [host.strip() for host in configured_hosts.split(",") if host.strip()]
    app.config["ALLOWED_ORIGINS"] = set(app.config.get("ALLOWED_ORIGINS", [app.config["PUBLIC_BASE_URL"]]))
    url = app.config["DATABASE_URL"]
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    elif url.startswith("sqlite:"):
        if not app.config.get("TESTING") and (not app.config["ALLOW_SQLITE"] or app.config["FORCE_HTTPS"]):
            raise ValueError("SQLite is limited to explicitly enabled local development/tests.")
    else:
        raise ValueError("Configure persistent PostgreSQL DATABASE_URL.")
    options = {"pool_pre_ping": True}
    if url.startswith("sqlite:"):
        options["connect_args"] = {"check_same_thread": False, "timeout": 10}
    if url.startswith("sqlite:") and (app.config.get("TESTING") or app.config["ALLOW_SQLITE"] and not app.config["FORCE_HTTPS"]):
        app.config["SESSION_COOKIE_NAME"] = "cs_session_dev"
        app.config["SESSION_COOKIE_SECURE"] = False
    elif not app.config.get("TESTING"):
        app.config["SESSION_COOKIE_NAME"] = "__Host-cs_session"
        app.config["SESSION_COOKIE_SECURE"] = True
    if not 1 <= app.config["LOGIN_RETENTION_DAYS"] <= 365:
        raise ValueError("LOGIN_RETENTION_DAYS must be between one and 365.")
    engine = create_engine(url, **options)
    app.extensions["portal_engine"] = engine
    app.extensions["portal_sessionmaker"] = sessionmaker(engine, expire_on_commit=False)
    app.extensions["portal_mailer"] = Mailer(app.config)
    encryption_key = hashlib.sha256(b"cybersuraksha-totp-encryption-v1\0" + app.config["TOTP_ENCRYPTION_KEY"].encode()).digest()
    app.extensions["portal_cipher"] = Fernet(base64.urlsafe_b64encode(encryption_key))
    app.extensions["portal_dummy_password"] = generate_password_hash(secrets.token_urlsafe(24), method="scrypt")
    if app.config["TRUSTED_PROXY_HOPS"]:
        if app.config["TRUSTED_PROXY_HOPS"] not in (1, 2):
            raise ValueError("Configure the exact known proxy hop count, limited to one or two.")
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=app.config["TRUSTED_PROXY_HOPS"], x_proto=app.config["TRUSTED_PROXY_HOPS"])
    if app.config.get("TESTING"):
        Base.metadata.create_all(engine)

    @app.before_request
    def request_context():
        g.request_id = secrets.token_hex(12)
        g.nonce = secrets.token_urlsafe(24)
        g.lang = request.view_args.get("lang", "en") if request.view_args else "en"
        if g.lang not in LANGUAGES:
            g.lang = "en"
        if request.endpoint == "health":
            return
        if request.content_encoding or request.headers.get("Transfer-Encoding"):
            raise PortalError("msg_invalid_form", 400)
        if app.config["FORCE_HTTPS"] and not request.is_secure:
            raise PortalError("msg_invalid_form", 400)
        if request.endpoint is None or request.endpoint in ("static", "web.humans", "web.security_policy"):
            return
        g.db = app.extensions["portal_sessionmaker"]()
        load_session()
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            csrf_check()
        if app.config["PRIVATE_MODE"]:
            public_auth = {"web.login", "web.admin_login", "web.register", "web.verify", "web.logout", "web.forgot", "web.reset", "web.admin_alias"}
            user = g.current_user
            approved = bool(user and user.active and user.role == "owner" and user.email == app.config["ADMIN_EMAIL"])
            if not approved and request.endpoint not in public_auth:
                if request.path.startswith("/api/"):
                    return jsonify(error="authentication_required"), 401
                from flask import redirect, url_for
                return redirect(url_for("web.login", lang=g.lang))

    @app.teardown_request
    def close_database(error):
        if db := getattr(g, "db", None):
            db.rollback()
            db.close()

    @app.after_request
    def headers(response):
        response.headers.update({
            "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
            "Strict-Transport-Security": "max-age=31536000",
            "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
            "Referrer-Policy": "no-referrer", "Cache-Control": "no-store",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
            "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Resource-Policy": "same-origin",
            "X-Request-ID": getattr(g, "request_id", ""),
        })
        if getattr(g, "set_session_cookie", False):
            response.set_cookie(app.config["SESSION_COOKIE_NAME"], g.raw_session,
                                max_age=max(0, g.browser.expires_at - int(time.time())),
                                secure=app.config["SESSION_COOKIE_SECURE"], httponly=True, samesite="Lax", path="/")
        return response

    def recover_error_session():
        if not hasattr(g, "db"):
            return
        g.db.rollback()
        # Rollback expires ORM objects even with expire_on_commit=False. A
        # concurrent login/logout can have removed this browser's old row.
        # Re-resolve the cookie instead of rendering expired authentication
        # objects, and never retain stale privileges if recovery fails.
        g.current_user, g.browser, g.set_session_cookie = None, None, False
        try:
            load_session(create=False)
        except Exception:
            g.db.rollback()
            g.current_user, g.browser, g.set_session_cookie = None, None, False

    def plain_error(status):
        messages = {
            "en": "The request could not be completed. Please try again.",
            "hi": "अनुरोध पूरा नहीं हो सका। कृपया फिर कोशिश करें।",
            "te": "అభ్యర్థనను పూర్తి చేయలేకపోయాము. దయచేసి మళ్లీ ప్రయత్నించండి.",
        }
        return app.response_class(messages.get(getattr(g, "lang", "en"), messages["en"]),
                                  status=status, mimetype="text/plain")

    @app.errorhandler(PortalError)
    def expected_error(error):
        recover_error_session()
        if request.path.startswith("/api/"):
            return jsonify(error=error.code, request_id=getattr(g, "request_id", "")), error.status
        from .routes import page
        try:
            return page("portal/error.html", error_code=error.code, status=error.status)
        except Exception:
            return plain_error(error.status)

    @app.errorhandler(Exception)
    def unexpected_error(error):
        status = error.code if isinstance(error, HTTPException) else 500
        recover_error_session()
        if status >= 500:
            app.logger.error("request_failed id=%s class=%s", getattr(g, "request_id", ""), type(error).__name__)
        code = "msg_not_found" if status == 404 else "msg_forbidden" if status == 403 else "msg_request_failed"
        if request.path.startswith("/api/"):
            return jsonify(error=code, request_id=getattr(g, "request_id", "")), status
        from .routes import page
        try:
            return page("portal/error.html", error_code=code, status=status)
        except Exception:
            return plain_error(status)

    @app.get("/healthz")
    def health():
        with engine.connect() as connection:
            from .models import User
            connection.execute(select(User.id).limit(1))
        return jsonify(status="ok")

    from .routes import web, initialize_content
    app.register_blueprint(web)
    from addons.reputation import register_reputation
    register_reputation(app, csrf_check, rate_limit)

    @app.cli.command("init-db")
    def init_db():
        """Create schema and seed editable public content; does not create an owner password."""
        Base.metadata.create_all(engine)
        with app.extensions["portal_sessionmaker"]() as db:
            initialize_content(db)
            db.commit()
        click.echo("Account and case schema initialized; no default password was created.")

    @app.cli.command("dispatch-notifications")
    @click.option("--watch", is_flag=True)
    @click.option("--interval", default=10, type=click.IntRange(5, 300))
    def notifications(watch, interval):
        """Deliver committed case-update emails; run as a supervised background worker."""
        stop = False
        def stopped(signum, frame):
            nonlocal stop
            stop = True
        if watch:
            signal.signal(signal.SIGTERM, stopped)
            signal.signal(signal.SIGINT, stopped)
        next_prune = 0
        while True:
            # One leased message bounds shutdown latency to the current delivery.
            delivered = dispatch_due(app, maximum=1 if watch else 25)
            click.echo("Notifications delivered: " + str(delivered))
            if not watch or stop:
                break
            if time.monotonic() >= next_prune:
                from .maintenance import prune_security_state
                prune_security_state(app)
                next_prune = time.monotonic() + 3600
            for _ in range(interval):
                if stop:
                    break
                time.sleep(1)
            if stop:
                break

    @app.cli.command("prune-security-state")
    def prune():
        """Remove expired authentication state and login metadata past retention."""
        from .maintenance import prune_security_state
        prune_security_state(app)
        click.echo("Expired authentication state and retained login history pruned.")

    return app
