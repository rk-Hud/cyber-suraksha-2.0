"""Fictional citizen-services evaluation workflow for CYBER SURAKSHA 2.0.

Independent project; no government complaint intake. On hosting, only an explicit
CS_HOSTED_DEMO=1 enables short-lived synthetic account/case workflows.
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
LOGIN_PURPOSES = ('Learn cyber safety','Raise a fictional case','Track my fictional case','Explore training features')
CASE_PURPOSES = ('Practice fictional reporting','Learn fraud prevention','Explore review workflow')
# Public demo cannot save user-entered incident narratives or staff notes.
DEMO_SCENARIOS = {
    'Fake KYC reminder (fictional SMS)': ('Phishing / fake link', 'SMS', 'Fictional bank KYC update message asks a training user to open an imitation website.'),
    'UPI refund trick (fictional app)': ('UPI / payment fraud', 'UPI app', 'Fictional caller asks a training user to enter a PIN to receive an imaginary refund.'),
    'Job offer fee (fictional chat)': ('Fake recruitment', 'WhatsApp', 'Fictional job recruiter requests an imaginary registration fee before an interview.'),
    'Account code request (fictional email)': ('Account compromise', 'Email', 'Fictional email asks a training user to reveal a made-up one-time account code.'),
}
DEMO_GUIDANCE = (
    'Demo guidance: Never share passwords, PINs or verification codes.',
    'Demo guidance: Verify requests using the official company website.',
    'Demo guidance: For a real financial fraud, contact your bank and 1930.',
    'Demo guidance: Treat unexpected payment requests as suspicious.',
)
STAFF_AUTH_FAILURES = {}
MAX_DEMO_USERS = 50
MAX_DEMO_CASES_PER_USER = 10
MAX_DEMO_CASES_TOTAL = 300
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
        db.execute('''CREATE TABLE IF NOT EXISTS cs_pilot_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            event_time TEXT NOT NULL,
            action TEXT NOT NULL,
            purpose TEXT NOT NULL DEFAULT '',
            case_ref TEXT NOT NULL DEFAULT '',
            performed_by TEXT NOT NULL DEFAULT '',
            FOREIGN KEY(user_id) REFERENCES cs_pilot_users(id))''')
        db.execute('CREATE INDEX IF NOT EXISTS cs_pilot_activity_user ON cs_pilot_activity(user_id)')


def _activity(core,user_id,action,purpose='',case_ref='',performed_by='Fictional citizen'):
    # Explicit form and case actions only; no hidden pageview / keystroke surveillance.
    with core.connect_db() as db:
        db.execute('INSERT INTO cs_pilot_activity(user_id,event_time,action,purpose,case_ref,performed_by) VALUES (?,?,?,?,?,?)',
                   (user_id,core.utc(),action,purpose,case_ref,performed_by))
        # Bounded retention for this temporary synthetic-data demonstration.
        db.execute('DELETE FROM cs_pilot_activity WHERE id NOT IN (SELECT id FROM cs_pilot_activity ORDER BY id DESC LIMIT 1000)')


def _staff_name(core,env):
    if core.HOSTED_DEMO:
        return core.get_sess(env,'cs_demo_staff').get('name','Demo operator (unverified)')
    return 'Local administrator role (no individual identity verification)'


def _cookie(core,env,token,max_age=SESSION_DURATION):
    secure='; Secure' if core.ON_HOSTING or env.get('wsgi.url_scheme')=='https' else ''
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
    Use a fictional name and a reserved example-domain email, not a real Gmail address. Do not enter real names, contact information, bank details, OTPs, passwords or victim evidence.
    Your fictional alias, example email, selected purpose, submitted training scenarios and case-update activity are visible only to the password-protected staff review panel; temporary hosted data is not permanent. This does not use Google sign-in.
    Actual Indian cybercrime complaints: <a href="https://cybercrime.gov.in/" target="_blank" rel="noopener noreferrer">cybercrime.gov.in</a>.
    Financial fraud: call <a href="tel:1930">1930</a> and your bank. U.S. reports: <a href="https://www.ic3.gov/" target="_blank" rel="noopener noreferrer">ic3.gov</a>.</div>'''


def _staff_role(core,env):
    if core.writable(env):
        return core.get_sess(env).get('role', '')
    if core.HOSTED_DEMO and core.DEMO_ADMIN_HASH:
        return core.get_sess(env, 'cs_demo_staff').get('role', '')
    return ''


def _demo_staff_login(core,env,error=''):
    if not (core.HOSTED_DEMO and core.DEMO_ADMIN_HASH):return core.bad(404,'Demo staff login is not configured.')
    if _staff_role(core,env):return core.redirect('/service/staff')
    tok,headers=core.new_csrf(env)
    b=core.h1('Demo staff login','Restricted staff training area. Only fictional scenario cases can be reviewed.','CYBER SURAKSHA 2.0 · DEMO STAFF')+_notice()
    if error:b+='<div class="ops-error" role="alert">'+core.esc(error)+'</div>'
    b+=core.get_form('POST','/service/staff/login',core.field('operator','Fictional staff display name')+core.field('password','Demo operator password',kind='password')+core.action('Sign in as demo staff'),tok)
    return _page(core,b,'Demo staff login',headers=headers)


def _demo_staff_auth(core,env,form):
    if not core.csrf(env,form):return core.bad(403,'Invalid security token')
    ip=(env.get('REMOTE_ADDR') or '')[:64]
    now=time.monotonic()
    hits=[x for x in STAFF_AUTH_FAILURES.get(ip,[]) if now-x<RATE_WINDOW]
    if len(hits)>=5:return core.bad(429,'Too many staff login attempts; try later')
    operator=form.get('operator','Demo operator').strip()
    if not re.fullmatch(r'[A-Za-z][A-Za-z ]{0,49}',operator):
        return _demo_staff_login(core,env,'Use a fictional staff name containing letters and spaces only.')
    if not core.verify_password(form.get('password',''),core.DEMO_ADMIN_HASH):
        hits.append(now);STAFF_AUTH_FAILURES[ip]=hits
        return _demo_staff_login(core,env,'Incorrect demo staff password')
    STAFF_AUTH_FAILURES.pop(ip,None)
    token=core.encode_sess({'role':'admin','time':int(time.time()),'name':operator})
    secure='; Secure' if core.ON_HOSTING else ''
    header=('Set-Cookie',f'cs_demo_staff={token}; Path=/service; HttpOnly; SameSite=Strict; Max-Age=900{secure}')
    return core.redirect('/service/staff',[header])


def _account_links(core,user):
    if user:
        return '<div class="ops-actions"><a class="btn btn-primary" href="/service/new">Raise a fictional case</a><a class="btn btn-outline" href="/service/cases">My cases</a></div>'
    return '<div class="ops-actions"><a class="btn btn-primary" href="/service/register">Create evaluation account</a><a class="btn btn-outline" href="/service/login">Log in</a></div>'


def _home(core,env):
    user=_session(core,env) if core.citizen_demo_enabled(env) else None
    head=core.h1('Citizen services','One secure workflow for account access, fictional case registration, status tracking and authorized review.','CYBER SURAKSHA 2.0 · CITIZEN SERVICE CENTRE')
    n=_notice()
    if not core.citizen_demo_enabled(env):
        return _page(core,head+n+'''<div class="ops-panel"><h2>Independent service evaluation</h2><p>This site offers public fraud-prevention guidance. Account creation, case submissions and staff case processing are disabled on this public deployment until an independent security review and authorization.</p><a href="/response.html" class="btn btn-primary">Get official reporting guidance</a></div>''','Citizen services')
    return _page(core,head+n+('''<div class="ops-alert"><strong>Online demonstration only.</strong> Use fictional aliases and example.com addresses. Only preset training scenarios can be submitted. Accounts and case progress will be erased when this free hosting service restarts or sleeps. This is not a government complaint portal.</div>''' if core.HOSTED_DEMO else '')+_account_links(core,user)+('''<div class="ops-actions"><a class="btn btn-outline" href="/service/staff/login">Demo staff sign-in</a></div>''' if core.HOSTED_DEMO and core.DEMO_ADMIN_HASH else '')+'''<section class="ops-grid">
       <div class="ops-card"><span class="ops-pill">Step 01</span><h2>Account access</h2><p>Register using a fictional <code>@example.com</code> address and a strong password. Passwords are hashed, not stored as plain text.</p></div>
       <div class="ops-card"><span class="ops-pill">Step 02</span><h2>Raise a case</h2><p>Enter a synthetic scenario and receive a unique CYBER SURAKSHA evaluation reference number.</p></div>
       <div class="ops-card"><span class="ops-pill">Step 03</span><h2>Track progress</h2><p>Sign in to view only your cases and any training guidance added by an authorized local operator.</p></div></section>''','Citizen services')


def _register_form(core,env,error=''):
    tok,headers=core.new_csrf(env)
    b=core.h1('Create your evaluation account','Register a fictional demonstration account. No SMS OTP or email verification is provided.','REGISTER · FICTIONAL EVALUATION')+_notice()
    if error:b+=f'<div class="ops-error" role="alert">{core.esc(error)}</div>'
    b+=core.get_form('POST','/service/register',core.field('alias','Fictional display name')+core.field('email','Reserved example email (e.g. citizen@example.com)',kind='email')+core.field('password','Password — minimum 12 characters',kind='password')+core.sel('purpose','Why are you testing this demonstration?',LOGIN_PURPOSES)+'<label class="ops-choice"><input type="checkbox" name="fictional" value="yes" required> I will use fictional information and understand this is not a government complaint submission.</label>'+core.action('Create account'),tok)
    b+='<p class="ops-copy">Already have an account? <a href="/service/login">Log in</a>.</p>'
    return _page(core,b,'Create account',headers=headers)


def _login_form(core,env,error=''):
    tok,headers=core.new_csrf(env)
    b=core.h1('Citizen login','Access your fictional case dashboard. These are not Google/Gmail accounts or verified identities.','SECURE EVALUATION ACCESS')+_notice()
    if error:b+=f'<div class="ops-error" role="alert">{core.esc(error)}</div>'
    b+=core.get_form('POST','/service/login',core.field('email','Example-domain email',kind='email')+core.field('password','Password',kind='password')+core.sel('purpose','Purpose of this sign-in',LOGIN_PURPOSES)+core.action('Sign in'),tok)
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
    fields=(core.sel('scenario','Select a safe fictional scenario',list(DEMO_SCENARIOS)) if core.HOSTED_DEMO else core.sel('category','Case category',CATEGORIES)+core.sel('channel','Channel',CHANNELS)+core.txt('summary','Describe the fictional incident in 30–1000 characters. No private details.',1000))
    b+=core.get_form('POST','/service/new',fields+core.sel('purpose','Why are you submitting this fictional case?',CASE_PURPOSES)+'''<label class="ops-choice"><input type="checkbox" name="fictional" value="yes" required> This is a fictional scenario created for evaluating the service workflow, not a real police complaint.</label>'''+core.action('Submit fictional case'),tok)

    return _page(core,b,'Raise a case',headers=headers)


def _case_detail(core,env,user,ref):
    with core.connect_db() as db:
        row=db.execute('SELECT * FROM cs_pilot_cases WHERE reference=? AND user_id=?',(ref,user['id'])).fetchone()
        if not row:return core.bad(404,'Case not found.')
        history=db.execute('SELECT created_at,actor,status,detail FROM cs_pilot_history WHERE case_id=? ORDER BY id',(row['id'],)).fetchall()
    b=core.h1('Case '+row['reference'],'Fictional evaluation case · not a police acknowledgement or FIR.','TRACK A CASE')+_notice()
    b+='<div class="ops-panel"><h2>Case status: '+core.esc(row['status'])+'</h2>'
    b+='<p><strong>Category:</strong> '+core.esc(row['category'])+' · <strong>Channel:</strong> '+core.esc(row['channel'])+'</p><p class="ops-copy"><strong>Fictional description:</strong><br>'+core.esc(row['summary'])+'</p>'
    if row['guidance']:b+='<div class="ops-alert"><strong>Review guidance:</strong> '+core.esc(row['guidance'])+'</div>'
    b+='</div><div class="ops-panel"><h2>Local audit timeline</h2><ol class="ops-timeline">'
    for r in history:b+='<li><strong>'+core.esc(r['status'])+'</strong> · '+core.esc(r['created_at'])+' UTC<br>'+core.esc(r['detail'])+'</li>'
    b+='</ol></div><a class="btn btn-outline" href="/service/cases">Back to my cases</a>'
    return _page(core,b,'Case details')


def _staff(core,env,error=''):

    if not ((core.writable(env) and core.ADMIN_HASH) or (core.HOSTED_DEMO and core.DEMO_ADMIN_HASH)):
        return core.bad(404,'Staff operations unavailable.')
    role=_staff_role(core,env)
    if not role:return core.redirect('/service/staff/login' if core.HOSTED_DEMO else '/training-admin/login')
    tok,headers=core.new_csrf(env)
    with core.connect_db() as db:
        users=db.execute('SELECT id,alias,email,created_at FROM cs_pilot_users ORDER BY id DESC LIMIT 100').fetchall()
        rows=db.execute('''SELECT c.reference,c.user_id,c.category,c.channel,c.status,c.summary,
           c.guidance,c.created_at,u.alias,u.email FROM cs_pilot_cases c
           JOIN cs_pilot_users u ON u.id=c.user_id
           WHERE c.is_fictional=1 ORDER BY c.id DESC LIMIT 100''').fetchall()
        activities=db.execute('''SELECT a.event_time,a.action,a.purpose,a.case_ref,a.performed_by,
           u.alias,u.email FROM cs_pilot_activity a JOIN cs_pilot_users u ON u.id=a.user_id
           ORDER BY a.id DESC LIMIT 150''').fetchall()
    b=core.h1('Citizen services · administration','Fictional users, sign-in purposes, training cases, completed actions and operator updates.','RESTRICTED DEMONSTRATION · ACTIVITY REVIEW')+_notice()
    if error:b+='<div class="ops-error" role="alert">'+core.esc(error)+'</div>'
    b+='<p class="ops-copy">Signed in as <strong>'+core.esc(_staff_name(core,env))+'</strong> ('+core.esc(role)+'). Fictional display names and operator labels are user-entered, not verified identities. Only the authenticated operator can view these records.</p>'
    rows_users=[[core.esc(r['alias']),core.esc(r['email']),core.esc(r['created_at'])] for r in users]
    b+='<div class="ops-panel"><h2>Registered fictional accounts ('+str(len(users))+')</h2>'+core.table(['Fictional name','Example-domain email (not Gmail login)','Created UTC'],rows_users)+'</div>'
    rows_activity=[[core.esc(r[k] or '-') for k in ('event_time','alias','email','action','purpose','case_ref','performed_by')] for r in activities]
    b+='<div class="ops-panel"><h2>Completed activities and login purposes ('+str(len(activities))+')</h2><p class="ops-copy">Entries record only explicit registration, successful sign-in, sign-out, case submissions and staff updates. No browsing or keystroke tracking.</p>'+core.table(['Time UTC','Fictional citizen','Example email','Activity','Selected purpose','Case reference','Performed by'],rows_activity)+'</div>'
    b+='<div class="ops-panel"><h2>Fictional complaints and case updates</h2><p class="ops-copy">Case description comes from approved training scenarios only on hosting. Local mode permits fictional free text.</p></div>'
    for r in rows:
        b+='<div class="ops-panel"><div class="ops-status"><h2>'+core.esc(r['reference'])+'</h2><span class="ops-pill">'+core.esc(r['status'])+'</span></div>'
        b+='<p><strong>Submitted by:</strong> '+core.esc(r['alias'])+' ('+core.esc(r['email'])+')</p>'
        b+='<p><strong>Scenario:</strong> '+core.esc(r['category'])+' · '+core.esc(r['channel'])+' · '+core.esc(r['created_at'][:10])+' UTC</p><p class="ops-copy">'+core.esc(r['summary'])+'</p>'
        if role=='admin':
            guidance=(core.sel('guidance','Select preset demo guidance',DEMO_GUIDANCE,r['guidance']) if core.HOSTED_DEMO else '<label class="ops-label">General training guidance (max 300 characters)<textarea name="guidance" maxlength="300">'+core.esc(r['guidance'])+'</textarea></label>')
            b+=core.get_form('POST','/service/staff/'+quote(r['reference']),core.sel('status','Update status',STATUSES,r['status'])+guidance+core.action('Save status and guidance'),tok)
        else:b+='<p>Viewer access — read only.</p>'
        b+='</div>'
    if not rows:b+='<div class="ops-panel">No fictional citizen cases have been raised yet.</div>'
    if core.HOSTED_DEMO:b+=core.get_form('POST','/service/staff/logout',core.action('Demo staff log out'),tok)
    return _page(core,b,'Staff case review',headers=headers)


def _limit_key(env,email):return ((env.get('REMOTE_ADDR') or '')[:64],email)


def handle(core,path,method,env,form):
    # Only the explicit, fictional hosted demo can accept restricted synthetic workflows.
    # Live reporting and general administrator functions remain read-only on hosting.
    active=core.citizen_demo_enabled(env)
    if path=='/service' and method=='GET':return _home(core,env)
    if path.startswith('/service/staff'):
        if not active:return core.bad(404,'Staff operations unavailable')
        if core.HOSTED_DEMO and path=='/service/staff/login':
            if method=='GET':return _demo_staff_login(core,env)
            if method=='POST':return _demo_staff_auth(core,env,form)
        if core.HOSTED_DEMO and path=='/service/staff/logout' and method=='POST':
            if not core.csrf(env,form):return core.bad(403,'Invalid security token')
            secure='; Secure' if core.ON_HOSTING else ''
            return core.redirect('/service', [('Set-Cookie',f'cs_demo_staff=; Path=/service; HttpOnly; SameSite=Strict; Max-Age=0{secure}')])
        if path=='/service/staff' and method=='GET':return _staff(core,env)
        if method=='POST' and path.startswith('/service/staff/'):
            if _staff_role(core,env)!='admin':return core.bad(403,'Staff administrator permission required')
            if not core.csrf(env,form):return core.bad(403,'Invalid security token')
            status=form.get('status','')
            guidance=form.get('guidance','').strip()
            if status not in STATUSES or len(guidance)>300 or (core.HOSTED_DEMO and guidance not in DEMO_GUIDANCE):return core.bad(400,'Invalid status or guidance')
            ref=path.split('/')[-1]
            with core.connect_db() as db:
                case=db.execute('SELECT id,user_id FROM cs_pilot_cases WHERE reference=? AND is_fictional=1',(ref,)).fetchone()
                if not case:return core.bad(404,'Case not found')
                db_user_id=case['user_id']
                db.execute('UPDATE cs_pilot_cases SET status=?,guidance=?,updated_at=? WHERE id=?',(status,guidance,core.utc(),case['id']))
                db.execute('INSERT INTO cs_pilot_history(case_id,created_at,actor,status,detail) VALUES (?,?,?,?,?)',(case['id'],core.utc(),_staff_name(core,env),status,'Training case updated'))
            _activity(core,db_user_id,'Staff status updated','Updated fictional case status to '+status,ref,_staff_name(core,env))
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
                    if core.HOSTED_DEMO and db.execute('SELECT COUNT(*) FROM cs_pilot_users').fetchone()[0]>=MAX_DEMO_USERS:
                        return _register_form(core,env,'Demo capacity reached. Try again after the preview restarts.')
                    cur=db.execute('INSERT INTO cs_pilot_users(alias,email,password_hash,created_at) VALUES (?,?,?,?)',(alias,email,core.hash_password(password),core.utc()))
                    userid=cur.lastrowid
            except sqlite3.IntegrityError:return _register_form(core,env,'This example address is already registered on this device.')
            _activity(core,userid,'Account registered',form.get('purpose','') if form.get('purpose','') in LOGIN_PURPOSES else 'Purpose not specified')
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
            _activity(core,row['id'],'Signed in',form.get('purpose','') if form.get('purpose','') in LOGIN_PURPOSES else 'Purpose not specified')
            return core.redirect('/service/cases',[_issue(core,env,row['id'])])
    if path=='/service/logout' and method=='POST':
        if not core.csrf(env,form):return core.bad(403,'Invalid security token')
        if user:_activity(core,user['id'],'Signed out','Session ended')
        _revoke(core,env)
        return core.redirect('/service',[_cookie(core,env,'',0)])
    if not user:return core.redirect('/service/login')
    if path=='/service/cases' and method=='GET':return _dashboard(core,env,user)
    if path=='/service/new':
        if method=='GET':return _new_form(core,env)
        if method=='POST':
            if not core.csrf(env,form):return core.bad(403,'Invalid security token')
            if core.HOSTED_DEMO:
                scenario=form.get('scenario','')
                if scenario not in DEMO_SCENARIOS:return _new_form(core,env,'Choose one of the preset fictional scenarios.')
                category,channel,summary=DEMO_SCENARIOS[scenario]
            else:
                category=form.get('category','');channel=form.get('channel','');summary=form.get('summary','').strip()
                if category not in CATEGORIES or channel not in CHANNELS or not 30<=len(summary)<=1000:return _new_form(core,env,'Select a valid category and provide a fictional description of 30–1000 characters.')
            if form.get('fictional')!='yes':return _new_form(core,env,'Please confirm that this is fictional training data.')
            reference='CS-EVAL-'+secrets.token_hex(7).upper()
            with core.connect_db() as db:
                if core.HOSTED_DEMO:
                    user_count=db.execute('SELECT COUNT(*) FROM cs_pilot_cases WHERE user_id=?',(user['id'],)).fetchone()[0]
                    total_count=db.execute('SELECT COUNT(*) FROM cs_pilot_cases').fetchone()[0]
                    if user_count>=MAX_DEMO_CASES_PER_USER or total_count>=MAX_DEMO_CASES_TOTAL:
                        return _new_form(core,env,'Demo case capacity reached. The preview is temporary.')
                cur=db.execute('''INSERT INTO cs_pilot_cases(reference,user_id,category,channel,summary,status,created_at,updated_at,is_fictional)
                       VALUES (?,?,?,?,?,'Submitted',?,?,1)''',(reference,user['id'],category,channel,summary,core.utc(),core.utc()))
                db.execute('INSERT INTO cs_pilot_history(case_id,created_at,actor,status,detail) VALUES (?,?,?,?,?)',(cur.lastrowid,core.utc(),'Citizen (fictional)','Submitted','Fictional evaluation case received by CYBER SURAKSHA only.'))
            _activity(core,user['id'],'Fictional case submitted',form.get('purpose','') if form.get('purpose','') in CASE_PURPOSES else 'Purpose not specified',reference)
            return core.redirect('/service/case/'+quote(reference))
    if path.startswith('/service/case/') and method=='GET':
        ref=path[len('/service/case/'):]
        if len(ref)>40 or not re.fullmatch(r'CS-EVAL-[A-F0-9]{14}',ref):return core.bad(404,'Case not found')
        return _case_detail(core,env,user,ref)
    return core.bad(404,'Citizen services route not found')
