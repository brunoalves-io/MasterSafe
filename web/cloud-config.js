'use strict';

/* MasterSafe V6 Zero Custo — Supabase configurado.
   Esta publishable key é pública por design e deve ser protegida por RLS.
   NUNCA coloque service_role/secret key neste arquivo. */
window.COFRE_CLOUD_PRESET = {
  url: 'https://umtsbjxtstqbkoqnhqrt.supabase.co',
  publishableKey: 'sb_publishable_CYlTaoSqINVNIrcHCiK3xg_HtiSB61v'
};

/* MasterSafe 7.10.13 — usa o mesmo ícone oficial do desktop nas telas de criação e desbloqueio do cofre. */
(() => {
  const style = document.createElement('style');
  style.id = 'mastersafe-auth-desktop-icon';
  style.textContent = `
    #authScreen .brand-lock {
      position: relative !important;
      width: 86px !important;
      height: 86px !important;
      border: 0 !important;
      border-radius: 20px !important;
      padding: 0 !important;
      margin: 0 auto !important;
      overflow: hidden !important;
      font-size: 0 !important;
      line-height: 0 !important;
      color: transparent !important;
      background: #0f172a url('assets/icon.svg') center center / 100% 100% no-repeat !important;
      box-shadow: 0 18px 36px rgba(15, 23, 42, .18) !important;
    }

    #authScreen .brand-lock::before,
    #authScreen .brand-lock::after {
      display: none !important;
      content: none !important;
      background: none !important;
    }
  `;
  document.head.appendChild(style);
})();
