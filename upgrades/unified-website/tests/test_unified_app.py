import io,os,sys,tempfile,unittest
from pathlib import Path
from urllib.parse import urlencode
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
_tmp=tempfile.TemporaryDirectory(prefix='cybersuraksha-tests-')
os.environ['CS_DATA_DIR']=_tmp.name
os.environ['CS_PUBLIC_MODE']='1'
os.environ['CS_LOCAL_TRAINING']='0'
import app
app.DATA_DIR=Path(_tmp.name)
app.DB_FILE=app.DATA_DIR / 'cyber_suraksha.db'
app.initialize_database()

class UnifiedCyberSurakshaTests(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):_tmp.cleanup()
    def setUp(self):
        app.PUBLIC_MODE=True;app.LOCAL_TRAINING=False;app.ADMIN_HASH='';app.VIEWER_HASH='';app.LOGIN_FAILURES.clear()
    def req(self,path='/',method='GET',form=None,cookies='',addr='127.0.0.1',origin=''):
        raw=urlencode(form or {}).encode()
        route,_,query=path.partition('?')
        env={'REQUEST_METHOD':method,'PATH_INFO':route,'QUERY_STRING':query,'SERVER_NAME':'localhost','SERVER_PORT':'8080','SERVER_PROTOCOL':'HTTP/1.1','HTTP_HOST':'127.0.0.1:8080','REMOTE_ADDR':addr,'wsgi.url_scheme':'http','wsgi.input':io.BytesIO(raw),'wsgi.errors':sys.stderr,'CONTENT_TYPE':'application/x-www-form-urlencoded','CONTENT_LENGTH':str(len(raw)),'HTTP_COOKIE':cookies,'HTTP_ORIGIN':origin}
        state={}
        def started(status,headers):state['status']=int(status.split()[0]);state['headers']=headers
        result=b''.join(app.application(env,started));return state['status'],dict(state['headers']),result.decode('utf-8','replace')
    def cookie(self,headers):return headers['Set-Cookie'].split(';',1)[0]
    def test_home_and_brand(self):
        s,h,b=self.req('/');self.assertEqual(s,200);self.assertIn('CYBER SURAKSHA 2.0',b);self.assertNotIn('CYBER SURAKSHA 2.2',b)
    def test_health(self):
        s,h,b=self.req('/health');self.assertEqual(s,200);self.assertIn('public-read-only',b);self.assertIn('"government_approved": false',b)
    def test_public_pages_load(self):
        for page in ['index.html','scam-checker.html','response.html','training.html','resources.html','impact.html','trust.html','governance.html','international.html','privacy.html','accessibility.html','contact.html','about.html','sitemap.html','terms.html','assistant.html','operations.html']:
            with self.subTest(page=page):self.assertEqual(self.req('/'+page)[0],200)
    def test_operational_routes_load(self):
        for route in ['/dashboard','/report','/incidents','/fraud-simulator','/soc-simulator','/soc/SOC-DEMO-001','/zero-trust','/disclosure','/awareness','/awareness?lang=te','/training-showcase','/incident/CS-DEMO-001']:
            with self.subTest(route=route):self.assertIn(self.req(route)[0],(200,303))
    def test_static_js_loads(self):self.assertIn('CyberScamCore',self.req('/assets/scam_core.js')[2]);self.assertEqual(self.req('/assets/assistant.js')[0],200)
    def test_security_headers(self):
        s,h,b=self.req('/scam-checker.html');self.assertEqual(h['X-Content-Type-Options'],'nosniff');self.assertIn("frame-ancestors 'none'",h['Content-Security-Policy']);self.assertEqual(h['X-Frame-Options'],'DENY')
    def test_static_path_traversal_denied(self):
        for name in ['/../app.py','/assets/../../app.py','/app.py','/.gitignore','/../../etc/passwd','/assets/..%2f..%2fapp.py']:
            with self.subTest(path=name):self.assertEqual(self.req(name)[0],404)
    def test_public_admin_disabled(self):self.assertEqual(self.req('/training-admin')[0],404);self.assertEqual(self.req('/training-admin/login')[0],404)
    def test_public_report_readonly(self):self.assertEqual(self.req('/report','POST',{'incident_type':'Other'})[0],403)
    def test_public_soc_readonly(self):self.assertEqual(self.req('/soc/SOC-DEMO-001','POST',{'status':'Closed'})[0],403)
    def test_public_disclosure_readonly(self):self.assertEqual(self.req('/disclosure','POST',{'title':'Test'})[0],403)
    def test_public_unknown_post(self):self.assertEqual(self.req('/scam-checker.html','POST',{})[0],405)
    def test_public_no_sensitive_db_fields(self):
        with app.connect_db() as db:
            db.execute("INSERT OR IGNORE INTO incidents (reference,created_at,incident_type,channel,incident_date,amount,contact_name,contact_phone,description,status,is_demo) VALUES (?,?,?,?,?,?,?,?,?,?,0)",('CS-PRIVATE-XYZ',app.utc(),'Other','SMS','2026-11-02',0,'PRIVATE VICTIM NAME','9988776655','SECRET CASE DETAILS','Received'))
        for url in ['/dashboard','/training-showcase','/incident/CS-PRIVATE-XYZ']:
            s,h,b=self.req(url);self.assertNotIn('PRIVATE VICTIM NAME',b);self.assertNotIn('9988776655',b);self.assertNotIn('SECRET CASE DETAILS',b)
    def test_private_case_not_addressable(self):self.assertEqual(self.req('/incident/CS-PRIVATE-XYZ')[0],404)
    def test_soc_filter(self):
        s,h,b=self.req('/soc-simulator?severity=Critical');self.assertEqual(s,200);self.assertIn('SOC-DEMO-003',b);self.assertNotIn('SOC-DEMO-006',b)
    def test_awareness_telugu(self):
        status,_,body=self.req('/awareness?lang=te')
        self.assertEqual(status,200)
        self.assertIn('డబ్బు అందుకోవడానికి',body)
        self.assertIn('lang=\"te\"',body) if False else self.assertIn('name=\"lang\" value=\"te\"',body)
    def test_zero_trust(self):
        self.assertIn('DENY / STEP-UP',self.req('/zero-trust?scenario=unknown_device')[2]);self.assertIn('ALLOW',self.req('/zero-trust?scenario=managed_device')[2])
    def test_legacy_schema_in_place(self):
        with app.connect_db() as db:
            for table in ('incidents','soc_alerts','zero_trust_evaluations','disclosure_reports','stage3_audit'):
                self.assertTrue(db.execute("SELECT name FROM sqlite_master WHERE name=?",(table,)).fetchone())
    def test_local_csrf_required(self):
        app.LOCAL_TRAINING=True;app.PUBLIC_MODE=False
        self.assertEqual(self.req('/report','POST',{'description':'Some synthetic incident for test'})[0],403)
    def test_local_case_submission(self):
        app.LOCAL_TRAINING=True;app.PUBLIC_MODE=False
        status,head,body=self.req('/report');self.assertEqual(status,200)
        cookie=self.cookie(head);token=cookie.split('=')[1]
        payload={'_csrf':token,'incident_type':'Other','channel':'SMS','incident_date':'2026-11-03','amount':'0','contact_name':'Fictional','contact_phone':'0000000000','description':'This fictional message asked for a training password.','evidence_note':'Synthetic evidence'}
        s,h,b=self.req('/report','POST',payload,cookie);self.assertEqual(s,303);self.assertIn('/incident/CS-TRAIN-',h['Location']);self.assertEqual(self.req(h['Location'])[0],200)
    def test_local_soc_update(self):
        app.LOCAL_TRAINING=True;app.PUBLIC_MODE=False
        s,h,b=self.req('/soc/SOC-DEMO-001');cookie=self.cookie(h);token=cookie.split('=')[1]
        data={'_csrf':token,'status':'Investigating','assessment':'Sample test','analyst_notes':'Checked fake event 4625'}
        s,h,b=self.req('/soc/SOC-DEMO-001','POST',data,cookie);self.assertEqual(s,303)
    def test_admin_login_csrf_and_auth(self):
        app.LOCAL_TRAINING=True;app.PUBLIC_MODE=False;app.ADMIN_HASH=app.hash_password('verystrong_password_for_testing')
        s,h,b=self.req('/training-admin/login');self.assertEqual(s,200);cookie=self.cookie(h)
        self.assertEqual(self.req('/training-admin/login','POST',{'password':'verystrong_password_for_testing'},cookie)[0],403)
        token=cookie.split('=')[1]
        s,h,b=self.req('/training-admin/login','POST',{'_csrf':token,'password':'verystrong_password_for_testing'},cookie)
        self.assertEqual(s,303);self.assertIn('cs_sess=',h['Set-Cookie'])
        sess=self.cookie(h);s,h,b=self.req('/training-admin',cookies=cookie+'; '+sess);self.assertEqual(s,200);self.assertIn('administrator',b.lower())
    def test_viewer_cannot_update(self):
        app.LOCAL_TRAINING=True;app.PUBLIC_MODE=False
        app.ADMIN_HASH=app.hash_password('strongadminpassword123');app.VIEWER_HASH=app.hash_password('strongviewerpassword123')
        s,h,b=self.req('/training-admin/login');cookie=self.cookie(h);token=cookie.split('=')[1]
        s,h,b=self.req('/training-admin/login','POST',{'_csrf':token,'password':'strongviewerpassword123'},cookie);sess=self.cookie(h)
        data={'_csrf':token,'status':'Resolved'}
        self.assertEqual(self.req('/training-admin/cases/CS-DEMO-001/status','POST',data,cookie+'; '+sess)[0],403)
    def test_admin_updates_case_with_audit(self):
        app.LOCAL_TRAINING=True;app.PUBLIC_MODE=False;app.ADMIN_HASH=app.hash_password('strong_admin_password_456')
        s,h,b=self.req('/training-admin/login');cookie=self.cookie(h);token=cookie.split('=')[1]
        s,h,b=self.req('/training-admin/login','POST',{'_csrf':token,'password':'strong_admin_password_456'},cookie)
        self.assertEqual(s,303)
        session=self.cookie(h)
        combined=cookie+'; '+session
        s,h,b=self.req('/training-admin/cases/CS-DEMO-001/status','POST',{'_csrf':token,'status':'Resolved'},combined)
        self.assertEqual(s,303)
        with app.connect_db() as db:
            row=db.execute("SELECT status FROM incidents WHERE reference='CS-DEMO-001' AND is_demo=1").fetchone()
            event=db.execute("SELECT action FROM stage3_audit WHERE case_ref='CS-DEMO-001' ORDER BY id DESC LIMIT 1").fetchone()
        self.assertEqual(row['status'],'Resolved');self.assertEqual(event['action'],'status_change')
    def test_local_case_description_is_html_escaped(self):
        app.LOCAL_TRAINING=True;app.PUBLIC_MODE=False
        status,headers,body=self.req('/report')
        cookie=self.cookie(headers);token=cookie.split('=')[1]
        p={'_csrf':token,'incident_type':'Other','channel':'SMS','incident_date':'2026-11-03','amount':'0','contact_name':'Fictional','contact_phone':'0000000000','description':'Fake incident description <script>alert(1)</script>', 'evidence_note':'Synthetic'}
        s,h,b=self.req('/report','POST',p,cookie)
        self.assertEqual(s,303)
        _,_,detail=self.req(h['Location'])
        self.assertIn('&lt;script&gt;',detail);self.assertNotIn('<script>alert(1)</script>',detail)
    def test_remote_local_edit_denied(self):
        app.LOCAL_TRAINING=True;app.PUBLIC_MODE=False
        self.assertEqual(self.req('/report','POST',{},addr='203.0.113.10')[0],403)
    def test_hosting_flag_denies_writes(self):
        app.LOCAL_TRAINING=True;app.PUBLIC_MODE=False
        old=app.ON_HOSTING;app.ON_HOSTING=True
        try:self.assertEqual(self.req('/report','POST',{})[0],403)
        finally:app.ON_HOSTING=old
if __name__=='__main__':unittest.main()
