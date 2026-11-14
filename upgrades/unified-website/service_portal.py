"""Local-only citizen-services evaluation workflow for CYBER SURAKSHA 2.0.

Independent project. Fictional cases only. Not government complaint intake.
Public hosting is strictly read-only: registration, sign-in and submissions disabled.
"""
from __future__ import annotations
import hashlib
import hmac
import re
import secrets
import sqlite3
import time
from urllib.parse import quote

CATEGORIES = ('Phishing / fake link','UPI / payment fraud','Fake recruitment','Account compromise','Impersonation','Other')
CHANNELS = ('SMS','WhatsApp','Email','Phone call','Website','Social media','UPI app','Other')
STATUSES = ('Submitted','Under review','Guidance provided','Closed')
AUTH_FAILURES = {}
RATE_WINDOW = 15*60
SESSION_DURATION = 60*60


def initialize(core):
    with core.connect_db() as db:
        db.execute('''CREATE TABLE IF NOT EXISTS cs_pilot_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            alias TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL, created_at TEXT NOT NULL)''')
        db.execute('''CREATE TABLE IF NOT EXISTS cs_pilot_sessions (
            token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
            expires_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES cs_pilot_users(id))''')
        db.execute('''CREATE TABLE IF NOT EXISTS cs_pilot_cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT UNIQUE NOT NULL,
            user_id INTEGER NOT NULL, category TEXT NOT NULL,
            channel TEXT NOT NULL, summary TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Submitted',
            guidance TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL, is_fictional INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY(user_id) REFERENCES cs_pilot_users(id))''')
        db.execute('''CREATE TABLE IF NOT EXISTS cs_pilot_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER NOT NULL,
            created_at TEXT NOT NULL, actor TEXT NOT NULL,
            status TEXT NOT NULL, detail TEXT NOT NULL,
            FOREIGN KEY(case_id) REFERENCES cs_pilot_cases(id))''')
        db.execute('CREATE INDEX IF NOT EXISTS cs_pilot_cases_user_id ON cs_pilot_cases(user_id)')
        db.execute('CREATE INDEX IF NOT EXISTS cs_pilot_history_case_id ON cs_pilot_history(case_id)')


def _cookie(core,env,token,max_age=SESSION_DURATION):
    secure='; Secure' if env.get('wsgi.url_scheme')=='https' else ''
    return ('Set-Cookie',f'cs_portal={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={max_age}{secure}')


def _session(core,env):
    raw=core._cookie(env,'cs_portal')
    if len(raw)!=64 or not all(c in '0123456789abcdef' for c in raw):return None
    hashed=hashlib.sha256(raw.encode()).hexdigest()
    with core.connect_db() as db:
        row=db.execute('''SELECT u.id,u.alias,u.email FROM cs_pilot_sessions s
        JOIN cs_pilot_users u ON s.user_id=u.id
        WHERE s.token_hash=? AND s.expires_at>?''',(hashed,int(time.time()))).fetchone()
    return dict(row) if row else None


def _issue(core,env,userid):
    raw=secrets.token_hex(32)
    hashed=hashlib.sha256(raw.encode()).hexdigest()
    with core.connect_db() as db:
        db.execute('DELETE FROM cs_pilot_sessions WHERE user_id=? OR expires_at<?',(userid,int(time.time())))
        db.execute('INSERT INTO cs_pilot_sessions(token_hash,user_id,expires_at) VALUES (?,?,?)',(hashed,userid,int(time.time())+SESSION_DURATION))
    return _cookie(core,env,raw)


def _revoke(core,env):
    raw=core._cookie(env,'cs_portal')
    if raw:
        with core.connect_db() as db:db.execute('DELETE FROM cs_pilot_sessions WHERE token_hash=?',(hashlib.sha256(raw.encode()).hexdigest(),))


def _page(core,body,title,status=200,headers=None):
    return core.response(status,core.nav_page(body,title),headers=headers)


def _notice():
    return '''<div class="ops-note" role="status"><strong>Controlled evaluation environment — fictional records only.</strong>
    This is the official website of the independent CYBER SURAKSHA initiative, <strong>not</strong> an official Government of India, FBI or police reporting portal.
    Do not enter real names, contact information, bank details, OTPs, passwords or victim evidence.
    Actual Indian cybercrime complaints: <a href="https://cybercrime.gov.in/" target="_blank" rel="noopener noreferrer">cybercrime.gov.in</a>.
    Financial fraud: call <a href="tel:1930">1930</a> and your bank. U.S. reports: <a href="https://www.ic3.gov/" target="_blank" rel="noopener noreferrer">ic3.gov</a>.</div>'''


def _account_links(core,user):
    if user:
        return '<div class="ops-actions"><a class="btn btn-primary" href="/service/new">Raise a fictional case</a><a class="btn btn-outline" href="/service/cases">My cases</a></div>'
    return '<div class="ops-actions"><a class="btn btn-primary" href="/service/register">Create evaluation account</a><a class="btn btn-outline" href="/service/login">Log in</a></div>'


def _home(core,env):
    user=_session(core,env) if core.writable(env) else None
    head=core.h1('Citizen services','One secure workflow for account access, fictional case registration, status tracking and authorized review.','CYBER SURAKSHA 2.0 · CITIZEN SERVICE CENTRE')
    n=_notice()
    if not core.writable(env):
        return _page(core,head+n+'''<div class="ops-panel"><h2>Independent service evaluation</h2><p>This site offers public fraud-prevention guidance. Account creation, case submissions and staff case processing are disabled on this public deployment until an independent security review and authorization.</p><a href="/response.html" class="btn btn-primary">Get official reporting guidance</a></div>''','Citizen services')
    return _page(core,head+n+_account_links(core,user)+'''<section class="ops-grid">
       <div class="ops-card"><span class="ops-pill">Step 01</span><h2>Account access</h2><p>Register using a fictional <code>@example.com</code> address and a strong password. Passwords are hashed, not stored as plain text.</p></div>
       <div class="ops-card"><span class="ops-pill">Step 02</span><h2>Raise a case</h2><p>Enter a synthetic scenario and receive a unique CYBER SURAKSHA evaluation reference number.</p></div>
       <div class="ops-card"><span class="ops-pill">Step 03</span><h2>Track progress</h2><p>Sign in to view only your cases and any training guidance added by an authorized local operator.</p></div></section>''','Citizen services')


def _register_form(core,env,error=''):
    tok,headers=core.new_csrf(env)
    b=core.h1('Create your evaluation account','Register for the locally hosted case-workflow evaluation. No SMS OTP or email verification is provided.','REGISTER · LOCAL EVALUATION')+_notice()
    if error:b+=f'<div class="ops-error" role="alert">{core.esc(error)}</div>'
    b+=core.get_form('POST','/service/register',core.field('alias','Fictional display name')+core.field('email','Reserved example email (e.g. citizen@example.com)',kind='email')+core.field('password','Password — minimum 12 characters',kind='password')+'<label class="ops-choice"><input type="checkbox" name="fictional" value="yes" required> I will use fictional information and understand this is not a government complaint submission.</label>'+core.action('Create account'),tok)
    b+='<p class="ops-copy">Already have an account? <a href="/service/login">Log in</a>.</p>'
    return _page(core,b,'Create account',headers=headers)


def _login_form(core,env,error=''):
    tok,headers=core.new_csrf(env)
    b=core.h1('Citizen login','Access your personal case dashboard. Evaluation accounts are local to this device.','SECURE EVALUATION ACCESS')+_notice()
    if error:b+=f'<div class="ops-error" role="alert">{core.esc(error)}</div>'
    b+=core.get_form('POST','/service/login',core.field('email','Email',kind='email')+core.field('password','Password',kind='password')+core.action('Sign in'),tok)
    b+='<p class="ops-copy"><a href="/service/register">Create an evaluation account</a>. Password resets and email/SMS verification are not implemented; do not reuse real account passwords.</p>'
    return _page(core,b,'Citizen login',headers=headers)


def _dashboard(core,env,user):
    with core.connect_db() as db:
        rows=db.execute('SELECT reference,category,status,created_at FROM cs_pilot_cases WHERE user_id=? ORDER BY id DESC',(user['id'],)).fetchall()
    cards=''.join(f'<tr><td><a href="/service/case/{core.esc(r["reference"])}">{core.esc(r["reference"])}</a></td><td>{core.esc(r["category"])}</td><td>{core.esc(r["status"])}</td><td>{core.esc(r["created_at"][:10])}</td></tr>' for r in rows)
    tok,headers=core.new_csrf(env)
    b=core.h1(f'Welcome, {user["alias"]}','Your private fictional case history, training status and guidance.','MY ACCOUNT')+_notice()
    b+='<div class="ops-actions"><a class="btn btn-primary" href="/service/new">Raise a fictional case</a><a class="btn btn-outline" href="/service">How it works</a></div>'
    b+='<div class="ops-panel"><h2>My case history</h2><div class="ops-tablewrap"><table class="ops-table"><thead><tr><th>Reference</th><th>Category</th><th>Status</th><th>Date (UTC)</th></tr></thead><tbody>'+(cards or '<tr><td colspan="4">No cases submitted yet.</td></tr>')+'</tbody></table></div></div>'
    b+=core.get_form('POST','/service/logout',core.action('Log out'),tok)
    return _page(core,b,'My cases',headers=headers)


def _new_form(core,env,error=''):
    tok,headers=core.new_csrf(env)
    b=core.h1('Raise a fictional case','Submit a synthetic exercise to the independent CYBER SURAKSHA evaluation workflow.','CITIZEN SERVICES · CASE INTAKE')+_notice()
    if error:b+=f'<div class="ops-error" role="alert">{core.esc(error)}</div>'
    b+=core.get_form('POST','/service/new',core.sel('category','Case category',CATEGORIES)+core.sel('channel','Channel',CHANNELS)+core.txt('summary','Describe the fictional incident in 30–1000 characters. No private details.',1000)+'''<label class="ops-choice"><input type="checkbox" name="fictional" value="yes" required> This is a fictional scenario created for evaluating the service workflow, not a real police complaint.</label>'''+core.action('Submit fictional case'),tok)
    return _page(core,b,'Raise a case',headers=headers)


def _case_detail(core,env,user,ref):
    with core.connect_db() as db:
        row=db.execute('SELECT * FROM cs_pilot_cases WHERE reference=? AND user_id=?',(ref,user['id'])).fetchone()
        if not row:return core.bad(404,'Case not found.')
        history=db.execute('SELECT created_at,actor,status,detail FROM cs_pilot_history WHERE case_id=? ORDER BY id',(row['id'],)).fetchall()
    b=core.h1('Case '+row['reference'],'Local training case · not a police acknowledgement or FIR.','TRACK A CASE')+_notice()
    b+='<div class="ops-panel"><h2>Case status: '+core.esc(row['status'])+'</h2>'
    b+='<p><strong>Category:</strong> '+core.esc(row['category'])+' · <strong>Channel:</strong> '+core.esc(row['channel'])+'</p><p class="ops-copy"><strong>Fictional description:</strong><br>'+core.esc(row['summary'])+'</p>'
    if row['guidance']:b+='<div class="ops-alert"><strong>Review guidance:</strong> '+core.esc(row['guidance'])+'</div>'
    b+='</div><div class="ops-panel"><h2>Local audit timeline</h2><ol class="ops-timeline">'
    for r in history:b+='<li><strong>'+core.esc(r['status'])+'</strong> · '+core.esc(r['created_at'])+' UTC<br>'+core.esc(r['detail'])+'</li>'
    b+='</ol></div><a class="btn btn-outline" href="/service/cases">Back to my cases</a>'
    return _page(core,b,'Case details')


def _staff(core,env,error=''):
    if not (core.writable(env) and core.ADMIN_HASH):return core.bad(404,'Local staff operations unavailable.')
    sess=core.get_sess(env)
    if not sess:return core.redirect('/training-admin/login')
    tok,headers=core.new_csrf(env)
    with core.connect_db() as db:
        rows=db.execute('SELECT reference,category,channel,status,summary,guidance,created_at FROM cs_pilot_cases ORDER BY id DESC LIMIT 100').fetchall()
    b=core.h1('Citizen services · staff review','Restricted local operator workflow for fictional cases only. Role-based case handling and audit history.','INDEPENDENT PLATFORM · STAFF OPERATIONS')+_notice()
    if error:b+='<div class="ops-error" role="alert">'+core.esc(error)+'</div>'
    b+='<p class="ops-copy">Signed in as <strong>'+core.esc(sess['role'])+'</strong>. Viewer cannot update cases. No cases are forwarded to police, government departments or the FBI.</p>'
    for r in rows:
        b+='<div class="ops-panel"><div class="ops-status"><h2>'+core.esc(r['reference'])+'</h2><span class="ops-pill">'+core.esc(r['status'])+'</span></div><p>'+core.esc(r['category'])+' · '+core.esc(r['channel'])+' · '+core.esc(r['created_at'][:10])+'</p><p class="ops-copy">'+core.esc(r['summary'])+'</p>'
        if sess['role']=='admin':
            b+=core.get_form('POST','/service/staff/'+quote(r['reference']),core.sel('status','Update status',STATUSES,r['status'])+'''<label class="ops-label">General training guidance (max 300 characters)<textarea name="guidance" maxlength="300">'''+core.esc(r['guidance'])+'</textarea></label>'+core.action('Save status and guidance'),tok)
        else:b+='<p>Viewer access — read only.</p>'
        b+='</div>'
    if not rows:b+='<div class="ops-panel">No fictional citizen cases have been raised yet.</div>'
    return _page(core,b,'Staff case review',headers=headers)


def _limit_key(env,email):return ((env.get('REMOTE_ADDR') or '')[:64],email)


def handle(core,path,method,env,form):
    # Site must never accept public/private case submission on Render or another hosting provider.
    active=core.writable(env)
    if path=='/service' and method=='GET':return _home(core,env)
    if path.startswith('/service/staff'):
        if not active:return core.bad(404,'Staff operations unavailable')
        if path=='/service/staff' and method=='GET':return _staff(core,env)
        if method=='POST' and path.startswith('/service/staff/'):
            sess=core.get_sess(env)
            if not sess or sess.get('role')!='admin':return core.bad(403,'Staff administrator permission required')
            if not core.csrf(env,form):return core.bad(403,'Invalid security token')
            status=form.get('status','')
            guidance=form.get('guidance','').strip()
            if status not in STATUSES or len(guidance)>300:return core.bad(400,'Invalid status or guidance')
            ref=path.split('/')[-1]
            with core.connect_db() as db:
                case=db.execute('SELECT id FROM cs_pilot_cases WHERE reference=? AND is_fictional=1',(ref,)).fetchone()
                if not case:return core.bad(404,'Case not found')
                db.execute('UPDATE cs_pilot_cases SET status=?,guidance=?,updated_at=? WHERE id=?',(status,guidance,core.utc(),case['id']))
                db.execute('INSERT INTO cs_pilot_history(case_id,created_at,actor,status,detail) VALUES (?,?,?,?,?)',(case['id'],core.utc(),'Local staff',status,'Training case updated'))
            core.audit('admin','pilot_status_change',ref,'Fictional case workflow')
            return core.redirect('/service/staff')
        return core.bad(404,'Staff route not found')
    if not active:return core.bad(403,'Account registration and case submission are disabled on public deployment')
    user=_session(core,env)
    if path=='/service/register':
        if method=='GET':return core.redirect('/service/cases') if user else _register_form(core,env)
        if method=='POST':
            if not core.csrf(env,form):return core.bad(403,'Invalid security token')
            alias=form.get('alias','').strip();email=form.get('email','').strip().lower();password=form.get('password','')
            if not (1<=len(alias)<=50 and re.fullmatch(r'[A-Za-z ]+',alias)):return _register_form(core,env,'Use a fictional display name with letters and spaces only.')
            if not re.fullmatch(r'[a-z0-9._+-]{1,48}@(example\.com|example\.org|example\.net)',email):return _register_form(core,env,'Use an example.com, example.org or example.net address only (fictional accounts).')
            if len(password)<12 or len(password)>128:return _register_form(core,env,'Use a password between 12 and 128 characters.')
            if form.get('fictional')!='yes':return _register_form(core,env,'Confirm that you will use fictional data only.')
            try:
                with core.connect_db() as db:
                    cur=db.execute('INSERT INTO cs_pilot_users(alias,email,password_hash,created_at) VALUES (?,?,?,?)',(alias,email,core.hash_password(password),core.utc()))
                    userid=cur.lastrowid
            except sqlite3.IntegrityError:return _register_form(core,env,'This example address is already registered on this device.')
            return core.redirect('/service/cases',[_issue(core,env,userid)])
    if path=='/service/login':
        if method=='GET':return core.redirect('/service/cases') if user else _login_form(core,env)
        if method=='POST':
            if not core.csrf(env,form):return core.bad(403,'Invalid security token')
            email=form.get('email','').strip().lower();password=form.get('password','')
            if len(email)>90 or len(password)>128:return _login_form(core,env,'Invalid email or password')
            key=_limit_key(env,email);now=time.monotonic()
            hits=[x for x in AUTH_FAILURES.get(key,[]) if now-x<RATE_WINDOW]
            if len(hits)>=5:return core.bad(429,'Too many login attempts; try later')
            with core.connect_db() as db:row=db.execute('SELECT id,password_hash FROM cs_pilot_users WHERE email=?',(email,)).fetchone()
            if not row or not core.verify_password(password,row['password_hash']):
                hits.append(now);AUTH_FAILURES[key]=hits
                return _login_form(core,env,'Invalid email or password')
            AUTH_FAILURES.pop(key,None)
            return core.redirect('/service/cases',[_issue(core,env,row['id'])])
    if path=='/service/logout' and method=='POST':
        if not core.csrf(env,form):return core.bad(403,'Invalid security token')
        _revoke(core,env)
        return core.redirect('/service',[_cookie(core,env,'',0)])
    if not user:return core.redirect('/service/login')
    if path=='/service/cases' and method=='GET':return _dashboard(core,env,user)
    if path=='/service/new':
        if method=='GET':return _new_form(core,env)
        if method=='POST':
            if not core.csrf(env,form):return core.bad(403,'Invalid security token')
            category=form.get('category','');channel=form.get('channel','');summary=form.get('summary','').strip()
            if category not in CATEGORIES or channel not in CHANNELS or not 30<=len(summary)<=1000:return _new_form(core,env,'Select a valid category and provide a fictional description of 30–1000 characters.')
            if form.get('fictional')!='yes':return _new_form(core,env,'Please confirm that this is fictional training data.')
            reference='CS-EVAL-'+secrets.token_hex(7).upper()
            with core.connect_db() as db:
                cur=db.execute('''INSERT INTO cs_pilot_cases(reference,user_id,category,channel,summary,status,created_at,updated_at,is_fictional)
                       VALUES (?,?,?,?,?,'Submitted',?,?,1)''',(reference,user['id'],category,channel,summary,core.utc(),core.utc()))
                db.execute('INSERT INTO cs_pilot_history(case_id,created_at,actor,status,detail) VALUES (?,?,?,?,?)',(cur.lastrowid,core.utc(),'Citizen (fictional)','Submitted','Fictional evaluation case received by CYBER SURAKSHA only.'))
            return core.redirect('/service/case/'+quote(reference))
    if path.startswith('/service/case/') and method=='GET':
        ref=path[len('/service/case/'):]
        if len(ref)>40 or not re.fullmatch(r'CS-EVAL-[A-F0-9]{14}',ref):return core.bad(404,'Case not found')
        return _case_detail(core,env,user,ref)
    return core.bad(404,'Citizen services route not found')
