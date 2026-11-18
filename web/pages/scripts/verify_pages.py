"""Check generated project paths, account routes and the private-tool boundary."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'docs'
CONFIG = json.loads((ROOT / 'source/site.json').read_text())
BASE = CONFIG['base_path']
ORIGIN = CONFIG['origin']
LOCAL_TOOLS = ('scam_checker.js', 'tools.js', 'ui.js')
ACCOUNT_VIEWS = {'admin', 'register', 'cases'}

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.paths = []
        self.canonical = None
        self.base = None
        self.forms = []
        self.csp = None
        self.api_url = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            assert a['id'] not in self.ids
            self.ids.add(a['id'])
        if tag == 'html':
            self.base = a.get('data-base-path')
            self.api_url = a.get('data-api-url')
        if tag == 'link' and a.get('rel') == 'canonical':
            self.canonical = a['href']
        if tag == 'meta' and a.get('http-equiv') == 'Content-Security-Policy':
            self.csp = a['content']
        if tag == 'form':
            self.forms.append(a.get('action'))
        if tag in ('a', 'link', 'script', 'img'):
            value = a.get('href', a.get('src', ''))
            if value.startswith(('/', '#')):
                self.paths.append(value)


def parse(path):
    document = Page()
    document.feed(path.read_text())
    return document


def resolve(path):
    parsed = urlsplit(path)
    assert parsed.path == BASE or parsed.path.startswith(BASE + '/'), path
    relative = parsed.path[len(BASE):].lstrip('/')
    candidate = SITE / relative
    if parsed.path.endswith('/'):
        candidate /= 'index.html'
    assert candidate.is_file(), path
    return candidate, parsed.fragment


pages = {p: parse(p) for p in SITE.rglob('*.html')}
assert len(pages) == 7
for p, document in pages.items():
    relative = p.relative_to(SITE).as_posix()
    lang = 'en' if relative == 'index.html' else relative[:2]
    account = p.name == 'account.html'
    assert document.base == BASE
    assert document.api_url == CONFIG.get('api_url', '').rstrip('/')
    assert document.canonical == f'{ORIGIN}{BASE}/{lang}/' + ('account.html' if account else '')
    if account:
        assert document.forms and all(action == '#' for action in document.forms)
    else:
        assert len(document.forms) == 4
        assert all(action.startswith(f'{BASE}/{lang}/#') for action in document.forms)
    assert "form-action 'none'" in document.csp
    connect = re.search(r'connect-src ([^;]+)', document.csp).group(1)
    expected = "'self'"
    if document.api_url:
        u = urlsplit(document.api_url)
        expected += ' ' + u.scheme + '://' + u.netloc
    assert connect == expected and '*' not in connect
    for path in document.paths:
        if path.startswith('#'):
            assert path[1:] in document.ids or account and path[1:] in ACCOUNT_VIEWS, path
        else:
            candidate, fragment = resolve(path)
            if fragment:
                target = pages.get(candidate) or parse(candidate)
                assert fragment in target.ids or candidate.name == 'account.html' and fragment in ACCOUNT_VIEWS, path

assert (SITE / '.nojekyll').is_file()
for p in SITE.rglob('*'):
    if p.is_file():
        text = p.read_text()
        if p.name in LOCAL_TOOLS:
            assert not re.search(r'\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage)\s*(?:\(|\.)', text), p
        if p.suffix == '.js':
            assert not re.search(r'\b(?:localStorage|sessionStorage|indexedDB|sendBeacon)\b', text), p
            assert not re.search(r'\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(', text), p
print(json.dumps({'pages': len(pages), 'base_path': BASE, 'local_links_and_fragments': 'passed', 'canonical_urls': 'passed', 'private_tools_offline': 'passed', 'account_csp': 'passed', 'asset_privacy_scan': 'passed'}))
