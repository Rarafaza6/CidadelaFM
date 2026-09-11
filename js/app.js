/* ==========================================================================
   RÁDIO ESCOLAR EBS DA CIDADELA - MÓDULO PRINCIPAL (MULTI-PÁGINA)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  await window.db.ready();
  if (window.db.error) {
    ['announcementsContainer', 'homePodcastsContainer', 'fullPodcastsGrid', 'fullNewsGrid'].forEach(id => window.showFirebaseError(document.getElementById(id)));
    return;
  }
  initMusicSearch();
  initSuggestionForm();
  initMessageForm();
  renderHomePodcasts();
  renderFullPodcasts();
  renderHomeNews();
  renderFullNews();
  initNewsFilters();
  initPodcastPlayer();
  checkDailyLimitUI();
});

let selectedTrackData = null;
let currentAudio = new Audio();
let isPlaying = false;

const MAX_DAILY_REQUESTS = 3;

function getTodayKey() {
  const today = new Date();
  return `radio_req_${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
}

function getTodayRequestCount() {
  const key = getTodayKey();
  return parseInt(localStorage.getItem(key) || '0', 10);
}

function incrementTodayRequestCount() {
  const key = getTodayKey();
  const current = getTodayRequestCount();
  localStorage.setItem(key, current + 1);
}

function checkDailyLimitUI() {
  const count = getTodayRequestCount();
  const counterEl = document.getElementById('dailyRequestsCountEl');
  if (counterEl) {
    counterEl.innerText = `${count}/${MAX_DAILY_REQUESTS}`;
  }

  if (count >= MAX_DAILY_REQUESTS) {
    const alertContainer = document.getElementById('suggestionAlertContainer');
    if (alertContainer) {
      alertContainer.innerHTML = `
        <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); color: #fcd34d; padding: 1rem 1.25rem; border-radius: var(--radius-md); margin-top: 1.25rem; font-size: 0.92rem;">
          <i class="ri-information-fill" style="font-size: 1.2rem; vertical-align: middle;"></i>
          <strong>Limite Diário Atingido:</strong> Já enviaste 3 sugestões hoje neste dispositivo. Volta amanhã para pedir mais temas!
        </div>
      `;
    }
  }
}

/* ==========================================================================
   1. PESQUISA DE MÚSICAS (iTunes API)
   ========================================================================== */
function initMusicSearch() {
  const searchInput = document.getElementById('musicSearchInput');
  const dropdown = document.getElementById('searchResultsDropdown');
  let debounceTimer;

  if (!searchInput || !dropdown) return;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(debounceTimer);

    if (query.length < 2) {
      dropdown.classList.remove('active');
      dropdown.innerHTML = '';
      return;
    }

    debounceTimer = setTimeout(() => {
      searchITunesMusic(query, dropdown);
    }, 300);
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });
}

async function searchITunesMusic(query, dropdown) {
  dropdown.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-muted);"><i class="ri-loader-4-line ri-spin"></i> A pesquisar músicas...</div>';
  dropdown.classList.add('active');

  try {
    const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=6`);
    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      dropdown.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-muted);">Nenhuma música encontrada. Podes escrever o título manualmente.</div>';
      return;
    }

    dropdown.innerHTML = '';
    data.results.forEach(track => {
      const item = document.createElement('div');
      item.className = 'search-row';
      const artwork = track.artworkUrl100 || 'assets/logo-radio.jpg';
      
      item.innerHTML = `
        <img src="${artwork}" alt="${escapeHtml(track.trackName)}">
        <div style="flex:1;">
          <h4 style="font-size: 0.95rem; color: #ffffff;">${escapeHtml(track.trackName)}</h4>
          <p style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(track.artistName)} • ${escapeHtml(track.collectionName || 'Single')}</p>
        </div>
      `;

      item.addEventListener('click', () => {
        selectTrack({
          songTitle: track.trackName,
          artist: track.artistName,
          artwork: artwork,
          previewUrl: track.previewUrl
        });
        dropdown.classList.remove('active');
        document.getElementById('musicSearchInput').value = '';
      });

      dropdown.appendChild(item);
    });
  } catch (err) {
    console.error('Erro iTunes API:', err);
    dropdown.innerHTML = '<div style="padding: 1rem; text-align: center; color: #ef4444;">Erro na ligação ao catálogo. Escreve o título manualmente.</div>';
  }
}

function selectTrack(track) {
  selectedTrackData = track;
  const container = document.getElementById('selectedTrackContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="selected-song-card">
      <img src="${track.artwork}" alt="${escapeHtml(track.songTitle)}">
      <div style="flex: 1;">
        <h4 style="color: #fff; font-size: 1rem;">${escapeHtml(track.songTitle)}</h4>
        <p style="color: var(--text-muted); font-size: 0.85rem;">${escapeHtml(track.artist)}</p>
      </div>
      <button type="button" class="btn-action" title="Remover" onclick="removeSelectedTrack()">
        <i class="ri-close-line" style="color: #ef4444;"></i>
      </button>
    </div>
  `;
}

window.removeSelectedTrack = function() {
  selectedTrackData = null;
  const container = document.getElementById('selectedTrackContainer');
  if (container) container.innerHTML = '';
};

/* ==========================================================================
   2. ENVIO DE SUGESTÃO COM LIMITE DE 3 POR DIA
   ========================================================================== */
function initSuggestionForm() {
  const form = document.getElementById('suggestionForm');
  const alertContainer = document.getElementById('suggestionAlertContainer');

  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    if (getTodayRequestCount() >= MAX_DAILY_REQUESTS) {
      checkDailyLimitUI();
      return;
    }

    const manualInput = document.getElementById('musicSearchInput').value.trim();

    let finalSongTitle = '';
    let finalArtist = '';
    let artwork = 'assets/logo-radio.jpg';
    let previewUrl = '';

    if (selectedTrackData) {
      finalSongTitle = selectedTrackData.songTitle;
      finalArtist = selectedTrackData.artist;
      artwork = selectedTrackData.artwork;
      previewUrl = selectedTrackData.previewUrl;
    } else if (manualInput) {
      finalSongTitle = manualInput;
      finalArtist = 'Não especificado';
    } else {
      alertContainer.innerHTML = `
        <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; padding: 0.85rem 1rem; border-radius: var(--radius-md); margin-top: 1rem; font-size: 0.9rem;">
          <i class="ri-error-warning-line"></i> Escolhe uma música no catálogo ou escreve o título!
        </div>
      `;
      return;
    }

    window.db.addSuggestion({
      songTitle: finalSongTitle,
      artist: finalArtist,
      artwork: artwork,
      previewUrl: previewUrl || '',
      studentName: 'Aluno Anónimo'
    });

    incrementTodayRequestCount();

    window.removeSelectedTrack();
    form.reset();

    const newCount = getTodayRequestCount();
    checkDailyLimitUI();

    alertContainer.innerHTML = `
      <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; padding: 0.9rem 1.25rem; border-radius: var(--radius-md); margin-top: 1rem; font-size: 0.92rem; display: flex; align-items: center; gap: 0.6rem;">
        <i class="ri-checkbox-circle-fill" style="font-size: 1.2rem;"></i>
        <span><strong>Sugestão Enviada!</strong> (${newCount}/${MAX_DAILY_REQUESTS} enviadas hoje).</span>
      </div>
    `;

    if (newCount < MAX_DAILY_REQUESTS) {
      setTimeout(() => {
        alertContainer.innerHTML = '';
      }, 5000);
    }
  });
}

function initMessageForm() {
  const form = document.getElementById('messageForm');
  const feedback = document.getElementById('messageAlertContainer');
  if (!form || !feedback) return;

  form.addEventListener('submit', event => {
    event.preventDefault();
    const trap = document.getElementById('messageWebsite');
    const message = document.getElementById('messageText').value.trim();
    const name = document.getElementById('messageName').value.trim();
    const email = document.getElementById('messageEmail').value.trim();
    const studentClass = document.getElementById('messageClass').value.trim();
    const limitKey = `radio_msg_${new Date().toISOString().slice(0, 10)}`;
    const count = Number(localStorage.getItem(limitKey) || 0);

    if (trap && trap.value) return;
    if (!message || message.length < 3 || !name || !email || !studentClass) {
      feedback.innerHTML = '<div class="form-feedback error"><i class="ri-error-warning-line"></i> Escreve a mensagem e preenche nome, email e turma.</div>';
      return;
    }
    if (message.length > 280) {
      feedback.innerHTML = '<div class="form-feedback error"><i class="ri-error-warning-line"></i> A mensagem não pode ultrapassar 280 caracteres.</div>';
      return;
    }
    if (count >= 3) {
      feedback.innerHTML = '<div class="form-feedback warning"><i class="ri-time-line"></i> Já recebemos 3 mensagens deste dispositivo hoje. Tenta novamente amanhã.</div>';
      return;
    }

    window.db.addMessage({ message, name, email, studentClass });
    localStorage.setItem(limitKey, count + 1);
    form.reset();
    feedback.innerHTML = '<div class="form-feedback success"><i class="ri-checkbox-circle-line"></i> Mensagem enviada. Obrigado por participares na rádio!</div>';
  });
}

/* ==========================================================================
   3. LEITOR & BIBLIOTECA DE PODCASTS (DESIGN RECONFIGURADO E MODERNO)
   ========================================================================== */
function initPodcastPlayer() {
  const btnPlay = document.getElementById('btnPodPlay');
  const waveform = document.getElementById('podWaveform');

  if (!btnPlay) return;

  btnPlay.addEventListener('click', () => {
    if (!currentAudio.src) {
      const podcasts = window.db.getPodcasts();
      if (podcasts.length > 0) {
        loadAndPlayPodcast(podcasts[0].audioUrl, podcasts[0].title, podcasts[0].date);
        return;
      }
    }

    if (isPlaying) {
      currentAudio.pause();
      btnPlay.innerHTML = '<i class="ri-play-fill"></i>';
      if (waveform) waveform.classList.remove('playing');
      isPlaying = false;
    } else {
      currentAudio.play();
      btnPlay.innerHTML = '<i class="ri-pause-fill"></i>';
      if (waveform) waveform.classList.add('playing');
      isPlaying = true;
    }
  });

  currentAudio.addEventListener('ended', () => {
    if (btnPlay) btnPlay.innerHTML = '<i class="ri-play-fill"></i>';
    if (waveform) waveform.classList.remove('playing');
    isPlaying = false;
  });
}

function loadAndPlayPodcast(audioUrl, title, subtitle) {
  const btnPlay = document.getElementById('btnPodPlay');
  const titleEl = document.getElementById('podPlayerTitle');
  const subEl = document.getElementById('podPlayerSub');
  const waveform = document.getElementById('podWaveform');

  if (titleEl) titleEl.innerText = title;
  if (subEl) subEl.innerText = subtitle;

  currentAudio.src = audioUrl;
  currentAudio.play().then(() => {
    isPlaying = true;
    if (btnPlay) btnPlay.innerHTML = '<i class="ri-pause-fill"></i>';
    if (waveform) waveform.classList.add('playing');
  }).catch(err => console.error('Erro de áudio:', err));
}

function renderHomePodcasts() {
  const container = document.getElementById('homePodcastsContainer');
  if (!container) return;

  const podcasts = window.db.getPodcasts().slice(0, 3);
  if (podcasts.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted);">Sem podcasts recentes.</p>';
    return;
  }

  container.innerHTML = '';
  podcasts.forEach(pod => {
    const card = document.createElement('div');
    card.className = 'card-box podcast-card-modern';
    card.innerHTML = `
      <div class="podcast-card-inner">
        <div class="podcast-card-meta-top">
          <span class="podcast-duration-tag"><i class="ri-time-line"></i> ${escapeHtml(pod.duration || 'Podcast')}</span>
          <span class="podcast-date-tag"><i class="ri-calendar-line"></i> ${escapeHtml(pod.date)}</span>
        </div>
        <h3 class="podcast-card-title">${escapeHtml(pod.title)}</h3>
        <p class="podcast-card-desc">${escapeHtml(pod.description || 'Episódio gravado na EBS Cidadela.')}</p>
        <button type="button" class="btn-play-podcast" onclick="loadAndPlayPodcast('${pod.audioUrl}', '${escapeJs(pod.title)}', '${escapeJs(pod.date)}')">
          <i class="ri-play-fill"></i> Reproduzir Episódio
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderFullPodcasts(filterTag = 'all') {
  const container = document.getElementById('fullPodcastsGrid');
  if (!container) return;

  const podcasts = window.db.getPodcasts();
  if (podcasts.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted);">Nenhum podcast disponível ainda.</p>';
    return;
  }

  container.innerHTML = '';
  podcasts.forEach(pod => {
    const card = document.createElement('div');
    card.className = 'card-box podcast-card-modern';
    card.innerHTML = `
      <div class="podcast-card-inner">
        <div class="podcast-card-meta-top">
          <span class="podcast-duration-tag"><i class="ri-time-line"></i> ${escapeHtml(pod.duration || 'Podcast')}</span>
          <span class="podcast-date-tag"><i class="ri-calendar-line"></i> ${escapeHtml(pod.date)}</span>
        </div>
        <h3 class="podcast-card-title">${escapeHtml(pod.title)}</h3>
        <p class="podcast-card-desc">${escapeHtml(pod.description || 'Programa de rádio produzido na escola.')}</p>
        <button type="button" class="btn-play-podcast" onclick="loadAndPlayPodcast('${pod.audioUrl}', '${escapeJs(pod.title)}', '${escapeJs(pod.date)}')">
          <i class="ri-play-fill"></i> Reproduzir Episódio
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

window.filterPodcasts = function(tag) {
  renderFullPodcasts(tag);
};

/* ==========================================================================
   4. NOTÍCIAS & ANÚNCIOS
   ========================================================================== */
function renderHomeNews() {
  const container = document.getElementById('announcementsContainer');
  if (!container) return;

  const list = window.db.getPublicAnnouncements().slice(0, 3);
  container.innerHTML = '';
  list.forEach(ann => {
    const card = document.createElement('div');
    card.className = 'card-box news-card-modern';
    card.innerHTML = `
      <a class="news-card-cover" href="artigo.html?id=${encodeURIComponent(ann.id)}" aria-label="Ler ${escapeHtml(ann.title)}">
        <img src="${escapeHtml(ann.image)}" alt="" loading="lazy">
        <span class="news-card-category">${escapeHtml(ann.category || ann.tag || 'Notícia')}</span>
      </a>
      <div class="news-card-body">
        <h3 class="news-card-title"><a href="artigo.html?id=${encodeURIComponent(ann.id)}">${escapeHtml(ann.title)}</a></h3>
        <p class="news-card-excerpt">${escapeHtml(ann.excerpt || '')}</p>
        <div class="news-card-footer">
          <span><i class="ri-user-3-line"></i> ${escapeHtml(ann.author || 'Redação')}</span>
          <span><i class="ri-time-line"></i> ${escapeHtml(ann.readTime || '2 min de leitura')}</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderFullNews(filterTag = 'all', searchTerm = '') {
  const container = document.getElementById('fullNewsGrid');
  if (!container) return;

  const list = window.db.getPublicAnnouncements();
  if (list.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted);">Sem notícias publicadas.</p>';
    return;
  }

  container.innerHTML = '';
  list.forEach(ann => {
    const searchable = `${ann.title} ${ann.excerpt} ${ann.category || ann.tag}`.toLowerCase();
    if (filterTag !== 'all' && (ann.category || ann.tag) !== filterTag) return;
    if (searchTerm && !searchable.includes(searchTerm.toLowerCase())) return;

    const card = document.createElement('div');
    card.className = 'card-box news-card-modern';
    card.innerHTML = `
      <a class="news-card-cover" href="artigo.html?id=${encodeURIComponent(ann.id)}" aria-label="Ler ${escapeHtml(ann.title)}">
        <img src="${escapeHtml(ann.image)}" alt="" loading="lazy">
        <span class="news-card-category">${escapeHtml(ann.category || ann.tag || 'Notícia')}</span>
      </a>
      <div class="news-card-body">
        <h3 class="news-card-title"><a href="artigo.html?id=${encodeURIComponent(ann.id)}">${escapeHtml(ann.title)}</a></h3>
        <p class="news-card-excerpt">${escapeHtml(ann.excerpt || '')}</p>
        <div class="news-card-footer">
          <span><i class="ri-calendar-line"></i> ${escapeHtml(ann.date)}</span>
          <span><i class="ri-time-line"></i> ${escapeHtml(ann.readTime || '2 min de leitura')}</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
  if (!container.children.length) {
    container.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1; padding: 3rem 1rem;"><i class="ri-search-eye-line"></i><h3>Nenhuma notícia encontrada</h3><p>Tenta pesquisar por outro termo ou escolher outra categoria.</p></div>';
  }
}

window.filterNews = function(tag) {
  const search = document.getElementById('newsSearchInput');
  renderFullNews(tag, search ? search.value.trim() : '');
};

function initNewsFilters() {
  const search = document.getElementById('newsSearchInput');
  const category = document.getElementById('newsCategoryFilter');
  if (!search || !category) return;
  const refresh = () => renderFullNews(category.value, search.value.trim());
  search.addEventListener('input', refresh);
  category.addEventListener('change', refresh);
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeJs(text) {
  if (!text) return '';
  return text.replace(/'/g, "\\'").replace(/"/g, '\\"');
}
