(() => {
  'use strict';
  const $ = id => document.getElementById(id);

  function ensureExactCss(){
    if(document.querySelector('link[data-mastersafe-exact-ui]')) return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='mockup-exact.css?v=7.8.0';
    link.setAttribute('data-mastersafe-exact-ui','1');
    document.head.appendChild(link);
  }

  const ICONS={
    home:'<svg viewBox="0 0 24 24"><path d="M3 10.8 12 3l9 7.8v9.2H15v-6H9v6H3z"/></svg>',
    documents:'<svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 11h6M9 15h6"/></svg>',
    radar:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 12 17 7M12 4v3M4 12h3M12 17v3"/></svg>',
    account:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-4 3.2-6 7-6s6.2 2 7 6"/></svg>',
    settings:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.8-.8-1.9.9-1.8-2.1-2.1-1.8.9-1.9-.8-.8-2h-3l-.8 2-1.9.8-1.8-.9L1.9 6l.9 1.8-.8 1.9-2 .8v3l2 .8.8 1.9-.9 1.8 2.1 2.1 1.8-.9 1.9.8.8 2h3l.8-2 1.9-.8 1.8.9 2.1-2.1-.9-1.8.8-1.9z" transform="translate(2 0) scale(.83)"/></svg>',
    bell:'<svg viewBox="0 0 24 24"><path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 6 2.5 6 2.5 7.5H4c0-1.5 2.5-1.5 2.5-7.5Z"/><path d="M9.5 20h5"/></svg>'
  };

  function navIcons(){
    const map={home:'home',documents:'documents',radar:'radar',account:'account',settings:'settings'};
    document.querySelectorAll('.nav-item[data-view]').forEach(btn=>{
      const span=btn.querySelector('span');
      if(span&&map[btn.dataset.view]) span.innerHTML=ICONS[map[btn.dataset.view]];
      span?.querySelector('svg')?.setAttribute('style','width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8');
    });
  }

  function singleBell(){
    document.querySelectorAll('.concept-bell,.exact-bell').forEach(n=>n.remove());
    const top=document.querySelector('.topbar');
    const add=$('addDocumentTop');
    if(!top||!add) return;
    const bell=document.createElement('button');
    bell.type='button'; bell.className='exact-bell'; bell.title='Notificações'; bell.setAttribute('aria-label','Notificações');
    bell.innerHTML=ICONS.bell;
    bell.addEventListener('click',()=>document.querySelector('.nav-item[data-view="radar"]')?.click());
    top.insertBefore(bell,add);
  }

  function heroSvg(){
    return `<svg viewBox="0 0 760 220" aria-hidden="true">
      <defs>
        <linearGradient id="mxWingA" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8bc8ff" stop-opacity=".30"/><stop offset="1" stop-color="#4f6fff" stop-opacity=".12"/></linearGradient>
        <linearGradient id="mxWingB" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#4fa8ff" stop-opacity=".24"/><stop offset="1" stop-color="#7e73ff" stop-opacity=".10"/></linearGradient>
        <linearGradient id="mxShield" x1=".2" y1="0" x2=".8" y2="1"><stop stop-color="#dff3ff" stop-opacity=".92"/><stop offset=".45" stop-color="#79bfff" stop-opacity=".72"/><stop offset="1" stop-color="#6d6cff" stop-opacity=".74"/></linearGradient>
        <filter id="mxBlur"><feGaussianBlur stdDeviation="13"/></filter>
        <filter id="mxShadow"><feDropShadow dx="0" dy="13" stdDeviation="13" flood-color="#4e78d8" flood-opacity=".18"/></filter>
      </defs>
      <ellipse cx="365" cy="177" rx="275" ry="53" fill="#65aaff" opacity=".12" filter="url(#mxBlur)"/>
      <path d="M132 164C211 103 270 26 338 42c52 13 75 74 111 105-71 34-204 53-317 17Z" fill="url(#mxWingA)"/>
      <path d="M279 195c43-72 111-142 187-151 58-7 104 28 169 80-91 49-231 80-356 71Z" fill="url(#mxWingB)"/>
      <path d="M238 27c61 40 113 75 165 137-45-3-96-17-128-46-28-26-39-61-37-91Z" fill="#6baeff" opacity=".12"/>
      <g transform="translate(330 20)" filter="url(#mxShadow)">
        <path d="M85 5 157 31v58c0 58-33 100-72 127C46 189 13 147 13 89V31Z" fill="url(#mxShield)" stroke="#fff" stroke-opacity=".88" stroke-width="5"/>
        <path d="M48 103 74 128 124 75" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity=".92"/>
        <path d="M85 6 157 31v58c0 58-33 100-72 127" fill="none" stroke="#8dc9ff" stroke-opacity=".45" stroke-width="2"/>
      </g>
    </svg>`;
  }

  function heroArt(viewId,copy){
    const view=$(viewId); const row=view?.querySelector('.hero-row,.section-title-row'); if(!row) return;
    row.querySelectorAll('.concept-hero-art,.exact-hero-art').forEach(n=>n.remove());
    const art=document.createElement('div'); art.className='exact-hero-art';
    art.innerHTML=heroSvg()+`<div class="exact-hero-copy">${copy}</div>`;
    row.appendChild(art);
  }

  function accentTitles(){
    const home=$('view-home')?.querySelector('.hero-row h2'); if(home) home.innerHTML='Está tudo no <span class="accent-word">lugar.</span>';
    const docs=$('view-documents')?.querySelector('.section-title-row h2'); if(docs) docs.innerHTML='Seus <span class="accent-word">documentos</span>';
    const account=$('view-account')?.querySelector('.section-title-row h2'); if(account) account.innerHTML='Seu Cofre, sob <span class="accent-word">seu controle</span>';
  }

  function cleanOldEnhancements(){
    document.querySelectorAll('.concept-private,.concept-stat-note').forEach(n=>n.remove());
    const panel=document.querySelector('.assistant-panel'); panel?.querySelectorAll('.concept-private').forEach(n=>n.remove());
  }

  function settingsIcons(){
    const entries=[['#profileNameInput','◉'],['.cloud-card','☁'],['.security-card','◈'],['.ai-status','✦'],['#exportBackup','▣'],['#storageInfo','▤']];
    entries.forEach(([sel,ico])=>{
      const node=document.querySelector(sel); const card=node?.closest('.setting-card')||(node?.classList?.contains('setting-card')?node:null); const h3=card?.querySelector('h3');
      if(!h3||h3.dataset.mxIcon) return; h3.dataset.mxIcon='1'; h3.insertAdjacentHTML('afterbegin',`<span style="display:inline-grid;place-items:center;width:30px;height:30px;margin-right:9px;border-radius:9px;background:#edf4ff;color:#3474ef;font-size:14px;vertical-align:middle">${ico}</span>`);
    });

    const dangerTitle=document.querySelector('.danger-card>h3');
    if(dangerTitle){
      Array.from(dangerTitle.children).forEach(child=>child.remove());
      dangerTitle.dataset.mxIcon='danger-clean';
      dangerTitle.style.setProperty('gap','6px','important');
    }
  }

  function refresh(){
    ensureExactCss(); navIcons(); singleBell(); cleanOldEnhancements(); accentTitles();
    heroArt('view-home','Mais segurança<br>para o que importa.');
    heroArt('view-documents','Organize hoje<br>um amanhã mais tranquilo.');
    heroArt('view-account','Mais segurança<br>para o que importa.');
    heroArt('view-settings','Mais segurança<br>para o que importa.');
    settingsIcons();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',refresh,{once:true}); else refresh();
  setTimeout(refresh,250); setTimeout(refresh,800);
})();
