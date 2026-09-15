'use strict';

/* MasterSafe V7.2 — IA online opcional, carregada sem alterar o núcleo do cofre.
   - chave GROQ_API_KEY fica somente na Supabase Edge Function;
   - requer usuário autenticado no Supabase;
   - envia no máximo 3 trechos relevantes, parcialmente mascarados;
   - arquivo original nunca é enviado;
   - se a IA falhar, volta para a busca local.
*/

window.MasterSafeAI = (() => {
  const PREF_KEY = 'mastersafe_ai_online_enabled_v1';
  const $ = id => document.getElementById(id);
  const lower = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function isEnabled() { return localStorage.getItem(PREF_KEY) === '1'; }
  function setEnabled(value) { localStorage.setItem(PREF_KEY, value ? '1' : '0'); syncUI(); return isEnabled(); }

  function redact(text) {
    let s = String(text || '');
    s = s.replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[E-MAIL OCULTO]');
    s = s.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF OCULTO]');
    s = s.replace(/\b\d{2}\.?\d{3}\.?\d{3}[\/\-]?\d{4}-?\d{2}\b/g, '[CNPJ OCULTO]');
    s = s.replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s]?\d{4}\b/g, '[TELEFONE OCULTO]');
    s = s.replace(/\b\d{5}-?\d{3}\b/g, '[CEP OCULTO]');
    s = s.replace(/\b\d{9,}\b/g, '[ID OCULTO]');
    return s;
  }

  function tokens(question) {
    const stop = new Set(['qual','quais','onde','esta','estao','meu','minha','meus','minhas','documento','documentos','cofre','sobre','para','com','que','uma','uns','das','dos','por','quando']);
    return lower(question).split(/\W+/).filter(t => t.length > 2 && !stop.has(t));
  }

  function rankDocs(question, docs) {
    const ts = tokens(question);
    const q = lower(question);
    const scored = (docs || []).map(doc => {
      const hay = lower([
        doc.title, doc.category, doc.issuer, doc.documentType, doc.notes,
        doc.amount, doc.issueDate, doc.expiryDate, ...(doc.tags || []),
        String(doc.extractedText || '').slice(0, 5000)
      ].filter(Boolean).join(' '));
      let score = ts.reduce((sum, t) => sum + (hay.includes(t) ? 3 : 0), 0);
      if ((q.includes('vence') || q.includes('venc') || q.includes('validade') || q.includes('expira')) && doc.expiryDate) score += 2;
      if ((q.includes('valor') || q.includes('quanto') || q.includes('paguei')) && doc.amount) score += 2;
      if (q.includes('garantia') && doc.warrantyMonths) score += 2;
      return { doc, score };
    });
    const matches = scored.filter(x => x.score > 0).sort((a,b) => b.score - a.score).slice(0, 3);
    if (matches.length) return matches.map(x => x.doc);
    return [...(docs || [])].sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))).slice(0, 3);
  }

  function compactDoc(doc) {
    return {
      id: String(doc.id || ''),
      title: redact(String(doc.title || '').slice(0, 120)),
      category: String(doc.category || '').slice(0, 80),
      issuer: redact(String(doc.issuer || '').slice(0, 100)),
      documentType: String(doc.documentType || '').slice(0, 80),
      issueDate: String(doc.issueDate || '').slice(0, 20),
      expiryDate: String(doc.expiryDate || '').slice(0, 20),
      amount: String(doc.amount || '').slice(0, 40),
      warrantyMonths: Number(doc.warrantyMonths || 0),
      tags: (doc.tags || []).slice(0, 8).map(x => redact(String(x).slice(0, 50))),
      notes: redact(String(doc.notes || '').slice(0, 500)),
      text: redact(String(doc.extractedText || '').slice(0, 2800))
    };
  }

  async function invoke(payload) {
    if (!window.CofreCloud?.getConfig || !window.CofreCloud?.getSession) throw new Error('Nuvem do MasterSafe não está disponível.');
    const cfg = window.CofreCloud.getConfig();
    if (!cfg?.url || !cfg?.publishableKey) throw new Error('Configure a nuvem do MasterSafe primeiro.');
    const session = await window.CofreCloud.getSession();
    if (!session?.access_token) throw new Error('Entre na sua conta do MasterSafe para usar a IA.');

    const response = await fetch(`${cfg.url}/functions/v1/ai-assistant`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': cfg.publishableKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    let data = null;
    try { data = await response.json(); } catch { /* resposta inválida */ }
    if (!response.ok) throw new Error(data?.error || `IA indisponível (${response.status}).`);
    if (data?.error) throw new Error(data.error);
    return data || {};
  }

  async function ask(question, docs) {
    if (!isEnabled()) throw new Error('Ative a IA online nas Configurações.');
    const q = String(question || '').trim();
    if (!q) throw new Error('Digite uma pergunta.');
    const selected = rankDocs(q, docs).map(compactDoc);
    const result = await invoke({ question: q.slice(0, 1000), documents: selected });
    return {
      answer: String(result?.answer || '').trim() || 'A IA não retornou uma resposta.',
      ids: Array.isArray(result?.document_ids) ? result.document_ids.filter(id => selected.some(d => d.id === id)) : [],
      model: result?.model || '',
      provider: result?.provider || 'Groq'
    };
  }

  function unlockedDocs() {
    try { return (typeof state !== 'undefined' && Array.isArray(state.docs)) ? state.docs : []; }
    catch { return []; }
  }

  function renderAnswer(text, ids = [], note = '') {
    const root = $('vaultAnswer');
    if (!root) return;
    root.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = String(text || '');
    root.appendChild(strong);
    if (note) {
      const small = document.createElement('small');
      small.style.cssText = 'display:block;margin-top:6px;opacity:.75';
      small.textContent = note;
      root.appendChild(small);
    }
    const docs = unlockedDocs();
    const validIds = (ids || []).filter(id => docs.some(d => d.id === id));
    if (validIds.length) {
      const links = document.createElement('div');
      links.className = 'answer-links';
      validIds.forEach(id => {
        const doc = docs.find(d => d.id === id);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'answer-doc';
        button.dataset.docId = id;
        button.textContent = doc?.title || 'Documento';
        links.appendChild(button);
      });
      root.appendChild(links);
    }
    root.classList.remove('hidden');
  }

  async function handleQuestion() {
    const input = $('vaultQuestion');
    const q = input?.value?.trim() || '';
    if (!q) return;
    renderAnswer('Consultando a IA com trechos relevantes...');
    try {
      const ai = await ask(q, unlockedDocs());
      renderAnswer(ai.answer, ai.ids, `${ai.provider || 'Groq'} · ${ai.model || 'modelo gratuito'}`);
    } catch (error) {
      console.warn('IA online indisponível; usando busca local.', error);
      const local = window.CofreSmart?.questionAnswer?.(q, unlockedDocs());
      if (local) renderAnswer(local.text, local.ids || [], `IA online indisponível: ${error.message || 'erro'}. Resposta local.`);
      else renderAnswer(error.message || 'A IA está indisponível no momento.');
    }
  }

  function ensureSettingsCard() {
    const grid = document.querySelector('.settings-grid');
    if (!grid || $('aiOnlineToggle')) return;
    const card = document.createElement('article');
    card.className = 'panel setting-card ai-online-card';
    card.innerHTML = `
      <h3>IA online opcional</h3>
      <p class="muted">Ative somente quando quiser respostas assistidas por IA no “Pergunte ao Cofre”. A chave da API permanece protegida no servidor.</p>
      <label class="consent-row"><input id="aiOnlineToggle" type="checkbox" /> <span><strong>Usar IA online (Groq Free)</strong><small>São enviados no máximo 3 trechos relevantes e parcialmente mascarados. O arquivo original nunca é enviado.</small></span></label>
      <p id="aiOnlineStatus" class="security-note"></p>`;
    const backupCard = [...grid.querySelectorAll('.setting-card')].find(el => el.querySelector('h3')?.textContent?.includes('Backup criptografado'));
    if (backupCard) grid.insertBefore(card, backupCard); else grid.appendChild(card);
    $('aiOnlineToggle')?.addEventListener('change', e => setEnabled(Boolean(e.target.checked)));
  }

  function ensureAssistantMode() {
    const content = document.querySelector('.assistant-content > div:first-child');
    if (!content || $('vaultAssistantMode')) return;
    const mode = document.createElement('em');
    mode.id = 'vaultAssistantMode';
    mode.style.marginLeft = '8px';
    content.appendChild(mode);
  }

  function syncUI() {
    ensureSettingsCard();
    ensureAssistantMode();
    const enabled = isEnabled();
    const toggle = $('aiOnlineToggle');
    const status = $('aiOnlineStatus');
    const mode = $('vaultAssistantMode');
    if (toggle) toggle.checked = enabled;
    if (status) status.textContent = enabled
      ? 'Ativada. Somente os trechos selecionados passam pela função segura; o arquivo original permanece no dispositivo.'
      : 'Desativada. O Pergunte ao Cofre usa apenas a busca local privada.';
    if (mode) mode.textContent = enabled ? 'IA online opcional · Groq' : 'Busca local privada';
  }

  document.addEventListener('click', event => {
    if (!isEnabled()) return;
    const button = event.target?.closest?.('#askVaultButton');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handleQuestion();
  }, true);

  document.addEventListener('keydown', event => {
    if (!isEnabled() || event.key !== 'Enter' || event.target?.id !== 'vaultQuestion') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handleQuestion();
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncUI, { once: true });
  else syncUI();
  setTimeout(syncUI, 500);

  return { isEnabled, setEnabled, ask, redact, rankDocs, syncUI };
})();
