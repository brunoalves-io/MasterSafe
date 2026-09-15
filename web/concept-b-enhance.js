(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const ICONS = {
    home: '<svg viewBox="0 0 24 24"><path d="M3 10.8 12 3l9 7.8v8.7a1.5 1.5 0 0 1-1.5 1.5h-5v-6h-5v6h-5A1.5 1.5 0 0 1 3 19.5z"/></svg>',
    documents: '<svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 11h6M9 15h6"/></svg>',
    radar: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 12 17 7M12 4v3M4 12h3M12 17v3"/></svg>',
    account: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7a7 7 0 0 0-.7-1.7l.9-1.9-2.1-2.1-1.9.9a7 7 0 0 0-1.7-.7L10.5 2h-3l-.7 2.3a7 7 0 0 0-1.7.7l-1.9-.9-2.1 2.1.9 1.9a7 7 0 0 0-.7 1.7L0 10.5v3l2.3.7a7 7 0 0 0 .7 1.7l-.9 1.9 2.1 2.1 1.9-.9a7 7 0 0 0 1.7.7l.7 2.3h3l.7-2.3a7 7 0 0 0 1.7-.7l1.9.9 2.1-2.1-.9-1.9a7 7 0 0 0 .7-1.7z" transform="translate(2 0) scale(.83)"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 6 2.5 6 2.5 7.5H4c0-1.5 2.5-1.5 2.5-7.5Z"/><path d="M9.5 20h5"/></svg>',
    shield: '<svg viewBox="0 0 64 64"><path d="M32 5 52 12v16c0 14-8.8 24-20 31C20.8 52 12 42 12 28V12z"/><path d="m22 31 7 7 14-15"/></svg>',
    document: '<svg viewBox="0 0 64 64"><path d="M17 8h23l10 10v38H17z"/><path d="M40 8v12h12M24 29h18M24 37h18M24 45h12"/></svg>',
    gear: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="9"/><path d="M55 35v-6l-7-2.2a19 19 0 0 0-2-4.8l3.4-6.5-4.3-4.3-6.5 3.4a19 19 0 0 0-4.8-2L31.5 6h-6l-2.2 6.6a19 19 0 0 0-4.8 2L12 11.2l-4.3 4.3 3.4 6.5a19 19 0 0 0-2 4.8L2.5 29v6l6.6 2.2a19 19 0 0 0 2 4.8l-3.4 6.5 4.3 4.3 6.5-3.4a19 19 0 0 0 4.8 2l2.2 6.6h6l2.2-6.6a19 19 0 0 0 4.8-2l6.5 3.4 4.3-4.3-3.4-6.5a19 19 0 0 0 2-4.8z"/></svg>'
  };

  function navIcons() {
    const map = { home:'home', documents:'documents', radar:'radar', account:'account', settings:'settings' };
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
      const span = btn.querySelector('span');
      const key = map[btn.dataset.view];
      if (span && key) span.innerHTML = ICONS[key];
    });
  }

  function topbarBell() {
    const top = document.querySelector('.topbar');
    if (!top || top.querySelector('.concept-bell')) return;
    const add = $('addDocumentTop');
    const bell = document.createElement('button');
    bell.type = 'button';
    bell.className = 'concept-bell';
    bell.title = 'Notificações';
    bell.setAttribute('aria-label','Notificações');
    bell.innerHTML = ICONS.bell;
    bell.addEventListener('click', () => {
      const radar = document.querySelector('.nav-item[data-view="radar"]');
      radar?.click();
    });
    if (add) top.insertBefore(bell, add); else top.appendChild(bell);
  }

  function heroArt(viewId, icon, copy) {
    const view = $(viewId);
    const row = view?.querySelector('.hero-row,.section-title-row');
    if (!row || row.querySelector('.concept-hero-art')) return;
    const art = document.createElement('div');
    art.className = 'concept-hero-art';
    art.innerHTML = `<div class="concept-hero-orb">${ICONS[icon]}</div><div class="concept-hero-copy">${copy}</div>`;
    row.appendChild(art);
  }

  function assistantPrivacy() {
    const panel = document.querySelector('.assistant-panel');
    if (!panel || panel.querySelector('.concept-private')) return;
    const el = document.createElement('div');
    el.className = 'concept-private';
    el.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="10" width="12" height="10" rx="2"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/></svg><div><strong>Busca local privada</strong><small>Seus dados ficam protegidos.</small></div>';
    panel.appendChild(el);
  }

  function statNotes() {
    const notes = ['Total de arquivos','Requerem atenção','Arquivos sem prazo','Categorias em uso'];
    document.querySelectorAll('.stat-card').forEach((card,i) => {
      if (card.querySelector('.concept-stat-note')) return;
      const note = document.createElement('span');
      note.className = 'concept-stat-note';
      note.textContent = notes[i] || '';
      card.querySelector('div')?.appendChild(note);
    });
  }

  function enhanceDocumentCard(card) {
    if (!card || card.classList.contains('concept-list-card')) return;
    const top = card.querySelector('.document-card-top');
    const icon = top?.querySelector('.document-card-icon');
    const badge = top?.querySelector('.badge');
    const title = card.querySelector('h3');
    const issuer = card.querySelector('p');
    const footer = card.querySelector('.document-card-footer');
    if (!top || !icon || !title || !footer) return;

    const thumb = document.createElement('div');
    thumb.className = 'concept-doc-thumb';
    thumb.appendChild(icon);

    const copy = document.createElement('div');
    copy.className = 'concept-doc-copy';
    copy.appendChild(title);
    if (issuer) copy.appendChild(issuer);
    copy.appendChild(footer);

    const status = document.createElement('div');
    status.className = 'concept-doc-status';
    if (badge) status.appendChild(badge);
    const date = document.createElement('span');
    date.className = 'concept-doc-date';
    date.textContent = `Adicionado ao cofre`;
    status.appendChild(date);

    top.remove();
    card.appendChild(thumb);
    card.appendChild(copy);
    card.appendChild(status);
    card.classList.add('concept-list-card');
  }

  function watchDocuments() {
    const root = $('documentsGrid');
    if (!root || root.dataset.conceptWatch) return;
    root.dataset.conceptWatch = '1';
    const run = () => root.querySelectorAll('.document-card').forEach(enhanceDocumentCard);
    new MutationObserver(run).observe(root,{childList:true,subtree:true});
    run();
  }

  function planFeatures() {
    const cards = document.querySelectorAll('.zero-cost-grid .plan-card');
    const features = [
      ['Armazenamento seguro na nuvem','Quota elástica de até 500 MB','Criptografia de ponta a ponta','Ideal para uso pessoal'],
      ['OCR e leitura inteligente','Pergunte ao Cofre com IA','Análise de documentos','Processamento híbrido'],
      ['Publicação e hospedagem segura','Autenticação moderna','Sincronização protegida','Continuidade do cofre local']
    ];
    cards.forEach((card,i) => {
      if (card.querySelector('.concept-plan-features')) return;
      const box = document.createElement('div');
      box.className = 'concept-plan-features';
      (features[i] || []).forEach(text => {
        const row = document.createElement('div');
        row.className = 'concept-plan-feature';
        row.textContent = text;
        box.appendChild(row);
      });
      const button = card.querySelector('button');
      if (button) card.insertBefore(box,button); else card.appendChild(box);
    });
  }

  function settingsIcons() {
    const rules = [
      ['#profileNameInput','◉'], ['.cloud-card','☁'], ['.security-card','◈'], ['.ai-status','✦'],
      ['#exportBackup','▣'], ['#storageInfo','▤'], ['.danger-card','△']
    ];
    rules.forEach(([selector,icon]) => {
      const node = document.querySelector(selector);
      const card = node?.closest('.setting-card') || (node?.classList?.contains('setting-card') ? node : null);
      const h3 = card?.querySelector('h3');
      if (!h3 || h3.dataset.conceptIcon) return;
      h3.dataset.conceptIcon = '1';
      h3.insertAdjacentHTML('afterbegin', `<span style="display:inline-grid;place-items:center;width:28px;height:28px;margin-right:8px;border-radius:9px;background:#edf4ff;color:#3474ef;font-size:14px;vertical-align:middle">${icon}</span>`);
    });
  }

  function authSubtitle() {
    const modal = $('cloudAuthModal');
    const head = modal?.querySelector('.modal-head');
    if (!head || head.querySelector('.concept-auth-subtitle')) return;
    const titleBox = head.querySelector('div');
    const p = document.createElement('p');
    p.className = 'concept-auth-subtitle muted';
    p.textContent = 'Acesse sua conta para sincronizar seus documentos com segurança em todos os seus dispositivos.';
    p.style.margin = '6px 0 0';
    p.style.maxWidth = '430px';
    titleBox?.appendChild(p);
  }

  function refresh() {
    navIcons();
    topbarBell();
    heroArt('view-home','shield','Mais segurança para o que importa.');
    heroArt('view-documents','document','Tudo o que é importante, sempre ao seu alcance.');
    heroArt('view-account','shield','Mais segurança para o que importa.');
    heroArt('view-settings','gear','Mais segurança para o que importa.');
    assistantPrivacy();
    statNotes();
    watchDocuments();
    planFeatures();
    settingsIcons();
    authSubtitle();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',refresh,{once:true});
  else refresh();
  setTimeout(refresh,300);
  setTimeout(refresh,900);
})();
