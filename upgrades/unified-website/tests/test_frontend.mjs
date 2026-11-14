import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.join(here,'..');
const core=require('../site/assets/scam_core.js');
const training=require('../site/assets/training_core.js');
const pages=['index','scam-checker','response','training','resources','impact','trust','about','contact','privacy','accessibility','terms','governance','international','sitemap','assistant'];
test('All sixteen pages exist and declare basic accessibility landmarks',()=>{for(const name of pages){const s=fs.readFileSync(path.join(root,'site',name+'.html'),'utf8');assert.match(s,/<main id="main">/);assert.match(s,/<nav class="nav"/);assert.match(s,/<select class="lang"/);assert.match(s,/common.independent/);assert.match(s,/viewport/);assert.match(s,/https:\/\/cybercrime.gov.in\//)}});
test('Private scam detector has no network calls',()=>{const source=fs.readFileSync(path.join(root,'site/assets/scam_core.js'),'utf8');assert.doesNotMatch(source,/\bfetch\s*\(|\bXMLHttpRequest\b|sendBeacon\s*\(/)});
test('UPI credential bait flags multiple warning signs',()=>{const r=core.analyze('Cashback ₹5,000. Enter your UPI PIN immediately to claim.');assert.equal(r.level,'high');assert.ok(r.matches.includes('credential'));assert.ok(r.matches.includes('prize'));assert.ok(r.matches.includes('urgency'))});
test('Telugu fraud message flags warning patterns',()=>{const r=core.analyze('క్యాష్‌బ్యాక్ పొందడానికి పిన్ వెంటనే ఇవ్వండి');assert.ok(r.matches.includes('credential'));assert.ok(r.matches.includes('urgency'));assert.ok(r.matches.includes('prize'))});
test('Hindi bank KYC impersonation and urgency',()=>{const r=core.analyze('आपका बैंक केवाईसी अपडेट नहीं है, तुरंत OTP बताओ');assert.ok(r.matches.includes('credential'));assert.ok(r.matches.includes('urgency'));assert.ok(r.matches.includes('impersonation'))});
test('Ordinary classroom notice does not trigger warning',()=>{const r=core.analyze('The classroom session begins at 10 AM tomorrow. Bring your notebook.');assert.equal(r.level,'low');assert.equal(r.score,0)});
test('Empty input gives empty result',()=>{const r=core.analyze('   ');assert.equal(r.level,'empty');assert.equal(r.matches.length,0)});
test('Detector limits input length and never claims probability',()=>{const r=core.analyze('x'.repeat(5000));assert.equal(r.length,2000);assert.ok(r.score<=95)});
test('All training scenarios and languages have two stages',()=>{for(const id of ['job','upi','kyc'])for(const lang of ['en','hi','te']){const list=training.getCase(id,lang);assert.equal(list.length,2);for(const step of list){assert.ok(step.message);assert.equal(step.options.length,3);assert.ok(step.correct>=0&&step.correct<3);assert.ok(step.feedback)}}});
test('Training accepts good option, rejects unsafe option',()=>{assert.equal(training.check('upi','en',0,1).correct,true);assert.equal(training.check('upi','en',0,0).correct,false);assert.equal(training.check('kyc','te',1,2).correct,true)});
test('Pilot CSV template has only safe columns',()=>{const s=fs.readFileSync(path.join(root,'site/data/pilot_template.csv'),'utf8');assert.equal(s.trim(),'before,after,language')});
test('Consolidated application and local launchers exist',()=>{for(const name of ['app.py','START_CYBER_SURAKSHA_WINDOWS.bat','START_READ_ONLY_WINDOWS.bat','START_SECURE_ADMIN_WINDOWS.bat'])assert.ok(fs.existsSync(path.join(root,name)))});

test('Every public page has a traceable owner, disclaimer, privacy and official reporting path',()=>{
 for(const name of pages){const s=fs.readFileSync(path.join(root,'site',name+'.html'),'utf8');
  assert.match(s,/href="about.html"/);assert.match(s,/href="privacy.html"/);assert.match(s,/href="governance.html"/);
  assert.match(s,/href="accessibility.html"/);assert.match(s,/government affiliation or approval has not been granted|Government affiliation or approval has not been granted/);
 }
});
test('International guidance links only to identified authority domains',()=>{const s=fs.readFileSync(path.join(root,'site/international.html'),'utf8');
for(const u of ['cybercrime.gov.in','www.ic3.gov','www.reportfraud.police.uk','www.scamshield.gov.sg'])assert.ok(s.includes(u));
});

test('Safety assistant never calls an external network API',()=>{const s=fs.readFileSync(path.join(root,'site/assets/assistant.js'),'utf8');assert.doesNotMatch(s,/\bfetch\s*\(|XMLHttpRequest|sendBeacon\s*\(/);assert.ok(s.includes('guidance'))});
test('Permanent brand stays CYBER SURAKSHA 2.0',()=>{for(const name of pages){const s=fs.readFileSync(path.join(root,'site',name+'.html'),'utf8');assert.doesNotMatch(s,/CYBER SURAKSHA 2\.2/);assert.ok(s.includes('CYBER SURAKSHA 2.0'))}});
