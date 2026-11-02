"""Local-only training administrator panel for fictional CYBER SURAKSHA cases.

NOT a production incident-management system. Does not accept real cases.
"""
from datetime import datetime, timezone
from functools import wraps
import os
import secrets
import time

from flask import abort, flash, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash

LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_FAILURES = 5
SESSION_LIFETIME_SECONDS = 20 * 60
ALLOWED_STATUSES = {"Received", "Investigating", "Resolved"}
FAILURES_BY_IP = {}


def register_stage3(app, get_db, is_public_demo):
    """Register protected localhost-only routes without enabling public access."""

    def enabled():
        # Never trust X-Forwarded-For for a local-access bypass.
        # Disable on Render even if another variable is accidentally changed.
        return (
            os.environ.get("CYBER_SURAKSHA_STAGE3_ENABLED") == "1"
            and not is_public_demo()
            and not os.environ.get("RENDER")
            and request.remote_addr in {"127.0.0.1", "::1"}
        )

    def require_local():
        if not enabled():
            abort(404)

    def csrf_token():
        if "stage3_csrf" not in session:
            session["stage3_csrf"] = secrets.token_urlsafe(32)
        return session["stage3_csrf"]

    def valid_csrf():
        supplied = request.form.get("_csrf", "")
        expected = session.get("stage3_csrf", "")
        return bool(expected and supplied and secrets.compare_digest(supplied, expected))

    def current_role():
        role = session.get("stage3_role")
        since = session.get("stage3_login_at", 0)
        if role not in {"admin", "viewer"} or not isinstance(since, (int, float)):
            return None
        if time.time() - since > SESSION_LIFETIME_SECONDS:
            session.pop("stage3_role", None)
            session.pop("stage3_login_at", None)
            return None
        return role

    def require_role(role=None):
        require_local()
        current = current_role()
        if current is None:
            return redirect(url_for("stage3_login"))
        if role and current != role:
            abort(403)
        return None

    def ensure_audit_table():
        with get_db() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS stage3_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_time TEXT NOT NULL,
                actor_role TEXT NOT NULL,
                action TEXT NOT NULL,
                case_ref TEXT,
                detail TEXT NOT NULL
            )""")
            db.commit()

    def add_audit(role, action, case_ref=None, detail=""):
        ensure_audit_table()
        with get_db() as db:
            db.execute("""INSERT INTO stage3_audit
                (event_time, actor_role, action, case_ref, detail)
                VALUES (?, ?, ?, ?, ?)""", (
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
                role, action, case_ref, detail,
            ))
            db.commit()

    @app.route("/training-admin/login", methods=["GET", "POST"])
    def stage3_login():
        require_local()
        if not os.environ.get("CYBER_SURAKSHA_STAGE3_ADMIN_HASH"):
            return "Stage 3 credentials are not configured. Use the local runner.", 503
        if request.method == "POST":
            if not valid_csrf():
                abort(403)
            ip = request.remote_addr
            now = time.monotonic()
            attempts = [t for t in FAILURES_BY_IP.get(ip, []) if now - t < LOGIN_WINDOW_SECONDS]
            FAILURES_BY_IP[ip] = attempts
            if len(attempts) >= LOGIN_MAX_FAILURES:
                return "Too many attempts. Restart the local training server or try later.", 429
            supplied = request.form.get("password", "")
            role = None
            for option, env_name in (
                ("admin", "CYBER_SURAKSHA_STAGE3_ADMIN_HASH"),
                ("viewer", "CYBER_SURAKSHA_STAGE3_VIEWER_HASH"),
            ):
                stored_hash = os.environ.get(env_name)
                if stored_hash and check_password_hash(stored_hash, supplied):
                    role = option
                    break
            if role is None:
                FAILURES_BY_IP[ip].append(now)
                flash("Incorrect training password.", "error")
                return render_template("training_admin_login.html", csrf=csrf_token()), 401
            FAILURES_BY_IP.pop(ip, None)
            session.clear()
            session["stage3_role"] = role
            session["stage3_login_at"] = time.time()
            session["stage3_csrf"] = secrets.token_urlsafe(32)
            add_audit(role, "login", detail="Local training login")
            return redirect(url_for("stage3_dashboard"))
        if current_role():
            return redirect(url_for("stage3_dashboard"))
        return render_template("training_admin_login.html", csrf=csrf_token())

    @app.route("/training-admin/logout", methods=["POST"])
    def stage3_logout():
        require_local()
        if not valid_csrf():
            abort(403)
        role = current_role()
        if role:
            add_audit(role, "logout", detail="Local training logout")
        session.clear()
        return redirect(url_for("stage3_login"))

    @app.route("/training-admin", methods=["GET"])
    def stage3_dashboard():
        result = require_role()
        if result is not None:
            return result
        ensure_audit_table()
        with get_db() as db:
            # Never display real or locally entered personal details.
            cases = db.execute("""SELECT reference, incident_type, channel, status,
                incident_date FROM incidents WHERE is_demo=1 ORDER BY id LIMIT 100""").fetchall()
            events = db.execute("""SELECT event_time, actor_role, action, case_ref, detail
                FROM stage3_audit ORDER BY id DESC LIMIT 15""").fetchall()
        return render_template("training_admin_dashboard.html", cases=cases,
                               events=events, role=current_role(), csrf=csrf_token(),
                               statuses=sorted(ALLOWED_STATUSES))

    @app.route("/training-admin/cases/<reference>/status", methods=["POST"])
    def stage3_update_status(reference):
        result = require_role("admin")
        if result is not None:
            return result
        if not valid_csrf():
            abort(403)
        new_status = request.form.get("status", "")
        if new_status not in ALLOWED_STATUSES:
            abort(400)
        with get_db() as db:
            existing = db.execute(
                "SELECT status FROM incidents WHERE reference=? AND is_demo=1",
                (reference,),
            ).fetchone()
            if not existing:
                abort(404)
            db.execute("UPDATE incidents SET status=? WHERE reference=? AND is_demo=1",
                       (new_status, reference))
            db.commit()
        add_audit("admin", "status_change", reference,
                  f"{existing['status']} -> {new_status}")
        flash("Fictional case status updated locally.", "success")
        return redirect(url_for("stage3_dashboard"))

    return app
