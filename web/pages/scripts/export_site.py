"""Build the static multilingual UI; account requests go only to the configured API."""
from __future__ import annotations
import argparse,json,re,shutil,tempfile
from datetime import datetime
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo
from jinja2 import Environment,FileSystemLoader,StrictUndefined,select_autoescape

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'source';OUTPUT=ROOT/'docs';LANGUAGES=('en','hi','te')
LOCAL_TOOLS=('scam_checker.js','tools.js','ui.js')

def read_json(name):return json.loads((SOURCE/'data'/name).read_text())
def asset_url(endpoint,*,filename):
 if endpoint!='static' or '..' in Path(filename).parts or filename.startswith('/'):raise ValueError('Invalid asset')
 return '/static/'+filename

def api_configuration(value):
 if not value:return '',"'self'"
 if not isinstance(value,str) or any(c.isspace() or ord(c)<32 for c in value):raise ValueError('API URL must be an HTTPS URL')
 u=urlsplit(value)
 if u.scheme!='https' or not u.hostname or u.username or u.password or u.query or u.fragment:raise ValueError('API URL must be an HTTPS URL without credentials/query/fragment')
 try:u.port
 except ValueError:raise ValueError('Invalid API port') from None
 return value.rstrip('/'),"'self' "+u.scheme+'://'+u.netloc

class CopyBindings(HTMLParser):
 """Annotate authored labels for safe text-only CMS updates, never form values."""
 def __init__(self):super().__init__(convert_charrefs=False);self.parts=[];self.stack=[]
 def handle_starttag(self,tag,attrs):
  raw=self.get_starttag_text()
  for name,value in attrs:
   if name in ('aria-label','placeholder','title') and value:
    match=re.fullmatch(r"\{\{\s*t\('([^']+)'\)\s*\}\}",value)
    if match:raw=raw[:-1]+f' data-copy-{name}="{match[1]}">'
  self.parts.append(raw)
  if tag not in ('area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'):self.stack.append((tag,len(self.parts)-1))
 def handle_endtag(self,tag):
  self.parts.append('</'+tag+'>')
  for index in range(len(self.stack)-1,-1,-1):
   if self.stack[index][0]==tag:self.stack=self.stack[:index];break
 def handle_startendtag(self,tag,attrs):self.parts.append(self.get_starttag_text())
 def handle_decl(self,decl):self.parts.append('<!'+decl+'>')
 def handle_comment(self,data):self.parts.append('<!--'+data+'-->')
 def handle_entityref(self,name):self.parts.append('&'+name+';')
 def handle_charref(self,name):self.parts.append('&#'+name+';')
 def handle_data(self,data):
  if self.stack and self.stack[-1][0] in ('script','style','textarea'):self.parts.append(data);return
  expression=re.compile(r"\{\{\s*t\('([^']+)'\)\s*\}\}")
  if self.stack and self.stack[-1][0] in ('option','title'):
   match=expression.fullmatch(data.strip())
   if match:
    index=self.stack[-1][1];self.parts[index]=self.parts[index][:-1]+f' data-copy-key="{match[1]}">'
   self.parts.append(data);return
  self.parts.append(expression.sub(lambda m:f'<span data-copy-key="{m[1]}">{m[0]}</span>',data))

def bind_copy(template):
 parser=CopyBindings();parser.feed(template);return ''.join(parser.parts)

class DocumentAudit(HTMLParser):
 def __init__(self):super().__init__();self.ids=[];self.paths=[];self.names=[];self.remote=[];self.lang=None;self.disclosures={};self.visible=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='html':self.lang=a.get('lang')
  if a.get('id'):self.ids.append(a['id'])
  if tag=='details' and a.get('id'):self.disclosures[a['id']]='open' in a
  if tag in ('input','textarea','select') and a.get('name'):self.names.append(a['name'])
  link=a.get('href',a.get('src',''))
  if tag in ('a','script','link','img') and link.startswith('/'):self.paths.append(link)
  if (tag in ('script','img') or tag=='link' and a.get('rel') in ('stylesheet','icon')) and link.startswith(('https://','http://','//')):self.remote.append(link)
 def handle_data(self,data):self.visible.append(data)

def validate_page(content,language,account=False,reading=False,test_workspace=False):
 a=DocumentAudit();a.feed(content)
 if a.lang!=language or len(a.ids)!=len(set(a.ids)) or a.remote:raise ValueError('Language, duplicate identifiers or remote asset failure')
 if not account and not reading:
  if a.names:raise ValueError('Local citizen tools may not have submission names')
  if content.count('<tr data-group=')!=20 or a.disclosures!={'resources-details':False}:raise ValueError('Directory is incomplete or expanded')
  if 'id="checker-form"' not in content or 'id="citizen"' not in content:raise ValueError('Citizen tools missing')
 elif account:
  if 'id="account-app"' not in content or 'id="account-register"' not in content or 'id="account-new-case"' not in content:raise ValueError('Account interface missing')
 if any(f'id="{removed}"' in content for removed in ('soc','glossary','operations')):raise ValueError('Removed section returned')
 if not test_workspace and re.search(r'\b(demo|preview|staging)\b',' '.join(a.visible),re.I):raise ValueError('Release-state wording remains')
 if 'Jatoth Ramakrishna' not in content:raise ValueError('Owner attribution missing')
 if 'form-action \'none\'' not in content:raise ValueError('Native form posts must fail closed')
 return a.paths

def main(argv=None):
 global OUTPUT
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--config',type=Path,default=SOURCE/'site.json',help='Public build settings; never include secrets')
 parser.add_argument('--output',type=Path,default=ROOT/'docs',help='Separate output directory for an isolated build')
 args=parser.parse_args(argv)
 OUTPUT=args.output.resolve()
 if OUTPUT==ROOT or OUTPUT==SOURCE or OUTPUT in SOURCE.parents or OUTPUT.is_relative_to(SOURCE):raise ValueError('Output may not replace source files')
 dictionaries={lang:read_json(f'ui_{lang}.json') for lang in LANGUAGES}
 keys=set(dictionaries['en'])
 if any(set(d)!=keys or any(not isinstance(v,str) or not v.strip() for v in d.values()) for d in dictionaries.values()):raise ValueError('Translation parity or content failure')
 site=json.loads(args.config.read_text());origin=site['origin'];base=site.get('base_path','')
 if not isinstance(base,str) or not re.fullmatch(r'(?:/[A-Za-z0-9][A-Za-z0-9._-]*)*',base):raise ValueError('Invalid base path')
 u=urlsplit(origin)
 if u.scheme!='https' or not u.hostname or u.path or u.query or u.fragment:raise ValueError('Invalid canonical origin')
 api_url,csp_connect=api_configuration(site.get('api_url',''))
 test_workspace=site.get('test_workspace',False)
 if not isinstance(test_workspace,bool):raise ValueError('test_workspace must be a boolean')
 operator_api_url,csp_operator_connect=api_configuration(site.get('operator_api_url',''))
 if operator_api_url and not test_workspace:raise ValueError('Operator service URL is test-workspace only')
 if operator_api_url and urlsplit(operator_api_url).hostname != 'br-sweet-band-azhwai4r-csownerstage.compute.c-3.ap-southeast-1.aws.neon.tech':
  raise ValueError('Operator API must use the approved isolated staging branch')
 google_client_id=site.get('google_client_id','')
 if not isinstance(google_client_id,str) or google_client_id and not re.fullmatch(r'[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com',google_client_id):raise ValueError('Invalid Google OAuth web client ID')
 agencies=read_json('agencies.json');advisory=read_json('advisory.json')
 if len(agencies)!=20 or len({a['id'] for a in agencies})!=20:raise ValueError('Expected twenty unique agencies')
 environment=Environment(loader=FileSystemLoader(SOURCE/'templates'),autoescape=select_autoescape(('html',)),undefined=StrictUndefined)
 environment.globals['url_for']=lambda endpoint,**args:base+asset_url(endpoint,**args)
 # Work from annotated template copies so source edits remain ordinary Jinja/HTML.
 template_dir=Path(tempfile.mkdtemp(prefix='cybersuraksha-templates-'))
 for p in (SOURCE/'templates').glob('*.html'):(template_dir/p.name).write_text(bind_copy(p.read_text()))
 environment.loader=FileSystemLoader(template_dir)
 if OUTPUT.exists():
  if not OUTPUT.is_dir() or any(OUTPUT.iterdir()) and not (OUTPUT/'.nojekyll').is_file():raise ValueError('Refusing to replace a non-build output directory')
  shutil.rmtree(OUTPUT)
 OUTPUT.mkdir(parents=True);shutil.copytree(SOURCE/'static',OUTPUT/'static')
 for name in ('humans.txt','SECURITY.md'):shutil.copyfile(SOURCE/name,OUTPUT/name)
 linked=[]
 for lang in LANGUAGES:
  copy=dictionaries[lang]
  data=json.dumps(copy,ensure_ascii=False,separators=(',',':')).replace('\u2028','\\u2028').replace('\u2029','\\u2029')
  (OUTPUT/'static/js'/f'account_copy_{lang}.js').write_text('window.CyberSurakshaAccountCopy=Object.freeze('+data+');\n')
  directory=OUTPUT/lang;directory.mkdir()
  context=dict(test_workspace=test_workspace,site_origin=origin,base_path=base,api_url=api_url,csp_connect=csp_connect,csp_operator_connect=csp_operator_connect,operator_api_url=operator_api_url,google_client_id=google_client_id,lang=lang,t=lambda key,d=copy:d[key],year=datetime.now(ZoneInfo('Asia/Kolkata')).year,agencies=agencies,advisory=advisory)
  pages=[(False,False,'index.html','index.html'),(True,False,'account.html','account.html'),(False,True,'privacy.html','legal.html'),(False,True,'terms.html','legal.html')]
  if test_workspace:pages.append((False,True,'operator.html','operator.html'))
  for account,reading,name,template in pages:
   filename='' if name=='index.html' else name
   content=environment.get_template(template).render(**context,is_account=account,is_operator=(name=='operator.html'),page_filename=filename,legal_kind='privacy' if name=='privacy.html' else 'terms')
   content='\n'.join(line.rstrip() for line in content.splitlines())+'\n'
   linked+=validate_page(content,lang,account,reading,test_workspace=test_workspace)
   (directory/name).write_text(content)
   if lang=='en' and name=='index.html':(OUTPUT/'index.html').write_text(content)
 for link in linked:
  path=link.split('#',1)[0]
  if base and not(path==base or path.startswith(base+'/')):raise ValueError('Local link escapes project: '+path)
  relative=path[len(base):] if base else path
  p=OUTPUT/relative.lstrip('/')
  if path.endswith('/'):p/='index.html'
  if not p.is_file():raise ValueError('Broken local link: '+path)
 for name in LOCAL_TOOLS:
  text=(OUTPUT/'static/js'/name).read_text()
  if re.search(r'\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage)\s*(?:\(|\.)',text):raise ValueError('Local-tool networking/storage: '+name)
 (OUTPUT/'.nojekyll').touch();shutil.rmtree(template_dir)
 print(f'Built localized pages, {len(keys)} matching UI keys, private local tools and configured account API.')

if __name__=='__main__':main()
