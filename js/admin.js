/* ==========================================================================
   RÁDIO EBS CIDADELA - PAINEL DE ADMINISTRAÇÃO (SENIOR DEV VERSION)
   Ranking de Músicas Mais Pedidas, Gestão do Linktree, Podcasts e KPIs
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  if (!window.db || typeof window.db.ready !== 'function') {
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#070913;color:#fff;text-align:center;padding:2rem;"><div><i class="ri-error-warning-fill" style="font-size:4rem;color:#ef4444;margin-bottom:1rem;display:block;"></i><h2 style="font-size:1.5rem;margin-bottom:0.5rem;">Erro de Ligação</h2><p style="color:var(--text-muted);">Não foi possível ligar aos serviços do painel. Verifica a ligação e recarrega a página.</p><button onclick="location.reload()" style="margin-top:1.5rem;padding:0.8rem 2rem;background:var(--primary-blue);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem;">Recarregar</button></div></div>';
    return;
  }
  try {
    await window.db.ready();
  } catch (error) {
    console.error('Falha ao inicializar base de dados:', error);
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#070913;color:#fff;text-align:center;padding:2rem;"><div><i class="ri-error-warning-fill" style="font-size:4rem;color:#ef4444;margin-bottom:1rem;display:block;"></i><h2 style="font-size:1.5rem;margin-bottom:0.5rem;">Erro de Base de Dados</h2><p style="color:var(--text-muted);">' + escapeHtml(error.message || 'Erro desconhecido') + '</p><button onclick="location.reload()" style="margin-top:1.5rem;padding:0.8rem 2rem;background:var(--primary-blue);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem;">Recarregar</button></div></div>';
    return;
  }
  initAdminAuth();
  initAdminTabs();
});

/* ==========================================================================
   SISTEMA DE FUNÇÕES & PERMISSÕES GRANULARES (GOOGLE WORKSPACE RBAC)
   ========================================================================== */
const ALL_PERMISSIONS = [
  'access_aovivo',
  'manage_rundowns',
  'manage_songs',
  'manage_podcasts',
  'manage_announcements',
  'manage_links',
  'manage_messages',
  'manage_polls',
  'manage_calendar',
  'manage_tasks',
  'manage_memos',
  'manage_users',
  'system_config'
];

const ROLE_PRESETS = {
  super_admin: {
    title: 'Super Administrador',
    description: 'Acesso total irrestrito a todas as ferramentas, dados e gestão de utilizadores.',
    badgeClass: 'role-badge-super-admin',
    icon: 'ri-shield-star-fill',
    permissions: ALL_PERMISSIONS.reduce((acc, p) => ({ ...acc, [p]: true }), {})
  },
  editor: {
    title: 'Coordenador Editorial',
    description: 'Gestão completa de emissões, guiões, músicas, podcasts, notícias, agenda e tarefas.',
    badgeClass: 'role-badge-editor',
    icon: 'ri-edit-2-fill',
    permissions: {
      access_aovivo: true,
      manage_rundowns: true,
      manage_songs: true,
      manage_podcasts: true,
      manage_announcements: true,
      manage_links: true,
      manage_messages: true,
      manage_polls: true,
      manage_calendar: true,
      manage_tasks: true,
      manage_memos: true,
      manage_users: false,
      system_config: false
    }
  },
  broadcaster: {
    title: 'Locutor / Apresentador',
    description: 'Acesso focado no estúdio: Cockpit Ao Vivo, teleprompter, consulta de músicas e recados.',
    badgeClass: 'role-badge-broadcaster',
    icon: 'ri-mic-fill',
    permissions: {
      access_aovivo: true,
      manage_rundowns: false,
      manage_songs: true,
      manage_podcasts: false,
      manage_announcements: false,
      manage_links: false,
      manage_messages: false,
      manage_polls: false,
      manage_calendar: true,
      manage_tasks: true,
      manage_memos: true,
      manage_users: false,
      system_config: false
    }
  },
  technician: {
    title: 'Técnico de Som / Produção',
    description: 'Estúdio Ao Vivo, podcasts, alinhamentos técnicos e tarefas de produção.',
    badgeClass: 'role-badge-technician',
    icon: 'ri-sound-module-fill',
    permissions: {
      access_aovivo: true,
      manage_rundowns: true,
      manage_songs: false,
      manage_podcasts: true,
      manage_announcements: false,
      manage_links: false,
      manage_messages: false,
      manage_polls: false,
      manage_calendar: true,
      manage_tasks: true,
      manage_memos: true,
      manage_users: false,
      system_config: false
    }
  },
  social: {
    title: 'Comunicação & Redes',
    description: 'Gestão de mensagens de alunos, votações/sondagens escolares, notícias e links.',
    badgeClass: 'role-badge-social',
    icon: 'ri-share-forward-fill',
    permissions: {
      access_aovivo: false,
      manage_rundowns: false,
      manage_songs: false,
      manage_podcasts: false,
      manage_announcements: true,
      manage_links: true,
      manage_messages: true,
      manage_polls: true,
      manage_calendar: true,
      manage_tasks: true,
      manage_memos: true,
      manage_users: false,
      system_config: false
    }
  },
  custom: {
    title: 'Personalizado',
    description: 'Permissões modulares configuradas à medida para as funções específicas do membro.',
    badgeClass: 'role-badge-custom',
    icon: 'ri-settings-4-fill',
    permissions: {}
  }
};

window.currentUserProfile = null;

window.hasPermission = function (permissionKey) {
  if (!window.currentUserProfile) return true; // Fallback
  if (window.currentUserProfile.roleKey === 'super_admin') return true;
  if (window.currentUserProfile.status === 'suspended') return false;
  return Boolean(window.currentUserProfile.permissions && window.currentUserProfile.permissions[permissionKey]);
};

window.applyUserPermissionsToUI = function () {
  const profile = window.currentUserProfile;
  if (!profile) return;

  // Atualizar card do utilizador na sidebar
  const avatarEl = document.getElementById('sidebarUserAvatar');
  const nameEl = document.getElementById('sidebarUserName');
  const roleEl = document.getElementById('sidebarUserRole');

  if (avatarEl) {
    const initials = (profile.name || 'Admin').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'AD';
    avatarEl.textContent = initials;
    avatarEl.className = `sidebar-user-avatar avatar-bg-${profile.avatarColor || 'indigo'}`;
  }
  if (nameEl) nameEl.textContent = profile.name || 'Administrador';
  if (roleEl) {
    const preset = ROLE_PRESETS[profile.roleKey] || ROLE_PRESETS.super_admin;
    roleEl.innerHTML = `<i class="${preset.icon}"></i> ${escapeHtml(profile.roleTitle || preset.title)}`;
    roleEl.className = `sidebar-user-role ${preset.badgeClass}`;
  }

  // Filtrar itens de navegação e botões com data-permission
  document.querySelectorAll('[data-permission]').forEach(el => {
    const permKey = el.dataset.permission;
    if (permKey) {
      const allowed = window.hasPermission(permKey);
      el.style.display = allowed ? '' : 'none';
    }
  });
};

async function initAdminAuth() {
  const overlay = document.getElementById('adminAuthModal');
  const inputEmail = document.getElementById('adminEmailInput');
  const inputPassword = document.getElementById('adminPasswordInput');
  const btnLogin = document.getElementById('btnLogin');
  const authAlert = document.getElementById('authAlert');
  document.getElementById('btnLogout')?.addEventListener('click', logoutAdmin);
  const auth = window.firebaseServices.auth;

  if (!auth) {
    if (authAlert) authAlert.innerHTML = '<span style="color:#ef4444">SDK de autenticação indisponível.</span>';
    return;
  }

  await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
  auth.onAuthStateChanged(async user => {
    if (!user) {
      window.currentUserProfile = null;
      if (overlay) overlay.classList.add('active');
      return;
    }
    try {
      await window.db.loadPrivateCollections();
    } catch (error) {
      console.warn('Aviso ao sincronizar coleções privadas do Firestore:', error);
    }

    // Identificar e inicializar o perfil RBAC do utilizador autenticado
    const users = window.db.getAdminUsers();
    let matchedUser = users.find(u => u.email && u.email.toLowerCase() === (user.email || '').toLowerCase());

    if (!matchedUser) {
      // Primeira conta ou Super Admin padrão
      matchedUser = {
        id: user.uid,
        name: user.displayName || (user.email ? user.email.split('@')[0] : 'Admin'),
        email: user.email || '',
        roleKey: 'super_admin',
        roleTitle: 'Super Administrador',
        status: 'active',
        position: 'Administrador Geral',
        avatarColor: 'indigo',
        permissions: ALL_PERMISSIONS.reduce((acc, p) => ({ ...acc, [p]: true }), {})
      };
      window.db.saveAdminUser(matchedUser);
    }

    if (matchedUser.status === 'suspended') {
      alert('Esta conta de utilizador foi suspensa pelos administradores da rádio. O acesso ao painel foi bloqueado.');
      await auth.signOut();
      window.location.reload();
      return;
    }

    window.currentUserProfile = matchedUser;

    if (overlay) {
      overlay.classList.remove('active');
    }
    if (authAlert) {
      authAlert.innerHTML = '';
    }
    loadAdminDashboard();
    window.applyUserPermissionsToUI();
  });

  if (btnLogin) {
    btnLogin.addEventListener('click', async () => {
      btnLogin.disabled = true;
      if (authAlert) authAlert.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;"><i class="ri-loader-4-line ri-spin"></i> A autenticar...</span>';
      try {
        await auth.signInWithEmailAndPassword(inputEmail.value.trim(), inputPassword.value);
      } catch (error) {
        let msg = 'Email ou palavra-passe inválidos.';
        if (error.code === 'auth/user-not-found') msg = 'Utilizador não encontrado.';
        else if (error.code === 'auth/wrong-password') msg = 'Palavra-passe incorreta.';
        else if (error.code === 'auth/too-many-requests') msg = 'Demasiadas tentativas. Tenta novamente mais tarde.';
        if (authAlert) authAlert.innerHTML = `<span style="color: #ef4444; font-size: 0.85rem;"><i class="ri-error-warning-line"></i> ${msg}</span>`;
      }
      btnLogin.disabled = false;
    });
  }

}

async function logoutAdmin() {
  await window.firebaseServices.auth.signOut();
  window.location.reload();
}

function initAdminTabs() {
  document.querySelectorAll('.sidebar-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (target) switchAdminSection(target);
    });
  });
  initAoVivoClock();
}

function loadAdminDashboard() {
  adminDashboardReady = true;
  updateKPIs();
  renderSongRankingTable();
  renderAdminLinksTable();
  renderAdminPodcastsTable();
  renderAdminAnnouncementsTable();
  renderAdminMessagesTable();
  // Initialize Google Calendar (replaces old renderSharedCalendar)
  if (typeof GCal !== 'undefined') {
    window.CALENDAR_CATEGORY_COLORS = CALENDAR_CATEGORY_COLORS;
    GCal.init();
  }
  renderAdminUsersTable();
  renderRundownsList();
  renderTeamMemos();
  renderTasksView();
  renderAdminPollsTable();
  renderAdminOverview();
  renderAoVivo();
  initIntervalBellTimer();
}


function updateKPIs() {
  const suggestions = window.db.getSuggestions();
  const pending = suggestions.filter(s => s.status === 'pending');
  const links = window.db.getLinks().filter(l => l.active !== false);
  const unreadMessages = window.db.getMessages().filter(message => message.status === 'unread');
  const activeTasks = window.db.getTasks ? window.db.getTasks().filter(t => t.status !== 'done') : [];

  const sideSongs = document.getElementById('sideKpiSongs');
  const sideMessages = document.getElementById('sideKpiMessages');
  const sideLinks = document.getElementById('sideKpiLinks');
  const badgeSongs = document.getElementById('sideNavBadgeSongs');
  const badgeMessages = document.getElementById('sideNavBadgeMessages');
  const badgeTasks = document.getElementById('sideNavBadgeTasks');

  if (sideSongs) sideSongs.innerText = pending.length;
  if (sideMessages) sideMessages.innerText = unreadMessages.length;
  if (sideLinks) sideLinks.innerText = links.length;

  if (badgeSongs) {
    badgeSongs.innerText = pending.length > 0 ? pending.length : '';
  }
  if (badgeMessages) {
    badgeMessages.innerText = unreadMessages.length > 0 ? unreadMessages.length : '';
  }
  if (badgeTasks) {
    badgeTasks.innerText = activeTasks.length > 0 ? activeTasks.length : '';
  }
}

/* ==========================================================================
   1. GESTÃO E RANKING DAS MÚSICAS MAIS SUGERIDAS
   ========================================================================== */
let audioPreviewObj = new Audio();
let audioPreviewRequest = 0;

function renderSongRankingTable(filterStatus = 'all') {
  const tbody = document.getElementById('songRankingTbody');
  if (!tbody) return;

  const suggestions = window.db.getSuggestions();

  if (suggestions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2.5rem;">Nenhuma sugestão de música recebida.</td></tr>';
    return;
  }

  const map = new Map();

  suggestions.forEach(item => {
    if (filterStatus !== 'all' && item.status !== filterStatus) return;

    const key = `${item.songTitle.toLowerCase().trim()}___${item.artist.toLowerCase().trim()}`;
    if (!map.has(key)) {
      map.set(key, {
        songTitle: item.songTitle,
        artist: item.artist,
        artwork: item.artwork,
        previewUrl: item.previewUrl,
        count: 0,
        ids: [],
        status: item.status
      });
    }

    const group = map.get(key);
    group.count += 1;
    group.ids.push(item.id);
  });

  const rankedList = Array.from(map.values()).sort((a, b) => b.count - a.count);

  if (rankedList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhuma música com o estado "${filterStatus}".</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  rankedList.forEach((song, idx) => {
    const tr = document.createElement('tr');
    let statusBadgeClass = 'status-pending';
    let statusLabel = 'Pendente';
    if (song.status === 'played') { statusBadgeClass = 'status-played'; statusLabel = 'Tocado na Rádio'; }
    if (song.status === 'archived') { statusBadgeClass = 'status-archived'; statusLabel = 'Arquivado'; }

    tr.innerHTML = `
      <td style="font-weight: 800; color: var(--cascais-blue); font-size: 1.1rem;">#${idx + 1}</td>
      <td>
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <img src="${song.artwork}" alt="${escapeHtml(song.songTitle)}" style="width: 44px; height: 44px; border-radius: 6px;">
          <div>
            <strong style="display: block; color: white;">${escapeHtml(song.songTitle)}</strong>
            <span style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(song.artist)}</span>
          </div>
        </div>
      </td>
      <td>
        <span class="count-badge" style="background: rgba(245, 158, 11, 0.2); color: #fcd34d;"><i class="ri-fire-fill"></i> ${song.count} pedido${song.count > 1 ? 's' : ''}</span>
      </td>
      <td>
        <span class="status-badge ${statusBadgeClass}">${statusLabel}</span>
      </td>
      <td>
        ${song.previewUrl ? `<button class="btn-action" title="Ouvir Prévia" onclick="playAudioPreview('${song.previewUrl}')"><i class="ri-play-line"></i></button>` : ''}
        <button class="btn-action" title="Marcar como Tocado" onclick="changeGroupStatus(['${song.ids.join("','")}'], 'played')"><i class="ri-checkbox-circle-line" style="color: #34d399;"></i> Tocado</button>
        <button class="btn-action" title="Arquivar" onclick="changeGroupStatus(['${song.ids.join("','")}'], 'archived')"><i class="ri-archive-line"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.playAudioPreview = function (url) {
  const requestId = ++audioPreviewRequest;
  if (audioPreviewObj.src === url && !audioPreviewObj.paused) {
    audioPreviewObj.pause();
  } else {
    audioPreviewObj.pause();
    audioPreviewObj.src = url;
    const playRequest = audioPreviewObj.play();
    if (playRequest) {
      playRequest.catch(error => {
        if (error.name !== 'AbortError' && requestId === audioPreviewRequest) {
          console.error('Não foi possível reproduzir a prévia:', error);
        }
      });
    }
  }
};

window.changeGroupStatus = function (ids, newStatus) {
  ids.forEach(id => window.db.updateSuggestionStatus(id, newStatus));
  updateKPIs();
  renderSongRankingTable();
};

window.filterSongsByStatus = function (status) {
  renderSongRankingTable(status);
};

window.clearAllSuggestions = function () {
  if (confirm('Tens a certeza de que queres eliminar TODAS as sugestões de música?')) {
    window.db.clearSuggestions();
    updateKPIs();
    renderSongRankingTable();
  }
};

/* ==========================================================================
   2. GESTÃO DO LINKTREE (LINKS RÁPIDOS)
   ========================================================================== */
function renderAdminLinksTable() {
  const tbody = document.getElementById('linksAdminTbody');
  if (!tbody) return;

  const links = window.db.getLinks();
  if (links.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Nenhum link configurado.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  links.forEach(link => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <i class="${link.icon || 'ri-link'}"></i> <strong>${escapeHtml(link.title)}</strong>
        ${link.subtitle ? `<br><small style="color: var(--text-muted);">${escapeHtml(link.subtitle)}</small>` : ''}
      </td>
      <td style="font-size: 0.85rem;"><a href="${link.url}" target="_blank">${escapeHtml(link.url)}</a></td>
      <td>${link.badge ? `<span class="linktree-badge">${escapeHtml(link.badge)}</span>` : '-'}</td>
      <td>
        <span class="status-badge ${link.active !== false ? 'status-played' : 'status-archived'}">
          ${link.active !== false ? 'Ativo' : 'Inativo'}
        </span>
      </td>
      <td>
        <button class="btn-action" onclick="toggleLinkActive('${link.id}')"><i class="ri-toggle-line"></i> Alternar</button>
        <button class="btn-action" style="color: #ef4444;" onclick="deleteLinkItem('${link.id}')"><i class="ri-delete-bin-line"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.toggleLinkActive = function (id) {
  window.db.toggleLink(id);
  updateKPIs();
  renderAdminLinksTable();
};

window.deleteLinkItem = function (id) {
  if (confirm('Eliminar este link do Linktree?')) {
    window.db.deleteLink(id);
    updateKPIs();
    renderAdminLinksTable();
  }
};

window.saveNewLink = function (e) {
  e.preventDefault();
  const title = document.getElementById('linkTitleInput').value.trim();
  const subtitle = document.getElementById('linkSubInput').value.trim();
  const url = document.getElementById('linkUrlInput').value.trim();
  const icon = document.getElementById('linkIconInput').value.trim() || 'ri-link';
  const badge = document.getElementById('linkBadgeInput').value.trim();

  if (!title || !url) {
    showToast('Por favor, preenche o título e o URL do link.', 'warning');
    return;
  }

  window.db.addLink({ title, subtitle, url, icon, badge });
  document.getElementById('addLinkForm').reset();
  closeModal('addLinkModal');
  updateKPIs();
  renderAdminLinksTable();
  showToast('Link adicionado com sucesso ao Linktree!', 'success');
};

/* ==========================================================================
   3. GESTÃO DE PODCASTS & SPOTIFY
   ========================================================================== */

window.parseSpotifyUrl = function (url) {
  if (!url) return null;
  const cleanUrl = url.trim();

  // Caso seja código embed iframe <iframe src="...">
  const iframeMatch = cleanUrl.match(/src=["']([^"']+)["']/i);
  if (iframeMatch) {
    const src = iframeMatch[1];
    return { isSpotify: src.includes('spotify.com'), embedUrl: src, originalUrl: src };
  }

  // spotify:episode:ID ou spotify:show:ID
  const uriMatch = cleanUrl.match(/spotify:(episode|show):([a-zA-Z0-9]+)/i);
  if (uriMatch) {
    const type = uriMatch[1];
    const id = uriMatch[2];
    return {
      isSpotify: true,
      embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`,
      originalUrl: `https://open.spotify.com/${type}/${id}`
    };
  }

  // https://open.spotify.com/episode/ID ou /show/ID
  const httpMatch = cleanUrl.match(/open\.spotify\.com\/(episode|show)\/([a-zA-Z0-9]+)/i);
  if (httpMatch) {
    const type = httpMatch[1];
    const id = httpMatch[2];
    return {
      isSpotify: true,
      embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`,
      originalUrl: cleanUrl.split('?')[0]
    };
  }

  // https://open.spotify.com/embed/episode/ID
  if (cleanUrl.includes('open.spotify.com/embed/')) {
    return { isSpotify: true, embedUrl: cleanUrl, originalUrl: cleanUrl };
  }

  return { isSpotify: false, embedUrl: null, originalUrl: cleanUrl, audioUrl: cleanUrl };
};

window.handlePodcastUrlInput = function (value) {
  const previewWrapper = document.getElementById('podPreviewWrapper');
  const previewContainer = document.getElementById('podPreviewFrameContainer');
  const previewBadge = document.getElementById('podPreviewBadge');
  if (!previewWrapper || !previewContainer) return;

  if (!value || value.trim().length < 5) {
    previewWrapper.style.display = 'none';
    previewContainer.innerHTML = '';
    return;
  }

  const parsed = window.parseSpotifyUrl(value);
  previewWrapper.style.display = 'block';

  if (parsed && parsed.isSpotify && parsed.embedUrl) {
    if (previewBadge) previewBadge.innerHTML = '<i class="ri-spotify-fill" style="color:#1db954;"></i> Spotify Embed';
    previewContainer.innerHTML = `
      <iframe src="${parsed.embedUrl}" width="100%" height="152" frameBorder="0" allowfullscreen=""
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy" style="border-radius: 12px;"></iframe>
    `;
  } else {
    if (previewBadge) previewBadge.innerHTML = '<i class="ri-volume-up-line"></i> Áudio Direto';
    previewContainer.innerHTML = `
      <audio controls src="${value}" style="width: 100%; border-radius: 8px; margin-top: 0.25rem;">
        O teu navegador não suporta este áudio.
      </audio>
    `;
  }
};

window.openPodcastModal = function (id = null) {
  const modal = document.getElementById('addPodcastModal');
  const form = document.getElementById('addPodcastForm');
  const titleEl = document.getElementById('podcastModalTitle');
  const deleteBtn = document.getElementById('podDeleteBtn');
  if (!modal || !form) return;

  form.reset();
  document.getElementById('podIdInput').value = '';
  document.getElementById('podPreviewWrapper').style.display = 'none';
  document.getElementById('podPreviewFrameContainer').innerHTML = '';

  if (id) {
    const pod = window.db.getPodcast ? window.db.getPodcast(id) : window.db.getPodcasts().find(p => p.id === id);
    if (pod) {
      if (titleEl) titleEl.innerText = 'Editar Episódio de Podcast';
      if (deleteBtn) deleteBtn.style.display = 'inline-flex';

      document.getElementById('podIdInput').value = pod.id;
      document.getElementById('podUrlInput').value = pod.spotifyUrl || pod.audioUrl || pod.originalUrl || '';
      document.getElementById('podTitleInput').value = pod.title || '';
      document.getElementById('podCategoryInput').value = pod.category || 'Geral';
      document.getElementById('podHostsInput').value = pod.hosts || '';
      document.getElementById('podDateInput').value = pod.date || '';
      document.getElementById('podDurationInput').value = pod.duration || '';
      document.getElementById('podDescInput').value = pod.description || '';
      if (document.getElementById('podImageInput')) {
        document.getElementById('podImageInput').value = pod.thumbnail || pod.image || '';
      }
      document.getElementById('podFeaturedInput').checked = !!pod.featured;

      window.handlePodcastUrlInput(pod.spotifyUrl || pod.audioUrl || pod.originalUrl || '');
      openModal('addPodcastModal');
      return;
    }
  }

  if (titleEl) titleEl.innerText = 'Novo Episódio de Podcast';
  if (deleteBtn) deleteBtn.style.display = 'none';

  // Data atual pré-preenchida
  const now = new Date();
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  document.getElementById('podDateInput').value = `${now.getDate()} ${months[now.getMonth()]}, ${now.getFullYear()}`;
  document.getElementById('podCategoryInput').value = 'Geral';
  if (document.getElementById('podImageInput')) document.getElementById('podImageInput').value = '';
  document.getElementById('podFeaturedInput').checked = false;

  openModal('addPodcastModal');
};

function renderAdminPodcastsTable() {
  const tbody = document.getElementById('podcastsAdminTbody');
  if (!tbody) return;

  const list = window.db.getPodcasts();
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">Ainda não foram adicionados episódios de podcast. Clica em "Novo Episódio" para publicar via Spotify.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  list.forEach(pod => {
    const isSpotify = pod.isSpotify || (pod.spotifyUrl && pod.spotifyUrl.includes('spotify')) || (pod.audioUrl && pod.audioUrl.includes('spotify'));
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="display: flex; flex-direction: column; gap: 0.2rem;">
          <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
            <span class="blog-tag" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; font-size: 0.72rem; padding: 0.15rem 0.45rem; border-radius: 4px;">
              ${escapeHtml(pod.category || 'Podcast')}
            </span>
            <strong style="color: #ffffff; font-size: 0.95rem;">${escapeHtml(pod.title)}</strong>
          </div>
          ${pod.hosts ? `<small style="color: var(--text-muted); font-size: 0.78rem;"><i class="ri-user-voice-line"></i> ${escapeHtml(pod.hosts)}</small>` : ''}
        </div>
      </td>
      <td>
        ${isSpotify
        ? `<a href="${escapeHtml(pod.originalUrl || pod.spotifyUrl || pod.audioUrl)}" target="_blank" rel="noopener noreferrer" class="linktree-badge" style="background: rgba(29, 185, 84, 0.15); color: #1db954; display: inline-flex; align-items: center; gap: 0.3rem; text-decoration: none;">
              <i class="ri-spotify-fill"></i> Spotify
            </a>`
        : `<span class="linktree-badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; display: inline-flex; align-items: center; gap: 0.3rem;">
              <i class="ri-volume-up-line"></i> Áudio MP3
            </span>`
      }
      </td>
      <td style="font-size: 0.85rem; color: var(--text-secondary);">
        <div>${escapeHtml(pod.date || 'Recente')}</div>
        <small style="color: var(--text-muted);">${escapeHtml(pod.duration || '--')}</small>
      </td>
      <td>
        ${pod.featured
        ? '<span class="status-badge status-played" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24;"><i class="ri-star-fill"></i> Sim</span>'
        : '<span style="color: var(--text-muted); font-size: 0.8rem;">Não</span>'
      }
      </td>
      <td>
        <div style="display: flex; gap: 0.35rem;">
          <button class="btn-action" onclick="openPodcastModal('${pod.id}')" title="Editar episódio"><i class="ri-edit-line"></i> Editar</button>
          <button class="btn-action" style="color: #ef4444;" onclick="deletePodcastItem('${pod.id}')" title="Eliminar"><i class="ri-delete-bin-line"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.deletePodcastItem = function (id) {
  if (confirm('Tens a certeza de que queres eliminar este episódio de podcast?')) {
    window.db.deletePodcast(id);
    updateKPIs();
    renderAdminPodcastsTable();
    showToast('Episódio de podcast eliminado.', 'info');
  }
};

window.deleteCurrentOpenPodcast = function () {
  const id = document.getElementById('podIdInput').value;
  if (!id) return;
  if (confirm('Tens a certeza de que queres eliminar este episódio?')) {
    window.db.deletePodcast(id);
    closeModal('addPodcastModal');
    updateKPIs();
    renderAdminPodcastsTable();
    showToast('Episódio de podcast eliminado com sucesso.', 'info');
  }
};

window.saveNewPodcast = function (e) {
  e.preventDefault();
  const id = document.getElementById('podIdInput').value.trim();
  const rawUrl = document.getElementById('podUrlInput').value.trim();
  const title = document.getElementById('podTitleInput').value.trim();
  const category = document.getElementById('podCategoryInput').value.trim() || 'Geral';
  const hosts = document.getElementById('podHostsInput').value.trim();
  const date = document.getElementById('podDateInput').value.trim();
  const duration = document.getElementById('podDurationInput').value.trim() || '20 min';
  const description = document.getElementById('podDescInput')?.value?.trim() || '';
  const thumbnail = document.getElementById('podImageInput')?.value?.trim() || '';
  const featured = document.getElementById('podFeaturedInput').checked;

  if (!title || !rawUrl) {
    showToast('Por favor, preenche o título e a ligação do episódio.', 'warning');
    return;
  }

  const parsed = window.parseSpotifyUrl(rawUrl);
  const podcastData = {
    title,
    category,
    hosts,
    date,
    duration,
    description,
    thumbnail,
    featured,
    isSpotify: parsed ? parsed.isSpotify : false,
    spotifyUrl: parsed && parsed.isSpotify ? parsed.originalUrl : null,
    embedUrl: parsed ? parsed.embedUrl : null,
    audioUrl: parsed && !parsed.isSpotify ? parsed.audioUrl : (parsed?.embedUrl || rawUrl),
    originalUrl: parsed ? parsed.originalUrl : rawUrl
  };

  if (id) {
    if (window.db.updatePodcast) {
      window.db.updatePodcast(id, podcastData);
    } else {
      window.db.deletePodcast(id);
      window.db.addPodcast({ id, ...podcastData });
    }
    showToast('Episódio de podcast atualizado com sucesso!', 'success');
  } else {
    window.db.addPodcast(podcastData);
    showToast('Episódio de podcast publicado com sucesso!', 'success');
  }

  document.getElementById('addPodcastForm').reset();
  closeModal('addPodcastModal');
  updateKPIs();
  renderAdminPodcastsTable();
};

function renderAdminAnnouncementsTable() {
  const tbody = document.getElementById('announcementsAdminTbody');
  if (!tbody) return;

  const list = window.db.getPublicAnnouncements();
  tbody.innerHTML = '';
  list.forEach(ann => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="blog-tag">${escapeHtml(ann.tag || 'Notícia')}</span> <strong>${escapeHtml(ann.title)}</strong></td>
      <td style="font-size: 0.85rem;">${escapeHtml(ann.date)}</td>
      <td>
        <a class="btn-action" href="artigo.html?id=${encodeURIComponent(ann.id)}" target="_blank" title="Ver artigo"><i class="ri-eye-line"></i> Ver</a>
        <a class="btn-action" href="admin-editor.html?id=${encodeURIComponent(ann.id)}" title="Editar artigo"><i class="ri-edit-line"></i> Editar</a>
        <button class="btn-action" style="color: #ef4444;" onclick="deleteAnnouncementItem('${ann.id}')"><i class="ri-delete-bin-line"></i> Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.deleteAnnouncementItem = function (id) {
  if (confirm('Eliminar esta notícia?')) {
    window.db.deleteAnnouncement(id);
    renderAdminAnnouncementsTable();
    showToast('Notícia eliminada.', 'info');
  }
};

function renderAdminMessagesTable() {
  const sidebar = document.getElementById('messagesSidebar');
  const detail = document.getElementById('messageDetailPanel');
  if (!sidebar || !detail) return;

  const messages = window.db.getMessages();

  if (!messages.length) {
    sidebar.innerHTML = '<div class="admin-empty-cell"><i class="ri-chat-smile-2-line"></i> Ainda não recebemos mensagens.</div>';
    detail.innerHTML = '<div class="message-detail-empty"><i class="ri-mail-open-line"></i><strong>Sem mensagens</strong><span>As mensagens recebidas aparecerão aqui.</span></div>';
    return;
  }

  const selectedId = detail.dataset.selectedId || messages[0].id;
  const selectedMessage = messages.find(item => item.id === selectedId) || messages[0];

  sidebar.innerHTML = messages.map(message => {
    const isUnread = message.status === 'unread';
    const isSelected = selectedMessage && selectedMessage.id === message.id;
    const author = message.name || 'Sem nome';
    const shortText = String(message.message || '').replace(/\s+/g, ' ').trim();
    return `
      <button class="message-list-item ${isSelected ? 'active' : ''} ${isUnread ? 'unread' : ''}" type="button" data-message-id="${message.id}" onclick="selectMessage('${message.id}')">
        <div class="message-list-topline">
          <strong>${escapeHtml(author)}</strong>
          <span>${new Date(message.createdAt || Date.now()).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}</span>
        </div>
        <span class="message-list-subject">${escapeHtml(message.studentClass || 'Sem turma')}</span>
        <p>${escapeHtml(shortText.length > 110 ? `${shortText.slice(0, 107)}...` : shortText)}</p>
      </button>
    `;
  }).join('');

  detail.dataset.selectedId = selectedMessage.id;
  const received = new Date(selectedMessage.createdAt || Date.now()).toLocaleString('pt-PT', { dateStyle: 'long', timeStyle: 'short' });
  const canMarkRead = selectedMessage.status === 'unread';
  detail.innerHTML = `
    <div class="message-detail-header">
      <div>
        <span class="message-detail-label">De</span>
        <h3>${escapeHtml(selectedMessage.name || 'Sem nome')}</h3>
      </div>
      <div class="message-detail-actions">
        ${canMarkRead ? `<button class="btn-action" onclick="markMessageRead('${selectedMessage.id}')"><i class="ri-check-line"></i> Marcar como lida</button>` : ''}
        <button class="btn-action danger-action" onclick="deleteMessageItem('${selectedMessage.id}')"><i class="ri-delete-bin-line"></i> Eliminar</button>
      </div>
    </div>
    <div class="message-detail-meta">
      <span><i class="ri-mail-line"></i> ${escapeHtml(selectedMessage.email || 'Sem email')}</span>
      <span><i class="ri-graduation-cap-line"></i> ${escapeHtml(selectedMessage.studentClass || 'Sem turma')}</span>
      <span><i class="ri-calendar-line"></i> ${escapeHtml(received)}</span>
    </div>
    <div class="message-detail-body">
      <p>${escapeHtml(selectedMessage.message || 'Mensagem vazia.')}</p>
    </div>
  `;
}

window.selectMessage = function (id) {
  const detail = document.getElementById('messageDetailPanel');
  if (!detail) return;
  detail.dataset.selectedId = id;
  renderAdminMessagesTable();
  if (id) {
    const item = window.db.getMessages().find(message => message.id === id);
    if (item && item.status === 'unread') {
      window.db.updateMessageStatus(id, 'read');
      updateKPIs();
      renderAdminOverview();
    }
  }
};

window.markMessageRead = function (id) {
  window.db.updateMessageStatus(id, 'read');
  updateKPIs();
  renderAdminMessagesTable();
  if (typeof GCal !== 'undefined') GCal.render();
  renderAdminUsersTable();
  renderAdminOverview();
};

window.deleteMessageItem = function (id) {
  if (confirm('Eliminar esta mensagem?')) {
    window.db.deleteMessage(id);
    updateKPIs();
    renderAdminMessagesTable();
    if (typeof GCal !== 'undefined') GCal.render();
    renderAdminUsersTable();
    renderAdminOverview();
    showToast('Mensagem eliminada com sucesso.', 'info');
  }
};

window.saveNewAnnouncement = function (e) {
  e.preventDefault();
  const tag = document.getElementById('annTagInput').value.trim() || 'Notícia';
  const title = document.getElementById('annTitleInput').value.trim();
  const date = document.getElementById('annDateInput')?.value?.trim() || new Date().toLocaleDateString('pt-PT');
  const content = document.getElementById('annContentInput').value.trim();

  if (!title || !content) {
    showToast('Por favor, indica o título e o conteúdo da notícia.', 'warning');
    return;
  }

  window.db.addAnnouncement({ tag, title, date, content });
  document.getElementById('addAnnouncementForm').reset();
  closeModal('addAnnouncementModal');
  renderAdminAnnouncementsTable();
  showToast('Notícia publicada com sucesso!', 'success');
};

/* ==========================================================================
   4. MODAIS E NAVEGAÇÃO ENTRE SEÇÕES
/* ==========================================================================
   SISTEMA MODAL & TOAST NOTIFICATIONS (HIGH-END UI/UX)
   ========================================================================== */
window.openModal = function (id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('active');
    const win = modal.querySelector('.modal-window');
    if (win) win.scrollTop = 0;
    setTimeout(() => {
      const input = modal.querySelector('input:not([type="hidden"]), textarea, select');
      if (input) input.focus();
    }, 80);
  }
};

window.closeModal = function (id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('active');
  }
};

// Fechar modais ao pressionar ESC
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'Esc') {
    document.querySelectorAll('.modal-overlay.active').forEach(modal => {
      modal.classList.remove('active');
    });
  }
});

// Fechar modal ao clicar fora da janela (no backdrop)
document.addEventListener('click', (e) => {
  if (e.target && e.target.classList.contains('modal-overlay') && e.target.id !== 'adminAuthModal') {
    e.target.classList.remove('active');
  }
});

/* Toast Notification Manager */
window.showToast = function (message, type = 'success', title = '') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;

  const iconMap = {
    success: 'ri-checkbox-circle-fill',
    error: 'ri-error-warning-fill',
    info: 'ri-information-fill',
    warning: 'ri-alert-fill'
  };
  const iconClass = iconMap[type] || 'ri-information-fill';

  const defaultTitles = {
    success: 'Sucesso',
    error: 'Atenção',
    info: 'Informação',
    warning: 'Aviso'
  };
  const toastTitle = title || defaultTitles[type] || 'Notificação';

  toast.innerHTML = `
    <div class="toast-icon"><i class="${iconClass}"></i></div>
    <div class="toast-body">
      <strong>${escapeHtml(toastTitle)}</strong>
      <span>${escapeHtml(message)}</span>
    </div>
    <button type="button" class="toast-close-btn" aria-label="Fechar notificação" onclick="this.closest('.toast-item').remove()"><i class="ri-close-line"></i></button>
  `;

  const dismiss = () => {
    toast.classList.add('toast-hiding');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 260);
  };

  const closeBtn = toast.querySelector('.toast-close-btn');
  if (closeBtn) {
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      dismiss();
    };
  }

  container.appendChild(toast);
  setTimeout(dismiss, 4200);
};

/* Sincronização de Seletores Interativos de Tarefa */
window.selectTaskPriority = function (priority) {
  const select = document.getElementById('taskPriorityInput');
  if (select) select.value = priority;
  document.querySelectorAll('#taskPriorityChips .chip-selector-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-val') === priority);
  });
};

window.selectTaskStatus = function (status) {
  const select = document.getElementById('taskStatusInput');
  if (select) select.value = status;
  document.querySelectorAll('#taskStatusChips .chip-selector-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-val') === status);
  });
};

window.selectTaskWeek = function (week) {
  const select = document.getElementById('taskWeekInput');
  if (select) select.value = week;
  document.querySelectorAll('#taskWeekChips .chip-selector-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-val') === week);
  });
};

window.syncTaskChipsFromSelects = function () {
  const priority = document.getElementById('taskPriorityInput')?.value || 'normal';
  const status = document.getElementById('taskStatusInput')?.value || 'todo';
  const week = document.getElementById('taskWeekInput')?.value || 'this_week';
  selectTaskPriority(priority);
  selectTaskStatus(status);
  selectTaskWeek(week);
};

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ===========================================================================
   CALENDÁRIO PARTILHADO E UTILIZADORES
   =========================================================================== */
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedCalendarDate = localDateKey(new Date());
let adminDashboardReady = false;

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const CALENDAR_CATEGORY_COLORS = {
  'Direção & Escola': { color: 'rose', hex: '#f43f5e', icon: 'ri-building-line' },
  'Associação de Estudantes': { color: 'amber', hex: '#f59e0b', icon: 'ri-team-line' },
  'Clubes & Desporto': { color: 'emerald', hex: '#10b981', icon: 'ri-football-line' },
  'Efeméride & Comemoração': { color: 'purple', hex: '#a855f7', icon: 'ri-calendar-todo-line' },
  'Emissão Especial': { color: 'cyan', hex: '#06b6d4', icon: 'ri-mic-line' },
  'Aviso Geral': { color: 'blue', hex: '#38bdf8', icon: 'ri-information-line' },
  'Reunião / Produção': { color: 'slate', hex: '#94a3b8', icon: 'ri-briefcase-line' }
};

window.onCalendarCategoryChange = function (category) {
  const colorSelect = document.getElementById('calendarEventColorInput');
  if (!colorSelect) return;
  const match = CALENDAR_CATEGORY_COLORS[category];
  if (match) {
    colorSelect.value = match.color;
  }
};

function renderCalendarSelectedDayPanel() {
  const panel = document.getElementById('calendarSelectedDayEvents');
  const label = document.getElementById('calendarSelectedDateLabel');
  if (!panel || !label) return;

  const date = parseLocalDate(selectedCalendarDate) || new Date();
  const formattedDate = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  label.textContent = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
  label.dataset.date = selectedCalendarDate;

  const events = window.db.getCalendarEvents().filter(item => item.date === selectedCalendarDate).sort((a, b) => (a.startTime || '00:00').localeCompare(b.startTime || '00:00'));
  if (!events.length) {
    panel.innerHTML = '<div class="calendar-empty calendar-empty-compact"><i class="ri-calendar-event-line"></i><strong>Sem eventos</strong><span>Nenhum compromisso marcado para este dia.</span></div>';
    return;
  }

  panel.innerHTML = events.map(item => {
    const status = item.status === 'importante' ? 'Importante' : item.status === 'confirmado' ? 'Confirmado' : 'Planeado';
    const time = [item.startTime, item.endTime].filter(Boolean).join(' – ') || 'Todo o dia';
    const catConfig = CALENDAR_CATEGORY_COLORS[item.category || item.eventType] || { color: item.color || 'blue' };
    const colorKey = item.color || catConfig.color || 'blue';
    const leadTime = item.leadTimeDays ?? item.leadTime ?? 3;
    const leadBadge = Number(leadTime) === 0 ? 'No próprio dia' : `${leadTime}d antes`;
    return `
      <button class="calendar-day-event-card chip-${colorKey}" type="button" draggable="true" ondragstart="calendarDragStart(event, '${item.id}')" onclick="openCalendarEventModal('${item.id}', '${selectedCalendarDate}')">
        <div class="calendar-event-pill" data-type="${escapeHtml(item.eventType || item.category || 'Agenda')}">${escapeHtml(item.eventType || item.category || 'Agenda')}</div>
        <div class="calendar-event-main">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(time)} · <i class="ri-broadcast-line" style="font-size:0.75rem;"></i> Guião: ${leadBadge}</span>
          ${item.assignedUserName ? `<small>${escapeHtml(item.assignedUserName)}</small>` : ''}
        </div>
        <span class="calendar-status-badge">${escapeHtml(status)}</span>
      </button>
    `;
  }).join('');
}

window.calendarDragStart = function (event, eventId) {
  if (!event || !event.dataTransfer) return;
  event.dataTransfer.setData('text/plain', eventId);
  event.dataTransfer.effectAllowed = 'move';
};

window.calendarAllowDrop = function (event) {
  if (!event) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
};

window.calendarDropOnDay = function (event, dateKey) {
  if (!event || !event.dataTransfer) return;
  event.preventDefault();
  const eventId = event.dataTransfer.getData('text/plain');
  if (!eventId) return;
  window.db.updateCalendarEventDate(eventId, dateKey);
  selectedCalendarDate = dateKey;
  renderSharedCalendar();
};

function renderSharedCalendar() {
  const grid = document.getElementById('calendarGrid');
  const title = document.getElementById('calendarMonthTitle');
  const upcoming = document.getElementById('upcomingEventsList');
  if (!grid || !title || !upcoming) return;
  title.textContent = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' }).format(calendarMonth);
  const events = window.db.getCalendarEvents();
  const eventMap = events.reduce((map, item) => ((map[item.date] ||= []).push(item), map), {});
  const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const today = localDateKey(new Date());
  grid.innerHTML = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first); date.setDate(first.getDate() + index);
    const key = localDateKey(date); const items = eventMap[key] || [];
    const current = date.getMonth() === calendarMonth.getMonth();
    const isSelected = key === selectedCalendarDate;
    return `<button type="button" class="calendar-day${current ? '' : ' calendar-day-muted'}${key === today ? ' calendar-day-today' : ''}${isSelected ? ' calendar-day-selected' : ''}" draggable="false" ondragover="calendarAllowDrop(event)" ondrop="calendarDropOnDay(event, '${key}')" onclick="selectCalendarDate('${key}')"><span class="calendar-day-number">${date.getDate()}</span><span class="calendar-day-events">${items.slice(0, 3).map(item => {
      const catConfig = CALENDAR_CATEGORY_COLORS[item.category || item.eventType] || { color: item.color || 'blue' };
      const colorKey = item.color || catConfig.color || 'blue';
      return `<span class="calendar-event-chip chip-${colorKey}" data-type="${escapeHtml(item.eventType || item.category || 'Agenda')}" title="${escapeHtml(item.title)}">${escapeHtml(item.startTime ? `${item.startTime} · ` : '')}${escapeHtml(item.title)}</span>`;
    }).join('')}${items.length > 3 ? `<span class="calendar-more-events">+${items.length - 3}</span>` : ''}</span></button>`;
  }).join('');
  const now = localDateKey(new Date());
  const future = events.filter(item => item.date >= now).slice(0, 6);
  upcoming.innerHTML = future.length ? future.map(item => {
    const date = new Date(`${item.date}T00:00`);
    const day = date.getDate(); const month = new Intl.DateTimeFormat('pt-PT', { month: 'short' }).format(date).replace('.', '');
    const time = [item.startTime, item.endTime].filter(Boolean).join(' – ') || 'Todo o dia';
    return `<article class="upcoming-event"><div class="upcoming-event-date"><strong>${day}</strong><span>${month}</span></div><div class="upcoming-event-content"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(time)}${item.assignedUserName ? ` · ${escapeHtml(item.assignedUserName)}` : ''}</span>${item.notes ? `<small>${escapeHtml(item.notes)}</small>` : ''}</div><button class="btn-action" onclick="selectCalendarDate('${item.date}'); openCalendarEventModal('${item.id}', '${item.date}')" title="Editar evento"><i class="ri-edit-line"></i></button></article>`;
  }).join('') : '<div class="calendar-empty"><i class="ri-calendar-check-line"></i><strong>Sem eventos futuros</strong><span>Adiciona o primeiro compromisso da equipa.</span></div>';
  renderCalendarSelectedDayPanel();
}

window.selectCalendarDate = function (dateKey) {
  selectedCalendarDate = dateKey || localDateKey(new Date());
  renderSharedCalendar();
};

window.moveCalendarMonth = offset => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1); renderSharedCalendar(); };
window.goToCurrentMonth = () => { calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); selectedCalendarDate = localDateKey(new Date()); renderSharedCalendar(); };

function populateCalendarUserSelect(selectedId = '') {
  const select = document.getElementById('calendarEventUserInput');
  if (!select) return;
  select.innerHTML = `<option value="">Sem responsável</option>${window.db.getAdminUsers().map(user => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join('')}`;
  select.value = selectedId;
}

window.openCalendarEventModal = function (id = '', date = '') {
  const item = id ? window.db.getCalendarEvents().find(event => event.id === id) : null;
  const selectedDate = item?.date || date || localDateKey(new Date());
  const dateItems = window.db.getCalendarEvents().filter(event => event.date === selectedDate);
  const dateItem = !item && selectedDate ? window.db.getCalendarEvents().find(event => event.date === selectedDate && event.readOnly) : null;
  const selectedItem = item || dateItem || null;
  const isReadOnly = Boolean(selectedItem && selectedItem.readOnly);
  const form = document.getElementById('calendarEventForm');
  form.reset();
  const dateList = document.getElementById('calendarEventDateList');
  if (dateList) {
    const existing = dateItems.filter(event => event.id !== (selectedItem?.id || ''));
    dateList.style.display = (!selectedItem && dateItems.length > 0) || (selectedItem && existing.length > 0) ? 'block' : 'none';
    dateList.innerHTML = dateItems.length ? `<div class="calendar-date-list-label">Eventos neste dia</div>${dateItems.map(event => `<button type="button" class="calendar-date-list-item ${event.id === selectedItem?.id ? 'active' : ''}" data-event-id="${event.id}" onclick="openCalendarEventModal('${event.id}', '${selectedDate}')"><span>${escapeHtml(event.eventType || event.category || 'Agenda')}</span><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.startTime || 'Todo o dia')}</small></button>`).join('')}<button type="button" class="btn-action calendar-date-add" onclick="openCalendarEventModal('', '${selectedDate}')">Adicionar outro evento</button>` : '<div class="calendar-date-list-empty">Sem eventos neste dia.</div>';
  }
  const badgeEl = document.getElementById('gcalDialogBadge');
  if (badgeEl) {
    badgeEl.innerHTML = isReadOnly
      ? '<i class="ri-information-line"></i> Dia Temático'
      : (selectedItem ? '<i class="ri-edit-line"></i> Editar Evento' : '<i class="ri-add-circle-fill"></i> Novo Evento');
  }

  document.getElementById('calendarEventIdInput').value = selectedItem?.id || '';
  document.getElementById('calendarEventTitleInput').value = selectedItem?.title || '';
  document.getElementById('calendarEventDateInput').value = selectedItem?.date || selectedDate;

  const categoryVal = selectedItem?.category || selectedItem?.eventType || 'Aviso Geral';
  const typeInput = document.getElementById('calendarEventTypeInput');
  if (typeInput) typeInput.value = categoryVal;

  const colorInput = document.getElementById('calendarEventColorInput');
  if (colorInput) {
    colorInput.value = selectedItem?.color || CALENDAR_CATEGORY_COLORS[categoryVal]?.color || 'blue';
  }

  const leadTimeInput = document.getElementById('calendarEventLeadTimeInput');
  if (leadTimeInput) {
    leadTimeInput.value = String(selectedItem?.leadTimeDays ?? selectedItem?.leadTime ?? 3);
  }

  document.getElementById('calendarEventStatusInput').value = selectedItem?.status || 'planeado';
  document.getElementById('calendarEventStartInput').value = selectedItem?.startTime || '';
  document.getElementById('calendarEventEndInput').value = selectedItem?.endTime || '';
  document.getElementById('calendarEventNotesInput').value = selectedItem?.notes || '';
  document.getElementById('calendarEventDeleteButton').style.display = selectedItem && !isReadOnly ? 'block' : 'none';
  const submitButton = document.getElementById('calendarEventSubmitButton');
  if (submitButton) {
    submitButton.disabled = isReadOnly;
    submitButton.style.display = isReadOnly ? 'none' : 'inline-flex';
  }
  const notice = document.getElementById('calendarEventReadOnlyNotice');
  if (notice) notice.style.display = isReadOnly ? 'block' : 'none';
  const fields = [
    document.getElementById('calendarEventTitleInput'),
    document.getElementById('calendarEventDateInput'),
    document.getElementById('calendarEventTypeInput'),
    document.getElementById('calendarEventColorInput'),
    document.getElementById('calendarEventLeadTimeInput'),
    document.getElementById('calendarEventStatusInput'),
    document.getElementById('calendarEventStartInput'),
    document.getElementById('calendarEventEndInput'),
    document.getElementById('calendarEventNotesInput'),
    document.getElementById('calendarEventUserInput')
  ];
  fields.forEach(field => {
    if (field) field.disabled = isReadOnly;
  });
  populateCalendarUserSelect(selectedItem?.assignedUserId || '');
  if (isReadOnly) {
    document.getElementById('calendarEventUserInput').value = '';
  } else if (selectedItem?.assignedUserId) {
    document.getElementById('calendarEventUserInput').value = selectedItem.assignedUserId;
  }
  openModal('calendarEventModal');
};

window.saveCalendarEvent = function (event) {
  event.preventDefault();
  const id = document.getElementById('calendarEventIdInput').value;
  const title = document.getElementById('calendarEventTitleInput').value.trim();
  const date = document.getElementById('calendarEventDateInput').value;
  const category = document.getElementById('calendarEventTypeInput').value || 'Aviso Geral';
  const color = document.getElementById('calendarEventColorInput').value || 'blue';
  const leadTimeDays = parseInt(document.getElementById('calendarEventLeadTimeInput').value || '3', 10);
  const status = document.getElementById('calendarEventStatusInput').value || 'planeado';
  const assignedUserId = document.getElementById('calendarEventUserInput').value;
  const assignedUser = window.db.getAdminUsers().find(user => user.id === assignedUserId);
  if (!title || !date) return;
  window.db.saveCalendarEvent({
    id: id || undefined,
    title,
    date,
    eventType: category,
    category,
    color,
    leadTimeDays,
    status,
    assignedUserId,
    assignedUserName: assignedUser?.name || '',
    startTime: document.getElementById('calendarEventStartInput').value,
    endTime: document.getElementById('calendarEventEndInput').value,
    notes: document.getElementById('calendarEventNotesInput').value.trim()
  });
  closeModal('calendarEventModal');
  renderSharedCalendar();
  if (typeof renderAgendaTopicsBar === 'function') {
    renderAgendaTopicsBar(aoVivoSelectedDate, true);
    renderAgendaTopicsBar(editorialSelectedDate, false);
  }
};

window.deleteOpenCalendarEvent = function () {
  const id = document.getElementById('calendarEventIdInput').value;
  if (id && confirm('Eliminar este evento do calendário partilhado?')) {
    window.db.deleteCalendarEvent(id);
    closeModal('calendarEventModal');
    renderSharedCalendar();
  }
};
/* ==========================================================================
   GESTÃO DE UTILIZADORES & MATRIZ DE PERMISSÕES (GOOGLE WORKSPACE STYLE)
   ========================================================================== */
let activeUserRoleFilter = 'all';
let userSearchQuery = '';

window.filterUsersByRole = function (roleKey) {
  activeUserRoleFilter = roleKey;
  document.querySelectorAll('.rbac-filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.role === roleKey);
  });
  renderAdminUsersTable();
};

window.filterAdminUsersTable = function () {
  const input = document.getElementById('userSearchInput');
  userSearchQuery = input ? input.value.trim().toLowerCase() : '';
  renderAdminUsersTable();
};

function renderAdminUsersTable() {
  const tbody = document.getElementById('adminUsersTbody');
  if (!tbody) return;

  const users = window.db.getAdminUsers();

  // Atualizar contadores de estatísticas RBAC
  const statTotal = document.getElementById('statTotalUsers');
  const statAdmins = document.getElementById('statSuperAdmins');
  const statLocutores = document.getElementById('statBroadcasters');
  const statCustom = document.getElementById('statCustomRoles');

  if (statTotal) statTotal.textContent = users.length;
  if (statAdmins) statAdmins.textContent = users.filter(u => u.roleKey === 'super_admin').length;
  if (statLocutores) statLocutores.textContent = users.filter(u => u.roleKey === 'broadcaster').length;
  if (statCustom) statCustom.textContent = users.filter(u => u.roleKey !== 'super_admin' && u.roleKey !== 'broadcaster').length;

  // Filtragem
  let filtered = users;
  if (activeUserRoleFilter !== 'all') {
    filtered = filtered.filter(u => u.roleKey === activeUserRoleFilter);
  }
  if (userSearchQuery) {
    filtered = filtered.filter(u =>
      (u.name && u.name.toLowerCase().includes(userSearchQuery)) ||
      (u.email && u.email.toLowerCase().includes(userSearchQuery)) ||
      (u.position && u.position.toLowerCase().includes(userSearchQuery))
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="admin-empty-cell" style="text-align: center; padding: 2.5rem !important;">
          <i class="ri-team-line" style="font-size: 2rem; color: #a78bfa; margin-bottom: 0.5rem; display: inline-block;"></i>
          <p style="margin: 0; font-weight: 500;">Nenhum membro encontrado com os filtros selecionados.</p>
          <small style="color: var(--text-muted);">Clica em "+ Novo Utilizador" para adicionar um membro à equipa.</small>
        </td>
      </tr>
    `;
    return;
  }

  const currentEmail = (window.currentUserProfile?.email || '').toLowerCase();

  tbody.innerHTML = filtered.map(user => {
    const isSelf = user.email && user.email.toLowerCase() === currentEmail;
    const initials = (user.name || 'Admin').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'AD';
    const preset = ROLE_PRESETS[user.roleKey] || ROLE_PRESETS.super_admin;
    const isSuspended = user.status === 'suspended';

    // Resumo de permissões ativas
    let permsSummaryHtml = '';
    if (user.roleKey === 'super_admin') {
      permsSummaryHtml = '<span class="rbac-perm-chip perm-chip-full"><i class="ri-sparkling-fill"></i> Acesso Total (13)</span>';
    } else {
      const activeCount = Object.values(user.permissions || {}).filter(Boolean).length;
      const chips = [];
      if (user.permissions?.access_aovivo) chips.push('📻 Ao Vivo');
      if (user.permissions?.manage_rundowns) chips.push('📄 Guiões');
      if (user.permissions?.manage_songs) chips.push('🎵 Músicas');
      if (user.permissions?.manage_podcasts) chips.push('🎙️ Podcasts');
      if (user.permissions?.manage_messages) chips.push('💬 Mensagens');
      if (user.permissions?.manage_calendar) chips.push('🗓️ Agenda');
      if (user.permissions?.manage_tasks) chips.push('📋 Tarefas');
      if (user.permissions?.manage_polls) chips.push('🗳️ Votações');
      if (user.permissions?.manage_users) chips.push('🛡️ Utilizadores');

      if (chips.length === 0) {
        permsSummaryHtml = '<span class="rbac-perm-chip perm-chip-none">Sem permissões</span>';
      } else {
        const displayChips = chips.slice(0, 3).map(c => `<span class="rbac-perm-chip">${c}</span>`).join('');
        const extra = chips.length > 3 ? `<span class="rbac-perm-chip perm-chip-more">+${chips.length - 3}</span>` : '';
        permsSummaryHtml = `<div style="display: flex; gap: 0.3rem; flex-wrap: wrap; align-items: center;">${displayChips}${extra} <small style="color: var(--text-muted); font-size: 0.72rem;">(${activeCount}/13)</small></div>`;
      }
    }

    return `
      <tr class="${isSuspended ? 'row-suspended' : ''}">
        <td>
          <div class="rbac-user-cell">
            <div class="rbac-avatar avatar-bg-${user.avatarColor || 'indigo'}">${escapeHtml(initials)}</div>
            <div class="rbac-user-details">
              <strong>${escapeHtml(user.name)} ${isSelf ? '<span class="badge" style="font-size: 0.65rem; background: rgba(59,130,246,0.2); color: #60a5fa;">Tu</span>' : ''}</strong>
              <small>${escapeHtml(user.position || 'Membro da Equipa')}</small>
            </div>
          </div>
        </td>
        <td>
          <div style="display: flex; flex-direction: column;">
            <a href="mailto:${escapeHtml(user.email)}" class="rbac-email-link"><i class="ri-mail-line"></i> ${escapeHtml(user.email || 'Sem email')}</a>
            <small style="color: var(--text-muted); font-size: 0.72rem; margin-top: 0.15rem;">ID: ${escapeHtml(user.id)}</small>
          </div>
        </td>
        <td>
          <span class="role-badge ${preset.badgeClass}">
            <i class="${preset.icon}"></i> ${escapeHtml(user.roleTitle || preset.title)}
          </span>
        </td>
        <td>${permsSummaryHtml}</td>
        <td>
          <span class="rbac-status-badge ${isSuspended ? 'status-suspended' : 'status-active'}">
            ${isSuspended ? '<i class="ri-pause-circle-line"></i> Suspensa' : '<i class="ri-checkbox-circle-line"></i> Ativa'}
          </span>
        </td>
        <td style="text-align: right;">
          <div class="table-actions" style="justify-content: flex-end;">
            <button class="btn-action" onclick="openUserModal('${escapeHtml(user.id)}')" title="Editar dados e permissões">
              <i class="ri-edit-line"></i> Editar
            </button>
            ${!isSelf ? `
              <button class="btn-action ${isSuspended ? 'success-action' : 'warning-action'}" onclick="toggleUserStatus('${escapeHtml(user.id)}')" title="${isSuspended ? 'Reativar conta' : 'Suspender acesso'}">
                <i class="${isSuspended ? 'ri-play-circle-line' : 'ri-pause-circle-line'}"></i>
              </button>
              <button class="btn-action danger-action" onclick="deleteAdminUserItem('${escapeHtml(user.id)}')" title="Eliminar utilizador">
                <i class="ri-delete-bin-line"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.openUserModal = function (id = '') {
  const user = id ? window.db.getAdminUsers().find(item => item.id === id) : null;
  const form = document.getElementById('adminUserForm');
  form.reset();

  const isEditing = Boolean(user);
  const currentEmail = (window.currentUserProfile?.email || '').toLowerCase();
  const isSelf = isEditing && user.email && user.email.toLowerCase() === currentEmail;

  document.getElementById('adminUserIdInput').value = user?.id || '';
  document.getElementById('adminUserNameInput').value = user?.name || '';
  document.getElementById('adminUserPositionInput').value = user?.position || '';
  document.getElementById('adminUserEmailInput').value = user?.email || '';
  document.getElementById('adminUserAvatarColorInput').value = user?.avatarColor || 'indigo';
  document.getElementById('adminUserStatusInput').value = user?.status || 'active';
  document.getElementById('adminUserPasswordInput').value = '';

  const roleSelect = document.getElementById('adminUserRoleSelect');
  const initialRoleKey = user?.roleKey || (user?.role === 'Administrador' ? 'super_admin' : (user?.role || 'super_admin'));
  roleSelect.value = initialRoleKey;

  document.getElementById('adminUserModalTitle').textContent = isEditing ? `Editar: ${user.name}` : 'Novo Utilizador da Equipa';
  document.getElementById('adminUserPasswordHint').textContent = isEditing ? '(deixa em branco para manter a atual)' : '(mínimo 8 caracteres)';

  const deleteBtn = document.getElementById('adminUserDeleteBtn');
  if (deleteBtn) {
    deleteBtn.style.display = isEditing && !isSelf ? 'inline-flex' : 'none';
  }

  // Preencher matriz de permissões
  if (isEditing && user.permissions) {
    ALL_PERMISSIONS.forEach(permKey => {
      const chk = document.getElementById(`perm_${permKey}`);
      if (chk) chk.checked = Boolean(user.permissions[permKey]);
    });
  } else {
    // Aplicar preset padrão (super_admin para nova conta ou preset correspondente)
    const preset = ROLE_PRESETS[initialRoleKey] || ROLE_PRESETS.super_admin;
    ALL_PERMISSIONS.forEach(permKey => {
      const chk = document.getElementById(`perm_${permKey}`);
      if (chk) chk.checked = Boolean(preset.permissions[permKey]);
    });
  }

  updateRoleDescriptionText(initialRoleKey);
  openModal('adminUserModal');
};

function updateRoleDescriptionText(roleKey) {
  const descEl = document.getElementById('adminUserRoleDescText');
  if (!descEl) return;
  const preset = ROLE_PRESETS[roleKey] || ROLE_PRESETS.custom;
  descEl.textContent = preset.description;
}

window.onAdminUserRolePresetChange = function (roleKey) {
  updateRoleDescriptionText(roleKey);

  if (roleKey !== 'custom') {
    const preset = ROLE_PRESETS[roleKey];
    if (preset) {
      ALL_PERMISSIONS.forEach(permKey => {
        const chk = document.getElementById(`perm_${permKey}`);
        if (chk) chk.checked = Boolean(preset.permissions[permKey]);
      });
    }
  }
};

window.onPermissionCheckboxChange = function () {
  const roleSelect = document.getElementById('adminUserRoleSelect');
  if (roleSelect && roleSelect.value !== 'custom') {
    // Se o admin alterar checkboxes manualmente, marca como Perfil Personalizado
    roleSelect.value = 'custom';
    updateRoleDescriptionText('custom');
  }
};

window.toggleAllPermissions = function (checked) {
  ALL_PERMISSIONS.forEach(permKey => {
    const chk = document.getElementById(`perm_${permKey}`);
    if (chk) chk.checked = checked;
  });
  const roleSelect = document.getElementById('adminUserRoleSelect');
  if (roleSelect) {
    roleSelect.value = checked ? 'super_admin' : 'custom';
    updateRoleDescriptionText(roleSelect.value);
  }
};

window.saveAdminUser = function (event) {
  event.preventDefault();
  const id = document.getElementById('adminUserIdInput').value;
  const name = document.getElementById('adminUserNameInput').value.trim();
  const position = document.getElementById('adminUserPositionInput').value.trim();
  const email = document.getElementById('adminUserEmailInput').value.trim();
  const avatarColor = document.getElementById('adminUserAvatarColorInput').value;
  const status = document.getElementById('adminUserStatusInput').value;
  const roleKey = document.getElementById('adminUserRoleSelect').value;
  const rolePreset = ROLE_PRESETS[roleKey] || ROLE_PRESETS.custom;
  const roleTitle = rolePreset.title;

  if (!name || !email) return;

  // Construir mapa de permissões modulares
  const permissions = {};
  ALL_PERMISSIONS.forEach(permKey => {
    const chk = document.getElementById(`perm_${permKey}`);
    permissions[permKey] = chk ? chk.checked : false;
  });

  const userData = {
    id: id || undefined,
    name,
    position: position || 'Membro da Equipa',
    email,
    avatarColor,
    status,
    roleKey,
    roleTitle,
    permissions
  };

  const saved = window.db.saveAdminUser(userData);

  // Se o utilizador editado for o utilizador atual, atualizar a sessão
  if (window.currentUserProfile && window.currentUserProfile.email && window.currentUserProfile.email.toLowerCase() === email.toLowerCase()) {
    window.currentUserProfile = { ...window.currentUserProfile, ...saved };
    window.applyUserPermissionsToUI();
  }

  closeModal('adminUserModal');
  renderAdminUsersTable();
  if (typeof populateCalendarUserSelect === 'function') populateCalendarUserSelect();
  showToast(id ? 'Perfil e permissões do membro atualizados!' : 'Novo membro registado com sucesso!', 'success');
};

window.toggleUserStatus = function (id) {
  const user = window.db.getAdminUsers().find(u => u.id === id);
  if (!user) return;

  const currentEmail = (window.currentUserProfile?.email || '').toLowerCase();
  if (user.email && user.email.toLowerCase() === currentEmail) {
    showToast('Não podes suspender a tua própria conta em sessão.', 'warning');
    return;
  }

  const nextStatus = user.status === 'suspended' ? 'active' : 'suspended';
  const actionText = nextStatus === 'suspended' ? 'suspender o acesso deste membro' : 'reativar a conta deste membro';

  if (confirm(`Tens a certeza de que pretendes ${actionText}?`)) {
    window.db.updateAdminUserStatus(id, nextStatus);
    renderAdminUsersTable();
    showToast(nextStatus === 'suspended' ? 'Acesso do membro suspenso.' : 'Conta do membro reativada.', 'info');
  }
};

window.deleteOpenAdminUser = function () {
  const id = document.getElementById('adminUserIdInput').value;
  if (!id) return;
  deleteAdminUserItem(id);
  closeModal('adminUserModal');
};

window.deleteAdminUserItem = function (id) {
  const user = window.db.getAdminUsers().find(u => u.id === id);
  const currentEmail = (window.currentUserProfile?.email || '').toLowerCase();
  if (user && user.email && user.email.toLowerCase() === currentEmail) {
    showToast('Não podes eliminar a tua própria conta em sessão.', 'warning');
    return;
  }

  if (confirm('Eliminar esta conta de utilizador permanentemente? Os eventos e registos históricos existentes mantêm o nome associado.')) {
    window.db.deleteAdminUser(id);
    renderAdminUsersTable();
    if (typeof populateCalendarUserSelect === 'function') populateCalendarUserSelect();
    showToast('Conta de utilizador eliminada com sucesso.', 'info');
  }
};

document.addEventListener('radio-db-updated', event => {
  if (!adminDashboardReady) return;
  const collection = event.detail?.collection;
  if (collection === 'calendarEvents') { renderSharedCalendar(); renderAdminOverview(); }
  if (collection === 'adminUsers') { renderAdminUsersTable(); renderSharedCalendar(); renderAdminOverview(); }
  if (collection === 'rundowns') {
    if (typeof loadAoVivoDailyScript === 'function') loadAoVivoDailyScript();
    if (typeof renderEditorialDailyScript === 'function') renderEditorialDailyScript();
  }
  if (collection === 'teamMemos') { renderTeamMemos(); }
  if (collection === 'announcements' || collection === 'messages') {
    renderAdminOverview();
    renderAdminMessagesTable();
    updateKPIs();
  }
  if (collection === 'suggestions') {
    renderSongRankingTable();
    if (typeof renderAoVivoSongs === 'function') renderAoVivoSongs(currentAoVivoSongFilter);
    updateKPIs();
  }
});
/* ===========================================================================
   CENTRO DE OPERAÇÕES: BRIEFING DIÁRIO E SEMANAL
   =========================================================================== */
function parseLocalDate(dateValue) {
  if (!dateValue) return null;
  if (dateValue instanceof Date) return Number.isNaN(dateValue.getTime()) ? null : dateValue;
  if (typeof dateValue === 'number') {
    const parsed = new Date(dateValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof dateValue === 'string') {
    const value = dateValue.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day);
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function isSameLocalDay(dateValue, compareDate = new Date()) {
  const parsed = parseLocalDate(dateValue);
  if (!parsed) return false;
  return parsed.getFullYear() === compareDate.getFullYear()
    && parsed.getMonth() === compareDate.getMonth()
    && parsed.getDate() === compareDate.getDate();
}

function buildTodayRelevantItems() {
  const today = new Date();
  const todayKey = localDateKey(today);
  const items = [];

  window.db.getCalendarEvents().filter(item => item.date === todayKey).forEach(item => {
    items.push({
      date: parseLocalDate(item.date) || today,
      title: item.title,
      type: item.category || (item.source === 'editorial' ? 'Efeméride' : 'Agenda'),
      time: item.startTime || 'Todo o dia',
      notes: item.notes || item.assignedUserName || 'Sem notas adicionais.',
      source: 'calendar'
    });
  });

  window.db.getInternalAnnouncements().filter(item => {
    return (item.createdAt && isSameLocalDay(item.createdAt, today)) || (typeof item.date === 'string' && isSameLocalDay(item.date, today)) || (item.broadcastDate && item.broadcastDate === localDateKey(today));
  }).forEach(item => {
    items.push({
      date: parseLocalDate(item.date) || parseLocalDate(item.createdAt) || today,
      title: item.title,
      type: item.category || item.tag || 'Notícia',
      time: 'Novo',
      notes: item.excerpt || 'Novo conteúdo publicado para hoje.',
      source: 'announcement'
    });
  });

  window.db.getPodcasts().filter(item => {
    return (item.createdAt && isSameLocalDay(item.createdAt, today)) || (typeof item.date === 'string' && isSameLocalDay(item.date, today));
  }).forEach(item => {
    items.push({
      date: parseLocalDate(item.date) || parseLocalDate(item.createdAt) || today,
      title: item.title,
      type: 'Podcast',
      time: item.duration || 'Episódio',
      notes: item.description || 'Episódio novo disponível.',
      source: 'podcast'
    });
  });

  window.db.getMessages().filter(item => item.createdAt && isSameLocalDay(item.createdAt, today)).forEach(item => {
    items.push({
      date: parseLocalDate(item.createdAt) || today,
      title: item.name || 'Mensagem da comunidade',
      type: 'Comunidade',
      time: new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.createdAt)),
      notes: item.message || 'Mensagem recebida.',
      source: 'message'
    });
  });

  return items.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function renderAdminOverview() {
  const greeting = document.getElementById('dailyGreeting');
  if (!greeting) return;
  const now = new Date();
  const today = localDateKey(now);
  const hour = now.getHours();
  greeting.textContent = hour < 12 ? 'Bom dia, equipa.' : hour < 19 ? 'Boa tarde, equipa.' : 'Boa noite, equipa.';
  document.getElementById('dailyDateLabel').textContent = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);

  const calendarEvents = window.db.getCalendarEvents();
  const relevantToday = buildTodayRelevantItems();
  const todayCount = document.getElementById('todayEventsCount');
  if (todayCount) todayCount.textContent = relevantToday.length;
  const todayList = document.getElementById('todayEventsList');
  todayList.innerHTML = relevantToday.length ? relevantToday.map(item => `<div class="brief-timeline-item"><span class="brief-timeline-time">${escapeHtml(item.time || 'Hoje')}</span><div><span class="brief-event-type">${escapeHtml(item.type)}</span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.notes || 'Sem notas adicionais.')}</p></div></div>`).join('') : '<div class="brief-empty"><i class="ri-sun-line"></i><strong>Dia livre na agenda</strong><span>Podes preparar a emissão ou criar um aviso.</span></div>';

  const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + (7 - ((now.getDay() + 6) % 7) - 1));
  const endKey = localDateKey(weekEnd);
  const weekEvents = calendarEvents.filter(item => item.date >= today && item.date <= endKey).slice(0, 7);
  const weekList = document.getElementById('weekEventsList');
  weekList.innerHTML = weekEvents.length ? weekEvents.map(item => `<button class="brief-week-item" onclick="openCalendarEventModal('${item.readOnly ? '' : item.id}', '${item.date}')"><span>${new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: 'numeric' }).format(parseLocalDate(item.date) || new Date(`${item.date}T00:00`)).replace('.', '')}</span><strong>${escapeHtml(item.title)}</strong><i class="ri-arrow-right-s-line"></i></button>`).join('') : '<div class="brief-empty"><i class="ri-calendar-check-line"></i><strong>Semana sem compromissos</strong><span>Adiciona eventos ao calendário partilhado.</span></div>';

  const onAirNotes = window.db.getInternalAnnouncements().filter(item => item.broadcastDate === today || (item.onAir === true && item.broadcastDate === today));
  const onAirList = document.getElementById('onAirNotesList');
  onAirList.innerHTML = onAirNotes.length ? onAirNotes.map(item => `
    <div class="brief-onair-item" onclick="openAoVivoPrompter('${escapeHtml(item.id)}')">
      <i class="ri-mic-fill" style="color: #f43f5e;"></i>
      <span>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.excerpt || item.category || 'Clique para abrir no Teleprompter')}</small>
      </span>
      <button class="brief-prompter-launch-btn" title="Ler no Teleprompter" onclick="event.stopPropagation(); openAoVivoPrompter('${escapeHtml(item.id)}')"><i class="ri-fullscreen-line"></i></button>
    </div>
  `).join('') : '<div class="brief-empty brief-empty-compact"><i class="ri-mic-2-line"></i><strong>Sem avisos preparados</strong><span>Prepara um aviso rápido para ler hoje.</span></div>';

  const messages = window.db.getMessages().slice(0, 3);
  const messagesList = document.getElementById('briefMessagesList');
  messagesList.innerHTML = messages.length ? messages.map(item => `<div class="brief-message"><span class="brief-message-avatar">${escapeHtml((item.name || '?').slice(0, 1).toUpperCase())}</span><p><strong>${escapeHtml(item.name || 'Anónimo')}</strong>${escapeHtml(item.message || '')}</p><span class="${item.status === 'unread' ? 'brief-unread-dot' : ''}"></span></div>`).join('') : '<div class="brief-empty brief-empty-compact"><i class="ri-chat-1-line"></i><strong>Sem mensagens novas</strong></div>';

  const highlights = calendarEvents.filter(item => item.source === 'editorial' && item.date >= today).slice(0, 4);
  const highlightsList = document.getElementById('editorialHighlightsList');
  highlightsList.innerHTML = highlights.map(item => `<button class="editorial-highlight" onclick="openDailyBriefEditor('${item.date}')"><span>${new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' }).format(parseLocalDate(item.date) || new Date(`${item.date}T00:00`)).replace('.', '')}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.category)}</small></div><i class="ri-quill-pen-line"></i></button>`).join('') || '<div class="brief-empty brief-empty-compact"><i class="ri-star-smile-line"></i><strong>Sem efemérides próximas</strong></div>';

  renderTeamMemos();
}

window.openDailyBriefEditor = function (date = localDateKey(new Date())) {
  window.location.href = `admin-editor.html?brief=${encodeURIComponent(date)}`;
};

/* ==========================================================================
   NAVEGAÇÃO EDITORIAL & MODO AO VIVO
   ========================================================================== */
let currentAdminMode = 'editorial';
let currentAoVivoSongFilter = 'pending';

window.switchAdminMode = function (mode) {
  if (mode === 'aovivo' && !window.hasPermission('access_aovivo')) {
    alert('Acesso Restrito: A tua conta não tem permissão para aceder ao Cockpit de Estúdio Ao Vivo.');
    return;
  }

  currentAdminMode = mode;
  const zoneEditorial = document.getElementById('zoneEditorial');
  const zoneAoVivo = document.getElementById('zoneAoVivo');
  const btnEditorial = document.getElementById('btnModeEditorial');
  const btnAoVivo = document.getElementById('btnModeAoVivo');

  document.querySelectorAll('.aovivo-capsule-btn').forEach(btn => {
    const isLive = btn.textContent.includes('Ao Vivo');
    btn.classList.toggle('active', mode === 'aovivo' ? isLive : !isLive);
  });

  if (mode === 'aovivo') {
    if (zoneEditorial) {
      zoneEditorial.style.animation = 'fadeOut 0.2s ease forwards';
      setTimeout(() => { zoneEditorial.style.display = 'none'; zoneEditorial.style.animation = ''; }, 200);
    }
    if (zoneAoVivo) {
      zoneAoVivo.style.display = 'flex';
      zoneAoVivo.style.animation = 'fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    }
    if (btnEditorial) {
      btnEditorial.classList.remove('active');
      btnEditorial.setAttribute('aria-selected', 'false');
    }
    if (btnAoVivo) {
      btnAoVivo.classList.add('active');
      btnAoVivo.setAttribute('aria-selected', 'true');
    }
    renderAoVivo();
  } else {
    if (zoneEditorial) {
      zoneEditorial.style.display = 'flex';
      zoneEditorial.style.animation = 'fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    }
    if (zoneAoVivo) {
      zoneAoVivo.style.animation = 'fadeOut 0.2s ease forwards';
      setTimeout(() => { zoneAoVivo.style.display = 'none'; zoneAoVivo.style.animation = ''; }, 200);
    }
    if (btnEditorial) {
      btnEditorial.classList.add('active');
      btnEditorial.setAttribute('aria-selected', 'true');
    }
    if (btnAoVivo) {
      btnAoVivo.classList.remove('active');
      btnAoVivo.setAttribute('aria-selected', 'false');
    }
  }
};

window.switchAdminSection = function (target) {
  const SECTION_PERMISSIONS = {
    'sec-guioes': 'manage_rundowns',
    'sec-musicas': 'manage_songs',
    'sec-mensagens': 'manage_messages',
    'sec-calendario': 'manage_calendar',
    'sec-anuncios': 'manage_announcements',
    'sec-podcasts': 'manage_podcasts',
    'sec-links': 'manage_links',
    'sec-tarefas': 'manage_tasks',
    'sec-votacoes': 'manage_polls',
    'sec-utilizadores': 'manage_users'
  };

  const reqPerm = SECTION_PERMISSIONS[target];
  if (reqPerm && !window.hasPermission(reqPerm)) {
    alert('Acesso Restrito: A tua conta não tem permissão para aceder a esta secção.');
    return;
  }

  document.querySelectorAll('.sidebar-nav-item').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.target === target);
  });
  document.querySelectorAll('.admin-section').forEach(section => {
    if (section.id === target) {
      section.style.display = 'block';
      section.style.animation = 'fadeInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    } else {
      section.style.display = 'none';
      section.style.animation = '';
    }
  });
  if (target === 'sec-resumo') { renderAdminOverview(); renderTeamMemos(); }
  if (target === 'sec-guioes') renderEditorialDailyScript();
  if (target === 'sec-calendario') {
    // Initialize Google Calendar on first open, then just re-render
    if (typeof GCal !== 'undefined') {
      window.CALENDAR_CATEGORY_COLORS = CALENDAR_CATEGORY_COLORS;
      GCal.render();
    }
  }
  if (target === 'sec-musicas') renderSongRankingTable();
  if (target === 'sec-mensagens') renderAdminMessagesTable();
  if (target === 'sec-links') renderAdminLinksTable();
  if (target === 'sec-podcasts') renderAdminPodcastsTable();
  if (target === 'sec-anuncios') renderAdminAnnouncementsTable();
  if (target === 'sec-utilizadores') renderAdminUsersTable();
  if (target === 'sec-tarefas') renderTasksView();
  if (target === 'sec-votacoes') renderAdminPollsTable();
};


/* ==========================================================================
   CONSOLA DE EMISSÃO AO VIVO (STUDIO BROADCASTER COMPANION)
   Guião Word/Notion por dia + Músicas Pedidas + Relógio de Estúdio
   ========================================================================== */
let aoVivoClockTimer = null;
let aoVivoSelectedDate = localDateKey(new Date());
let aoVivoFontSize = 16; // px
let aoVivoSaveDebounceTimer = null;
let lastAoVivoClockMinute = -1;

function initAoVivoClock() {
  updateAoVivoClock();
  if (!aoVivoClockTimer) {
    aoVivoClockTimer = setInterval(updateAoVivoClock, 1000);
  }
}

function updateAoVivoClock() {
  const clockEl = document.getElementById('aoVivoClock');
  const dateEl = document.getElementById('aoVivoDate');
  const now = new Date();

  if (clockEl) {
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    clockEl.textContent = `${hours}:${minutes}:${seconds}`;
  }

  if (dateEl) {
    dateEl.textContent = new Intl.DateTimeFormat('pt-PT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(now);
  }

  const currentMinute = now.getMinutes();
  const readerDisplay = document.getElementById('aoVivoScriptDisplay');
  const rawContent = readerDisplay && readerDisplay.dataset.rawContent ? readerDisplay.dataset.rawContent : '';

  // Re-render script tags only when minute changes to optimize CPU/DOM
  if (rawContent && /\[hora\]|xx:xx/i.test(rawContent) && currentMinute !== lastAoVivoClockMinute) {
    lastAoVivoClockMinute = currentMinute;
    readerDisplay.style.fontSize = `${aoVivoFontSize}px`;
    const readIndexes = Array.from(readerDisplay.querySelectorAll('.guiao-item-live.is-read')).map((node) => {
      const parent = node.parentElement;
      return Array.from(parent.children).indexOf(node);
    });

    readerDisplay.innerHTML = formatScriptForAoVivoReading(rawContent);

    const refreshedItems = readerDisplay.querySelectorAll('.guiao-item-live');
    readIndexes.forEach((index) => {
      if (refreshedItems[index]) {
        refreshedItems[index].classList.add('is-read');
      }
    });
  }
}

// Fullscreen toggle for laptop cockpit
window.toggleAoVivoFullscreen = function () {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => { });
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
};

// Main Ao Vivo Renderer
function renderAoVivo() {
  initAoVivoClock();
  const datePicker = document.getElementById('aoVivoDatePicker');
  if (datePicker) {
    datePicker.value = aoVivoSelectedDate;
  }
  loadAoVivoDailyScript();
  renderAoVivoSongs(currentAoVivoSongFilter);
}

// Date navigation: Past, Today, Future
window.changeAoVivoDate = function (deltaDays) {
  const parts = aoVivoSelectedDate.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + deltaDays);
  aoVivoSelectedDate = localDateKey(d);

  const datePicker = document.getElementById('aoVivoDatePicker');
  if (datePicker) datePicker.value = aoVivoSelectedDate;
  loadAoVivoDailyScript();
};

window.setAoVivoDateToday = function () {
  aoVivoSelectedDate = localDateKey(new Date());
  const datePicker = document.getElementById('aoVivoDatePicker');
  if (datePicker) datePicker.value = aoVivoSelectedDate;
  loadAoVivoDailyScript();
};

window.onAoVivoDatePickerChange = function (newDate) {
  if (!newDate) return;
  aoVivoSelectedDate = newDate;
  loadAoVivoDailyScript();
};

// ==========================================================================
// AGENDA TOPICS ENGINE: AUTO-GENERATE & SUGGEST FROM CALENDAR BY LEAD TIME
// ==========================================================================
function getDaysDifference(fromDateStr, toDateStr) {
  if (!fromDateStr || !toDateStr) return 999;
  const [y1, m1, d1] = fromDateStr.split('-').map(Number);
  const [y2, m2, d2] = toDateStr.split('-').map(Number);
  const date1 = new Date(y1, m1 - 1, d1);
  const date2 = new Date(y2, m2 - 1, d2);
  const diffTime = date2.getTime() - date1.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

function formatDateShort(dateKey) {
  try {
    const [y, m, d] = dateKey.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' }).format(date);
  } catch (e) {
    return dateKey;
  }
}

function getCalendarTopicsForDate(dateKey) {
  const events = window.db.getCalendarEvents();
  const relevantTopics = [];

  events.forEach(item => {
    if (!item.date || !item.title) return;
    const diffDays = getDaysDifference(dateKey, item.date);
    const leadTime = parseInt(item.leadTimeDays ?? item.leadTime ?? 3, 10);

    // An event is relevant if it happens today (diffDays === 0) 
    // OR if it's in the future and within the lead time window (diffDays > 0 && diffDays <= leadTime)
    if (diffDays >= 0 && diffDays <= leadTime) {
      const catConfig = CALENDAR_CATEGORY_COLORS[item.category || item.eventType] || { color: item.color || 'blue', hex: '#38bdf8', icon: 'ri-calendar-event-line' };
      const colorKey = item.color || catConfig.color || 'blue';

      let timingLabel = '';
      let timingTag = '';
      if (diffDays === 0) {
        timingLabel = 'Hoje' + (item.startTime ? ` às ${item.startTime}` : '');
        timingTag = 'Hoje';
      } else if (diffDays === 1) {
        timingLabel = 'Amanhã' + (item.startTime ? ` às ${item.startTime}` : '');
        timingTag = 'Amanhã';
      } else {
        const dateFormatted = formatDateShort(item.date);
        timingLabel = `Em ${diffDays} dias (${dateFormatted})`;
        timingTag = `Em ${diffDays}d`;
      }

      const categoryName = item.category || item.eventType || 'Aviso';
      const bulletText = `• [${categoryName}] ${item.title} (${timingLabel})${item.notes ? ` — ${item.notes}` : ''}`;

      relevantTopics.push({
        id: item.id,
        title: item.title,
        category: categoryName,
        color: colorKey,
        diffDays,
        timingLabel,
        timingTag,
        bulletText,
        notes: item.notes || '',
        startTime: item.startTime || ''
      });
    }
  });

  // Sort: today first (0), then tomorrow (1), etc.
  relevantTopics.sort((a, b) => a.diffDays - b.diffDays);
  return relevantTopics;
}

function generateDefaultScriptTemplate(dateKey) {
  const topics = getCalendarTopicsForDate(dateKey);

  // Format date human readable (e.g., Segunda-feira, 15 de Setembro)
  let formattedDateStr = dateKey;
  let weekdayStr = 'Terça-feira';
  try {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    formattedDateStr = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long' }).format(dateObj);
    const rawWeekday = new Intl.DateTimeFormat('pt-PT', { weekday: 'long' }).format(dateObj);
    weekdayStr = rawWeekday.charAt(0).toUpperCase() + rawWeekday.slice(1);
  } catch (e) { }

  // Explicit category classification:
  // Eventos: Efeméride & Comemoração, Emissão Especial, Clubes & Desporto, Reunião / Produção, ou eventos sem categoria de aviso
  // Avisos: Direção & Escola, Associação de Estudantes, Aviso Geral
  const isNoticeCategory = (cat) => {
    return cat === 'Direção & Escola' || cat === 'Associação de Estudantes' || cat === 'Aviso Geral' || cat === 'Aviso';
  };

  const eventsTopics = topics.filter(t => !isNoticeCategory(t.category));
  const noticesTopics = topics.filter(t => isNoticeCategory(t.category));

  const eventsLines = eventsTopics.length > 0
    ? eventsTopics.map(t => `- ${t.title}${t.notes ? `: ${t.notes}` : ''}`).join('\n')
    : 'Sem eventos hoje';

  const noticesLines = noticesTopics.length > 0
    ? noticesTopics.map(t => `- ${t.title}${t.notes ? `: ${t.notes}` : ''}`).join('\n')
    : 'Sem avisos hoje';

  return `[Inicio da Emissão]
- Bom dia Cidadela! São xx:xx, ${weekdayStr}, ${formattedDateStr}

[Eventos]
${eventsLines}

[Avisos]
${noticesLines}

[Musica Começa]`;
}

function renderAgendaTopicsBar(dateKey, isAoVivo = false) {
  const chipsContainer = document.getElementById(isAoVivo ? 'aoVivoAgendaChips' : 'editorialAgendaChips');
  if (!chipsContainer) return;

  const topics = getCalendarTopicsForDate(dateKey);
  const countEl = document.getElementById('editorialAlertCount');

  if (countEl) {
    countEl.textContent = topics.length > 0 ? `${topics.length} ${topics.length === 1 ? 'item' : 'itens'}` : 'Nenhum aviso';
  }

  if (topics.length === 0) {
    chipsContainer.innerHTML = '<span style="font-size: 0.76rem; color: var(--text-muted); font-style: italic;">Nenhum evento do calendário agendado com aviso para este dia.</span>';
    return;
  }

  chipsContainer.innerHTML = topics.map((t, idx) => `
    <div class="agenda-topic-chip chip-${escapeHtml(t.color)}" onclick="insertSingleTopicToScript(${idx}, ${isAoVivo})" title="Clica para inserir este tópico no cursor do guião">
      <span class="chip-tag">${escapeHtml(t.category)}</span>
      <span>${escapeHtml(t.title)}</span>
      <span class="chip-timing"><i class="ri-time-line"></i> ${escapeHtml(t.timingTag)}</span>
    </div>
  `).join('');
}

window.insertSingleTopicToScript = function (topicIndex, isAoVivo = false) {
  const dateKey = isAoVivo ? aoVivoSelectedDate : editorialSelectedDate;
  const topics = getCalendarTopicsForDate(dateKey);
  const topic = topics[topicIndex];
  if (!topic) return;

  const textareaId = isAoVivo ? 'aoVivoScriptContent' : 'editorialScriptContent';
  const textarea = document.getElementById(textareaId);
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const before = text.substring(0, start);
  const after = text.substring(end);

  const needsNewline = before.length > 0 && !before.endsWith('\n');
  const insertion = (needsNewline ? '\n' : '') + topic.bulletText + '\n';

  textarea.value = before + insertion + after;
  textarea.selectionStart = textarea.selectionEnd = start + insertion.length;
  textarea.focus();

  if (isAoVivo) {
    autoSaveAoVivoScript();
  } else {
    autoSaveEditorialScript();
  }
};

window.syncAoVivoTopicsFromCalendar = function () {
  syncTopicsFromCalendar(true);
};

window.syncEditorialTopicsFromCalendar = function () {
  syncTopicsFromCalendar(false);
};

function syncTopicsFromCalendar(isAoVivo = false) {
  const dateKey = isAoVivo ? aoVivoSelectedDate : editorialSelectedDate;
  const textareaId = isAoVivo ? 'aoVivoScriptContent' : 'editorialScriptContent';
  const textarea = document.getElementById(textareaId);
  if (!textarea) return;

  const topics = getCalendarTopicsForDate(dateKey);
  if (topics.length === 0) {
    alert('Não há eventos no calendário com aviso ativo para este dia.');
    return;
  }

  const existingText = textarea.value.trim();
  const topicsBlock = topics.map(t => t.bulletText).join('\n');

  if (!existingText) {
    textarea.value = `• Abertura da emissão & Boas-vindas\n${topicsBlock}\n• Anúncio das músicas mais pedidas pelos alunos\n• Fecho da emissão`;
  } else {
    // Append after existing text
    textarea.value = existingText + '\n\n' + topicsBlock;
  }

  if (isAoVivo) {
    autoSaveAoVivoScript();
  } else {
    autoSaveEditorialScript();
  }
}

// ==========================================================================
// AO VIVO SCRIPT MANAGEMENT
// ==========================================================================
function loadAoVivoDailyScript() {
  const titleDisplay = document.getElementById('aoVivoScriptTitleDisplay');
  const readerDisplay = document.getElementById('aoVivoScriptDisplay');
  if (!readerDisplay) return;

  const script = window.db.getDailyScript(aoVivoSelectedDate);
  if (titleDisplay) {
    titleDisplay.textContent = script.title || `Emissão • ${formatDateHuman(aoVivoSelectedDate)}`;
  }

  let content = script.content;
  if (content === undefined || content === null || content.trim() === '') {
    content = generateDefaultScriptTemplate(aoVivoSelectedDate);
  }

  readerDisplay.dataset.rawContent = content;

  // Render content with rich formatting for studio reading
  readerDisplay.style.fontSize = `${aoVivoFontSize}px`;
  readerDisplay.innerHTML = formatScriptForAoVivoReading(content);
}

function formatScriptForAoVivoReading(rawText) {
  if (!rawText) return '<div class="aovivo-empty">Sem guião preparado para esta data.</div>';

  const lines = rawText.split('\n');
  let html = '';

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      html += '<div class="guiao-line-gap"></div>';
      return;
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const headingText = escapeHtml(trimmed);
      html += `<h3 class="guiao-heading-live">${headingText}</h3>`;
    } else if (trimmed.startsWith('## ')) {
      const headingText = escapeHtml(trimmed.replace(/^##\s*/, ''));
      html += `<h3 class="guiao-heading-live">${headingText}</h3>`;
    } else if (trimmed.startsWith('> ')) {
      const quoteText = escapeHtml(trimmed.replace(/^>\s*/, ''));
      html += `<div class="guiao-quote-live">${quoteText}</div>`;
    } else if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || /^\d+\.\s/.test(trimmed)) {
      const bulletContent = trimmed.replace(/^([•\-]||\d+\.)\s*/, '');
      const formattedLine = parseTagsInLine(escapeHtml(bulletContent));
      html += `
        <div class="guiao-item-live" onclick="this.classList.toggle('is-read')" title="Clique para marcar como lido na emissão">
          <span class="guiao-bullet-dot"></span>
          <div class="guiao-item-text">${formattedLine}</div>
        </div>`;
    } else {
      const formattedLine = parseTagsInLine(escapeHtml(trimmed));
      html += `<p class="guiao-p-live">${formattedLine}</p>`;
    }
  });

  return html;
}

function parseTagsInLine(textStr) {
  const now = new Date();
  const currentHoursMinutes = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return textStr
    .replace(/\[hora\]/gi, `<strong style="color: #38bdf8; font-weight: 800;"><i class="ri-time-line"></i> ${currentHoursMinutes}</strong>`)
    .replace(/xx:xx/gi, `<strong style="color: #38bdf8; font-weight: 800;"><i class="ri-time-line"></i> ${currentHoursMinutes}</strong>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function formatDateHuman(dateKey) {
  try {
    const [y, m, d] = dateKey.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long' }).format(date);
  } catch (e) {
    return dateKey;
  }
}

window.autoSaveAoVivoScript = function () {
  const titleInput = document.getElementById('aoVivoScriptTitle');
  const textarea = document.getElementById('aoVivoScriptContent');
  const statusEl = document.getElementById('aoVivoSaveStatus');

  if (statusEl) {
    statusEl.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> A guardar...';
    statusEl.style.color = '#fcd34d';
  }

  if (aoVivoSaveDebounceTimer) clearTimeout(aoVivoSaveDebounceTimer);

  aoVivoSaveDebounceTimer = setTimeout(() => {
    const title = titleInput ? titleInput.value.trim() : '';
    const content = textarea ? textarea.value : '';

    window.db.saveDailyScript({
      id: `script-${aoVivoSelectedDate}`,
      date: aoVivoSelectedDate,
      title: title || `Emissão • ${formatDateHuman(aoVivoSelectedDate)}`,
      content: content
    });

    if (statusEl) {
      statusEl.innerHTML = '<i class="ri-check-line"></i> Guardado';
      statusEl.style.color = '#86efac';
    }
  }, 400);
};

window.insertBulletPointToScript = function () {
  const textarea = document.getElementById('aoVivoScriptContent');
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const before = text.substring(0, start);
  const after = text.substring(end);

  const needsNewline = before.length > 0 && !before.endsWith('\n');
  const insertion = (needsNewline ? '\n' : '') + '• ';

  textarea.value = before + insertion + after;
  textarea.selectionStart = textarea.selectionEnd = start + insertion.length;
  textarea.focus();
  autoSaveAoVivoScript();
};

window.adjustAoVivoFontSize = function (delta) {
  aoVivoFontSize = Math.max(14, Math.min(32, aoVivoFontSize + delta));
  const readerDisplay = document.getElementById('aoVivoScriptDisplay');
  if (readerDisplay) {
    readerDisplay.style.fontSize = `${aoVivoFontSize}px`;
    const rawContent = readerDisplay.dataset.rawContent || '';
    if (rawContent) {
      readerDisplay.innerHTML = formatScriptForAoVivoReading(rawContent);
    }
  }
};

// ==========================================================================
// EDITORIAL SCRIPT MANAGEMENT
// ==========================================================================
let editorialSelectedDate = localDateKey(new Date());
let editorialSaveDebounceTimer = null;

window.openDailyScriptFromCalendar = function (dateKey) {
  if (!dateKey) return;
  editorialSelectedDate = dateKey;
  switchAdminSection('sec-guioes');
  window.renderEditorialDailyScript();
};

window.renderEditorialDailyScript = function () {
  const datePicker = document.getElementById('editorialDatePicker');
  if (datePicker) {
    datePicker.value = editorialSelectedDate;
  }
  loadEditorialDailyScript();
};

function setEditorialStatusState(state = 'saved') {
  const statusEl = document.getElementById('editorialSaveStatus');
  const pillEl = document.getElementById('editorialStatusPill');

  if (statusEl) {
    if (state === 'saving') {
      statusEl.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> A guardar...';
      statusEl.style.color = '#fcd34d';
    } else {
      statusEl.innerHTML = '<i class="ri-check-line"></i> Guardado';
      statusEl.style.color = '#86efac';
    }
  }

  if (pillEl) {
    pillEl.textContent = state === 'saving' ? 'A guardar' : 'Rascunho';
  }
}

function loadEditorialDailyScript() {
  const titleInput = document.getElementById('editorialScriptTitle');
  const textarea = document.getElementById('editorialScriptContent');
  const statusEl = document.getElementById('editorialSaveStatus');
  if (!textarea) return;

  renderAgendaTopicsBar(editorialSelectedDate, false);

  const script = window.db.getDailyScript(editorialSelectedDate);
  if (titleInput) {
    titleInput.value = script.title || `Emissão • ${formatDateHuman(editorialSelectedDate)}`;
  }

  let content = script.content;
  if (content === undefined || content === null || content.trim() === '') {
    content = generateDefaultScriptTemplate(editorialSelectedDate);
  }

  textarea.value = content;

  if (statusEl) {
    setEditorialStatusState('saved');
  }
}

window.changeEditorialDate = function (deltaDays) {
  const parts = editorialSelectedDate.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + deltaDays);
  editorialSelectedDate = localDateKey(d);

  const datePicker = document.getElementById('editorialDatePicker');
  if (datePicker) datePicker.value = editorialSelectedDate;
  loadEditorialDailyScript();
};

window.setEditorialDateToday = function () {
  editorialSelectedDate = localDateKey(new Date());
  const datePicker = document.getElementById('editorialDatePicker');
  if (datePicker) datePicker.value = editorialSelectedDate;
  loadEditorialDailyScript();
};

window.onEditorialDatePickerChange = function (newDate) {
  if (!newDate) return;
  editorialSelectedDate = newDate;
  loadEditorialDailyScript();
};

window.autoSaveEditorialScript = function () {
  const titleInput = document.getElementById('editorialScriptTitle');
  const textarea = document.getElementById('editorialScriptContent');
  const statusEl = document.getElementById('editorialSaveStatus');

  if (statusEl) {
    setEditorialStatusState('saving');
  }

  if (editorialSaveDebounceTimer) clearTimeout(editorialSaveDebounceTimer);

  editorialSaveDebounceTimer = setTimeout(() => {
    const title = titleInput ? titleInput.value.trim() : '';
    const content = textarea ? textarea.value : '';

    window.db.saveDailyScript({
      id: `script-${editorialSelectedDate}`,
      date: editorialSelectedDate,
      title: title || `Emissão • ${formatDateHuman(editorialSelectedDate)}`,
      content: content
    });

    if (statusEl) {
      setEditorialStatusState('saved');
    }
  }, 400);
};

window.insertBulletPointToEditorialScript = function () {
  window.formatEditorialText('bullet');
};

window.formatEditorialText = function (action) {
  const textarea = document.getElementById('editorialScriptContent');
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selectedText = text.substring(start, end);
  const before = text.substring(0, start);
  const after = text.substring(end);

  let replacement = '';
  let newCursorPos = start;

  switch (action) {
    case 'bold':
      replacement = selectedText ? `**${selectedText}**` : '**Texto em Negrito**';
      newCursorPos = selectedText ? start + replacement.length : start + 2;
      break;
    case 'italic':
      replacement = selectedText ? `*${selectedText}*` : '*Texto em Itálico*';
      newCursorPos = selectedText ? start + replacement.length : start + 1;
      break;
    case 'heading': {
      const needsNewline = before.length > 0 && !before.endsWith('\n');
      replacement = (needsNewline ? '\n\n' : '') + '## 📌 ' + (selectedText || 'Título da Secção');
      newCursorPos = start + replacement.length;
      break;
    }
    case 'bullet': {
      const needsNewline = before.length > 0 && !before.endsWith('\n');
      replacement = (needsNewline ? '\n' : '') + '• ' + (selectedText || '');
      newCursorPos = start + replacement.length;
      break;
    }
    case 'number': {
      const needsNewline = before.length > 0 && !before.endsWith('\n');
      replacement = (needsNewline ? '\n' : '') + '1. ' + (selectedText || '');
      newCursorPos = start + replacement.length;
      break;
    }
    case 'quote': {
      const needsNewline = before.length > 0 && !before.endsWith('\n');
      replacement = (needsNewline ? '\n' : '') + '> 💡 ' + (selectedText || 'Nota / Lembrete importante para o locutor');
      newCursorPos = start + replacement.length;
      break;
    }
    case 'tag-cama':
      replacement = '[CAMA SONORA SUAVE] ';
      newCursorPos = start + replacement.length;
      break;
    case 'tag-jingle':
      replacement = '[JINGLE DE ABERTURA] ';
      newCursorPos = start + replacement.length;
      break;
    case 'tag-pausa':
      replacement = '[PAUSA 2s] ';
      newCursorPos = start + replacement.length;
      break;
    default:
      return;
  }

  textarea.value = before + replacement + after;
  textarea.selectionStart = textarea.selectionEnd = newCursorPos;
  textarea.focus();
  autoSaveEditorialScript();
};


function renderAoVivoSongs(filterStatus = 'pending') {
  currentAoVivoSongFilter = filterStatus;
  const listEl = document.getElementById('aoVivoSongsList');
  const countEl = document.getElementById('aoVivoSongsCount');
  if (!listEl) return;

  const suggestions = window.db.getSuggestions();
  const map = new Map();

  suggestions.forEach(item => {
    if (filterStatus !== 'all' && item.status !== filterStatus) return;

    const key = `${item.songTitle.toLowerCase().trim()}___${item.artist.toLowerCase().trim()}`;
    if (!map.has(key)) {
      map.set(key, {
        songTitle: item.songTitle,
        artist: item.artist,
        artwork: item.artwork,
        count: 0,
        ids: [],
        status: item.status
      });
    }

    const group = map.get(key);
    group.count += 1;
    group.ids.push(item.id);
  });

  const rankedList = Array.from(map.values()).sort((a, b) => b.count - a.count);

  if (countEl) {
    const pendingTotal = suggestions.filter(s => s.status === 'pending').length;
    countEl.textContent = filterStatus === 'pending' ? pendingTotal : rankedList.length;
  }

  if (rankedList.length === 0) {
    listEl.innerHTML = `<div class="aovivo-empty"><i class="ri-music-2-line"></i> Nenhuma música com estado "${filterStatus}"</div>`;
    return;
  }

  listEl.innerHTML = rankedList.map((song, idx) => {
    const isPlayed = song.status === 'played';
    return `
      <div class="musica-live-card ${isPlayed ? 'is-played' : ''}">
        <div class="musica-live-rank">#${idx + 1}</div>
        <div class="musica-live-thumb">
          ${song.artwork ? `<img src="${escapeHtml(song.artwork)}" alt="${escapeHtml(song.songTitle)}" style="width:100%; height:100%; border-radius:6px; object-fit:cover;" loading="lazy">` : '<i class="ri-music-2-line" style="color: #64748b;"></i>'}
        </div>
        <div class="musica-live-info">
          <span class="musica-live-title">${escapeHtml(song.songTitle)}</span>
          <span class="musica-live-artist">${escapeHtml(song.artist)}</span>
        </div>
        <div class="musica-live-actions">
          <span class="musica-live-votes"><i class="ri-fire-fill"></i> ${song.count}</span>
          <button class="musica-live-btn-play" onclick="toggleAoVivoSongStatus(['${song.ids.join("','")}'], '${isPlayed ? 'pending' : 'played'}')" title="${isPlayed ? 'Reabrir pedido' : 'Marcar como tocada no outro PC'}">
            <i class="${isPlayed ? 'ri-checkbox-circle-fill' : 'ri-play-circle-line'}"></i> ${isPlayed ? 'Tocada' : 'Tocar'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.filterAoVivoSongs = function (status) {
  document.querySelectorAll('.musicas-filter-chip').forEach(btn => {
    btn.classList.toggle('active', btn.id === `filterAoVivo${status.charAt(0).toUpperCase() + status.slice(1)}`);
  });
  renderAoVivoSongs(status);
};

window.toggleAoVivoSongStatus = function (ids, newStatus) {
  ids.forEach(id => window.db.updateSuggestionStatus(id, newStatus));
  updateKPIs();
  renderAoVivoSongs(currentAoVivoSongFilter);
  renderSongRankingTable();
};
/* Contas Firebase reais: criação, alteração e eliminação através de endpoints HTTP CORS-safe. */
async function callAdminUserFunction(name, payload) {
  const auth = window.firebaseServices && window.firebaseServices.auth;
  let token = '';

  if (auth && auth.currentUser) {
    try {
      token = await auth.currentUser.getIdToken();
    } catch (error) {
      token = '';
    }
  }

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`https://europe-west1-testes-cidadela.cloudfunctions.net/${name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload || {})
      });

      const text = await response.text();
      let json = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch (error) {
        json = {};
      }

      if (!response.ok) {
        throw new Error(json.error || 'Não foi possível completar a operação no painel.');
      }

      return json.data || {};
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error('Não foi possível completar a operação no painel.');
}

window.openUserModal = function (id = '') {
  const user = id ? window.db.getAdminUsers().find(item => item.id === id) : null;
  document.getElementById('adminUserForm').reset();
  document.getElementById('adminUserIdInput').value = user?.authUid || user?.id || '';
  document.getElementById('adminUserNameInput').value = user?.name || '';
  document.getElementById('adminUserEmailInput').value = user?.email || '';
  const passwordInput = document.getElementById('adminUserPasswordInput');
  const isEditing = Boolean(user);
  passwordInput.required = !isEditing;
  passwordInput.value = '';
  document.getElementById('adminUserPasswordHint').textContent = isEditing ? '(deixa em branco para manter a atual)' : '(mínimo 8 caracteres)';
  document.getElementById('adminUserModalTitle').textContent = isEditing ? 'Editar conta de administrador' : 'Criar conta de administrador';
  openModal('adminUserModal');
};

window.saveAdminUser = async function (event) {
  event.preventDefault();
  const userId = document.getElementById('adminUserIdInput').value;
  const name = document.getElementById('adminUserNameInput').value.trim();
  const email = document.getElementById('adminUserEmailInput').value.trim();
  const password = document.getElementById('adminUserPasswordInput').value;
  const submit = document.querySelector('#adminUserForm button[type="submit"]');
  if (!name || !email || (!userId && password.length < 8) || (password && password.length < 8)) return;
  submit.disabled = true;
  submit.textContent = 'A guardar…';
  try {
    await callAdminUserFunction(userId ? 'updateAdminUser' : 'createAdminUser', { userId, name, email, password });
    closeModal('adminUserModal');
  } catch (error) {
    console.error('Não foi possível gerir a conta:', error);
    alert(error.message || 'Não foi possível guardar a conta.');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Guardar utilizador';
  }
};

window.deleteAdminUserItem = async function (id) {
  if (!confirm('Eliminar esta conta de administrador? O acesso ao painel será removido imediatamente.')) return;
  try {
    await callAdminUserFunction('deleteAdminUser', { userId: id });
  } catch (error) {
    console.error('Não foi possível eliminar a conta:', error);
    alert(error.message || 'Não foi possível eliminar a conta.');
  }
};

/* ==========================================================================
   SOUNDBOARD DE ESTÚDIO & MOTOR DE ÁUDIO WEB (FX & BGM CAMA SONORA)
   ========================================================================== */
let audioCtx = null;
let bgmOscillators = [];
let bgmGainNode = null;
let bgmFilterNode = null;
let isBgmPlaying = false;
let bgmVolume = 0.35;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

window.playSoundFX = function (type) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  if (type === 'jingle') {
    // Fanfarra arpejada em 4 notas (Dó Maior: C5, E5, G5, C6) com reverb
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.14);

      gain.gain.setValueAtTime(0.001, now + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.4, now + i * 0.14 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.14 + (i === 3 ? 0.9 : 0.4));

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + (i === 3 ? 0.95 : 0.45));
    });
  } else if (type === 'applause') {
    // Ruído filtrado dinâmico simulando aplausos e euforia
    const bufferSize = Math.floor(ctx.sampleRate * 2.5);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 1.8));
    }
    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.setValueAtTime(1.5, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    whiteNoise.start(now);
  } else if (type === 'alert') {
    // Alerta sonoro de jornalismo / breaking news
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, now);

    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1174, now + 0.18);
    osc.frequency.setValueAtTime(880, now + 0.36);
    osc.frequency.setValueAtTime(1318, now + 0.54);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.92);
  } else if (type === 'drumroll') {
    // Rufar acelerado de tarola seguido de prato de ataque
    const count = 18;
    for (let i = 0; i < count; i++) {
      const hitTime = now + (i * 0.045);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180 + Math.random() * 40, hitTime);
      gain.gain.setValueAtTime(0.01 + (i / count) * 0.25, hitTime);
      gain.gain.exponentialRampToValueAtTime(0.001, hitTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(hitTime);
      osc.stop(hitTime + 0.045);
    }
    const crashTime = now + (count * 0.045);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, crashTime);
    gain.gain.setValueAtTime(0.45, crashTime);
    gain.gain.exponentialRampToValueAtTime(0.001, crashTime + 0.8);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(crashTime);
    osc.stop(crashTime + 0.85);
  } else if (type === 'pips') {
    // Sinal horário padrão da rádio: 5 bips curtos + 1 bip longo
    for (let i = 0; i < 5; i++) {
      const pipTime = now + i * 0.5;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, pipTime);
      gain.gain.setValueAtTime(0.3, pipTime);
      gain.gain.setValueAtTime(0.001, pipTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(pipTime);
      osc.stop(pipTime + 0.11);
    }
    const finalTime = now + 2.5;
    const finalOsc = ctx.createOscillator();
    const finalGain = ctx.createGain();
    finalOsc.type = 'sine';
    finalOsc.frequency.setValueAtTime(880, finalTime);
    finalGain.gain.setValueAtTime(0.4, finalTime);
    finalGain.gain.exponentialRampToValueAtTime(0.001, finalTime + 0.6);
    finalOsc.connect(finalGain);
    finalGain.connect(ctx.destination);
    finalOsc.start(finalTime);
    finalOsc.stop(finalTime + 0.62);
  } else if (type === 'sweeper') {
    // Efeito whoosh de transição de bloco
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, now);
    filter.frequency.exponentialRampToValueAtTime(3500, now + 0.4);
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.8);
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.35);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.87);
  }
};

window.toggleSoundboardBGM = function () {
  const btn = document.getElementById('soundboardBgmBtn');
  const icon = document.getElementById('soundboardBgmIcon');
  const label = document.getElementById('soundboardBgmLabel');

  if (isBgmPlaying) {
    stopSoundboardBGM();
    if (btn) btn.classList.remove('active');
    if (icon) icon.className = 'ri-music-fill';
    if (label) label.textContent = 'Cama Sonora (BGM)';
  } else {
    startSoundboardBGM();
    if (btn) btn.classList.add('active');
    if (icon) icon.className = 'ri-stop-circle-fill';
    if (label) label.textContent = 'A Tocar Cama Sonora';
  }
};

function startSoundboardBGM() {
  const ctx = getAudioContext();
  if (!ctx) return;

  stopSoundboardBGM();
  isBgmPlaying = true;

  bgmGainNode = ctx.createGain();
  bgmGainNode.gain.setValueAtTime(bgmVolume, ctx.currentTime);

  bgmFilterNode = ctx.createBiquadFilter();
  bgmFilterNode.type = 'lowpass';
  bgmFilterNode.frequency.setValueAtTime(950, ctx.currentTime);

  bgmFilterNode.connect(bgmGainNode);
  bgmGainNode.connect(ctx.destination);

  // Acorde Pad quente e suave (Cmaj9 arpeggio chord bed)
  const chordFreqs = [130.81, 196.00, 246.94, 293.66, 329.63];
  bgmOscillators = chordFreqs.map((freq, idx) => {
    const osc = ctx.createOscillator();
    osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.connect(bgmFilterNode);
    osc.start();
    return osc;
  });
}

function stopSoundboardBGM() {
  if (bgmOscillators.length) {
    bgmOscillators.forEach(osc => {
      try { osc.stop(); osc.disconnect(); } catch (e) { }
    });
    bgmOscillators = [];
  }
  if (bgmGainNode) {
    try { bgmGainNode.disconnect(); } catch (e) { }
    bgmGainNode = null;
  }
  isBgmPlaying = false;
}

window.setSoundboardBGMVolume = function (val) {
  bgmVolume = parseFloat(val) || 0.35;
  if (bgmGainNode && audioCtx) {
    bgmGainNode.gain.setValueAtTime(bgmVolume, audioCtx.currentTime);
  }
};

/* ==========================================================================
   TELEPROMPTER DE ESTÚDIO AO VIVO (LEITOR DE EMISSÃO)
   ========================================================================== */
let currentPrompterNoticeId = null;
let prompterFontSize = 1.75; // rem
let prompterTimerInterval = null;
let prompterTimerSeconds = 0;
let isPrompterTimerRunning = false;

window.openAoVivoPrompter = function (noticeIdOrData) {
  let notice = null;
  if (typeof noticeIdOrData === 'string') {
    notice = window.db.getInternalAnnouncements().find(a => a.id === noticeIdOrData);
    if (!notice) {
      notice = window.db.getCalendarEvents().find(e => e.id === noticeIdOrData);
    }
  } else if (noticeIdOrData && typeof noticeIdOrData === 'object') {
    notice = noticeIdOrData;
  }

  if (!notice) {
    notice = {
      id: 'demo',
      title: 'Aviso de Emissão Escolar',
      content: 'Atenção comunidade escolar! [CAMA SONORA]\n\nEstão abertas as inscrições para as atividades da Rádio Escolar da EBS Cidadela. [PAUSA 2s]\n\nSe gostas de música, jornalismo, podcasting ou técnica de som, junta-te à nossa equipa! Visita a sala da rádio no intervalo grande para mais informações. [EFEITO JINGLE]\n\nFica ligado à melhor música na tua rádio escolar!',
      speaker: 'Locutor Principal',
      cue: 'Cama Sonora Suave'
    };
  }

  currentPrompterNoticeId = notice.id || null;

  const titleEl = document.getElementById('prompterTitle');
  const bodyEl = document.getElementById('prompterBody');
  const speakerEl = document.getElementById('prompterSpeaker');
  const cueTagEl = document.getElementById('prompterCueTag');
  const estDurEl = document.getElementById('prompterEstDuration');
  const wordCountEl = document.getElementById('prompterWordCount');

  if (titleEl) titleEl.textContent = notice.title || 'Aviso para Ler';
  if (speakerEl) speakerEl.innerHTML = `<i class="ri-user-voice-line"></i> Locutor: ${escapeHtml(notice.speaker || notice.userName || 'Todos')}`;
  if (cueTagEl) cueTagEl.innerHTML = `<i class="ri-sound-module-line"></i> Cama Sonora: ${escapeHtml(notice.cue || 'Recomendada')}`;

  const rawText = notice.content || notice.body || notice.excerpt || notice.notes || notice.title || '';

  const formattedHtml = formatPrompterText(rawText);
  if (bodyEl) {
    bodyEl.innerHTML = formattedHtml;
    bodyEl.style.fontSize = `${prompterFontSize}rem`;
  }

  const words = rawText.trim().split(/\s+/).filter(Boolean).length;
  const estSeconds = Math.round((words / 130) * 60);
  const estMins = Math.floor(estSeconds / 60);
  const estSecsRemainder = estSeconds % 60;

  if (wordCountEl) wordCountEl.textContent = `${words} palavras`;
  if (estDurEl) estDurEl.textContent = `Est: ~${estMins > 0 ? `${estMins}m ` : ''}${estSecsRemainder}s`;

  resetPrompterTimer();

  const modal = document.getElementById('aoVivoPrompterModal');
  if (modal) modal.classList.add('active');
};

function formatPrompterText(text) {
  let formatted = escapeHtml(text);

  formatted = formatted.replace(/\[CAMA SONORA\]/gi, '<span class="prompter-cue-badge prompter-cue-bgm"><i class="ri-music-fill"></i> CAMA SONORA</span>');
  formatted = formatted.replace(/\[EFEITO[^\]]*\]|\[JINGLE[^\]]*\]/gi, match => `<span class="prompter-cue-badge prompter-cue-fx"><i class="ri-sound-module-line"></i> ${match.replace(/[\[\]]/g, '')}</span>`);
  formatted = formatted.replace(/\[PAUSA[^\]]*\]/gi, match => `<span class="prompter-cue-badge prompter-cue-pause"><i class="ri-pause-circle-line"></i> ${match.replace(/[\[\]]/g, '')}</span>`);
  formatted = formatted.replace(/\[ALERTA[^\]]*\]/gi, match => `<span class="prompter-cue-badge prompter-cue-alert"><i class="ri-alarm-warning-fill"></i> ${match.replace(/[\[\]]/g, '')}</span>`);

  const paragraphs = formatted.split(/\n\s*\n/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  return paragraphs || `<p>${formatted}</p>`;
}

window.adjustPrompterFontSize = function (delta) {
  prompterFontSize = Math.max(1.1, Math.min(3.2, prompterFontSize + (delta * 0.15)));
  const bodyEl = document.getElementById('prompterBody');
  if (bodyEl) bodyEl.style.fontSize = `${prompterFontSize}rem`;
};

window.togglePrompterTimer = function () {
  if (isPrompterTimerRunning) {
    pausePrompterTimer();
  } else {
    startPrompterTimer();
  }
};

function startPrompterTimer() {
  isPrompterTimerRunning = true;
  const icon = document.getElementById('prompterTimerIcon');
  if (icon) icon.className = 'ri-pause-fill';

  if (!prompterTimerInterval) {
    prompterTimerInterval = setInterval(() => {
      prompterTimerSeconds++;
      updatePrompterTimerDisplay();
    }, 1000);
  }
}

function pausePrompterTimer() {
  isPrompterTimerRunning = false;
  const icon = document.getElementById('prompterTimerIcon');
  if (icon) icon.className = 'ri-play-fill';
  if (prompterTimerInterval) {
    clearInterval(prompterTimerInterval);
    prompterTimerInterval = null;
  }
}

function resetPrompterTimer() {
  pausePrompterTimer();
  prompterTimerSeconds = 0;
  updatePrompterTimerDisplay();
}

function updatePrompterTimerDisplay() {
  const display = document.getElementById('prompterTimerDisplay');
  if (!display) return;
  const mins = String(Math.floor(prompterTimerSeconds / 60)).padStart(2, '0');
  const secs = String(prompterTimerSeconds % 60).padStart(2, '0');
  display.textContent = `${mins}:${secs}`;
}

window.closePrompterModal = function () {
  pausePrompterTimer();
  const modal = document.getElementById('aoVivoPrompterModal');
  if (modal) modal.classList.remove('active');
};

window.markCurrentPrompterAsRead = function () {
  if (currentPrompterNoticeId) {
    const itemEl = document.getElementById(`aoVivoNotice_${currentPrompterNoticeId}`);
    if (itemEl) itemEl.classList.add('is-read');
  }
  closePrompterModal();
};

/* ==========================================================================
   PREPARAÇÃO RÁPIDA DE AVISO PARA LER
   ========================================================================== */
window.openQuickNoticeModal = function (id = '') {
  document.getElementById('quickNoticeForm').reset();
  document.getElementById('quickNoticeIdInput').value = id || '';
  document.getElementById('quickNoticeDate').value = localDateKey(new Date());

  if (id) {
    const notice = window.db.getInternalAnnouncements().find(a => a.id === id);
    if (notice) {
      document.getElementById('quickNoticeTitle').value = notice.title || '';
      document.getElementById('quickNoticeDate').value = notice.broadcastDate || localDateKey(new Date());
      document.getElementById('quickNoticeSpeaker').value = notice.speaker || '';
      document.getElementById('quickNoticeCue').value = notice.cue || 'Cama Sonora Suave';
      document.getElementById('quickNoticeBody').value = notice.content || notice.excerpt || '';
    }
  }
  updateQuickNoticeStats();
  openModal('quickNoticeModal');
};

window.insertNoticeTag = function (tag) {
  const textarea = document.getElementById('quickNoticeBody');
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  textarea.value = text.substring(0, start) + ' ' + tag + ' ' + text.substring(end);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + tag.length + 2;
  updateQuickNoticeStats();
};

window.updateQuickNoticeStats = function () {
  const textarea = document.getElementById('quickNoticeBody');
  const statsEl = document.getElementById('quickNoticeStats');
  if (!textarea || !statsEl) return;
  const words = textarea.value.trim().split(/\s+/).filter(Boolean).length;
  const estSeconds = Math.round((words / 130) * 60);
  statsEl.textContent = `${words} palavras • ~${estSeconds}s de leitura estimada`;
};

window.saveQuickNoticeForm = function (event) {
  event.preventDefault();
  const id = document.getElementById('quickNoticeIdInput').value;
  const title = document.getElementById('quickNoticeTitle').value.trim();
  const broadcastDate = document.getElementById('quickNoticeDate').value;
  const speaker = document.getElementById('quickNoticeSpeaker').value.trim();
  const cue = document.getElementById('quickNoticeCue').value;
  const content = document.getElementById('quickNoticeBody').value.trim();

  if (!title || !content) {
    showToast('Por favor, indica o título e o texto do aviso.', 'warning');
    return;
  }

  const announcement = {
    id: id || undefined,
    title,
    broadcastDate,
    date: broadcastDate,
    category: 'Aviso em Antena',
    speaker,
    cue,
    content,
    excerpt: content.substring(0, 120) + (content.length > 120 ? '...' : ''),
    onAir: true,
    published: true
  };

  window.db.saveAnnouncement(announcement);
  closeModal('quickNoticeModal');
  renderAdminOverview();
  renderAoVivoOnAirList();
  showToast(id ? 'Aviso atualizado com sucesso!' : 'Novo aviso preparado para emissão!', 'success');
};

/* ==========================================================================
   CONSTRUTOR DE GUIÕES & ALINHAMENTOS DE EMISSÃO (RUNDOWN BUILDER)
   ========================================================================== */
let currentRundownBlocks = [];

window.renderRundownsList = function () {
  const container = document.getElementById('rundownsListGrid');
  if (!container) return;

  const rundowns = window.db.getRundowns();
  if (rundowns.length === 0) {
    container.innerHTML = `
      <div class="brief-empty">
        <i class="ri-file-list-3-line"></i>
        <strong>Nenhum alinhamento criado</strong>
        <span>Usa os modelos acima para criar o alinhamento da emissão.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = rundowns.map(r => {
    const totalBlocks = (r.blocks || []).length;
    const dateFormatted = r.date ? new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' }).format(new Date(r.date + 'T00:00')) : '';
    return `
      <div class="rundown-card">
        <div class="rundown-card-top">
          <span class="rundown-tag"><i class="ri-calendar-line"></i> ${escapeHtml(dateFormatted)} • ${escapeHtml(r.time || 'Emissão')}</span>
          <span class="rundown-dur-badge"><i class="ri-time-line"></i> ${escapeHtml(r.totalDuration || '15:00')}</span>
        </div>
        <h3 class="rundown-card-title">${escapeHtml(r.title)}</h3>
        <div class="rundown-card-meta">
          <span><i class="ri-layout-grid-line"></i> ${totalBlocks} blocos</span>
          <span><i class="ri-user-voice-line"></i> ${escapeHtml(r.author || 'Equipa da Rádio')}</span>
        </div>
        <div class="rundown-card-actions">
          <button class="btn-action" onclick="openEditRundownModal('${escapeHtml(r.id)}')"><i class="ri-edit-line"></i> Editar</button>
          <button class="btn-action" onclick="openAoVivoPrompter(getPrompterDataFromRundown('${escapeHtml(r.id)}'))" title="Abrir no Teleprompter"><i class="ri-mic-line"></i> Ler no Ar</button>
        </div>
      </div>
    `;
  }).join('');
};

window.getPrompterDataFromRundown = function (id) {
  const rundown = window.db.getRundowns().find(r => r.id === id);
  if (!rundown) return null;
  const content = (rundown.blocks || []).map((b, idx) => {
    return `[BLOCO ${idx + 1}: ${b.type.toUpperCase()}] - ${b.title}\n${b.cue ? `[${b.cue.toUpperCase()}]\n` : ''}${b.content || b.notes || 'Sem texto adicional.'}`;
  }).join('\n\n');

  return {
    id: rundown.id,
    title: rundown.title,
    content,
    speaker: rundown.author || 'Equipa',
    cue: 'Alinhamento Completo'
  };
};

window.openNewRundownModal = function (template = 'blank') {
  document.getElementById('rundownForm').reset();
  document.getElementById('rundownIdInput').value = '';
  document.getElementById('rundownDateInput').value = localDateKey(new Date());
  document.getElementById('rundownModalTitle').textContent = 'Novo Alinhamento de Emissão';
  document.getElementById('rundownDeleteBtn').style.display = 'none';

  if (template === 'morning' || template === 'today') {
    document.getElementById('rundownTitleInput').value = 'Emissão Intervalo da Manhã (10:00 - 10:20)';
    document.getElementById('rundownTimeInput').value = '10:00 - 10:20';
    currentRundownBlocks = [
      { id: 'b1', type: 'jingle', title: 'Jingle de Abertura da Rádio', duration: '00:15', cue: '[JINGLE]', notes: 'Disparar jingle oficial no Soundboard' },
      { id: 'b2', type: 'talk', title: 'Abertura & Destaques do Dia', duration: '01:30', cue: '[CAMA SONORA]', content: 'Muito bom dia Cidadela! [CAMA SONORA]\nEstamos no ar com a emissão do intervalo da manhã. Hoje temos as novidades do desporto escolar e as músicas mais pedidas pelos alunos!' },
      { id: 'b3', type: 'music', title: 'Música #1 Top Pedidos', duration: '03:15', cue: '', notes: 'Música mais votada no site' },
      { id: 'b4', type: 'talk', title: 'Avisos da Associação de Estudantes', duration: '01:15', cue: '[CAMA SONORA]', content: 'Atenção alunos! Lembramos que as inscrições para o torneio de futsal terminam esta sexta-feira na sala da AE.' },
      { id: 'b5', type: 'music', title: 'Música #2 Sugestão da Semana', duration: '03:00', cue: '', notes: 'Música ritmada' },
      { id: 'b6', type: 'talk', title: 'Despedida & Encerramento', duration: '00:45', cue: '[EFEITO JINGLE]', content: 'Está quase a tocar para as aulas. Continuem a enviar as vossas músicas pelo nosso site. Boa semana a todos!' }
    ];
  } else if (template === 'lunch') {
    document.getElementById('rundownTitleInput').value = 'Emissão do Almoço (13:15 - 14:00)';
    document.getElementById('rundownTimeInput').value = '13:15 - 14:00';
    currentRundownBlocks = [
      { id: 'b1', type: 'jingle', title: 'Vinheta Oficial Cidadela', duration: '00:15', cue: '[JINGLE]', notes: 'Jingle' },
      { id: 'b2', type: 'talk', title: 'Abertura da Emissão do Almoço', duration: '02:00', cue: '[CAMA SONORA]', content: 'Boa tarde a toda a escola! Estamos em direto para acompanhar a tua hora de almoço.' },
      { id: 'b3', type: 'interview', title: 'Entrevista / Rubrica de Alunos', duration: '05:00', cue: '[CAMA SONORA]', content: 'Hoje recebemos os nossos convidados especiais para falar sobre o projeto de ciências.' },
      { id: 'b4', type: 'contest', title: 'Passatempo / Quiz da Rádio', duration: '03:00', cue: '[ALERTA]', content: 'Hora do passatempo! Quem souber a resposta à pergunta do dia venha ao estúdio ganhar o brinde da rádio!' }
    ];
  } else {
    currentRundownBlocks = [
      { id: 'b1', type: 'talk', title: 'Bloco de Abertura', duration: '01:30', cue: '[CAMA SONORA]', content: 'Texto de abertura da emissão...' }
    ];
  }

  renderRundownBlocks();
  openModal('rundownModal');
};

window.openEditRundownModal = function (id) {
  const rundown = window.db.getRundowns().find(r => r.id === id);
  if (!rundown) return;

  document.getElementById('rundownForm').reset();
  document.getElementById('rundownIdInput').value = rundown.id;
  document.getElementById('rundownTitleInput').value = rundown.title || '';
  document.getElementById('rundownDateInput').value = rundown.date || localDateKey(new Date());
  document.getElementById('rundownTimeInput').value = rundown.time || '';
  document.getElementById('rundownModalTitle').textContent = 'Editar Alinhamento de Emissão';
  document.getElementById('rundownDeleteBtn').style.display = 'inline-flex';

  currentRundownBlocks = (rundown.blocks || []).map((b, idx) => ({ ...b, id: b.id || `blk_${Date.now()}_${idx}` }));
  renderRundownBlocks();
  openModal('rundownModal');
};

window.addRundownBlock = function (type) {
  const blockTypes = {
    talk: { title: 'Novo Bloco de Fala / Aviso', duration: '01:30', cue: '[CAMA SONORA]', content: 'Texto a ler pelo locutor...' },
    music: { title: 'Música Selecionada', duration: '03:20', cue: '', notes: 'Nome do artista & tema' },
    jingle: { title: 'Jingle / Vinheta', duration: '00:15', cue: '[JINGLE]', notes: 'Disparar som no soundboard' },
    interview: { title: 'Entrevista em Estúdio', duration: '04:00', cue: '[CAMA SONORA]', notes: 'Convidado e tópicos' },
    contest: { title: 'Passatempo & Linha Aberta', duration: '02:30', cue: '[ALERTA]', notes: 'Pergunta e prémio' }
  };

  const defaultData = blockTypes[type] || blockTypes.talk;
  currentRundownBlocks.push({
    id: `blk_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    type,
    ...defaultData
  });

  renderRundownBlocks();
};

window.removeRundownBlock = function (blockId) {
  currentRundownBlocks = currentRundownBlocks.filter(b => b.id !== blockId);
  renderRundownBlocks();
};

function renderRundownBlocks() {
  const container = document.getElementById('rundownBlocksList');
  if (!container) return;

  if (currentRundownBlocks.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding: 1.5rem; color: var(--text-muted);">Nenhum bloco no alinhamento. Clica num dos botões acima para adicionar.</div>';
    calculateRundownTotalTime();
    return;
  }

  const typeIcons = {
    talk: 'ri-mic-line',
    music: 'ri-music-2-line',
    jingle: 'ri-broadcast-line',
    interview: 'ri-user-voice-line',
    contest: 'ri-trophy-line'
  };

  container.innerHTML = currentRundownBlocks.map((block, idx) => {
    return `
      <div class="rundown-block-item" data-block-id="${block.id}">
        <div class="rundown-block-header">
          <div class="rundown-block-num">#${idx + 1}</div>
          <div class="rundown-block-type-badge type-${block.type}"><i class="${typeIcons[block.type] || 'ri-mic-line'}"></i> ${block.type.toUpperCase()}</div>
          <input type="text" class="rundown-block-title-input" value="${escapeHtml(block.title || '')}" placeholder="Título do bloco" onchange="updateBlockField('${block.id}', 'title', this.value)">
          <input type="text" class="rundown-block-dur-input" value="${escapeHtml(block.duration || '01:00')}" placeholder="mm:ss" title="Duração estimada" onchange="updateBlockField('${block.id}', 'duration', this.value)">
          <button type="button" class="rundown-block-del-btn" onclick="removeRundownBlock('${block.id}')" title="Remover bloco"><i class="ri-delete-bin-line"></i></button>
        </div>
        ${block.type === 'talk' ? `
          <textarea class="rundown-block-content-area" rows="2" placeholder="Texto para o locutor ler no teleprompter..." onchange="updateBlockField('${block.id}', 'content', this.value)">${escapeHtml(block.content || '')}</textarea>
        ` : `
          <input type="text" class="rundown-block-notes-input" value="${escapeHtml(block.notes || '')}" placeholder="Notas técnicas, artista ou orientações..." onchange="updateBlockField('${block.id}', 'notes', this.value)">
        `}
      </div>
    `;
  }).join('');

  calculateRundownTotalTime();
}

window.updateBlockField = function (blockId, field, value) {
  const block = currentRundownBlocks.find(b => b.id === blockId);
  if (block) {
    block[field] = value;
    if (field === 'duration') calculateRundownTotalTime();
  }
};

function calculateRundownTotalTime() {
  let totalSeconds = 0;
  currentRundownBlocks.forEach(b => {
    const durStr = b.duration || '00:00';
    const parts = durStr.split(':').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      totalSeconds += parts[0] * 60 + parts[1];
    } else if (parts.length === 1 && !isNaN(parts[0])) {
      totalSeconds += parts[0] * 60;
    }
  });

  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const label = document.getElementById('rundownModalTotalTime');
  if (label) label.textContent = timeFormatted;
  return timeFormatted;
}

window.saveRundownForm = function (event) {
  event.preventDefault();
  const id = document.getElementById('rundownIdInput').value;
  const title = document.getElementById('rundownTitleInput').value.trim();
  const date = document.getElementById('rundownDateInput').value;
  const time = document.getElementById('rundownTimeInput').value.trim();
  const totalDuration = calculateRundownTotalTime();

  if (!title) {
    showToast('Por favor, indica o título da emissão.', 'warning');
    return;
  }

  const rundown = {
    id: id || undefined,
    title,
    date,
    time,
    totalDuration,
    blocks: currentRundownBlocks,
    author: 'Equipa da Rádio',
    updatedAt: Date.now()
  };

  window.db.saveRundown(rundown);
  closeModal('rundownModal');
  renderRundownsList();
  showToast(id ? 'Alinhamento da emissão atualizado!' : 'Novo alinhamento guardado com sucesso!', 'success');
};

window.deleteOpenRundown = function () {
  const id = document.getElementById('rundownIdInput').value;
  if (!id) return;
  if (confirm('Eliminar este alinhamento de emissão?')) {
    window.db.deleteRundown(id);
    closeModal('rundownModal');
    renderRundownsList();
    showToast('Alinhamento de emissão eliminado.', 'info');
  }
};

window.printOpenRundown = function () {
  window.print();
};

/* ==========================================================================
   MURAL DE RECADOS DA EQUIPA (NOTION-STYLE MEMOS)
   ========================================================================== */
window.renderTeamMemos = function () {
  const container = document.getElementById('teamMemosGrid');
  if (!container) return;

  const memos = window.db.getTeamMemos();
  if (memos.length === 0) {
    container.innerHTML = '<div style="grid-column: 1 / -1; padding: 1rem; color: var(--text-muted); font-size: 0.85rem;">Nenhum recado no mural da equipa. Clica em "Novo Recado" para deixar uma nota para os colegas.</div>';
    return;
  }

  container.innerHTML = memos.map(m => {
    const colorClass = `memo-color-${m.color || 'amber'}`;
    const dateFormatted = m.createdAt ? new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' }).format(new Date(m.createdAt)) : '';
    return `
      <div class="team-memo-card ${colorClass}" onclick="openEditTeamMemoModal('${escapeHtml(m.id)}')">
        <div class="team-memo-top">
          <strong class="team-memo-title">${escapeHtml(m.title)}</strong>
          <span class="team-memo-author">${escapeHtml(m.author || 'Equipa')}</span>
        </div>
        <p class="team-memo-body">${escapeHtml(m.content || '')}</p>
        <div class="team-memo-footer">
          <span><i class="ri-time-line"></i> ${escapeHtml(dateFormatted)}</span>
          <i class="ri-edit-line" style="opacity: 0.6;"></i>
        </div>
      </div>
    `;
  }).join('');
};

window.openNewTeamMemoModal = function () {
  document.getElementById('teamMemoForm').reset();
  document.getElementById('teamMemoIdInput').value = '';
  document.getElementById('teamMemoModalTitle').textContent = 'Novo Recado da Equipa';
  document.getElementById('teamMemoDeleteBtn').style.display = 'none';
  openModal('teamMemoModal');
};

window.openEditTeamMemoModal = function (id) {
  const memo = window.db.getTeamMemos().find(m => m.id === id);
  if (!memo) return;

  document.getElementById('teamMemoForm').reset();
  document.getElementById('teamMemoIdInput').value = memo.id;
  document.getElementById('teamMemoTitleInput').value = memo.title || '';
  document.getElementById('teamMemoContentInput').value = memo.content || '';
  document.getElementById('teamMemoAuthorInput').value = memo.author || '';
  document.getElementById('teamMemoColorInput').value = memo.color || 'amber';
  document.getElementById('teamMemoModalTitle').textContent = 'Editar Recado da Equipa';
  document.getElementById('teamMemoDeleteBtn').style.display = 'inline-flex';

  openModal('teamMemoModal');
};

window.saveTeamMemoForm = function (event) {
  event.preventDefault();
  const id = document.getElementById('teamMemoIdInput').value;
  const title = document.getElementById('teamMemoTitleInput').value.trim();
  const content = document.getElementById('teamMemoContentInput').value.trim();
  const author = document.getElementById('teamMemoAuthorInput').value.trim();
  const color = document.getElementById('teamMemoColorInput').value;

  if (!title || !content) {
    showToast('Por favor, indica o título e a mensagem do recado.', 'warning');
    return;
  }

  const memo = {
    id: id || undefined,
    title,
    content,
    author,
    color,
    createdAt: Date.now()
  };

  window.db.saveTeamMemo(memo);
  closeModal('teamMemoModal');
  renderTeamMemos();
  showToast(id ? 'Recado atualizado com sucesso!' : 'Novo recado afixado no mural!', 'success');
};

window.deleteOpenTeamMemo = function () {
  const id = document.getElementById('teamMemoIdInput').value;
  if (!id) return;
  if (confirm('Eliminar este recado do mural?')) {
    window.db.deleteTeamMemo(id);
    closeModal('teamMemoModal');
    renderTeamMemos();
    showToast('Recado eliminado.', 'info');
  }
};

/* ==========================================================================
   TEMPORIZADOR DO TOQUE DE INTERVALO ESCOLAR
   ========================================================================== */
let bellTimerInterval = null;

function initIntervalBellTimer() {
  updateIntervalBellTimer();
  if (!bellTimerInterval) {
    bellTimerInterval = setInterval(updateIntervalBellTimer, 1000);
  }
}

function updateIntervalBellTimer() {
  const countdownEl = document.getElementById('aoVivoBellCountdown');
  if (!countdownEl) return;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentSeconds = now.getSeconds();

  // Horários de toque na escola (em minutos a partir da meia-noite)
  // 08:30 (510), 10:00 (600), 10:20 (620), 11:50 (710), 12:10 (730), 13:15 (795), 14:15 (855), 15:35 (935), 15:55 (955), 17:15 (1035)
  const bellTimes = [510, 600, 620, 710, 730, 795, 855, 935, 955, 1035];

  let nextBell = bellTimes.find(m => m > currentMinutes);
  if (!nextBell) {
    countdownEl.textContent = 'Fim do Dia';
    return;
  }

  const diffMinutes = nextBell - currentMinutes - 1;
  const diffSeconds = 60 - currentSeconds;

  const mStr = String(Math.max(0, diffMinutes)).padStart(2, '0');
  const sStr = String(diffSeconds === 60 ? 0 : diffSeconds).padStart(2, '0');
  countdownEl.textContent = `${mStr}:${sStr}`;
}

/* ==========================================================================
   GESTÃO DE TAREFAS DA EQUIPA (ORGANIZAÇÃO POR SEMANA E ATIVIDADE)
   ========================================================================== */
let currentTaskViewMode = 'week'; // 'week' | 'activity'
let currentTaskActivityFilter = 'all';

window.switchTaskView = function (mode) {
  currentTaskViewMode = mode;
  const btnWeek = document.getElementById('taskViewWeek');
  const btnActivity = document.getElementById('taskViewActivity');
  const filterBar = document.getElementById('tasksActivityFilters');

  if (btnWeek) btnWeek.classList.toggle('active', mode === 'week');
  if (btnActivity) btnActivity.classList.toggle('active', mode === 'activity');
  if (filterBar) filterBar.style.display = mode === 'activity' ? 'flex' : 'none';

  renderTasksView();
};

window.filterTasksByActivity = function (activity) {
  currentTaskActivityFilter = activity;
  document.querySelectorAll('.tasks-filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.activity === activity);
  });
  renderTasksView();
};

window.renderTasksView = function () {
  const container = document.getElementById('tasksBoard');
  if (!container) return;

  const tasks = window.db.getTasks ? window.db.getTasks() : [];
  updateKPIs();

  if (currentTaskViewMode === 'week') {
    renderTasksByWeek(container, tasks);
  } else {
    renderTasksByActivity(container, tasks);
  }
};

function renderTaskCard(task) {
  const isDone = task.status === 'done';
  const isInProgress = task.status === 'in_progress';
  const priorityLabels = { urgent: 'Urgente 🔥', high: 'Alta', normal: 'Normal', low: 'Baixa' };
  const priorityColors = { urgent: 'priority-urgent', high: 'priority-high', normal: 'priority-normal', low: 'priority-low' };
  const priorityClass = priorityColors[task.priority] || 'priority-normal';

  const activityIcons = {
    'Emissão': 'ri-radio-line',
    'Produção': 'ri-mic-line',
    'Redes Sociais': 'ri-smartphone-line',
    'Reuniões': 'ri-calendar-event-line',
    'Técnica': 'ri-tools-line',
    'Outros': 'ri-checkbox-circle-line'
  };
  const actIcon = activityIcons[task.activity] || 'ri-task-line';

  let dateLabel = '';
  if (task.dueDate) {
    const d = new Date(task.dueDate);
    dateLabel = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' }).format(d);
  }

  return `
    <div class="task-card ${isDone ? 'task-card-done' : ''} ${priorityClass}" id="task-${escapeHtml(task.id)}">
      <div class="task-card-header">
        <span class="task-activity-pill"><i class="${actIcon}"></i> ${escapeHtml(task.activity || 'Geral')}</span>
        <span class="task-priority-pill ${priorityClass}">${priorityLabels[task.priority] || 'Normal'}</span>
      </div>
      <h4 class="task-card-title ${isDone ? 'task-title-strike' : ''}">${escapeHtml(task.title)}</h4>
      ${task.description ? `<p class="task-card-desc">${escapeHtml(task.description)}</p>` : ''}
      <div class="task-card-meta">
        ${task.assignee ? `<span class="task-assignee"><i class="ri-user-smile-line"></i> ${escapeHtml(task.assignee)}</span>` : '<span class="task-assignee" style="opacity: 0.5;"><i class="ri-team-line"></i> Equipa</span>'}
        ${dateLabel ? `<span class="task-date"><i class="ri-time-line"></i> ${escapeHtml(dateLabel)}</span>` : ''}
      </div>
      <div class="task-card-actions">
        <button type="button" class="task-status-btn ${isDone ? 'btn-status-done' : isInProgress ? 'btn-status-progress' : 'btn-status-todo'}" onclick="toggleTaskStatus('${escapeHtml(task.id)}', '${task.status || 'todo'}')">
          ${isDone ? '<i class="ri-checkbox-circle-fill"></i> Concluída' : isInProgress ? '<i class="ri-loader-2-line"></i> Em Curso' : '<i class="ri-checkbox-blank-circle-line"></i> A Fazer'}
        </button>
        <button type="button" class="task-action-icon-btn" onclick="openEditTaskModal('${escapeHtml(task.id)}')" title="Editar">
          <i class="ri-edit-line"></i>
        </button>
      </div>
    </div>
  `;
}

function renderTasksByWeek(container, tasks) {
  const weeks = [
    { id: 'this_week', title: 'Esta Semana', icon: 'ri-calendar-check-line', color: '#3b82f6' },
    { id: 'next_week', title: 'Semana Seguinte', icon: 'ri-calendar-2-line', color: '#8b5cf6' },
    { id: 'backlog', title: 'Futuro / Backlog', icon: 'ri-inbox-archive-line', color: '#64748b' }
  ];

  container.className = 'tasks-board tasks-board-week';
  container.innerHTML = weeks.map(w => {
    const colTasks = tasks.filter(t => (t.week || 'this_week') === w.id);
    const completedCount = colTasks.filter(t => t.status === 'done').length;

    return `
      <div class="tasks-column">
        <div class="tasks-column-header">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <i class="${w.icon}" style="color: ${w.color};"></i>
            <h3>${w.title}</h3>
          </div>
          <span class="tasks-count-badge">${completedCount}/${colTasks.length}</span>
        </div>
        <div class="tasks-list">
          ${colTasks.length === 0 ? '<div class="tasks-empty-placeholder">Nenhuma tarefa aqui.<br><small>Clica em "+ Nova Tarefa" para adicionar.</small></div>' : colTasks.map(renderTaskCard).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function renderTasksByActivity(container, tasks) {
  let filtered = tasks;
  if (currentTaskActivityFilter !== 'all') {
    filtered = tasks.filter(t => t.activity === currentTaskActivityFilter);
  }

  const statuses = [
    { id: 'todo', title: 'A Fazer', icon: 'ri-checkbox-blank-circle-line', color: '#94a3b8' },
    { id: 'in_progress', title: 'Em Curso', icon: 'ri-loader-4-line', color: '#38bdf8' },
    { id: 'done', title: 'Concluídas', icon: 'ri-checkbox-circle-fill', color: '#34d399' }
  ];

  container.className = 'tasks-board tasks-board-activity';
  container.innerHTML = statuses.map(st => {
    const colTasks = filtered.filter(t => (t.status || 'todo') === st.id);

    return `
      <div class="tasks-column">
        <div class="tasks-column-header">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <i class="${st.icon}" style="color: ${st.color};"></i>
            <h3>${st.title}</h3>
          </div>
          <span class="tasks-count-badge">${colTasks.length}</span>
        </div>
        <div class="tasks-list">
          ${colTasks.length === 0 ? '<div class="tasks-empty-placeholder">Sem tarefas neste estado.</div>' : colTasks.map(renderTaskCard).join('')}
        </div>
      </div>
    `;
  }).join('');
}

window.openTaskModal = function () {
  document.getElementById('taskForm').reset();
  document.getElementById('taskIdInput').value = '';
  document.getElementById('taskModalTitle').textContent = 'Nova Tarefa da Equipa';
  document.getElementById('taskDeleteBtn').style.display = 'none';
  syncTaskChipsFromSelects();
  openModal('taskModal');
};

window.openEditTaskModal = function (id) {
  const task = (window.db.getTasks ? window.db.getTasks() : []).find(t => t.id === id);
  if (!task) return;

  document.getElementById('taskForm').reset();
  document.getElementById('taskIdInput').value = task.id;
  document.getElementById('taskTitleInput').value = task.title || '';
  document.getElementById('taskDescriptionInput').value = task.description || '';
  document.getElementById('taskActivityInput').value = task.activity || 'Emissão';
  document.getElementById('taskPriorityInput').value = task.priority || 'normal';
  document.getElementById('taskWeekInput').value = task.week || 'this_week';
  document.getElementById('taskStatusInput').value = task.status || 'todo';
  document.getElementById('taskDueDateInput').value = task.dueDate || '';
  document.getElementById('taskAssigneeInput').value = task.assignee || '';

  syncTaskChipsFromSelects();
  document.getElementById('taskModalTitle').textContent = 'Editar Tarefa';
  document.getElementById('taskDeleteBtn').style.display = 'inline-flex';
  openModal('taskModal');
};

window.saveTaskForm = function (event) {
  event.preventDefault();
  const id = document.getElementById('taskIdInput').value;
  const title = document.getElementById('taskTitleInput').value.trim();
  const description = document.getElementById('taskDescriptionInput').value.trim();
  const activity = document.getElementById('taskActivityInput').value;
  const priority = document.getElementById('taskPriorityInput').value;
  const week = document.getElementById('taskWeekInput').value;
  const status = document.getElementById('taskStatusInput').value;
  const dueDate = document.getElementById('taskDueDateInput').value;
  const assignee = document.getElementById('taskAssigneeInput').value.trim();

  if (!title) {
    showToast('Por favor, indica o título da tarefa.', 'warning');
    return;
  }

  const task = {
    id: id || undefined,
    title,
    description,
    activity,
    priority,
    week,
    status,
    dueDate,
    assignee,
    createdAt: Date.now()
  };

  window.db.saveTask(task);
  closeModal('taskModal');
  renderTasksView();
  showToast(id ? 'Tarefa atualizada com sucesso!' : 'Nova tarefa criada com sucesso!', 'success');
};

window.deleteOpenTask = function () {
  const id = document.getElementById('taskIdInput').value;
  if (!id) return;
  if (confirm('Eliminar esta tarefa da equipa?')) {
    window.db.deleteTask(id);
    closeModal('taskModal');
    renderTasksView();
    showToast('Tarefa eliminada com sucesso.', 'info');
  }
};

window.toggleTaskStatus = function (id, currentStatus) {
  const nextStatus = currentStatus === 'todo' ? 'in_progress' : currentStatus === 'in_progress' ? 'done' : 'todo';
  window.db.updateTaskStatus(id, nextStatus);
  renderTasksView();
  showToast('Estado da tarefa atualizado.', 'info');
};

/* ==========================================================================
   SISTEMA DE VOTAÇÕES E SONDAGENS ESCOLARES (POLLS)
   ========================================================================== */
window.renderAdminPollsTable = async function () {
  const container = document.getElementById('pollsGrid');
  if (!container) return;

  const polls = window.db.getPolls ? window.db.getPolls() : [];

  if (polls.length === 0) {
    container.innerHTML = `
      <div class="card-panel" style="grid-column: 1 / -1; text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
        <i class="ri-bar-chart-2-line" style="font-size: 2.5rem; color: #a78bfa; margin-bottom: 0.5rem; display: inline-block;"></i>
        <h3 style="margin-bottom: 0.25rem; font-size: 1.1rem;">Ainda não existem votações criadas</h3>
        <p style="font-size: 0.85rem; max-width: 420px; margin: 0 auto 1.25rem;">Cria a tua primeira sondagem para recolher opiniões dos alunos ou de toda a comunidade.</p>
        <button class="btn-submit-main" onclick="openPollModal()"><i class="ri-add-line"></i> Criar Nova Votação</button>
      </div>
    `;
    return;
  }

  container.innerHTML = '<div style="grid-column: 1 / -1; padding: 1rem; color: var(--text-muted);"><i class="ri-loader-4-line ri-spin"></i> A carregar sondagens e votos...</div>';

  const renderedCards = await Promise.all(polls.map(async (p) => {
    const isClosed = p.closed || (p.closingDate && new Date(p.closingDate).setHours(23, 59, 59, 999) < Date.now());
    const audienceLabels = {
      all: '🌍 Público Geral',
      school_process: '🏫 Alunos (N.º Processo)',
      school_class: '🏫 Alunos (Ano/Turma)'
    };
    const audienceLabel = audienceLabels[p.audience] || '🌍 Público';

    const voteCounts = await window.db.getPollVoteCounts(p.id);
    const totalVotes = Object.values(voteCounts).reduce((acc, c) => acc + c, 0);

    const dateFormatted = p.createdAt ? new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(p.createdAt)) : '';

    return `
      <div class="poll-admin-card ${isClosed ? 'poll-closed' : ''}">
        <div class="poll-card-header">
          <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
            <span class="poll-badge ${isClosed ? 'poll-badge-closed' : 'poll-badge-active'}">
              ${isClosed ? '🔒 Encerrada' : '🟢 Aberta'}
            </span>
            <span class="poll-audience-tag">${audienceLabel}</span>
          </div>
          <span class="poll-votes-counter"><i class="ri-user-voice-line"></i> ${totalVotes} ${totalVotes === 1 ? 'voto' : 'votos'}</span>
        </div>

        <h3 class="poll-card-question">${escapeHtml(p.question)}</h3>
        ${p.description ? `<p class="poll-card-desc">${escapeHtml(p.description)}</p>` : ''}

        <div class="poll-options-preview">
          ${(p.options || []).map((opt, idx) => {
      const count = voteCounts[idx] || 0;
      const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
      return `
              <div class="poll-opt-bar-wrapper">
                <div class="poll-opt-info">
                  <span class="poll-opt-text">${escapeHtml(opt)}</span>
                  <span class="poll-opt-stats">${count} (${pct}%)</span>
                </div>
                <div class="poll-opt-progress-track">
                  <div class="poll-opt-progress-fill" style="width: ${pct}%;"></div>
                </div>
              </div>
            `;
    }).join('')}
        </div>

        <div class="poll-card-footer">
          <span class="poll-card-date"><i class="ri-time-line"></i> ${dateFormatted}</span>
          <div class="poll-actions-group">
            <button class="btn-action" onclick="copyPollShareLink('${escapeHtml(p.id)}')" title="Copiar link para partilhar com alunos"><i class="ri-share-forward-line"></i> Link</button>
            <button class="btn-action" onclick="viewPollDetailsModal('${escapeHtml(p.id)}')" title="Ver detalhes completos"><i class="ri-pie-chart-line"></i></button>
            <button class="btn-action" onclick="openEditPollModal('${escapeHtml(p.id)}')" title="Editar"><i class="ri-edit-line"></i></button>
            <button class="btn-action danger-action" onclick="deletePollDirect('${escapeHtml(p.id)}')" title="Eliminar"><i class="ri-delete-bin-line"></i></button>
          </div>
        </div>
      </div>
    `;
  }));

  container.innerHTML = renderedCards.join('');
};

window.openPollModal = function () {
  document.getElementById('pollForm').reset();
  document.getElementById('pollIdInput').value = '';
  document.getElementById('pollModalTitle').textContent = 'Nova Votação / Sondagem';
  document.getElementById('pollDeleteBtn').style.display = 'none';

  const container = document.getElementById('pollOptionsContainer');
  container.innerHTML = '';
  // Start with 2 default empty options
  addPollOptionInput('Sim');
  addPollOptionInput('Não');

  openModal('pollModal');
};

window.openEditPollModal = function (id) {
  const poll = (window.db.getPolls ? window.db.getPolls() : []).find(p => p.id === id);
  if (!poll) return;

  document.getElementById('pollForm').reset();
  document.getElementById('pollIdInput').value = poll.id;
  document.getElementById('pollQuestionInput').value = poll.question || '';
  document.getElementById('pollDescriptionInput').value = poll.description || '';
  document.getElementById('pollAudienceInput').value = poll.audience || 'all';
  document.getElementById('pollVoteLimitInput').value = poll.voteLimit || 'single';
  document.getElementById('pollClosingDateInput').value = poll.closingDate || '';
  document.getElementById('pollStatusInput').value = poll.closed ? 'closed' : 'active';

  const container = document.getElementById('pollOptionsContainer');
  container.innerHTML = '';
  (poll.options || []).forEach(opt => addPollOptionInput(opt));
  if ((poll.options || []).length === 0) {
    addPollOptionInput('');
    addPollOptionInput('');
  }

  document.getElementById('pollModalTitle').textContent = 'Editar Votação';
  document.getElementById('pollDeleteBtn').style.display = 'inline-flex';
  openModal('pollModal');
};

window.addPollOptionInput = function (value = '') {
  const container = document.getElementById('pollOptionsContainer');
  if (!container) return;

  const count = container.children.length + 1;
  const row = document.createElement('div');
  row.className = 'poll-option-row';
  row.style.display = 'flex';
  row.style.gap = '0.5rem';
  row.style.alignItems = 'center';
  row.innerHTML = `
    <span style="font-size: 0.85rem; color: var(--text-muted); width: 24px; text-align: center;">${count}.</span>
    <input type="text" class="form-input-lg poll-option-input" placeholder="Opção ${count}" value="${escapeHtml(value)}" required style="flex: 1;">
    <button type="button" class="btn-action danger-action" style="padding: 0.35rem 0.5rem;" onclick="removePollOptionInput(this)" title="Remover opção"><i class="ri-delete-bin-line"></i></button>
  `;
  container.appendChild(row);
};

window.removePollOptionInput = function (btn) {
  const container = document.getElementById('pollOptionsContainer');
  if (!container) return;
  if (container.children.length <= 2) {
    alert('Uma votação tem de ter pelo menos 2 opções.');
    return;
  }
  const row = btn.closest('.poll-option-row');
  if (row) row.remove();
  // Re-number labels
  Array.from(container.children).forEach((r, idx) => {
    const label = r.querySelector('span');
    if (label) label.textContent = `${idx + 1}.`;
  });
};

window.savePollForm = function (event) {
  event.preventDefault();
  const id = document.getElementById('pollIdInput').value;
  const question = document.getElementById('pollQuestionInput').value.trim();
  const description = document.getElementById('pollDescriptionInput').value.trim();
  const audience = document.getElementById('pollAudienceInput').value;
  const voteLimit = document.getElementById('pollVoteLimitInput').value;
  const closingDate = document.getElementById('pollClosingDateInput').value;
  const isClosed = document.getElementById('pollStatusInput').value === 'closed';

  const optionInputs = document.querySelectorAll('#pollOptionsContainer .poll-option-input');
  const options = Array.from(optionInputs).map(inp => inp.value.trim()).filter(Boolean);

  if (!question || options.length < 2) {
    showToast('Preenche a pergunta e pelo menos duas opções válidas.', 'warning');
    return;
  }

  const poll = {
    id: id || undefined,
    question,
    description,
    audience,
    voteLimit,
    closingDate,
    closed: isClosed,
    options,
    createdAt: Date.now()
  };

  window.db.savePoll(poll);
  closeModal('pollModal');
  renderAdminPollsTable();
  showToast(id ? 'Votação atualizada com sucesso!' : 'Nova votação criada e publicada!', 'success');
};

window.deleteOpenPoll = function () {
  const id = document.getElementById('pollIdInput').value;
  if (!id) return;
  if (confirm('Eliminar esta votação e todos os seus dados?')) {
    window.db.deletePoll(id);
    closeModal('pollModal');
    renderAdminPollsTable();
    showToast('Votação eliminada.', 'info');
  }
};

window.deletePollDirect = function (id) {
  if (confirm('Eliminar esta votação permanentemente?')) {
    window.db.deletePoll(id);
    renderAdminPollsTable();
    showToast('Votação eliminada.', 'info');
  }
};

let currentViewedPollId = null;

window.viewPollDetailsModal = async function (id) {
  const poll = (window.db.getPolls ? window.db.getPolls() : []).find(p => p.id === id);
  if (!poll) return;

  currentViewedPollId = id;
  const isClosed = poll.closed || (poll.closingDate && new Date(poll.closingDate).setHours(23, 59, 59, 999) < Date.now());

  document.getElementById('pollResultBadge').textContent = isClosed ? '🔒 Votação Encerrada' : '🟢 Votação Aberta';
  document.getElementById('pollResultTitle').textContent = poll.question;
  document.getElementById('pollResultDesc').textContent = poll.description || `Criada em ${new Date(poll.createdAt).toLocaleDateString('pt-PT')}`;

  const contentEl = document.getElementById('pollResultsContent');
  contentEl.innerHTML = '<div style="padding: 1rem; color: var(--text-muted);"><i class="ri-loader-4-line ri-spin"></i> A calcular votos...</div>';

  openModal('pollResultsModal');

  const voteCounts = await window.db.getPollVoteCounts(id);
  const totalVotes = Object.values(voteCounts).reduce((acc, c) => acc + c, 0);

  contentEl.innerHTML = `
    <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 8px; padding: 0.85rem 1rem; display: flex; justify-content: space-between; align-items: center;">
      <span style="font-size: 0.9rem; color: var(--text-muted);"><i class="ri-group-line"></i> Total de Participantes / Votos:</span>
      <strong style="font-size: 1.15rem; color: var(--text-bright);">${totalVotes}</strong>
    </div>
    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
      ${(poll.options || []).map((opt, idx) => {
    const count = voteCounts[idx] || 0;
    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
    return `
          <div class="poll-result-bar-card">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem; font-size: 0.9rem;">
              <span style="font-weight: 500; color: var(--text-bright);">${escapeHtml(opt)}</span>
              <span style="font-weight: 600; color: #a78bfa;">${count} votos (${pct}%)</span>
            </div>
            <div class="poll-opt-progress-track" style="height: 10px;">
              <div class="poll-opt-progress-fill" style="width: ${pct}%; background: linear-gradient(90deg, #8b5cf6, #3b82f6);"></div>
            </div>
          </div>
        `;
  }).join('')}
    </div>
  `;
};

window.copyPollShareLink = function (pollId) {
  const currentPath = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
  const shareUrl = `${currentPath}vote.html?id=${encodeURIComponent(pollId)}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('Link de votação copiado para a área de transferência!', 'success', 'Link Copiado');
    }).catch(() => {
      prompt('Copia o link da votação:', shareUrl);
    });
  } else {
    prompt('Copia o link da votação:', shareUrl);
  }
};

window.copyCurrentPollShareLink = function () {
  if (currentViewedPollId) {
    copyPollShareLink(currentViewedPollId);
  }
};

/* ==========================================================================
   ROBUSTEZ: TIMEOUT DE SESSÃO
   ========================================================================== */
const SESSION_CONFIG = {
  IDLE_TIMEOUT_MS: 30 * 60 * 1000,
  WARNING_BEFORE_MS: 5 * 60 * 1000,
  CHECK_INTERVAL_MS: 1000
};

let _sessionTimer = null;
let _sessionCountdown = null;
let _sessionWarningShown = false;
let _lastActivity = Date.now();

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

function _resetSessionTimer() {
  _lastActivity = Date.now();
  if (_sessionWarningShown) {
    dismissSessionTimeout();
  }
}

function _startSessionMonitor() {
  ACTIVITY_EVENTS.forEach(evt => {
    document.addEventListener(evt, _resetSessionTimer, { passive: true });
  });

  _sessionTimer = setInterval(() => {
    const elapsed = Date.now() - _lastActivity;
    const total = SESSION_CONFIG.IDLE_TIMEOUT_MS;
    const warnAt = total - SESSION_CONFIG.WARNING_BEFORE_MS;

    if (elapsed >= warnAt && !_sessionWarningShown) {
      _sessionWarningShown = true;
      const modal = document.getElementById('sessionTimeoutModal');
      if (modal) {
        modal.classList.add('active');
        const progress = document.getElementById('sessionTimeoutProgress');
        const countdown = document.getElementById('sessionTimeoutCountdown');
        if (progress) progress.style.width = '0%';
        if (countdown) countdown.textContent = Math.ceil(SESSION_CONFIG.WARNING_BEFORE_MS / 60000) + ' minutos';
      }
    }

    if (elapsed >= total) {
      clearInterval(_sessionTimer);
      forceLogout();
      return;
    }

    const remaining = total - elapsed;
    const pct = (remaining / total) * 100;
    const progress = document.getElementById('sessionTimeoutProgress');
    const countdown = document.getElementById('sessionTimeoutCountdown');
    if (progress) progress.style.width = pct + '%';
    if (countdown) {
      const secs = Math.ceil(remaining / 1000);
      if (secs >= 60) {
        countdown.textContent = Math.floor(secs / 60) + ' min ' + (secs % 60) + ' s';
      } else {
        countdown.textContent = secs + ' s';
      }
    }
  }, SESSION_CONFIG.CHECK_INTERVAL_MS);
}

window.dismissSessionTimeout = function () {
  _sessionWarningShown = false;
  _lastActivity = Date.now();
  const modal = document.getElementById('sessionTimeoutModal');
  if (modal) modal.classList.remove('active');
};

window.forceLogout = function () {
  if (_sessionTimer) clearInterval(_sessionTimer);
  if (_sessionCountdown) clearInterval(_sessionCountdown);
  if (window.firebaseServices && window.firebaseServices.auth) {
    window.firebaseServices.auth.signOut().catch(() => { });
  }
  window.location.href = 'admin.html';
};

/* ==========================================================================
   ROBUSTEZ: DETEÇÃO DE OFFLINE
   ========================================================================== */
function _updateOfflineStatus() {
  const banner = document.getElementById('offlineBanner');
  if (!banner) return;
  if (navigator.onLine) {
    banner.style.display = 'none';
    showToast('Ligação à internet restabelecida.', 'success', 'Online');
  } else {
    banner.style.display = 'block';
    showToast('Sem ligação à internet. As alterações serão guardadas localmente.', 'warning', 'Offline');
  }
}

document.addEventListener('online', _updateOfflineStatus);
document.addEventListener('offline', _updateOfflineStatus);

/* ==========================================================================
   ROBUSTEZ: ATALHOS DE TECLADO
   ========================================================================== */
document.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
    return;
  }

  const ctrl = e.ctrlKey || e.metaKey;

  if (ctrl && e.key === 's') {
    e.preventDefault();
    const submitBtn = document.querySelector('.modal-window form button[type="submit"]');
    if (submitBtn && document.querySelector('.modal-overlay.active')) {
      submitBtn.click();
    }
    return;
  }

  if (ctrl && e.key === 'n') {
    e.preventDefault();
    const addBtns = document.querySelectorAll('[data-add-handler]');
    if (addBtns.length > 0) addBtns[0].click();
    return;
  }

  if (e.altKey && e.key === 'c') { e.preventDefault(); openModal('calendarEventModal'); }
  if (e.altKey && e.key === 'g') { e.preventDefault(); openModal('rundownModal'); }
  if (e.altKey && e.key === 'v') { e.preventDefault(); switchAdminMode('aovivo'); }
  if (e.altKey && e.key === 'u') { e.preventDefault(); openModal('adminUserModal'); }
});

/* ==========================================================================
   ROBUSTEZ: REGISTO DE AUDITORIA LOCAL
   ========================================================================== */
window.logAdminAction = function (action, details, severity = 'info') {
  const entry = {
    action,
    details: typeof details === 'string' ? details : JSON.stringify(details),
    severity,
    timestamp: Date.now(),
    user: (window.firebaseServices && window.firebaseServices.auth && window.firebaseServices.auth.currentUser && window.firebaseServices.auth.currentUser.uid) || 'unknown',
    url: window.location.href
  };
  try {
    const log = JSON.parse(localStorage.getItem('adminAuditLog') || '[]');
    log.push(entry);
    if (log.length > 2000) log.splice(0, log.length - 2000);
    localStorage.setItem('adminAuditLog', JSON.stringify(log));
  } catch (_) { }
};

/* ==========================================================================
   ROBUSTEZ: BOTÃO COM ESTADO DE CARREGAMENTO
   ========================================================================== */
window.setButtonLoading = function (btn, loading, originalText) {
  if (!btn) return;
  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> ' + (originalText || 'A carregar...');
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalText || originalText || '';
  }
};

/* ==========================================================================
   ROBUSTEZ: ENVIO DE FORMULÁRIO COM TRATAMENTO DE ERROS
   ========================================================================== */
window.safeSubmit = async function (formEl, submitBtn, asyncFn, options = {}) {
  if (!formEl) return;
  const btn = submitBtn || formEl.querySelector('button[type="submit"]');
  const originalText = btn ? btn.dataset.originalText || btn.textContent : '';
  try {
    if (btn) setButtonLoading(btn, true, originalText);
    const result = await asyncFn();
    if (options.onSuccess) options.onSuccess(result);
    return result;
  } catch (error) {
    console.error('Erro no envio do formulário:', error);
    showToast(error.message || 'Ocorreu um erro. Tenta novamente.', 'error');
    logAdminAction('form_error', { message: error.message, stack: error.stack }, 'error');
    if (options.onError) options.onError(error);
  } finally {
    if (btn) setButtonLoading(btn, false, originalText);
  }
};

/* ==========================================================================
   INICIALIZAÇÃO DE ROBUSTEZ
   ========================================================================== */
function initRobustness() {
  _startSessionMonitor();
  _updateOfflineStatus();
  logAdminAction('session_start', 'Painel de administração aberto', 'info');
}

/* ==========================================================================
   ROBUSTEZ: MONITORIZAÇÃO DE AUTENTICAÇÃO
   ========================================================================== */
function _monitorAuthState() {
  const auth = window.firebaseServices && window.firebaseServices.auth;
  if (!auth) return;

  let wasAuthenticated = false;

  if (auth.currentUser) {
    wasAuthenticated = true;
    try { auth.currentUser.getIdTokenResult(true).catch(() => { }); } catch (_) { }
  }

  auth.onAuthStateChanged((user) => {
    if (!user) {
      if (wasAuthenticated) {
        showToast('Sessão encerrada.', 'warning', 'Sessão Terminada');
        logAdminAction('auth_state_change', 'Utilizador desautenticado', 'warning');
        setTimeout(() => { window.location.href = 'admin.html'; }, 1500);
      }
      return;
    }
    wasAuthenticated = true;
    try { user.getIdTokenResult(true).catch(() => { }); } catch (_) { }
  });
}

/* ==========================================================================
   ROBUSTEZ: TRATAMENTO GLOBAL DE ERROS
   ========================================================================== */
window.addEventListener('error', (event) => {
  console.error('Erro global:', event.error);
  logAdminAction('global_error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  }, 'error');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Promessa rejeitada não tratada:', event.reason);
  logAdminAction('unhandled_rejection', {
    reason: String(event.reason)
  }, 'error');
});

/* ==========================================================================
   ROBUSTEZ: AUTO-SAVE DE RASCUNHOS DE FORMULÁRIOS
   ========================================================================== */
window.saveFormDraft = function (formId, data) {
  try {
    localStorage.setItem('adminDraft:' + formId, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (_) { }
};

window.loadFormDraft = function (formId) {
  try {
    const stored = localStorage.getItem('adminDraft:' + formId);
    if (!stored) return null;
    const draft = JSON.parse(stored);
    if (Date.now() - draft.timestamp > 86400000) {
      localStorage.removeItem('adminDraft:' + formId);
      return null;
    }
    return draft.data;
  } catch (_) {
    return null;
  }
};

window.clearFormDraft = function (formId) {
  localStorage.removeItem('adminDraft:' + formId);
};

function _initFormDraftSave() {
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (form && form.id && form.tagName === 'FORM') {
      clearFormDraft(form.id);
    }
  }, true);
}

/* ==========================================================================
   ROBUSTEZ: REVERIFICAÇÃO DE PERMISSÕES
   ========================================================================== */
async function _recheckPermissions() {
  const auth = window.firebaseServices && window.firebaseServices.auth;
  if (!auth || !auth.currentUser) return;

  try {
    const token = await auth.currentUser.getIdTokenResult();
    const claims = token.claims || {};
    const hasAdminClaim = claims.admin === true || claims.super_admin === true;
    const hasAnyPerm = Object.values(claims.permissions || {}).some(v => v === true);

    if (!hasAdminClaim && !hasAnyPerm) {
      showToast('A tua permissão de administrador não foi detetada. Contacta o administrador.', 'error', 'Sem Permissões');
      logAdminAction('permission_check', 'Utilizador sem permissões de admin', 'error');
    }
  } catch (_) { }
}

/* ==========================================================================
   ROBUSTEZ: EXPORTAÇÃO DE DADOS DE BACKUP
   ========================================================================== */
window.exportAdminBackup = function () {
  try {
    const backup = {
      timestamp: Date.now(),
      version: '1.0',
      collections: {}
    };

    const cacheKeys = ['podcasts', 'announcements', 'links', 'suggestions', 'messages', 'rundowns', 'teamMemos', 'calendarEvents', 'adminUsers', 'polls', 'tasks'];
    cacheKeys.forEach(key => {
      if (window.db.cache && window.db.cache[key]) {
        backup.collections[key] = window.db.cache[key];
      }
    });

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Backup exportado com sucesso!', 'success', 'Backup Feito');
    logAdminAction('data_export', 'Backup de dados exportado', 'info');
  } catch (error) {
    showToast('Erro ao exportar backup.', 'error');
    logAdminAction('export_error', error.message, 'error');
  }
};

/* ==========================================================================
   INICIALIZAÇÃO DE ROBUSTEZ
   ========================================================================== */
function initRobustness() {
  _startSessionMonitor();
  _updateOfflineStatus();
  logAdminAction('session_start', 'Painel de administração aberto', 'info');
  _monitorAuthState();
  _initFormDraftSave();
  _recheckPermissions();
  _initUnsavedWarning();
}

function _initUnsavedWarning() {
  window.addEventListener('beforeunload', (e) => {
    try {
      const drafts = Object.keys(localStorage).filter(k => k.startsWith('adminDraft:'));
      if (drafts.length > 0) {
        e.preventDefault();
        e.returnValue = 'Tens formulários com rascunhos não guardados. Queres sair mesmo assim?';
        return e.returnValue;
      }
    } catch (_) { }
  });
}

function _checkStorageQuota() {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'x');
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    showToast('Espaço de armazenamento local cheio. Alguns recursos podem não funcionar.', 'error', 'Armazenamento Cheio');
    logAdminAction('storage_quota', 'localStorage quota exceeded', 'error');
    return false;
  }
}

_checkStorageQuota();

initRobustness();