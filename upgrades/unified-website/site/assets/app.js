'use strict';
document.addEventListener('DOMContentLoaded',()=>{
  const langs=document.getElementById('lang-select');if(langs)langs.addEventListener('change',ev=>window.CyberI18n.setLang(ev.target.value));
  const menu=document.getElementById('menu-btn'),nav=document.getElementById('nav');if(menu&&nav)menu.addEventListener('click',()=>{const x=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(x))});
  const page=location.pathname.split('/').pop()||'index.html';document.querySelectorAll('.nav a[data-page]').forEach(a=>{if(a.dataset.page===page){a.classList.add('active');a.setAttribute('aria-current','page')}});
  // The entire platform is served from this same origin; keep all integrated links local.
  document.querySelectorAll('[data-legacy]').forEach(a=>{const p=a.getAttribute('data-legacy');if(p?.startsWith('/'))a.href=p});
  window.CyberI18n.apply();
});
