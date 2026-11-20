/* ==========================================================================
   RÁDIO ESCOLAR EBS DA CIDADELA - MÓDULO PRINCIPAL (MULTI-PÁGINA)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  await window.db.ready();
  if (window.db.error) {
    [
      'announcementsContainer',
      'homePodcastsContainer',
      'fullPodcastsGrid',
      'fullNewsGrid',
      'homeSabesQueContainer',
      'economiaSabesQueContainer',
      'economiaNewsContainer',
      'economiaPodcastsContainer',
      'fullSabesQueGrid'
    ].forEach(id => window.showFirebaseError(document.getElementById(id)));
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
  syncInitialPodcastSelection();
  renderHomeSabesQue();
  renderEconomiaPage();
  initEconomiaFilters();
  renderFullSabesQuePage();
  initSabesQueFilters();
  checkDailyLimitUI();
});

document.addEventListener('radio-db-updated', (e) => {
  const col = e.detail && e.detail.collection;
  if (!col || col === 'podcasts') {
    renderHomePodcasts();
    renderFullPodcasts();
    syncInitialPodcastSelection();
    renderEconomiaPage();
  }
  if (!col || col === 'announcements') {
    renderHomeNews();
    renderFullNews();
    renderHomeSabesQue();
    renderEconomiaPage();
    renderFullSabesQuePage();
  }
  if (!col || col === 'sabesQue') {
    renderHomeSabesQue();
    renderEconomiaPage();
    renderFullSabesQuePage();
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
        <div class="form-feedback warning">
          <i class="ri-information-fill"></i>
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

    // Se o aluno alterar o texto depois de ter escolhido uma música, limpa a seleção para obrigar a escolher do catálogo
    if (selectedTrackData) {
      const expectedValue = `${selectedTrackData.songTitle} - ${selectedTrackData.artist}`;
      if (query !== expectedValue) {
        window.removeSelectedTrack();
      }
    }

    if (query.length < 2) {
      dropdown.classList.remove('active');
      dropdown.innerHTML = '';
      return;
    }

    debounceTimer = setTimeout(() => {
      searchITunesMusic(query, dropdown);
    }, 280);
  });

  searchInput.addEventListener('focus', () => {
    const query = searchInput.value.trim();
    if (!selectedTrackData && query.length >= 2) {
      if (dropdown.innerHTML.trim() !== '') {
        dropdown.classList.add('active');
      } else {
        searchITunesMusic(query, dropdown);
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });
}

// Deezer JSONP Search Helper (resilient fallback against CORS and Apple 403 blocks)
function searchDeezerMusicJSONP(query, limit = 8) {
  return new Promise((resolve) => {
    const callbackName = 'deezer_cb_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
    const script = document.createElement('script');
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      cleanup();
      resolve([]);
    }, 4500);

    const cleanup = () => {
      clearTimeout(timer);
      try { delete window[callbackName]; } catch (_) {}
      if (script.parentNode) script.parentNode.removeChild(script);
    };

    window[callbackName] = (data) => {
      if (timedOut) return;
      cleanup();
      if (!data || !Array.isArray(data.data)) {
        return resolve([]);
      }
      const tracks = data.data.map(track => {
        const cover = (track.album && (track.album.cover_big || track.album.cover_medium || track.album.cover)) || 'assets/brand/favicon-negativa.png';
        const artistName = track.artist ? track.artist.name : '';
        const isExplicit = Boolean(track.explicit_lyrics) ||
          (typeof window.isExplicitSong === 'function' ? window.isExplicitSong(track.title, artistName) : false);
        return {
          trackId: track.id,
          songTitle: track.title,
          artist: artistName,
          artwork: cover,
          previewUrl: track.preview || '',
          releaseYear: '',
          explicit: isExplicit,
          source: 'Deezer'
        };
      });
      resolve(tracks);
    };

    script.src = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}&output=jsonp&callback=${callbackName}`;
    script.onerror = () => {
      cleanup();
      resolve([]);
    };
    document.head.appendChild(script);
  });
}

async function searchITunesMusic(query, dropdown) {
  dropdown.innerHTML = `
    <div class="search-dropdown-status">
      <i class="ri-loader-4-line ri-spin"></i> A pesquisar músicas no catálogo...
    </div>
  `;
  dropdown.classList.add('active');

  let normalizedTracks = [];

  // 1. Tentar catálogo Apple Music / iTunes
  try {
    const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=8`);
    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.results) && data.results.length > 0) {
        normalizedTracks = data.results.map(track => {
          const rawArtwork = track.artworkUrl100 || track.artworkUrl60 || 'assets/logo-radio.jpg';
          const artwork = rawArtwork.replace('100x100bb', '300x300bb');
          const releaseYear = track.releaseDate ? new Date(track.releaseDate).getFullYear() : '';
          const isExplicitTrack = (track.trackExplicitness === 'explicit' || track.trackExplicitness === 'cleaned') ||
            (typeof window.isExplicitSong === 'function' ? window.isExplicitSong(track.trackName, track.artistName) : false);
          return {
            trackId: track.trackId,
            songTitle: track.trackName,
            artist: track.artistName,
            artwork: artwork,
            previewUrl: track.previewUrl || '',
            releaseYear: releaseYear,
            explicit: isExplicitTrack,
            source: 'Apple Music'
          };
        });
      }
    }
  } catch (err) {
    console.warn('iTunes API indisponível, a recorrer a catálogo alternativo:', err.message);
  }

  // 2. Fallback resiliente ao Deezer se iTunes estiver com 403, indisponível ou sem resultados
  if (normalizedTracks.length === 0) {
    try {
      const deezerTracks = await searchDeezerMusicJSONP(query, 8);
      if (deezerTracks && deezerTracks.length > 0) {
        normalizedTracks = deezerTracks;
      }
    } catch (errDeezer) {
      console.warn('Fallback Deezer também indisponível:', errDeezer);
    }
  }

  // Função auxiliar para selecionar manualmente
  const pickManualSong = () => {
    const parts = query.split(/\s*[-–—]\s*|\s+by\s+|\s+de\s+/i);
    const parsedTitle = parts[0] ? parts[0].trim() : query.trim();
    const parsedArtist = parts[1] ? parts.slice(1).join(' - ').trim() : 'Artista a confirmar';
    const isExpl = typeof window.isExplicitSong === 'function' ? window.isExplicitSong(parsedTitle, parsedArtist) : false;
    selectTrack({
      trackId: 'manual_' + Date.now(),
      songTitle: parsedTitle,
      artist: parsedArtist,
      artwork: 'assets/brand/favicon-negativa.png',
      previewUrl: '',
      explicit: Boolean(isExpl)
    });
    dropdown.classList.remove('active');
    document.getElementById('musicSearchInput').value = `${parsedTitle} - ${parsedArtist}`;
    const alertContainer = document.getElementById('suggestionAlertContainer');
    if (alertContainer) alertContainer.innerHTML = '';
  };

  if (normalizedTracks.length === 0) {
    dropdown.innerHTML = `
      <div class="search-dropdown-status search-dropdown-empty" style="padding: 1.2rem;">
        <i class="ri-music-2-line" style="font-size: 1.8rem; display: block; margin-bottom: 0.35rem; color: #e4232a;"></i>
        <strong>Não encontramos no catálogo automático</strong>
        <span style="display: block; font-size: 0.85rem; color: #6f6768; margin-top: 0.25rem; margin-bottom: 0.85rem;">
          Podes pedir "${escapeHtml(query)}" manualmente e a equipa da rádio tratará de a encontrar!
        </span>
        <button type="button" class="w-btn w-btn-red" id="btnSelectManualSong" style="width: 100%; font-size: 1rem; padding: 0.55rem 0.85rem;">
          <i class="ri-check-line"></i> Pedir "${escapeHtml(query)}"
        </button>
      </div>
    `;
    const btnManual = dropdown.querySelector('#btnSelectManualSong');
    if (btnManual) {
      btnManual.addEventListener('click', pickManualSong);
    }
    return;
  }

  dropdown.innerHTML = '';
  normalizedTracks.forEach(track => {
    const item = document.createElement('div');
    item.className = 'search-result-item search-row';

    item.innerHTML = `
      <div class="search-result-thumb">
        <img src="${track.artwork}" alt="${escapeHtml(track.songTitle)}" loading="lazy">
      </div>
      <div class="search-result-details">
        <h4 class="item-title">${track.explicit ? '<span class="song-explicit-tag" title="Conteúdo Explícito [E] — Impróprio para emissão escolar">E</span>' : ''}${escapeHtml(track.songTitle)}</h4>
        <p class="item-artist">
          <span>${escapeHtml(track.artist)}</span>
          ${track.releaseYear ? `<span class="search-result-sep">•</span><span>${track.releaseYear}</span>` : ''}
        </p>
      </div>
      <div class="search-result-action">
        <span class="select-badge"><i class="ri-add-line"></i> Selecionar</span>
      </div>
    `;

    item.addEventListener('click', () => {
      selectTrack({
        trackId: track.trackId,
        songTitle: track.songTitle,
        artist: track.artist,
        artwork: track.artwork,
        previewUrl: track.previewUrl,
        explicit: track.explicit
      });
      dropdown.classList.remove('active');
      document.getElementById('musicSearchInput').value = track.songTitle + ' - ' + track.artist;
      const alertContainer = document.getElementById('suggestionAlertContainer');
      if (alertContainer) alertContainer.innerHTML = '';
    });

    dropdown.appendChild(item);
  });

  // Opção manual no rodapé do dropdown
  const manualRow = document.createElement('div');
  manualRow.className = 'search-result-item search-row manual-option';
  manualRow.style.cssText = 'border-top: 1px dashed var(--edge, #e9e2e2); background: rgba(228, 35, 42, 0.04);';
  manualRow.innerHTML = `
    <div class="search-result-thumb" style="display:flex;align-items:center;justify-content:center;background:#e9e2e2;border-radius:4px;">
      <i class="ri-edit-line" style="font-size:1.1rem;color:#e4232a;"></i>
    </div>
    <div class="search-result-details">
      <h4 class="item-title" style="font-size: 0.95rem;">Pedir "${escapeHtml(query)}" manualmente</h4>
      <p class="item-artist"><span>Não encontras a versão certa? Clica para avançar com este título.</span></p>
    </div>
    <div class="search-result-action">
      <span class="select-badge" style="background:#282425;color:#fff;"><i class="ri-check-line"></i> Usar esta</span>
    </div>
  `;
  manualRow.addEventListener('click', pickManualSong);
  dropdown.appendChild(manualRow);
}

function selectTrack(track) {
  selectedTrackData = track;
  const container = document.getElementById('selectedTrackContainer');
  if (!container) return;

  const hasPreview = Boolean(track.previewUrl);
  const isExplicit = Boolean(track.explicit);

  const cooldown = window.db && typeof window.db.checkSongRequestCooldown === 'function'
    ? window.db.checkSongRequestCooldown(track.songTitle, track.artist)
    : null;

  let cooldownAlertHtml = '';
  if (cooldown && cooldown.isBlocked) {
    const reqDate = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(cooldown.requestedAt));
    const availDate = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' }).format(cooldown.cooldownDate);
    cooldownAlertHtml = `
      <div class="w-song-cooldown-box" role="alert">
        <i class="ri-history-line w-song-cooldown-icon" aria-hidden="true"></i>
        <div class="w-song-cooldown-content">
          <div class="w-song-cooldown-badge">
            <i class="ri-forbid-line" aria-hidden="true"></i> Bloqueio de 4 meses ativo
          </div>
          <p class="w-song-cooldown-text">
            Já sugeriste este tema a <strong>${reqDate}</strong>. Para manter a emissão diversificada, só poderás voltar a pedir esta música a partir de <span class="w-song-cooldown-date">${availDate}</span>. Escolhe outra música!
          </p>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="selected-track-card selected-song-card ${cooldown && cooldown.isBlocked ? 'is-cooldown-blocked' : ''}">
      <div class="track-thumb-wrap">
        <img src="${track.artwork}" alt="${escapeHtml(track.songTitle)}">
        <div class="track-active-badge" title="Selecionada"><i class="ri-check-line"></i></div>
      </div>
      <div class="track-info">
        <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
          <span class="track-status-tag"><i class="ri-disc-line"></i> Música Selecionada</span>
          ${isExplicit ? '<span class="song-explicit-tag" title="Conteúdo Explícito [E] — Pode não ser transmitida em horário escolar">E</span>' : ''}
          ${cooldown && cooldown.isBlocked ? '<span class="w-cooldown-pill" title="Música em período de intervalo (4 meses)"><i class="ri-history-line"></i> 4 Meses</span>' : ''}
        </div>
        <h4 class="track-title">${isExplicit ? '<span class="song-explicit-tag" title="Conteúdo Explícito [E]">E</span>' : ''}${escapeHtml(track.songTitle)}</h4>
        <p class="track-artist">${escapeHtml(track.artist)}</p>
        ${cooldownAlertHtml}
        ${isExplicit ? `
          <div class="w-song-explicit-box" role="alert">
            <span class="song-explicit-tag" style="flex-shrink: 0;">E</span>
            <span><strong>Conteúdo Explícito:</strong> Contém linguagem sensível / palavrões. Poderá não ser transmitida durante os intervalos escolares.</span>
          </div>
        ` : ''}
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

  const form = document.getElementById('suggestionForm');
  const submitBtn = form?.querySelector('button[type="submit"]');
  if (submitBtn) {
    if (cooldown && cooldown.isBlocked) {
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.55';
      submitBtn.style.cursor = 'not-allowed';
      submitBtn.innerHTML = '<i class="ri-forbid-line" aria-hidden="true"></i> Bloqueada por 4 meses';
    } else {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '';
      submitBtn.style.cursor = '';
      submitBtn.innerHTML = '<i class="ri-send-plane-fill" aria-hidden="true"></i> Submeter sugestão';
    }
  }
}

window.toggleAudioPreview = function(e) {
  if (e) e.preventDefault();
  const audio = document.getElementById('selectedTrackAudio');
  const icon = document.getElementById('playPreviewIcon');
  const btn = document.getElementById('playPreviewBtn');
  if (!audio) return;

  if (audio.paused) {
    document.querySelectorAll('audio').forEach(a => { if (a !== audio) { a.pause(); a.currentTime = 0; } });
    audio.play().catch(() => {});
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

  const form = document.getElementById('suggestionForm');
  const submitBtn = form?.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.style.opacity = '';
    submitBtn.style.cursor = '';
    submitBtn.innerHTML = '<i class="ri-send-plane-fill" aria-hidden="true"></i> Submeter sugestão';
  }
};

/* ==========================================================================
   2. ENVIO DE SUGESTÃO COM LIMITE DE 3 POR DIA E BLOQUEIO DE 4 MESES
   ========================================================================== */
function initSuggestionForm() {
  const form = document.getElementById('suggestionForm');
  const alertContainer = document.getElementById('suggestionAlertContainer');

  if (!form) return;

  // Pré-preencher identificação guardada no dispositivo para tornar os próximos pedidos rápidos
  const nameInputEl = document.getElementById('reqStudentName');
  const numInputEl = document.getElementById('reqStudentNumber');
  const classInputEl = document.getElementById('reqStudentClass');
  try {
    const savedIdentity = JSON.parse(localStorage.getItem('wave_student_identity') || 'null');
    if (savedIdentity && typeof savedIdentity === 'object') {
      if (nameInputEl && savedIdentity.name) nameInputEl.value = savedIdentity.name;
      if (numInputEl && savedIdentity.number) numInputEl.value = savedIdentity.number;
      if (classInputEl && savedIdentity.studentClass) classInputEl.value = savedIdentity.studentClass;
    }
  } catch (_) {}

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    if (getTodayRequestCount() >= MAX_DAILY_REQUESTS) {
      checkDailyLimitUI();
      return;
    }

    const searchInputEl = document.getElementById('musicSearchInput');
    const dropdownEl = document.getElementById('searchResultsDropdown');
    const manualInput = searchInputEl ? searchInputEl.value.trim() : '';

    if (!selectedTrackData || !selectedTrackData.songTitle) {
      alertContainer.innerHTML = `
        <div class="form-feedback error" style="animation: fadeInUp 0.25s ease;">
          <i class="ri-error-warning-line"></i>
          <span><strong>Escolhe uma música da lista de sugestões!</strong> Só é possível pedir músicas que apareçam no catálogo do Apple Music. Escreve na barra de pesquisa e clica numa das opções da lista.</span>
        </div>
      `;
      if (searchInputEl) {
        searchInputEl.focus();
        if (manualInput.length >= 2 && dropdownEl) {
          searchITunesMusic(manualInput, dropdownEl);
        }
      }
      return;
    }

    const finalSongTitle = selectedTrackData.songTitle;
    const finalArtist = selectedTrackData.artist;
    const artwork = selectedTrackData.artwork || 'assets/logo-radio.jpg';
    const previewUrl = selectedTrackData.previewUrl || '';

    const nameEl = document.getElementById('reqStudentName');
    const numEl = document.getElementById('reqStudentNumber');
    const classEl = document.getElementById('reqStudentClass');
    const sName = (nameEl ? nameEl.value : '').trim();
    const sNum = (numEl ? numEl.value : '').trim();
    const sClass = (classEl ? classEl.value : '').trim();

    if (!sName || sName.length < 2 || !sNum || !sClass) {
      alertContainer.innerHTML = `
        <div class="form-feedback error" style="animation: fadeInUp 0.25s ease;">
          <i class="ri-error-warning-line"></i>
          <span><strong>Identificação obrigatória:</strong> Para sugerires uma música, tens de preencher o teu <strong>Nome</strong>, <strong>Número</strong> e <strong>Turma</strong>!</span>
        </div>
      `;
      if (!sName || sName.length < 2) nameEl?.focus();
      else if (!sNum) numEl?.focus();
      else classEl?.focus();
      return;
    }

    try {
      localStorage.setItem('wave_student_identity', JSON.stringify({
        name: sName,
        number: sNum,
        studentClass: sClass
      }));
    } catch (_) {}

    const studentClassField = `${sClass} · Nº ${sNum}`.slice(0, 40);
    const teacherNameField = `Aluno: ${sName} (Nº ${sNum} · ${sClass})`.slice(0, 120);

    // Validação de intervalo de 4 meses para a mesma pessoa / dispositivo
    const cooldown = window.db && typeof window.db.checkSongRequestCooldown === 'function'
      ? window.db.checkSongRequestCooldown(finalSongTitle, finalArtist)
      : null;

    if (cooldown && cooldown.isBlocked) {
      const reqDate = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(cooldown.requestedAt));
      const availDate = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' }).format(cooldown.cooldownDate);
      alertContainer.innerHTML = `
        <div class="form-feedback warning" style="animation: fadeInUp 0.3s ease;">
          <i class="ri-history-line" style="font-size: 1.4rem; color: #f59e0b; flex-shrink: 0;"></i>
          <div>
            <strong>Música pedida recentemente (Bloqueio de 4 Meses):</strong><br>
            Já sugeriste a música <em>"${escapeHtml(cooldown.songTitle)}"</em> há menos de 4 meses (a ${reqDate}). Para garantirmos uma emissão diversificada e dar vez a novos temas, só poderás voltar a pedir esta música a partir de <strong>${availDate}</strong>.
          </div>
        </div>
      `;
      return;
    }

    const isExplicit = Boolean(
      (selectedTrackData && (selectedTrackData.explicit === true || selectedTrackData.trackExplicitness === 'explicit')) ||
      (typeof window.isExplicitSong === 'function' ? window.isExplicitSong(finalSongTitle, finalArtist) : false)
    );

    const suggestionPayload = {
      title: finalSongTitle,
      songTitle: finalSongTitle,
      artist: finalArtist,
      cover: artwork,
      artwork: artwork,
      previewUrl: previewUrl || '',
      explicit: Boolean(isExplicit),
      source: 'web',
      studentClass: studentClassField,
      teacherName: teacherNameField
    };

    const newSug = window.db.addSuggestion(suggestionPayload);

    if (newSug && newSug.id) {
      }

    incrementTodayRequestCount();

    window.removeSelectedTrack();
    if (searchInputEl) searchInputEl.value = '';

    const newCount = getTodayRequestCount();
    checkDailyLimitUI();

    alertContainer.innerHTML = `
      <div class="form-feedback success">
        <i class="ri-checkbox-circle-fill"></i>
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

    window.db.addMessage({
      name,
      senderName: name,
      studentClass,
      senderGroup: studentClass,
      email,
      subject: `Mensagem de ${name} (${studentClass})`,
      message
    });
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
    seekTrack.addEventListener('keydown', (e) => {
      if (!currentAudio.duration) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        window.skipPodcastSeconds(15);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        window.skipPodcastSeconds(-15);
      }
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
  const shareTitle = pod ? pod.title : 'Wave Rádio EBS Cidadela — Podcasts';

  if (navigator.share) {
    navigator.share({
      title: shareTitle,
      text: `Ouve este episódio da Wave Rádio da Cidadela: ${shareTitle}`,
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

window.loadAndPlayPodcast = function (audioOrSpotifyUrl, title, subtitle, podObj = null, options = {}) {
  const playerSec = document.getElementById('podcastMainPlayerSection');
  if (!playerSec) {
    const targetKey = (podObj && (podObj.id || podObj.title)) || title || 'latest';
    window.location.href = `podcasts.html?play=${encodeURIComponent(targetKey)}#podcastMainPlayerSection`;
    return;
  }

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
  if (subEl)     subEl.innerText    = subtitle || (podObj && podObj.date) || 'Wave Rádio • A Tua Rádio das 10:00!';
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
    if (options.autoplay !== false) {
      currentAudio.play().then(() => {
        isPlaying = true;
        updatePlayButtonState(true);
      }).catch(err => {
        console.error('Erro de áudio:', err);
      });
    } else {
      isPlaying = false;
      updatePlayButtonState(false);
    }
  }

  // ── Scroll suave para o player ─────────────────────────────────────────
  if (playerSec && options.scroll !== false) {
    playerSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

function syncInitialPodcastSelection() {
  const playerSec = document.getElementById('podcastMainPlayerSection');
  if (!playerSec || currentActivePodcastObj) return;

  const isEconomiaPage = Boolean(document.getElementById('economiaPodcastsContainer'));
  const allPods = isEconomiaPage
    ? (window.db && window.db.getEconomyPodcasts ? window.db.getEconomyPodcasts() : [])
    : (window.db && window.db.getMainPodcasts ? window.db.getMainPodcasts() : (window.db.getPodcasts ? window.db.getPodcasts() : []));
  if (!allPods || allPods.length === 0) return;

  const sorted = [...allPods].sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const params = new URLSearchParams(window.location.search);
  const playParam = params.get('play') || params.get('ep');
  let target = sorted[0];

  if (playParam && playParam !== 'latest') {
    const norm = playParam.toLowerCase();
    const match = sorted.find(p =>
      String(p.id || '').toLowerCase() === norm ||
      String(p.title || '').toLowerCase() === norm
    );
    if (match) target = match;
  }

  const playUrl = target.audioUrl || target.spotifyUrl || target.originalUrl || '';
  const shouldAutoplay = Boolean(playParam);
  window.loadAndPlayPodcast(playUrl, target.title, target.date || '', target, {
    autoplay: shouldAutoplay,
    scroll: shouldAutoplay
  });
}

function renderHomePodcasts() {
  const container = document.getElementById('homePodcastsContainer');
  if (!container) return;

  const allPods = window.db.getMainPodcasts ? window.db.getMainPodcasts() : (window.db.getPodcasts ? window.db.getPodcasts() : []);
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
    card.innerHTML = buildPodcastCardHTML(pod, playUrl, 'Ouvir Episódio', 'ri-play-circle-fill');
    container.appendChild(card);
  });
}

function renderFullPodcasts() {
  const container = document.getElementById('fullPodcastsGrid');
  if (!container) return;

  const allPods = window.db.getMainPodcasts ? window.db.getMainPodcasts() : (window.db.getPodcasts ? window.db.getPodcasts() : []);

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
        <p>A equipa da Wave Rádio está a preparar novos episódios. Fica atento às próximas emissões!</p>
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

window.playPodcastById = function (id) {
  const pods = window.db.getPodcasts ? window.db.getPodcasts() : [];
  const pod = pods.find(p => String(p.id) === String(id));
  if (!pod) return;
  const playUrl = pod.audioUrl || pod.spotifyUrl || pod.originalUrl || '';
  window.loadAndPlayPodcast(playUrl, pod.title, pod.date || '', pod);
};

/* ── Helper: build a podcast episode card ───────────────────────────────── */
function buildPodcastCardHTML(pod, playUrl, btnLabel, btnIcon) {
  const thumb   = pod.thumbnail || 'assets/logo-radio.jpg';
  const catColor = getCategoryColor(pod.category);
  const safeId  = escapeJs(pod.id || '');

  return `
    <div class="podcast-card-inner">

      <!-- Thumbnail do episódio -->
      <div class="podcast-card-thumb-wrap" onclick="playPodcastById('${safeId}')" title="Reproduzir ${escapeHtml(pod.title)}">
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
          onclick="playPodcastById('${safeId}')">
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

/* ==========================================================================
   5. SABES QUE... (POR DISCIPLINA) & ECONOMIA EM FREQUÊNCIA
   ========================================================================== */
function buildSabesQueCardHTML(item, options = {}) {
  const discipline = item.discipline || 'Economia';
  const showLatestBadge = Boolean(options.showLatestBadge);
  const safeId = escapeJs(item.id || '');
  const hasImg = Boolean(item.image && String(item.image).trim());
  const dateLabel = item.date || (item.createdAt ? new Date(item.createdAt).toLocaleDateString('pt-PT') : 'Recente');

  return `
    <article class="sq-card">
      <div class="sq-card-top">
        <span class="sq-discipline-pill"><i class="ri-lightbulb-flash-line" aria-hidden="true"></i> Sabias que... ${escapeHtml(discipline)}</span>
        <span class="sq-badge">
          ${showLatestBadge ? '<i class="ri-sparkling-line" aria-hidden="true"></i> Mais recente' : `<i class="ri-calendar-line" aria-hidden="true"></i> ${escapeHtml(dateLabel)}`}
        </span>
      </div>
      ${hasImg ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" class="sq-cover-thumb" loading="lazy" onerror="this.style.display='none'">` : ''}
      <h3 class="sq-question">${escapeHtml(item.title || 'Curiosidade')}</h3>
      <p class="sq-body">${escapeHtml(item.content || '')}</p>
      <div class="sq-footer">
        <span><i class="ri-user-3-line" aria-hidden="true"></i> ${escapeHtml(item.author || 'Wave Rádio')}</span>
        <button type="button" class="sq-read-btn" onclick="openSabesQueModal('${safeId}')">
          Ler tudo <i class="ri-arrow-right-up-line" aria-hidden="true"></i>
        </button>
      </div>
    </article>
  `;
}

function buildNewsCardElement(ann) {
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
  return card;
}

window.openSabesQueModal = function (id) {
  if (!window.db || typeof window.db.getSabesQueById !== 'function') return;
  const item = window.db.getSabesQueById(id);
  if (!item) return;

  let overlay = document.getElementById('sabesQueReaderOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sabesQueReaderOverlay';
    overlay.className = 'sq-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'sqModalTitle');
    overlay.innerHTML = `
      <div class="sq-modal-card">
        <button type="button" class="sq-modal-close" id="sqModalCloseBtn" aria-label="Fechar janela"><i class="ri-close-line"></i></button>
        <div id="sqModalBodySlot"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSabesQueModal();
    });
    document.getElementById('sqModalCloseBtn').addEventListener('click', closeSabesQueModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) closeSabesQueModal();
    });
  }

  const slot = document.getElementById('sqModalBodySlot');
  const disc = item.discipline || 'Economia';
  slot.innerHTML = `
    <span class="sq-discipline-pill"><i class="ri-lightbulb-flash-line"></i> Sabias que... ${escapeHtml(disc)}</span>
    <h2 class="sq-modal-title" id="sqModalTitle">${escapeHtml(item.title)}</h2>
    ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" class="sq-cover-thumb" style="max-height:320px;" onerror="this.style.display='none'">` : ''}
    <div class="sq-modal-content">${escapeHtml(item.content)}</div>
    <div class="sq-modal-meta">
      <span><i class="ri-user-3-line"></i> ${escapeHtml(item.author || 'Equipa da Rádio')}</span>
      ${item.date ? `<span><i class="ri-calendar-line"></i> ${escapeHtml(item.date)}</span>` : ''}
      ${item.source ? `<span><i class="ri-book-2-line"></i> Fonte: ${escapeHtml(item.source)}</span>` : ''}
      <a href="sabes-que.html?disciplina=${encodeURIComponent(disc)}" style="margin-left:auto;color:var(--red-a);font-weight:700;text-decoration:underline;">Ver mais de ${escapeHtml(disc)}</a>
    </div>
  `;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.closeSabesQueModal = function () {
  const overlay = document.getElementById('sabesQueReaderOverlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
};

function renderHomeSabesQue() {
  const container = document.getElementById('homeSabesQueContainer');
  if (!container) return;

  const latestByDiscipline = window.db && window.db.getLatestSabesQueByDiscipline
    ? window.db.getLatestSabesQueByDiscipline()
    : [];

  if (latestByDiscipline.length === 0) {
    container.innerHTML = `
      <div class="hv2-empty-state" style="grid-column: 1 / -1;">
        <div class="hv2-empty-icon"><i class="ri-lightbulb-flash-line"></i></div>
        <h3>Ainda não foram adicionadas curiosidades "Sabias que..."</h3>
        <p>Em breve vais encontrar aqui o "Sabias que..." mais recente de Economia e de outras disciplinas.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = latestByDiscipline
    .map(item => buildSabesQueCardHTML(item, { showLatestBadge: true }))
    .join('');
}

const ECONOMY_PODCAST_SHOWS = [
  {
    id: 'eco-show-mito-ou-verdade',
    title: 'Mito ou verdade',
    category: 'Mito ou verdade',
    hosts: 'Economia em Frequência',
    duration: 'Série Oficial',
    description: 'Desmontamos mitos financeiros e verdades sobre dinheiro, consumo e mercados no dia a dia.',
    thumbnail: 'assets/logo-radio.jpg'
  },
  {
    id: 'eco-show-jovens-e-dinheiro',
    title: 'Jovens e dinheiro',
    category: 'Jovens e dinheiro',
    hosts: 'Economia em Frequência',
    duration: 'Série Oficial',
    description: 'Poupança, consumo consciente, gestão de orçamento e os primeiros passos na literacia financeira.',
    thumbnail: 'assets/logo-radio.jpg'
  },
  {
    id: 'eco-show-economia-sustentabilidade',
    title: 'Economia e sustentabilidade',
    category: 'Economia e sustentabilidade',
    hosts: 'Economia em Frequência',
    duration: 'Série Oficial',
    description: 'Como equilibrar crescimento económico, inovação verde e escolhas responsáveis para o futuro.',
    thumbnail: 'assets/logo-radio.jpg'
  }
];

function initEconomiaFilters() {}

function getEpisodesForEconomyShow(econPods, showCategory) {
  const catNorm = String(showCategory || '').trim().toLowerCase();
  return (econPods || []).filter(p =>
    String(p.category || '').trim().toLowerCase() === catNorm ||
    String(p.title || '').toLowerCase().includes(catNorm)
  );
}

function buildEconomyPodcastColumn(show, episodes) {
  const latest = episodes.length > 0 ? episodes[0] : null;
  const previousCount = episodes.length > 1 ? episodes.length - 1 : 0;
  const safeCat = escapeJs(show.category);

  let bodyHtml = '';
  if (latest) {
    const thumb = latest.thumbnail || 'assets/logo-radio.jpg';
    const safeId = escapeJs(latest.id || '');
    bodyHtml = `
      <div class="podcast-card-thumb-wrap" onclick="playPodcastById('${safeId}')" title="Reproduzir ${escapeHtml(latest.title)}">
        <img src="${escapeHtml(thumb)}" alt="${escapeHtml(latest.title)}" class="podcast-card-thumb"
          onerror="this.src='assets/logo-radio.jpg'" loading="lazy">
        <div class="podcast-card-thumb-overlay">
          <span class="podcast-card-play-icon"><i class="ri-play-fill"></i></span>
        </div>
        <span class="podcast-card-featured-tag"><i class="ri-sparkling-fill"></i> Mais recente</span>
      </div>
      <div class="econ-pod-col-body">
        <div class="econ-pod-meta">
          <span><i class="ri-calendar-line"></i> ${escapeHtml(latest.date || 'Recente')}</span>
          <span><i class="ri-time-line"></i> ${escapeHtml(latest.duration || '—')}</span>
        </div>
        <h4 class="econ-pod-ep-title">${escapeHtml(latest.title)}</h4>
        ${latest.hosts ? `<p class="econ-pod-ep-hosts"><i class="ri-user-voice-line"></i> ${escapeHtml(latest.hosts)}</p>` : ''}
        <p class="econ-pod-ep-desc">${escapeHtml(latest.description || show.description)}</p>
        <div class="econ-pod-actions">
          <button type="button" class="btn-spotlight-play" onclick="playPodcastById('${safeId}')">
            <i class="ri-play-circle-fill"></i> Ouvir mais recente
          </button>
          <button type="button" class="btn-econ-history" onclick="openEconomyPodcastHistory('${safeCat}')">
            <i class="ri-history-line"></i> Ver episódios anteriores${previousCount > 0 ? ` (${previousCount})` : ''}
          </button>
        </div>
      </div>
    `;
  } else {
    bodyHtml = `
      <div class="econ-pod-col-body econ-pod-col-empty">
        <div class="econ-pod-empty-icon"><i class="ri-mic-off-line"></i></div>
        <p class="econ-pod-ep-desc">${escapeHtml(show.description)}</p>
        <p class="econ-pod-empty-note">Ainda não existe nenhum episódio publicado para este podcast.</p>
        <div class="econ-pod-actions">
          <button type="button" class="btn-econ-history" onclick="openEconomyPodcastHistory('${safeCat}')">
            <i class="ri-history-line"></i> Ver episódios anteriores
          </button>
        </div>
      </div>
    `;
  }

  return `
    <article class="econ-pod-col">
      <header class="econ-pod-col-head">
        <h3 class="econ-pod-col-title">${escapeHtml(show.title)}</h3>
        <span class="econ-pod-col-count">${episodes.length} ${episodes.length === 1 ? 'ep.' : 'eps.'}</span>
      </header>
      ${bodyHtml}
    </article>
  `;
}

window.openEconomyPodcastHistory = function (showCategory) {
  const show = ECONOMY_PODCAST_SHOWS.find(s => s.category.toLowerCase() === String(showCategory || '').toLowerCase())
    || { title: showCategory || 'Podcast', category: showCategory || '' };
  const econPods = window.db && window.db.getEconomyPodcasts ? window.db.getEconomyPodcasts() : [];
  const episodes = getEpisodesForEconomyShow(econPods, show.category);
  const previousEpisodes = episodes.slice(1);

  let overlay = document.getElementById('econHistoryOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'econHistoryOverlay';
    overlay.className = 'sq-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'econHistoryTitle');
    overlay.innerHTML = `
      <div class="sq-modal-card">
        <button type="button" class="sq-modal-close" id="econHistoryCloseBtn" aria-label="Fechar janela"><i class="ri-close-line"></i></button>
        <div id="econHistoryBodySlot"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeEconomyPodcastHistory();
    });
    document.getElementById('econHistoryCloseBtn').addEventListener('click', closeEconomyPodcastHistory);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) closeEconomyPodcastHistory();
    });
  }

  const slot = document.getElementById('econHistoryBodySlot');
  const listToDisplay = previousEpisodes;
  let listHtml = '';

  if (episodes.length === 0) {
    listHtml = '<p class="econ-pod-empty-note" style="margin-top:1rem;">Ainda não existem episódios publicados neste podcast.</p>';
  } else if (listToDisplay.length === 0) {
    listHtml = `
      <p class="econ-pod-empty-note" style="margin-top:1rem;">Este podcast tem apenas o episódio mais recente publicado neste momento:</p>
      <div class="econ-history-list">
        <div class="econ-history-item">
          <div>
            <strong>${escapeHtml(episodes[0].title)}</strong>
            <small>${escapeHtml(episodes[0].date || 'Recente')} • ${escapeHtml(episodes[0].duration || '—')}</small>
          </div>
          <button type="button" class="sq-read-btn" onclick="playPodcastFromHistory('${escapeJs(episodes[0].id)}')">
            <i class="ri-play-fill"></i> Ouvir
          </button>
        </div>
      </div>
    `;
  } else {
    listHtml = `
      <div class="econ-history-list">
        ${listToDisplay.map(ep => `
          <div class="econ-history-item">
            <div>
              <strong>${escapeHtml(ep.title)}</strong>
              <small>${escapeHtml(ep.date || 'Recente')} • ${escapeHtml(ep.duration || '—')}${ep.hosts ? ` • ${escapeHtml(ep.hosts)}` : ''}</small>
              ${ep.description ? `<p>${escapeHtml(ep.description)}</p>` : ''}
            </div>
            <button type="button" class="sq-read-btn" onclick="playPodcastFromHistory('${escapeJs(ep.id)}')">
              <i class="ri-play-fill"></i> Ouvir
            </button>
          </div>
        `).join('')}
      </div>
    `;
  }

  slot.innerHTML = `
    <span class="sq-discipline-pill"><i class="ri-history-line"></i> Episódios anteriores</span>
    <h2 class="sq-modal-title" id="econHistoryTitle">${escapeHtml(show.title)}</h2>
    ${listHtml}
  `;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.closeEconomyPodcastHistory = function () {
  const overlay = document.getElementById('econHistoryOverlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
};

window.playPodcastFromHistory = function (id) {
  closeEconomyPodcastHistory();
  if (typeof window.playPodcastById === 'function') {
    window.playPodcastById(id);
  }
};

function renderEconomiaPage() {
  const sqContainer = document.getElementById('economiaSabesQueContainer');
  const podContainer = document.getElementById('economiaPodcastsContainer');
  if (!sqContainer && !podContainer) return;

  const econFacts = window.db.getSabesQue ? window.db.getSabesQue('Economia') : [];
  const econPods = window.db.getEconomyPodcasts ? window.db.getEconomyPodcasts() : [];

  // 1. Sabes que... Economia
  if (sqContainer) {
    const shownFacts = econFacts.slice(0, 6);
    if (shownFacts.length === 0) {
      sqContainer.innerHTML = `
        <div class="hv2-empty-state" style="grid-column: 1 / -1;">
          <div class="hv2-empty-icon"><i class="ri-lightbulb-flash-line"></i></div>
          <h3>Ainda não existem curiosidades de Economia</h3>
          <p>Novos "Sabias que... Economia" serão publicados brevemente pela equipa.</p>
        </div>
      `;
    } else {
      sqContainer.innerHTML = shownFacts.map(item => buildSabesQueCardHTML(item)).join('');
    }
  }

  // 2. Podcasts de Economia divididos em 3 colunas (mais recente + botão episódios anteriores)
  if (podContainer) {
    podContainer.innerHTML = ECONOMY_PODCAST_SHOWS
      .map(show => buildEconomyPodcastColumn(show, getEpisodesForEconomyShow(econPods, show.category)))
      .join('');
  }
}

let activeSabesQueDiscipline = 'all';
let activeSabesQueQuery = '';

function initSabesQueFilters() {
  const search = document.getElementById('sabesQueSearchInput');
  if (search) {
    search.addEventListener('input', (e) => {
      activeSabesQueQuery = (e.target.value || '').trim().toLowerCase();
      renderFullSabesQuePage();
    });
  }

  const urlDisc = new URLSearchParams(window.location.search).get('disciplina');
  if (urlDisc && urlDisc.trim()) {
    activeSabesQueDiscipline = urlDisc.trim();
  }
}

window.filterSabesQueByDiscipline = function (discipline) {
  activeSabesQueDiscipline = discipline || 'all';
  renderFullSabesQuePage();
};

function renderFullSabesQuePage() {
  const grid = document.getElementById('fullSabesQueGrid');
  const pillsWrap = document.getElementById('sabesQueDisciplinePills');
  if (!grid) return;

  const disciplines = window.db.getSabesQueDisciplines ? window.db.getSabesQueDisciplines() : ['Economia'];
  if (pillsWrap) {
    const isAll = activeSabesQueDiscipline === 'all';
    const buttons = [
      `<button type="button" class="pod-filter-btn ${isAll ? 'active' : ''}" data-discipline="all" onclick="filterSabesQueByDiscipline('all')">Todas</button>`,
      ...disciplines.map(d => {
        const active = d.toLowerCase() === String(activeSabesQueDiscipline || '').toLowerCase();
        return `<button type="button" class="pod-filter-btn ${active ? 'active' : ''}" data-discipline="${escapeHtml(d)}" onclick="filterSabesQueByDiscipline('${escapeJs(d)}')">${escapeHtml(d)}</button>`;
      })
    ];
    pillsWrap.innerHTML = buttons.join('');
  }

  let list = window.db.getSabesQue
    ? window.db.getSabesQue(activeSabesQueDiscipline === 'all' ? null : activeSabesQueDiscipline)
    : [];

  if (activeSabesQueQuery) {
    list = list.filter(item =>
      `${item.title} ${item.content} ${item.discipline} ${item.author}`.toLowerCase().includes(activeSabesQueQuery)
    );
  }

  if (list.length === 0) {
    grid.innerHTML = `
      <div class="hv2-empty-state" style="grid-column: 1 / -1;">
        <div class="hv2-empty-icon"><i class="ri-lightbulb-flash-line"></i></div>
        <h3>Nenhuma curiosidade encontrada</h3>
        <p>${activeSabesQueDiscipline === 'all' ? 'Ainda não foram adicionados "Sabias que..." de nenhuma disciplina.' : `Ainda não existem "Sabias que..." para a disciplina ${escapeHtml(activeSabesQueDiscipline)}.`}</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = list.map(item => buildSabesQueCardHTML(item)).join('');
}
