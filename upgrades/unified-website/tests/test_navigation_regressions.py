"""Regressions observed on the citizen services and security operations pages."""
import io
import os
import sys
import unittest
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('CS_PUBLIC_MODE','1')
import app
class NavigationRegressions(unittest.TestCase):
    def setUp(self):
        self.original=(app.PUBLIC_MODE,app.LOCAL_TRAINING,app.ADMIN_HASH)
    def tearDown(self):
        app.PUBLIC_MODE,app.LOCAL_TRAINING,app.ADMIN_HASH=self.original
    def req(self,route):
        result={}
        def start(status,headers):
            result['status']=int(status.split()[0]);result['headers']=dict(headers)
        env={'PATH_INFO':route,'REQUEST_METHOD':'GET','QUERY_STRING':'','REMOTE_ADDR':'127.0.0.1','SERVER_NAME':'127.0.0.1','SERVER_PORT':'8080','HTTP_HOST':'127.0.0.1:8080','wsgi.url_scheme':'http','wsgi.input':io.BytesIO(b''),'CONTENT_LENGTH':'0'}
        body=b''.join(app.application(env,start)).decode('utf-8')
        return result['status'],body
    def test_operations_navigation_has_local_service_link(self):
        status,page=self.req('/operations.html')
        self.assertEqual(status,200)
        self.assertIn('href="/service"',page)
        self.assertNotIn('href="//service"',page)
    def test_citizen_services_landing_is_available(self):
        self.assertEqual(self.req('/service')[0],200)
    def test_public_operation_does_not_link_to_admin_login(self):
        app.PUBLIC_MODE=True;app.LOCAL_TRAINING=False
        status,page=self.req('/operations.html')
        self.assertEqual(status,200)
        self.assertNotIn('href="/training-admin',page)
        self.assertIn('Restricted operator tool',page)
        self.assertEqual(self.req('/training-admin')[0],404)
    def test_local_plain_server_explains_admin_launcher(self):
        app.PUBLIC_MODE=False;app.LOCAL_TRAINING=True;app.ADMIN_HASH=''
        page=self.req('/operations.html')[1]
        self.assertIn('START_SECURE_ADMIN_WINDOWS.bat',page)
        self.assertNotIn('href="/training-admin/login"',page)
    def test_local_configured_admin_link_is_available(self):
        app.PUBLIC_MODE=False;app.LOCAL_TRAINING=True;app.ADMIN_HASH=app.hash_password('a-local-password-1234')
        page=self.req('/operations.html')[1]
        self.assertIn('href="/training-admin/login"',page)
        self.assertEqual(self.req('/training-admin/login')[0],200)
