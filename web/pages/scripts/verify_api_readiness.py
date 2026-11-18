"""Read-only browser check of the generated Pages UI against its configured API.

Local compiled assets are served through browser routing at the authorized Pages
origin. API requests use the real network; this check never submits an account,
OTP, complaint, administrative action or mail request.
"""
from pathlib import Path
from urllib.parse import urlsplit
import argparse
import json
import mimetypes
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--config',type=Path,default=ROOT/'source/site.json')
parser.add_argument('--site',type=Path,default=ROOT/'docs')
parser.add_argument('--require-google',action='store_true')
args=parser.parse_args()
SITE=args.site.resolve()
CONFIG=json.loads(args.config.read_text())
PUBLIC = CONFIG['origin'] + CONFIG['base_path']
API = CONFIG['api_url'].rstrip('/')

def asset(route):
    path = urlsplit(route.request.url).path
    relative = path[len(CONFIG['base_path']):].lstrip('/')
    target = (SITE / relative).resolve()
    if target.is_dir():
        target /= 'index.html'
    if not target.is_relative_to(SITE) or not target.is_file():
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
            google_ready=data['features'].get('googleSignIn') is True and data.get('googleClientId')==CONFIG.get('google_client_id')
            if args.require_google: assert google_ready, 'Google configuration is not ready'
            page.locator('#account-service-status').wait_for(state='visible')
            assert page.locator('#account-login button[type=submit]').is_enabled()==bool(data['features'].get('emailOtp'))
            assert page.locator('#account-register button[type=submit]').is_enabled()==bool(data['features'].get('emailOtp') and data['features'].get('registration'))
            assert page.locator('#google-citizen-signin').is_visible()==google_ready
            assert not any(url.startswith('https://accounts.google.com/') for _,url in requests), 'Identity provider must not load before opt-in'
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
            assert not errors, errors
            api_requests=[(method,url) for method,url in requests if url.startswith(API)]
            assert all(method=='GET' and url in (API+'/api/v1/health',API+'/api/v1/public/content') for method,url in api_requests)
            observations.append({'language':lang,'status':response.status,'google_ready':google_ready,'email_ready':data['features'].get('emailOtp',False),'cors':'exact origin','read_only':True})
            page.close()
        browser.close()
    print(json.dumps({'api_readiness':observations}))

if __name__=='__main__':
    main()
