/* MasterSafe V6 Zero Custo — conta, privacidade e limites defensivos do beta. */
(() => {
  'use strict';

  const ONBOARDING_KEY = 'cofre_v6_onboarding_complete';
  const CLOUD_LIMIT = 250 * 1024 * 1024;
  const EVENT_LABELS = {
    'account.connected': ['◎', 'Conta conectada'],
    'vault.sync': ['↻', 'Sincronização manual'],
    'security.mfa_enabled': ['🛡', '2FA ativado'],
    'security.passkey_registered': ['🔑', 'Passkey cadastrada'],
    'vault.recovery_code_created': ['✚', 'Código de recuperação criado'],
    'vault.master_password_changed': ['◆', 'Senha-mestra alterada'],
    'data.encrypted_backup_exported': ['⇩', 'Backup criptografado exportado'],
    'data.portable_exported': ['⇩', 'Dados legíveis exportados']
  };

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');

  function toast(message) {
    const el = $('toast');
    if (!el) return alert(message);
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  function openModal(id) { $(id)?.classList.remove('hidden'); }
  function closeModal(id) { $(id)?.classList.add('hidden'); }

  function formatDateTime(value) {
    try { return new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'short' }).format(new Date(value)); }
    catch { return 'Data não disponível'; }
  }

  async function renderSecurityEvents(connected) {
    const root = $('securityEventsList');
    if (!root) return;
    if (!connected) {
      root.innerHTML = '<div class="empty-state"><strong>Histórico da nuvem indisponível</strong>Entre na conta para consultar os últimos eventos.</div>';
      return;
    }
    try {
      const events = await window.CofreCloud.getSecurityEvents(20);
      if (!events.length) {
        root.innerHTML = '<div class="empty-state"><strong>Nenhum evento registrado</strong>As próximas ações de segurança aparecerão aqui.</div>';
        return;
      }
      root.innerHTML = events.map(event => {
        const meta = EVENT_LABELS[event.event_type] || ['•', event.event_type];
        const detail = event.details && Object.keys(event.details).length
          ? Object.entries(event.details).map(([k,v]) => `${esc(k)}: ${esc(v)}`).join(' · ')
          : 'Sem dados sensíveis registrados';
        return `<div class="security-event"><div class="security-event-icon">${esc(meta[0])}</div><div><strong>${esc(meta[1])}</strong><small>${detail}</small></div><small>${esc(formatDateTime(event.created_at))}</small></div>`;
      }).join('');
    } catch (error) {
      console.warn('Histórico de segurança', error);
      root.innerHTML = '<div class="empty-state"><strong>Não foi possível carregar</strong>Confira se o schema V6 Zero Custo foi aplicado no Supabase.</div>';
    }
  }

  async function renderAccount() {
    if (!window.CofreCloud || !window.CofreBetaBridge) return;
    const status = await window.CofreCloud.status().catch(() => ({ configured:false, connected:false }));
    const connected = Boolean(status?.connected && status?.user);
    const usage = connected ? await window.CofreCloud.getUsageBytes().catch(() => 0) : 0;
    const fmt = window.CofreBetaBridge.formatBytes || (n => `${n} bytes`);

    if ($('accountPlanName')) $('accountPlanName').textContent = connected ? 'Zero Custo Cloud' : 'Local';
    if ($('accountPlanBadge')) {
      $('accountPlanBadge').textContent = connected ? 'Beta R$ 0' : 'Plano local';
      $('accountPlanBadge').className = `badge ${connected ? 'badge-safe' : 'badge-neutral'}`;
    }
    if ($('accountCloudBadge')) {
      $('accountCloudBadge').textContent = connected ? 'Nuvem grátis ativa' : 'Sem conta';
      $('accountCloudBadge').className = `badge ${connected ? 'badge-safe' : 'badge-neutral'}`;
    }
    if ($('accountPlanDescription')) $('accountPlanDescription').textContent = connected
      ? `Conta ${status.user.email || ''}. Seus arquivos são cifrados antes da sincronização. Limite defensivo do beta: 250 MB por usuário.`
      : 'O cofre local funciona sem servidor e sem mensalidade. A nuvem gratuita é opcional para sincronizar outros dispositivos.';

    if ($('accountUsageText')) $('accountUsageText').textContent = connected ? `${fmt(usage)} de ${fmt(CLOUD_LIMIT)}` : 'Somente local';
    if ($('accountUsageBar')) $('accountUsageBar').style.width = connected ? `${Math.min(100, (usage / CLOUD_LIMIT) * 100)}%` : '0%';
    if ($('deleteCloudAccountButton')) $('deleteCloudAccountButton').disabled = !connected;

    document.querySelectorAll('.plan-card').forEach((card, i) => card.classList.toggle('active', i === 0));
    await renderSecurityEvents(connected);
  }

  async function deleteCloudAccount() {
    const status = await window.CofreCloud.status().catch(() => null);
    if (!status?.connected) return toast('Entre na conta da nuvem primeiro.');
    if (!confirm('Isso excluirá permanentemente sua conta e os dados sincronizados na nuvem. Continuar?')) return;
    const typed = prompt('Digite EXCLUIR para confirmar a exclusão da conta:');
    if (typed !== 'EXCLUIR') return toast('Exclusão cancelada.');

    const button = $('deleteCloudAccountButton');
    if (button) { button.disabled = true; button.dataset.oldText = button.textContent; button.textContent = 'Excluindo...'; }
    try {
      await window.CofreCloud.deleteAccount();
      toast('Conta e dados da nuvem excluídos.');
      const eraseLocal = confirm('Deseja apagar também a cópia local deste dispositivo?');
      if (eraseLocal) {
        await window.CofreBetaBridge.clearLocalVault();
        location.reload();
        return;
      }
      await window.CofreBetaBridge.refreshCloudUI().catch(() => {});
      await renderAccount();
    } catch (error) {
      console.error(error);
      const msg = String(error?.message || 'Não foi possível excluir a conta.');
      toast(msg.includes('delete-account') || msg.includes('Function')
        ? 'A função gratuita delete-account ainda não foi publicada no Supabase.'
        : msg);
    } finally {
      if (button) { button.disabled = false; button.textContent = button.dataset.oldText || 'Excluir conta e dados da nuvem'; }
    }
  }

  function maybeShowOnboarding() {
    const shell = $('appShell');
    if (!shell || shell.classList.contains('hidden')) return;
    if (localStorage.getItem(ONBOARDING_KEY) === '1') return;
    openModal('onboardingModal');
  }

  function finishOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, '1');
    closeModal('onboardingModal');
  }

  function updateQuotaCopy() {
    const copy = document.querySelector('.plan-card[data-plan="free"] small');
    if (copy) copy.textContent = 'Cofre local no dispositivo + sincronização opcional de até 250 MB na nuvem, com no máximo 25 MB por arquivo.';
  }

  function wire() {
    $('exportPortableDataButton')?.addEventListener('click', async () => {
      const button = $('exportPortableDataButton');
      const old = button.textContent;
      button.disabled = true; button.textContent = 'Preparando...';
      try { await window.CofreBetaBridge.exportPortableData(); }
      catch (error) { console.error(error); toast(error.message || 'Falha ao exportar seus dados.'); }
      finally { button.disabled = false; button.textContent = old; }
    });
    $('accountBackupButton')?.addEventListener('click', () => $('exportBackup')?.click());
    $('refreshSecurityEventsButton')?.addEventListener('click', renderAccount);
    $('deleteCloudAccountButton')?.addEventListener('click', deleteCloudAccount);

    $('onboardingAddDocument')?.addEventListener('click', () => { finishOnboarding(); $('addDocumentTop')?.click(); });
    $('onboardingCloud')?.addEventListener('click', () => { finishOnboarding(); $('configureCloudButton')?.click(); });
    $('onboardingRecovery')?.addEventListener('click', () => { finishOnboarding(); $('generateRecoveryButton')?.click(); });
    $('onboardingAccount')?.addEventListener('click', () => { finishOnboarding(); window.CofreBetaBridge.showView('account'); setTimeout(renderAccount, 50); });
    $('finishOnboardingButton')?.addEventListener('click', finishOnboarding);

    document.querySelector('.nav-item[data-view="account"]')?.addEventListener('click', () => setTimeout(renderAccount, 30));

    const shell = $('appShell');
    if (shell) {
      new MutationObserver(() => {
        if (!shell.classList.contains('hidden')) setTimeout(maybeShowOnboarding, 180);
      }).observe(shell, { attributes:true, attributeFilter:['class'] });
    }

    const chip = $('cloudStatusChip');
    if (chip) new MutationObserver(() => {
      if ($('view-account')?.classList.contains('active')) renderAccount();
    }).observe(chip, { childList:true, subtree:true, characterData:true });

    updateQuotaCopy();
    setTimeout(maybeShowOnboarding, 400);
  }

  wire();
})();

/* MasterSafe V7.2: carrega o módulo opcional de IA sem alterar o núcleo do cofre. */
(() => {
  if (document.querySelector('script[data-mastersafe-ai]')) return;
  const script = document.createElement('script');
  script.src = 'ai.js';
  script.dataset.mastersafeAi = '1';
  script.async = true;
  document.head.appendChild(script);
})();
