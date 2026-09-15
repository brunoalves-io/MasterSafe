(() => {
  'use strict';
  const $ = id => document.getElementById(id);

  const ICONS = {
    home:'<svg viewBox="0 0 24 24"><path d="M3 10.8 12 3l9 7.8v9.2H15v-6H9v6H3z"/></svg>',
    documents:'<svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 11h6M9 15h6"/></svg>',
    radar:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 12 17 7M12 4v3M4 12h3M12 17v3"/></svg>',
    account:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-4 3.2-6 7-6s6.2 2 7 6"/></svg>',
    settings:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.8-.8-1.9.9-1.8-2.1-2.1-1.8.9-1.9-.8-.8-2h-3l-.8 2-1.9.8-1.8-.9L1.9 6l.9 1.8-.8 1.9-2 .8v3l2 .8.8 1.9-.9 1.8 2.1 2.1 1.8-.9 1.9.8.8 2h3l.8-2 1.9-.8 1.8.9 2.1-2.1-.9-1.8.8-1.9z" transform="translate(2 0) scale(.83)"/></svg>',
    bell:'<svg viewBox="0 0 24 24"><path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 6 2.5 6 2.5 7.5H4c0-1.5 2.5-1.5 2.5-7.5Z"/><path d="M9.5 20h5"/></svg>'
  };

  function ensureFinalCss(){
    if(!document.querySelector('link[data-mastersafe-final-ui]')){
      const link=document.createElement('link');
      link.rel='stylesheet';
      link.href='mockup-final.css?v=7.8.3';
      link.setAttribute('data-mastersafe-final-ui','1');
      document.head.appendChild(link);
    }
    if(!document.querySelector('link[data-mastersafe-text-fix]')){
      const link=document.createElement('link');
      link.rel='stylesheet';
      link.href='ui-text-fix.css?v=7.8.3';
      link.setAttribute('data-mastersafe-text-fix','1');
      document.head.appendChild(link);
    }
  }

  function navIcons(){
    const map={home:'home',documents:'documents',radar:'radar',account:'account',settings:'settings'};
    document.querySelectorAll('.nav-item[data-view]').forEach(btn=>{
      const span=btn.querySelector('span');
      if(span&&map[btn.dataset.view]) span.innerHTML=ICONS[map[btn.dataset.view]];
    });
  }

  function singleBell(){
    document.querySelectorAll('.concept-bell,.exact-bell,.final-bell').forEach(n=>n.remove());
    const top=document.querySelector('.topbar');
    const add=$('addDocumentTop');
    if(!top||!add) return;
    const bell=document.createElement('button');
    bell.type='button';
    bell.className='final-bell';
    bell.title='Notificações';
    bell.setAttribute('aria-label','Notificações');
    bell.innerHTML=ICONS.bell;
    bell.addEventListener('click',()=>document.querySelector('.nav-item[data-view="radar"]')?.click());
    top.insertBefore(bell,add);
  }

  function heroSvg(){
    return `<svg viewBox="0 0 760 220" aria-hidden="true">
      <defs>
        <linearGradient id="mfWingA" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8bc8ff" stop-opacity=".34"/><stop offset="1" stop-color="#4f6fff" stop-opacity=".12"/></linearGradient>
        <linearGradient id="mfWingB" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#4fa8ff" stop-opacity=".25"/><stop offset="1" stop-color="#7e73ff" stop-opacity=".11"/></linearGradient>
        <linearGradient id="mfShield" x1=".2" y1="0" x2=".8" y2="1"><stop stop-color="#e9f7ff" stop-opacity=".96"/><stop offset=".45" stop-color="#7bc2ff" stop-opacity=".76"/><stop offset="1" stop-color="#6e6dff" stop-opacity=".76"/></linearGradient>
        <filter id="mfBlur"><feGaussianBlur stdDeviation="13"/></filter>
        <filter id="mfShadow"><feDropShadow dx="0" dy="13" stdDeviation="13" flood-color="#4e78d8" flood-opacity=".18"/></filter>
      </defs>
      <ellipse cx="305" cy="176" rx="260" ry="53" fill="#65aaff" opacity=".13" filter="url(#mfBlur)"/>
      <path d="M70 165C150 102 220 27 292 42c51 11 73 68 111 103-78 38-220 57-333 20Z" fill="url(#mfWingA)"/>
      <path d="M216 197c47-78 118-145 198-153 57-6 109 31 171 78-95 53-240 84-369 75Z" fill="url(#mfWingB)"/>
      <path d="M175 30c59 39 106 73 155 131-42-3-90-16-120-43-26-24-37-56-35-88Z" fill="#6baeff" opacity=".13"/>
      <g transform="translate(180 20)" filter="url(#mfShadow)">
        <path d="M85 5 157 31v58c0 58-33 100-72 127C46 189 13 147 13 89V31Z" fill="url(#mfShield)" stroke="#fff" stroke-opacity=".9" stroke-width="5"/>
        <path d="M48 103 74 128 124 75" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity=".94"/>
        <path d="M85 6 157 31v58c0 58-33 100-72 127" fill="none" stroke="#8dc9ff" stroke-opacity=".44" stroke-width="2"/>
      </g>
    </svg>`;
  }

  function homeHero(){
    const row=$('view-home')?.querySelector('.hero-row');
    if(!row) return;
    row.querySelectorAll('.concept-hero-art,.exact-hero-art,.final-hero-art').forEach(n=>n.remove());
    const h2=row.querySelector('h2');
    if(h2) h2.innerHTML='Está tudo no <span class="accent-word">lugar.</span>';
    const art=document.createElement('div');
    art.className='final-hero-art';
    art.innerHTML=heroSvg()+'<div class="final-hero-copy">Mais segurança<br>para o que importa.</div>';
    row.appendChild(art);
  }

  function normalizeSectionTitles(){
    const titles={
      'view-documents':'Seus documentos',
      'view-radar':'Radar',
      'view-account':'Seu Cofre, sob seu controle',
      'view-settings':'Configurações'
    };
    Object.entries(titles).forEach(([viewId,text])=>{
      const h2=$(viewId)?.querySelector('.section-title-row h2');
      if(!h2) return;
      h2.textContent=text;
      h2.style.setProperty('color','#0b1732','important');
      h2.style.setProperty('-webkit-text-fill-color','#0b1732','important');
      h2.style.setProperty('background','none','important');
      h2.style.setProperty('background-image','none','important');
      h2.style.setProperty('-webkit-background-clip','border-box','important');
      h2.style.setProperty('background-clip','border-box','important');
      h2.style.setProperty('opacity','1','important');
      h2.style.setProperty('visibility','visible','important');
    });
  }

  function stripPrototypeArtifacts(){
    document.querySelectorAll('.concept-private,.concept-stat-note,.concept-hero-art,.exact-hero-art').forEach(n=>n.remove());
    const mode=$('vaultAssistantMode');
    if(mode) mode.style.setProperty('display','none','important');
  }

  function forceCriticalStyles(){
    const h2=$('view-home')?.querySelector('.hero-row h2');
    if(h2){
      h2.style.setProperty('color','#0b1732','important');
      h2.style.setProperty('-webkit-text-fill-color','#0b1732','important');
      h2.style.setProperty('background','none','important');
      const accent=h2.querySelector('.accent-word');
      if(accent){
        accent.style.setProperty('color','#176fff','important');
        accent.style.setProperty('-webkit-text-fill-color','#176fff','important');
      }
    }
    const panel=$('view-home')?.querySelector('.assistant-panel');
    if(panel){
      panel.style.setProperty('background','linear-gradient(145deg,rgba(255,255,255,.82),rgba(241,248,255,.68))','important');
      panel.style.setProperty('border','1px solid rgba(183,205,239,.66)','important');
      panel.style.setProperty('box-shadow','0 18px 44px rgba(48,86,151,.10), inset 0 1px rgba(255,255,255,.98)','important');
    }
    ['accountPlanBadge','accountCloudBadge','zeroCostBadge'].forEach(id=>{
      const el=$(id);
      if(!el) return;
      el.style.setProperty('opacity','1','important');
      el.style.setProperty('visibility','visible','important');
      el.style.setProperty('-webkit-text-fill-color','currentColor','important');
    });
  }

  function refresh(){
    ensureFinalCss();
    navIcons();
    singleBell();
    homeHero();
    normalizeSectionTitles();
    stripPrototypeArtifacts();
    forceCriticalStyles();
  }

  if(document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded',refresh,{once:true});
  } else {
    refresh();
  }

  setTimeout(refresh,700);
})();