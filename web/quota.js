'use strict';

/* MasterSafe V7.3 — leitura da quota elástica pelo PostgREST autenticado. */
window.MasterSafeQuota = (() => {
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

  return { getInfo };
})();
