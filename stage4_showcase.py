"""Synthetic-case showcase and unified navigation for the ONE Flask app."""
import os
from flask import render_template, request


def register_training_showcase(app, get_db):
    @app.context_processor
    def unified_site_navigation():
        # Never show the local admin link on Render or to a remote request.
        return {"training_admin_available": (
            os.environ.get("CYBER_SURAKSHA_STAGE3_ENABLED") == "1"
            and os.environ.get("PUBLIC_DEMO_MODE") != "1"
            and not os.environ.get("RENDER")
            and request.remote_addr in {"127.0.0.1", "::1"}
        )}

    @app.route("/training-showcase", methods=["GET"])
    def training_showcase():
        # Whitelisted non-personal columns from synthetic records ONLY.
        with get_db() as conn:
            cases = conn.execute("""
                SELECT reference, incident_type, channel, incident_date, status
                  FROM incidents WHERE is_demo = 1
                  ORDER BY id ASC LIMIT 30
            """).fetchall()
        return render_template("training_showcase.html", cases=cases)
