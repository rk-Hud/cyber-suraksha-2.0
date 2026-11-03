"""Online fictional citizen-demo security and feature tests (no production intake)."""
import io
import os
import sys
import tempfile
import unittest
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlencode

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
import app
import service_portal

class HostedDemoTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='cyber-demo-')
        self.saved={x:getattr(app,x) for x in ('DATA_DIR','DB_FILE','HOSTED_DEMO','ON_HOSTING','PUBLIC_MODE','LOCAL_TRAINING','ADMIN_HASH','DEMO_ADMIN_HASH','SESSION_SECRET')}
        app.DATA_DIR=Path(self.tmp.name);app.DB_FILE=app.DATA_DIR/'demo.db'
        app.ON_HOSTING=True;app.HOSTED_DEMO=True;app.PUBLIC_MODE=True;app.LOCAL_TRAINING=False
        app.ADMIN_HASH='';app.DEMO_ADMIN_HASH=app.hash_password('demo-training-admin-strong-password')
        app.SESSION_SECRET=b'a-test-session-secret-not-to-be-used-in-production'
        app.initialize_database();service_portal.initialize(app)
        service_portal.STAFF_AUTH_FAILURES.clear();service_portal.AUTH_FAILURES.clear()
    def tearDown(self):
        for x,v in self.saved.items():setattr(app,x,v)
        self.tmp.cleanup()
    def req(self,path,method='GET',form=None,cookies=None):
        request_data=urlencode(form or {}).encode()
        uri,_,query=path.partition('?')
        env={'REQUEST_METHOD':method,'PATH_INFO':uri,'QUERY_STRING':query,'CONTENT_TYPE':'application/x-www-form-urlencoded','CONTENT_LENGTH':str(len(request_data)),'wsgi.input':io.BytesIO(request_data),'wsgi.url_scheme':'https','REMOTE_ADDR':'203.0.113.12','HTTP_HOST':'test.example','SERVER_NAME':'test.example','SERVER_PORT':'443','HTTP_COOKIE':'; '.join(f'{k}={v}' for k,v in (cookies or {}).items())}
        res={}
        def sr(status,headers):res.update(status=int(status.split()[0]),headers=dict(headers))
        text=b''.join(app.application(env,sr)).decode('utf-8','replace')
        if cookies is not None:
            for key,value in res['headers'].items():
                if key.lower()=='set-cookie':
                    jar=SimpleCookie();jar.load(value)
                    for k,m in jar.items():
                        if m.value:cookies[k]=m.value
                        else:cookies.pop(k,None)
        return res['status'],res['headers'],text
    def register(self,email='alice@example.com'):
        c={};self.assertEqual(self.req('/service/register',cookies=c)[0],200)
        r=self.req('/service/register','POST',{'_csrf':c['cs_form'],'alias':'Fictional Alice','email':email,'password':'a-unique-demo-password-12345','fictional':'yes'},c)
        self.assertEqual(r[0],303)
        return c
    def test_online_registration_login_case_tracking_and_input_discard(self):
        st,_,home=self.req('/service')
        self.assertEqual(st,200);self.assertIn('Online demonstration only',home)
        self.assertEqual(self.req('/health')[0],200)
        self.assertIn('hosted-fictional-demo',self.req('/health')[2])
        c=self.register();self.assertEqual(self.req('/service/cases',cookies=c)[0],200)
        self.assertEqual(self.req('/service/new',cookies=c)[0],200)
        self.assertIn('Select a safe fictional scenario',self.req('/service/new',cookies=c)[2])
        fake_private='REAL VICTIM PHONE 9000000000 SHOULD NOT BE SAVED'
        r=self.req('/service/new','POST',{'_csrf':c['cs_form'],'scenario':list(service_portal.DEMO_SCENARIOS)[0],'category':'Other','channel':'SMS','summary':fake_private,'fictional':'yes'},c)
        self.assertEqual(r[0],303)
        path=r[1]['Location'];self.assertIn('/service/case/CS-EVAL-',path)
        body=self.req(path,cookies=c)[2]
        self.assertNotIn(fake_private,body)
        self.assertIn('Fictional bank KYC update',body)
        with app.connect_db() as db:
            row=db.execute('SELECT summary,is_fictional FROM cs_pilot_cases').fetchone()
            self.assertEqual(row['is_fictional'],1);self.assertNotIn(fake_private,row['summary'])
        self.assertEqual(self.req('/service/logout','POST',{'_csrf':c['cs_form']},c)[0],303)
        self.assertEqual(self.req('/service/cases',cookies=c)[0],303)
        self.assertEqual(self.req('/service/login',cookies=c)[0],200)
        self.assertEqual(self.req('/service/login','POST',{'_csrf':c['cs_form'],'email':'alice@example.com','password':'a-unique-demo-password-12345'},c)[0],303)
        self.assertEqual(self.req(path,cookies=c)[0],200)
    def test_hosted_staff_password_and_preset_guidance(self):
        citizen=self.register();self.req('/service/new',cookies=citizen)
        case=self.req('/service/new','POST',{'_csrf':citizen['cs_form'],'scenario':list(service_portal.DEMO_SCENARIOS)[1],'fictional':'yes'},citizen)
        ref=case[1]['Location'].split('/')[-1]
        self.assertEqual(self.req('/service/staff')[0],303)
        self.assertEqual(self.req('/service/staff/'+ref,'POST',{'status':'Closed'})[0],403)
        staff={};self.assertEqual(self.req('/service/staff/login',cookies=staff)[0],200)
        st,_,_=self.req('/service/staff/login','POST',{'_csrf':staff['cs_form'],'password':'bad-password'},staff)
        self.assertEqual(st,200)
        st,headers,_=self.req('/service/staff/login','POST',{'_csrf':staff['cs_form'],'password':'demo-training-admin-strong-password'},staff)
        self.assertEqual(st,303);self.assertIn('cs_demo_staff',staff)
        self.assertIn('Secure',headers['Set-Cookie'])
        self.assertIn(ref,self.req('/service/staff',cookies=staff)[2])
        st,_,_=self.req('/service/staff/'+ref,'POST',{'_csrf':staff['cs_form'],'status':'Guidance provided','guidance':'Unrestricted admin content'},staff)
        self.assertEqual(st,400)
        guidance=service_portal.DEMO_GUIDANCE[1]
        st,_,_=self.req('/service/staff/'+ref,'POST',{'_csrf':staff['cs_form'],'status':'Guidance provided','guidance':guidance},staff)
        self.assertEqual(st,303)
        self.assertIn(guidance,self.req(case[1]['Location'],cookies=citizen)[2])
        self.assertEqual(self.req('/service/staff/logout','POST',{'_csrf':staff['cs_form']},staff)[0],303)
        self.assertEqual(self.req('/service/staff',cookies=staff)[0],303)
    def test_no_existing_write_features_unlocked_and_no_real_email(self):
        c={};self.req('/service/register',cookies=c)
        s,_,b=self.req('/service/register','POST',{'_csrf':c['cs_form'],'alias':'Real Person','email':'real@gmail.com','password':'secretSecretSecret123','fictional':'yes'},c)
        self.assertEqual(s,200);self.assertIn('example.com',b)
        self.assertEqual(self.req('/training-admin/login')[1].get('Location'),'/service/staff/login')
        self.assertEqual(self.req('/report','POST',{'hello':'world'})[0],403)
        self.assertFalse(app.writable({'REMOTE_ADDR':'127.0.0.1'}))


    def test_admin_audit_contains_fictional_identity_purpose_cases_and_operator(self):
        citizen=self.register(email='sample.auditor@example.com')
        self.assertEqual(self.req('/service/logout','POST',{'_csrf':citizen['cs_form']},citizen)[0],303)
        self.assertEqual(self.req('/service/login',cookies=citizen)[0],200)
        purpose='Track my fictional case'
        self.assertEqual(self.req('/service/login','POST',{
            '_csrf':citizen['cs_form'],'email':'sample.auditor@example.com',
            'password':'a-unique-demo-password-12345','purpose':purpose},citizen)[0],303)
        self.assertEqual(self.req('/service/new',cookies=citizen)[0],200)
        scenario=list(service_portal.DEMO_SCENARIOS)[0]
        case=self.req('/service/new','POST',{'_csrf':citizen['cs_form'],
             'scenario':scenario,'purpose':'Practice fictional reporting','fictional':'yes'},citizen)
        self.assertEqual(case[0],303)
        ref=case[1]['Location'].split('/')[-1]
        with app.connect_db() as db:
            rows=db.execute('SELECT action,purpose,case_ref FROM cs_pilot_activity ORDER BY id').fetchall()
        self.assertEqual([r['action'] for r in rows[:4]],['Account registered','Signed out','Signed in','Fictional case submitted'])
        self.assertEqual(rows[2]['purpose'],purpose)
        self.assertEqual(rows[3]['case_ref'],ref)
        self.assertEqual(self.req('/service/staff')[0],303)
        self.assertEqual(self.req('/service/staff/'+ref,'POST',{'status':'Closed'})[0],403)
        staff={};self.req('/service/staff/login',cookies=staff)
        auth=self.req('/service/staff/login','POST',{'_csrf':staff['cs_form'],
            'operator':'Sample Reviewer','password':'demo-training-admin-strong-password'},staff)
        self.assertEqual(auth[0],303)
        st,_,html=self.req('/service/staff',cookies=staff)
        self.assertEqual(st,200)
        for expected in ('Registered fictional accounts','Completed activities and login purposes',
                         'sample.auditor@example.com',purpose,'Fictional Alice',ref):
            self.assertIn(expected,html)
        self.assertNotIn('password_hash',html)
        self.assertEqual(self.req('/service/staff/'+ref,'POST',{'_csrf':staff['cs_form'],
           'status':'Closed','guidance':service_portal.DEMO_GUIDANCE[0]},staff)[0],303)
        html=self.req('/service/staff',cookies=staff)[2]
        self.assertIn('Sample Reviewer',html)
        self.assertIn('Staff status updated',html)
        self.assertIn('Closed',html)
        with app.connect_db() as db:
            actor=db.execute('SELECT performed_by FROM cs_pilot_activity WHERE action=? ORDER BY id DESC LIMIT 1',
                             ('Staff status updated',)).fetchone()['performed_by']
        self.assertEqual(actor,'Sample Reviewer')
        self.assertEqual(self.req('/service/staff/logout','POST',{'_csrf':staff['cs_form']},staff)[0],303)
        self.assertEqual(self.req('/service/staff',cookies=staff)[0],303)

    def test_purpose_is_approved_selection_not_unsanitized_text(self):
        c=self.register()
        self.req('/service/new',cookies=c)
        self.assertEqual(self.req('/service/new','POST',{
            '_csrf':c['cs_form'],'scenario':list(service_portal.DEMO_SCENARIOS)[0],
            'purpose':'<script>alert(1)</script>','fictional':'yes'},c)[0],303)
        with app.connect_db() as db:
            row=db.execute('SELECT purpose FROM cs_pilot_activity WHERE action=? ORDER BY id DESC LIMIT 1',
                           ('Fictional case submitted',)).fetchone()
        self.assertEqual(row['purpose'],'Purpose not specified')

if __name__=='__main__':unittest.main()
