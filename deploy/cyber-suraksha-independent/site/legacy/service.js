/* Independent public response guidance — no personal information requested. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const words = {
    en: {
      plannerTitle:'Get your next steps, now.',
      plannerDesc:'Choose what happened. Receive a practical response checklist immediately. No name, email, phone number or complaint details are requested or stored.',
      plannerSafety:'Private by design: category-only inputs, no report submission.',
      plannerLimit:"If you lost money, contact your bank and India's 1930 helpline promptly. For a police complaint, use the official portal.",
      plannerOfficial:'Open the official cybercrime portal ↗',
      incidentLabel:'What best describes the incident?',
      typePayment:'UPI / bank payment fraud', typePhishing:'Suspicious link or phishing message',
      typeAccount:'Account compromise', typeDevice:'Device malware or ransomware',
      lostMoney:'Money was taken or transferred without authorization',
      makePlan:'Create action plan', downloadPlan:'Download checklist',
      notPolice:'This provides independent guidance. It does not submit a police complaint.',
      resultTitle:'Recommended actions', problem:'The guidance service is unavailable. Please use official reporting channels.',
      doNotShare:'Do not enter or send passwords, OTPs, account details or evidence here.',
      ready:'Your checklist is ready. Official complaint submission is handled by the government portal.',
      resource:'National Cyber Crime Reporting Portal', downloadableTitle:'CYBER SURAKSHA 2.0 — Personal action checklist',
    },
    te: {
      plannerTitle:'తదుపరి సురక్షిత చర్యలను తెలుసుకోండి.',
      plannerDesc:'ఏం జరిగిందో ఎంచుకోండి. వెంటనే చర్యల జాబితా పొందండి. పేరు, ఇమెయిల్, ఫోన్ లేదా ఫిర్యాదు వివరాలు అడగము, నిల్వ చేయము.',
      plannerSafety:'గోప్యతకు ప్రాధాన్యం: సంఘటన రకం మాత్రమే, పోలీసు ఫిర్యాదు కాదు.',
      plannerLimit:'డబ్బు పోయినట్లయితే వెంటనే బ్యాంకును, 1930 హెల్ప్‌లైన్‌ను సంప్రదించండి. అధికారిక ఫిర్యాదుకు జాతీయ పోర్టల్‌ను ఉపయోగించండి.',
      plannerOfficial:'అధికారిక సైబర్ నేర పోర్టల్‌ను తెరవండి ↗',
      incidentLabel:'ఏ రకమైన సమస్య ఎదురైంది?',
      typePayment:'UPI / బ్యాంక్ చెల్లింపు మోసం',typePhishing:'అనుమానాస్పద లింక్ లేదా ఫిషింగ్',
      typeAccount:'ఖాతా దుర్వినియోగం',typeDevice:'పరికరం మాల్వేర్ లేదా ర్యాన్సమ్‌వేర్',
      lostMoney:'నా అనుమతి లేకుండా డబ్బు బదిలీ అయింది',
      makePlan:'చర్యల జాబితా తయారు చేయండి',downloadPlan:'జాబితాను డౌన్‌లోడ్ చేయండి',
      notPolice:'ఇది స్వతంత్ర మార్గదర్శకం మాత్రమే. పోలీసు ఫిర్యాదు సమర్పించదు.',
      resultTitle:'సిఫార్సు చేసిన చర్యలు',problem:'మార్గదర్శక సేవ అందుబాటులో లేదు. అధికారిక ఫిర్యాదు మార్గాన్ని ఉపయోగించండి.',
      doNotShare:'ఇక్కడ పాస్‌వర్డ్‌లు, OTPలు, ఖాతా వివరాలు లేదా ఆధారాలు ఇవ్వకండి.',
      ready:'మీ చర్యల జాబితా సిద్ధమైంది. అధికారిక ఫిర్యాదులు ప్రభుత్వ పోర్టల్ ద్వారా చేయాలి.',
      resource:'జాతీయ సైబర్ నేర ఫిర్యాదు పోర్టల్',downloadableTitle:'CYBER SURAKSHA 2.0 — వ్యక్తిగత చర్యల జాబితా',
    }
  };
  let steps = [];
  let currentLanguage = 'en';
  const output = byId('planOutput');
  const download = byId('downloadPlan');
  const form = byId('incidentForm');
  if (!output || !download || !form) return;
  const tr = k => words[currentLanguage][k] || k;
  function translate() {
    currentLanguage = byId('lang')?.value === 'te' ? 'te' : 'en';
    for (const node of document.querySelectorAll('[data-service]')) {
      node.textContent = tr(node.getAttribute('data-service'));
    }
    // Results remain in the language of the last submitted plan until regenerated.
  }
  function render(data) {
    steps = data.steps;
    output.replaceChildren();
    const title = document.createElement('h3'); title.textContent = tr('resultTitle');
    const list = document.createElement('ol');
    for (const step of steps) {
      const item=document.createElement('li');item.textContent=step;list.append(item);
    }
    const caution=document.createElement('p');caution.textContent=tr('doNotShare');
    const link=document.createElement('a');link.href='https://cybercrime.gov.in/';
    link.target='_blank';link.rel='noopener noreferrer';link.textContent=tr('resource')+' ↗';
    output.append(title,list,caution,link);
    output.hidden=false;download.hidden=false;
  }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const incident_type=byId('incidentType').value;
    const financial_loss=byId('financialLoss').checked;
    const language=currentLanguage;
    const button=byId('makePlan');button.disabled=true;
    try {
      const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),7000);
      let response;
      try {
        response=await fetch('/api/v1/guidance',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({incident_type,financial_loss,language}),
          cache:'no-store',signal:controller.signal
        });
      } finally {clearTimeout(timer)}
      if (!response.ok) throw new Error('Guidance unavailable');
      const data=await response.json();
      if (!Array.isArray(data.steps) || !data.independent_guidance || data.official_complaint_submitted!==false) throw new Error('Unexpected response');
      render(data);
    } catch(_) {
      steps=[];download.hidden=true;output.hidden=false;output.textContent=tr('problem');
    } finally {button.disabled=false}
  });
  download.addEventListener('click',()=>{
    if (!steps.length) return;
    const content=[tr('downloadableTitle'),'',...steps.map((s,i)=>`${i+1}. ${s}`),'',tr('doNotShare'),tr('ready'),'https://cybercrime.gov.in/','1930'].join('\n');
    const blob=new Blob([content],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob); const link=document.createElement('a');
    link.href=url;link.download='cyber-suraksha-action-plan.txt';link.click();
    URL.revokeObjectURL(url);
  });
  byId('lang')?.addEventListener('change',translate);
  translate();
})();
