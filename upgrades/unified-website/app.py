#!/usr/bin/env python3
"""CYBER SURAKSHA 2.0 -- unified, stdlib-only WSGI application.
Independent cyber-safety guidance and controlled synthetic security training.
Not affiliated with or approved by a government authority. Not an official complaint portal.

Production mode: all public information/tools and read-only synthetic security exercises.
Local training mode: localhost-only synthetic data editing and optionally a password-protected
training administrator. No real bank, police, SIEM, identity or payment integrations.
"""
from __future__ import annotations
import base64, hashlib, hmac, html, json, mimetypes, os, secrets, sqlite3, time
from datetime import datetime, timezone
from http import HTTPStatus
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlsplit

ROOT = Path(__file__).resolve().parent
SITE = ROOT / 'site'
DATA_DIR = Path(os.environ.get('CS_DATA_DIR', str(ROOT / 'instance'))).resolve()
DB_FILE = DATA_DIR / 'cyber_suraksha.db'
LOCAL_TRAINING = os.environ.get('CS_LOCAL_TRAINING', '0') == '1'
PUBLIC_MODE = os.environ.get('CS_PUBLIC_MODE', '1') != '0'
ON_HOSTING = bool(os.environ.get('RENDER') or os.environ.get('DYNO'))
# Explicitly opt-in to a temporary hosted DEMONSTRATION of fictional citizen flows.
# Never switch the existing incident-reporting or training admin operations to public writes.
HOSTED_DEMO = bool(ON_HOSTING and PUBLIC_MODE and not LOCAL_TRAINING and os.environ.get('CS_HOSTED_DEMO') == '1')
DEMO_ADMIN_HASH = os.environ.get('CS_DEMO_ADMIN_PASSWORD_HASH', '') if HOSTED_DEMO else ''
SESSION_SECRET = (os.environ.get('CS_SESSION_SECRET') or '').encode() or secrets.token_bytes(32)
ADMIN_HASH = os.environ.get('CS_ADMIN_PASSWORD_HASH','')
VIEWER_HASH = os.environ.get('CS_VIEWER_PASSWORD_HASH','')
MAX_REQUEST_BYTES = 12_000
LOGIN_FAILURES = {}
LOGIN_LIMIT = 5
LOGIN_WINDOW_SECONDS = 15 * 60
ALLOWED_CASE_STATUSES = {'Received','Investigating','Resolved'}
SOC_STATUSES = {'New','Investigating','Contained','Closed'}
ZERO_TRUST = {
 'managed_device':('Approved employee · managed device', True, 'Identity, device, location, MFA and least privilege matched the example policy.'),
 'unknown_device':('Unknown device', False, 'Device trust is not established. Verify device and perform additional checks.'),
 'risky_location':('Unfamiliar sign-in location', False, 'Unfamiliar location. Confirm identity using a trusted channel.'),
 'excessive_privilege':('Excess administrator request', False, 'Role exceeds approved privileges. Require authorization.'),
 'weak_auth':('MFA not complete', False, 'Require multi-factor authentication before access.')}
ALERTS = [
 ('SOC-DEMO-001','Repeated failed logins','Authentication','High','198.51.100.24','demo.user','4625','2026-11-01T02:10:00Z','Six failed logins in three minutes.','Correlate failed logins, check account and source.'),
 ('SOC-DEMO-002','Successful login after failures','Authentication','High','198.51.100.24','demo.user','4624','2026-11-01T02:13:00Z','Fictional successful login after failures.','Verify account owner and login context.'),
 ('SOC-DEMO-003','Unusual PowerShell process','Execution','Critical','192.0.2.44','demo.admin','4688','2026-11-01T03:25:00Z','Suspicious encoded-command behaviour in fake endpoint log.','Inspect process ancestry and endpoint telemetry.'),
 ('SOC-DEMO-004','New local user created','Account management','Medium','192.0.2.15','demo.operator','4720','2026-11-01T04:00:00Z','User created outside expected change window.','Verify change ticket and permissions.'),
 ('SOC-DEMO-005','Privileged group change','Privilege change','High','192.0.2.15','demo.operator','4732','2026-11-01T04:04:00Z','A user was added to a privileged group.','Review least privilege and authorization.'),
 ('SOC-DEMO-006','Unusual file access','Data access','Low','203.0.113.19','demo.staff','4663','2026-11-01T05:12:00Z','Fictional unusual file access on lab share.','Review baseline and access reason.'),
 ('SOC-DEMO-007','Kerberos service ticket anomaly','Authentication','Medium','203.0.113.21','demo.service','4769','2026-11-01T05:40:00Z','Unusual service ticket requests.','Correlate account and service activity.'),
 ('SOC-DEMO-008','Suspicious sign-in from new location','Identity','High','198.51.100.88','demo.finance','4624','2026-11-01T06:02:00Z','Sign-in from unfamiliar region and device.','Verify with user over an approved channel.')]
DEMO_CASES = [
 ('CS-DEMO-001','Phishing / fake link','SMS','2026-10-28',5000,'Fictional Person A','0000000000','Fictional message asking for a bank password.','Synthetic evidence.','Received'),
 ('CS-DEMO-002','UPI / payment fraud','UPI app','2026-10-29',25000,'Fictional Person B','0000000000','Fictional UPI collect request mistaken for a refund.','Synthetic transaction.','Investigating'),
 ('CS-DEMO-003','Investment / job scam','Social media','2026-10-30',12000,'Fictional Person C','0000000000','Fake guaranteed return in a training scenario.','Synthetic chat.','Received')]
LESSONS={
 'en': [('Spot phishing','Verify sender and domain. Do not open suspicious links.'),('Protect UPI','UPI PIN authorises debits. Never share OTP/PIN.'),('Protect accounts','Use unique passwords and multi-factor authentication.')],
 'hi': [('फ़िशिंग पहचानें','भेजने वाले और लिंक की पुष्टि करें।'),('UPI सुरक्षित रखें','UPI PIN और OTP साझा न करें।'),('खातों की सुरक्षा','मजबूत अलग पासवर्ड और MFA इस्तेमाल करें।')],
 'te': [('ఫిషింగ్‌ను గుర్తించండి','పంపినవారి వివరాలను, లింకులను తనిఖీ చేయండి.'),('UPI భద్రత','UPI PIN లేదా OTP ఎవరికీ ఇవ్వవద్దు.'),('ఖాతా భద్రత','వేర్వేరు బలమైన పాస్‌వర్డ్‌లు మరియు MFA ఉపయోగించండి.')]
}


def esc(value): return html.escape(str(value), quote=True)
def utc(): return datetime.now(timezone.utc).isoformat(timespec='seconds')
class ClosingSQLiteConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()

def connect_db():
    db=sqlite3.connect(DB_FILE, timeout=12, factory=ClosingSQLiteConnection)
    db.row_factory=sqlite3.Row
    return db

def initialize_database():
    DATA_DIR.mkdir(parents=True,exist_ok=True)
    with connect_db() as db:
        db.execute('''CREATE TABLE IF NOT EXISTS incidents (id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, incident_type TEXT NOT NULL, channel TEXT NOT NULL, incident_date TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0, contact_name TEXT NOT NULL, contact_phone TEXT NOT NULL, description TEXT NOT NULL, evidence_note TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'Received', is_demo INTEGER NOT NULL DEFAULT 0)''')
        db.execute('''CREATE TABLE IF NOT EXISTS soc_alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, alert_id TEXT UNIQUE NOT NULL, title TEXT NOT NULL, category TEXT NOT NULL, severity TEXT NOT NULL, source_ip TEXT NOT NULL, username TEXT NOT NULL, event_id TEXT NOT NULL, occurred_at TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'New', analyst_notes TEXT NOT NULL DEFAULT '', assessment TEXT NOT NULL DEFAULT '', response TEXT NOT NULL DEFAULT '', is_demo INTEGER NOT NULL DEFAULT 1)''')
        db.execute('''CREATE TABLE IF NOT EXISTS zero_trust_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT,scenario_id TEXT NOT NULL,decision TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,is_demo INTEGER NOT NULL DEFAULT 1)''')
        db.execute('''CREATE TABLE IF NOT EXISTS disclosure_reports (id INTEGER PRIMARY KEY AUTOINCREMENT,report_ref TEXT UNIQUE NOT NULL,asset TEXT NOT NULL,title TEXT NOT NULL,severity TEXT NOT NULL,details TEXT NOT NULL,remediation TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Saved locally',created_at TEXT NOT NULL,is_demo INTEGER NOT NULL DEFAULT 0)''')
        db.execute('''CREATE TABLE IF NOT EXISTS stage3_audit (id INTEGER PRIMARY KEY AUTOINCREMENT,event_time TEXT NOT NULL,actor_role TEXT NOT NULL,action TEXT NOT NULL,case_ref TEXT,detail TEXT NOT NULL)''')
        for row in DEMO_CASES:
            db.execute('''INSERT OR IGNORE INTO incidents (reference,created_at,incident_type,channel,incident_date,amount,contact_name,contact_phone,description,evidence_note,status,is_demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)''',(row[0],utc(),*row[1:]))
        for a in ALERTS:
            db.execute('''INSERT OR IGNORE INTO soc_alerts (alert_id,title,category,severity,source_ip,username,event_id,occurred_at,description,response,is_demo) VALUES (?,?,?,?,?,?,?,?,?,?,1)''',a)

def status_text(status): return HTTPStatus(status).phrase if status in HTTPStatus._value2member_map_ else 'OK'
def response(status, body, content_type='text/html; charset=utf-8', headers=None):
    if isinstance(body,str):body=body.encode('utf-8')
    return status,body,[('Content-Type',content_type),('Content-Length',str(len(body))),*(headers or [])]

def nav_page(body,title,lang='en'):
    # The same visual language as the public-facing website, but dynamic and server-rendered.
    links=[('index.html','Home'),('scam-checker.html','Scam Checker'),('response.html','Get Help'),('training.html','Training'),('operations.html','Security operations'),('/service','Citizen services'),('assistant.html','Safety Assistant'),('resources.html','Resources'),('governance.html','Governance')]
    nav=''.join(f'<a href="{esc(p if p.startswith("/") else "/" + p)}">{esc(n)}</a>' for p,n in links)
    return f'''<!DOCTYPE html><html lang="{esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="strict-origin-when-cross-origin"><title>{esc(title)} · CYBER SURAKSHA 2.0</title><link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/assets/style.css"><link rel="stylesheet" href="/assets/operations.css"><script defer src="/assets/app.js"></script></head><body><a class="skip" href="#main">Skip to content</a><div class="topline"><div class="shell">Independent cyber safety platform · Government affiliation or approval has not been granted</div></div><header class="header"><div class="shell headrow"><a class="logo" href="/index.html"><span class="logoicon">✦</span><span class="logotype">CYBER SURAKSHA 2.0<small>DIGITAL SAFETY · PREVENTION · RESPONSE</small></span></a><nav class="nav" id="nav" aria-label="Main navigation">{nav}</nav><div class="headtools"><a class="btn btn-dark btn-sm" href="/response.html">Get Help</a><button type="button" class="hamburger" id="menu-btn" aria-expanded="false" aria-controls="nav">☰</button></div></div></header><main id="main" class="ops-wrap">{body}</main><footer class="sitefoot"><div class="shell footinner"><div><strong>CYBER SURAKSHA 2.0</strong><p>Independent cyber safety initiative. Not a government complaint service.</p></div><div><strong>Platform</strong><a href="/operations.html">Security operations</a><a href="/scam-checker.html">Scam checker</a><a href="/privacy.html">Privacy</a></div><div><strong>Real cybercrime?</strong><a href="https://cybercrime.gov.in/" rel="noopener noreferrer" target="_blank">India official cybercrime reporting</a><a href="tel:1930">1930 financial fraud helpline</a></div></div><div class="shell footbottom">Independent platform · No official affiliation or endorsement.</div></footer></body></html>'''

def h1(title,description,eyebrow='CYBER SURAKSHA PLATFORM'):
    return f'<section class="ops-head"><p class="eyebrow">{esc(eyebrow)}</p><h1>{esc(title)}</h1><p>{esc(description)}</p></section>'

def notice():return '<div class="ops-note"><strong>Important:</strong> This is an independent cybersecurity service, not a government complaint portal. All exercises use synthetic data. For real fraud, contact your bank and use <a href="https://cybercrime.gov.in/" target="_blank" rel="noopener noreferrer">cybercrime.gov.in</a>; in India, financial fraud victims can call <a href="tel:1930">1930</a>.</div>'

def card(href,title,desc):return f'<a href="{esc(href)}"><div class="ops-card"><span class="ops-pill">Explore module</span><h2>{esc(title)}</h2><p>{esc(desc)}</p><span class="ops-link">Open →</span></div></a>'

def field(name,label,value='',kind='text',required=True):
    return f'<label class="ops-label">{esc(label)}<input type="{esc(kind)}" name="{esc(name)}" value="{esc(value)}" maxlength="120" {"required" if required else ""}></label>'

def sel(name,label,choices,value=''):
    opts=''.join(f'<option value="{esc(x)}" {"selected" if x==value else ""}>{esc(x)}</option>' for x in choices)
    return f'<label class="ops-label">{esc(label)}<select name="{esc(name)}">{opts}</select></label>'

def txt(name,label,value='',limit=1000):
    return f'<label class="ops-label">{esc(label)}<textarea name="{esc(name)}" maxlength="{limit}" required>{esc(value)}</textarea></label>'

def action(form):return '<button type="submit" class="btn btn-primary">'+esc(form)+'</button>'
def get_form(method,action_url,parts,csrf=''):
    token=f'<input type="hidden" name="_csrf" value="{esc(csrf)}">' if method.upper()=='POST' else ''
    return f'<form class="ops-form" method="{esc(method)}" action="{esc(action_url)}">{token}{parts}</form>'

def table(headers,rows):
    header=''.join('<th scope="col">'+esc(c)+'</th>' for c in headers)
    body=''.join('<tr>'+''.join('<td>'+c+'</td>' for c in row)+'</tr>' for row in rows)
    return f'<div class="ops-tablewrap"><table class="ops-table"><thead><tr>{header}</tr></thead><tbody>{body or "<tr><td colspan=8>No synthetic records yet.</td></tr>"}</tbody></table></div>'

def _cookie(env,name):
    parts=(env.get('HTTP_COOKIE') or '').split(';')
    for p in parts:
        k,sep,v=p.strip().partition('=')
        if k==name:return v
    return ''

def encode_sess(payload):
    data=base64.urlsafe_b64encode(json.dumps(payload,separators=(',',':')).encode()).decode().rstrip('=')
    mac=hmac.new(SESSION_SECRET,data.encode(),hashlib.sha256).hexdigest()
    return data+'.'+mac

def get_sess(env,cookie_name='cs_sess'):
    token=_cookie(env,cookie_name)
    try:
        data,mac=token.rsplit('.',1)
        if not hmac.compare_digest(mac,hmac.new(SESSION_SECRET,data.encode(),hashlib.sha256).hexdigest()):return {}
        obj=json.loads(base64.urlsafe_b64decode(data+'='*(-len(data)%4)))
        if time.time()-int(obj.get('time',0))>1200 or obj.get('role') not in ('admin','viewer'):return {}
        return obj
    except (ValueError,TypeError,KeyError):return {}

def make_cookie(name,value,max_age=1200):
    secure='; Secure' if ON_HOSTING else ''
    return ('Set-Cookie',f'{name}={value}; Path=/; HttpOnly; SameSite=Strict; Max-Age={max_age}{secure}')

def is_local(env):return env.get('REMOTE_ADDR') in ('127.0.0.1','::1') and not ON_HOSTING

def writable(env):return LOCAL_TRAINING and not PUBLIC_MODE and is_local(env)

def citizen_demo_enabled(env):return writable(env) or HOSTED_DEMO

def csrf(env,form):
    expected=_cookie(env,'cs_form')
    if not expected or not hmac.compare_digest(str(form.get('_csrf','')),expected):return False
    origin=env.get('HTTP_ORIGIN')
    if origin:
        host=env.get('HTTP_HOST','')
        if origin not in (f'http://{host}',f'https://{host}'):return False
    return True

def new_csrf(env):
    current=_cookie(env,'cs_form')
    if current and len(current)==48 and all(c in '0123456789abcdef' for c in current):return current,[]
    value=secrets.token_hex(24)
    return value,[make_cookie('cs_form',value,3600)]

def verify_password(password,record):
    # format: pbkdf2_sha256$rounds$salt_hex$hash_hex
    try:
        typ,rounds,salt,digest=record.split('$')
        n=int(rounds)
        if typ!='pbkdf2_sha256' or n<150000 or n>2_000_000:return False
        expected=bytes.fromhex(digest)
        actual=hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(salt),n)
        return hmac.compare_digest(actual,expected)
    except (ValueError,AttributeError):return False

def hash_password(password):
    salt=secrets.token_bytes(16)
    n=300000
    return 'pbkdf2_sha256$'+str(n)+'$'+salt.hex()+'$'+hashlib.pbkdf2_hmac('sha256',password.encode(),salt,n).hex()

def bad(code,message):return response(code,nav_page(h1(status_text(code),message),'Error'))
def redirect(to,extra=None):return response(303,b'',headers=[('Location',to),*(extra or [])])
def parameters(environ):return {k:values[-1] for k,values in parse_qs(environ.get('QUERY_STRING',''),keep_blank_values=True).items()}
def body_params(env):
    length=int(env.get('CONTENT_LENGTH') or '0')
    if length>MAX_REQUEST_BYTES:raise ValueError('Request too large')
    if 'application/x-www-form-urlencoded' not in env.get('CONTENT_TYPE',''):raise ValueError('Unsupported content type')
    raw=env['wsgi.input'].read(length).decode('utf-8','replace')
    return {k:v[-1] for k,v in parse_qs(raw,keep_blank_values=True).items()}


def operations(env):
    blocks=[('/service','Citizen services','Sign in, raise a fictional evaluation case and track its status.'),('scam-checker.html','Scam warning-sign checker','Private browser-side explainable message checks.'),('response.html','Cyber fraud response navigator','Safe next steps and genuine government reporting links.'),('training.html','Interactive awareness scenarios','Branching fictional fraud conversations.'),('/dashboard','Case management dashboard','Synthetic incidents and public review of case workflow.'),('/soc-simulator','SOC analyst investigations','Synthetic events, log triage and workflow practice.'),('/zero-trust','Zero Trust assessment','Simulated identity, location, device and access signals.'),('/disclosure','Responsible disclosure training','Fictional security findings only.'),('/awareness','Multilingual awareness centre','Telugu, Hindi and English lessons and quiz.'),('/training-showcase','Incident training showcase','Privacy-preserving fictional case presentations.')]
    admin_access = card('/training-admin/login','Local training administrator','Sign in to review fictional cases in a protected localhost session.') if writable(env) and ADMIN_HASH else '<div class="ops-card" role="note"><span class="ops-pill">Restricted operator tool</span><h2>Local administrator</h2><p>Not available in public preview. To use it on your own Windows computer, stop the current server and launch <code>START_SECURE_ADMIN_WINDOWS.bat</code>, then open <code>http://127.0.0.1:8080/training-admin/login</code>.</p></div>'
    return h1('Security operations','Cybersecurity education, explainable risk signals and synthetic incident-management workflows. No live financial transactions, law-enforcement integrations or endpoint isolation.')+notice()+'<div class="ops-grid">'+''.join(card(*b) for b in blocks)+admin_access+'</div>'

def dashboard():
    with connect_db() as db:
        rows=db.execute('SELECT reference,incident_type,channel,incident_date,amount,status FROM incidents WHERE is_demo=1 ORDER BY id DESC LIMIT 20').fetchall()
    metrics=f'<div class="ops-grid"><div class="ops-card"><span class="ops-metric">{len(rows)}</span><p>Synthetic cases shown</p></div><div class="ops-card"><span class="ops-metric">{sum(x["status"] not in ("Closed","Resolved") for x in rows)}</span><p>Training cases open</p></div><div class="ops-card"><span class="ops-metric">0</span><p>Official complaints submitted through this website</p></div></div>'
    t=table(['Reference','Category','Channel','Date','Status'],[[f'<a href="/incident/{esc(r["reference"])}">{esc(r["reference"])}</a>',esc(r['incident_type']),esc(r['channel']),esc(r['incident_date']),esc(r['status'])] for r in rows])
    return h1('Incident management','Training dashboard for fictional cases only. Real cases are never displayed or submitted.')+notice()+metrics+'<div class="ops-actions"><a class="btn btn-dark" href="/report">Incident entry</a><a class="btn btn-light" href="/soc-simulator">SOC investigations</a></div><div class="ops-panel"><h2>Training register</h2>'+t+'</div>'

def report_page(env):
    content=h1('Incident intake and guidance','View a safe incident workflow using fictional training examples. This website does not submit official crime complaints.')+notice()
    if not writable(env):
        return content+'<div class="ops-panel"><h2>Official report channels</h2><p>For a real cybercrime complaint in India, use the national portal or contact your bank. For financial cyber fraud, call 1930 immediately.</p><a class="btn btn-primary" href="https://cybercrime.gov.in/" rel="noopener noreferrer" target="_blank">Open official portal</a><p class="ops-small">Public incident submissions are disabled to protect personal information.</p></div>',[]
    token,cookies=new_csrf(env)
    fields='<div class="ops-row">'+sel('incident_type','Incident type',[x for x in ('Phishing / fake link','UPI / payment fraud','Identity theft','Investment / job scam','Social media impersonation','Other')])+sel('channel','Channel',['SMS','Phone call','WhatsApp','Email','UPI app','Social media','Website','Other'])+'</div>'
    fields+='<div class="ops-row">'+field('incident_date','Date','2026-11-03','date')+field('amount','Fictional amount','0','number')+'</div>'
    fields+=field('contact_name','Training display name','Fictional User')+field('contact_phone','Training contact placeholder','0000000000')+txt('description','Fictional incident description (15 characters minimum)')+txt('evidence_note','Fictional evidence note')
    fields+='<p class="ops-small">Local-only training mode. Use no real victim details, passwords, OTPs or phone numbers.</p>'+action('Save training case')
    return content+get_form('POST','/report',fields,token),cookies

def post_report(env,form):
    if not writable(env):return bad(403,'Public incident submissions are disabled.')
    if not csrf(env,form):return bad(403,'CSRF check failed.')
    cat=form.get('incident_type','')
    if cat not in ('Phishing / fake link','UPI / payment fraud','Identity theft','Investment / job scam','Social media impersonation','Other'):return bad(400,'Invalid incident type')
    descr=form.get('description','').strip()
    if len(descr)<15 or len(descr)>2000:return bad(400,'Use a fictional incident description of 15–2000 characters.')
    for n in ('contact_name','contact_phone','channel','incident_date'):
        if not form.get(n) or len(form[n])>100:return bad(400,'Invalid training fields.')
    try:
        amount=float(form.get('amount','0'))
        if not (0<=amount<=100000000):raise ValueError
    except ValueError:return bad(400,'Invalid fictional amount.')
    ref='CS-TRAIN-'+secrets.token_hex(4).upper()
    with connect_db() as db:
        db.execute('INSERT INTO incidents (reference,created_at,incident_type,channel,incident_date,amount,contact_name,contact_phone,description,evidence_note,status,is_demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)',(ref,utc(),cat,form['channel'][:30],form['incident_date'][:15],amount,form['contact_name'][:80],form['contact_phone'][:20],descr,form.get('evidence_note','')[:1000],'Received'))
    return redirect('/incident/'+quote(ref))

def incident_detail(ref):
    with connect_db() as db:r=db.execute('SELECT * FROM incidents WHERE reference=? AND is_demo=1',(ref,)).fetchone()
    if not r:return bad(404,'Training case not found.')
    pairs=[('Reference',r['reference']),('Category',r['incident_type']),('Channel',r['channel']),('Date',r['incident_date']),('Status',r['status']),('Fictional incident description',r['description']),('Training evidence note',r['evidence_note'])]
    content='<dl>'+''.join(f'<dt><strong>{esc(k)}</strong></dt><dd>{esc(v or "Not provided")}</dd>' for k,v in pairs)+'</dl>'
    return h1('Training case '+ref,'This case is fictional. It is not a police report or investigation.')+notice()+'<div class="ops-panel">'+content+'<div class="ops-actions"><a href="/dashboard" class="btn btn-light">Return to cases</a></div></div>'

def soc_list(params):
    sev=params.get('severity','All');status=params.get('status','All')
    if sev not in {'All','Critical','High','Medium','Low'}:sev='All'
    if status not in {'All',*SOC_STATUSES}:status='All'
    with connect_db() as db:
        query='SELECT * FROM soc_alerts WHERE is_demo=1';inputs=[]
        if sev!='All':query+=' AND severity=?';inputs.append(sev)
        if status!='All':query+=' AND status=?';inputs.append(status)
        query+=" ORDER BY CASE severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END, id"
        rows=db.execute(query,inputs).fetchall()
    filters=get_form('GET','/soc-simulator',sel('severity','Severity',['All','Critical','High','Medium','Low'],sev)+sel('status','Investigation status',['All','New','Investigating','Contained','Closed'],status)+action('Apply filters'))
    t=table(['Alert ID','Description','Severity','Event ID','Status'],[[f'<a href="/soc/{esc(r["alert_id"])}">{esc(r["alert_id"])}</a>',esc(r['title']),esc(r['severity']),esc(r['event_id']),esc(r['status'])] for r in rows])
    return h1('SOC investigation centre','Analyse synthetic Windows security logs. This platform does not receive live SIEM alerts or change devices.')+notice()+'<div class="ops-sidebar"><div class="ops-panel"><h2>Training alerts</h2>'+t+'</div><div>'+filters+'</div></div>'

def soc_detail(env,ref):
    with connect_db() as db:r=db.execute('SELECT * FROM soc_alerts WHERE alert_id=? AND is_demo=1',(ref,)).fetchone()
    if r is None:return bad(404,'Synthetic SOC alert not found.')
    content='<dl>'+''.join(f'<dt><strong>{esc(key)}</strong></dt><dd>{esc(r[key])}</dd>' for key in ('alert_id','title','severity','category','event_id','source_ip','username','occurred_at','description','response','status','assessment','analyst_notes'))+'</dl>'
    b=h1('SOC investigation '+ref,'Synthetic evidence for analyst training, not a live security alert.')+notice()+'<div class="ops-panel">'+content+'</div>'
    cookies=[]
    if writable(env):
        token,cookies=new_csrf(env)
        fields=sel('status','Workflow status',sorted(SOC_STATUSES),r['status'])+txt('assessment','Analyst assessment',r['assessment'],1000)+txt('analyst_notes','Investigation notes',r['analyst_notes'],3000)+action('Save fictional investigation')
        b+=get_form('POST','/soc/'+quote(ref),fields,token)
    else:b+='<div class="ops-note">Public hosting is read-only. Investigation notes can be saved in localhost training mode only.</div>'
    return b,cookies

def soc_post(env,ref,form):
    if not writable(env):return bad(403,'SOC write access is restricted to local training.')
    if not csrf(env,form):return bad(403,'CSRF check failed.')
    if form.get('status') not in SOC_STATUSES:return bad(400,'Invalid SOC status')
    notes=form.get('analyst_notes','').strip()
    if not notes or len(notes)>3000:return bad(400,'Training notes are required; maximum 3000 characters.')
    with connect_db() as db:
        cursor=db.execute('UPDATE soc_alerts SET status=?,assessment=?,analyst_notes=? WHERE alert_id=? AND is_demo=1',(form['status'],form.get('assessment','')[:1000],notes,ref))
        if cursor.rowcount==0:return bad(404,'Alert not found')
    return redirect('/soc/'+quote(ref))

FRAUD_SCENARIOS={
 'collect_request':{
  'title':'Fake cashback and UPI collect request',
  'story':'A fictional caller promises a cashback payment but sends a UPI collect request and asks you to enter your PIN.',
  'choices':[('reject','Reject the collect request'),('verify','Verify with the bank or provider using an official channel'),('approve','Enter a UPI PIN to receive cashback'),('share','Share a one-time password with the caller')],
  'correct':{'reject','verify'},'lesson':'A collect request can authorize payment from your account. You do not need a UPI PIN to receive money.'},
 'remote_access':{
  'title':'Fake customer-care remote access',
  'story':'A fictional agent claims to help recover a failed payment and demands installation of a remote-control app.',
  'choices':[('refuse','Refuse device-control permissions'),('verify','Find customer support through official channels'),('install','Install and grant screen-sharing access'),('otp','Read the verification OTP aloud')],
  'correct':{'refuse','verify'},'lesson':'Unknown remote-access requests can expose devices and accounts. Contact support using verified channels.'},
 'job_offer':{
  'title':'Fake recruitment and registration fee',
  'story':'A fictional recruiter offers immediate selection and asks for a payment to reserve your position.',
  'choices':[('verify','Verify the opening on the company careers website'),('refuse','Decline payment to unverified recruiters'),('pay','Pay the fee immediately'),('identity','Share all identity documents and passwords')],
  'correct':{'verify','refuse'},'lesson':'Check job listings and recruiters independently; beware of unsolicited recruitment fees.'}}

def fraud_page(params):
    scenario=params.get('scenario','collect_request')
    if scenario not in FRAUD_SCENARIOS:scenario='collect_request'
    obj=FRAUD_SCENARIOS[scenario]
    heading=h1('Financial fraud response simulator','Choose safe actions in a fictional fraud scenario and receive an evidence-based response score. No real payment or bank connection is involved.')+notice()
    opts=sel('scenario','Choose a scenario',[k for k in FRAUD_SCENARIOS],scenario)
    choices=''.join(f'<label class="ops-choice"><input type="checkbox" name="action" value="{esc(key)}"> {esc(label)}</label>' for key,label in obj['choices'])
    form=f'<form method="get" action="/fraud-simulator" class="ops-form">{opts}<h2>{esc(obj["title"])}</h2><p>{esc(obj["story"])}</p><h3>Select all safe actions</h3>{choices}<input type="hidden" name="evaluate" value="1">{action("Check response")}</form>'
    result=''
    if 'evaluate' in params or 'action' in params:
        selected=set(parse_qs(params.get('_raw',''),keep_blank_values=True).get('action',[]))
        correct=obj['correct'];all_ids={key for key,_ in obj['choices']}
        selected=selected & all_ids
        correct_selected=len(selected & correct);unsafe=len(selected-correct);missed=len(correct-selected)
        score=max(0,round(100*(correct_selected/len(correct))-25*unsafe))
        result=f'<div class="ops-panel" role="status"><h2>Training response: {score}/100</h2><p>{correct_selected} correct actions selected · {unsafe} unsafe actions selected · {missed} important actions missed.</p><p>{esc(obj["lesson"])}</p><p class="ops-small">This score is educational, not a measure of real-world detection accuracy.</p></div>'
    return heading+form+result

def zero_page(params):
    s=params.get('scenario','managed_device');s=s if s in ZERO_TRUST else 'managed_device'
    title,allow,reason=ZERO_TRUST[s]
    result=f'<div class="ops-panel"><h2>Simulation result</h2><span class="ops-pill">{ "ALLOW — SIMULATED" if allow else "DENY / STEP-UP — SIMULATED" }</span><p>{esc(reason)}</p></div>'
    form=get_form('GET','/zero-trust',sel('scenario','Fictional access scenario',[k for k in ZERO_TRUST],s)+action('Evaluate'))
    return h1('Zero Trust decision simulator','Explore simulated identity, device, MFA, location and least-privilege decisions. No real access is granted or blocked.')+notice()+form+result

def disclosure_page(env):
    b=h1('Responsible disclosure training','Learn to record a fictional vulnerability finding; never test real assets without permission.')+notice()
    if writable(env):
        tok,cookies=new_csrf(env)
        fields=field('asset','Fictional training asset','demo.training.local')+field('title','Finding title')+sel('severity','Severity',['Informational','Low','Medium','High','Critical'])+txt('details','Finding description (20+ characters)')+txt('remediation','Suggested remediation (10+ characters)')+action('Save local training report')
        return b+get_form('POST','/disclosure',fields,tok),cookies
    return b+'<div class="ops-panel"><h2>Public disclosure</h2><p>Public submission is disabled. If you discover a real vulnerability, use the affected organization’s authorized reporting policy and never include confidential information here.</p></div>',[]

def disclosure_post(env,form):
    if not writable(env):return bad(403,'Public vulnerability submission is disabled.')
    if not csrf(env,form):return bad(403,'CSRF check failed.')
    if not form.get('asset') or not form.get('title') or not (20<=len(form.get('details',''))<=3000) or not (10<=len(form.get('remediation',''))<=1500):return bad(400,'Invalid fictional disclosure data.')
    r='VDR-'+secrets.token_hex(4).upper()
    with connect_db() as db:db.execute('INSERT INTO disclosure_reports (report_ref,asset,title,severity,details,remediation,created_at,is_demo) VALUES (?,?,?,?,?,?,?,1)',(r,form['asset'][:120],form['title'][:120],form.get('severity','Low'),form['details'][:3000],form['remediation'][:1500],utc()))
    return redirect('/disclosure?received='+quote(r))

KNOWLEDGE_QA={
 'en':[("Do you need a UPI PIN to receive money?",["Yes","No","Always"],1),("Should you share an OTP with an unexpected caller?",["Yes","No","Only at night"],1),("Where should you report real cybercrime in India?",["An unknown link","An unofficial chatbot","cybercrime.gov.in"],2)],
 'hi':[("पैसे प्राप्त करने के लिए UPI PIN चाहिए?",["हाँ","नहीं","हमेशा"],1),("क्या अनजान कॉलर को OTP देना चाहिए?",["हाँ","नहीं","रात में"],1),("भारत में साइबर अपराध कहाँ रिपोर्ट करें?",["अज्ञात लिंक","अज्ञात व्यक्ति","cybercrime.gov.in"],2)],
 'te':[("డబ్బు అందుకోవడానికి UPI PIN అవసరమా?",["అవును","కాదు","ఎల్లప్పుడూ"],1),("తెలియని కాలర్‌కు OTP చెప్పవచ్చా?",["అవును","కాదు","రాత్రి మాత్రమే"],1),("భారతదేశంలో సైబర్ నేరాన్ని ఎక్కడ నివేదించాలి?",["తెలియని లింక్","తెలియని వ్యక్తి","cybercrime.gov.in"],2)]}

def awareness_page(params):
    lang=params.get('lang','en')
    if lang not in LESSONS:lang='en'
    rows=''.join(f'<div class="ops-card"><span class="ops-pill">Lesson {n+1}</span><h3>{esc(k)}</h3><p>{esc(v)}</p></div>' for n,(k,v) in enumerate(LESSONS[lang]))
    langform=get_form('GET','/awareness',sel('lang','Language',['en','hi','te'],lang)+action('Change language'))
    questions=[]
    for i,(question,answers,correct) in enumerate(KNOWLEDGE_QA[lang]):
        options=''.join(f'<label class="ops-choice"><input type="radio" name="q{i}" value="{j}" required> {esc(answer)}</label>' for j,answer in enumerate(answers))
        questions.append(f'<fieldset class="ops-quiz"><legend>{i+1}. {esc(question)}</legend>{options}</fieldset>')
    quiz='<form method="get" action="/awareness" class="ops-form"><input type="hidden" name="lang" value="'+esc(lang)+'">'+''.join(questions)+'<input type="hidden" name="check" value="1">'+action('Check knowledge')+'</form>'
    result=''
    if params.get('check')=='1':
        score=sum(int(params.get(f'q{i}','-1')==str(q[2])) for i,q in enumerate(KNOWLEDGE_QA[lang]))
        result=f'<div class="ops-success" role="status"><strong>Your knowledge score: {score} / 3</strong><p>This is a fictional education quiz, not a certification.</p></div>'
    content=h1('Cyber safety awareness','Practical lessons and a knowledge quiz in English, Hindi and Telugu.')+notice()+langform+'<div class="ops-grid">'+rows+'</div><div class="ops-panel"><h2>Knowledge check</h2>'+quiz+result+'</div><div class="ops-actions"><a href="/training.html" class="btn btn-primary">Adaptive scenario training</a></div>'
    return content,lang

def showcase():
    with connect_db() as db:rows=db.execute('SELECT reference,incident_type,channel,incident_date,status FROM incidents WHERE is_demo=1 ORDER BY id LIMIT 50').fetchall()
    data=table(['Case reference','Category','Channel','Date','Status'],[[esc(r[x]) for x in ('reference','incident_type','channel','incident_date','status')] for r in rows])
    return h1('Synthetic case showcase','Privacy-preserving case management examples. No names, phone numbers, real complaints or financial credentials displayed.')+notice()+data

def login_page(env,err=''):
    tok,cookies=new_csrf(env)
    form=field('password','Local administrator password','','password')+action('Sign in')
    b=h1('Local training administrator','Password-protected local access. Not available on public deployments.')+(f'<div class="ops-error">{esc(err)}</div>' if err else '')+get_form('POST','/training-admin/login',form,tok)
    return b,cookies

def audit(role,action,ref='',details=''):
    with connect_db() as db:db.execute('INSERT INTO stage3_audit(event_time,actor_role,action,case_ref,detail) VALUES(?,?,?,?,?)',(utc(),role,action,ref,details))

def admin_page(env):
    sess=get_sess(env)
    if not sess:return None,[]
    tok,cookies=new_csrf(env)
    with connect_db() as db:
        rows=db.execute('SELECT reference,incident_type,status,incident_date FROM incidents WHERE is_demo=1 ORDER BY id LIMIT 100').fetchall()
        events=db.execute('SELECT event_time,actor_role,action,case_ref,detail FROM stage3_audit ORDER BY id DESC LIMIT 20').fetchall()
    values=[]
    for r in rows:
        link=esc(r['status'])
        if sess['role']=='admin':
            inner=sel('status','Update status',sorted(ALLOWED_CASE_STATUSES),r['status'])+action('Save')
            link=get_form('POST','/training-admin/cases/'+quote(r['reference'])+'/status',inner,tok)
        values.append([esc(r['reference']),esc(r['incident_type']),esc(r['incident_date']),esc(r['status']),link])
    aud=table(['Time UTC','Role','Action','Case','Detail'],[[esc(r[k] or '-') for k in ('event_time','actor_role','action','case_ref','detail')] for r in events])
    logout=get_form('POST','/training-admin/logout',action('Log out'),tok)
    b=h1('Local administrator — '+sess['role'].title(),'Synthetic case workflow, password authentication, role controls and audit logging. No real victim records are displayed.')+notice()+logout+'<div class="ops-panel"><h2>Synthetic case status</h2>'+table(['Reference','Category','Date','Current status','Update'],values)+'</div><div class="ops-panel"><h2>Local audit history</h2>'+aud+'</div>'
    return b,cookies

def do_admin_login(env,form):
    if not csrf(env,form):return bad(403,'CSRF check failed.')
    ip=env.get('REMOTE_ADDR','local')
    now=time.monotonic()
    attempts=[t for t in LOGIN_FAILURES.get(ip,[]) if now-t<LOGIN_WINDOW_SECONDS]
    LOGIN_FAILURES[ip]=attempts
    if len(attempts)>=LOGIN_LIMIT:return bad(429,'Too many login attempts. Try later.')
    role='admin' if verify_password(form.get('password',''),ADMIN_HASH) else 'viewer' if verify_password(form.get('password',''),VIEWER_HASH) else ''
    if not role:
        LOGIN_FAILURES[ip].append(now)
        b,c=login_page(env,'Invalid password.');return response(401,nav_page(b,'Login'),headers=c)
    LOGIN_FAILURES.pop(ip,None)
    session={'role':role,'time':int(time.time())}
    audit(role,'login','', 'Local training sign-in')
    return redirect('/training-admin', [make_cookie('cs_sess',encode_sess(session))])

def do_admin_status(env,ref,form):
    sess=get_sess(env)
    if sess.get('role')!='admin':return bad(403,'Administrator permission required')
    if not csrf(env,form):return bad(403,'CSRF check failed.')
    new=form.get('status')
    if new not in ALLOWED_CASE_STATUSES:return bad(400,'Invalid case status')
    with connect_db() as db:
        old=db.execute('SELECT status FROM incidents WHERE reference=? AND is_demo=1',(ref,)).fetchone()
        if old is None:return bad(404,'Case not found')
        db.execute('UPDATE incidents SET status=? WHERE reference=? AND is_demo=1',(new,ref))
    audit('admin','status_change',ref,old['status']+' → '+new)
    return redirect('/training-admin')

def static_response(path):
    path=path.lstrip('/')
    if path in ('','/') :path='index.html'
    if '\\' in path or '\x00' in path or any(x in ('.','..') for x in path.split('/')):return bad(404,'Page not found')
    p=(SITE/path).resolve()
    if not p.is_relative_to(SITE) or not p.is_file() or p.suffix not in ('.html','.css','.js','.svg','.png','.ico','.webmanifest','.csv','.txt'):
        return bad(404,'Page not found')
    data=p.read_bytes()
    ctype=mimetypes.guess_type(str(p))[0] or 'application/octet-stream'
    if p.suffix in ('.html','.css','.js','.txt'):ctype+='; charset=utf-8'
    return response(200,data,ctype)


def dispatch(env):
    raw_path=urlsplit(env.get('PATH_INFO','/')).path
    path=unquote(raw_path)
    method=env.get('REQUEST_METHOD','GET').upper()
    params=parameters(env)
    if method not in ('GET','HEAD','POST'):return bad(405,'Method not allowed')
    if method=='POST':
        try:form=body_params(env)
        except (ValueError,UnicodeError):return bad(400,'Invalid request body')
    else:form={}
    if path=='/service' or path.startswith('/service/'):
        import service_portal
        return service_portal.handle(__import__(__name__),path,method,env,form)
    if path=='/health':return response(200,json.dumps({'status':'ok','application':'CYBER SURAKSHA 2.0','mode':'hosted-fictional-demo' if HOSTED_DEMO else 'public-read-only' if PUBLIC_MODE else 'local-training','government_approved':False}), 'application/json; charset=utf-8')
    if path=='/operations.html' and method=='GET':return response(200,nav_page(operations(env),'Security Operations'))
    if path=='/dashboard' and method=='GET':return response(200,nav_page(dashboard(),'Case Dashboard'))
    if path=='/incidents' and method=='GET':return redirect('/dashboard')
    if path=='/report':
        if method=='GET':b,c=report_page(env);return response(200,nav_page(b,'Incident Intake'),headers=c)
        if method=='POST':return post_report(env,form)
    if path.startswith('/incident/') and method=='GET':
        out=incident_detail(path[len('/incident/'):])
        if isinstance(out,tuple):return out
        return response(200,nav_page(out,'Training Incident'))
    if path=='/soc-simulator' and method=='GET':return response(200,nav_page(soc_list(params),'SOC Investigation'))
    if path.startswith('/soc/'):
        ref=path[len('/soc/'):]
        if method=='GET':
            out=soc_detail(env,ref)
            if isinstance(out,tuple) and len(out)==3:return out
            b,c=out;return response(200,nav_page(b,'SOC Investigation'),headers=c)
        if method=='POST':return soc_post(env,ref,form)
    if path=='/fraud-simulator' and method=='GET':
        params['_raw']=env.get('QUERY_STRING','')
        return response(200,nav_page(fraud_page(params),'Fraud Training'))
    if path=='/zero-trust' and method=='GET':return response(200,nav_page(zero_page(params),'Zero Trust'))
    if path=='/disclosure':
        if method=='GET':b,c=disclosure_page(env);return response(200,nav_page(b,'Disclosure Training'),headers=c)
        if method=='POST':return disclosure_post(env,form)
    if path=='/awareness' and method=='GET':b,lang=awareness_page(params);return response(200,nav_page(b,'Awareness',lang))
    if path=='/training-showcase' and method=='GET':return response(200,nav_page(showcase(),'Case Showcase'))
    if path.startswith('/training-admin'):
        if HOSTED_DEMO and path in ('/training-admin','/training-admin/login'):
            # Legacy URL opens the *isolated demo staff* login, never the local training admin.
            return redirect('/service/staff/login' if path.endswith('/login') else '/service/staff')
        if not writable(env) or not ADMIN_HASH:return bad(404,'Local administrator unavailable in public mode')
        if path=='/training-admin/login':
            if method=='GET':b,c=login_page(env);return response(200,nav_page(b,'Admin login'),headers=c)
            if method=='POST':return do_admin_login(env,form)
        if path=='/training-admin':
            if method=='GET':
                b,c=admin_page(env)
                if b is None:return redirect('/training-admin/login')
                return response(200,nav_page(b,'Admin dashboard'),headers=c)
        if path=='/training-admin/logout' and method=='POST':
            if not csrf(env,form):return bad(403,'CSRF check failed')
            role=get_sess(env).get('role')
            if role:audit(role,'logout')
            return redirect('/training-admin/login',[make_cookie('cs_sess','',0)])
        if path.startswith('/training-admin/cases/') and path.endswith('/status') and method=='POST':return do_admin_status(env,path[len('/training-admin/cases/'):-len('/status')],form)
        return bad(404,'Unknown administration route')
    if method in ('GET','HEAD'):
        return static_response(path)
    return bad(405,'POST not supported on this public page')

SECURITY_HEADERS=[
 ('X-Content-Type-Options','nosniff'),('X-Frame-Options','DENY'),
 ('Referrer-Policy','strict-origin-when-cross-origin'),
 ('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()'),
 ('Cross-Origin-Opener-Policy','same-origin'),
 ('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"),
 ('Cache-Control','no-store')]

def application(environ,start_response):
    try:status,data,headers=dispatch(environ)
    except Exception:
        # Do not disclose stack traces, DB locations or secrets to public users.
        status,data,headers=response(500,nav_page(h1('Service unavailable','An internal error occurred. Please try again.'),'Service error'))
    headers+=SECURITY_HEADERS
    if environ.get('wsgi.url_scheme')=='https':headers.append(('Strict-Transport-Security','max-age=31536000; includeSubDomains'))
    start_response(f'{status} {status_text(status)}',headers)
    return [data] if environ.get('REQUEST_METHOD','GET').upper()!='HEAD' else [b'']

app=application # Gunicorn WSGI entry point: gunicorn app:app
initialize_database()
import service_portal
service_portal.initialize(__import__(__name__))
if __name__=='__main__':
    from wsgiref.simple_server import make_server, WSGIRequestHandler, WSGIServer
    from socketserver import ThreadingMixIn
    class ThreadedWSGIServer(ThreadingMixIn,WSGIServer):
        daemon_threads=True
    host='127.0.0.1';port=int(os.environ.get('CS_PORT','8080'))
    print(f'CYBER SURAKSHA 2.0 · Unified Website\nLocal URL: http://{host}:{port}/\nStop: Ctrl+C')
    with make_server(host,port,application,server_class=ThreadedWSGIServer,handler_class=WSGIRequestHandler) as srv:
        if os.environ.get('CS_AUTO_OPEN','0')=='1':
            try:
                import webbrowser
                webbrowser.open(f'http://{host}:{port}/')
            except Exception:pass
        try:srv.serve_forever()
        except KeyboardInterrupt:pass
