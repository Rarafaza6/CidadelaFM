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

document.addEventListener('radio-db-updated', (e) => {
  if (!e.detail || e.detail.collection === 'podcasts') {
    renderHomePodcasts();
    renderFullPodcasts();
  }
});

let selectedTrackData = null;
let currentAudio = new Audio();
let isPlaying = false;
let isSpotifyMode = false;
let currentSpotifyObj = null;

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
  dropdown.innerHTML = `
    <div class="search-dropdown-status">
      <i class="ri-loader-4-line ri-spin"></i> A pesquisar músicas no catálogo...
    </div>
  `;
  dropdown.classList.add('active');

  try {
    const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=6`);
    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      dropdown.innerHTML = `
        <div class="search-dropdown-status search-dropdown-empty">
          <i class="ri-music-2-line" style="font-size: 1.5rem; display: block; margin-bottom: 0.35rem; color: #38bdf8;"></i>
          <strong>Nenhuma música encontrada</strong>
          <span style="display: block; font-size: 0.8rem; color: #94a3b8; margin-top: 0.25rem;">Podes submeter escrevendo o título manualmente.</span>
        </div>
      `;
      return;
    }

    dropdown.innerHTML = '';
    data.results.forEach(track => {
      const item = document.createElement('div');
      item.className = 'search-result-item search-row';
      const rawArtwork = track.artworkUrl100 || track.artworkUrl60 || 'assets/logo-radio.jpg';
      const artwork = rawArtwork.replace('100x100bb', '300x300bb');
      const releaseYear = track.releaseDate ? new Date(track.releaseDate).getFullYear() : '';

      item.innerHTML = `
        <div class="search-result-thumb">
          <img src="${artwork}" alt="${escapeHtml(track.trackName)}" loading="lazy">
        </div>
        <div class="search-result-details">
          <h4 class="item-title">${escapeHtml(track.trackName)}</h4>
          <p class="item-artist">
            <span>${escapeHtml(track.artistName)}</span>
            ${releaseYear ? `<span class="search-result-sep">•</span><span>${releaseYear}</span>` : ''}
          </p>
        </div>
        <div class="search-result-action">
          <span class="select-badge"><i class="ri-add-line"></i> Selecionar</span>
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
        document.getElementById('musicSearchInput').value = track.trackName + ' - ' + track.artistName;
      });

      dropdown.appendChild(item);
    });
  } catch (err) {
    console.error('Erro iTunes API:', err);
    dropdown.innerHTML = `
      <div class="search-dropdown-status search-dropdown-error">
        <i class="ri-error-warning-line"></i> Erro na ligação ao catálogo. Escreve o título manualmente.
      </div>
    `;
  }
}

function selectTrack(track) {
  selectedTrackData = track;
  const container = document.getElementById('selectedTrackContainer');
  if (!container) return;

  const hasPreview = Boolean(track.previewUrl);

  container.innerHTML = `
    <div class="selected-track-card selected-song-card">
      <div class="track-thumb-wrap">
        <img src="${track.artwork}" alt="${escapeHtml(track.songTitle)}">
        <div class="track-active-badge" title="Selecionada"><i class="ri-check-line"></i></div>
      </div>
      <div class="track-info">
        <span class="track-status-tag"><i class="ri-disc-line"></i> Música Selecionada</span>
        <h4 class="track-title">${escapeHtml(track.songTitle)}</h4>
        <p class="track-artist">${escapeHtml(track.artist)}</p>
        ${hasPreview ? `
          <div class="track-audio-preview">
            <audio id="selectedTrackAudio" src="${track.previewUrl}"></audio>
            <button type="button" class="btn-audio-toggle" id="playPreviewBtn" onclick="toggleAudioPreview(event)">
              <i class="ri-play-fill" id="playPreviewIcon"></i> <span>Ouvir Pré-visualização</span>
            </button>
          </div>
        ` : ''}
      </div>
      <button type="button" class="btn-remove-track btn-action" title="Remover seleção" onclick="removeSelectedTrack()">
        <i class="ri-close-line"></i>
      </button>
    </div>
  `;
}

window.toggleAudioPreview = function(e) {
  if (e) e.preventDefault();
  const audio = document.getElementById('selectedTrackAudio');
  const icon = document.getElementById('playPreviewIcon');
  const btn = document.getElementById('playPreviewBtn');
  if (!audio) return;

  if (audio.paused) {
    document.querySelectorAll('audio').forEach(a => { if (a !== audio) { a.pause(); a.currentTime = 0; } });
    audio.play().catch(err => console.log('Audio playback prevented:', err));
    if (icon) icon.className = 'ri-pause-fill';
    if (btn) btn.classList.add('playing');
  } else {
    audio.pause();
    if (icon) icon.className = 'ri-play-fill';
    if (btn) btn.classList.remove('playing');
  }

  audio.onended = () => {
    if (icon) icon.className = 'ri-play-fill';
    if (btn) btn.classList.remove('playing');
  };
};

window.removeSelectedTrack = function() {
  selectedTrackData = null;
  const audio = document.getElementById('selectedTrackAudio');
  if (audio) {
    audio.pause();
  }
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

    const newSug = window.db.addSuggestion({
      songTitle: finalSongTitle,
      artist: finalArtist,
      artwork: artwork,
      previewUrl: previewUrl || '',
      studentName: 'Aluno Anónimo'
    });

    if (newSug && newSug.id) {
      }

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
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function initPodcastPlayer() {
  const btnPlay = document.getElementById('btnPodPlay');
  const waveform = document.getElementById('podWaveform');
  const seekTrack = document.getElementById('podSeekTrack');
  const seekFill = document.getElementById('podSeekFill');
  const timeCur = document.getElementById('podTimeCur');
  const timeDur = document.getElementById('podTimeDur');

  if (!btnPlay) return;

  btnPlay.addEventListener('click', () => {
    // Sem podcast carregado → tenta carregar o primeiro
    if (!currentAudio.src && !isSpotifyMode) {
      const podcasts = window.db.getPodcasts ? window.db.getPodcasts() : [];
      if (podcasts.length > 0) {
        loadAndPlayPodcast(podcasts[0].audioUrl || podcasts[0].spotifyUrl, podcasts[0].title, podcasts[0].date, podcasts[0]);
        return;
      }
      return;
    }

    // Modo Spotify: alterna animação do vinil sem áudio nativo
    if (isSpotifyMode) {
      isPlaying = !isPlaying;
      updatePlayButtonState(isPlaying);
      return;
    }

    // Modo áudio direto
    if (isPlaying) {
      currentAudio.pause();
      updatePlayButtonState(false);
      isPlaying = false;
    } else {
      currentAudio.play().then(() => {
        updatePlayButtonState(true);
        isPlaying = true;
      }).catch(err => console.error('Erro de reprodução:', err));
    }
  });

  currentAudio.addEventListener('timeupdate', () => {
    if (!currentAudio.duration) return;
    const progress = (currentAudio.currentTime / currentAudio.duration) * 100;
    if (seekFill) seekFill.style.width = `${progress}%`;
    const seekThumb = document.getElementById('podSeekThumb');
    if (seekThumb) seekThumb.style.left = `${progress}%`;
    if (timeCur) timeCur.innerText = formatTime(currentAudio.currentTime);
  });

  currentAudio.addEventListener('loadedmetadata', () => {
    if (timeDur && currentAudio.duration) {
      timeDur.innerText = formatTime(currentAudio.duration);
    }
  });

  if (seekTrack) {
    seekTrack.addEventListener('click', (e) => {
      if (!currentAudio.duration) return;
      const rect = seekTrack.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, clickX / rect.width));
      currentAudio.currentTime = pct * currentAudio.duration;
    });
  }

  currentAudio.addEventListener('ended', () => {
    updatePlayButtonState(false);
    if (seekFill) seekFill.style.width = '0%';
    const seekThumb = document.getElementById('podSeekThumb');
    if (seekThumb) seekThumb.style.left = '0%';
    if (timeCur) timeCur.innerText = '0:00';
    isPlaying = false;
  });
}

let activePodcastCategory = 'all';
let activePodcastSearchQuery = '';
let currentPodcastSpeed = 1.0;
let currentActivePodcastObj = null;

function updatePlayButtonState(playing) {
  const btnPlay = document.getElementById('btnPodPlay');
  const iconEl = document.getElementById('podMasterPlayIcon');
  const waveform = document.getElementById('podWaveform');

  if (iconEl) {
    iconEl.className = playing ? 'ri-pause-fill' : 'ri-play-fill';
  } else if (btnPlay) {
    btnPlay.innerHTML = playing ? '<i class="ri-pause-fill"></i>' : '<i class="ri-play-fill"></i>';
  }

  if (waveform) {
    if (playing) waveform.classList.add('playing');
    else waveform.classList.remove('playing');
  }
}

window.skipAudio = function (seconds) {
  if (!currentAudio.src || isNaN(currentAudio.duration)) return;
  currentAudio.currentTime = Math.max(0, Math.min(currentAudio.duration, currentAudio.currentTime + seconds));
};

window.cyclePlaybackSpeed = function () {
  const speeds = [1.0, 1.25, 1.5, 2.0, 0.8];
  let idx = speeds.indexOf(currentPodcastSpeed);
  currentPodcastSpeed = speeds[(idx + 1) % speeds.length];
  currentAudio.playbackRate = currentPodcastSpeed;
  const label = document.getElementById('playbackSpeedText');
  if (label) label.innerText = `${currentPodcastSpeed}x`;
};

window.toggleMute = function () {
  const volIcon = document.getElementById('volIcon');
  const slider = document.getElementById('podVolumeSlider');
  if (currentAudio.muted) {
    currentAudio.muted = false;
    if (volIcon) volIcon.className = currentAudio.volume > 0.5 ? 'ri-volume-up-line' : 'ri-volume-down-line';
    if (slider) slider.value = currentAudio.volume;
  } else {
    currentAudio.muted = true;
    if (volIcon) volIcon.className = 'ri-volume-mute-line';
    if (slider) slider.value = 0;
  }
};

window.changeVolume = function (val) {
  const v = parseFloat(val);
  currentAudio.volume = v;
  currentAudio.muted = (v === 0);
  const volIcon = document.getElementById('volIcon');
  if (volIcon) {
    if (v === 0) volIcon.className = 'ri-volume-mute-line';
    else if (v < 0.5) volIcon.className = 'ri-volume-down-line';
    else volIcon.className = 'ri-volume-up-line';
  }
};

window.shareCurrentPodcast = function () {
  const pod = currentActivePodcastObj;
  const shareUrl = (pod && (pod.spotifyUrl || pod.originalUrl || pod.audioUrl)) || window.location.href;
  const shareTitle = pod ? pod.title : 'Rádio Escolar EBS Cidadela — Podcasts';

  if (navigator.share) {
    navigator.share({
      title: shareTitle,
      text: `Ouve este episódio da Rádio Escolar da Cidadela: ${shareTitle}`,
      url: shareUrl
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(shareUrl).then(() => {
      const btn = document.getElementById('btnShareEpisode');
      if (btn) {
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="ri-check-line" style="color:#10b981;"></i> Copiado!';
        setTimeout(() => { btn.innerHTML = original; }, 2200);
      }
    }).catch(() => {});
  }
};

window.filterPodcasts = function (category) {
  activePodcastCategory = category || 'all';
  document.querySelectorAll('#podcastCategoryPills .pod-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === activePodcastCategory);
  });
  renderFullPodcasts();
};

window.handlePodcastSearch = function (query) {
  activePodcastSearchQuery = (query || '').toLowerCase().trim();
  renderFullPodcasts();
};

function getSpotifyEmbedUrl(url) {
  if (!url) return null;
  const clean = url.trim();
  if (clean.includes('open.spotify.com/embed/')) {
    return clean.includes('utm_source') ? clean : `${clean}?utm_source=generator&theme=0`;
  }
  const match = clean.match(/open\.spotify\.com\/(episode|show)\/([a-zA-Z0-9]+)/i);
  if (match) {
    return `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator&theme=0`;
  }
  const uriMatch = clean.match(/spotify:(episode|show):([a-zA-Z0-9]+)/i);
  if (uriMatch) {
    return `https://open.spotify.com/embed/${uriMatch[1]}/${uriMatch[2]}?utm_source=generator&theme=0`;
  }
  return null;
}

window.loadAndPlayPodcast = function (audioOrSpotifyUrl, title, subtitle, podObj = null) {
  currentActivePodcastObj = podObj || { title, subtitle, audioUrl: audioOrSpotifyUrl };

  const spotifyExtLink = document.getElementById('podSpotifyExternalLink');
  const titleEl   = document.getElementById('podPlayerTitle');
  const subEl     = document.getElementById('podPlayerSub');
  const descEl    = document.getElementById('podPlayerDesc');
  const hostsEl   = document.getElementById('podPlayerHosts');
  const hostsText = document.getElementById('podPlayerHostsText');
  const catBadge  = document.getElementById('podPlayerCategoryBadge');
  const kickerText = document.getElementById('podPlayerKickerText');
  const idleHint  = document.getElementById('studioIdleHint');
  const thumbEl   = document.getElementById('podPlayerThumb');

  // ── Metadados ──────────────────────────────────────────────────────────
  if (titleEl)   titleEl.innerText  = title || 'Episódio';
  if (subEl)     subEl.innerText    = subtitle || (podObj && podObj.date) || 'Rádio Escolar EBS Cidadela';
  if (descEl)    descEl.innerText   = (podObj && podObj.description) || '';
  if (catBadge)  catBadge.innerText = (podObj && podObj.category) || 'Podcast';
  if (idleHint)  idleHint.style.display = 'none';

  // Artwork do episódio
  const coverUrl = (podObj && (podObj.thumbnail || podObj.image || podObj.cover)) || '';
  if (thumbEl) {
    thumbEl.src = coverUrl || 'assets/logo-radio.jpg';
  }

  if (hostsEl && hostsText) {
    if (podObj && podObj.hosts) {
      hostsText.innerText = podObj.hosts;
      hostsEl.style.display = 'inline-flex';
    } else {
      hostsEl.style.display = 'none';
    }
  }

  // ── Determinar tipo ────────────────────────────────────────────────────
  const isSpotify = (podObj && podObj.isSpotify) ||
    (audioOrSpotifyUrl && audioOrSpotifyUrl.includes('spotify'));

  const directUrl = (podObj && (podObj.spotifyUrl || podObj.originalUrl || podObj.audioUrl)) || audioOrSpotifyUrl;

  // Botão externo — apenas se houver URL válido
  if (spotifyExtLink && directUrl) {
    spotifyExtLink.href = directUrl;
    spotifyExtLink.style.display = 'inline-flex';
    spotifyExtLink.textContent = '';
    spotifyExtLink.innerHTML = '<i class="ri-external-link-line"></i> Ver Episódio';
  } else if (spotifyExtLink) {
    spotifyExtLink.style.display = 'none';
  }

  // Referências aos containers de modo
  const spotifyEmbedContainer = document.getElementById('podSpotifyEmbedContainer');
  const spotifyEmbedFrame     = document.getElementById('podSpotifyEmbedFrame');
  const seekWrapper           = document.getElementById('podSeekWrapper');
  const nativeControls        = document.getElementById('podNativeControls');

  const embedUrl = (podObj && podObj.embedUrl) || getSpotifyEmbedUrl(audioOrSpotifyUrl);

  if (isSpotify && embedUrl) {
    // Parar áudio nativo se estivesse a tocar
    if (currentAudio.src) {
      currentAudio.pause();
      currentAudio.src = '';
    }

    // Mostrar o embed do Spotify e ocultar controlos nativos de áudio
    if (spotifyEmbedContainer) spotifyEmbedContainer.style.display = 'block';
    if (seekWrapper)           seekWrapper.style.display = 'none';
    if (nativeControls)        nativeControls.style.display = 'none';

    if (spotifyEmbedFrame) {
      spotifyEmbedFrame.innerHTML = `
        <iframe
          src="${embedUrl}"
          width="100%" height="152" frameborder="0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          style="border-radius:12px; display:block;">
        </iframe>`;
    }

    isSpotifyMode = true;
    currentSpotifyObj = podObj;

  } else if (!isSpotify && audioOrSpotifyUrl) {
    // ── Modo áudio direto MP3 ──────────────────────────────────────────────
    if (spotifyEmbedContainer) { spotifyEmbedContainer.style.display = 'none'; if (spotifyEmbedFrame) spotifyEmbedFrame.innerHTML = ''; }
    if (seekWrapper)           seekWrapper.style.display = '';
    if (nativeControls)        nativeControls.style.display = '';

    isSpotifyMode = false;
    currentAudio.pause();
    currentAudio.src = audioOrSpotifyUrl;
    currentAudio.play().then(() => {
      isPlaying = true;
      updatePlayButtonState(true);
    }).catch(err => {
      console.error('Erro de áudio:', err);
    });
  }

  // ── Scroll suave para o player ─────────────────────────────────────────
  const playerSec = document.getElementById('podcastMainPlayerSection');
  if (playerSec) playerSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function renderHomePodcasts() {
  const container = document.getElementById('homePodcastsContainer');
  if (!container) return;

  const allPods = window.db.getPodcasts ? window.db.getPodcasts() : [];
  const podcasts = [...allPods].sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  }).slice(0, 3);

  if (podcasts.length === 0) {
    container.innerHTML = `
      <div class="hv2-empty-state">
        <div class="hv2-empty-icon"><i class="ri-mic-off-line"></i></div>
        <h3>Ainda não foram adicionados podcasts</h3>
        <p>Os novos episódios e emissões gravadas da nossa escola serão disponibilizados aqui brevemente.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  podcasts.forEach(pod => {
    const playUrl = pod.audioUrl || pod.spotifyUrl || pod.originalUrl || '';
    const card = document.createElement('div');
    card.className = 'card-box podcast-card-pro';
    card.innerHTML = buildPodcastCardHTML(pod, playUrl, 'Leitor no Topo', 'ri-play-circle-fill');
    container.appendChild(card);
  });
}

function renderFullPodcasts() {
  const container = document.getElementById('fullPodcastsGrid');
  if (!container) return;

  const allPods = window.db.getPodcasts ? window.db.getPodcasts() : [];

  let filtered = allPods;
  if (activePodcastCategory !== 'all') {
    filtered = filtered.filter(p => (p.category || 'Geral').toLowerCase() === activePodcastCategory.toLowerCase());
  }
  if (activePodcastSearchQuery) {
    filtered = filtered.filter(p => {
      const t = (p.title       || '').toLowerCase();
      const d = (p.description || '').toLowerCase();
      const h = (p.hosts       || '').toLowerCase();
      const c = (p.category    || '').toLowerCase();
      return t.includes(activePodcastSearchQuery) ||
             d.includes(activePodcastSearchQuery) ||
             h.includes(activePodcastSearchQuery) ||
             c.includes(activePodcastSearchQuery);
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = allPods.length === 0 ? `
      <div class="hv2-empty-state" style="grid-column: 1 / -1;">
        <div class="hv2-empty-icon"><i class="ri-headphones-line"></i></div>
        <h3>Ainda não foram adicionados podcasts</h3>
        <p>A equipa da Rádio Escolar está a preparar novos episódios. Fica atento às próximas emissões!</p>
      </div>
    ` : `
      <div class="hv2-empty-state" style="grid-column: 1 / -1;">
        <div class="hv2-empty-icon"><i class="ri-search-line"></i></div>
        <h3>Nenhum episódio encontrado</h3>
        <p>Tenta um termo diferente ou seleciona outra categoria.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  filtered.forEach(pod => {
    const playUrl = pod.audioUrl || pod.spotifyUrl || pod.originalUrl || '';
    const card = document.createElement('div');
    card.className = 'card-box podcast-card-pro';
    card.innerHTML = buildPodcastCardHTML(pod, playUrl, 'Reproduzir', 'ri-play-fill');
    container.appendChild(card);
  });
}

/* ── Helper: build a podcast episode card ───────────────────────────────── */
function buildPodcastCardHTML(pod, playUrl, btnLabel, btnIcon) {
  const podData = JSON.stringify(pod).replace(/"/g, '&quot;');
  const thumb   = pod.thumbnail || 'assets/logo-radio.jpg';
  const catColor = getCategoryColor(pod.category);

  return `
    <div class="podcast-card-inner">

      <!-- Thumbnail do episódio -->
      <div class="podcast-card-thumb-wrap" onclick="loadAndPlayPodcast('${escapeJs(playUrl)}', '${escapeJs(pod.title)}', '${escapeJs(pod.date || '')}', ${podData})" title="Reproduzir ${escapeHtml(pod.title)}">
        <img src="${escapeHtml(thumb)}" alt="${escapeHtml(pod.title)}" class="podcast-card-thumb"
          onerror="this.src='assets/logo-radio.jpg'" loading="lazy">
        <div class="podcast-card-thumb-overlay">
          <span class="podcast-card-play-icon"><i class="ri-play-fill"></i></span>
        </div>
        ${pod.featured ? '<span class="podcast-card-featured-tag"><i class="ri-star-fill"></i> Destaque</span>' : ''}
      </div>

      <!-- Meta topo -->
      <div class="podcast-card-meta-top">
        <span class="podcast-cat-pill" style="--cat-color: ${catColor};">${escapeHtml(pod.category || 'Podcast')}</span>
        <span class="podcast-duration-tag"><i class="ri-time-line"></i> ${escapeHtml(pod.duration || '—')}</span>
      </div>

      <!-- Título e host -->
      <h3 class="podcast-card-title">${escapeHtml(pod.title)}</h3>
      ${pod.hosts ? `<p class="podcast-card-hosts"><i class="ri-user-voice-line"></i> ${escapeHtml(pod.hosts)}</p>` : ''}
      <p class="podcast-card-desc">${escapeHtml(pod.description || 'Programa de rádio produzido na escola.')}</p>

      <!-- Rodapé do card -->
      <div class="podcast-card-footer">
        <button type="button" class="btn-spotlight-play"
          onclick="loadAndPlayPodcast('${escapeJs(playUrl)}', '${escapeJs(pod.title)}', '${escapeJs(pod.date || '')}', ${podData})">
          <i class="${escapeHtml(btnIcon)}"></i> ${escapeHtml(btnLabel)}
        </button>
      </div>

    </div>
  `;
}

/* ── Cor por categoria ──────────────────────────────────────────────────── */
function getCategoryColor(cat) {
  const map = {
    'Entrevistas':       '#38bdf8',
    'Debates':           '#f472b6',
    'Música':            '#a78bfa',
    'Ciência & Escola':  '#34d399',
    'Emissão Especial':  '#fb923c',
  };
  return map[cat] || '#c084fc';
}

/* ==========================================================================
   4. NOTÍCIAS & ANÚNCIOS
   ========================================================================== */
function renderHomeNews() {
  const container = document.getElementById('announcementsContainer');
  if (!container) return;

  const list = (window.db.getPublicAnnouncements ? window.db.getPublicAnnouncements() : []).slice(0, 3);
  if (list.length === 0) {
    container.innerHTML = `
      <div class="hv2-empty-state">
        <div class="hv2-empty-icon"><i class="ri-newspaper-line"></i></div>
        <h3>Ainda não foram adicionadas notícias</h3>
        <p>Os comunicados e novidades da escola serão publicados em breve.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  list.forEach(ann => {
    const card = document.createElement('div');
    card.className = 'card-box news-card-modern';
    const imgSrc = ann.image || 'assets/logo-radio.jpg';
    card.innerHTML = `
      <a class="news-card-cover" href="artigo.html?id=${encodeURIComponent(ann.id)}" aria-label="Ler ${escapeHtml(ann.title)}">
        <img src="${escapeHtml(imgSrc)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='assets/logo-radio.jpg';">
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

  const list = window.db.getPublicAnnouncements ? window.db.getPublicAnnouncements() : [];
  if (list.length === 0) {
    container.innerHTML = `
      <div class="hv2-empty-state" style="grid-column: 1 / -1;">
        <div class="hv2-empty-icon"><i class="ri-newspaper-line"></i></div>
        <h3>Ainda não foram adicionadas notícias</h3>
        <p>Não existem comunicados publicados de momento. Volta a consultar em breve!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  list.forEach(ann => {
    const searchable = `${ann.title} ${ann.excerpt || ''} ${ann.category || ann.tag || ''}`.toLowerCase();
    if (filterTag !== 'all' && (ann.category || ann.tag) !== filterTag) return;
    if (searchTerm && !searchable.includes(searchTerm.toLowerCase())) return;

    const card = document.createElement('div');
    card.className = 'card-box news-card-modern';
    const imgSrc = ann.image || 'assets/logo-radio.jpg';
    card.innerHTML = `
      <a class="news-card-cover" href="artigo.html?id=${encodeURIComponent(ann.id)}" aria-label="Ler ${escapeHtml(ann.title)}">
        <img src="${escapeHtml(imgSrc)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='assets/logo-radio.jpg';">
        <span class="news-card-category">${escapeHtml(ann.category || ann.tag || 'Notícia')}</span>
      </a>
      <div class="news-card-body">
        <h3 class="news-card-title"><a href="artigo.html?id=${encodeURIComponent(ann.id)}">${escapeHtml(ann.title)}</a></h3>
        <p class="news-card-excerpt">${escapeHtml(ann.excerpt || '')}</p>
        <div class="news-card-footer">
          <span><i class="ri-calendar-line"></i> ${escapeHtml(ann.date || 'Recente')}</span>
          <span><i class="ri-time-line"></i> ${escapeHtml(ann.readTime || '2 min de leitura')}</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
  if (!container.children.length) {
    container.innerHTML = `
      <div class="hv2-empty-state" style="grid-column: 1 / -1;">
        <div class="hv2-empty-icon"><i class="ri-search-eye-line"></i></div>
        <h3>Nenhuma notícia encontrada</h3>
        <p>Tenta pesquisar por outro termo ou escolher outra categoria.</p>
      </div>
    `;
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
