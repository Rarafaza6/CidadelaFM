/* ==========================================================================
   RÁDIO EBS CIDADELA - PAINEL DE ADMINISTRAÇÃO (SENIOR DEV VERSION)
   Ranking de Músicas Mais Pedidas, Gestão do Linktree, Podcasts e KPIs
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  if (!window.db || typeof window.db.ready !== 'function') {
    console.warn('Base de dados não inicializada. Verifica o carregamento do Firebase e dos scripts do admin.');
    return;
  }
  await window.db.ready();
  initAdminAuth();
  initAdminTabs();
});

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
      if (overlay) overlay.classList.add('active');
      return;
    }
    try {
      await window.db.loadPrivateCollections();
    } catch (error) {
      console.warn('Aviso ao sincronizar coleções privadas do Firestore:', error);
    }
    if (overlay) {
      overlay.classList.remove('active');
    }
    if (authAlert) {
      authAlert.innerHTML = '';
    }
    loadAdminDashboard();
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
  renderAdminOverview();
  renderAoVivo();
  initIntervalBellTimer();
}


function updateKPIs() {
  const suggestions = window.db.getSuggestions();
  const pending = suggestions.filter(s => s.status === 'pending');
  const links = window.db.getLinks().filter(l => l.active !== false);
  const unreadMessages = window.db.getMessages().filter(message => message.status === 'unread');

  const sideSongs = document.getElementById('sideKpiSongs');
  const sideMessages = document.getElementById('sideKpiMessages');
  const sideLinks = document.getElementById('sideKpiLinks');
  const badgeSongs = document.getElementById('sideNavBadgeSongs');
  const badgeMessages = document.getElementById('sideNavBadgeMessages');

  if (sideSongs) sideSongs.innerText = pending.length;
  if (sideMessages) sideMessages.innerText = unreadMessages.length;
  if (sideLinks) sideLinks.innerText = links.length;

  if (badgeSongs) {
    badgeSongs.innerText = pending.length > 0 ? pending.length : '';
  }
  if (badgeMessages) {
    badgeMessages.innerText = unreadMessages.length > 0 ? unreadMessages.length : '';
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

window.playAudioPreview = function(url) {
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

window.changeGroupStatus = function(ids, newStatus) {
  ids.forEach(id => window.db.updateSuggestionStatus(id, newStatus));
  updateKPIs();
  renderSongRankingTable();
};

window.filterSongsByStatus = function(status) {
  renderSongRankingTable(status);
};

window.clearAllSuggestions = function() {
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

window.toggleLinkActive = function(id) {
  window.db.toggleLink(id);
  updateKPIs();
  renderAdminLinksTable();
};

window.deleteLinkItem = function(id) {
  if (confirm('Eliminar este link do Linktree?')) {
    window.db.deleteLink(id);
    updateKPIs();
    renderAdminLinksTable();
  }
};

window.saveNewLink = function(e) {
  e.preventDefault();
  const title = document.getElementById('linkTitleInput').value.trim();
  const subtitle = document.getElementById('linkSubInput').value.trim();
  const url = document.getElementById('linkUrlInput').value.trim();
  const icon = document.getElementById('linkIconInput').value.trim() || 'ri-link';
  const badge = document.getElementById('linkBadgeInput').value.trim();

  if (!title || !url) return;

  window.db.addLink({ title, subtitle, url, icon, badge });
  document.getElementById('addLinkForm').reset();
  closeModal('addLinkModal');
  updateKPIs();
  renderAdminLinksTable();
};

/* ==========================================================================
   3. GESTÃO DE PODCASTS & ANÚNCIOS
   ========================================================================== */
function renderAdminPodcastsTable() {
  const tbody = document.getElementById('podcastsAdminTbody');
  if (!tbody) return;

  const list = window.db.getPodcasts();
  tbody.innerHTML = '';
  list.forEach(pod => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(pod.title)}</strong></td>
      <td style="font-size: 0.85rem;">${escapeHtml(pod.date)} (${pod.duration})</td>
      <td>
        <button class="btn-action" style="color: #ef4444;" onclick="deletePodcastItem('${pod.id}')"><i class="ri-delete-bin-line"></i> Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.deletePodcastItem = function(id) {
  if (confirm('Eliminar este podcast?')) {
    window.db.deletePodcast(id);
    updateKPIs();
    renderAdminPodcastsTable();
  }
};

window.saveNewPodcast = function(e) {
  e.preventDefault();
  const title = document.getElementById('podTitleInput').value.trim();
  const date = document.getElementById('podDateInput').value.trim();
  const duration = document.getElementById('podDurationInput').value.trim() || '15:00';
  const audioUrl = document.getElementById('podUrlInput').value.trim();
  const description = document.getElementById('podDescInput').value.trim();

  if (!title || !audioUrl) return;

  window.db.addPodcast({ title, date, duration, audioUrl, description });
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

window.deleteAnnouncementItem = function(id) {
  if (confirm('Eliminar esta notícia?')) {
    window.db.deleteAnnouncement(id);
    renderAdminAnnouncementsTable();
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

window.selectMessage = function(id) {
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

window.markMessageRead = function(id) {
  window.db.updateMessageStatus(id, 'read');
  updateKPIs();
  renderAdminMessagesTable();
  renderSharedCalendar();
  renderAdminUsersTable();
  renderAdminOverview();
};

window.deleteMessageItem = function(id) {
  if (confirm('Eliminar esta mensagem?')) {
    window.db.deleteMessage(id);
    updateKPIs();
    renderAdminMessagesTable();
  renderSharedCalendar();
  renderAdminUsersTable();
  renderAdminOverview();
  }
};

window.saveNewAnnouncement = function(e) {
  e.preventDefault();
  const tag = document.getElementById('annTagInput').value.trim() || 'Notícia';
  const title = document.getElementById('annTitleInput').value.trim();
  const date = document.getElementById('annDateInput').value.trim() || new Date().toLocaleDateString('pt-PT');
  const content = document.getElementById('annContentInput').value.trim();

  if (!title || !content) return;

  window.db.addAnnouncement({ tag, title, date, content });
  document.getElementById('addAnnouncementForm').reset();
  closeModal('addAnnouncementModal');
  renderAdminAnnouncementsTable();
};

/* ==========================================================================
   4. MODAIS E NAVEGAÇÃO ENTRE SEÇÕES
   ========================================================================== */
function initAdminTabs() {
  const tabs = document.querySelectorAll('.admin-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchAdminSection(tab.dataset.target);
    });
  });
}

window.openModal = function(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
};

window.closeModal = function(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
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

window.onCalendarCategoryChange = function(category) {
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

window.calendarDragStart = function(event, eventId) {
  if (!event || !event.dataTransfer) return;
  event.dataTransfer.setData('text/plain', eventId);
  event.dataTransfer.effectAllowed = 'move';
};

window.calendarAllowDrop = function(event) {
  if (!event) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
};

window.calendarDropOnDay = function(event, dateKey) {
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

window.selectCalendarDate = function(dateKey) {
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

window.openCalendarEventModal = function(id = '', date = '') {
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

window.saveCalendarEvent = function(event) {
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

window.deleteOpenCalendarEvent = function() {
  const id = document.getElementById('calendarEventIdInput').value;
  if (id && confirm('Eliminar este evento do calendário partilhado?')) {
    window.db.deleteCalendarEvent(id);
    closeModal('calendarEventModal');
    renderSharedCalendar();
  }
};
function renderAdminUsersTable() {
  const tbody = document.getElementById('adminUsersTbody');
  if (!tbody) return;
  const users = window.db.getAdminUsers();
  tbody.innerHTML = users.length ? users.map(user => `<tr><td><strong>${escapeHtml(user.name)}</strong></td><td>${user.email ? `<a href="mailto:${escapeHtml(user.email)}">${escapeHtml(user.email)}</a>` : '<span style="color: var(--text-muted);">Não indicado</span>'}</td><td><span class="status-badge status-played"><i class="ri-shield-check-line"></i> Administrador</span></td><td class="table-actions"><button class="btn-action" onclick="openUserModal('${user.id}')"><i class="ri-edit-line"></i> Editar</button><button class="btn-action danger-action" onclick="deleteAdminUserItem('${user.id}')"><i class="ri-delete-bin-line"></i> Eliminar</button></td></tr>`).join('') : '<tr><td colspan="4" class="admin-empty-cell"><i class="ri-team-line"></i> Ainda não há utilizadores. Adiciona os membros da equipa para os poderes atribuir aos eventos.</td></tr>';
}

window.openUserModal = function(id = '') {
  const user = id ? window.db.getAdminUsers().find(item => item.id === id) : null;
  document.getElementById('adminUserForm').reset();
  document.getElementById('adminUserIdInput').value = user?.id || '';
  document.getElementById('adminUserNameInput').value = user?.name || '';
  document.getElementById('adminUserEmailInput').value = user?.email || '';
  document.getElementById('adminUserModalTitle').textContent = user ? 'Editar utilizador' : 'Adicionar utilizador';
  openModal('adminUserModal');
};

window.saveAdminUser = function(event) {
  event.preventDefault();
  const id = document.getElementById('adminUserIdInput').value;
  const name = document.getElementById('adminUserNameInput').value.trim();
  if (!name) return;
  window.db.saveAdminUser({ id: id || undefined, name, email: document.getElementById('adminUserEmailInput').value.trim() });
  closeModal('adminUserModal'); renderAdminUsersTable(); renderSharedCalendar();
};

window.deleteAdminUserItem = function(id) {
  if (confirm('Eliminar este utilizador da lista? Os eventos existentes mantêm o nome registado.')) { window.db.deleteAdminUser(id); renderAdminUsersTable(); renderSharedCalendar(); }
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

window.openDailyBriefEditor = function(date = localDateKey(new Date())) {
  window.location.href = `admin-editor.html?brief=${encodeURIComponent(date)}`;
};

/* ==========================================================================
   NAVEGAÇÃO EDITORIAL & MODO AO VIVO
   ========================================================================== */
let currentAdminMode = 'editorial';
let currentAoVivoSongFilter = 'pending';

window.switchAdminMode = function(mode) {
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
    if (zoneEditorial) zoneEditorial.style.display = 'none';
    if (zoneAoVivo) zoneAoVivo.style.display = 'flex';
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
    if (zoneEditorial) zoneEditorial.style.display = 'flex';
    if (zoneAoVivo) zoneAoVivo.style.display = 'none';
    if (btnEditorial) {
      btnEditorial.classList.add('active');
      btnEditorial.setAttribute('aria-selected', 'true');
    }
    if (btnAoVivo) {
      btnAoVivo.classList.remove('active');
      btnAoVivo.setAttribute('aria-selected', 'false');
    }
    renderAdminOverview();
  }
};

window.switchAdminSection = function(target) {
  document.querySelectorAll('.sidebar-nav-item').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.target === target);
  });
  document.querySelectorAll('.admin-section').forEach(section => {
    section.style.display = section.id === target ? 'block' : 'none';
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
};


/* ==========================================================================
   CONSOLA DE EMISSÃO AO VIVO (STUDIO BROADCASTER COMPANION)
   Guião Word/Notion por dia + Músicas Pedidas + Relógio de Estúdio
   ========================================================================== */
let aoVivoClockTimer = null;
let aoVivoSelectedDate = localDateKey(new Date());
let aoVivoFontSize = 16; // px
let aoVivoSaveDebounceTimer = null;

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

  const readerDisplay = document.getElementById('aoVivoScriptDisplay');
  const rawContent = readerDisplay && readerDisplay.dataset.rawContent ? readerDisplay.dataset.rawContent : '';
  if (rawContent && /\[hora\]|xx:xx/i.test(rawContent)) {
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
window.toggleAoVivoFullscreen = function() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
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
window.changeAoVivoDate = function(deltaDays) {
  const parts = aoVivoSelectedDate.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + deltaDays);
  aoVivoSelectedDate = localDateKey(d);
  
  const datePicker = document.getElementById('aoVivoDatePicker');
  if (datePicker) datePicker.value = aoVivoSelectedDate;
  loadAoVivoDailyScript();
};

window.setAoVivoDateToday = function() {
  aoVivoSelectedDate = localDateKey(new Date());
  const datePicker = document.getElementById('aoVivoDatePicker');
  if (datePicker) datePicker.value = aoVivoSelectedDate;
  loadAoVivoDailyScript();
};

window.onAoVivoDatePickerChange = function(newDate) {
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
  } catch (e) {}

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

window.insertSingleTopicToScript = function(topicIndex, isAoVivo = false) {
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

window.syncAoVivoTopicsFromCalendar = function() {
  syncTopicsFromCalendar(true);
};

window.syncEditorialTopicsFromCalendar = function() {
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

window.autoSaveAoVivoScript = function() {
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

window.insertBulletPointToScript = function() {
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

window.adjustAoVivoFontSize = function(delta) {
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

window.openDailyScriptFromCalendar = function(dateKey) {
  if (!dateKey) return;
  editorialSelectedDate = dateKey;
  switchAdminSection('sec-guioes');
  window.renderEditorialDailyScript();
};

window.renderEditorialDailyScript = function() {
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

window.changeEditorialDate = function(deltaDays) {
  const parts = editorialSelectedDate.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + deltaDays);
  editorialSelectedDate = localDateKey(d);
  
  const datePicker = document.getElementById('editorialDatePicker');
  if (datePicker) datePicker.value = editorialSelectedDate;
  loadEditorialDailyScript();
};

window.setEditorialDateToday = function() {
  editorialSelectedDate = localDateKey(new Date());
  const datePicker = document.getElementById('editorialDatePicker');
  if (datePicker) datePicker.value = editorialSelectedDate;
  loadEditorialDailyScript();
};

window.onEditorialDatePickerChange = function(newDate) {
  if (!newDate) return;
  editorialSelectedDate = newDate;
  loadEditorialDailyScript();
};

window.autoSaveEditorialScript = function() {
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

window.insertBulletPointToEditorialScript = function() {
  window.formatEditorialText('bullet');
};

window.formatEditorialText = function(action) {
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

  switch(action) {
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

window.filterAoVivoSongs = function(status) {
  document.querySelectorAll('.musicas-filter-chip').forEach(btn => {
    btn.classList.toggle('active', btn.id === `filterAoVivo${status.charAt(0).toUpperCase() + status.slice(1)}`);
  });
  renderAoVivoSongs(status);
};

window.toggleAoVivoSongStatus = function(ids, newStatus) {
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
}

window.openUserModal = function(id = '') {
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

window.saveAdminUser = async function(event) {
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

window.deleteAdminUserItem = async function(id) {
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

window.playSoundFX = function(type) {
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

window.toggleSoundboardBGM = function() {
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
      try { osc.stop(); osc.disconnect(); } catch (e) {}
    });
    bgmOscillators = [];
  }
  if (bgmGainNode) {
    try { bgmGainNode.disconnect(); } catch (e) {}
    bgmGainNode = null;
  }
  isBgmPlaying = false;
}

window.setSoundboardBGMVolume = function(val) {
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

window.openAoVivoPrompter = function(noticeIdOrData) {
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

window.adjustPrompterFontSize = function(delta) {
  prompterFontSize = Math.max(1.1, Math.min(3.2, prompterFontSize + (delta * 0.15)));
  const bodyEl = document.getElementById('prompterBody');
  if (bodyEl) bodyEl.style.fontSize = `${prompterFontSize}rem`;
};

window.togglePrompterTimer = function() {
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

window.closePrompterModal = function() {
  pausePrompterTimer();
  const modal = document.getElementById('aoVivoPrompterModal');
  if (modal) modal.classList.remove('active');
};

window.markCurrentPrompterAsRead = function() {
  if (currentPrompterNoticeId) {
    const itemEl = document.getElementById(`aoVivoNotice_${currentPrompterNoticeId}`);
    if (itemEl) itemEl.classList.add('is-read');
  }
  closePrompterModal();
};

/* ==========================================================================
   PREPARAÇÃO RÁPIDA DE AVISO PARA LER
   ========================================================================== */
window.openQuickNoticeModal = function(id = '') {
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

window.insertNoticeTag = function(tag) {
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

window.updateQuickNoticeStats = function() {
  const textarea = document.getElementById('quickNoticeBody');
  const statsEl = document.getElementById('quickNoticeStats');
  if (!textarea || !statsEl) return;
  const words = textarea.value.trim().split(/\s+/).filter(Boolean).length;
  const estSeconds = Math.round((words / 130) * 60);
  statsEl.textContent = `${words} palavras • ~${estSeconds}s de leitura estimada`;
};

window.saveQuickNoticeForm = function(event) {
  event.preventDefault();
  const id = document.getElementById('quickNoticeIdInput').value;
  const title = document.getElementById('quickNoticeTitle').value.trim();
  const broadcastDate = document.getElementById('quickNoticeDate').value;
  const speaker = document.getElementById('quickNoticeSpeaker').value.trim();
  const cue = document.getElementById('quickNoticeCue').value;
  const content = document.getElementById('quickNoticeBody').value.trim();

  if (!title || !content) return;

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
};

/* ==========================================================================
   CONSTRUTOR DE GUIÕES & ALINHAMENTOS DE EMISSÃO (RUNDOWN BUILDER)
   ========================================================================== */
let currentRundownBlocks = [];

window.renderRundownsList = function() {
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

window.getPrompterDataFromRundown = function(id) {
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

window.openNewRundownModal = function(template = 'blank') {
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

window.openEditRundownModal = function(id) {
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

window.addRundownBlock = function(type) {
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

window.removeRundownBlock = function(blockId) {
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

window.updateBlockField = function(blockId, field, value) {
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

window.saveRundownForm = function(event) {
  event.preventDefault();
  const id = document.getElementById('rundownIdInput').value;
  const title = document.getElementById('rundownTitleInput').value.trim();
  const date = document.getElementById('rundownDateInput').value;
  const time = document.getElementById('rundownTimeInput').value.trim();
  const totalDuration = calculateRundownTotalTime();

  if (!title) return;

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
};

window.deleteOpenRundown = function() {
  const id = document.getElementById('rundownIdInput').value;
  if (!id) return;
  if (confirm('Eliminar este alinhamento de emissão?')) {
    window.db.deleteRundown(id);
    closeModal('rundownModal');
    renderRundownsList();
  }
};

window.printOpenRundown = function() {
  window.print();
};

/* ==========================================================================
   MURAL DE RECADOS DA EQUIPA (NOTION-STYLE MEMOS)
   ========================================================================== */
window.renderTeamMemos = function() {
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

window.openNewTeamMemoModal = function() {
  document.getElementById('teamMemoForm').reset();
  document.getElementById('teamMemoIdInput').value = '';
  document.getElementById('teamMemoModalTitle').textContent = 'Novo Recado da Equipa';
  document.getElementById('teamMemoDeleteBtn').style.display = 'none';
  openModal('teamMemoModal');
};

window.openEditTeamMemoModal = function(id) {
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

window.saveTeamMemoForm = function(event) {
  event.preventDefault();
  const id = document.getElementById('teamMemoIdInput').value;
  const title = document.getElementById('teamMemoTitleInput').value.trim();
  const content = document.getElementById('teamMemoContentInput').value.trim();
  const author = document.getElementById('teamMemoAuthorInput').value.trim();
  const color = document.getElementById('teamMemoColorInput').value;

  if (!title || !content) return;

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
};

window.deleteOpenTeamMemo = function() {
  const id = document.getElementById('teamMemoIdInput').value;
  if (!id) return;
  if (confirm('Eliminar este recado do mural?')) {
    window.db.deleteTeamMemo(id);
    closeModal('teamMemoModal');
    renderTeamMemos();
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