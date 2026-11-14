import unittest
import tempfile
from pathlib import Path
import app as cyber_app

class IntegratedCyberSurakshaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        cyber_app.DB_PATH = Path(self.temp.name) / "test.db"
        cyber_app.init_db()
        cyber_app.seed_demo_data()
        # Insert a user-style record to prove additive migration preserves legacy data.
        with cyber_app.get_db() as conn:
            conn.execute("INSERT INTO incidents (reference,created_at,incident_type,channel,incident_date,amount,contact_name,contact_phone,description,evidence_note,status,is_demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,0)", ("CS-PRESERVE-01","2026-11-01T00:00:00Z","Other","SMS","2026-11-01",0,"Test","0000000000","Synthetic preservation test incident","test","Received"))
            conn.commit()
        cyber_app.init_extended_db()
        cyber_app.seed_integrated_data()
        self.client = cyber_app.app.test_client()

    def tearDown(self): self.temp.cleanup()

    def test_legacy_incident_survives_additive_migration(self):
        with cyber_app.get_db() as conn:
            row=conn.execute("SELECT reference FROM incidents WHERE reference='CS-PRESERVE-01'").fetchone()
        self.assertIsNotNone(row)

    def test_public_read_only_demo(self):
        previous = cyber_app.PUBLIC_DEMO_MODE
        cyber_app.PUBLIC_DEMO_MODE = True
        try:
            self.assertEqual(self.client.get('/').status_code, 200)
            self.assertEqual(self.client.get('/incidents').status_code, 200)
            self.assertEqual(self.client.post('/report', data={}).status_code, 403)
            self.assertEqual(self.client.post('/disclosure', data={}).status_code, 403)
            self.assertEqual(self.client.post('/soc/SOC-DEMO-001', data={}).status_code, 403)
            self.assertEqual(self.client.post('/zero-trust', data={'scenario':'unknown_device'}).status_code, 200)
            self.assertIn(b'read-only', self.client.get('/health').data)
        finally:
            cyber_app.PUBLIC_DEMO_MODE = previous

    def test_stage1_stage2_pages_load(self):
        self.assertEqual(self.client.get('/').status_code, 200)
        self.assertEqual(self.client.get('/report').status_code, 200)
        self.assertEqual(self.client.get('/incidents').status_code, 200)
        self.assertEqual(self.client.get('/fraud-simulator').status_code, 200)

    def test_stage1_report_submission_and_detail(self):
        response = self.client.post('/report', data={
            'incident_type': 'Phishing / fake link', 'channel': 'SMS',
            'incident_date': '2026-11-01', 'contact_name': 'Synthetic Test User',
            'contact_phone': '9000000000', 'description': 'A fictional test message asked the user to open a suspicious link.',
            'evidence_note': 'Synthetic evidence only', 'amount': '0'
        })
        self.assertEqual(response.status_code, 200)
        with cyber_app.get_db() as conn:
            row = conn.execute("SELECT reference FROM incidents WHERE contact_name='Synthetic Test User'").fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(self.client.get('/incident/' + row['reference']).status_code, 200)

    def test_soc_dashboard_and_filter(self):
        self.assertEqual(self.client.get('/soc-simulator').status_code,200)
        response=self.client.get('/soc-simulator?severity=Critical')
        self.assertEqual(response.status_code,200)
        self.assertIn(b'SOC-DEMO-003',response.data)

    def test_soc_investigation_saves_notes(self):
        response=self.client.post('/soc/SOC-DEMO-001',data={'status':'Investigating','assessment':'Likely password guessing; verify scope.','analyst_notes':'Reviewed synthetic failed logons and correlated timestamps.'},follow_redirects=True)
        self.assertEqual(response.status_code,200)
        with cyber_app.get_db() as conn:
            row=conn.execute("SELECT status,analyst_notes FROM soc_alerts WHERE alert_id='SOC-DEMO-001'").fetchone()
        self.assertEqual(row['status'],'Investigating')
        self.assertIn('synthetic',row['analyst_notes'])

    def test_soc_rejects_invalid_status(self):
        response=self.client.post('/soc/SOC-DEMO-001',data={'status':'Hacked','analyst_notes':'test notes'})
        self.assertEqual(response.status_code,200)

    def test_zero_trust_simulation(self):
        response=self.client.post('/zero-trust',data={'scenario':'unknown_device'})
        self.assertEqual(response.status_code,200)
        self.assertIn(b'DENY / STEP-UP',response.data)

    def test_disclosure_report_saved_locally(self):
        response=self.client.post('/disclosure',data={'asset':'demo.training.local','title':'Missing rate limit in demo form','severity':'Medium','details':'The fictional training endpoint accepts repeated requests without a demonstration rate limit.','remediation':'Add server-side throttling and monitor repeated requests.'},follow_redirects=True)
        self.assertEqual(response.status_code,200)
        with cyber_app.get_db() as conn:
            row=conn.execute("SELECT COUNT(*) FROM disclosure_reports").fetchone()[0]
        self.assertEqual(row,1)

    def test_awareness_languages(self):
        self.assertEqual(self.client.get('/awareness?lang=hi').status_code,200)
        response=self.client.get('/awareness?lang=te')
        self.assertEqual(response.status_code,200)
        self.assertIn('సైబర్'.encode('utf-8'),response.data)

    def test_awareness_quiz(self):
        self.client.get('/awareness?lang=en')
        response=self.client.post('/awareness',data={'q0':'1','q1':'2','q2':'0'})
        self.assertEqual(response.status_code,200)
        self.assertIn(b'3 / 3',response.data)

    def test_health(self):
        self.assertEqual(self.client.get('/health').json['status'],'ok')

if __name__=='__main__': unittest.main()
