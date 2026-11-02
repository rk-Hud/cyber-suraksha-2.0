"""Offline pre-publish checks. Run: python scripts/check_release.py"""
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
required = ['app.py', 'requirements.txt', 'render.yaml', 'README.md',
            'SECURITY.md', 'CONTRIBUTING.md', 'LICENSE', 'templates/index.html',
            'static/style.css', 'static/app.js', 'tests/test_app.py']
missing = [x for x in required if not (root / x).is_file()]
unsafe = [p for p in root.rglob('*') if p.is_file() and
          (p.suffix.lower() in {'.db', '.sqlite', '.sqlite3', '.env'} or p.name == '.env')]
if missing: print('MISSING:', *missing, sep='\n - ')
if unsafe: print('PRIVATE FILES — DO NOT UPLOAD:', *[str(p.relative_to(root)) for p in unsafe], sep='\n - ')
print('Project release file check:', 'PASS' if not missing and not unsafe else 'REVIEW REQUIRED')
sys.exit(0 if not missing and not unsafe else 1)
