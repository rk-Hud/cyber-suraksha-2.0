"""Optional real-browser smoke test; API responses use synthetic data only."""
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import mimetypes
import re
import time
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = '/cyber-suraksha-2.0'
API = 'https://api.example'
TOKEN = 't' * 43
USER = {'id':'11111111-1234-1234-1234-123456789abc','name':'Browser Citizen','email':'browser@example.com','role':'citizen','totpEnabled':False}

class StaticHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        if not path.startswith(BASE + '/'):
            self.send_error(404)
            return
        target = (ROOT / 'docs' / path[len(BASE)+1:]).resolve()
        if target.is_dir():
            target /= 'index.html'
        if not target.is_relative_to(ROOT / 'docs') or not target.is_file():
            self.send_error(404)
            return
        body = target.read_bytes()
        if target.suffix == '.html':
            text = re.sub(r'data-api-url="[^"]*"', f'data-api-url="{API}"', body.decode())
            body = re.sub(r'connect-src [^;]+;', f"connect-src &#39;self&#39; {API};", text).encode()
        self.send_response(200)
        self.send_header('Content-Type', mimetypes.guess_type(target.name)[0] or 'application/octet-stream')
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *_args):
        pass

@contextmanager
def local_server():
    server = ThreadingHTTPServer(('127.0.0.1', 0), StaticHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{server.server_port}{BASE}'
    finally:
        server.shutdown()
        server.server_close()

def api_response(route):
    path = urlsplit(route.request.url).path
    if path == '/api/v1/health':
        data = {'status':'ok','features':{'registration':True,'emailOtp':True,'complaints':True,'admin':True}}
    elif path == '/api/v1/public/content':
        data = {'sections':[]}
    elif path == '/api/v1/auth/login':
        data = {'challenge':{'id':'12345678-1234-1234-1234-123456789abc','token':'f'*43,'purpose':'login','expiresAt':time.time()+300}}
    elif path == '/api/v1/auth/verify':
        data = {'token':TOKEN,'expiresAt':time.time()+3600,'user':USER}
    elif path == '/api/v1/cases':
        data = {'cases':[],'pagination':{'page':1,'pages':1}}
    else:
        raise AssertionError('Unexpected route '+path)
    route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin':'*'}, body=json.dumps({'data':data,'requestId':'browserreference01'}))

def main():
    failures=[]
    artifacts=ROOT/'browser-artifacts'
    artifacts.mkdir(exist_ok=True)
    with local_server() as address, sync_playwright() as driver:
        browser=driver.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        context=browser.new_context()
        context.route(API+'/**', api_response)
        for lang in ('en','hi','te'):
            for width in (390,768,1440):
                page=context.new_page()
                page.set_viewport_size({'width':width,'height':1000})
                errors=[]
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(f'{address}/{lang}/account.html', wait_until='networkidle')
                page.locator('#account-login button[type=submit]').wait_for(state='visible')
                assert page.locator('#account-login button[type=submit]').is_enabled()
                for view in ('login','register'):
                    if view=='register':
                        page.locator('#account-navigation [data-account-view=register]').click()
                    overflow=page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
                    if overflow:
                        failures.append(f'{lang}:{width}:{view}:horizontal overflow')
                page.locator('#account-navigation [data-account-view=login]').click()
                page.locator('#login-email').fill(USER['email'])
                page.locator('#login-password').fill('BrowserPassword!2026')
                page.locator('#account-login button[type=submit]').click()
                page.locator('#verify-code').fill('123456')
                page.locator('#account-verify button[type=submit]').click()
                page.locator('[data-account-panel=cases]').wait_for(state='visible')
                page.locator('#account-navigation [data-account-view=new-case]').click()
                assert page.locator('#account-new-case').is_visible()
                if page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'):
                    failures.append(f'{lang}:{width}:new-case:horizontal overflow')
                if width in (390,1440):
                    page.screenshot(path=str(artifacts/f'{lang}-{width}-account.png'),full_page=True)
                failures.extend(f'{lang}:{width}:{error}' for error in errors)
                page.close()
        browser.close()
    assert not failures, '\n'.join(failures)
    print(json.dumps({'languages':3,'viewport_widths':[390,768,1440],'views':['login','register','email OTP','cases','new case'],'console_errors':0,'horizontal_overflow':0}))

if __name__=='__main__':
    main()
