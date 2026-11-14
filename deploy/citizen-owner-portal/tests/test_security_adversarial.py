"""Independent security regressions using real request/database boundaries.

Only the transport which delivers messages is replaced under TESTING. No
production token, password, owner session or external email service is used.
"""
from __future__ import annotations

import re
import time

import pyotp
import pytest
from flask import request
from sqlalchemy import select

from portal import create_app
from portal.models import BrowserSession, Challenge, User

ORIGIN = "https://security.example.test"
PASSWORD = "Independent portal test password 47!"
NEW_PASSWORD = "Replacement portal test password 83!"


@pytest.fixture
def security_app(tmp_path):
    mailbox = []
    app = create_app({
        "TESTING": True, "PRIVATE_MODE": False,
        "JSON_RESPONSES": True,
        "DATABASE_URL": "sqlite:///" + str(tmp_path / "security.sqlite3"),
        "SECRET_KEY": "session-separation-key-" + "s" * 40,
        "OTP_HMAC_KEY": "challenge-separation-key-" + "o" * 40,
        "TOTP_ENCRYPTION_KEY": "totp-separation-key-" + "t" * 40,
        "ADMIN_EMAIL": "owner@example.test",
        "PUBLIC_BASE_URL": ORIGIN,
        "TRUSTED_HOSTS": ["security.example.test"],
        "PUBLIC_REGISTRATION": True,
        "FORCE_HTTPS": True,
        "MAIL_PROVIDER": "resend",
        "MAIL_TRANSPORT": lambda recipient, subject, body, identity: mailbox.append(
            {"recipient": recipient, "subject": subject, "body": body}
        ),
    })
    app.extensions["security_mailbox"] = mailbox
    hook = {"callback": None}
    app.extensions["security_test_hook"] = hook

    # Register before the first request; individual tests use this to model a
    # committed competing transaction after authentication state was loaded.
    @app.before_request
    def competing_transaction():
        callback = hook["callback"]
        if callback is not None:
            callback()

    result = app.test_cli_runner().invoke(args=["init-db"])
    assert result.exit_code == 0
    return app


def get(client, path):
    return client.get(path, base_url=ORIGIN)


def token(client):
    response = get(client, "/en/")
    assert response.status_code == 200
    return response.json["csrf_token"]


def post(client, path, fields, *, csrf=None):
    return client.post(path, base_url=ORIGIN, headers={"Origin": ORIGIN},
                       data={**fields, "csrf_token": csrf or token(client)})


def latest_code(app, email):
    messages = [m for m in app.extensions["security_mailbox"] if m["recipient"] == email]
    assert messages
    codes = re.findall(r"\b[0-9]{6}\b", messages[-1]["body"])
    assert len(codes) == 1
    return codes[0]


def pending(client):
    response = get(client, "/en/verify")
    assert response.status_code == 200
    return response.json["challenge_id"]


def register(app, client, email, name="Security test citizen"):
    response = post(client, "/en/register", {
        "name": name, "email": email, "password": PASSWORD,
        "confirm_password": PASSWORD, "consent": "yes",
    })
    assert response.status_code == 302
    challenge = pending(client)
    response = post(client, "/en/verify", {
        "challenge_id": challenge, "otp": latest_code(app, email),
    })
    assert response.status_code == 302
    return response


def enroll_owner(app, client):
    register(app, client, "owner@example.test", "Independent owner")
    response = post(client, "/en/admin/mfa/setup", {"intent": "start"})
    assert response.status_code == 302
    secret = get(client, "/en/admin/mfa").json["setup_secret"]
    assert secret
    response = post(client, "/en/admin/mfa/setup", {
        "intent": "confirm", "code": pyotp.TOTP(secret).now(),
    })
    assert response.status_code == 302
    return secret


def test_reset_invalidates_pre_reset_password_and_email_challenge(security_app):
    """Old-password login cannot complete after another browser resets it."""
    owner = security_app.test_client()
    email = "reset-target@example.test"
    register(security_app, owner, email)
    old_login = security_app.test_client()
    response = post(old_login, "/en/login", {"email": email, "password": PASSWORD})
    assert response.status_code == 302
    old_challenge = pending(old_login)
    old_code = latest_code(security_app, email)

    recovery = security_app.test_client()
    response = post(recovery, "/en/forgot", {"email": email})
    assert response.status_code == 302
    reset_page = get(recovery, "/en/reset")
    reset_challenge = reset_page.json["challenge_id"]
    response = post(recovery, "/en/reset", {
        "challenge_id": reset_challenge, "otp": latest_code(security_app, email),
        "password": NEW_PASSWORD, "confirm_password": NEW_PASSWORD,
    })
    assert response.status_code == 302

    response = post(old_login, "/en/verify", {
        "challenge_id": old_challenge, "otp": old_code,
    })
    assert response.status_code >= 400
    assert get(old_login, "/en/cases").status_code == 302
    assert get(owner, "/en/cases").status_code == 302


def test_totp_replay_rejects_competing_committed_step(security_app, monkeypatch):
    """A row lock must refresh a User cached earlier in this same request."""
    owner = security_app.test_client()
    secret = enroll_owner(security_app, owner)
    fixed = int(time.time()) + 60
    monkeypatch.setattr("portal.routes.time.time", lambda: fixed)
    step = fixed // 30
    hook = security_app.extensions["security_test_hook"]
    factory = security_app.extensions["portal_sessionmaker"]

    def accepted_elsewhere():
        if request.method != "POST" or request.endpoint != "web.admin_mfa":
            return
        hook["callback"] = None
        with factory() as db:
            user = db.scalar(select(User).where(User.email == "owner@example.test"))
            user.totp_last_step = step
            db.commit()

    hook["callback"] = accepted_elsewhere
    response = post(owner, "/en/admin/mfa", {"code": pyotp.TOTP(secret).at(fixed)})
    assert response.status_code == 422
    with factory() as db:
        user = db.scalar(select(User).where(User.email == "owner@example.test"))
        assert user.totp_last_step == step


def test_concurrent_enrollment_cannot_replace_newly_enabled_secret(security_app):
    owner = security_app.test_client()
    register(security_app, owner, "owner@example.test", "Independent owner")
    assert post(owner, "/en/admin/mfa/setup", {"intent": "start"}).status_code == 302
    chosen = get(owner, "/en/admin/mfa").json["setup_secret"]
    competing = pyotp.random_base32()
    cipher = security_app.extensions["portal_cipher"]
    encrypted_competing = cipher.encrypt(competing.encode()).decode()
    hook = security_app.extensions["security_test_hook"]
    factory = security_app.extensions["portal_sessionmaker"]

    def enabled_elsewhere():
        if request.method != "POST" or request.endpoint != "web.admin_mfa_setup":
            return
        hook["callback"] = None
        with factory() as db:
            user = db.scalar(select(User).where(User.email == "owner@example.test"))
            user.totp_secret = encrypted_competing
            db.commit()

    hook["callback"] = enabled_elsewhere
    response = post(owner, "/en/admin/mfa/setup", {
        "intent": "confirm", "code": pyotp.TOTP(chosen).now(),
    })
    assert response.status_code == 403
    with factory() as db:
        user = db.scalar(select(User).where(User.email == "owner@example.test"))
        assert cipher.decrypt(user.totp_secret.encode()).decode() == competing


def test_completed_authentication_rotates_cookie_and_invalidates_old_csrf(security_app):
    client = security_app.test_client()
    stale_csrf = token(client)
    cookie_name = security_app.config["SESSION_COOKIE_NAME"]
    old_cookie = client.get_cookie(cookie_name, domain="security.example.test").value
    register(security_app, client, "rotation@example.test")
    new_cookie = client.get_cookie(cookie_name, domain="security.example.test").value
    assert new_cookie != old_cookie
    assert token(client) != stale_csrf
    response = post(client, "/en/cases/new", {
        "subject": "Session rotation check", "category": "other",
        "details": "This case should never be created with an old CSRF token.", "consent": "yes",
    }, csrf=stale_csrf)
    assert response.status_code == 403

    replay = security_app.test_client()
    replay.set_cookie(cookie_name, old_cookie, domain="security.example.test", secure=True)
    assert get(replay, "/en/cases").status_code == 302


def test_other_citizen_cannot_read_or_reply_to_private_case(security_app):
    alice, bob = security_app.test_client(), security_app.test_client()
    register(security_app, alice, "alice@example.test", "Alice")
    register(security_app, bob, "bob@example.test", "Bob")
    private_text = "CONFIDENTIAL-CASE-SENTINEL reported privately by the case owner."
    response = post(alice, "/en/cases/new", {
        "subject": "Private account support", "category": "account",
        "details": private_text, "consent": "yes",
    })
    assert response.status_code == 302
    case_url = response.headers["Location"]
    assert get(alice, case_url).json["case"]["details"] == private_text
    response = get(bob, case_url)
    assert response.status_code == 404
    assert private_text.encode() not in response.data
    response = post(bob, case_url + "/reply", {"message": "Unrelated user must not write."})
    assert response.status_code == 404
    assert get(bob, "/en/admin").status_code == 403


def test_registration_rejects_role_mass_assignment(security_app):
    client = security_app.test_client()
    response = post(client, "/en/register", {
        "name": "Untrusted role request", "email": "role-target@example.test",
        "password": PASSWORD, "confirm_password": PASSWORD, "consent": "yes", "role": "owner",
    })
    assert response.status_code == 422
    with security_app.extensions["portal_sessionmaker"]() as db:
        assert db.scalar(select(User).where(User.email == "role-target@example.test")) is None
    assert not security_app.extensions["security_mailbox"]
