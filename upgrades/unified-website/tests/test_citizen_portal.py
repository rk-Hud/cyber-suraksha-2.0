"""Integration and access-control tests for local-only fictional citizen service accounts."""
import io
import os
import re
import sys
import tempfile
import unittest
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlencode

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
os.environ.setdefault('CS_PUBLIC_MODE','1')
import app
import service_portal

class CitizenPortalTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='cs-portal-')
        self.prior=(app.DB_FILE, app.DATA_DIR, app.PUBLIC_MODE, app.LOCAL_TRAINING,app.ADMIN_HASH,app.VIEWER_HASH)
        app.DATA_DIR=Path(self.temp.name)
        app.DB_FILE=app.DATA_DIR/'unit.db'
        app.PUBLIC_MODE=False;app.LOCAL_TRAINING=True
        app.ADMIN_HASH='';app.VIEWER_HASH=''
        app.initialize_database();service_portal.initialize(app)
        service_portal.AUTH_FAILURES.clear()
    def tearDown(self):
        app.DB_FILE,app.DATA_DIR,app.PUBLIC_MODE,app.LOCAL_TRAINING,app.ADMIN_HASH,app.VIEWER_HASH=self.prior
        self.temp.cleanup()
    def req(self,uri,method='GET',form=None,cookies=None,addr='127.0.0.1',origin=''):
        raw=urlencode(form or {}).encode()
        route,_,query=uri.partition('?')
        env={'REQUEST_METHOD':method,'PATH_INFO':route,'QUERY_STRING':query,'SERVER_NAME':'localhost','SERVER_PORT':'8080','SERVER_PROTOCOL':'HTTP/1.1','HTTP_HOST':'127.0.0.1:8080','REMOTE_ADDR':addr,'wsgi.url_scheme':'http','wsgi.input':io.BytesIO(raw),'wsgi.errors':sys.stderr,'CONTENT_TYPE':'application/x-www-form-urlencoded','CONTENT_LENGTH':str(len(raw)),'HTTP_COOKIE':'; '.join(f'{k}={v}' for k,v in (cookies or {}).items()),'HTTP_ORIGIN':origin}
        result={}
        def sr(status,headers):result['status']=int(status.split()[0]);result['headers']=headers
        data=b''.join(app.application(env,sr)).decode('utf-8','replace')
        if cookies is not None:
            for key,value in result['headers']:
                if key.lower()=='set-cookie':
                    jar=SimpleCookie();jar.load(value)
                    for name,m in jar.items():
                        if m.value:cookies[name]=m.value
                        else:cookies.pop(name,None)
        return result['status'],dict(result['headers']),data
    def user(self,email='citizen@example.com',alias='Sample Citizen',password='CorrectHorse12345'):
        c={}
        self.assertEqual(self.req('/service/register',cookies=c)[0],200)
        form={'_csrf':c['cs_form'],'alias':alias,'email':email,'password':password,'fictional':'yes'}
        st,heads,_=self.req('/service/register','POST',form,c)
        self.assertEqual(st,303,(st,heads));self.assertIn('cs_portal',c)
        return c
    def create_case(self,c,summary='A fictional job offer requests a registration fee before confirming an interview appointment.'):
        self.assertEqual(self.req('/service/new',cookies=c)[0],200)
        st,h,b=self.req('/service/new','POST',{'_csrf':c['cs_form'],'category':'Fake recruitment','channel':'WhatsApp','summary':summary,'fictional':'yes'},c)
        self.assertEqual(st,303,(st,b));return h['Location']
    def staff_login(self,c,viewer=False):
        self.assertEqual(self.req('/training-admin/login',cookies=c)[0],200)
        pw='viewer-secret-password' if viewer else 'admin-secret-password'
        status,headers,body=self.req('/training-admin/login','POST',{'_csrf':c['cs_form'],'password':pw},c)
        self.assertEqual(status,303,(status,body))
        return c
    def test_public_citizen_page_and_disabled_registration(self):
        app.PUBLIC_MODE=True;app.LOCAL_TRAINING=False
        self.assertEqual(self.req('/service')[0],200)
        self.assertIn('disabled on this public deployment',self.req('/service')[2])
        self.assertEqual(self.req('/service/register')[0],403)
        self.assertEqual(self.req('/service/login','POST')[0],403)
        self.assertEqual(self.req('/service/new','POST')[0],403)
        self.assertEqual(self.req('/service/staff')[0],404)
    def test_nonlocal_disabled_even_if_local_training_flags_on(self):
        self.assertEqual(self.req('/service/register',addr='203.0.113.9')[0],403)
        self.assertEqual(self.req('/service/new','POST',addr='203.0.113.9')[0],403)
    def test_registration_and_case_tracking(self):
        c=self.user()
        self.assertIn('Welcome, Sample Citizen',self.req('/service/cases',cookies=c)[2])
        path=self.create_case(c)
        self.assertRegex(path,r'^/service/case/CS-EVAL-[A-F0-9]{14}$')
        self.assertIn('Fake recruitment',self.req(path,cookies=c)[2])
        self.assertIn('Submitted',self.req(path,cookies=c)[2])
        self.assertIn(path.split('/')[-1],self.req('/service/cases',cookies=c)[2])
        with app.connect_db() as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM cs_pilot_history').fetchone()[0],1)
    def test_requires_valid_csrf(self):
        c={}
        self.req('/service/register',cookies=c)
        self.assertEqual(self.req('/service/register','POST',{'email':'alice@example.com','alias':'Alice','password':'test123456789'},c)[0],403)
        c=self.user()
        self.assertEqual(self.req('/service/new','POST',{'category':'Other','summary':'Fictional incident description with sufficient length.'},c)[0],403)
        self.assertEqual(self.req('/service/logout','POST',{},c)[0],403)
    def test_account_isolation_and_access_controls(self):
        a=self.user('alice@example.com','Alice User');b=self.user('bob@example.com','Bob User')
        path=self.create_case(a)
        self.assertEqual(self.req(path,cookies=b)[0],404)
        self.assertNotIn(path.split('/')[-1],self.req('/service/cases',cookies=b)[2])
        self.assertEqual(self.req(path,cookies={})[0],303)
        self.assertIn('CS-EVAL',path)
    def test_escaped_case_summary(self):
        c=self.user()
        path=self.create_case(c,'A fictional message contains <script>alert(1)</script> and wants a fake fee today.')
        result=self.req(path,cookies=c)[2]
        self.assertIn('&lt;script&gt;alert(1)&lt;/script&gt;',result)
        self.assertNotIn('<script>alert(1)</script>',result)
    def test_real_email_rejected_and_consent_required(self):
        c={};self.req('/service/register',cookies=c)
        st,_,body=self.req('/service/register','POST',{'_csrf':c['cs_form'],'alias':'Alice User','email':'alice@gmail.com','password':'long-enough-password','fictional':'yes'},c)
        self.assertEqual(st,200);self.assertIn('example.com',body)
        self.assertNotIn('cs_portal',c)
        st,_,body=self.req('/service/register','POST',{'_csrf':c['cs_form'],'alias':'Alice User','email':'alice@example.com','password':'long-enough-password'},c)
        self.assertEqual(st,200);self.assertIn('Confirm',body)
    def test_login_logout_and_invalid_credentials(self):
        c=self.user()
        self.req('/service/logout','POST',{'_csrf':c['cs_form']},c)
        self.assertNotIn('cs_portal',c)
        self.assertEqual(self.req('/service/cases',cookies=c)[0],303)
        self.req('/service/login',cookies=c)
        st,_,body=self.req('/service/login','POST',{'_csrf':c['cs_form'],'email':'citizen@example.com','password':'wrong-password'},c)
        self.assertEqual(st,200);self.assertIn('Invalid email or password',body)
        st,h,_=self.req('/service/login','POST',{'_csrf':c['cs_form'],'email':'citizen@example.com','password':'CorrectHorse12345'},c)
        self.assertEqual(st,303);self.assertIn('cs_portal',c)
        self.assertEqual(self.req('/service/cases',cookies=c)[0],200)
    def test_login_rate_limit(self):
        self.user();c={};self.req('/service/login',cookies=c)
        f={'_csrf':c['cs_form'],'email':'citizen@example.com','password':'wrong'}
        for _ in range(5):self.assertEqual(self.req('/service/login','POST',f,c)[0],200)
        self.assertEqual(self.req('/service/login','POST',f,c)[0],429)
    def test_staff_admin_and_viewer_restrictions(self):
        user=self.user();path=self.create_case(user);ref=path.split('/')[-1]
        app.ADMIN_HASH=app.hash_password('admin-secret-password')
        app.VIEWER_HASH=app.hash_password('viewer-secret-password')
        viewer={};self.staff_login(viewer,True)
        self.assertEqual(self.req('/service/staff',cookies=viewer)[0],200)
        self.assertEqual(self.req('/service/staff/'+ref,'POST',{'_csrf':viewer['cs_form'],'status':'Closed'},viewer)[0],403)
        admin={};self.staff_login(admin)
        st,h,b=self.req('/service/staff',cookies=admin)
        self.assertEqual(st,200);self.assertIn(ref,b)
        self.assertEqual(self.req('/service/staff/'+ref,'POST',{'status':'Under review'},admin)[0],403)
        st,h,b=self.req('/service/staff/'+ref,'POST',{'_csrf':admin['cs_form'],'status':'Guidance provided','guidance':'Use the official reporting channel for real incidents.'},admin)
        self.assertEqual(st,303)
        page=self.req(path,cookies=user)[2]
        self.assertIn('Guidance provided',page)
        self.assertIn('Use the official reporting channel',page)
        with app.connect_db() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM cs_pilot_history').fetchone()[0],2)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM stage3_audit WHERE action='pilot_status_change'").fetchone()[0],1)
    def test_server_prevents_real_case_intake_on_hosting(self):
        prior=app.ON_HOSTING
        try:
            app.ON_HOSTING=True
            self.assertEqual(self.req('/service/register')[0],403)
            self.assertEqual(self.req('/service/staff')[0],404)
        finally:app.ON_HOSTING=prior
    def test_session_expiry_and_revocation(self):
        c=self.user();raw=c['cs_portal']
        with app.connect_db() as db:db.execute('UPDATE cs_pilot_sessions SET expires_at=0 WHERE user_id=1')
        self.assertEqual(self.req('/service/cases',cookies=c)[0],303)
        self.assertNotIn('cs_portal',self.req('/service/login',cookies=c)[1].get('Set-Cookie',''))

if __name__=='__main__':unittest.main()
