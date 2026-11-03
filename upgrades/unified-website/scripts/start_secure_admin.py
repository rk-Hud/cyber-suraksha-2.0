"""Local-only owner test runner, no default passwords or saved credentials."""
import getpass,os,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from app import hash_password
print('CYBER SURAKSHA 2.0 - localhost-only protected training admin')
password=getpass.getpass('Choose a strong local administrator password (12+ characters): ')
if len(password)<12 or len(password)>128:sys.exit('Password must be 12–128 characters. No server started.')
os.environ['CS_ADMIN_PASSWORD_HASH']=hash_password(password)
viewer=getpass.getpass('Optional viewer password (Enter to skip): ')
if viewer:
    if len(viewer)<12 or viewer==password:sys.exit('Viewer password must be different and at least 12 characters.')
    os.environ['CS_VIEWER_PASSWORD_HASH']=hash_password(viewer)
os.environ['CS_PUBLIC_MODE']='0';os.environ['CS_LOCAL_TRAINING']='1'
from wsgiref.simple_server import make_server
import app
# Update per-process imported env configuration before starting the server.
app.ADMIN_HASH=os.environ['CS_ADMIN_PASSWORD_HASH'];app.VIEWER_HASH=os.environ.get('CS_VIEWER_PASSWORD_HASH','')
app.PUBLIC_MODE=False;app.LOCAL_TRAINING=True
print('Visit http://127.0.0.1:8080/training-admin/login . Stop with Ctrl+C.')
with make_server('127.0.0.1',8080,app.application) as srv:
    try:srv.serve_forever()
    except KeyboardInterrupt:pass
