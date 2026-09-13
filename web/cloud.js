'use strict';

/* MasterSafe V6 Zero Custo
   - Supabase Auth (e-mail/senha, TOTP, passkeys experimentais)
   - Sync de registros já criptografados no navegador
   - Storage privado com RLS
   - Quotas defensivas para permanecer no plano gratuito

   IMPORTANTE: use apenas a URL do projeto + chave publishable/anon pública.
   Nunca coloque service_role/secret key no navegador.
*/

window.CofreCloud = (() => {
  const CONFIG_KEY = 'cofreDaVida.cloud.v3';
  const LAST_SYNC_KEY = 'cofreDaVida.cloud.lastSync.v3';
  const PENDING_DELETES_KEY = 'cofreDaVida.cloud.pendingDeletes.v3';
  const SDK_URL = 'https://esm.sh/@supabase/supabase-js@2.105.0?bundle';
  const BUCKET = 'vault';

  let client = null;
  let currentUser = null;
  let sdkPromise = null;

  function readJSON(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function getConfig() {
    const saved = readJSON(CONFIG_KEY, null);
    if (saved?.url && saved?.publishableKey) return saved;
    const preset = window.COFRE_CLOUD_PRESET;
    if (preset?.url && preset?.publishableKey) return { url: normalizeUrl(preset.url), publishableKey: String(preset.publishableKey).trim(), preset: true };
    return null;
  }
  function isConfigured() {
    const cfg = getConfig();
    return Boolean(cfg?.url && cfg?.publishableKey);
  }
  function normalizeUrl(url = '') { return url.trim().replace(/\/+$/, ''); }
  function configure(url, publishableKey) {
    const cleanUrl = normalizeUrl(url);
    const cleanKey = String(publishableKey || '').trim();
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cleanUrl)) throw new Error('URL do Supabase inválida.');
    if (cleanKey.length < 20) throw new Error('Chave publishable/anon inválida.');
    writeJSON(CONFIG_KEY, { url: cleanUrl, publishableKey: cleanKey, configuredAt: new Date().toISOString() });
    client = null;
    currentUser = null;
    return getConfig();
  }
  function clearConfiguration() {
    localStorage.removeItem(CONFIG_KEY);
    localStorage.removeItem(LAST_SYNC_KEY);
    client = null;
    currentUser = null;
  }

  async function loadSDK() {
    if (!sdkPromise) sdkPromise = import(SDK_URL);
    return sdkPromise;
  }

  async function init() {
    if (client) return client;
    const cfg = getConfig();
    if (!cfg) return null;
    const { createClient } = await loadSDK();
    client = createClient(cfg.url, cfg.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        experimental: { passkey: true, recoveryCodes: true }
      }
    });
    const { data } = await client.auth.getSession();
    currentUser = data?.session?.user || null;
    client.auth.onAuthStateChange((_event, session) => { currentUser = session?.user || null; });
    return client;
  }

  async function getClient() {
    const c = await init();
    if (!c) throw new Error('Nuvem ainda não configurada.');
    return c;
  }

  async function getSession() {
    const c = await getClient();
    const { data, error } = await c.auth.getSession();
    if (error) throw error;
    currentUser = data?.session?.user || null;
    return data?.session || null;
  }

  async function getUser() {
    const session = await getSession();
    return session?.user || null;
  }

  async function signUp(email, password, displayName = '', legal = {}) {
    const c = await getClient();
    const acceptedAt = legal?.termsAcceptedAt || new Date().toISOString();
    const { data, error } = await c.auth.signUp({
      email: String(email || '').trim(),
      password,
      options: { data: {
        display_name: String(displayName || '').trim().slice(0, 80),
        terms_version: legal?.termsVersion || null,
        privacy_version: legal?.privacyVersion || null,
        terms_accepted_at: acceptedAt
      } }
    });
    if (error) throw error;
    currentUser = data.user || null;
    return { user: data.user, session: data.session, needsEmailConfirmation: !data.session };
  }

  async function signIn(email, password) {
    const c = await getClient();
    const { data, error } = await c.auth.signInWithPassword({ email: String(email || '').trim(), password });
    if (error) throw error;
    currentUser = data.user || null;
    const aal = await getAAL().catch(() => null);
    const factors = aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2' ? await listMFAFactors() : [];
    return { ...data, aal, mfaRequired: factors.length > 0, factors };
  }

  async function signInWithPasskey() {
    const c = await getClient();
    if (typeof c.auth.signInWithPasskey !== 'function') throw new Error('A versão do cliente não oferece passkeys.');
    const { data, error } = await c.auth.signInWithPasskey();
    if (error) throw error;
    currentUser = data?.user || null;
    return data;
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
    currentUser = null;
  }

  async function sendPasswordReset(email) {
    const c = await getClient();
    const redirectTo = location.protocol === 'http:' || location.protocol === 'https:' ? `${location.origin}${location.pathname}` : undefined;
    const { error } = await c.auth.resetPasswordForEmail(String(email || '').trim(), redirectTo ? { redirectTo } : undefined);
    if (error) throw error;
  }

  async function getAAL() {
    const c = await getClient();
    const { data, error } = await c.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    return data;
  }

  async function listMFAFactors() {
    const c = await getClient();
    const { data, error } = await c.auth.mfa.listFactors();
    if (error) throw error;
    const all = [
      ...(data?.totp || []),
      ...(data?.phone || []),
      ...(data?.all || [])
    ];
    const seen = new Set();
    return all.filter(f => f?.id && !seen.has(f.id) && seen.add(f.id)).filter(f => !f.status || f.status === 'verified');
  }

  async function enrollTOTP() {
    const c = await getClient();
    const { data, error } = await c.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'MasterSafe' });
    if (error) throw error;
    return data;
  }

  async function verifyTOTP(factorId, code) {
    const c = await getClient();
    const { data, error } = await c.auth.mfa.challengeAndVerify({ factorId, code: String(code || '').trim() });
    if (error) throw error;
    return data;
  }

  async function unenrollMFA(factorId) {
    const c = await getClient();
    const { data, error } = await c.auth.mfa.unenroll({ factorId });
    if (error) throw error;
    return data;
  }

  async function registerPasskey() {
    const c = await getClient();
    if (typeof c.auth.registerPasskey !== 'function') throw new Error('Passkeys não estão disponíveis neste cliente.');
    const { data, error } = await c.auth.registerPasskey();
    if (error) throw error;
    return data;
  }

  async function listPasskeys() {
    const c = await getClient();
    if (!c.auth.passkey?.list) return [];
    const { data, error } = await c.auth.passkey.list();
    if (error) throw error;
    return data || [];
  }

  async function requireUser() {
    const user = await getUser();
    if (!user) throw new Error('Entre na sua conta da nuvem primeiro.');
    return user;
  }

  async function saveProfile({ displayName = '', emailHint = '', vaultEnvelope = undefined, termsVersion = undefined, privacyVersion = undefined, termsAcceptedAt = undefined } = {}) {
    const c = await getClient();
    const user = await requireUser();
    const payload = {
      id: user.id,
      display_name: String(displayName || '').trim().slice(0, 80) || null,
      email_hint: String(emailHint || user.email || '').trim().slice(0, 160) || null,
      updated_at: new Date().toISOString()
    };
    if (vaultEnvelope !== undefined) payload.vault_envelope = vaultEnvelope;
    if (termsVersion !== undefined) payload.terms_version = termsVersion;
    if (privacyVersion !== undefined) payload.privacy_version = privacyVersion;
    if (termsAcceptedAt !== undefined) payload.terms_accepted_at = termsAcceptedAt;
    const { data, error } = await c.from('profiles').upsert(payload, { onConflict: 'id' }).select().single();
    if (error) throw error;
    return data;
  }

  async function loadProfile() {
    const c = await getClient();
    const user = await requireUser();
    const { data, error } = await c.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function saveVaultEnvelope(vaultEnvelope, profile = {}) {
    return saveProfile({ ...profile, vaultEnvelope });
  }

  async function loadVaultEnvelope() {
    const profile = await loadProfile();
    return profile?.vault_envelope || null;
  }

  function getPendingDeletes() { return readJSON(PENDING_DELETES_KEY, []); }
  function setPendingDeletes(items) { writeJSON(PENDING_DELETES_KEY, items); }
  function queueDeletion(id) {
    const items = getPendingDeletes();
    if (!items.some(x => x.id === id)) items.push({ id, deletedAt: new Date().toISOString() });
    setPendingDeletes(items);
  }

  async function processPendingDeletes(c, user) {
    const pending = getPendingDeletes();
    if (!pending.length) return 0;
    const remaining = [];
    let done = 0;
    for (const item of pending) {
      try {
        const { data: row, error: findError } = await c.from('vault_documents')
          .select('id,storage_path').eq('id', item.id).eq('user_id', user.id).maybeSingle();
        if (findError) throw findError;
        if (row) {
          if (row.storage_path) await c.storage.from(BUCKET).remove([row.storage_path]);
          const { error } = await c.from('vault_documents').update({
            deleted_at: item.deletedAt,
            client_updated_at: item.deletedAt,
            storage_path: null,
            file_iv: null,
            ciphertext_size: 0,
            updated_at: new Date().toISOString()
          }).eq('id', item.id).eq('user_id', user.id);
          if (error) throw error;
        }
        done++;
      } catch (error) {
        console.warn('Falha ao sincronizar exclusão', item.id, error);
        remaining.push(item);
      }
    }
    setPendingDeletes(remaining);
    return done;
  }

  async function pushRecord(c, user, record) {
    const bridge = window.CofreCloudBridge;
    if (!bridge) throw new Error('Ponte local indisponível.');
    const updatedAt = record.updatedAt || new Date().toISOString();
    let storagePath = null;
    let fileIv = null;
    let ciphertextSize = 0;
    let oldStoragePath = null;
    let uploadedNewObject = false;

    const { data: existingRow, error: existingError } = await c.from('vault_documents')
      .select('storage_path,ciphertext_size')
      .eq('id', record.id).eq('user_id', user.id).maybeSingle();
    if (existingError) throw existingError;
    oldStoragePath = existingRow?.storage_path || null;

    if (record.file?.cipher) {
      fileIv = record.file.iv;
      const cipherBytes = bridge.base64ToBytes(record.file.cipher);
      ciphertextSize = cipherBytes.byteLength;

      const { data: quota, error: quotaError } = await c.rpc('check_storage_quota', {
        p_document_id: record.id,
        p_size: ciphertextSize
      });
      if (quotaError) throw quotaError;
      if (!quota?.allowed) {
        const fmt = window.CofreBetaBridge?.formatBytes || (n => `${n} bytes`);
        if (quota?.reason === 'FILE_TOO_LARGE') {
          throw new Error(`Arquivo acima do limite gratuito (${fmt(Number(quota.fileLimit || 0))} por arquivo). Ele continua salvo localmente, mas não será sincronizado.`);
        }
        if (quota?.reason === 'BETA_CAPACITY_REACHED') {
          throw new Error('A capacidade gratuita global do beta foi atingida. O documento continua protegido neste dispositivo, mas a sincronização foi pausada para manter custo R$ 0.');
        }
        throw new Error(`Sua cota gratuita de nuvem foi atingida. Limite: ${fmt(Number(quota?.limit || 0))}. O documento continua salvo localmente.`);
      }

      // Cada versão usa um caminho novo. Assim, uma falha na atualização do banco
      // nunca destrói a versão remota anterior do documento.
      storagePath = `${user.id}/documents/${record.id}-${crypto.randomUUID()}.bin`;
      const { error: uploadError } = await c.storage.from(BUCKET).upload(storagePath, cipherBytes, {
        upsert: false,
        contentType: 'application/octet-stream',
        cacheControl: '0'
      });
      if (uploadError) throw uploadError;
      uploadedNewObject = true;
    }

    const row = {
      id: record.id,
      user_id: user.id,
      encrypted_metadata: record.meta?.cipher || '',
      metadata_iv: record.meta?.iv || '',
      storage_path: storagePath,
      file_iv: fileIv,
      ciphertext_size: ciphertextSize,
      client_updated_at: updatedAt,
      deleted_at: null,
      updated_at: new Date().toISOString()
    };

    const { error } = await c.from('vault_documents').upsert(row, { onConflict: 'id' });
    if (error) {
      if (uploadedNewObject && storagePath) await c.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      throw error;
    }

    if (oldStoragePath && storagePath && oldStoragePath !== storagePath) {
      await c.storage.from(BUCKET).remove([oldStoragePath]).catch(error => console.warn('Falha ao limpar versão antiga', error));
    }
  }

  async function pullRecord(c, row) {
    const bridge = window.CofreCloudBridge;
    let file = null;
    if (row.storage_path) {
      const { data: blob, error } = await c.storage.from(BUCKET).download(row.storage_path);
      if (error) throw error;
      file = { iv: row.file_iv, cipher: bridge.bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
    }
    return {
      id: row.id,
      meta: { iv: row.metadata_iv, cipher: row.encrypted_metadata },
      file,
      updatedAt: row.client_updated_at || row.updated_at || new Date().toISOString()
    };
  }

  function isZeroCostCapacityError(error) {
    const msg = String(error?.message || error || '').toUpperCase();
    return ['FILE_TOO_LARGE','STORAGE_QUOTA_EXCEEDED','BETA_CAPACITY_REACHED','QUOTA','LIMIT GRATUITO','COTA GRATUITA','CAPACIDADE GRATUITA'].some(token => msg.includes(token));
  }

  async function sync() {
    const c = await getClient();
    const user = await requireUser();
    const bridge = window.CofreCloudBridge;
    if (!bridge) throw new Error('Módulo local ainda não inicializado.');

    const stats = { uploaded: 0, downloaded: 0, deleted: 0, conflicts: 0, skipped: 0 };
    stats.deleted += await processPendingDeletes(c, user);

    const localRecords = await bridge.listRecords();
    const localMap = new Map(localRecords.map(r => [r.id, r]));
    const { data: rows, error } = await c.from('vault_documents')
      .select('id,encrypted_metadata,metadata_iv,storage_path,file_iv,ciphertext_size,client_updated_at,deleted_at,updated_at')
      .eq('user_id', user.id);
    if (error) throw error;
    const remoteMap = new Map((rows || []).map(r => [r.id, r]));

    for (const row of rows || []) {
      const local = localMap.get(row.id);
      if (row.deleted_at) {
        if (local) { await bridge.deleteRecord(row.id); stats.deleted++; }
        continue;
      }
      const remoteTime = new Date(row.client_updated_at || row.updated_at || 0).getTime();
      const localTime = local ? new Date(local.updatedAt || 0).getTime() : 0;
      if (!local || remoteTime > localTime) {
        const pulled = await pullRecord(c, row);
        await bridge.putRecord(pulled);
        stats.downloaded++;
      } else if (localTime > remoteTime + 1000) {
        try {
          await pushRecord(c, user, local);
          stats.uploaded++;
          stats.conflicts++;
        } catch (error) {
          if (!isZeroCostCapacityError(error)) throw error;
          console.warn('Documento mantido somente no dispositivo por limite Zero Custo:', local.id, error);
          stats.skipped++;
        }
      }
    }

    for (const local of localRecords) {
      if (!remoteMap.has(local.id)) {
        try {
          await pushRecord(c, user, local);
          stats.uploaded++;
        } catch (error) {
          if (!isZeroCostCapacityError(error)) throw error;
          console.warn('Documento mantido somente no dispositivo por limite Zero Custo:', local.id, error);
          stats.skipped++;
        }
      }
    }

    const when = new Date().toISOString();
    localStorage.setItem(LAST_SYNC_KEY, when);
    await bridge.afterSync?.();
    return { ...stats, at: when };
  }

  function getLastSync() { return localStorage.getItem(LAST_SYNC_KEY) || ''; }

  async function uploadTemporaryShare({ id, cipherBytes, expiresIn = 3600 }) {
    const c = await getClient();
    const user = await requireUser();
    const path = `${user.id}/shares/${id}.bin`;
    const { error: uploadError } = await c.storage.from(BUCKET).upload(path, cipherBytes, {
      upsert: true, contentType: 'application/octet-stream', cacheControl: '0'
    });
    if (uploadError) throw uploadError;
    const { data, error } = await c.storage.from(BUCKET).createSignedUrl(path, Math.max(60, Number(expiresIn) || 3600));
    if (error) throw error;
    return { path, signedUrl: data.signedUrl };
  }

  async function revokeShare(path) {
    const c = await getClient();
    await requireUser();
    const { error } = await c.storage.from(BUCKET).remove([path]);
    if (error) throw error;
  }



  async function getUsageBytes() {
    const c = await getClient();
    const user = await requireUser();
    const { data, error } = await c.from('vault_documents')
      .select('ciphertext_size')
      .eq('user_id', user.id)
      .is('deleted_at', null);
    if (error) throw error;
    return (data || []).reduce((sum, row) => sum + Number(row.ciphertext_size || 0), 0);
  }

  async function logSecurityEvent(eventType, details = {}) {
    const c = await getClient();
    const user = await requireUser();
    const allowed = String(eventType || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 64);
    if (!allowed) throw new Error('Evento de segurança inválido.');
    const safeDetails = {};
    for (const [key, value] of Object.entries(details || {}).slice(0, 8)) {
      const k = String(key).replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 40);
      if (!k) continue;
      if (['string','number','boolean'].includes(typeof value)) safeDetails[k] = typeof value === 'string' ? value.slice(0, 120) : value;
    }
    const { error } = await c.from('security_events').insert({
      user_id: user.id,
      event_type: allowed,
      details: safeDetails
    });
    if (error) throw error;
  }

  async function getSecurityEvents(limit = 20) {
    const c = await getClient();
    const user = await requireUser();
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
    const { data, error } = await c.from('security_events')
      .select('id,event_type,details,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(safeLimit);
    if (error) throw error;
    return data || [];
  }

  async function deleteAccount() {
    const c = await getClient();
    await requireUser();
    const { data, error } = await c.functions.invoke('delete-account', {
      body: { confirm: 'DELETE_MY_ACCOUNT' }
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || 'Não foi possível excluir a conta.');
    // Limpa a sessão persistida deste navegador. O backend já removeu os dados e o Auth user.
    await c.auth.signOut({ scope: 'local' }).catch(() => {});
    currentUser = null;
    localStorage.removeItem(LAST_SYNC_KEY);
    return data;
  }

  async function status() {
    const cfg = getConfig();
    if (!cfg) return { configured: false, connected: false, user: null, lastSync: getLastSync() };
    try {
      const user = await getUser();
      return { configured: true, connected: Boolean(user), user, lastSync: getLastSync(), url: cfg.url };
    } catch (error) {
      return { configured: true, connected: false, user: null, lastSync: getLastSync(), url: cfg.url, error: error.message };
    }
  }

  return {
    configure, clearConfiguration, getConfig, isConfigured, init, status,
    getSession, getUser, signUp, signIn, signInWithPasskey, signOut, sendPasswordReset,
    getAAL, listMFAFactors, enrollTOTP, verifyTOTP, unenrollMFA,
    registerPasskey, listPasskeys,
    saveProfile, loadProfile, saveVaultEnvelope, loadVaultEnvelope,
    queueDeletion, sync, getLastSync, getUsageBytes,
    logSecurityEvent, getSecurityEvents, deleteAccount,
    uploadTemporaryShare, revokeShare
  };
})();
