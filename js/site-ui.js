/* ==========================================================================
   WAVE RÁDIO — INTERAÇÕES GLOBAIS DO SITE PÚBLICO
   Menu móvel, Modo Claro / Escuro (Dark & White Mode), visibilidade condicional
   do Nerd Alert (apenas quando ativo no Admin) e animações de revelação.
   ========================================================================== */

(function () {
  'use strict';

  const THEME_STORAGE_KEY = 'wave_theme';

  /* ---------- 1. MODO ESCURO & MODO CLARO (DARK / WHITE MODE) ---------- */
  function getInitialTheme() {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (_) {}
    return document.documentElement.getAttribute('data-theme') || 'light';
  }

  function applyTheme(theme) {
    const normalized = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', normalized);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch (_) {}

    // Trocar logótipo da barra de navegação entre versão positiva (fundo claro) e negativa (fundo escuro)
    document.querySelectorAll('.w-nav .w-logo img').forEach(img => {
      img.src = normalized === 'dark'
        ? 'assets/brand/logo-minima-negativa.png'
        : 'assets/brand/logo-minima-positiva.png';
    });

    // Trocar logótipo da página Linktree (links.html) entre versão positiva e negativa
    document.querySelectorAll('.linktree-hero img').forEach(img => {
      img.src = normalized === 'dark'
        ? 'assets/brand/logo-slogan-negativa.png'
        : 'assets/brand/logo-slogan-positiva.png';
    });

    // Sincronizar barra de estado móvel (theme-color)
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute('content', normalized === 'dark' ? '#282425' : '#f5f1f1');
    }

    // Atualizar todos os botões de alternância de tema
    const isDark = normalized === 'dark';
    document.querySelectorAll('.w-theme-toggle').forEach(btn => {
      btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      btn.setAttribute('title', isDark ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro');
      btn.setAttribute('aria-label', isDark ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro');
      const icon = btn.querySelector('i');
      if (icon) {
        icon.className = isDark ? 'ri-sun-line' : 'ri-moon-clear-line';
      }
      const label = btn.querySelector('.w-theme-toggle-label');
      if (label) {
        label.textContent = isDark ? 'Modo Claro' : 'Modo Escuro';
      }
    });
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || getInitialTheme();
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  function ensureThemeButtons() {
    // Barra de navegação principal (.w-nav-in)
    const navIn = document.querySelector('.w-nav-in');
    if (navIn && !navIn.querySelector('.w-theme-toggle')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'w-theme-toggle';
      btn.id = 'themeToggleBtn';
      btn.innerHTML = '<i class="ri-moon-clear-line" aria-hidden="true"></i>';
      const cta = navIn.querySelector('.w-nav-cta');
      const burger = navIn.querySelector('.w-burger');
      if (cta) {
        navIn.insertBefore(btn, cta);
      } else if (burger) {
        navIn.insertBefore(btn, burger);
      } else {
        navIn.appendChild(btn);
      }
    }

    // Menu gaveta móvel (#mobileMenu .w-drawer-top)
    const drawerTop = document.querySelector('#mobileMenu .w-drawer-top');
    if (drawerTop && !drawerTop.querySelector('.w-theme-toggle')) {
      const closeBtn = drawerTop.querySelector('.w-drawer-close');
      const wrap = document.createElement('div');
      wrap.className = 'w-drawer-actions';
      const mobileThemeBtn = document.createElement('button');
      mobileThemeBtn.type = 'button';
      mobileThemeBtn.className = 'w-theme-toggle w-theme-toggle-drawer';
      mobileThemeBtn.innerHTML = '<i class="ri-moon-clear-line" aria-hidden="true"></i><span class="w-theme-toggle-label">Modo Escuro</span>';
      wrap.appendChild(mobileThemeBtn);
      if (closeBtn) {
        wrap.appendChild(closeBtn);
      }
      drawerTop.appendChild(wrap);
    }

    // Página Linktree (links.html) se não tiver barra .w-nav
    const linktreeShell = document.querySelector('.linktree-shell');
    if (linktreeShell && !document.querySelector('.w-nav') && !linktreeShell.querySelector('.w-theme-toggle')) {
      const topBar = document.createElement('div');
      topBar.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:0.75rem;';
      const ltBtn = document.createElement('button');
      ltBtn.type = 'button';
      ltBtn.className = 'w-theme-toggle';
      ltBtn.innerHTML = '<i class="ri-sun-line" aria-hidden="true"></i><span class="w-theme-toggle-label" style="margin-left:0.35rem;font-family:var(--mono);font-size:0.72rem;text-transform:uppercase;">Tema</span>';
      topBar.appendChild(ltBtn);
      linktreeShell.insertBefore(topBar, linktreeShell.firstChild);
    }

    document.querySelectorAll('.w-theme-toggle').forEach(btn => {
      if (!btn.dataset.themeBound) {
        btn.dataset.themeBound = 'true';
        btn.addEventListener('click', toggleTheme);
      }
    });

    applyTheme(getInitialTheme());
  }

  function ensureTeamNavigation() {
    const isTeamPage = window.location.pathname.toLowerCase().includes('equipa.html');

    // 1. Desktop navbar
    const desktopLinks = document.querySelector('.w-nav .w-links');
    if (desktopLinks && !desktopLinks.querySelector('a[href="equipa.html"]')) {
      const li = document.createElement('li');
      li.innerHTML = `<a href="equipa.html"${isTeamPage ? ' class="active" aria-current="page"' : ''}>Equipa</a>`;
      const msgLink = desktopLinks.querySelector('a[href="mensagem.html"]');
      if (msgLink && msgLink.parentElement) {
        desktopLinks.insertBefore(li, msgLink.parentElement);
      } else {
        desktopLinks.appendChild(li);
      }
    }

    // 2. Mobile drawer
    const drawer = document.getElementById('mobileMenu');
    if (drawer && !drawer.querySelector('a[href="equipa.html"]')) {
      const a = document.createElement('a');
      a.className = `w-d-link${isTeamPage ? ' active' : ''}`;
      a.href = 'equipa.html';
      a.innerHTML = 'Equipa <i class="ri-arrow-right-up-line" aria-hidden="true"></i>';
      const msgDrawerLink = drawer.querySelector('a[href="mensagem.html"]');
      const ctaBtn = drawer.querySelector('.w-btn-block');
      if (msgDrawerLink) {
        drawer.insertBefore(a, msgDrawerLink);
      } else if (ctaBtn) {
        drawer.insertBefore(a, ctaBtn);
      } else {
        drawer.appendChild(a);
      }
    }

    // 3. Footer list
    const footList = document.querySelector('.w-foot-list');
    if (footList && !footList.querySelector('a[href="equipa.html"]')) {
      const li = document.createElement('li');
      li.innerHTML = '<a href="equipa.html">Equipa</a>';
      const msgFootLink = footList.querySelector('a[href="mensagem.html"]');
      if (msgFootLink && msgFootLink.parentElement) {
        footList.insertBefore(li, msgFootLink.parentElement);
      } else {
        footList.appendChild(li);
      }
    }
  }

  /* ---------- 2. ALERTA NERD DINÂMICO (SÓ MOSTRA SE HOUVER DESAFIO ATIVO) ---------- */
  function syncNerdAlertNavigation() {
    const activeChallenge = (window.db && typeof window.db.getActiveNerdChallenge === 'function')
      ? window.db.getActiveNerdChallenge()
      : null;
    const isActive = Boolean(activeChallenge && activeChallenge.active);
    const isCurrentPageNerd = window.location.pathname.toLowerCase().includes('nerd-alert');

    // 1. Desktop navbar (ul.w-links)
    const desktopLinks = document.querySelector('.w-nav .w-links');
    if (desktopLinks) {
      let nerdLi = desktopLinks.querySelector('[data-nerd-nav]');
      if (isActive) {
        if (!nerdLi) {
          nerdLi = document.createElement('li');
          nerdLi.setAttribute('data-nerd-nav', 'true');
          nerdLi.innerHTML = `<a href="nerd-alert.html" class="w-nav-nerd${isCurrentPageNerd ? ' active' : ''}"${isCurrentPageNerd ? ' aria-current="page"' : ''}><i class="ri-flashlight-fill" aria-hidden="true"></i> Alerta Nerd</a>`;
          desktopLinks.appendChild(nerdLi);
        }
        nerdLi.style.display = '';
      } else if (nerdLi) {
        nerdLi.style.display = 'none';
      }
    }

    // 2. Mobile drawer (#mobileMenu)
    const drawer = document.getElementById('mobileMenu');
    if (drawer) {
      let nerdDrawerLink = drawer.querySelector('a[data-nerd-nav]');
      if (isActive) {
        if (!nerdDrawerLink) {
          nerdDrawerLink = document.createElement('a');
          nerdDrawerLink.className = `w-d-link w-d-link-nerd${isCurrentPageNerd ? ' active' : ''}`;
          nerdDrawerLink.href = 'nerd-alert.html';
          nerdDrawerLink.setAttribute('data-nerd-nav', 'true');
          nerdDrawerLink.innerHTML = '<span><i class="ri-flashlight-fill" aria-hidden="true"></i> Alerta Nerd</span> <i class="ri-arrow-right-up-line" aria-hidden="true"></i>';
          const ctaBtn = drawer.querySelector('.w-btn-block');
          if (ctaBtn) {
            drawer.insertBefore(nerdDrawerLink, ctaBtn);
          } else {
            drawer.appendChild(nerdDrawerLink);
          }
        }
        nerdDrawerLink.style.display = '';
      } else if (nerdDrawerLink) {
        nerdDrawerLink.style.display = 'none';
      }
    }

    // 3. Footer list (.w-foot-list)
    const footList = document.querySelector('.w-foot-list');
    if (footList) {
      let nerdFootLi = footList.querySelector('[data-nerd-nav]');
      if (isActive) {
        if (!nerdFootLi) {
          nerdFootLi = document.createElement('li');
          nerdFootLi.setAttribute('data-nerd-nav', 'true');
          nerdFootLi.innerHTML = '<a href="nerd-alert.html"><i class="ri-flashlight-fill" aria-hidden="true"></i> Alerta Nerd</a>';
          footList.appendChild(nerdFootLi);
        }
        nerdFootLi.style.display = '';
      } else if (nerdFootLi) {
        nerdFootLi.style.display = 'none';
      }
    }

    // 4. Lista de serviços na página inicial (ul.w-rows na index.html)
    const homeRows = document.querySelector('ul.w-rows');
    if (homeRows) {
      let nerdRowLi = homeRows.querySelector('[data-nerd-row]');
      if (isActive) {
        if (!nerdRowLi) {
          nerdRowLi = document.createElement('li');
          nerdRowLi.setAttribute('data-nerd-row', 'true');
          nerdRowLi.innerHTML = `
            <a class="w-row w-row-nerd" href="nerd-alert.html" id="qaNerdCard">
              <span class="w-row-top"><span class="w-row-ic"><i class="ri-flashlight-fill" aria-hidden="true"></i></span><span class="w-row-n">05</span></span>
              <span class="w-row-t">Alerta Nerd</span>
              <span class="w-row-d">Desafio ativo: "${String(activeChallenge.title || 'Responde agora').replace(/</g, '&lt;')}" — sê o primeiro a acertar!</span>
              <span class="w-row-cta">Responder agora <i class="ri-arrow-right-up-line w-row-a" aria-hidden="true"></i></span>
            </a>`;
          homeRows.appendChild(nerdRowLi);
        } else {
          const desc = nerdRowLi.querySelector('.w-row-d');
          if (desc) {
            desc.textContent = `Desafio ativo: "${activeChallenge.title || 'Responde agora'}" — sê o primeiro a acertar!`;
          }
        }
        nerdRowLi.style.display = '';
      } else if (nerdRowLi) {
        nerdRowLi.style.display = 'none';
      }
    }
  }

  /* ---------- 3. INICIALIZAÇÃO DO DOM ---------- */
  applyTheme(getInitialTheme());

  document.addEventListener('DOMContentLoaded', () => {
    ensureThemeButtons();
    ensureTeamNavigation();
    syncNerdAlertNavigation();

    document.addEventListener('radio-db-updated', (e) => {
      if (!e.detail || e.detail.collection === 'nerdChallenges') {
        syncNerdAlertNavigation();
      }
    });

    if (window.db && typeof window.db.ready === 'function') {
      window.db.ready().then(syncNerdAlertNavigation).catch(() => {});
    }

    /* Menu móvel (gaveta lateral) */
    const burger = document.getElementById('navBurger');
    const drawer = document.getElementById('mobileMenu');
    const closeBtn = document.getElementById('mobileClose');

    if (burger && drawer) {
      let lastFocused = null;

      const getFocusable = () =>
        Array.from(
          drawer.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
        );

      const setOpen = (open) => {
        drawer.classList.toggle('open', open);
        drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        document.body.style.overflow = open ? 'hidden' : '';

        if (open) {
          lastFocused = document.activeElement;
          const focusables = getFocusable();
          if (focusables.length) focusables[0].focus();
        } else if (lastFocused && typeof lastFocused.focus === 'function') {
          lastFocused.focus();
        }
      };

      burger.addEventListener('click', () => setOpen(!drawer.classList.contains('open')));
      if (closeBtn) closeBtn.addEventListener('click', () => setOpen(false));

      drawer.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => setOpen(false));
      });

      document.addEventListener('keydown', (e) => {
        if (!drawer.classList.contains('open')) return;

        if (e.key === 'Escape') {
          e.preventDefault();
          setOpen(false);
          return;
        }

        if (e.key === 'Tab') {
          const focusables = getFocusable();
          if (!focusables.length) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      });
    }

    /* Revelação progressiva ao fazer scroll */
    const revealEls = document.querySelectorAll('[data-reveal]');
    if (!revealEls.length) return;

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('in');
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.1 }
      );
      revealEls.forEach((el) => io.observe(el));
    } else {
      revealEls.forEach((el) => el.classList.add('in'));
    }
  });
})();
