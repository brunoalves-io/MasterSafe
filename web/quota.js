'use strict';

/* MasterSafe V7.3.1 — leitura da quota elástica + atualização do painel Zero Custo. */
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

  function patchZeroCostCards(info = null) {
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
      aiCard.querySelector('strong')?.replaceChildren(document.createTextNode('IA híbrida'));
      aiCard.querySelector('b')?.replaceChildren(document.createTextNode('R$ 0'));
      const small = aiCard.querySelector('small');
      if (small) small.textContent = 'OCR e leitura de PDFs acontecem no aparelho. O Pergunte ao Cofre pode usar Groq Free opcional, sem enviar o arquivo original.';
      const button = aiCard.querySelector('button');
      if (button) button.textContent = 'Local + online opcional';
    }

    if (infraCard) {
      infraCard.querySelector('.plan-kicker')?.replaceChildren(document.createTextNode('INFRAESTRUTURA'));
      infraCard.querySelector('strong')?.replaceChildren(document.createTextNode('Cloudflare + Supabase'));
      infraCard.querySelector('b')?.replaceChildren(document.createTextNode('R$ 0'));
      const small = infraCard.querySelector('small');
      if (small) small.textContent = 'Publicação, autenticação e sincronização dentro dos planos gratuitos. Ao atingir o teto do beta, novas sincronizações são pausadas automaticamente.';
      const button = infraCard.querySelector('button');
      if (button) button.textContent = 'Proteção de custo ativa';
    }

    const note = document.querySelector('.zero-cost-grid')?.closest('.panel')?.querySelector('.security-note');
    if (note) note.textContent = 'A quota da nuvem é elástica: pode subir ou diminuir conforme o uso global do beta. Nenhum documento local é apagado se a capacidade da nuvem acabar.';
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
