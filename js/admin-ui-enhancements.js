/* ==========================================================================
   WAVE RÁDIO — INTERAÇÕES E MELHORIAS DE UI DO ADMIN V2 (2026)
   Relógio de Estúdio, Command Palette (Ctrl+K), Menu Mobile e Atalhos.
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- 1. RELÓGIO DE ESTÚDIO EM TEMPO REAL ---------- */
  function initStudioClock() {
    const clockEl = document.getElementById('topbarLiveClockText');
    if (!clockEl) return;

    function update() {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      clockEl.textContent = `${h}:${m}:${s}`;
    }

    update();
    setInterval(update, 1000);
  }

  /* ---------- 2. GAVETA LATERAL MÓVEL (MOBILE SIDEBAR) ---------- */
  function initMobileSidebar() {
    const toggleBtn = document.getElementById('btnSidebarToggle');
    const sidebar = document.querySelector('.admin-sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');

    if (!toggleBtn || !sidebar) return;

    function openSidebar() {
      sidebar.classList.add('open');
      if (backdrop) backdrop.classList.add('active');
    }

    function closeSidebar() {
      sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('active');
    }

    toggleBtn.addEventListener('click', () => {
      if (sidebar.classList.contains('open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });

    if (backdrop) {
      backdrop.addEventListener('click', closeSidebar);
    }

    // Fechar a sidebar quando o utilizador clica num item da navegação (em ecrãs pequenos)
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 1024) {
          closeSidebar();
        }
      });
    });
  }

  /* ---------- 3. COMMAND PALETTE (CTRL+K) ---------- */
  const PALETTE_COMMANDS = [
    {
      group: 'Emissão & Estúdio',
      items: [
        { title: 'Visão Geral / Mural', icon: 'ri-dashboard-3-line', action: () => window.switchAdminSection('sec-resumo'), keywords: 'home inicio mural kpis briefing' },
        { title: 'Guiões & Alinhamento', icon: 'ri-file-list-3-line', action: () => window.switchAdminSection('sec-guioes'), keywords: 'guião guiao alinhamento programa estúdio' },
        { title: 'Músicas Pedidas', icon: 'ri-fire-line', action: () => window.switchAdminSection('sec-musicas'), keywords: 'pedidos musicas music ranking votos' },
        { title: 'Mensagens dos Alunos', icon: 'ri-chat-heart-line', action: () => window.switchAdminSection('sec-mensagens'), keywords: 'inbox mensagens chat fala connosco' },
        { title: 'Calendário de Emissões', icon: 'ri-calendar-event-line', action: () => window.switchAdminSection('sec-calendario'), keywords: 'agenda calendario gcal eventos datas' }
      ]
    },
    {
      group: 'Conteúdos do Site',
      items: [
        { title: 'Mural de Notícias & Artigos', icon: 'ri-article-line', action: () => window.switchAdminSection('sec-anuncios'), keywords: 'noticias noticias posts blog artigos novidades' },
        { title: 'Podcasts & Episódios', icon: 'ri-headphones-line', action: () => window.switchAdminSection('sec-podcasts'), keywords: 'podcasts audio spotify episodios' },
        { title: 'Links Rápidos (Linktree)', icon: 'ri-links-line', action: () => window.switchAdminSection('sec-links'), keywords: 'links atalhos linktree redes' },
        { title: 'Membros da Equipa', icon: 'ri-user-star-line', action: () => window.switchAdminSection('sec-equipa'), keywords: 'equipa equipas membros staff fotos' }
      ]
    },
    {
      group: 'Interatividade & Alunos',
      items: [
        { title: 'Quadro de Tarefas', icon: 'ri-todo-line', action: () => window.switchAdminSection('sec-tarefas'), keywords: 'tarefas todo afazeres equipa backlog' },
        { title: 'Votações & Sondagens', icon: 'ri-bar-chart-2-line', action: () => window.switchAdminSection('sec-votacoes'), keywords: 'votacoes sondagens polls votos' },
        { title: 'Alerta Nerd (Desafios)', icon: 'ri-flashlight-fill', action: () => window.switchAdminSection('sec-nerd-alert'), keywords: 'alerta nerd desafio enigma pergunta tempo' }
      ]
    },
    {
      group: 'Ações Rápidas & Sistema',
      items: [
        { title: 'Novo Guião de Emissão', icon: 'ri-quill-pen-line', action: () => { if (typeof openNewRundownModal === 'function') openNewRundownModal(); }, keywords: 'novo guiao criar alinhamento' },
        { title: 'Novo Desafio Alerta Nerd', icon: 'ri-add-circle-line', action: () => { if (typeof openNerdChallengeModal === 'function') openNerdChallengeModal(); }, keywords: 'novo desafio criar alerta nerd' },
        { title: 'Controlo de Manutenção do Site', icon: 'ri-tools-fill', action: () => { if (typeof openSiteMaintenanceModal === 'function') openSiteMaintenanceModal(); }, keywords: 'manutencao offline online fechar trancar site' },
        { title: 'Gestão de Utilizadores & Permissões', icon: 'ri-shield-user-line', action: () => window.switchAdminSection('sec-utilizadores'), keywords: 'utilizadores contas logins rbac password equipa' },
        { title: 'Abrir Modo de Estúdio Ao Vivo', icon: 'ri-broadcast-line', action: () => { if (typeof switchAdminMode === 'function') switchAdminMode('aovivo'); }, keywords: 'ao vivo cockpit estúdio teleprompter' },
        { title: 'Ver Site Público (Abrir numa nova aba)', icon: 'ri-external-link-line', action: () => window.open('index.html', '_blank'), keywords: 'site publico ver visitar' }
      ]
    }
  ];

  function initCommandPalette() {
    const modal = document.getElementById('adminCommandPaletteModal');
    const input = document.getElementById('adminCommandPaletteInput');
    const list = document.getElementById('adminCommandPaletteList');
    const triggerBtn = document.getElementById('btnOpenCommandPalette');

    if (!modal || !input || !list) return;

    let selectedIndex = 0;
    let visibleItems = [];

    function openPalette() {
      modal.classList.add('active');
      input.value = '';
      selectedIndex = 0;
      renderItems('');
      setTimeout(() => input.focus(), 50);
    }

    function closePalette() {
      modal.classList.remove('active');
      input.blur();
    }

    function renderItems(filterText) {
      const term = (filterText || '').trim().toLowerCase();
      list.innerHTML = '';
      visibleItems = [];

      PALETTE_COMMANDS.forEach(group => {
        const matches = group.items.filter(item => {
          if (!term) return true;
          return item.title.toLowerCase().includes(term) || (item.keywords && item.keywords.includes(term));
        });

        if (matches.length > 0) {
          const groupLi = document.createElement('li');
          groupLi.className = 'adm-palette-group-label';
          groupLi.textContent = group.group;
          list.appendChild(groupLi);

          matches.forEach(item => {
            const itemIndex = visibleItems.length;
            visibleItems.push(item);

            const li = document.createElement('li');
            li.className = `adm-palette-item${itemIndex === selectedIndex ? ' selected' : ''}`;
            li.setAttribute('role', 'option');
            li.setAttribute('aria-selected', itemIndex === selectedIndex ? 'true' : 'false');
            li.innerHTML = `
              <i class="${item.icon}" aria-hidden="true"></i>
              <span>${item.title}</span>
              <kbd>Enter</kbd>
            `;

            li.addEventListener('click', () => {
              closePalette();
              item.action();
            });

            li.addEventListener('mouseenter', () => {
              selectedIndex = itemIndex;
              updateSelection();
            });

            list.appendChild(li);
          });
        }
      });

      if (visibleItems.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.style.cssText = 'padding: 1.5rem; text-align: center; color: var(--adm-text-muted); font-size: 0.88rem;';
        emptyLi.innerHTML = '<i class="ri-search-line" style="font-size: 1.5rem; display: block; margin-bottom: 0.4rem; opacity: 0.6;"></i>Nenhuma secção ou ação encontrada.';
        list.appendChild(emptyLi);
      } else {
        if (selectedIndex >= visibleItems.length) {
          selectedIndex = 0;
        }
        updateSelection();
      }
    }

    function updateSelection() {
      const itemEls = list.querySelectorAll('.adm-palette-item');
      itemEls.forEach((el, idx) => {
        const isSel = idx === selectedIndex;
        el.classList.toggle('selected', isSel);
        el.setAttribute('aria-selected', isSel ? 'true' : 'false');
        if (isSel) {
          el.scrollIntoView({ block: 'nearest' });
        }
      });
    }

    if (triggerBtn) {
      triggerBtn.addEventListener('click', openPalette);
    }

    input.addEventListener('input', () => {
      selectedIndex = 0;
      renderItems(input.value);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closePalette();
      }
    });

    window.addEventListener('keydown', (e) => {
      // Ctrl+K ou Cmd+K abre a paleta
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (modal.classList.contains('active')) {
          closePalette();
        } else {
          openPalette();
        }
        return;
      }

      if (!modal.classList.contains('active')) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        closePalette();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (visibleItems.length > 0) {
          selectedIndex = (selectedIndex + 1) % visibleItems.length;
          updateSelection();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (visibleItems.length > 0) {
          selectedIndex = (selectedIndex - 1 + visibleItems.length) % visibleItems.length;
          updateSelection();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (visibleItems[selectedIndex]) {
          const chosen = visibleItems[selectedIndex];
          closePalette();
          chosen.action();
        }
      }
    });
  }

  /* ---------- INICIALIZAÇÃO AUTOMÁTICA ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initStudioClock();
      initMobileSidebar();
      initCommandPalette();
    });
  } else {
    initStudioClock();
    initMobileSidebar();
    initCommandPalette();
  }
})();
