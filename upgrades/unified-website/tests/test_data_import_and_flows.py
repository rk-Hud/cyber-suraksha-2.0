import io,os,sqlite3,sys,tempfile,unittest,hashlib
from contextlib import closing
from pathlib import Path
from urllib.parse import urlencode
_suite_db=tempfile.TemporaryDirectory(prefix="cs-safe-test-db-")
os.environ["CS_DATA_DIR"]=_suite_db.name
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
from scripts.import_existing_db import import_db
import app

class AdditionalFlowTests(unittest.TestCase):
 def req(self,path):
    route,_,q=path.partition('?')
    env={'REQUEST_METHOD':'GET','PATH_INFO':route,'QUERY_STRING':q,'SERVER_NAME':'localhost','SERVER_PORT':'8080','SERVER_PROTOCOL':'HTTP/1.1','HTTP_HOST':'127.0.0.1:8080','REMOTE_ADDR':'127.0.0.1','wsgi.url_scheme':'http','wsgi.input':io.BytesIO(),'wsgi.errors':sys.stderr,'CONTENT_LENGTH':'0'}
    state={}
    def start(status,headers):state['code']=int(status.split()[0])
    return state,b''.join(app.application(env,start)).decode('utf8','replace')
 def test_fraud_response_scores_safe_choices(self):
    s,b=self.req('/fraud-simulator?scenario=collect_request&action=reject&action=verify&evaluate=1')
    self.assertEqual(s['code'],200);self.assertIn('100/100',b)
 def test_fraud_response_scores_unsafe_choices(self):
    _,b=self.req('/fraud-simulator?scenario=collect_request&action=approve&evaluate=1')
    self.assertIn('0/100',b)
 def test_multilingual_knowledge_score(self):
    for lang in ('en','hi','te'):
        with self.subTest(lang=lang):
            _,b=self.req('/awareness?lang='+lang+'&check=1&q0=1&q1=1&q2=2')
            self.assertIn('3 / 3',b)
 def test_public_health_and_private_case_exclusion(self):
    app.PUBLIC_MODE=True
    _,b=self.req('/health');self.assertIn('government_approved',b)
 def test_database_merge_is_additive_and_backed_up(self):
    with tempfile.TemporaryDirectory() as temp:
        src=Path(temp)/'old/cyber_suraksha.db';src.parent.mkdir(parents=True)
        dst=Path(temp)/'new/cyber_suraksha.db';dst.parent.mkdir(parents=True)
        with closing(sqlite3.connect(src)) as db, db:
            db.execute('CREATE TABLE incidents (id INTEGER PRIMARY KEY, reference TEXT UNIQUE, created_at TEXT, incident_type TEXT, channel TEXT,incident_date TEXT,amount REAL,contact_name TEXT,contact_phone TEXT,description TEXT,evidence_note TEXT,status TEXT,is_demo INTEGER)')
            db.execute('INSERT INTO incidents(reference,created_at,incident_type,channel,incident_date,amount,contact_name,contact_phone,description,evidence_note,status,is_demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',('CS-OLD-PRIVATE','2026-11-01','Other','SMS','2026-11-01',0,'PERSONAL-DO-NOT-SHOW','111222333','sensitive local record','private','Received',0))
        import shutil
        shutil.copy2(app.DB_FILE,dst)
        original_hash=hashlib.sha256(src.read_bytes()).hexdigest()
        backup,counts=import_db(src,dst)
        self.assertTrue(backup.is_file())
        self.assertEqual(counts.get('incidents'),1)
        self.assertEqual(hashlib.sha256(src.read_bytes()).hexdigest(),original_hash)
        with closing(sqlite3.connect(dst)) as db:
            r=db.execute("SELECT is_demo,contact_name FROM incidents WHERE reference='CS-OLD-PRIVATE'").fetchone()
            self.assertEqual(r,(0,'PERSONAL-DO-NOT-SHOW'))
        other,counts=import_db(src,dst)
        self.assertEqual(counts.get('incidents'),0)
if __name__=='__main__':unittest.main()
