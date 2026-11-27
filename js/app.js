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
    renderHomeSabesQue();
    renderFullSabesQuePage();
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
        window.skipAudio(15);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        window.skipAudio(-15);
      }
    });
  }

  // Guardar progresso de reprodução automaticamente para retomar onde parou
  let _lastSavedSec = -1;
  currentAudio.addEventListener('timeupdate', () => {
    if (!currentActivePodcastObj || !currentActivePodcastObj.id || !currentAudio.duration) return;
    const sec = Math.floor(currentAudio.currentTime);
    if (Math.abs(sec - _lastSavedSec) >= 3) {
      _lastSavedSec = sec;
      try { localStorage.setItem('wave_pod_pos_' + currentActivePodcastObj.id, String(sec)); } catch (_) {}
    }
  });

  currentAudio.addEventListener('ended', () => {
    if (currentActivePodcastObj && currentActivePodcastObj.id) {
      try { localStorage.removeItem('wave_pod_pos_' + currentActivePodcastObj.id); } catch (_) {}
    }
    updatePlayButtonState(false);
    if (seekFill) seekFill.style.width = '0%';
    const seekThumb = document.getElementById('podSeekThumb');
    if (seekThumb) seekThumb.style.left = '0%';
    if (timeCur) timeCur.innerText = '0:00';
    isPlaying = false;
    // Auto-avançar para o episódio seguinte quando está numa playlist ou programa aberto
    document.dispatchEvent(new CustomEvent('wave-podcast-ended', { detail: { id: currentActivePodcastObj && currentActivePodcastObj.id } }));
    const activeLi = document.querySelector('.pod-ep.active, .pl-episode.active');
    const nextBtn = activeLi && activeLi.nextElementSibling && activeLi.nextElementSibling.querySelector('button');
    if (nextBtn) setTimeout(() => nextBtn.click(), 600);
  });

  // Atalhos de teclado inteligentes no leitor (Espaço = play/pausa, ←/→ = ±15s, M = mute)
  if (!window.__wavePlayerKeysBound) {
    window.__wavePlayerKeysBound = true;
    document.addEventListener('keydown', (e) => {
      if (!document.getElementById('podcastMainPlayerSection')) return;
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!currentAudio || !currentAudio.src) return;
      if (e.code === 'Space') {
        e.preventDefault();
        const btn = document.getElementById('btnPodPlay');
        if (btn) btn.click();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        window.skipAudio(15);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        window.skipAudio(-15);
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        if (typeof window.toggleMute === 'function') window.toggleMute();
      }
    });
  }
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

window.skipPodcastSeconds = function (seconds) { return window.skipAudio(seconds); };
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
  const shareTitle = pod ? pod.title : 'Rádio Wave EBS Cidadela — Podcasts';

  if (navigator.share) {
    navigator.share({
      title: shareTitle,
      text: `Ouve este episódio da Rádio Wave da Cidadela: ${shareTitle}`,
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
  const inp = document.getElementById('podcastSearchInput');
  if (inp && !inp.dataset.enterBound) {
    inp.dataset.enterBound = '1';
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = document.querySelector('#fullPodcastsGrid .pod-row');
        if (first) { e.preventDefault(); first.click(); }
      }
    });
  }
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
  if (currentActivePodcastObj.id) {
    try { localStorage.setItem('wave_last_podcast_id', String(currentActivePodcastObj.id)); } catch (_) {}
  }

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
  if (subEl)     subEl.innerText    = subtitle || (podObj && podObj.date) || 'Rádio Wave • A Tua Rádio das 10:00!';
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
    if (currentActivePodcastObj && currentActivePodcastObj.id) {
      const savedSec = Number(localStorage.getItem('wave_pod_pos_' + currentActivePodcastObj.id) || 0);
      if (savedSec > 5) {
        currentAudio.addEventListener('loadedmetadata', () => {
          if (currentAudio.duration && savedSec < currentAudio.duration - 10) {
            currentAudio.currentTime = savedSec;
          }
        }, { once: true });
      }
    }
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
  if (document.getElementById('playlistEpisodeList')) return; // a página de playlist escolhe o seu próprio episódio

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

/* ── Podcasts organizados por programa ─────────────────────────────────── */
const POD_PROGRAMS = [
  { key: 'nerd', title: 'Nerd Alert', icon: 'ri-flashlight-fill', desc: 'Desafios, enigmas e curiosidades para os mais curiosos da escola.', link: null },
  { key: 'sabias', title: 'Sabias que...', icon: 'ri-lightbulb-flash-line', desc: 'Curiosidades rápidas por disciplina, em formato de podcast.', link: 'sabes-que.html' },
  { key: 'economia', title: 'Economia em Frequência', icon: 'ri-line-chart-line', desc: 'O projeto temático de economia da Rádio Wave: mitos, verdades e literacia financeira.', link: 'economia.html' }
];
const ECON_PROGRAM_CATEGORIES = ['economia', 'economia em frequência', 'mito ou verdade', 'jovens e dinheiro', 'economia e sustentabilidade'];
let podRecentExpanded = false;
const podProgramExpanded = new Set();

function getPodcastProgramKey(p) {
  const cat = String(p.category || '').trim().toLowerCase();
  if (cat === 'nerd alert') return 'nerd';
  if (cat === 'sabias que') return 'sabias';
  if (ECON_PROGRAM_CATEGORIES.includes(cat) || p.portal === 'economia' || p.portal === 'both') return 'economia';
  return 'cat:' + (p.category || 'Geral');
}

function podSortByDate(list) {
  return [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function getCustomPodcastShows() {
  return window.db && typeof window.db.getPodcastShows === 'function' ? window.db.getPodcastShows() : [];
}

function findCustomShowForEpisode(ep) {
  const shows = getCustomPodcastShows();
  return shows.find(sh =>
    (ep.showId && String(ep.showId) === String(sh.id)) ||
    String(ep.category || '').trim().toLowerCase() === String(sh.title || '').trim().toLowerCase()
  ) || null;
}

function podProgramTitleOf(ep) {
  const custom = findCustomShowForEpisode(ep);
  if (custom) return custom.title;
  const key = getPodcastProgramKey(ep);
  const def = POD_PROGRAMS.find(p => p.key === key);
  if (def) return def.title;
  return key.startsWith('cat:') ? key.slice(4) : key;
}

function podRowHTML(ep, opts = {}) {
  const thumb = ep.thumbnail || 'assets/logo-radio.jpg';
  const id = escapeJs(ep.id || '');
  const prog = opts.hideProgram ? '' : `<span class="pod-row-prog">${escapeHtml(podProgramTitleOf(ep))}${ep.discipline && getPodcastProgramKey(ep) === 'sabias' ? ' · ' + escapeHtml(ep.discipline) : ''}</span>`;
  return `
    <button type="button" class="pod-row" onclick="playPodcastById('${id}')" aria-label="Ouvir ${escapeHtml(ep.title)}">
      <img class="pod-row-thumb" src="${escapeHtml(thumb)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='assets/logo-radio.jpg';">
      <span class="pod-row-info">
        ${prog}
        <strong class="pod-row-title">${escapeHtml(ep.title)}</strong>
        <small class="pod-row-meta"><i class="ri-calendar-line"></i> ${escapeHtml(ep.date || 'Recente')} <i class="ri-time-line"></i> ${escapeHtml(ep.duration || '—')}</small>
      </span>
      <span class="pod-row-play" aria-hidden="true"><i class="ri-play-fill"></i></span>
    </button>`;
}

window.toggleRecentPodcasts = function () { podRecentExpanded = !podRecentExpanded; renderFullPodcasts(); };

let podOpenProgram = null;
let podSabiasDisc = 'all';
let podActiveEpId = null;

const POD_PROGRAM_COLORS = { nerd: '#d97706', sabias: '#7c3aed', economia: '#15803d' };

function podMovePlayer(toSlotId) {
  const player = document.getElementById('podcastMainPlayerSection');
  const slot = document.getElementById(toSlotId);
  if (player && slot && player.parentNode !== slot) slot.appendChild(player);
}

function podGroups(all) {
  const groups = new Map();
  const savedShows = getCustomPodcastShows();
  const hiddenBuiltIns = new Set(savedShows.filter(sh => sh.builtInKey && sh.hidden).map(sh => sh.builtInKey));
  const customOnly = savedShows.filter(sh => !sh.builtInKey && !sh.hidden);
  customOnly.forEach(sh => {
    groups.set('show:' + sh.id, {
      key: 'show:' + sh.id,
      title: sh.title,
      icon: sh.icon || 'ri-mic-2-fill',
      desc: sh.description || '',
      cover: sh.cover || '',
      color: sh.color || '#1db954',
      link: null,
      episodes: []
    });
  });
  const visibleBuiltIns = POD_PROGRAMS.filter(p => !hiddenBuiltIns.has(p.key));
  visibleBuiltIns.forEach(p => {
    const ov = savedShows.find(sh => sh.builtInKey === p.key && !sh.hidden);
    groups.set(p.key, {
      ...p,
      title: (ov && ov.title) || p.title,
      desc: (ov && ov.description) || p.desc,
      icon: (ov && ov.icon) || p.icon,
      cover: (ov && ov.cover) || '',
      color: (ov && ov.color) || POD_PROGRAM_COLORS[p.key] || '#282425',
      episodes: []
    });
  });
  all.forEach(ep => {
    const custom = customOnly.find(sh =>
      (ep.showId && String(ep.showId) === String(sh.id)) ||
      String(ep.category || '').trim().toLowerCase() === String(sh.title || '').trim().toLowerCase()
    );
    const key = custom ? ('show:' + custom.id) : getPodcastProgramKey(ep);
    if (hiddenBuiltIns.has(key)) return;
    if (!groups.has(key)) {
      groups.set(key, { key, title: key.startsWith('cat:') ? key.slice(4) : key, icon: 'ri-mic-line', desc: '', link: null, episodes: [] });
    }
    groups.get(key).episodes.push(ep);
  });
  const fixedKeys = new Set([...customOnly.map(s => 'show:' + s.id), ...visibleBuiltIns.map(p => p.key)]);
  return [
    ...customOnly.map(s => groups.get('show:' + s.id)),
    ...visibleBuiltIns.map(p => groups.get(p.key)),
    ...Array.from(groups.values()).filter(g => !fixedKeys.has(g.key)).sort((a, b) => a.title.localeCompare(b.title, 'pt'))
  ];
}

window.openPodProgram = function (key) {
  podOpenProgram = key;
  podActiveEpId = null;
  podSabiasDisc = 'all';
  try { history.replaceState(null, '', '#programa-' + encodeURIComponent(key)); } catch (_) {}
  renderFullPodcasts();
  const sec = document.getElementById('podProgramsSection');
  if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.closePodProgram = function () {
  podOpenProgram = null;
  try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (_) {}
  renderFullPodcasts();
  const sec = document.getElementById('podProgramsSection');
  if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.selectPodSabiasDisc = function (name) {
  podSabiasDisc = name || 'all';
  renderFullPodcasts();
};

window.playPodProgramEpisode = function (id) {
  const ep = (window.db.getPodcasts ? window.db.getPodcasts() : []).find(p => String(p.id) === String(id));
  if (!ep) return;
  podActiveEpId = ep.id;
  const url = ep.audioUrl || ep.spotifyUrl || ep.originalUrl || '';
  window.loadAndPlayPodcast(url, ep.title, ep.date || '', ep, { autoplay: true, scroll: false });
  document.querySelectorAll('.pod-ep').forEach(li => {
    li.classList.toggle('active', String(li.dataset.id) === String(ep.id));
  });
  const player = document.getElementById('podcastMainPlayerSection');
  if (player && window.matchMedia('(max-width: 900px)').matches) player.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function podTileHTML(g) {
  const n = g.episodes.length;
  const latest = g.episodes[0];
  const cover = g.cover || (latest ? (latest.thumbnail || 'assets/logo-radio.jpg') : '');
  const color = g.color || POD_PROGRAM_COLORS[g.key] || '#282425';
  const safe = escapeJs(g.key);
  const clickable = n > 0;
  return `
    <button type="button" class="pod-tile${clickable ? '' : ' is-soon'}" style="--tile: ${color};" ${clickable ? `onclick="openPodProgram('${safe}')"` : 'disabled aria-disabled="true"'} aria-label="${escapeHtml(g.title)} — ${n} episódios">
      <span class="pod-tile-art">
        ${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='assets/logo-radio.jpg';">` : `<i class="${escapeHtml(g.icon)} pod-tile-bigicon" aria-hidden="true"></i>`}
        <span class="pod-tile-badge">${clickable ? `${n} ${n === 1 ? 'episódio' : 'episódios'}` : 'Em breve'}</span>
        ${clickable ? '<span class="pod-tile-play"><i class="ri-play-fill" aria-hidden="true"></i></span>' : ''}
      </span>
      <span class="pod-tile-body">
        <strong class="pod-tile-title"><i class="${escapeHtml(g.icon)}" aria-hidden="true"></i> ${escapeHtml(g.title)}</strong>
        <span class="pod-tile-desc">${escapeHtml(g.desc || (latest ? 'Último: ' + latest.title : ''))}</span>
      </span>
    </button>`;
}

function podEpisodeItemHTML(ep, number) {
  return `
    <li class="pod-ep" data-id="${escapeHtml(ep.id)}">
      <button type="button" class="pod-ep-btn" onclick="playPodProgramEpisode('${escapeJs(ep.id || '')}')" aria-label="Ouvir ${escapeHtml(ep.title)}">
        <span class="pod-ep-num">${number}</span>
        <img class="pod-ep-thumb" src="${escapeHtml(ep.thumbnail || 'assets/logo-radio.jpg')}" alt="" loading="lazy" onerror="this.onerror=null;this.src='assets/logo-radio.jpg';">
        <span class="pod-ep-info">
          <strong>${escapeHtml(ep.title)}</strong>
          <small>${escapeHtml(ep.date || 'Recente')} · ${escapeHtml(ep.duration || '—')}</small>
        </span>
        <span class="pod-ep-icon" aria-hidden="true"><i class="ri-play-fill"></i></span>
      </button>
    </li>`;
}

function renderFullPodcasts() {
  const recentGrid = document.getElementById('recentPodcastsGrid');
  const progWrap = document.getElementById('podcastProgramsContainer');
  const resultsGrid = document.getElementById('fullPodcastsGrid');
  if (!recentGrid && !progWrap && !resultsGrid) return;

  const all = podSortByDate(window.db.getPodcasts ? window.db.getPodcasts() : []);
  const searchSec = document.getElementById('podSearchResults');
  const recentSec = document.getElementById('podRecentSection');
  const progSec = document.getElementById('podProgramsSection');

  // ── Pesquisa ────────────────────────────────────────────────────────────
  if (activePodcastSearchQuery && searchSec) {
    podMovePlayer('podPlayerTop');
    const q = activePodcastSearchQuery;
    const found = all.filter(p => `${p.title || ''} ${p.description || ''} ${p.hosts || ''} ${p.category || ''} ${p.discipline || ''}`.toLowerCase().includes(q));
    searchSec.style.display = '';
    if (recentSec) recentSec.style.display = 'none';
    if (progSec) progSec.style.display = 'none';
    const title = searchSec.querySelector('.w-sec-title');
    if (title) title.innerHTML = `<span class="n"></span>${found.length} resultado${found.length === 1 ? '' : 's'}`;
    resultsGrid.innerHTML = found.length
      ? found.map(ep => podRowHTML(ep)).join('')
      : `<div class="pod-empty-box"><i class="ri-search-line"></i><span>Nenhum episódio encontrado. Tenta um termo diferente.</span></div>`;
    return;
  }
  if (searchSec) searchSec.style.display = 'none';
  if (recentSec) recentSec.style.display = '';
  if (progSec) progSec.style.display = '';

  // ── Recentes ────────────────────────────────────────────────────────────
  if (recentGrid) {
    const LIMIT = 6;
    if (all.length === 0) {
      recentGrid.innerHTML = `<div class="pod-empty-box"><i class="ri-headphones-line"></i><span>Ainda não foram adicionados podcasts. Fica atento às próximas emissões!</span></div>`;
    } else {
      recentGrid.innerHTML = (podRecentExpanded ? all : all.slice(0, LIMIT)).map((ep, i) => {
        const isNew = i === 0 ? '<span class="pod-row-new">Novo</span>' : '';
        return podRowHTML(ep).replace('<span class="pod-row-info">', `<span class="pod-row-info">${isNew}`);
      }).join('');
    }
    const moreBtn = document.getElementById('podRecentMoreBtn');
    if (moreBtn) {
      moreBtn.style.display = all.length > LIMIT ? '' : 'none';
      moreBtn.innerHTML = podRecentExpanded
        ? '<i class="ri-arrow-up-s-line"></i> Mostrar menos'
        : `<i class="ri-arrow-down-s-line"></i> Ver todos os ${all.length} episódios`;
    }
  }

  // ── Programas ───────────────────────────────────────────────────────────
  if (!progWrap) return;
  const groups = podGroups(all);

  if (!podOpenProgram && window.location.hash.startsWith('#programa-') && !window.__podHashHandled) {
    const k = decodeURIComponent(window.location.hash.replace('#programa-', ''));
    if (groups.some(g => g.key === k && g.episodes.length)) podOpenProgram = k;
  }
  window.__podHashHandled = true;
  const g = podOpenProgram ? groups.find(x => x.key === podOpenProgram) : null;
  const note = document.getElementById('podProgramsNote');

  // Vista geral: grelha de capas dos programas (o player volta ao topo)
  if (!g || g.episodes.length === 0) {
    podOpenProgram = null;
    podMovePlayer('podPlayerTop');
    if (note) note.textContent = 'Escolhe um programa para ouvir os episódios';
    progWrap.innerHTML = `<div class="pod-tiles">${groups.map(podTileHTML).join('')}</div>`;
    return;
  }

  // Vista do programa: player de um lado, episódios do outro
  podMovePlayer('podPlayerTop'); // protege o player antes de reescrever o contentor
  if (note) note.textContent = '';
  let eps = g.episodes;
  let subFilter = '';
  let playlistLink = '';
  if (g.key === 'sabias') {
    const pls = getSabesQuePlaylists();
    if (podSabiasDisc !== 'all' && !pls.some(p => p.name.toLowerCase() === podSabiasDisc.toLowerCase())) podSabiasDisc = 'all';
    subFilter = `<div class="pod-subfilter" role="group" aria-label="Disciplina">
      <button type="button" class="pod-chip${podSabiasDisc === 'all' ? ' active' : ''}" onclick="selectPodSabiasDisc('all')">Todas <b>${eps.length}</b></button>
      ${pls.map(pl => `<button type="button" class="pod-chip${pl.name.toLowerCase() === podSabiasDisc.toLowerCase() ? ' active' : ''}" onclick="selectPodSabiasDisc('${escapeJs(pl.name)}')">${escapeHtml(pl.name)} <b>${pl.episodes.length}</b></button>`).join('')}
    </div>`;
    if (podSabiasDisc !== 'all') {
      eps = eps.filter(e => String(e.discipline || 'Economia').trim().toLowerCase() === podSabiasDisc.toLowerCase());
      playlistLink = `<a class="pod-view-link" href="playlist.html?disciplina=${encodeURIComponent(podSabiasDisc)}"><i class="ri-external-link-line"></i> Página da playlist</a>`;
    }
  }
  const color = g.color || POD_PROGRAM_COLORS[g.key] || '#282425';

  progWrap.innerHTML = `
    <div class="pod-view" style="--tile: ${color};">
      <header class="pod-view-head">
        <button type="button" class="pod-back" onclick="closePodProgram()"><i class="ri-arrow-left-line"></i> Todos os programas</button>
        <div class="pod-view-title">
          <span class="pod-prog-icon"><i class="${escapeHtml(g.icon)}" aria-hidden="true"></i></span>
          <div><h3>${escapeHtml(g.title)}</h3>${g.desc ? `<p>${escapeHtml(g.desc)}</p>` : ''}</div>
        </div>
        ${g.link ? `<a class="pod-view-link" href="${g.link}"><i class="ri-external-link-line"></i> Página do programa</a>` : ''}
        ${playlistLink}
      </header>
      ${subFilter}
      <div class="pl-layout">
        <div class="pl-player-col" id="podProgPlayerSlot"></div>
        <aside class="pl-list-col" aria-label="Episódios de ${escapeHtml(g.title)}">
          <div class="pl-list-head"><h2>Episódios</h2><span class="pl-list-count">${eps.length} ${eps.length === 1 ? 'ep.' : 'eps.'}</span></div>
          <ol class="pl-episode-list">${eps.map((ep, i) => podEpisodeItemHTML(ep, eps.length - i)).join('')}</ol>
        </aside>
      </div>
    </div>`;
  podMovePlayer('podProgPlayerSlot');

  const current = eps.find(e => String(e.id) === String(podActiveEpId)) || eps[0];
  if (current && String(current.id) !== String(podActiveEpId)) {
    podActiveEpId = current.id;
    const url = current.audioUrl || current.spotifyUrl || current.originalUrl || '';
    window.loadAndPlayPodcast(url, current.title, current.date || '', current, { autoplay: false, scroll: false });
  }
  document.querySelectorAll('.pod-ep').forEach(li => li.classList.toggle('active', String(li.dataset.id) === String(podActiveEpId)));
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
    'Nerd Alert':        '#facc15',
    'Sabias que':        '#fbbf24',
    'Mito ou verdade':   '#34d399',
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
        <span class="sq-discipline-pill"><i class="ri-mic-line" aria-hidden="true"></i> Podcast Sabias que · ${escapeHtml(discipline)}</span>
        <span class="sq-badge">
          ${showLatestBadge ? '<i class="ri-sparkling-line" aria-hidden="true"></i> Mais recente' : `<i class="ri-calendar-line" aria-hidden="true"></i> ${escapeHtml(dateLabel)}`}
        </span>
      </div>
      ${hasImg ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" class="sq-cover-thumb" loading="lazy" onerror="this.style.display='none'">` : ''}
      <h3 class="sq-question">${escapeHtml(item.title || 'Curiosidade')}</h3>
      <p class="sq-body">${escapeHtml(item.content || '')}</p>
      <div class="sq-footer">
        <span><i class="ri-user-3-line" aria-hidden="true"></i> ${escapeHtml(item.author || 'Rádio Wave')}</span>
        <button type="button" class="sq-read-btn" onclick="openSabesQueModal('${safeId}')">
          Ver episódio <i class="ri-arrow-right-up-line" aria-hidden="true"></i>
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

/* ── "Sabias que..." = podcast organizado em playlists por disciplina ───── */
function getSabesQueEpisodes() {
  const pods = window.db && window.db.getPodcasts ? window.db.getPodcasts() : [];
  return pods.filter(p => String(p.category || '').trim().toLowerCase() === 'sabias que');
}

function getSabesQuePlaylists() {
  const map = new Map();
  getSabesQueEpisodes().forEach(ep => {
    const disc = String(ep.discipline || 'Economia').trim() || 'Economia';
    const key = disc.toLowerCase();
    if (!map.has(key)) map.set(key, { name: disc, episodes: [] });
    map.get(key).episodes.push(ep);
  });
  return Array.from(map.values()).sort((a, b) => {
    if (a.name.toLowerCase() === 'economia') return -1;
    if (b.name.toLowerCase() === 'economia') return 1;
    return a.name.localeCompare(b.name, 'pt');
  });
}

function buildSabesQuePlaylistCard(pl) {
  const latest = pl.episodes[0];
  const cover = (latest && (latest.thumbnail || latest.image)) || 'assets/logo-radio.jpg';
  const n = pl.episodes.length;
  const safe = escapeJs(pl.name);
  return `
    <article class="sq-pl-card" tabindex="0" role="button" onclick="openSabesQuePlaylist('${safe}')"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openSabesQuePlaylist('${safe}');}"
      aria-label="Abrir playlist ${escapeHtml(pl.name)}">
      <div class="sq-pl-cover">
        <img src="${escapeHtml(cover)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='assets/logo-radio.jpg';">
        <span class="sq-pl-count"><i class="ri-play-list-2-fill" aria-hidden="true"></i> ${n} ${n === 1 ? 'episódio' : 'episódios'}</span>
        <span class="sq-pl-play"><i class="ri-play-fill" aria-hidden="true"></i></span>
      </div>
      <div class="sq-pl-body">
        <span class="sq-pl-kicker">Playlist · Sabias que...</span>
        <h3 class="sq-pl-title">${escapeHtml(pl.name)}</h3>
        <p class="sq-pl-latest"><i class="ri-mic-line" aria-hidden="true"></i> Mais recente: ${escapeHtml(latest ? latest.title : '—')}</p>
        <span class="sq-pl-cta">Ver todos os episódios <i class="ri-arrow-right-line" aria-hidden="true"></i></span>
      </div>
    </article>`;
}

window.openSabesQuePlaylist = function (discipline) {
  window.location.href = `playlist.html?disciplina=${encodeURIComponent(discipline || 'Economia')}`;
};

function renderHomeSabesQue() {
  const container = document.getElementById('homeSabesQueContainer');
  if (!container) return;
  const playlists = getSabesQuePlaylists();

  if (playlists.length === 0) {
    container.innerHTML = `
      <div class="hv2-empty-state" style="grid-column: 1 / -1;">
        <div class="hv2-empty-icon"><i class="ri-lightbulb-flash-line"></i></div>
        <h3>Ainda não há episódios de "Sabias que..."</h3>
        <p>Em breve vais encontrar aqui as playlists do podcast, organizadas por disciplina.</p>
      </div>`;
    return;
  }
  container.innerHTML = playlists.map(buildSabesQuePlaylistCard).join('');
}

const ECONOMY_PODCAST_SHOWS = [
  {
    id: 'eco-show-mito-ou-verdade',
    title: 'Mito ou verdade',
    category: 'Mito ou verdade',
    icon: 'ri-scales-3-line',
    hosts: 'Economia em Frequência',
    duration: 'Série Oficial',
    description: 'Desmontamos mitos financeiros e verdades sobre dinheiro, consumo e mercados no dia a dia.',
    thumbnail: 'assets/logo-radio.jpg'
  },
  {
    id: 'eco-show-sabias-que',
    title: 'Sabias que...',
    category: 'Sabias que',
    icon: 'ri-lightbulb-flash-line',
    hosts: 'Economia em Frequência',
    duration: 'Série Oficial',
    description: 'Curiosidades rápidas e factos surpreendentes sobre economia, em formato de podcast.',
    thumbnail: 'assets/logo-radio.jpg'
  }
];

function initEconomiaFilters() {}

function getEpisodesForEconomyShow(econPods, showCategory) {
  const catNorm = String(showCategory || '').trim().toLowerCase();
  const episodes = (econPods || []).filter(p =>
    String(p.category || '').trim().toLowerCase() === catNorm ||
    String(p.title || '').toLowerCase().includes(catNorm)
  );

  return episodes;
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
        <div class="econ-pod-empty-icon"><i class="${escapeHtml(show.icon || 'ri-mic-line')}"></i></div>
        <span class="econ-pod-soon">Em breve</span>
        <p class="econ-pod-ep-desc">${escapeHtml(show.description)}</p>
        <p class="econ-pod-empty-note">O primeiro episódio ainda está a ser preparado pela equipa.</p>
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

  const playlists = getSabesQuePlaylists();
  if (pillsWrap) {
    const isAll = activeSabesQueDiscipline === 'all';
    pillsWrap.innerHTML = [
      `<button type="button" class="pod-filter-btn ${isAll ? 'active' : ''}" data-discipline="all" onclick="filterSabesQueByDiscipline('all')">Todas</button>`,
      ...playlists.map(pl => {
        const active = pl.name.toLowerCase() === String(activeSabesQueDiscipline || '').toLowerCase();
        return `<button type="button" class="pod-filter-btn ${active ? 'active' : ''}" data-discipline="${escapeHtml(pl.name)}" onclick="filterSabesQueByDiscipline('${escapeJs(pl.name)}')">${escapeHtml(pl.name)} (${pl.episodes.length})</button>`;
      })
    ].join('');
  }

  let list = getSabesQueEpisodes().map(ep => ({ ...ep, _disc: String(ep.discipline || 'Economia').trim() || 'Economia' }));
  if (activeSabesQueDiscipline !== 'all') {
    list = list.filter(ep => ep._disc.toLowerCase() === String(activeSabesQueDiscipline).toLowerCase());
  }
  if (activeSabesQueQuery) {
    list = list.filter(ep => `${ep.title} ${ep.description || ''} ${ep._disc} ${ep.hosts || ''}`.toLowerCase().includes(activeSabesQueQuery));
  }

  if (list.length === 0) {
    grid.innerHTML = `
      <div class="hv2-empty-state" style="grid-column: 1 / -1;">
        <div class="hv2-empty-icon"><i class="ri-lightbulb-flash-line"></i></div>
        <h3>Nenhum episódio encontrado</h3>
        <p>${activeSabesQueDiscipline === 'all' ? 'Ainda não foram publicados episódios de "Sabias que...".' : `Ainda não existem episódios na playlist ${escapeHtml(activeSabesQueDiscipline)}.`}</p>
      </div>`;
    return;
  }

  grid.innerHTML = list.map(ep => {
    const playUrl = ep.audioUrl || ep.spotifyUrl || ep.originalUrl || '';
    const card = buildPodcastCardHTML({ ...ep, category: `Sabias que · ${ep._disc}` }, playUrl, 'Ouvir episódio', 'ri-play-fill');
    return `<div class="card-box podcast-card-pro">${card}</div>`;
  }).join('');
}
