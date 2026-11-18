"""Check the real Google widget against compiled CSP with a synthetic API.

This contacts Google's public identity script after opt-in, but neither signs in
an account nor proves the backend accepted a real Google credential.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
import browser_google_smoke as synthetic

ROOT=Path(__file__).resolve().parents[1]

def main():
    results=[]
    with sync_playwright() as driver:
        browser=driver.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        context=browser.new_context()
        context.route(synthetic.PUBLIC+'/**',synthetic.asset)
        context.route(synthetic.API+'/**',synthetic.api)
        for language in ('en','hi','te'):
            for width in (390,1440):
                page=context.new_page();page.set_viewport_size({'width':width,'height':1000})
                page.add_init_script("window.identityPolicyViolations=[];document.addEventListener('securitypolicyviolation',event=>window.identityPolicyViolations.push({directive:event.effectiveDirective,blocked:event.blockedURI==='inline'?'inline':event.blockedURI.split('?')[0]}));")
                errors=[];requests=[]
                page.on('pageerror',lambda error:errors.append(type(error).__name__))
                page.on('request',lambda request:requests.append(request.url))
                page.goto(synthetic.PUBLIC+f'/{language}/account.html',wait_until='networkidle')
                page.locator('#google-citizen-signin').wait_for(state='visible')
                assert not any(url.startswith('https://accounts.google.com/') for url in requests)
                page.locator('#google-citizen-consent').check()
                page.wait_for_selector('#google-signin-button iframe',timeout=30000)
                page.wait_for_timeout(1200)
                violations=page.evaluate('window.identityPolicyViolations')
                assert not violations,violations
                assert not errors,errors
                assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
                assert not any('/api/v1/auth/google?' in url for url in requests)
                results.append({'language':language,'width':width,'widget_frame':True,'csp_violations':0,'page_errors':0,'live_login_performed':False})
                page.close()
        browser.close()
    report={'mode':'real Google widget, synthetic API challenge; no account login','checks':results}
    target=ROOT/'browser-artifacts';target.mkdir(exist_ok=True)
    (target/'google-widget-report.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report))

if __name__=='__main__':main()
