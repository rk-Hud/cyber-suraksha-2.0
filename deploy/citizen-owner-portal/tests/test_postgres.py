"""True PostgreSQL concurrency checks for authentication and the email outbox.

Set PORTAL_PG_TEST_URL privately to a loopback-only PostgreSQL database named
csportal_test. Every test owns a randomly named schema; no database is dropped.
No live SMTP/Resend request is made and no credentials are written to source.
"""
from __future__ import annotations

import os
import re
import secrets
import threading
import time
import uuid
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait

import pyotp
import pytest
from flask import request
from sqlalchemy import create_engine, delete, func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.schema import CreateSchema, DropSchema

from portal import create_app
from portal.mail import dispatch_due
from portal.models import AuditEvent, BrowserSession, Challenge, Complaint, Notification, User
from portal.security import digest

ORIGIN = "https://postgres.example.test"
PASSWORD = "Isolated postgres test password 2026!"


class CapturedMail:
    def __init__(self):
        self.messages = []
        self.lock = threading.Lock()
        self.hold_notifications = False
        self.notification_started = threading.Event()
        self.release_notification = threading.Event()

    def __call__(self, recipient, subject, body, identity):
        with self.lock:
            self.messages.append({"to": recipient, "subject": subject, "body": body, "identity": identity})
        if identity and self.hold_notifications:
            self.notification_started.set()
            if not self.release_notification.wait(timeout=10):
                raise AssertionError("The notification concurrency test did not release its transport.")

    def code(self, email):
        with self.lock:
            message = next(m for m in reversed(self.messages) if m["to"] == email and m["identity"] is None)
        match = re.search(r"(?<!\d)\d{6}(?!\d)", message["body"])
        assert match
        return match.group()


@pytest.fixture
def pg_application():
    raw = os.environ.get("PORTAL_PG_TEST_URL")
    if not raw:
        pytest.skip("Set PORTAL_PG_TEST_URL privately to run PostgreSQL concurrency checks.")
    try:
        target = make_url(raw)
        safe = (target.drivername in {"postgres", "postgresql", "postgresql+psycopg"}
                and target.host in {"127.0.0.1", "localhost", "::1"}
                and target.database == "csportal_test"
                and set(target.query) <= {"sslmode"}
                and target.port is not None and 1 <= target.port <= 65535)
    except Exception:
        safe = False
    if not safe:
        pytest.fail("PostgreSQL tests refuse any non-loopback or non-csportal_test target.", pytrace=False)

    control = create_engine(target.set(drivername="postgresql+psycopg"), pool_pre_ping=True)
    schema = "csportal_concurrency_" + uuid.uuid4().hex
    created = False
    app = None
    try:
        try:
            with control.begin() as connection:
                assert connection.scalar(text("SELECT current_database()")) == "csportal_test"
                assert int(connection.scalar(text("SHOW server_version_num"))) >= 180000
                connection.execute(CreateSchema(schema))
                created = True
        except Exception as error:
            pytest.fail("The isolated PostgreSQL test setup failed (" + type(error).__name__ + ").", pytrace=False)

        mail = CapturedMail()
        # The application converts postgresql:// to its supported psycopg driver.
        scoped = target.set(drivername="postgresql").update_query_dict({"options": "-csearch_path=" + schema})
        app = create_app({
            "TESTING": True, "JSON_RESPONSES": True, "PRIVATE_MODE": False,
            "PUBLIC_REGISTRATION": True, "FORCE_HTTPS": True,
            "DATABASE_URL": scoped.render_as_string(hide_password=False),
            "SECRET_KEY": secrets.token_urlsafe(48),
            "OTP_HMAC_KEY": secrets.token_urlsafe(48),
            "TOTP_ENCRYPTION_KEY": secrets.token_urlsafe(48),
            "ADMIN_EMAIL": "owner@example.test", "PUBLIC_BASE_URL": ORIGIN,
            "TRUSTED_HOSTS": ["postgres.example.test"], "MAIL_TRANSPORT": mail,
        })
        app.extensions["pg_mail"] = mail
        synchronization = {"endpoint": None, "barrier": None, "after_load": None}
        app.extensions["pg_synchronization"] = synchronization

        @app.before_request
        def overlap_after_session_load():
            if request.method == "POST" and request.endpoint == synchronization["endpoint"]:
                if synchronization["after_load"]:
                    synchronization["after_load"]()
                if synchronization["barrier"]:
                    synchronization["barrier"].wait(timeout=8)

        result = app.test_cli_runner().invoke(args=["init-db"])
        assert result.exit_code == 0
        yield app
    finally:
        if app is not None:
            app.extensions["pg_mail"].release_notification.set()
            app.extensions["portal_engine"].dispose()
        if created:
            # schema was generated above and only this fixture may clean it up.
            assert re.fullmatch(r"csportal_concurrency_[0-9a-f]{32}", schema)
            with control.begin() as connection:
                connection.execute(text("SET LOCAL lock_timeout = '5s'"))
                connection.execute(DropSchema(schema, cascade=True))
        control.dispose()


def get(client, path):
    return client.get(path, base_url=ORIGIN)


def csrf(client, path="/en/"):
    response = get(client, path)
    assert response.status_code == 200
    return response.json["csrf_token"]


def post(client, path, values, token=None):
    return client.post(path, data={**values, "csrf_token": token or csrf(client)},
                       base_url=ORIGIN, headers={"Origin": ORIGIN})


def signup(app, client, email, name="PostgreSQL test citizen"):
    assert post(client, "/en/register", {
        "name": name, "email": email, "password": PASSWORD,
        "confirm_password": PASSWORD, "consent": "yes",
    }).status_code == 302
    challenge = get(client, "/en/verify").json
    assert post(client, "/en/verify", {
        "challenge_id": challenge["challenge_id"], "otp": app.extensions["pg_mail"].code(email),
    }, challenge["csrf_token"]).status_code == 302


def login(app, client, email):
    assert post(client, "/en/login", {"email": email, "password": PASSWORD}).status_code == 302
    challenge = get(client, "/en/verify").json
    assert post(client, "/en/verify", {
        "challenge_id": challenge["challenge_id"], "otp": app.extensions["pg_mail"].code(email),
    }, challenge["csrf_token"]).status_code == 302


def owner_secret(app, client):
    assert post(client, "/en/admin/mfa/setup", {"intent": "start"}).status_code == 302
    page = get(client, "/en/admin/mfa").json
    assert page["setup_secret"]
    return page["setup_secret"], page["csrf_token"]


def synchronize(app, endpoint):
    app.extensions["pg_synchronization"].update(endpoint=endpoint, barrier=threading.Barrier(2))


def run_pair(first, second):
    with ThreadPoolExecutor(max_workers=2) as pool:
        a, b = pool.submit(first), pool.submit(second)
        return a.result(timeout=15), b.result(timeout=15)


def test_same_email_otp_is_consumed_once_under_concurrent_requests(pg_application):
    app = pg_application
    first = app.test_client()
    email = "otp-race@example.test"
    assert post(first, "/en/register", {
        "name": "OTP race citizen", "email": email, "password": PASSWORD,
        "confirm_password": PASSWORD, "consent": "yes",
    }).status_code == 302
    page = get(first, "/en/verify").json
    cookie_name = app.config["SESSION_COOKIE_NAME"]
    cookie = first.get_cookie(cookie_name, domain="postgres.example.test")
    assert cookie
    second = app.test_client()
    second.set_cookie(cookie_name, cookie.value, domain="postgres.example.test", secure=True)
    values = {"challenge_id": page["challenge_id"], "otp": app.extensions["pg_mail"].code(email)}
    synchronize(app, "web.verify")
    results = run_pair(lambda: post(first, "/en/verify", values, page["csrf_token"]),
                       lambda: post(second, "/en/verify", values, page["csrf_token"]))
    assert sorted(response.status_code for response in results) == [302, 422]
    losing_response = next(response for response in results if response.status_code == 422)
    assert "Set-Cookie" not in losing_response.headers
    with app.extensions["portal_sessionmaker"]() as db:
        assert db.scalar(select(func.count(User.id)).where(User.email == email)) == 1


def test_revoked_browser_during_verification_returns_controlled_error(pg_application):
    """A losing request must not render an ORM session deleted by its winner."""
    app = pg_application
    client = app.test_client()
    email = "revoked-browser@example.test"
    assert post(client, "/en/register", {
        "name": "Concurrent browser rotation", "email": email, "password": PASSWORD,
        "confirm_password": PASSWORD, "consent": "yes",
    }).status_code == 302
    page = get(client, "/en/verify").json
    cookie = client.get_cookie(app.config["SESSION_COOKIE_NAME"], domain="postgres.example.test")
    assert cookie
    with app.app_context():
        hashed = digest(cookie.value)
    factory = app.extensions["portal_sessionmaker"]
    with factory() as db:
        browser_id = db.scalar(select(BrowserSession.id).where(BrowserSession.token_hash == hashed))
    assert browser_id

    def rotate_elsewhere():
        app.extensions["pg_synchronization"]["after_load"] = None
        with factory() as db:
            db.execute(delete(Challenge).where(Challenge.browser_id == browser_id))
            db.execute(delete(BrowserSession).where(BrowserSession.id == browser_id))
            db.commit()

    app.extensions["pg_synchronization"].update(endpoint="web.verify", after_load=rotate_elsewhere)
    response = post(client, "/en/verify", {
        "challenge_id": page["challenge_id"], "otp": app.extensions["pg_mail"].code(email),
    }, page["csrf_token"])
    assert response.status_code == 422
    assert "Set-Cookie" not in response.headers
    assert response.json["current_user"] is None
    assert get(client, "/en/cases").status_code == 302


def test_same_fresh_totp_is_accepted_by_only_one_owner_session(pg_application, monkeypatch):
    app = pg_application
    first, second = app.test_client(), app.test_client()
    signup(app, first, "owner@example.test", "Test owner")
    secret, token = owner_secret(app, first)
    assert post(first, "/en/admin/mfa/setup", {
        "intent": "confirm", "code": pyotp.TOTP(secret).now(),
    }, token).status_code == 302
    login(app, second, "owner@example.test")
    first_token, second_token = csrf(first, "/en/admin/mfa"), csrf(second, "/en/admin/mfa")
    timestamp = (int(time.time()) // 30 + 2) * 30
    step = timestamp // 30
    monkeypatch.setattr("portal.routes.time.time", lambda: timestamp)
    values = {"code": pyotp.TOTP(secret).at(timestamp)}
    synchronize(app, "web.admin_mfa")
    results = run_pair(lambda: post(first, "/en/admin/mfa", values, first_token),
                       lambda: post(second, "/en/admin/mfa", values, second_token))
    assert sorted(response.status_code for response in results) == [302, 422]
    with app.extensions["portal_sessionmaker"]() as db:
        owner = db.scalar(select(User).where(User.email == "owner@example.test"))
        assert owner.totp_last_step == step
        assert db.scalar(select(func.count(AuditEvent.id)).where(AuditEvent.action == "mfa.verified")) == 1


def test_simultaneous_mfa_enrollment_does_not_overwrite_first_secret(pg_application):
    app = pg_application
    first, second = app.test_client(), app.test_client()
    signup(app, first, "owner@example.test", "Test owner")
    login(app, second, "owner@example.test")
    first_secret, first_token = owner_secret(app, first)
    second_secret, second_token = owner_secret(app, second)
    assert first_secret != second_secret
    synchronize(app, "web.admin_mfa_setup")
    results = run_pair(
        lambda: post(first, "/en/admin/mfa/setup", {"intent": "confirm", "code": pyotp.TOTP(first_secret).now()}, first_token),
        lambda: post(second, "/en/admin/mfa/setup", {"intent": "confirm", "code": pyotp.TOTP(second_secret).now()}, second_token),
    )
    assert sorted(response.status_code for response in results) == [302, 403]
    with app.extensions["portal_sessionmaker"]() as db:
        owner = db.scalar(select(User).where(User.email == "owner@example.test"))
        stored = app.extensions["portal_cipher"].decrypt(owner.totp_secret.encode()).decode()
        assert stored in {first_secret, second_secret}
        assert db.scalar(select(func.count(AuditEvent.id)).where(AuditEvent.action == "mfa.enabled")) == 1


def test_two_dispatchers_share_one_postgres_delivery_lease(pg_application):
    app = pg_application
    citizen = app.test_client()
    signup(app, citizen, "outbox-race@example.test")
    assert post(citizen, "/en/cases/new", {
        "subject": "Delivery lease concurrency", "category": "other",
        "details": "This synthetic case verifies one notification lease between workers.", "consent": "yes",
    }).status_code == 302
    mail = app.extensions["pg_mail"]
    mail.hold_notifications = True
    start = threading.Barrier(2)

    def deliver():
        start.wait(timeout=8)
        return dispatch_due(app, maximum=1)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {pool.submit(deliver), pool.submit(deliver)}
        try:
            assert mail.notification_started.wait(timeout=8)
            finished, _ = wait(futures, timeout=8, return_when=FIRST_COMPLETED)
            assert len(finished) == 1
            assert next(iter(finished)).result() == 0
        finally:
            mail.release_notification.set()
        assert sorted(f.result(timeout=8) for f in futures) == [0, 1]
    with mail.lock:
        deliveries = [message for message in mail.messages if message["identity"]]
    assert len(deliveries) == 1
    with app.extensions["portal_sessionmaker"]() as db:
        row = db.scalar(select(Notification))
        assert row.status == "sent" and row.attempts == 1 and row.sent_at
        assert db.scalar(select(func.count(Complaint.id))) == 1
