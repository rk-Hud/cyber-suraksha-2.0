"""Verify all distributed source files against SHA-256 release manifest."""
from pathlib import Path
import hashlib,json,sys
root=Path(__file__).resolve().parent.parent
manifest=root/'RELEASE_SHA256_MANIFEST.json'
try:info=json.loads(manifest.read_text(encoding='utf-8'))
except Exception as error:sys.exit('Cannot read manifest: '+str(error))
failed=[]
for rel,sha in info['files'].items():
    file=root/rel
    if not file.is_file():failed.append(rel+' (missing)');continue
    actual=hashlib.sha256(file.read_bytes()).hexdigest()
    if actual!=sha:failed.append(rel+' (modified)')
print('CYBER SURAKSHA 2.0 - '+str(len(info['files']))+' release files checked')
if failed:sys.exit('FAILED: '+'; '.join(failed[:20]))
print('PASS: all source files match the packaged SHA-256 manifest.')
