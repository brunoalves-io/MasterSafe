'use strict';

/* MasterSafe V7.6 — quota elástica, preços modulares e interface Concept B aprovada. */
window.MasterSafeQuota = (() => {
  const MB = 1024 * 1024;

  function ensureProfessionalUI() {
    if (!document.getElementById('mastersafe-ui-pro')) {
      const link = document.createElement('link');
      link.id = 'mastersafe-ui-pro';
      link.rel = 'stylesheet';
      link.href = 'ui-pro.css?v=760';
      document.head.appendChild(link);
    }
    if (!document.getElementById('mastersafe-ui-polish')) {
      const polish = document.createElement('link');
      polish.id = 'mastersafe-ui-polish';
      polish.rel = 'stylesheet';
      polish.href = 'ui-polish.css?v=760';
      document.head.appendChild(polish);
    }
    if (!document.getElementById('mastersafe-concept-b')) {
      const theme = document.createElement('link');
      theme.id = 'mastersafe-concept-b';
      theme.rel = 'stylesheet';
      theme.href = 'concept-b.css?v=760';
      document.head.appendChild(theme);
    }
    if (!document.querySelector('script[data-mastersafe-concept-b]')) {
      const script = document.createElement('script');
      script.src = 'concept-b-enhance.js?v=760';
      script.async = true;
      script.setAttribute('data-mastersafe-concept-b','1');
      document.head.appendChild(script);
    }
  }

  function fmt(bytes) {
    const n = Number(bytes || 0);
    if (window.CofreBetaBridge?.formatBytes) return window.CofreBetaBridge.formatBytes(n);
    if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    return `${(n / MB).toFixed(n >= 100 * MB ? 0 : 1)} MB`;
  }

  async function getInfo() {
    if (!window.CofreCloud) throw new Error('Módulo de nuvem indisponível.');
    const cfg = window.CofreCloud.getConfig?.();
    const session = await window.CofreCloud.getSession?.();
    if (!cfg?.url || !cfg?.publishableKey || !session?.access_token) {
      throw new Error('Entre na conta da nuvem para consultar a quota.');
    }

    const response = await fetch(`${cfg.url}/rest/v1/rpc/get_storage_quota`, {
      method: 'POST',
      headers: {
        'apikey': cfg.publishableKey,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: '{}'
    });

    const raw = await response.text();
    if (!response.ok) {
      let message = 'Não foi possível consultar a quota dinâmica.';
      try { message = JSON.parse(raw)?.message || message; } catch {}
      throw new Error(message);
    }
    return raw ? JSON.parse(raw) : null;
  }

  function patchPlanHeader() {
    const accountSubtitle = document.querySelector('#view-account .section-title-row .muted');
    if (accountSubtitle) accountSubtitle.textContent = 'Planos, sincronização, privacidade e controle sobre os seus dados.';

    const panel = document.querySelector('.zero-cost-grid')?.closest('.panel');
    if (!panel) return;
    const heading = panel.querySelector('.panel-head h3');
    const description = panel.querySelector('.panel-head .muted');
    const badge = panel.querySelector('#zeroCostBadge');
    if (heading) heading.textContent = 'Planos e recursos';
    if (description) description.textContent = 'Escolha os recursos ideais para suas necessidades, mantendo segurança, privacidade e controle sobre os seus dados.';
    if (badge) badge.textContent = 'Base R$ 0';
  }

  function patchZeroCostCards(info = null) {
    ensureProfessionalUI();
    patchPlanHeader();

    const cards = document.querySelectorAll('.zero-cost-grid .plan-card');
    if (!cards.length) return;

    const quotaCard = cards[0];
    const aiCard = cards[1];
    const infraCard = cards[2];

    if (quotaCard) {
      quotaCard.querySelector('.plan-kicker')?.replaceChildren(document.createTextNode('NUVEM ELÁSTICA'));
      quotaCard.querySelector('strong')?.replaceChildren(document.createTextNode('Até 500 MB'));
      quotaCard.querySelector('b')?.replaceChildren(document.createTextNode('R$ 0'));
      const small = quotaCard.querySelector('small');
      if (small) {
        const current = Number(info?.limit || 500 * MB);
        const file = Number(info?.displayFileLimit || 25 * MB);
        small.textContent = `Guarde seus documentos com segurança na nuvem. Quota atual ${fmt(current)}, com até ${fmt(file)} por arquivo.`;
      }
      const button = quotaCard.querySelector('button');
      if (button) button.textContent = 'Plano atual';
    }

    if (aiCard) {
      aiCard.querySelector('.plan-kicker')?.replaceChildren(document.createTextNode('INTELIGÊNCIA'));
      aiCard.querySelector('strong')?.replaceChildren(document.createTextNode('IA Híbrida'));
      aiCard.querySelector('b')?.replaceChildren(document.createTextNode('R$ 9,99'));
      const small = aiCard.querySelector('small');
      if (small) small.textContent = 'OCR inteligente, leitura de PDFs e Pergunte ao Cofre com processamento local e IA online opcional.';
      const button = aiCard.querySelector('button');
      if (button) button.textContent = 'Em breve';
    }

    if (infraCard) {
      infraCard.querySelector('.plan-kicker')?.replaceChildren(document.createTextNode('INFRAESTRUTURA'));
      infraCard.querySelector('strong')?.replaceChildren(document.createTextNode('Cloudflare + Supabase'));
      infraCard.querySelector('b')?.replaceChildren(document.createTextNode('R$ 14,99'));
      const small = infraCard.querySelector('small');
      if (small) small.textContent = 'Publicação, autenticação e sincronização em nuvem com proteção automática de capacidade e continuidade do cofre local.';
      const button = infraCard.querySelector('button');
      if (button) button.textContent = 'Em breve';
    }

    const note = document.querySelector('.zero-cost-grid')?.closest('.panel')?.querySelector('.security-note');
    if (note) note.textContent = 'A quota da nuvem é elástica e pode variar conforme o uso global. Nenhum documento local é apagado se a capacidade da nuvem acabar.';
  }

  async function refreshAccountUI() {
    ensureProfessionalUI();
    patchZeroCostCards();
    try {
      const info = await getInfo();
      patchZeroCostCards(info);
      return info;
    } catch {
      return null;
    }
  }

  ensureProfessionalUI();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => refreshAccountUI(), { once: true });
  } else {
    refreshAccountUI();
  }

  return { getInfo, refreshAccountUI, patchZeroCostCards };
})();