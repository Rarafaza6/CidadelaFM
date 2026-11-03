/* ==========================================================================
   WAVE RÁDIO — GESTOR DE CONSENTIMENTO DE COOKIES & GOOGLE CONSENT MODE V2
   Conformidade integral com RGPD (Regulamento Geral sobre a Proteção de Dados)
   e Diretiva ePrivacy da União Europeia.
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_KEY = 'wave_cookie_consent';
  const GA_MEASUREMENT_ID = 'G-08TP49BVM3';
  const CONSENT_VERSION = 1;

  /* ---------- 1. LEITURA E GRAVAÇÃO DE CONSENTIMENTO ---------- */
  function getStoredConsent() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && parsed.version === CONSENT_VERSION) {
        return parsed;
      }
    } catch (_) {}
    return null;
  }

  function saveConsent(analyticsGranted) {
    const consent = {
      necessary: true,
      analytics: !!analyticsGranted,
      timestamp: Date.now(),
      version: CONSENT_VERSION
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    } catch (_) {}

    // Atualizar Google Consent Mode v2
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        'analytics_storage': analyticsGranted ? 'granted' : 'denied'
      });
    }

    // Se o utilizador recusou cookies analíticos, remover cookies do Google Analytics previamente criados
    if (!analyticsGranted) {
      deleteGaCookies();
    }

    // Disparar evento para outras partes da aplicação
    window.dispatchEvent(new CustomEvent('wave:consent-updated', { detail: consent }));

    return consent;
  }

  function deleteGaCookies() {
    const cookies = document.cookie.split(';');
    const domains = [
      window.location.hostname,
      '.' + window.location.hostname,
      '.' + window.location.hostname.replace(/^www\./, '')
    ];
    const paths = ['/', window.location.pathname];

    cookies.forEach((cookie) => {
      const name = cookie.split('=')[0].trim();
      if (name === '_ga' || name === '_gid' || name === '_gat' || name.startsWith('_ga_')) {
        domains.forEach((d) => {
          paths.forEach((p) => {
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${p}; domain=${d};`;
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${p};`;
          });
        });
      }
    });
  }

  /* ---------- 2. CONSTRUÇÃO DO DOM ---------- */
  function buildBannerAndModal() {
    // Evitar duplicações
    if (document.getElementById('waveCookieBanner')) return;

    // Fundo semitransparente para banner quando ativo
    const backdrop = document.createElement('div');
    backdrop.id = 'waveCookieBackdrop';
    backdrop.className = 'wave-cookie-banner-backdrop';
    document.body.appendChild(backdrop);

    // Banner flutuante
    const banner = document.createElement('aside');
    banner.id = 'waveCookieBanner';
    banner.className = 'wave-cookie-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Consentimento de cookies');
    banner.innerHTML = `
      <div class="wave-cookie-header">
        <span class="wave-cookie-icon" aria-hidden="true"><i class="ri-shield-check-line"></i></span>
        <div>
          <h2 class="wave-cookie-title">Privacidade &amp; Cookies</h2>
        </div>
        <span class="wave-cookie-badge">RGPD • UE</span>
      </div>
      <p class="wave-cookie-text">
        A Wave Rádio utiliza cookies estritamente necessários para o funcionamento do site (como preferências de tema claro/escuro) e, com a tua autorização, <strong>cookies estatísticos anónimos do Google Analytics</strong> para saber quais as músicas, notícias e podcasts mais ouvidos da nossa escola.
      </p>
      <div class="wave-cookie-actions">
        <button type="button" class="wave-cookie-btn wave-cookie-btn-primary" id="waveCookieAcceptAll">
          <i class="ri-check-line" aria-hidden="true"></i> Aceitar Todos
        </button>
        <button type="button" class="wave-cookie-btn wave-cookie-btn-secondary" id="waveCookieRejectAll">
          <i class="ri-close-line" aria-hidden="true"></i> Recusar
        </button>
        <div class="wave-cookie-actions-full">
          <button type="button" class="wave-cookie-btn wave-cookie-btn-outline" id="waveCookieOpenPrefs" style="width: 100%;">
            <i class="ri-settings-4-line" aria-hidden="true"></i> Personalizar Escolhas
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(banner);

    // Modal de preferências detalhadas
    const modalWrap = document.createElement('div');
    modalWrap.id = 'waveCookieModalWrap';
    modalWrap.className = 'wave-cookie-modal-wrap';
    modalWrap.setAttribute('role', 'dialog');
    modalWrap.setAttribute('aria-modal', 'true');
    modalWrap.setAttribute('aria-labelledby', 'waveCookieModalTitle');
    modalWrap.innerHTML = `
      <div class="wave-cookie-modal">
        <div class="wave-cookie-modal-header">
          <h2 class="wave-cookie-modal-title" id="waveCookieModalTitle">
            <i class="ri-equalizer-line" style="color: var(--red, #e4232a);" aria-hidden="true"></i> Preferências de Privacidade
          </h2>
          <button type="button" class="wave-cookie-modal-close" id="waveCookieModalClose" aria-label="Fechar painel de cookies">
            <i class="ri-close-line" aria-hidden="true"></i>
          </button>
        </div>
        <div class="wave-cookie-modal-body">
          <p class="wave-cookie-lead">
            Valorizamos a tua privacidade. Na Wave Rádio (EBS da Cidadela em parceria com a CMC), podes escolher que dados nos autorizas a recolher. Não utilizamos publicidade nem partilhamos dados com terceiros comerciais.
          </p>

          <!-- Categoria 1: Necessários -->
          <div class="wave-cookie-category">
            <div class="wave-cookie-cat-top">
              <h3 class="wave-cookie-cat-title">1. Cookies Estritamente Necessários</h3>
              <span class="wave-cookie-badge-req">Sempre Ativos</span>
            </div>
            <p class="wave-cookie-cat-desc">
              Fundamentais para que o site funcione corretamente. Lembram o teu modo de visualização (claro/escuro), asseguram a navegação segura e gravam estas tuas opções de privacidade.
            </p>
            <div class="wave-cookie-tag-list">
              <span class="wave-cookie-tag">wave_theme (Tema)</span>
              <span class="wave-cookie-tag">wave_cookie_consent (RGPD)</span>
            </div>
          </div>

          <!-- Categoria 2: Analíticos -->
          <div class="wave-cookie-category">
            <div class="wave-cookie-cat-top">
              <h3 class="wave-cookie-cat-title">2. Cookies Analíticos (Google Analytics)</h3>
              <label class="wave-cookie-switch" aria-label="Permitir cookies analíticos">
                <input type="checkbox" id="waveCookieAnalyticsToggle">
                <span class="wave-cookie-slider"></span>
              </label>
            </div>
            <p class="wave-cookie-cat-desc">
              Ajudam a equipa de alunos da rádio a compreender que programas, episódios e notícias têm maior adesão, permitindo planear melhores emissões. Os dados são totalmente anonimizados (anonimização de IP ativada via ID <code>${GA_MEASUREMENT_ID}</code>).
            </p>
            <div class="wave-cookie-tag-list">
              <span class="wave-cookie-tag">_ga (Estatística)</span>
              <span class="wave-cookie-tag">_ga_08TP49BVM3 (Sessão analítica)</span>
            </div>
          </div>

          <!-- Informação Legal RGPD -->
          <div class="wave-cookie-legal-box">
            <strong>Informação Legal (RGPD &amp; Diretiva ePrivacy):</strong><br>
            • <strong>Responsável:</strong> Wave Rádio / EBS da Cidadela (Cascais).<br>
            • <strong>Base Legal:</strong> Consentimento livre e esclarecido (Art. 6.º, n.º 1, al. a) do RGPD).<br>
            • <strong>Direito de Revogação:</strong> Podes rever ou revogar a tua autorização em qualquer momento clicando no botão flutuante de cookies ou no rodapé do website.<br>
            • <strong>Contacto:</strong> <a href="mailto:Geral@RadioWave.pt" style="color:inherit;text-decoration:underline;">Geral@RadioWave.pt</a>.
          </div>
        </div>
        <div class="wave-cookie-modal-footer">
          <button type="button" class="wave-cookie-btn wave-cookie-btn-secondary" id="waveCookieSavePrefs">
            <i class="ri-save-3-line" aria-hidden="true"></i> Guardar Escolhas
          </button>
          <button type="button" class="wave-cookie-btn wave-cookie-btn-primary" id="waveCookieModalAcceptAll">
            <i class="ri-check-double-line" aria-hidden="true"></i> Aceitar Todos
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modalWrap);

    // Botão flutuante permanente para rever consentimento (requisito RGPD de fácil revogação)
    const floatBtn = document.createElement('button');
    floatBtn.id = 'waveCookieFloatBtn';
    floatBtn.className = 'wave-cookie-float-btn';
    floatBtn.type = 'button';
    floatBtn.setAttribute('aria-label', 'Definições de privacidade e cookies');
    floatBtn.setAttribute('title', 'Definições de Cookies & RGPD');
    floatBtn.innerHTML = `
      <i class="ri-shield-keyhole-line" aria-hidden="true"></i>
      <span>Cookies</span>
    `;
    document.body.appendChild(floatBtn);

    // Injetar link no rodapé existente caso exista
    injectFooterLinks();

    // Ligar eventos
    bindEvents();
  }

  function injectFooterLinks() {
    // 1. No rodapé padrão .w-foot-bottom
    const footBottom = document.querySelector('.w-foot-bottom');
    if (footBottom && !footBottom.querySelector('.w-cookie-footer-link')) {
      const sep = document.createTextNode(' · ');
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'w-cookie-footer-link';
      link.textContent = 'Preferências de Cookies';
      link.addEventListener('click', () => openModal());

      const span = footBottom.querySelector('span');
      if (span) {
        span.appendChild(sep);
        span.appendChild(link);
      } else {
        footBottom.appendChild(link);
      }
    }

    // 2. Na lista de navegação do rodapé .w-foot-list
    const footList = document.querySelector('.w-foot-list');
    if (footList && !footList.querySelector('.w-cookie-list-link')) {
      const li = document.createElement('li');
      li.className = 'w-cookie-list-link';
      li.innerHTML = '<a href="#" role="button">Privacidade &amp; Cookies</a>';
      li.querySelector('a').addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
      });
      footList.appendChild(li);
    }

    // 3. No rodapé de links.html (linktree-footer)
    const linktreeFoot = document.querySelector('.linktree-footer');
    if (linktreeFoot && !linktreeFoot.querySelector('.w-cookie-footer-link')) {
      const linkWrap = document.createElement('div');
      linkWrap.style.marginTop = '0.45rem';
      linkWrap.innerHTML = `
        <button type="button" class="w-cookie-footer-link" style="color:var(--mute-on-ink,#b3abab);font-size:0.85rem;">
          <i class="ri-shield-keyhole-line" aria-hidden="true"></i> Preferências de Privacidade &amp; Cookies
        </button>
      `;
      linkWrap.querySelector('button').addEventListener('click', () => openModal());
      linktreeFoot.appendChild(linkWrap);
    }
  }

  /* ---------- 3. CONTROLADORES DE INTERFACE ---------- */
  function showBanner() {
    const banner = document.getElementById('waveCookieBanner');
    const backdrop = document.getElementById('waveCookieBackdrop');
    if (banner) {
      banner.classList.add('visible');
    }
    if (backdrop) {
      backdrop.classList.add('active');
    }
  }

  function hideBanner() {
    const banner = document.getElementById('waveCookieBanner');
    const backdrop = document.getElementById('waveCookieBackdrop');
    if (banner) {
      banner.classList.remove('visible');
    }
    if (backdrop) {
      backdrop.classList.remove('active');
    }
  }

  function openModal() {
    const modalWrap = document.getElementById('waveCookieModalWrap');
    const toggle = document.getElementById('waveCookieAnalyticsToggle');
    const current = getStoredConsent();

    if (toggle) {
      toggle.checked = current ? !!current.analytics : false;
    }

    if (modalWrap) {
      modalWrap.classList.add('open');
      const closeBtn = document.getElementById('waveCookieModalClose');
      if (closeBtn) closeBtn.focus();
    }
  }

  function closeModal() {
    const modalWrap = document.getElementById('waveCookieModalWrap');
    if (modalWrap) {
      modalWrap.classList.remove('open');
    }
  }

  /* ---------- 4. GESTÃO DE EVENTOS ---------- */
  function bindEvents() {
    const acceptBtn = document.getElementById('waveCookieAcceptAll');
    const rejectBtn = document.getElementById('waveCookieRejectAll');
    const openPrefsBtn = document.getElementById('waveCookieOpenPrefs');
    const modalCloseBtn = document.getElementById('waveCookieModalClose');
    const modalWrap = document.getElementById('waveCookieModalWrap');
    const savePrefsBtn = document.getElementById('waveCookieSavePrefs');
    const modalAcceptAllBtn = document.getElementById('waveCookieModalAcceptAll');
    const floatBtn = document.getElementById('waveCookieFloatBtn');

    if (acceptBtn) {
      acceptBtn.addEventListener('click', () => {
        saveConsent(true);
        hideBanner();
      });
    }

    if (rejectBtn) {
      rejectBtn.addEventListener('click', () => {
        saveConsent(false);
        hideBanner();
      });
    }

    if (openPrefsBtn) {
      openPrefsBtn.addEventListener('click', () => {
        openModal();
      });
    }

    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', () => {
        closeModal();
      });
    }

    if (savePrefsBtn) {
      savePrefsBtn.addEventListener('click', () => {
        const toggle = document.getElementById('waveCookieAnalyticsToggle');
        const allowed = toggle ? toggle.checked : false;
        saveConsent(allowed);
        closeModal();
        hideBanner();
      });
    }

    if (modalAcceptAllBtn) {
      modalAcceptAllBtn.addEventListener('click', () => {
        saveConsent(true);
        closeModal();
        hideBanner();
      });
    }

    if (floatBtn) {
      floatBtn.addEventListener('click', () => {
        openModal();
      });
    }

    // Fechar ao clicar fora do modal
    if (modalWrap) {
      modalWrap.addEventListener('click', (e) => {
        if (e.target === modalWrap) {
          closeModal();
        }
      });
    }

    // Acessibilidade: fechar com a tecla ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalWrap && modalWrap.classList.contains('open')) {
        closeModal();
      }
    });
  }

  /* ---------- 5. INICIALIZAÇÃO ---------- */
  function init() {
    buildBannerAndModal();

    const stored = getStoredConsent();
    if (!stored) {
      // Se ainda não houve escolha, apresentar o banner após um pequeno intervalo
      setTimeout(() => {
        showBanner();
      }, 400);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exportar API global se necessário
  window.WaveConsent = {
    getConsent: getStoredConsent,
    setConsent: saveConsent,
    openPreferences: openModal,
    closePreferences: closeModal
  };
})();

