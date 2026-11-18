"""Read-only browser check of the generated Pages UI against its configured API.

Local compiled assets are served through browser routing at the authorized Pages
origin. API requests use the real network; this check never submits an account,
OTP, complaint, administrative action or mail request.
"""
from pathlib import Path
from urllib.parse import urlsplit
import json
import mimetypes
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'source/site.json').read_text())
PUBLIC = CONFIG['origin'] + CONFIG['base_path']
API = CONFIG['api_url'].rstrip('/')

def asset(route):
    path = urlsplit(route.request.url).path
    relative = path[len(CONFIG['base_path']):].lstrip('/')
    target = (ROOT / 'docs' / relative).resolve()
    if target.is_dir():
        target /= 'index.html'
    if not target.is_relative_to(ROOT / 'docs') or not target.is_file():
        route.fulfill(status=404, body='Not found')
        return
    route.fulfill(status=200, content_type=mimetypes.guess_type(target.name)[0] or 'application/octet-stream', body=target.read_bytes())

def main():
    assert API.startswith('https://'), 'Configure an HTTPS API before running this check'
    observations=[]
    with sync_playwright() as driver:
        browser=driver.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        context=browser.new_context()
        context.route(PUBLIC + '/**', asset)
        for lang in ('en','hi','te'):
            page=context.new_page()
            page.set_viewport_size({'width':390,'height':1000})
            requests=[]
            errors=[]
            page.on('request', lambda request: requests.append((request.method,request.url)))
            page.on('pageerror', lambda error: errors.append(str(error)))
            copy=json.loads((ROOT/f'source/data/ui_{lang}.json').read_text())
            with page.expect_response(API + '/api/v1/health', timeout=30000) as result:
                page.goto(PUBLIC + f'/{lang}/account.html',wait_until='networkidle')
            response=result.value
            data=response.json()['data']
            assert response.status==200
            assert response.headers.get('access-control-allow-origin')==CONFIG['origin']
            assert data['features']=={'registration':False,'emailOtp':False,'complaints':True,'admin':False}, 'Expected closed production email/MFA readiness'
            assert page.locator('#account-service-status').inner_text()==copy['account_mail_closed']
            assert not page.locator('#account-login button[type=submit]').is_enabled()
            assert not page.locator('#account-register button[type=submit]').is_enabled()
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
            assert not errors, errors
            api_requests=[(method,url) for method,url in requests if url.startswith(API)]
            assert all(method=='GET' and url in (API+'/api/v1/health',API+'/api/v1/public/content') for method,url in api_requests)
            observations.append({'language':lang,'status':response.status,'email_forms':'closed','cors':'exact origin','read_only':True})
            page.close()
        browser.close()
    print(json.dumps({'api_readiness':observations}))

if __name__=='__main__':
    main()
