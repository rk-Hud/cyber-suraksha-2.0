"""Regression tests for one-codebase deployment and safe route separation."""
import os
from pathlib import Path
import tempfile
import unittest
import app as cyber_app

class UnifiedSiteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.original_db = cyber_app.DB_PATH
        self.original_public = cyber_app.PUBLIC_DEMO_MODE
        self.original_enabled = os.environ.get("CYBER_SURAKSHA_STAGE3_ENABLED")
        self.original_render = os.environ.get("RENDER")
        self.original_demo_env = os.environ.get("PUBLIC_DEMO_MODE")
        cyber_app.DB_PATH = Path(self.tmp.name) / "unified_test.db"
        cyber_app.init_db()
        cyber_app.seed_demo_data()
        self.client = cyber_app.app.test_client()

    def tearDown(self):
        cyber_app.DB_PATH = self.original_db
        cyber_app.PUBLIC_DEMO_MODE = self.original_public
        for key, old in (("CYBER_SURAKSHA_STAGE3_ENABLED", self.original_enabled),
                         ("RENDER", self.original_render),
                         ("PUBLIC_DEMO_MODE", self.original_demo_env)):
            if old is None: os.environ.pop(key, None)
            else: os.environ[key] = old
        self.tmp.cleanup()

    def test_training_showcase_excludes_non_demo_records_and_personal_columns(self):
        with cyber_app.get_db() as conn:
            conn.execute("""INSERT INTO incidents
               (reference, created_at, incident_type, channel, incident_date, amount,
                contact_name, contact_phone, description, evidence_note, status, is_demo)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,0)""",
                ("PRIVATE-DO-NOT-DISPLAY", "2026-11-02", "Other", "SMS", "2026-11-02",
                 0, "Private Test Name", "1234567890", "Private test description", "", "Received"))
            conn.commit()
        cyber_app.PUBLIC_DEMO_MODE = True
        result = self.client.get("/training-showcase")
        self.assertEqual(result.status_code, 200)
        self.assertIn(b"CS-DEMO-001", result.data)
        for secret in (b"PRIVATE-DO-NOT-DISPLAY", b"Private Test Name", b"1234567890", b"9000000001"):
            self.assertNotIn(secret, result.data)
        self.assertEqual(self.client.post("/training-showcase").status_code, 405)

    def test_local_navigation_has_admin_link_when_explicitly_enabled(self):
        cyber_app.PUBLIC_DEMO_MODE = False
        os.environ["PUBLIC_DEMO_MODE"] = "0"
        os.environ["CYBER_SURAKSHA_STAGE3_ENABLED"] = "1"
        os.environ.pop("RENDER", None)
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Training admin", response.data)
        self.assertIn(b"Case training", response.data)

    def test_render_navigation_never_shows_admin_link(self):
        cyber_app.PUBLIC_DEMO_MODE = True
        os.environ["PUBLIC_DEMO_MODE"] = "1"
        os.environ["CYBER_SURAKSHA_STAGE3_ENABLED"] = "1"
        os.environ["RENDER"] = "true"
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(b"Training admin", response.data)
        self.assertIn(b"Case training", response.data)
        self.assertEqual(self.client.get("/training-admin/login").status_code, 404)

if __name__ == "__main__": unittest.main()
