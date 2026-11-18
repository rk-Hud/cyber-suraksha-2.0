"""Repeatable UI acceptance using synthetic API and identity-widget responses.

This checks the real compiled UI in Chromium, not a real Google account login.
Run separate live acceptance with an approved Google test account before release.
"""
from pathlib import Path
from urllib.parse import urlsplit
import json
import mimetypes
import time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT/'source/site.json').read_text())
PUBLIC = CONFIG['origin'] + CONFIG['base_path']
API = 'https://api.example'
CLIENT = CONFIG['google_client_id']
NONCE = 'n' * 43
TOKEN = 't' * 43
GOOGLE = 'https://accounts.google.com/gsi/client'
USER = {'id':'11111111-1234-1234-1234-123456789abc','name':'Fictional Google Citizen','email':'fictional@example.test','role':'citizen','totpEnabled':False}
SDK = '''window.google={accounts:{id:{cancel(){},initialize(options){window.syntheticGoogleOptions=options;},renderButton(host){const button=document.createElement('button');button.type='button';button.textContent='Choose synthetic account';button.addEventListener('click',()=>window.syntheticGoogleOptions.callback({credential:'header.payload.signature'}));host.append(button);}}}};'''

def asset(route):
    relative = urlsplit(route.request.url).path[len(CONFIG['base_path']):].lstrip('/')
    target = (ROOT/'docs'/relative).resolve()
    if target.is_dir(): target /= 'index.html'
    if not target.is_relative_to(ROOT/'docs') or not target.is_file():
        route.fulfill(status=404,body='Not found'); return
    data=target.read_bytes()
    if target.suffix=='.html': data=data.decode().replace(CONFIG['api_url'].rstrip('/'),API).encode()
    route.fulfill(status=200,content_type=mimetypes.guess_type(target.name)[0] or 'application/octet-stream',body=data)

def api(route):
    path=urlsplit(route.request.url).path
    body=route.request.post_data_json if route.request.method=='POST' else None
    if path=='/api/v1/health': data={'status':'ok','features':{'registration':False,'emailOtp':False,'googleSignIn':True,'googleRegistration':True,'complaints':True,'admin':False},'googleClientId':CLIENT}
    elif path=='/api/v1/public/content': data={'sections':[]}
    elif path=='/api/v1/auth/google/challenge': data={'challenge':{'id':'11111111-1234-1234-1234-123456789abc','token':'f'*43,'purpose':'google','nonce':NONCE,'expiresAt':int(time.time())+300}}
    elif path=='/api/v1/auth/google':
        assert body['nonce']==NONCE and body['flowToken']=='f'*43 and body['consent'] is True
        data={'user':USER,'token':TOKEN,'expiresAt':int(time.time())+1800}
    elif path=='/api/v1/cases':
        assert route.request.headers['authorization']=='Bearer '+TOKEN
        data={'cases':[],'pagination':{'page':1,'pages':1}}
    elif path=='/api/v1/auth/logout': data={}
    else: raise AssertionError('Unexpected route '+path)
    route.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':CONFIG['origin']},body=json.dumps({'data':data,'requestId':'syntheticbrowserreference'}))

def main():
    failures=[];results=[]
    with sync_playwright() as driver:
        browser=driver.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        context=browser.new_context()
        context.route(PUBLIC+'/**',asset);context.route(API+'/**',api)
        context.route(GOOGLE,lambda route:route.fulfill(status=200,content_type='application/javascript',body=SDK))
        for lang in ('en','hi','te'):
            for width in (390,768,1440):
                page=context.new_page();page.set_viewport_size({'width':width,'height':1000})
                errors=[];requests=[]
                page.on('pageerror',lambda error:errors.append(type(error).__name__))
                page.on('request',lambda request:requests.append(request.url))
                page.goto(PUBLIC+f'/{lang}/account.html',wait_until='networkidle')
                panel=page.locator('#google-citizen-signin');panel.wait_for(state='visible')
                assert GOOGLE not in requests
                assert not page.locator('#account-login button[type=submit]').is_enabled()
                page.locator('#account-navigation [data-account-view=admin-login]').click()
                assert not panel.is_visible()
                page.locator('#account-navigation [data-account-view=login]').click();panel.wait_for(state='visible')
                page.locator('#google-citizen-consent').check()
                page.get_by_role('button',name='Choose synthetic account').click()
                page.locator('[data-account-panel=cases]').wait_for(state='visible')
                assert page.locator('#signed-in-identity').inner_text().endswith(USER['name'])
                assert not panel.is_visible()
                assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
                assert not any('/api/v1/admin' in url for url in requests)
                failures.extend(f'{lang}:{width}:{error}' for error in errors)
                results.append({'language':lang,'width':width,'citizen_flow':'passed','owner_google_hidden':True,'console_errors':len(errors)})
                page.close()
        browser.close()
    assert not failures,failures
    print(json.dumps({'mode':'synthetic API and identity widget, not live Google login','checks':results}))

if __name__=='__main__': main()
