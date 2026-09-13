'use strict';

/* MasterSafe V7.3.2 - quota elástica, preços modulares e ajustes visuais da conta. */
window.MasterSafeQuota = (() => {
  const MB = 1024 * 1024;

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

  function ensureUiSpacingStyles() {
    if (document.getElementById('mastersafe-v732-ui-fixes')) return;
    const style = document.createElement('style');
    style.id = 'mastersafe-v732-ui-fixes';
    style.textContent = `
      .zero-cost-grid .plan-card {
        gap: 12px !important;
        padding: 20px !important;
        min-height: 196px;
      }
      .zero-cost-grid .plan-card .plan-kicker { margin-bottom: 2px; }
      .zero-cost-grid .plan-card strong { line-height: 1.28; }
      .zero-cost-grid .plan-card b {
        line-height: 1.15;
        margin-top: 1px;
        margin-bottom: 2px;
      }
      .zero-cost-grid .plan-card small {
        display: block;
        line-height: 1.65 !important;
        margin-top: 1px;
      }
      .zero-cost-grid .plan-card button { margin-top: auto; }
      .security-event { padding: 14px 15px !important; gap: 14px !important; }
      .security-event-copy {
        min-width: 0;
        display: grid;
        gap: 6px;
        align-content: center;
      }
      .security-event-copy strong {
        display: block;
        line-height: 1.3;
      }
      .security-event-copy small {
        display: block;
        line-height: 1.5;
      }
      .security-event > small {
        white-space: nowrap;
        margin-left: 8px;
        line-height: 1.4;
      }
      @media (max-width: 760px) {
        .security-event { grid-template-columns: 36px minmax(0,1fr) !important; }
        .security-event > small { grid-column: 2; margin-left: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  function patchPlanHeader() {
    const panel = document.querySelector('.zero-cost-grid')?.closest('.panel');
    if (!panel) return;
    const heading = panel.querySelector('.panel-head h3');
    const description = panel.querySelector('.panel-head .muted');
    const badge = panel.querySelector('#zeroCostBadge');
    if (heading) heading.textContent = 'Planos e recursos';
    if (description) description.textContent = 'O cofre base continua gratuito. Recursos adicionais podem ter preço próprio, sem alterar a proteção local dos seus documentos.';
    if (badge) badge.textContent = 'Base R$ 0';
  }

  function patchZeroCostCards(info = null) {
    ensureUiSpacingStyles();
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
        small.textContent = `Quota ajustada automaticamente conforme o espaço disponível. Limite atual: ${fmt(current)}; até ${fmt(file)} por arquivo.`;
      }
      const button = quotaCard.querySelector('button');
      if (button) button.textContent = 'Quota dinâmica ativa';
    }

    if (aiCard) {
      aiCard.querySelector('.plan-kicker')?.replaceChildren(document.createTextNode('INTELIGÊNCIA'));
      aiCard.querySelector('strong')?.replaceChildren(document.createTextNode('IA Híbrida'));
      aiCard.querySelector('b')?.replaceChildren(document.createTextNode('R$ 9,99'));
      const small = aiCard.querySelector('small');
      if (small) small.textContent = 'OCR e leitura de PDFs acontecem no aparelho. O Pergunte ao Cofre pode usar IA online opcional, sem enviar o arquivo original.';
      const button = aiCard.querySelector('button');
      if (button) button.textContent = 'Local + online opcional';
    }

    if (infraCard) {
      infraCard.querySelector('.plan-kicker')?.replaceChildren(document.createTextNode('INFRAESTRUTURA'));
      infraCard.querySelector('strong')?.replaceChildren(document.createTextNode('Cloudflare + Supabase'));
      infraCard.querySelector('b')?.replaceChildren(document.createTextNode('R$ 14,99'));
      const small = infraCard.querySelector('small');
      if (small) small.textContent = 'Publicação, autenticação e sincronização em nuvem com proteção automática de capacidade e continuidade do cofre local.';
      const button = infraCard.querySelector('button');
      if (button) button.textContent = 'Proteção de custo ativa';
    }

    const note = document.querySelector('.zero-cost-grid')?.closest('.panel')?.querySelector('.security-note');
    if (note) note.textContent = 'A quota da nuvem é elástica e pode variar conforme o uso global. Nenhum documento local é apagado se a capacidade da nuvem acabar.';
  }

  async function refreshAccountUI() {
    patchZeroCostCards();
    try {
      const info = await getInfo();
      patchZeroCostCards(info);
      return info;
    } catch {
      return null;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => refreshAccountUI(), { once: true });
  } else {
    refreshAccountUI();
  }

  return { getInfo, refreshAccountUI, patchZeroCostCards };
})();