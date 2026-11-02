"""Stage 3 tests use synthetic, isolated temporary SQLite databases only."""
import os
from pathlib import Path
import tempfile
import unittest
from werkzeug.security import generate_password_hash

import app as cyber_app
from stage3_admin import FAILURES_BY_IP


class LocalTrainingAdminTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.previous_db = cyber_app.DB_PATH
        self.previous_public = cyber_app.PUBLIC_DEMO_MODE
        self.env_keys = ["CYBER_SURAKSHA_STAGE3_ENABLED", "CYBER_SURAKSHA_STAGE3_ADMIN_HASH",
                         "CYBER_SURAKSHA_STAGE3_VIEWER_HASH", "RENDER"]
        self.env_originals = {k: os.environ.get(k) for k in self.env_keys}
        cyber_app.DB_PATH = Path(self.temp.name) / "test.db"
        cyber_app.PUBLIC_DEMO_MODE = False
        os.environ["CYBER_SURAKSHA_STAGE3_ENABLED"] = "1"
        os.environ["CYBER_SURAKSHA_STAGE3_ADMIN_HASH"] = generate_password_hash("test-admin-password-123")
        os.environ["CYBER_SURAKSHA_STAGE3_VIEWER_HASH"] = generate_password_hash("test-viewer-password-456")
        os.environ.pop("RENDER", None)
        FAILURES_BY_IP.clear()
        cyber_app.init_db()
        cyber_app.seed_demo_data()
        self.client = cyber_app.app.test_client()

    def tearDown(self):
        cyber_app.DB_PATH = self.previous_db
        cyber_app.PUBLIC_DEMO_MODE = self.previous_public
        for key, value in self.env_originals.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        FAILURES_BY_IP.clear()
        self.temp.cleanup()

    def csrf(self):
        with self.client.session_transaction() as session:
            return session["stage3_csrf"]

    def login(self, password):
        res = self.client.get("/training-admin/login")
        self.assertEqual(res.status_code, 200)
        return self.client.post("/training-admin/login", data={"_csrf": self.csrf(), "password": password})

    def test_feature_off_returns_404(self):
        os.environ.pop("CYBER_SURAKSHA_STAGE3_ENABLED", None)
        self.assertEqual(self.client.get("/training-admin/login").status_code, 404)

    def test_public_mode_returns_404_even_if_enabled(self):
        cyber_app.PUBLIC_DEMO_MODE = True
        self.assertEqual(self.client.get("/training-admin/login").status_code, 404)
        self.assertEqual(self.client.get("/training-admin").status_code, 404)
        cyber_app.PUBLIC_DEMO_MODE = False
        os.environ["RENDER"] = "true"
        self.assertEqual(self.client.get("/training-admin/login").status_code, 404)

    def test_remote_access_blocked_even_with_forwarded_header(self):
        self.assertEqual(self.client.get("/training-admin/login",
                            environ_overrides={"REMOTE_ADDR": "203.0.113.9"},
                            headers={"X-Forwarded-For": "127.0.0.1"}).status_code, 404)

    def test_unauthenticated_dashboard_redirects(self):
        self.assertEqual(self.client.get("/training-admin").status_code, 302)

    def test_wrong_password_and_missing_csrf(self):
        self.client.get("/training-admin/login")
        self.assertEqual(self.client.post("/training-admin/login", data={"password": "wrong"}).status_code, 403)
        self.assertEqual(self.client.post("/training-admin/login", data={"_csrf": self.csrf(),
            "password": "wrong"}).status_code, 401)

    def test_admin_login_and_demo_case_update_and_audit(self):
        self.assertEqual(self.login("test-admin-password-123").status_code, 302)
        resp = self.client.get("/training-admin")
        self.assertEqual(resp.status_code, 200)
        self.assertIn(b"CS-DEMO-001", resp.data)
        self.assertNotIn(b"9000000001", resp.data)
        self.assertEqual(self.client.post("/training-admin/cases/CS-DEMO-001/status",
            data={"_csrf": self.csrf(), "status": "Investigating"}).status_code, 302)
        with cyber_app.get_db() as db:
            row = db.execute("SELECT status FROM incidents WHERE reference='CS-DEMO-001'").fetchone()
            n = db.execute("SELECT COUNT(*) FROM stage3_audit WHERE action='status_change'").fetchone()[0]
        self.assertEqual(row["status"], "Investigating")
        self.assertEqual(n, 1)

    def test_viewer_cannot_change_case(self):
        self.assertEqual(self.login("test-viewer-password-456").status_code, 302)
        self.assertEqual(self.client.get("/training-admin").status_code, 200)
        self.assertEqual(self.client.post("/training-admin/cases/CS-DEMO-001/status",
            data={"_csrf": self.csrf(), "status": "Resolved"}).status_code, 403)

    def test_csrf_and_invalid_status_rejected(self):
        self.login("test-admin-password-123")
        self.assertEqual(self.client.post("/training-admin/cases/CS-DEMO-001/status",
            data={"status": "Resolved"}).status_code, 403)
        self.assertEqual(self.client.post("/training-admin/cases/CS-DEMO-001/status",
            data={"_csrf": self.csrf(), "status": "Hacked"}).status_code, 400)

    def test_real_style_non_demo_record_cannot_be_modified(self):
        self.login("test-admin-password-123")
        with cyber_app.get_db() as db:
            db.execute("""INSERT INTO incidents (reference,created_at,incident_type,channel,incident_date,
                amount,contact_name,contact_phone,description,status,is_demo)
                VALUES (?,?,?,?,?,?,?,?,?,?,0)""",
                ("CS-PRIVATE-001", "2026-11-02", "Other", "SMS", "2026-11-02", 0,
                 "Test", "000", "Fictional private test data", "Received"))
            db.commit()
        self.assertEqual(self.client.post("/training-admin/cases/CS-PRIVATE-001/status",
            data={"_csrf": self.csrf(), "status": "Resolved"}).status_code, 404)
        self.assertNotIn(b"CS-PRIVATE-001", self.client.get("/training-admin").data)

    def test_login_rate_limit(self):
        self.client.get("/training-admin/login")
        for _ in range(5):
            self.assertEqual(self.client.post("/training-admin/login", data={
                "_csrf": self.csrf(), "password": "wrong"}).status_code, 401)
        self.assertEqual(self.client.post("/training-admin/login", data={
            "_csrf": self.csrf(), "password": "test-admin-password-123"}).status_code, 429)


if __name__ == "__main__":
    unittest.main()
