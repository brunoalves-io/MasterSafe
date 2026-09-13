'use strict';

const CONFIG_KEY = 'cofreDaVida.config.v1';
const PROFILE_KEY = 'cofreDaVida.profile.v2';
const DB_NAME = 'cofreDaVidaDB';
const DB_VERSION = 1;
const STORE = 'documents';
const VERIFIER_TEXT = 'COFRE_DA_VIDA_OK_V1';
const PBKDF2_ITERATIONS = 300000; // legado V1/V2
const WRAP_ITERATIONS = 420000;
const TERMS_VERSION = '2026-09-13-v1';
const PRIVACY_VERSION = '2026-09-13-v1';
const RECOVERY_ITERATIONS = 480000;
const CLOUD_ENVELOPE_VERSION = 3;

const CATEGORIES = [
  { name: 'Pessoais', icon: '🪪' },
  { name: 'Veículos', icon: '🚗' },
  { name: 'Casa', icon: '🏠' },
  { name: 'Compras & Garantias', icon: '🧾' },
  { name: 'Contratos', icon: '📑' },
  { name: 'Financeiro', icon: '💰' },
  { name: 'Educação', icon: '🎓' },
  { name: 'Saúde', icon: '✚' },
  { name: 'Trabalho', icon: '💼' },
  { name: 'Outros', icon: '📦' }
];

const state = {
  key: null,
  keyBytes: null,
  db: null,
  docs: [],
  selectedId: null,
  selectedRaw: null,
  pendingFile: null,
  search: '',
  currentView: 'home',
  profile: { name: 'Usuário', email: '' },
  smartResult: null,
  analyzing: false,
  cloud: { configured: false, connected: false, user: null, syncing: false },
  pendingMFAFactorId: null,
  pendingTOTPEnrollment: null,
  activeShare: null,
  cloudRestoreRequested: false,
  cloudAuthMode: 'login'
};

const $ = id => document.getElementById(id);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < arr.length; i += chunk) {
    binary += String.fromCharCode(...arr.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}

function base64UrlToBytes(value) {
  let s = String(value || '').replaceAll('-','+').replaceAll('_','/');
  while (s.length % 4) s += '=';
  return base64ToBytes(s);
}

async function importVaultKey(rawBytes) {
  return crypto.subtle.importKey('raw', rawBytes, { name: 'AES-GCM' }, false, ['encrypt','decrypt']);
}

async function deriveKeyBytes(password, saltBytes, iterations = PBKDF2_ITERATIONS) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations }, material, 256);
  return new Uint8Array(bits);
}

async function deriveWrappingKey(password, saltBytes, iterations = WRAP_ITERATIONS) {
  const bits = await deriveKeyBytes(password, saltBytes, iterations);
  return importVaultKey(bits);
}

async function deriveKey(password, saltBytes) {
  const material = await crypto.subtle.importKey(
    'raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: PBKDF2_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptBytes(key, data) {
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { iv: bytesToBase64(iv), cipher: bytesToBase64(cipher) };
}

async function decryptBytes(key, encrypted) {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(encrypted.iv) },
    key,
    base64ToBytes(encrypted.cipher)
  );
}

async function encryptJSON(key, value) {
  return encryptBytes(key, encoder.encode(JSON.stringify(value)));
}

async function decryptJSON(key, encrypted) {
  const plain = await decryptBytes(key, encrypted);
  return JSON.parse(decoder.decode(plain));
}

async function saveEncryptedProfile(profile) {
  if (!state.key) return;
  const safe = { name: (profile?.name || 'Usuário').trim().slice(0,80), email: (profile?.email || '').trim().slice(0,120) };
  const encrypted = await encryptJSON(state.key, safe);
  localStorage.setItem(PROFILE_KEY, JSON.stringify(encrypted));
  state.profile = safe;
  renderProfile();
  if (window.CofreCloud?.isConfigured?.()) {
    window.CofreCloud.getUser().then(user => {
      if (user) return window.CofreCloud.saveProfile({ displayName: safe.name, emailHint: user.email || safe.email });
    }).catch(() => {});
  }
}

async function loadEncryptedProfile() {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw || !state.key) { state.profile = { name: 'Usuário', email: '' }; return state.profile; }
  try { state.profile = await decryptJSON(state.key, JSON.parse(raw)); }
  catch { state.profile = { name: 'Usuário', email: '' }; }
  return state.profile;
}

function renderProfile() {
  const name = state.profile?.name || 'Usuário';
  const email = state.profile?.email || 'Conta local';
  if ($('profileName')) $('profileName').textContent = name;
  if ($('profileEmail')) $('profileEmail').textContent = email;
  if ($('profileAvatar')) $('profileAvatar').textContent = name.trim().charAt(0).toUpperCase() || 'U';
  if ($('profileNameInput')) $('profileNameInput').value = name === 'Usuário' ? '' : name;
  if ($('profileEmailInput')) $('profileEmailInput').value = state.profile?.email || '';
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbRequest(mode, action) {
  return new Promise((resolve, reject) => {
    const tx = state.db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const req = action(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const dbGetAll = () => dbRequest('readonly', store => store.getAll());
const dbGet = id => dbRequest('readonly', store => store.get(id));
const dbPut = record => dbRequest('readwrite', store => store.put(record));
const dbDelete = id => dbRequest('readwrite', store => store.delete(id));
const dbClear = () => dbRequest('readwrite', store => store.clear());

window.CofreCloudBridge = {
  listRecords: () => dbGetAll(),
  putRecord: record => dbPut(record),
  deleteRecord: id => dbDelete(id),
  bytesToBase64,
  base64ToBytes,
  afterSync: async () => {}
};

window.CofreBetaBridge = {
  exportPortableData: () => exportPortableData(),
  clearLocalVault: () => clearLocalVault(),
  refreshCloudUI: () => refreshCloudUI(),
  showView: name => showView(name),
  formatBytes
};

function getConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)); } catch { return null; }
}

function setConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3000);
}

function setBusy(button, busy, label = 'Processando...') {
  if (!button) return;
  if (busy) {
    button.dataset.oldText = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.oldText || button.textContent;
    button.disabled = false;
  }
}

function categoryInfo(name) {
  return CATEGORIES.find(c => c.name === name) || CATEGORIES[CATEGORIES.length - 1];
}

function parseDate(date) {
  return date ? new Date(`${date}T12:00:00`) : null;
}

function daysUntil(date) {
  if (!date) return null;
  const target = parseDate(date);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Math.ceil((target - today) / 86400000);
}

function expiryState(date) {
  const days = daysUntil(date);
  if (days === null) return { className: 'badge-neutral', label: 'Sem vencimento', days };
  if (days < 0) return { className: 'badge-danger', label: `Vencido há ${Math.abs(days)}d`, days };
  if (days === 0) return { className: 'badge-danger', label: 'Vence hoje', days };
  if (days <= 30) return { className: 'badge-danger', label: `${days} dias`, days };
  if (days <= 90) return { className: 'badge-warning', label: `${days} dias`, days };
  return { className: 'badge-safe', label: 'Em dia', days };
}

function formatDate(date) {
  if (!date) return 'Não informado';
  return new Intl.DateTimeFormat('pt-BR').format(parseDate(date));
}

function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Sem arquivo';
  const units = ['B','KB','MB','GB'];
  let i = 0, n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function displayFileIcon(mime = '') {
  if (mime.includes('pdf')) return 'PDF';
  if (mime.startsWith('image/')) return 'IMG';
  if (mime.includes('word') || mime.includes('document')) return 'DOC';
  if (mime.includes('sheet') || mime.includes('excel')) return 'XLS';
  if (mime.includes('text')) return 'TXT';
  return 'ARQ';
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function createVault(password) {
  const vaultKeyBytes = randomBytes(32);
  const key = await importVaultKey(vaultKeyBytes);
  const wrapSalt = randomBytes(16);
  const wrapKey = await deriveWrappingKey(password, wrapSalt, WRAP_ITERATIONS);
  const wrappedKey = await encryptBytes(wrapKey, vaultKeyBytes);
  const verifier = await encryptBytes(key, encoder.encode(VERIFIER_TEXT));
  setConfig({
    version: 3,
    keyMode: 'wrapped',
    wrapSalt: bytesToBase64(wrapSalt),
    wrapIterations: WRAP_ITERATIONS,
    wrappedKey,
    verifier,
    recovery: null,
    createdAt: new Date().toISOString()
  });
  state.key = key;
  state.keyBytes = vaultKeyBytes;
}

async function migrateLegacyVault(password, legacyConfig) {
  const legacySalt = base64ToBytes(legacyConfig.salt);
  const legacyBytes = await deriveKeyBytes(password, legacySalt, legacyConfig.iterations || PBKDF2_ITERATIONS);
  const legacyKey = await importVaultKey(legacyBytes);
  const plain = await decryptBytes(legacyKey, legacyConfig.verifier);
  if (decoder.decode(plain) !== VERIFIER_TEXT) throw new Error('Senha inválida.');

  const wrapSalt = randomBytes(16);
  const wrapKey = await deriveWrappingKey(password, wrapSalt, WRAP_ITERATIONS);
  const wrappedKey = await encryptBytes(wrapKey, legacyBytes);
  const migrated = {
    version: 3,
    keyMode: 'wrapped',
    wrapSalt: bytesToBase64(wrapSalt),
    wrapIterations: WRAP_ITERATIONS,
    wrappedKey,
    verifier: legacyConfig.verifier,
    recovery: null,
    createdAt: legacyConfig.createdAt || new Date().toISOString(),
    migratedAt: new Date().toISOString(),
    migratedFrom: legacyConfig.version || 1
  };
  setConfig(migrated);
  state.key = legacyKey;
  state.keyBytes = legacyBytes;
  return migrated;
}

async function unlockVault(password) {
  const config = getConfig();
  if (!config) throw new Error('Cofre não configurado.');
  if (!config.wrappedKey || Number(config.version || 1) < 3) return migrateLegacyVault(password, config);

  const wrapKey = await deriveWrappingKey(password, base64ToBytes(config.wrapSalt), config.wrapIterations || WRAP_ITERATIONS);
  const rawKey = new Uint8Array(await decryptBytes(wrapKey, config.wrappedKey));
  const key = await importVaultKey(rawKey);
  const plain = await decryptBytes(key, config.verifier);
  if (decoder.decode(plain) !== VERIFIER_TEXT) throw new Error('Senha inválida.');
  state.key = key;
  state.keyBytes = rawKey;
}

function cloudVaultEnvelope() {
  const config = getConfig();
  if (!config || Number(config.version || 0) < 3) return null;
  return {
    version: 3,
    keyMode: 'wrapped',
    wrapSalt: config.wrapSalt,
    wrapIterations: config.wrapIterations || WRAP_ITERATIONS,
    wrappedKey: config.wrappedKey,
    verifier: config.verifier,
    recovery: config.recovery || null,
    createdAt: config.createdAt || new Date().toISOString()
  };
}

function installCloudEnvelope(envelope) {
  if (!envelope || Number(envelope.version || 0) < 3 || !envelope.wrappedKey || !envelope.wrapSalt || !envelope.verifier) {
    throw new Error('A conta não possui uma chave de cofre válida na nuvem.');
  }
  setConfig({ ...envelope, version: 3, keyMode: 'wrapped', restoredAt: new Date().toISOString() });
}

async function generateRecoveryCode() {
  if (!state.keyBytes?.length) throw new Error('Desbloqueie o cofre primeiro.');
  const codeBytes = randomBytes(20);
  const code = bytesToBase64Url(codeBytes).match(/.{1,5}/g).join('-').toUpperCase();
  const salt = randomBytes(16);
  const recoveryKey = await deriveWrappingKey(code, salt, RECOVERY_ITERATIONS);
  const wrappedKey = await encryptBytes(recoveryKey, state.keyBytes);
  const config = getConfig();
  config.recovery = {
    salt: bytesToBase64(salt),
    iterations: RECOVERY_ITERATIONS,
    wrappedKey,
    createdAt: new Date().toISOString()
  };
  setConfig(config);
  await pushVaultEnvelopeToCloud().catch(error => console.warn('Envelope de recuperação não enviado', error));
  return code;
}

async function unlockVaultWithRecovery(code) {
  const config = getConfig();
  if (!config?.recovery?.wrappedKey) throw new Error('Este cofre não possui código de recuperação configurado.');
  const normalized = String(code || '').trim().toUpperCase();
  const recoveryKey = await deriveWrappingKey(normalized, base64ToBytes(config.recovery.salt), config.recovery.iterations || RECOVERY_ITERATIONS);
  const rawKey = new Uint8Array(await decryptBytes(recoveryKey, config.recovery.wrappedKey));
  const key = await importVaultKey(rawKey);
  const plain = await decryptBytes(key, config.verifier);
  if (decoder.decode(plain) !== VERIFIER_TEXT) throw new Error('Código de recuperação inválido.');
  state.key = key;
  state.keyBytes = rawKey;
}

async function changeMasterPassword(newPassword) {
  if (!state.keyBytes?.length) throw new Error('Cofre bloqueado.');
  if (String(newPassword || '').length < 10) throw new Error('Use uma nova senha com pelo menos 10 caracteres.');
  const config = getConfig();
  const wrapSalt = randomBytes(16);
  const wrapKey = await deriveWrappingKey(newPassword, wrapSalt, WRAP_ITERATIONS);
  config.wrapSalt = bytesToBase64(wrapSalt);
  config.wrapIterations = WRAP_ITERATIONS;
  config.wrappedKey = await encryptBytes(wrapKey, state.keyBytes);
  config.version = 3;
  config.passwordChangedAt = new Date().toISOString();
  setConfig(config);
  await pushVaultEnvelopeToCloud().catch(error => console.warn('Novo envelope não enviado', error));
}

async function pushVaultEnvelopeToCloud() {
  if (!window.CofreCloud?.isConfigured?.()) return false;
  const user = await window.CofreCloud.getUser().catch(() => null);
  if (!user) return false;
  await window.CofreCloud.saveVaultEnvelope(cloudVaultEnvelope(), {
    displayName: state.profile?.name || '',
    emailHint: user.email || state.profile?.email || ''
  });
  return true;
}

async function loadDocuments() {
  const records = await dbGetAll();
  const docs = [];
  for (const raw of records) {
    try {
      const meta = await decryptJSON(state.key, raw.meta);
      if (!raw.updatedAt) { raw.updatedAt = meta.updatedAt || meta.createdAt || new Date(0).toISOString(); await dbPut(raw); }
      docs.push({ ...meta, id: raw.id, _raw: raw });
    } catch (error) {
      console.error('Falha ao descriptografar registro', raw.id, error);
    }
  }
  state.docs = docs.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function populateCategorySelects() {
  const options = CATEGORIES.map(c => `<option value="${escapeHTML(c.name)}">${c.icon} ${escapeHTML(c.name)}</option>`).join('');
  $('docCategory').innerHTML = options;
  $('categoryFilter').insertAdjacentHTML('beforeend', options);
}

function showApp() {
  $('authScreen').classList.add('hidden');
  $('appShell').classList.remove('hidden');
  renderProfile();
  renderAll();
  updateStorageInfo();
  maybeNotifyExpiring();
  refreshCloudUI().catch(console.warn);
}

function lockVault() {
  state.key = null;
  state.keyBytes = null;
  state.docs = [];
  state.selectedId = null;
  state.selectedRaw = null;
  state.pendingFile = null;
  $('appShell').classList.add('hidden');
  $('authScreen').classList.remove('hidden');
  $('setupForm').classList.add('hidden');
  $('unlockForm').classList.remove('hidden');
  $('unlockPassword').value = '';
  $('unlockPassword').focus();
}

function showView(name) {
  state.currentView = name;
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  $(`view-${name}`).classList.add('active');
  document.querySelector(`.nav-item[data-view="${name}"]`)?.classList.add('active');
  document.querySelector('.sidebar')?.classList.remove('open');
  if (name === 'documents') renderDocuments();
  if (name === 'radar') renderRadar();
  if (name === 'settings') updateStorageInfo();
}

function renderAll() {
  renderStats();
  renderRecent();
  renderRadarPreview();
  renderCategories();
  renderDocuments();
  renderRadar();
}

function renderStats() {
  $('statDocuments').textContent = state.docs.length;
  $('statExpiring').textContent = state.docs.filter(d => {
    const days = daysUntil(d.expiryDate);
    return days !== null && days >= 0 && days <= 90;
  }).length;
  $('statNoExpiry').textContent = state.docs.filter(d => !d.expiryDate).length;
  $('statCategories').textContent = new Set(state.docs.map(d => d.category)).size;
}

function emptyState(title, text) {
  return `<div class="empty-state"><strong>${escapeHTML(title)}</strong>${escapeHTML(text)}</div>`;
}

function renderRecent() {
  const root = $('recentDocuments');
  const docs = state.docs.slice(0, 5);
  if (!docs.length) {
    root.innerHTML = emptyState('Seu cofre está vazio', 'Adicione o primeiro documento para começar.');
    return;
  }
  root.innerHTML = docs.map(doc => {
    const cat = categoryInfo(doc.category);
    const expiry = expiryState(doc.expiryDate);
    return `<div class="document-row" data-doc-id="${doc.id}">
      <div class="doc-icon">${cat.icon}</div>
      <div><div class="doc-name">${escapeHTML(doc.title)}</div><div class="doc-meta">${escapeHTML(doc.category)}${doc.issuer ? ` · ${escapeHTML(doc.issuer)}` : ''}</div></div>
      <span class="badge ${expiry.className}">${escapeHTML(expiry.label)}</span>
    </div>`;
  }).join('');
}

function getRadarDocs(includeLongTerm = false) {
  return state.docs
    .filter(d => d.expiryDate)
    .map(d => ({ ...d, _days: daysUntil(d.expiryDate) }))
    .filter(d => includeLongTerm || d._days <= 180)
    .sort((a,b) => a._days - b._days);
}

function renderRadarPreview() {
  const root = $('radarPreview');
  const docs = getRadarDocs(false).slice(0, 5);
  if (!docs.length) {
    root.innerHTML = emptyState('Radar tranquilo', 'Nenhum prazo próximo foi encontrado.');
    return;
  }
  root.innerHTML = docs.map(doc => {
    const days = doc._days;
    const dot = days <= 30 ? 'red' : days > 90 ? 'green' : '';
    const label = days < 0 ? `${Math.abs(days)}d atrasado` : days === 0 ? 'hoje' : `${days}d`;
    return `<div class="radar-item" data-doc-id="${doc.id}">
      <span class="radar-dot ${dot}"></span>
      <div><div class="doc-name">${escapeHTML(doc.title)}</div><div class="doc-meta">${formatDate(doc.expiryDate)}</div></div>
      <div class="radar-days">${escapeHTML(label)}</div>
    </div>`;
  }).join('');
}

function renderCategories() {
  const root = $('categoryGrid');
  root.innerHTML = CATEGORIES.slice(0, 8).map(cat => {
    const count = state.docs.filter(d => d.category === cat.name).length;
    return `<div class="category-card" data-category="${escapeHTML(cat.name)}"><span>${cat.icon}</span><strong>${escapeHTML(cat.name)}</strong><small>${count} ${count === 1 ? 'documento' : 'documentos'}</small></div>`;
  }).join('');
}

function filteredDocuments() {
  const category = $('categoryFilter').value;
  const expiryFilter = $('expiryFilter').value;
  const query = (state.search || '').trim().toLocaleLowerCase('pt-BR');
  return state.docs.filter(doc => {
    if (category && doc.category !== category) return false;
    const days = daysUntil(doc.expiryDate);
    if (expiryFilter === 'expiring' && !(days !== null && days >= 0 && days <= 90)) return false;
    if (expiryFilter === 'expired' && !(days !== null && days < 0)) return false;
    if (expiryFilter === 'noexpiry' && doc.expiryDate) return false;
    if (query) {
      const haystack = [doc.title, doc.category, doc.issuer, doc.notes, ...(doc.tags || [])].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

function renderDocuments() {
  const root = $('documentsGrid');
  const docs = filteredDocuments();
  if (!docs.length) {
    root.innerHTML = emptyState(state.docs.length ? 'Nada encontrado' : 'Nenhum documento ainda', state.docs.length ? 'Tente outro termo ou remova os filtros.' : 'Clique em “Adicionar” para guardar seu primeiro documento.');
    return;
  }
  root.innerHTML = docs.map(doc => {
    const cat = categoryInfo(doc.category);
    const expiry = expiryState(doc.expiryDate);
    return `<article class="document-card" data-doc-id="${doc.id}">
      <div class="document-card-top"><span class="document-card-icon">${cat.icon}</span><span class="badge ${expiry.className}">${escapeHTML(expiry.label)}</span></div>
      <h3>${escapeHTML(doc.title)}</h3>
      <p>${escapeHTML(doc.issuer || doc.fileName || 'Documento pessoal')}</p>
      <div class="document-card-footer"><span class="doc-meta">${escapeHTML(doc.category)}</span><span class="doc-meta">${doc.fileSize ? formatBytes(doc.fileSize) : 'Registro'}</span></div>
    </article>`;
  }).join('');
}

function renderRadar() {
  const root = $('radarFull');
  const docs = getRadarDocs(true);
  if (!docs.length) {
    root.innerHTML = emptyState('Nenhum vencimento cadastrado', 'Adicione uma data de validade a um documento e ele aparecerá aqui.');
    return;
  }
  root.innerHTML = docs.map(doc => {
    const date = parseDate(doc.expiryDate);
    const expiry = expiryState(doc.expiryDate);
    const month = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '');
    return `<article class="timeline-item" data-doc-id="${doc.id}">
      <div class="timeline-date"><strong>${String(date.getDate()).padStart(2,'0')}</strong><span>${escapeHTML(month)}</span></div>
      <div><h3>${escapeHTML(doc.title)}</h3><p class="muted">${escapeHTML(doc.category)}${doc.issuer ? ` · ${escapeHTML(doc.issuer)}` : ''}</p></div>
      <span class="badge ${expiry.className}">${escapeHTML(expiry.label)}</span>
    </article>`;
  }).join('');
}

function openModal(id) { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }

function resetDocumentForm() {
  $('documentForm').reset();
  state.pendingFile = null;
  state.smartResult = null;
  state.analyzing = false;
  $('dropzoneTitle').textContent = 'Clique ou arraste um arquivo';
  $('dropzoneSubtitle').textContent = 'PDF, imagem, Office ou texto';
  $('docCategory').value = 'Pessoais';
  $('smartAnalysis')?.classList.add('hidden');
  $('smartSuggestions')?.classList.add('hidden');
  $('smartConfidence')?.classList.add('hidden');
  $('showExtractedTextButton')?.classList.add('hidden');
  $('extractedTextPreview')?.classList.add('hidden');
  if ($('smartProgress')) $('smartProgress').style.width = '0%';
  if ($('smartStatus')) $('smartStatus').textContent = 'Pronto para analisar';
  if ($('smartMessage')) $('smartMessage').textContent = 'O sistema vai ler o documento e sugerir os campos abaixo.';
}

function inferMetadataFromFile(file) {
  if (!file) return;
  state.pendingFile = file;
  $('dropzoneTitle').textContent = file.name;
  $('dropzoneSubtitle').textContent = `${formatBytes(file.size)} · ${file.type || 'tipo desconhecido'}`;
  if (!$('docTitle').value.trim()) $('docTitle').value = file.name.replace(/\.[^.]+$/, '').replaceAll('_',' ').replaceAll('-',' ');
  const text = `${file.name} ${$('docTitle').value}`.toLowerCase();
  const mapping = [
    ['cnh', 'Pessoais'], ['rg', 'Pessoais'], ['passaporte', 'Pessoais'],
    ['crlv', 'Veículos'], ['veiculo', 'Veículos'], ['carro', 'Veículos'], ['seguro auto', 'Veículos'],
    ['iptu', 'Casa'], ['aluguel', 'Casa'], ['imovel', 'Casa'],
    ['nota fiscal', 'Compras & Garantias'], ['garantia', 'Compras & Garantias'], ['nf-e', 'Compras & Garantias'],
    ['contrato', 'Contratos'], ['financiamento', 'Financeiro'], ['emprestimo', 'Financeiro'],
    ['diploma', 'Educação'], ['certificado', 'Educação'], ['exame', 'Saúde'], ['receita', 'Saúde']
  ];
  const match = mapping.find(([needle]) => text.includes(needle));
  if (match) $('docCategory').value = match[1];
  $('smartAnalysis')?.classList.remove('hidden');
  setTimeout(() => analyzePendingDocument(true), 180);
}

function updateSmartProgress(info = {}) {
  const pct = Math.max(0, Math.min(100, Math.round((info.progress || 0) * 100)));
  if ($('smartProgress')) $('smartProgress').style.width = `${pct}%`;
  if ($('smartStatus')) $('smartStatus').textContent = info.message || 'Analisando documento...';
}

function applySmartResult(result) {
  state.smartResult = result;
  if (result.title) $('docTitle').value = result.title;
  if (result.category && CATEGORIES.some(c => c.name === result.category)) $('docCategory').value = result.category;
  if (result.issuer) $('docIssuer').value = result.issuer;
  if (result.issueDate) $('docIssueDate').value = result.issueDate;
  if (result.expiryDate) $('docExpiryDate').value = result.expiryDate;
  if (result.tags?.length) $('docTags').value = result.tags.join(', ');
  const confidence = `${result.confidence || 0}% de confiança`;
  $('smartConfidence').textContent = confidence;
  $('smartConfidence').classList.remove('hidden');
  const chips = [result.documentType, result.issuer, result.amount, result.warrantyMonths ? `Garantia: ${result.warrantyMonths} meses` : '', result.expiryDate ? `Validade: ${formatDate(result.expiryDate)}` : ''].filter(Boolean);
  $('smartSuggestions').innerHTML = chips.map(x => `<span>${escapeHTML(x)}</span>`).join('');
  $('smartSuggestions').classList.toggle('hidden', !chips.length);
  $('smartMessage').textContent = `Leitura concluída por ${result.method || 'motor local'}. Confira as sugestões antes de salvar.`;
  $('smartStatus').textContent = 'Documento analisado';
  $('smartProgress').style.width = '100%';
  if (result.text?.trim()) {
    $('extractedTextPreview').textContent = result.text.trim().slice(0, 12000);
    $('showExtractedTextButton').classList.remove('hidden');
  }
}

async function analyzePendingDocument(auto = false) {
  if (!state.pendingFile || state.analyzing || !window.CofreSmart) return;
  const button = $('analyzeDocumentButton');
  state.analyzing = true;
  $('smartAnalysis').classList.remove('hidden');
  setBusy(button, true, auto ? 'Lendo automaticamente...' : 'Analisando...');
  try {
    const result = await window.CofreSmart.readFile(state.pendingFile, updateSmartProgress);
    applySmartResult(result);
    if (!auto) toast('Leitura inteligente concluída.');
  } catch (error) {
    console.error(error);
    $('smartStatus').textContent = 'Leitura indisponível';
    $('smartMessage').textContent = error.message || 'Não foi possível analisar automaticamente. Você ainda pode preencher os campos manualmente.';
    $('smartProgress').style.width = '0%';
    if (!auto) toast('A leitura automática falhou, mas o documento pode ser salvo manualmente.');
  } finally {
    state.analyzing = false;
    setBusy(button, false);
  }
}

function askVault() {
  const q = $('vaultQuestion').value.trim();
  const answer = window.CofreSmart?.questionAnswer(q, state.docs);
  if (!answer) return;
  const root = $('vaultAnswer');
  const links = (answer.ids || []).map(id => { const d = state.docs.find(x => x.id === id); return d ? `<button type="button" class="answer-doc" data-doc-id="${id}">${escapeHTML(d.title)}</button>` : ''; }).join('');
  root.innerHTML = `<strong>${escapeHTML(answer.text)}</strong>${links ? `<div class="answer-links">${links}</div>` : ''}`;
  root.classList.remove('hidden');
}

async function saveDocument(event) {
  event.preventDefault();
  const button = $('saveDocumentButton');
  setBusy(button, true, 'Criptografando...');
  try {
    const file = state.pendingFile;
    const meta = {
      title: $('docTitle').value.trim(),
      category: $('docCategory').value,
      issuer: $('docIssuer').value.trim(),
      issueDate: $('docIssueDate').value || '',
      expiryDate: $('docExpiryDate').value || '',
      tags: $('docTags').value.split(',').map(x => x.trim()).filter(Boolean),
      notes: $('docNotes').value.trim(),
      documentType: state.smartResult?.documentType || '',
      analysisConfidence: state.smartResult?.confidence || 0,
      analysisMethod: state.smartResult?.method || '',
      amount: state.smartResult?.amount || '',
      warrantyMonths: state.smartResult?.warrantyMonths || 0,
      extractedText: state.smartResult?.text ? state.smartResult.text.trim().slice(0, 20000) : '',
      fileName: file?.name || '',
      mimeType: file?.type || '',
      fileSize: file?.size || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (!meta.title) throw new Error('Informe um título.');
    const id = uuid();
    const encryptedMeta = await encryptJSON(state.key, meta);
    let encryptedFile = null;
    if (file) encryptedFile = await encryptBytes(state.key, await file.arrayBuffer());
    await dbPut({ id, meta: encryptedMeta, file: encryptedFile, updatedAt: meta.updatedAt });
    await loadDocuments();
    renderAll();
    closeModal('documentModal');
    resetDocumentForm();
    updateStorageInfo();
    toast('Documento protegido e guardado.');
    scheduleCloudSync();
  } catch (error) {
    console.error(error);
    toast(error.message || 'Não foi possível guardar o documento.');
  } finally {
    setBusy(button, false);
  }
}

async function openViewer(id) {
  const doc = state.docs.find(d => d.id === id);
  if (!doc) return;
  state.selectedId = id;
  state.selectedRaw = await dbGet(id);
  const cat = categoryInfo(doc.category);
  const expiry = expiryState(doc.expiryDate);
  $('viewerCategory').textContent = `${cat.icon} ${doc.category}`;
  $('viewerTitle').textContent = doc.title;
  $('viewerBody').innerHTML = `
    <div class="viewer-file"><div class="viewer-file-icon">${escapeHTML(displayFileIcon(doc.mimeType))}</div><div><strong>${escapeHTML(doc.fileName || 'Registro sem arquivo anexado')}</strong><p class="muted">${doc.fileSize ? formatBytes(doc.fileSize) : 'Somente informações cadastradas'}</p></div></div>
    <div class="viewer-details">
      <div class="detail"><small>Emissor / empresa</small><strong>${escapeHTML(doc.issuer || 'Não informado')}</strong></div>
      <div class="detail"><small>Status</small><strong><span class="badge ${expiry.className}">${escapeHTML(expiry.label)}</span></strong></div>
      <div class="detail"><small>Data do documento</small><strong>${escapeHTML(formatDate(doc.issueDate))}</strong></div>
      <div class="detail"><small>Validade / vencimento</small><strong>${escapeHTML(formatDate(doc.expiryDate))}</strong></div>
      <div class="detail"><small>Tags</small><strong>${escapeHTML((doc.tags || []).join(', ') || 'Nenhuma')}</strong></div>
      <div class="detail"><small>Adicionado em</small><strong>${escapeHTML(new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(doc.createdAt)))}</strong></div>
      ${doc.documentType ? `<div class="detail"><small>Tipo identificado</small><strong>${escapeHTML(doc.documentType)}</strong></div>` : ''}
      ${doc.analysisConfidence ? `<div class="detail"><small>Leitura inteligente</small><strong>${escapeHTML(String(doc.analysisConfidence))}% de confiança</strong></div>` : ''}
      ${doc.warrantyMonths ? `<div class="detail"><small>Garantia detectada</small><strong>${escapeHTML(String(doc.warrantyMonths))} meses</strong></div>` : ''}
    </div>
    ${doc.notes ? `<div class="detail"><small>Observações</small><strong>${escapeHTML(doc.notes)}</strong></div>` : ''}`;
  const hasFile = Boolean(state.selectedRaw?.file);
  $('openDocumentButton').disabled = !hasFile;
  $('downloadDocumentButton').disabled = !hasFile;
  if ($('shareDocumentButton')) { $('shareDocumentButton').disabled = true; $('shareDocumentButton').title = 'Links temporários estão desativados no Modo Zero Custo para proteger a quota gratuita da nuvem.'; }
  openModal('viewerModal');
}

async function decryptedSelectedBlob() {
  if (!state.selectedRaw?.file) throw new Error('Este registro não possui arquivo.');
  const doc = state.docs.find(d => d.id === state.selectedId);
  const plain = await decryptBytes(state.key, state.selectedRaw.file);
  return new Blob([plain], { type: doc?.mimeType || 'application/octet-stream' });
}

async function openSelectedFile() {
  const popup = window.open('', '_blank');
  try {
    const blob = await decryptedSelectedBlob();
    const url = URL.createObjectURL(blob);
    if (popup) popup.location.href = url;
    else toast('O navegador bloqueou a nova janela. Use “Baixar original”.');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    if (popup) popup.close();
    toast(error.message || 'Não foi possível abrir o arquivo.');
  }
}

async function downloadSelectedFile() {
  try {
    const doc = state.docs.find(d => d.id === state.selectedId);
    const blob = await decryptedSelectedBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc?.fileName || 'documento';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (error) { toast(error.message || 'Não foi possível baixar.'); }
}

async function deleteSelectedDocument() {
  const doc = state.docs.find(d => d.id === state.selectedId);
  if (!doc || !confirm(`Excluir permanentemente “${doc.title}”?`)) return;
  window.CofreCloud?.queueDeletion?.(doc.id);
  await dbDelete(doc.id);
  closeModal('viewerModal');
  state.selectedId = null;
  state.selectedRaw = null;
  await loadDocuments();
  renderAll();
  updateStorageInfo();
  toast('Documento excluído.');
  scheduleCloudSync();
}

async function exportBackup() {
  const button = $('exportBackup');
  setBusy(button, true, 'Preparando...');
  try {
    const records = await dbGetAll();
    const backup = {
      app: 'CofreDaVidaBackup',
      version: 4,
      exportedAt: new Date().toISOString(),
      config: getConfig(),
      profile: localStorage.getItem(PROFILE_KEY),
      records
    };
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vault-of-life-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('Backup criptografado exportado.');
    window.CofreCloud?.logSecurityEvent?.('data.encrypted_backup_exported').catch(() => {});
  } catch (error) {
    console.error(error);
    toast('Falha ao exportar backup.');
  } finally { setBusy(button, false); }
}


async function exportPortableData() {
  if (!state.key) throw new Error('Desbloqueie o cofre primeiro.');
  const totalBytes = state.docs.reduce((sum, d) => sum + Number(d.fileSize || 0), 0);
  if (totalBytes > 100 * 1024 * 1024) {
    const ok = confirm(`A exportação legível contém aproximadamente ${formatBytes(totalBytes)} e pode consumir bastante memória. Continuar?`);
    if (!ok) return false;
  }
  if (!confirm('Esta exportação será LEGÍVEL e NÃO criptografada. Salve apenas em um local seguro. Continuar?')) return false;
  const docs = [];
  for (const doc of state.docs) {
    const clean = { ...doc };
    delete clean._raw;
    let file = null;
    const raw = await dbGet(doc.id);
    if (raw?.file) {
      const plain = new Uint8Array(await decryptBytes(state.key, raw.file));
      file = {
        name: doc.fileName || 'documento',
        mimeType: doc.mimeType || 'application/octet-stream',
        base64: bytesToBase64(plain)
      };
    }
    docs.push({ metadata: clean, file });
  }
  const payload = {
    app: 'CofreDaVidaPortableExport',
    version: 4,
    exportedAt: new Date().toISOString(),
    profile: { name: state.profile?.name || '', email: state.profile?.email || '' },
    documents: docs
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vault-of-life-meus-dados-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('Exportação legível concluída. Guarde o arquivo com cuidado.');
  window.CofreCloud?.logSecurityEvent?.('data.portable_exported', { documents: docs.length }).catch(() => {});
  return true;
}

async function clearLocalVault() {
  await dbClear();
  localStorage.removeItem(CONFIG_KEY);
  localStorage.removeItem(PROFILE_KEY);
  Object.keys(localStorage).filter(k => k.startsWith('cofreNotified:') || k.startsWith('cofre_v4_')).forEach(k => localStorage.removeItem(k));
  return true;
}

async function importBackup(file) {
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (backup.app !== 'CofreDaVidaBackup' || !backup.config || !Array.isArray(backup.records)) throw new Error('Backup inválido.');
    if (!confirm('A importação substituirá todo o cofre deste dispositivo. Continuar?')) return;
    await dbClear();
    for (const record of backup.records) await dbPut(record);
    setConfig(backup.config);
    if (backup.profile) localStorage.setItem(PROFILE_KEY, backup.profile); else localStorage.removeItem(PROFILE_KEY);
    toast('Backup importado. O cofre será bloqueado para validar a senha do backup.');
    setTimeout(() => location.reload(), 900);
  } catch (error) {
    console.error(error);
    toast(error.message || 'Não foi possível importar o backup.');
  } finally { $('importBackupInput').value = ''; }
}

async function resetVault() {
  if (!confirm('Isso apagará TODOS os documentos deste dispositivo. Essa ação não pode ser desfeita.')) return;
  const typed = prompt('Digite APAGAR para confirmar:');
  if (typed !== 'APAGAR') { toast('Operação cancelada.'); return; }
  await clearLocalVault();
  location.reload();
}

async function updateStorageInfo() {
  try {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      $('storageInfo').textContent = `${formatBytes(used)} usados neste site${quota ? ` de aproximadamente ${formatBytes(quota)} disponíveis` : ''}.`;
    } else {
      const total = state.docs.reduce((sum,d) => sum + (d.fileSize || 0), 0);
      $('storageInfo').textContent = `${formatBytes(total)} em arquivos cadastrados.`;
    }
  } catch {
    $('storageInfo').textContent = 'Não foi possível calcular o armazenamento.';
  }
}

async function requestNotifications() {
  if (!('Notification' in window)) { toast('Este navegador não suporta notificações.'); return; }
  const permission = await Notification.requestPermission();
  if (permission === 'granted') { toast('Notificações ativadas.'); maybeNotifyExpiring(true); }
  else toast('Permissão de notificações não concedida.');
}

function maybeNotifyExpiring(force = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const candidates = state.docs.filter(doc => {
    const days = daysUntil(doc.expiryDate);
    return days !== null && days >= 0 && days <= 30;
  }).slice(0, 3);
  const today = new Date().toISOString().slice(0,10);
  for (const doc of candidates) {
    const key = `cofreNotified:${doc.id}:${today}`;
    if (!force && localStorage.getItem(key)) continue;
    const days = daysUntil(doc.expiryDate);
    new Notification('MasterSafe · Radar', { body: days === 0 ? `${doc.title} vence hoje.` : `${doc.title} vence em ${days} dias.`, icon: 'assets/icon.svg' });
    localStorage.setItem(key, '1');
  }
}


function setCloudAuthMode(mode = 'login') {
  state.cloudAuthMode = mode === 'signup' ? 'signup' : 'login';
  const signup = state.cloudAuthMode === 'signup';
  $('cloudNameLabel')?.classList.toggle('hidden', !signup);
  $('cloudConsentLabel')?.classList.toggle('hidden', !signup);
  if (!signup && $('cloudConsentInput')) $('cloudConsentInput').checked = false;
  if ($('cloudAuthSubmitButton')) $('cloudAuthSubmitButton').textContent = signup ? 'Criar conta' : 'Entrar';
  $('authTabLogin')?.classList.toggle('btn-dark', !signup);
  $('authTabLogin')?.classList.toggle('btn-secondary', signup);
  $('authTabSignup')?.classList.toggle('btn-dark', signup);
  $('authTabSignup')?.classList.toggle('btn-secondary', !signup);
}

async function openCloudAuth(restoreRequested = false) {
  state.cloudRestoreRequested = Boolean(restoreRequested);
  if (!window.CofreCloud?.isConfigured?.()) {
    openModal('cloudConfigModal');
    toast('Configure a conexão com o Supabase primeiro.');
    return;
  }
  setCloudAuthMode('login');
  openModal('cloudAuthModal');
  setTimeout(() => $('cloudEmailInput')?.focus(), 50);
}

function formatCloudTime(value) {
  if (!value) return 'Nenhuma sincronização ainda.';
  try { return `Última sincronização: ${new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value))}.`; }
  catch { return 'Sincronização anterior registrada.'; }
}

async function refreshCloudUI() {
  if (!window.CofreCloud) return;
  const status = await window.CofreCloud.status().catch(error => ({ configured: window.CofreCloud.isConfigured?.(), connected: false, error: error.message }));
  state.cloud = { ...state.cloud, ...status };
  const badge = $('cloudStateBadge');
  const text = $('cloudStateText');
  const syncButton = $('syncNowButton');
  const loginButton = $('cloudLoginButton');
  const outButton = $('cloudSignOutButton');
  const chip = $('cloudStatusChip');
  const configured = Boolean(status.configured);
  const connected = Boolean(status.connected && status.user);

  if (badge) {
    badge.className = `badge ${connected ? 'badge-safe' : configured ? 'badge-warning' : 'badge-neutral'}`;
    badge.textContent = connected ? 'Conectada' : configured ? 'Desconectada' : 'Não configurada';
  }
  if (text) text.textContent = connected
    ? `Conta: ${status.user.email || 'usuário autenticado'}. Seus documentos são sincronizados já criptografados.`
    : configured ? 'A conexão está salva. Entre na sua conta para sincronizar.' : 'Conecte um projeto Supabase para criar conta real e sincronizar notebook e celular.';
  if ($('cloudLastSync')) $('cloudLastSync').textContent = formatCloudTime(status.lastSync);
  if (syncButton) syncButton.disabled = !connected || !state.key || state.cloud.syncing;
  if (loginButton) loginButton.classList.toggle('hidden', connected);
  if (outButton) outButton.classList.toggle('hidden', !connected);
  if (chip) chip.textContent = connected ? '● Cofre desbloqueado · nuvem ativa' : '● Cofre desbloqueado · local';
  if ($('setupMfaButton')) $('setupMfaButton').disabled = !connected;
  if ($('registerPasskeyButton')) $('registerPasskeyButton').disabled = !connected;

  if (connected) {
    const [factors, passkeys] = await Promise.all([
      window.CofreCloud.listMFAFactors().catch(() => []),
      window.CofreCloud.listPasskeys().catch(() => [])
    ]);
    if ($('mfaState')) $('mfaState').textContent = factors.length ? `${factors.length} fator(es) ativo(s)` : 'Ainda não configurado';
    if ($('passkeyState')) $('passkeyState').textContent = passkeys.length ? `${passkeys.length} passkey(s) cadastrada(s)` : 'Nenhuma passkey cadastrada';
  } else {
    if ($('mfaState')) $('mfaState').textContent = 'Requer conta na nuvem';
    if ($('passkeyState')) $('passkeyState').textContent = 'Requer conta e recurso habilitado no Supabase';
  }
  if ($('recoveryState')) $('recoveryState').textContent = getConfig()?.recovery ? 'Código configurado' : 'Ainda não criado';
}

async function afterCloudAuthenticated() {
  closeModal('cloudAuthModal');
  const user = await window.CofreCloud.getUser();
  if (!user) return;

  if (state.key && getConfig()) {
    await window.CofreCloud.saveVaultEnvelope(cloudVaultEnvelope(), {
      displayName: state.profile?.name || user.user_metadata?.display_name || '',
      emailHint: user.email || state.profile?.email || '',
      termsVersion: user.user_metadata?.terms_version || undefined,
      privacyVersion: user.user_metadata?.privacy_version || undefined,
      termsAcceptedAt: user.user_metadata?.terms_accepted_at || undefined
    });
    await syncCloud(true).catch(error => console.warn('Sync inicial falhou', error));
    toast('Conta conectada ao MasterSafe.');
    window.CofreCloud.logSecurityEvent?.('account.connected').catch(() => {});
  } else if (!getConfig() || state.cloudRestoreRequested) {
    const envelope = await window.CofreCloud.loadVaultEnvelope();
    if (!envelope) {
      toast('Esta conta ainda não possui um cofre sincronizado.');
    } else {
      installCloudEnvelope(envelope);
      openModal('restoreVaultModal');
    }
  } else {
    toast('Conta conectada. Desbloqueie o cofre para sincronizar.');
  }
  await refreshCloudUI();
}

async function handleCloudAuthSubmit() {
  const email = $('cloudEmailInput').value.trim();
  const password = $('cloudPasswordInput').value;
  const name = $('cloudNameInput').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Informe um e-mail válido.');
  if (password.length < 8) return toast('A senha da conta precisa ter pelo menos 8 caracteres.');
  if (state.cloudAuthMode === 'signup' && !$('cloudConsentInput')?.checked) return toast('Aceite os Termos de Uso e a Política de Privacidade para criar a conta.');
  const button = $('cloudAuthSubmitButton');
  setBusy(button, true, state.cloudAuthMode === 'signup' ? 'Criando conta...' : 'Entrando...');
  try {
    if (state.cloudAuthMode === 'signup') {
      const result = await window.CofreCloud.signUp(email, password, name || state.profile?.name || '', { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, termsAcceptedAt: new Date().toISOString() });
      if (result.needsEmailConfirmation) {
        toast('Conta criada. Confirme o e-mail e depois entre.');
        setCloudAuthMode('login');
        return;
      }
      await afterCloudAuthenticated();
    } else {
      const result = await window.CofreCloud.signIn(email, password);
      if (result.mfaRequired) {
        state.pendingMFAFactorId = result.factors[0]?.id || null;
        state.pendingTOTPEnrollment = null;
        $('mfaModalTitle').textContent = 'Confirmar segundo fator';
        $('mfaMessage').textContent = 'Digite o código atual do seu aplicativo autenticador.';
        $('mfaQrBox').classList.add('hidden');
        $('mfaCodeInput').value = '';
        closeModal('cloudAuthModal');
        openModal('mfaModal');
      } else {
        await afterCloudAuthenticated();
      }
    }
  } catch (error) {
    console.error(error);
    toast(error.message || 'Não foi possível autenticar.');
  } finally { setBusy(button, false); }
}

async function handlePasskeyLogin() {
  const button = $('cloudPasskeyLoginButton');
  setBusy(button, true, 'Abrindo passkey...');
  try {
    await window.CofreCloud.signInWithPasskey();
    await afterCloudAuthenticated();
  } catch (error) {
    console.error(error);
    toast(error.message || 'Não foi possível entrar com passkey.');
  } finally { setBusy(button, false); }
}

async function beginMFAEnrollment() {
  const button = $('setupMfaButton');
  setBusy(button, true, 'Preparando...');
  try {
    const data = await window.CofreCloud.enrollTOTP();
    state.pendingMFAFactorId = data.id;
    state.pendingTOTPEnrollment = data;
    $('mfaModalTitle').textContent = 'Ativar 2FA';
    $('mfaMessage').textContent = 'Escaneie o QR Code com Google Authenticator, 1Password, Authy ou outro app TOTP e confirme o código.';
    $('mfaQrBox').classList.remove('hidden');
    $('mfaQrImage').src = data.totp?.qr_code || '';
    $('mfaSecretText').textContent = data.totp?.secret ? `Chave manual: ${data.totp.secret}` : '';
    $('mfaCodeInput').value = '';
    openModal('mfaModal');
  } catch (error) {
    console.error(error); toast(error.message || 'Não foi possível iniciar o 2FA.');
  } finally { setBusy(button, false); }
}

async function verifyMFAFlow() {
  const code = $('mfaCodeInput').value.trim();
  if (!state.pendingMFAFactorId || code.length < 6) return toast('Digite o código do autenticador.');
  const button = $('verifyMfaButton');
  setBusy(button, true, 'Verificando...');
  try {
    await window.CofreCloud.verifyTOTP(state.pendingMFAFactorId, code);
    const wasEnrollment = Boolean(state.pendingTOTPEnrollment);
    state.pendingMFAFactorId = null;
    state.pendingTOTPEnrollment = null;
    closeModal('mfaModal');
    if (wasEnrollment) { toast('2FA ativado com sucesso.'); window.CofreCloud.logSecurityEvent?.('security.mfa_enabled').catch(() => {}); }
    else await afterCloudAuthenticated();
    await refreshCloudUI();
  } catch (error) {
    console.error(error); toast(error.message || 'Código inválido.');
  } finally { setBusy(button, false); }
}

async function registerCloudPasskey() {
  const button = $('registerPasskeyButton');
  setBusy(button, true, 'Registrando...');
  try {
    await window.CofreCloud.registerPasskey();
    toast('Passkey cadastrada.');
    window.CofreCloud.logSecurityEvent?.('security.passkey_registered').catch(() => {});
    await refreshCloudUI();
  } catch (error) {
    console.error(error);
    const msg = String(error.message || 'Falha ao cadastrar passkey.');
    toast(msg.includes('disabled') ? 'Ative Passkeys em Authentication → Passkeys no Supabase.' : msg);
  } finally { setBusy(button, false); }
}

async function syncCloud(silent = false) {
  if (!state.key) throw new Error('Desbloqueie o cofre antes de sincronizar.');
  if (state.cloud.syncing) return;
  state.cloud.syncing = true;
  const button = $('syncNowButton');
  button?.classList.add('cloud-syncing');
  if (button) setBusy(button, true, 'Sincronizando...');
  try {
    await pushVaultEnvelopeToCloud();
    const result = await window.CofreCloud.sync();
    await loadDocuments();
    renderAll();
    if (!silent) {
      toast(`Sincronizado: ${result.uploaded} enviado(s), ${result.downloaded} recebido(s)${result.skipped ? `, ${result.skipped} mantido(s) só neste dispositivo por limite gratuito` : ''}.`);
      window.CofreCloud.logSecurityEvent?.('vault.sync', { uploaded: result.uploaded, downloaded: result.downloaded, skipped: result.skipped || 0 }).catch(() => {});
    }
    return result;
  } finally {
    state.cloud.syncing = false;
    button?.classList.remove('cloud-syncing');
    if (button) setBusy(button, false);
    await refreshCloudUI().catch(() => {});
  }
}

function scheduleCloudSync() {
  clearTimeout(scheduleCloudSync.timer);
  scheduleCloudSync.timer = setTimeout(async () => {
    try {
      const status = await window.CofreCloud?.status?.();
      if (status?.connected && state.key) await syncCloud(true);
    } catch (error) { console.warn('Sincronização automática adiada', error); }
  }, 1200);
}

async function restoreVaultFromCloud() {
  const password = $('restoreMasterPasswordInput').value;
  const recoveryCode = $('restoreRecoveryCodeInput').value.trim();
  if (!password && !recoveryCode) return toast('Informe a senha-mestra ou o código de recuperação.');
  const button = $('restoreVaultSubmitButton');
  setBusy(button, true, 'Restaurando...');
  try {
    const envelope = await window.CofreCloud.loadVaultEnvelope();
    if (!envelope) throw new Error('Nenhum cofre encontrado nesta conta.');
    installCloudEnvelope(envelope);
    let usedRecovery = false;
    if (password) await unlockVault(password);
    else { await unlockVaultWithRecovery(recoveryCode); usedRecovery = true; }

    const cloudProfile = await window.CofreCloud.loadProfile().catch(() => null);
    await saveEncryptedProfile({
      name: cloudProfile?.display_name || 'Usuário',
      email: cloudProfile?.email_hint || (await window.CofreCloud.getUser())?.email || ''
    });
    await syncCloud(true);
    await loadDocuments();
    closeModal('restoreVaultModal');
    closeModal('cloudAuthModal');
    showApp();
    toast('Cofre restaurado neste dispositivo.');
    if (usedRecovery) setTimeout(() => openModal('changePasswordModal'), 350);
  } catch (error) {
    console.error(error); toast(error.message || 'Não foi possível restaurar o cofre.');
  } finally { setBusy(button, false); }
}

async function createRecoveryFlow() {
  const button = $('generateRecoveryButton');
  setBusy(button, true, 'Gerando...');
  try {
    const code = await generateRecoveryCode();
    $('recoveryCodeDisplay').textContent = code;
    openModal('recoveryModal');
    await refreshCloudUI();
    window.CofreCloud?.logSecurityEvent?.('vault.recovery_code_created').catch(() => {});
  } catch (error) { console.error(error); toast(error.message || 'Falha ao gerar código.'); }
  finally { setBusy(button, false); }
}

async function saveNewMasterPassword() {
  const a = $('newMasterPasswordInput').value;
  const b = $('newMasterPasswordConfirmInput').value;
  if (a.length < 10) return toast('Use pelo menos 10 caracteres.');
  if (a !== b) return toast('As senhas não coincidem.');
  const button = $('saveNewMasterPasswordButton');
  setBusy(button, true, 'Atualizando...');
  try {
    await changeMasterPassword(a);
    $('newMasterPasswordInput').value = '';
    $('newMasterPasswordConfirmInput').value = '';
    closeModal('changePasswordModal');
    toast('Senha-mestra atualizada sem reencriptar os arquivos.');
    window.CofreCloud?.logSecurityEvent?.('vault.master_password_changed').catch(() => {});
  } catch (error) { console.error(error); toast(error.message || 'Falha ao alterar senha.'); }
  finally { setBusy(button, false); }
}

async function createShareLink() {
  throw new Error('Compartilhamento por link está desativado no Modo Zero Custo. Use o download do arquivo ou o backup para compartilhar fora do Cofre.');
  const doc = state.docs.find(d => d.id === state.selectedId);
  if (!doc || !state.selectedRaw?.file) return toast('Este registro não possui arquivo para compartilhar.');
  const cloudStatus = await window.CofreCloud.status().catch(() => null);
  if (!cloudStatus?.connected) return toast('Entre na conta da nuvem para criar links temporários.');
  const button = $('createShareLinkButton');
  setBusy(button, true, 'Criptografando cópia...');
  try {
    const plain = await decryptBytes(state.key, state.selectedRaw.file);
    const shareKeyBytes = randomBytes(32);
    const shareKey = await importVaultKey(shareKeyBytes);
    const encrypted = await encryptBytes(shareKey, plain);
    const shareId = uuid();
    const expiresIn = Number($('shareExpirySelect').value || 3600);
    const upload = await window.CofreCloud.uploadTemporaryShare({
      id: shareId,
      cipherBytes: base64ToBytes(encrypted.cipher),
      expiresIn
    });
    const base = new URL('share.html', location.href).href;
    const params = new URLSearchParams({
      u: upload.signedUrl,
      n: doc.fileName || doc.title || 'documento',
      m: doc.mimeType || 'application/octet-stream'
    });
    const fragment = new URLSearchParams({
      k: bytesToBase64Url(shareKeyBytes),
      iv: bytesToBase64Url(base64ToBytes(encrypted.iv))
    });
    const link = `${base}?${params.toString()}#${fragment.toString()}`;
    state.activeShare = { path: upload.path, link };
    $('shareLinkOutput').value = link;
    $('shareResult').classList.remove('hidden');
    toast('Link temporário criado.');
    window.CofreCloud?.logSecurityEvent?.('document.share_created', { expires_in: expiresIn }).catch(() => {});
  } catch (error) {
    console.error(error); toast(error.message || 'Não foi possível criar o link.');
  } finally { setBusy(button, false); }
}

async function revokeActiveShare() {
  if (!state.activeShare?.path) return;
  const button = $('revokeShareButton');
  setBusy(button, true, 'Revogando...');
  try {
    await window.CofreCloud.revokeShare(state.activeShare.path);
    state.activeShare = null;
    $('shareResult').classList.add('hidden');
    $('shareLinkOutput').value = '';
    toast('Link revogado.');
    window.CofreCloud?.logSecurityEvent?.('document.share_revoked').catch(() => {});
  } catch (error) { console.error(error); toast(error.message || 'Falha ao revogar.'); }
  finally { setBusy(button, false); }
}

async function openShareModal() {
  const status = await window.CofreCloud.status().catch(() => null);
  if (!status?.connected) return toast('Conecte sua conta da nuvem antes de compartilhar.');
  state.activeShare = null;
  $('shareResult').classList.add('hidden');
  $('shareLinkOutput').value = '';
  openModal('shareModal');
}

function wireEvents() {
  $('setupButton').addEventListener('click', async () => {
    const name = $('setupName').value.trim();
    const email = $('setupEmail').value.trim();
    const pass = $('setupPassword').value;
    const confirmPass = $('setupPasswordConfirm').value;
    if (!name) return toast('Informe seu nome.');
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return toast('Informe um e-mail válido.');
    if (pass.length < 8) return toast('Use uma senha-mestra com pelo menos 8 caracteres.');
    if (pass !== confirmPass) return toast('As senhas não coincidem.');
    const button = $('setupButton');
    setBusy(button, true, 'Criando cofre...');
    try {
      await createVault(pass);
      await saveEncryptedProfile({ name, email });
      await loadDocuments();
      showApp();
      toast('Seu cofre foi criado.');
      await refreshCloudUI().catch(() => {});
    } catch (error) {
      console.error(error); toast('Não foi possível criar o cofre.');
    } finally { setBusy(button, false); }
  });

  $('unlockButton').addEventListener('click', async () => {
    const pass = $('unlockPassword').value;
    if (!pass) return toast('Digite sua senha-mestra.');
    const button = $('unlockButton');
    setBusy(button, true, 'Desbloqueando...');
    try {
      await unlockVault(pass);
      await loadEncryptedProfile();
      await loadDocuments();
      showApp();
      scheduleCloudSync();
    } catch (error) {
      console.error(error); toast('Senha-mestra incorreta ou cofre inválido.');
    } finally { setBusy(button, false); }
  });

  $('unlockPassword').addEventListener('keydown', e => { if (e.key === 'Enter') $('unlockButton').click(); });
  $('lockButton').addEventListener('click', lockVault);
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
  document.querySelectorAll('[data-view-jump]').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.viewJump)));
  $('mobileMenuButton').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));

  ['addDocumentTop','addDocumentHero','addDocumentDocuments'].forEach(id => $(id).addEventListener('click', () => { resetDocumentForm(); openModal('documentModal'); }));
  document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.closeModal)));
  document.querySelectorAll('.modal').forEach(modal => modal.addEventListener('click', e => { if (e.target === modal) closeModal(modal.id); }));

  $('chooseFileButton').addEventListener('click', () => $('documentFile').click());
  $('documentFile').addEventListener('change', e => inferMetadataFromFile(e.target.files[0]));
  const drop = $('dropzone');
  ['dragenter','dragover'].forEach(evt => drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave','drop'].forEach(evt => drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', e => inferMetadataFromFile(e.dataTransfer.files[0]));
  $('documentForm').addEventListener('submit', saveDocument);

  $('globalSearch').addEventListener('input', e => {
    state.search = e.target.value;
    if (state.search.trim() && state.currentView !== 'documents') showView('documents');
    else renderDocuments();
  });
  $('categoryFilter').addEventListener('change', renderDocuments);
  $('expiryFilter').addEventListener('change', renderDocuments);
  $('clearFilters').addEventListener('click', () => {
    $('categoryFilter').value = '';
    $('expiryFilter').value = '';
    $('globalSearch').value = '';
    state.search = '';
    renderDocuments();
  });

  document.addEventListener('click', e => {
    const docEl = e.target.closest('[data-doc-id]');
    if (docEl) openViewer(docEl.dataset.docId);
    const catEl = e.target.closest('[data-category]');
    if (catEl) {
      $('categoryFilter').value = catEl.dataset.category;
      showView('documents');
    }
  });

  $('openDocumentButton').addEventListener('click', openSelectedFile);
  $('downloadDocumentButton').addEventListener('click', downloadSelectedFile);
  $('deleteDocumentButton').addEventListener('click', deleteSelectedDocument);
  $('notificationButton').addEventListener('click', requestNotifications);
  $('exportBackup').addEventListener('click', exportBackup);
  $('importBackupInput').addEventListener('change', e => importBackup(e.target.files[0]));
  $('analyzeDocumentButton')?.addEventListener('click', () => analyzePendingDocument(false));
  $('showExtractedTextButton')?.addEventListener('click', () => $('extractedTextPreview').classList.toggle('hidden'));
  $('askVaultButton')?.addEventListener('click', askVault);
  $('vaultQuestion')?.addEventListener('keydown', e => { if (e.key === 'Enter') askVault(); });
  $('saveProfileButton')?.addEventListener('click', async () => {
    const name = $('profileNameInput').value.trim() || 'Usuário';
    const email = $('profileEmailInput').value.trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return toast('Informe um e-mail válido.');
    await saveEncryptedProfile({ name, email });
    toast('Perfil atualizado.');
  });
  $('restoreCloudButton')?.addEventListener('click', () => openCloudAuth(true));
  $('cloudAccountButton')?.addEventListener('click', () => openCloudAuth(false));
  $('configureCloudButton')?.addEventListener('click', () => {
    const cfg = window.CofreCloud?.getConfig?.();
    $('supabaseUrlInput').value = cfg?.url || '';
    $('supabaseKeyInput').value = cfg?.publishableKey || '';
    openModal('cloudConfigModal');
  });
  $('saveCloudConfigButton')?.addEventListener('click', async () => {
    const button = $('saveCloudConfigButton');
    setBusy(button, true, 'Conectando...');
    try {
      window.CofreCloud.configure($('supabaseUrlInput').value, $('supabaseKeyInput').value);
      await window.CofreCloud.init();
      closeModal('cloudConfigModal');
      toast('Conexão com Supabase configurada.');
      await refreshCloudUI();
      if (state.cloudRestoreRequested) await openCloudAuth(true);
    } catch (error) { console.error(error); toast(error.message || 'Falha ao configurar a nuvem.'); }
    finally { setBusy(button, false); }
  });
  $('cloudLoginButton')?.addEventListener('click', () => openCloudAuth(false));
  $('authTabLogin')?.addEventListener('click', () => setCloudAuthMode('login'));
  $('authTabSignup')?.addEventListener('click', () => setCloudAuthMode('signup'));
  $('cloudAuthSubmitButton')?.addEventListener('click', handleCloudAuthSubmit);
  $('cloudPasswordInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleCloudAuthSubmit(); });
  $('cloudPasskeyLoginButton')?.addEventListener('click', handlePasskeyLogin);
  $('cloudForgotPasswordButton')?.addEventListener('click', async () => {
    const email = $('cloudEmailInput').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Digite o e-mail da conta primeiro.');
    try { await window.CofreCloud.sendPasswordReset(email); toast('E-mail de recuperação da conta enviado.'); }
    catch (error) { console.error(error); toast(error.message || 'Não foi possível enviar a recuperação.'); }
  });
  $('syncNowButton')?.addEventListener('click', () => syncCloud(false).catch(error => toast(error.message || 'Falha ao sincronizar.')));
  $('cloudSignOutButton')?.addEventListener('click', async () => {
    try { await window.CofreCloud.signOut(); toast('Conta da nuvem desconectada.'); await refreshCloudUI(); }
    catch (error) { toast(error.message || 'Falha ao sair.'); }
  });
  $('setupMfaButton')?.addEventListener('click', beginMFAEnrollment);
  $('verifyMfaButton')?.addEventListener('click', verifyMFAFlow);
  $('mfaCodeInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') verifyMFAFlow(); });
  $('registerPasskeyButton')?.addEventListener('click', registerCloudPasskey);
  $('restoreVaultSubmitButton')?.addEventListener('click', restoreVaultFromCloud);
  $('generateRecoveryButton')?.addEventListener('click', createRecoveryFlow);
  $('copyRecoveryCodeButton')?.addEventListener('click', async () => {
    const value = $('recoveryCodeDisplay').textContent;
    try { await navigator.clipboard.writeText(value); toast('Código copiado.'); }
    catch { prompt('Copie o código:', value); }
  });
  $('changeMasterPasswordButton')?.addEventListener('click', () => openModal('changePasswordModal'));
  $('saveNewMasterPasswordButton')?.addEventListener('click', saveNewMasterPassword);
  $('shareDocumentButton')?.addEventListener('click', openShareModal);
  $('createShareLinkButton')?.addEventListener('click', createShareLink);
  $('copyShareLinkButton')?.addEventListener('click', async () => {
    const value = $('shareLinkOutput').value;
    try { await navigator.clipboard.writeText(value); toast('Link copiado.'); }
    catch { prompt('Copie o link:', value); }
  });
  $('revokeShareButton')?.addEventListener('click', revokeActiveShare);
  $('resetVault').addEventListener('click', resetVault);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal:not(.hidden)').forEach(modal => closeModal(modal.id));
  });
}

async function init() {
  if (!window.crypto?.subtle || !window.indexedDB) {
    document.body.innerHTML = '<div style="padding:40px;font-family:system-ui"><h1>Navegador incompatível</h1><p>O MasterSafe precisa de Web Crypto e IndexedDB. Abra em uma versão atual do Chrome, Edge, Firefox ou Safari.</p></div>';
    return;
  }
  state.db = await openDB();
  populateCategorySelects();
  wireEvents();
  const config = getConfig();
  if (config) {
    $('unlockForm').classList.remove('hidden');
    $('authSubtitle').textContent = 'Seu cofre está bloqueado. Digite sua senha-mestra para continuar.';
    setTimeout(() => $('unlockPassword').focus(), 50);
  } else {
    $('setupForm').classList.remove('hidden');
    $('authSubtitle').textContent = 'Crie uma senha-mestra. Ela será a chave dos seus documentos neste dispositivo.';
    setTimeout(() => $('setupPassword').focus(), 50);
  }

  if (window.CofreCloud?.isConfigured?.()) {
    window.CofreCloud.init().then(() => refreshCloudUI()).catch(error => console.warn('Nuvem indisponível', error));
  }

  if (!window.__TAURI_INTERNALS__ && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service worker não registrado', error));
  }
}

init().catch(error => {
  console.error(error);
  toast('Falha ao iniciar o MasterSafe.');
});
