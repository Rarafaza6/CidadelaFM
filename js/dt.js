/* ==========================================================================
   RÁDIO WAVE — MÓDULO DIRETORES DE TURMA (DT.html — Passo a Passo)
   Sugestão semanal de até 10 músicas por turma com fluxo guiado simples
   ========================================================================== */

const DT_AUTH_PASS = 'SurfEmTurma@';
const MAX_WEEKLY_CLASS_SONGS = 10;

let dtSelectedTrack = null;
let dtSongQueue = [];
let dtWeeklySubmitted = [];
let dtSearchTimer = null;
let dtPreviewAudio = new Audio();
let dtPlayingPreviewUrl = '';
let dtCurrentTeacher = '';
let dtCurrentClass = '';

document.addEventListener('DOMContentLoaded', async () => {
  initDtWeekLabels();
  initDtPasswordToggle();
  initDtStep1Form();
  initDtMusicSearch();
  initDtStep2Form();
  initDtNavigationButtons();

  await window.db.ready();
  restoreDtSavedFields();
});

/* ---------- Navegação entre Passos (1 -> 2 -> 3) ---------- */
function goToDtStep(stepNumber) {
  clearDtAlert();
  const panes = [
    document.getElementById('dtStep1Form'),
    document.getElementById('dtSuggestionForm'),
    document.getElementById('dtStep3Pane')
  ];
  const pills = [
    document.getElementById('dtStepIndicator1'),
    document.getElementById('dtStepIndicator2'),
    document.getElementById('dtStepIndicator3')
  ];

  panes.forEach((pane, idx) => {
    if (!pane) return;
    pane.classList.toggle('is-active', idx + 1 === stepNumber);
  });

  pills.forEach((pill, idx) => {
    if (!pill) return;
    const stepIdx = idx + 1;
    pill.classList.toggle('is-active', stepIdx === stepNumber);
    pill.classList.toggle('is-done', stepIdx < stepNumber);
  });

  if (stepNumber === 2) {
    setTimeout(() => {
      document.getElementById('dtMusicSearchInput')?.focus();
    }, 80);
  }
}

/* ---------- Cálculo da Semana ISO (Seg–Dom) ---------- */
function getCurrentWeekKey(dateObj = new Date()) {
  const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getWeekRangeLabel(dateObj = new Date()) {
  const now = new Date(dateObj);
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short' });
  return `${fmt.format(monday)} – ${fmt.format(sunday)}`;
}

function normalizeClassKey(rawClass) {
  return String(rawClass || '')
    .trim()
    .toUpperCase()
    .replace(/[ºª°]/g, '')
    .replace(/\s+/g, '');
}

function getLocalClassStorageKey(rawClass, weekKey) {
  return `radio_dt_${weekKey}_${normalizeClassKey(rawClass)}`;
}

function getLocalWeeklySongs(rawClass, weekKey) {
  try {
    const raw = localStorage.getItem(getLocalClassStorageKey(rawClass, weekKey));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalWeeklySongs(rawClass, weekKey, list) {
  try {
    localStorage.setItem(getLocalClassStorageKey(rawClass, weekKey), JSON.stringify(list));
  } catch (e) {}
}

function initDtWeekLabels() {
  const weekLabelEl = document.getElementById('dtWeekRangeLabel');
  if (weekLabelEl) {
    weekLabelEl.textContent = `Semana: ${getWeekRangeLabel()}`;
  }
}

/* ---------- Mostrar / Ocultar Senha ---------- */
function initDtPasswordToggle() {
  const btn = document.getElementById('dtTogglePassBtn');
  const input = document.getElementById('dtPassword');
  const icon = document.getElementById('dtTogglePassIcon');
  if (!btn || !input) return;

  btn.addEventListener('click', () => {
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    if (icon) icon.className = isPass ? 'ri-eye-off-line' : 'ri-eye-line';
  });
}

/* ---------- Passo 1: Identificação e Entrada ---------- */
function restoreDtSavedFields() {
  try {
    const saved = sessionStorage.getItem('radio_dt_session');
    if (!saved) return;
    const { teacherName, className } = JSON.parse(saved);
    const teacherInput = document.getElementById('dtTeacherName');
    const classInput = document.getElementById('dtClassName');
    if (teacherInput && teacherName) teacherInput.value = teacherName;
    if (classInput && className) classInput.value = className;
  } catch (e) {}
}

function initDtStep1Form() {
  const step1Form = document.getElementById('dtStep1Form');
  if (!step1Form) return;

  step1Form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const teacherName = (document.getElementById('dtTeacherName')?.value || '').trim();
    const className = (document.getElementById('dtClassName')?.value || '').trim();
    const password = (document.getElementById('dtPassword')?.value || '').trim();
    const nextBtn = document.getElementById('dtNextStepBtn');

    if (!teacherName) {
      showDtAlert('warning', 'Por favor, escreve o teu nome.');
      document.getElementById('dtTeacherName')?.focus();
      return;
    }
    if (!className) {
      showDtAlert('warning', 'Por favor, indica qual é a turma (ex.: 10.º A).');
      document.getElementById('dtClassName')?.focus();
      return;
    }
    if (password !== DT_AUTH_PASS) {
      showDtAlert('error', 'A senha não está correta.');
      document.getElementById('dtPassword')?.focus();
      return;
    }

    dtCurrentTeacher = teacherName;
    dtCurrentClass = className.toUpperCase();

    try {
      sessionStorage.setItem('radio_dt_session', JSON.stringify({
        teacherName: dtCurrentTeacher,
        className: dtCurrentClass
      }));
    } catch (_) {}

    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.innerHTML = '<i class="ri-loader-4-line ri-spin" aria-hidden="true"></i> A abrir lista da turma...';
    }

    try {
      await refreshClassWeeklyQuota(dtCurrentClass);
      const summaryEl = document.getElementById('dtSessionSummary');
      if (summaryEl) {
        summaryEl.textContent = `Turma ${dtCurrentClass} · Prof. ${dtCurrentTeacher}`;
      }
      goToDtStep(2);
    } finally {
      if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.innerHTML = 'Continuar para escolher músicas <i class="ri-arrow-right-line" aria-hidden="true"></i>';
      }
    }
  });
}

function initDtNavigationButtons() {
  const changeClassBtn = document.getElementById('dtChangeClassBtn');
  const addMoreBtn = document.getElementById('dtAddMoreBtn');
  const switchClassDoneBtn = document.getElementById('dtSwitchClassDoneBtn');

  if (changeClassBtn) {
    changeClassBtn.addEventListener('click', () => {
      dtSongQueue = [];
      renderDtQueue();
      goToDtStep(1);
    });
  }

  if (addMoreBtn) {
    addMoreBtn.addEventListener('click', () => {
      goToDtStep(2);
    });
  }

  if (switchClassDoneBtn) {
    switchClassDoneBtn.addEventListener('click', () => {
      const classInput = document.getElementById('dtClassName');
      if (classInput) classInput.value = '';
      dtSongQueue = [];
      renderDtQueue();
      goToDtStep(1);
      setTimeout(() => classInput?.focus(), 60);
    });
  }
}

async function refreshClassWeeklyQuota(className) {
  const norm = normalizeClassKey(className);
  const weekKey = getCurrentWeekKey();
  if (!norm) {
    dtWeeklySubmitted = [];
    updateQuotaUI('');
    return;
  }

  const remoteList = window.db && typeof window.db.getClassWeeklySuggestions === 'function'
    ? await window.db.getClassWeeklySuggestions(norm, weekKey)
    : [];
  const localList = getLocalWeeklySongs(norm, weekKey);

  const mergedMap = new Map();
  [...remoteList, ...localList].forEach(item => {
    const key = item.id || `${(item.songTitle || '').toLowerCase()}__${(item.artist || '').toLowerCase()}`;
    if (!mergedMap.has(key)) mergedMap.set(key, item);
  });

  dtWeeklySubmitted = Array.from(mergedMap.values()).slice(0, MAX_WEEKLY_CLASS_SONGS);
  saveLocalWeeklySongs(norm, weekKey, dtWeeklySubmitted);

  const remaining = Math.max(0, MAX_WEEKLY_CLASS_SONGS - dtWeeklySubmitted.length);
  if (dtSongQueue.length > remaining) {
    dtSongQueue = dtSongQueue.slice(0, remaining);
  }
  renderDtQueue();
  updateQuotaUI(className);
}

function updateQuotaUI(className) {
  const submittedCount = dtWeeklySubmitted.length;
  const queuedCount = dtSongQueue.length;
  const totalUsedOrQueued = Math.min(MAX_WEEKLY_CLASS_SONGS, submittedCount + queuedCount);
  const remaining = Math.max(0, MAX_WEEKLY_CLASS_SONGS - submittedCount);

  const titleEl = document.getElementById('dtQuotaClassTitle');
  const countEl = document.getElementById('dtQuotaCountBadge');
  const sidebarCountEl = document.getElementById('dtSidebarCountEl');
  const fillEl = document.getElementById('dtQuotaFill');
  const remainingEl = document.getElementById('dtQuotaRemainingText');
  const submittedContainer = document.getElementById('dtSubmittedListContainer');
  const searchFieldBox = document.getElementById('dtSearchFieldBox');
  const submitBtn = document.getElementById('dtSubmitBtn');

  if (titleEl) titleEl.textContent = className ? `Turma ${className.toUpperCase()}` : 'Vagas desta semana';
  if (countEl) countEl.textContent = `${submittedCount} / ${MAX_WEEKLY_CLASS_SONGS} enviadas`;
  if (sidebarCountEl) sidebarCountEl.textContent = `${submittedCount}/${MAX_WEEKLY_CLASS_SONGS}`;
  if (fillEl) fillEl.style.width = `${(totalUsedOrQueued / MAX_WEEKLY_CLASS_SONGS) * 100}%`;

  if (remainingEl) {
    if (remaining === 0) {
      remainingEl.textContent = 'Esta turma já completou as 10 músicas desta semana.';
    } else {
      const leftAfterQueue = Math.max(0, remaining - queuedCount);
      remainingEl.textContent = queuedCount > 0
        ? `Tens ${queuedCount} na lista abaixo · Ainda podes juntar mais ${leftAfterQueue}.`
        : `Podes escolher mais ${remaining} música${remaining === 1 ? '' : 's'} esta semana.`;
    }
  }

  if (searchFieldBox) {
    searchFieldBox.style.display = remaining === 0 ? 'none' : 'block';
  }
  if (submitBtn) {
    submitBtn.style.display = remaining === 0 ? 'none' : 'inline-flex';
    submitBtn.innerHTML = queuedCount > 0
      ? `<i class="ri-send-plane-fill" aria-hidden="true"></i> Enviar ${queuedCount} música${queuedCount === 1 ? '' : 's'} da turma`
      : `<i class="ri-send-plane-fill" aria-hidden="true"></i> Enviar músicas da turma`;
  }

  if (submittedContainer) {
    if (dtWeeklySubmitted.length === 0) {
      submittedContainer.innerHTML = `<div class="dt-submitted-empty">Ainda sem músicas enviadas por esta turma nesta semana.</div>`;
    } else {
      submittedContainer.innerHTML = `
        <div class="dt-submitted-list">
          ${dtWeeklySubmitted.map((song, idx) => `
            <div class="dt-submitted-item">
              <img src="${escapeHtml(song.artwork || 'assets/logo-radio.jpg')}" alt="" onerror="this.src='assets/logo-radio.jpg'">
              <div>
                <strong>${idx + 1}. ${escapeHtml(song.songTitle)}</strong>
                <span>${escapeHtml(song.artist || '')}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }
}

/* ---------- Passo 2: Pesquisa Musical e Lista ---------- */
function initDtMusicSearch() {
  const searchInput = document.getElementById('dtMusicSearchInput');
  const dropdown = document.getElementById('dtSearchResultsDropdown');
  const addManualBtn = document.getElementById('dtAddSongBtn');

  if (!searchInput || !dropdown) return;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(dtSearchTimer);

    if (query.length < 2) {
      dropdown.classList.remove('active');
      dropdown.innerHTML = '';
      return;
    }

    dtSearchTimer = setTimeout(() => fetchDtMusicCatalog(query, dropdown), 300);
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });

  if (addManualBtn) {
    addManualBtn.addEventListener('click', () => {
      addCurrentInputOrTrackToQueue();
    });
  }
}

function searchDtDeezerJSONP(query, limit = 8) {
  return new Promise((resolve) => {
    const callbackName = 'dt_deezer_cb_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
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
      if (!data || !Array.isArray(data.data)) return resolve([]);
      const tracks = data.data.map(track => {
        const cover = (track.album && (track.album.cover_big || track.album.cover_medium || track.album.cover)) || 'assets/brand/favicon-negativa.png';
        const artistName = track.artist ? track.artist.name : '';
        const isExplicit = Boolean(track.explicit_lyrics) ||
          (typeof window.isExplicitSong === 'function' ? window.isExplicitSong(track.title, artistName) : false);
        return {
          trackName: track.title,
          artistName: artistName,
          artwork: cover,
          previewUrl: track.preview || '',
          releaseYear: '',
          explicit: isExplicit
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

async function fetchDtMusicCatalog(query, dropdown) {
  dropdown.innerHTML = `
    <div class="search-dropdown-status">
      <i class="ri-loader-4-line ri-spin"></i> A procurar "${escapeHtml(query)}"...
    </div>
  `;
  dropdown.classList.add('active');

  let normalizedTracks = [];

  // 1. Tentar Apple Music / iTunes
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=8`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.results) && data.results.length > 0) {
        normalizedTracks = data.results.map(track => {
          const rawArtwork = track.artworkUrl100 || track.artworkUrl60 || 'assets/logo-radio.jpg';
          const artwork = rawArtwork.replace('100x100bb', '300x300bb').replace('100x100', '300x300');
          const releaseYear = track.releaseDate ? new Date(track.releaseDate).getFullYear() : '';
          const isExplicit = (track.trackExplicitness === 'explicit') ||
            (window.RadioDatabase && window.RadioDatabase.isExplicitSong(track.trackName, track.artistName)) ||
            (typeof window.isExplicitSong === 'function' && window.isExplicitSong(track.trackName, track.artistName));
          return {
            trackName: track.trackName,
            artistName: track.artistName,
            artwork: artwork,
            previewUrl: track.previewUrl || '',
            releaseYear: releaseYear,
            explicit: Boolean(isExplicit)
          };
        });
      }
    }
  } catch (err) {
    console.warn('iTunes API indisponível em DT, a usar Deezer:', err.message);
  }

  // 2. Fallback ao Deezer
  if (normalizedTracks.length === 0) {
    try {
      const fallbackTracks = await searchDtDeezerJSONP(query, 8);
      if (fallbackTracks && fallbackTracks.length > 0) {
        normalizedTracks = fallbackTracks;
      }
    } catch (_) {}
  }

  const addManualDtTrack = () => {
    const parts = query.split(/\s*[-–—]\s*|\s+by\s+|\s+de\s+/i);
    const parsedTitle = parts[0] ? parts[0].trim() : query.trim();
    const parsedArtist = parts[1] ? parts.slice(1).join(' - ').trim() : 'Artista a confirmar';
    dtSelectedTrack = {
      songTitle: parsedTitle,
      artist: parsedArtist,
      artwork: 'assets/brand/favicon-negativa.png',
      previewUrl: '',
      explicit: Boolean(typeof window.isExplicitSong === 'function' && window.isExplicitSong(parsedTitle, parsedArtist))
    };
    dropdown.classList.remove('active');
    addCurrentInputOrTrackToQueue();
  };

  if (normalizedTracks.length === 0) {
    dropdown.innerHTML = `
      <div class="search-dropdown-status" style="padding: 1.2rem;">
        <i class="ri-music-2-line" style="font-size: 1.5rem; display: block; margin-bottom: 0.35rem; color: #e4232a;"></i>
        Não encontramos correspondência exata no catálogo automático.
        <div style="margin-top: 0.75rem;">
          <button type="button" class="w-btn w-btn-red" id="btnDtManualTrack" style="width: 100%; font-size: 0.95rem; padding: 0.5rem 0.8rem;">
            <i class="ri-add-line"></i> Adicionar "${escapeHtml(query)}"
          </button>
        </div>
      </div>
    `;
    const btn = dropdown.querySelector('#btnDtManualTrack');
    if (btn) btn.addEventListener('click', addManualDtTrack);
    return;
  }

  dropdown.innerHTML = '';
  normalizedTracks.forEach(track => {
    const item = document.createElement('div');
    item.className = 'search-result-item search-row';
    item.innerHTML = `
      <div class="search-result-thumb">
        <img src="${track.artwork}" alt="${escapeHtml(track.trackName)}" loading="lazy">
      </div>
      <div class="search-result-details">
        <h4 class="item-title">${escapeHtml(track.trackName)}</h4>
        <p class="item-artist">
          <span>${escapeHtml(track.artistName)}</span>
          ${track.releaseYear ? `<span class="search-result-sep">•</span><span>${track.releaseYear}</span>` : ''}
        </p>
      </div>
      <div class="search-result-action">
        <span class="select-badge"><i class="ri-add-line"></i> Juntar</span>
      </div>
    `;

    item.addEventListener('click', () => {
      dtSelectedTrack = {
        songTitle: track.trackName,
        artist: track.artistName,
        artwork: track.artwork,
        previewUrl: track.previewUrl || '',
        explicit: Boolean(track.explicit)
      };
      dropdown.classList.remove('active');
      addCurrentInputOrTrackToQueue();
    });

    dropdown.appendChild(item);
  });

  const manualRow = document.createElement('div');
  manualRow.className = 'search-result-item search-row manual-option';
  manualRow.style.cssText = 'border-top: 1px dashed var(--edge, #e9e2e2); background: rgba(228, 35, 42, 0.04);';
  manualRow.innerHTML = `
    <div class="search-result-thumb" style="display:flex;align-items:center;justify-content:center;background:#e9e2e2;border-radius:4px;">
      <i class="ri-edit-line" style="font-size:1.1rem;color:#e4232a;"></i>
    </div>
    <div class="search-result-details">
      <h4 class="item-title" style="font-size: 0.95rem;">Adicionar "${escapeHtml(query)}" manualmente</h4>
      <p class="item-artist"><span>Adiciona a música diretamente à lista da tua turma</span></p>
    </div>
    <div class="search-result-action">
      <span class="select-badge" style="background:#282425;color:#fff;"><i class="ri-check-line"></i> Usar esta</span>
    </div>
  `;
  manualRow.addEventListener('click', addManualDtTrack);
  dropdown.appendChild(manualRow);
}

function addCurrentInputOrTrackToQueue() {
  const searchInput = document.getElementById('dtMusicSearchInput');
  const dropdown = document.getElementById('dtSearchResultsDropdown');
  const rawText = (searchInput?.value || '').trim();
  const remaining = Math.max(0, MAX_WEEKLY_CLASS_SONGS - dtWeeklySubmitted.length);

  if (remaining === 0) {
    showDtAlert('error', 'Esta turma já atingiu o limite de 10 músicas nesta semana.');
    return false;
  }

  if (dtSongQueue.length >= remaining) {
    showDtAlert('warning', `Já escolheste o máximo de ${remaining} música(s) disponível para esta semana. Clica em "Enviar" abaixo!`);
    return false;
  }

  if (!dtSelectedTrack || !dtSelectedTrack.songTitle) {
    showDtAlert('warning', 'Escolhe uma música da lista de sugestões do Apple Music! Escreve na caixa de pesquisa e clica numa das opções.');
    if (searchInput) {
      searchInput.focus();
      if (rawText.length >= 2 && dropdown) fetchDtMusicCatalog(rawText, dropdown);
    }
    return false;
  }

  const songToAdd = { ...dtSelectedTrack };

  const isDuplicate = dtSongQueue.some(
    s => s.songTitle.toLowerCase() === songToAdd.songTitle.toLowerCase() &&
         s.artist.toLowerCase() === songToAdd.artist.toLowerCase()
  ) || dtWeeklySubmitted.some(
    s => (s.songTitle || '').toLowerCase() === songToAdd.songTitle.toLowerCase() &&
         (s.artist || '').toLowerCase() === songToAdd.artist.toLowerCase()
  );

  if (isDuplicate) {
    showDtAlert('warning', 'Essa música já está na lista desta turma.');
    return false;
  }

  if (window.db && typeof window.db.checkSongRequestCooldown === 'function') {
    const cooldown = window.db.checkSongRequestCooldown(songToAdd.songTitle, songToAdd.artist);
    if (cooldown && cooldown.isBlocked) {
      const availDate = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' }).format(cooldown.cooldownDate);
      showDtAlert('warning', `A música "${escapeHtml(songToAdd.songTitle)}" já foi pedida há menos de 4 meses (bloqueio ativo até ${availDate}). Escolhe outro tema para a turma!`);
      return false;
    }
  }

  dtSongQueue.push(songToAdd);
  dtSelectedTrack = null;
  if (searchInput) searchInput.value = '';
  clearDtAlert();
  renderDtQueue();
  updateQuotaUI(dtCurrentClass);
  return true;
}

function renderDtQueue() {
  const wrap = document.getElementById('dtQueueWrap');
  const emptyEl = document.getElementById('dtQueueEmpty');
  const listEl = document.getElementById('dtQueueList');
  const countLabel = document.getElementById('dtQueueCountLabel');
  if (!wrap || !listEl) return;

  const remaining = Math.max(0, MAX_WEEKLY_CLASS_SONGS - dtWeeklySubmitted.length);

  if (dtSongQueue.length === 0) {
    wrap.style.display = 'none';
    if (emptyEl) emptyEl.style.display = remaining > 0 ? 'block' : 'none';
    listEl.innerHTML = '';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  wrap.style.display = 'block';
  if (countLabel) {
    countLabel.textContent = `${dtSongQueue.length} música${dtSongQueue.length === 1 ? '' : 's'} pronta${dtSongQueue.length === 1 ? '' : 's'} a enviar`;
  }

  listEl.innerHTML = dtSongQueue.map((song, idx) => `
    <div class="dt-queue-item">
      <span class="dt-queue-num">${idx + 1}</span>
      <img src="${escapeHtml(song.artwork || 'assets/logo-radio.jpg')}" alt="${escapeHtml(song.songTitle)}" onerror="this.src='assets/logo-radio.jpg'">
      <div class="dt-queue-info">
        <strong>${escapeHtml(song.songTitle)}</strong>
        <span>${escapeHtml(song.artist)}</span>
      </div>
      <div class="dt-queue-actions">
        ${song.previewUrl ? `
          <button type="button" class="dt-icon-btn" onclick="toggleDtTrackPreview('${escapeJs(song.previewUrl)}', this)" title="Ouvir um excerto">
            <i class="ri-play-fill"></i>
          </button>
        ` : ''}
        <button type="button" class="dt-icon-btn" onclick="removeDtQueueSong(${idx})" title="Retirar da lista">
          <i class="ri-close-line"></i>
        </button>
      </div>
    </div>
  `).join('');
}

window.removeDtQueueSong = function (index) {
  dtSongQueue.splice(index, 1);
  renderDtQueue();
  updateQuotaUI(dtCurrentClass);
};

window.toggleDtTrackPreview = function (url, btnEl) {
  if (!url) return;
  const icon = btnEl?.querySelector('i');
  if (dtPlayingPreviewUrl === url && !dtPreviewAudio.paused) {
    dtPreviewAudio.pause();
    dtPlayingPreviewUrl = '';
    if (icon) icon.className = 'ri-play-fill';
    return;
  }

  dtPreviewAudio.pause();
  dtPreviewAudio.src = url;
  dtPlayingPreviewUrl = url;
  document.querySelectorAll('.dt-queue-actions .dt-icon-btn i.ri-pause-fill').forEach(i => {
    i.className = 'ri-play-fill';
  });
  if (icon) icon.className = 'ri-pause-fill';
  dtPreviewAudio.play().catch(() => {});
  dtPreviewAudio.onended = () => {
    dtPlayingPreviewUrl = '';
    if (icon) icon.className = 'ri-play-fill';
  };
};

/* ---------- Submissão Final (Passo 2 -> Passo 3) ---------- */
function initDtStep2Form() {
  const form = document.getElementById('dtSuggestionForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const searchVal = (document.getElementById('dtMusicSearchInput')?.value || '').trim();
    if (dtSongQueue.length === 0 && (dtSelectedTrack || searchVal)) {
      const added = addCurrentInputOrTrackToQueue();
      if (!added) return;
    }

    if (dtSongQueue.length === 0) {
      showDtAlert('warning', 'Pesquisa e clica em pelo menos 1 música antes de enviar.');
      document.getElementById('dtMusicSearchInput')?.focus();
      return;
    }

    const submitBtn = document.getElementById('dtSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="ri-loader-4-line ri-spin" aria-hidden="true"></i> A enviar músicas...';
    }

    try {
      await refreshClassWeeklyQuota(dtCurrentClass);
      const remaining = Math.max(0, MAX_WEEKLY_CLASS_SONGS - dtWeeklySubmitted.length);

      if (remaining === 0) {
        showDtAlert('error', `A turma ${dtCurrentClass} já atingiu as 10 músicas desta semana.`);
        return;
      }

      const songsToSubmit = dtSongQueue.slice(0, remaining);
      const weekKey = getCurrentWeekKey();

      const createdEntries = songsToSubmit.map(song => {
        const isExp = Boolean(song.explicit || (typeof window.isExplicitSong === 'function' && window.isExplicitSong(song.songTitle, song.artist)));
        return window.db.addSuggestion({
          title: song.songTitle,
          songTitle: song.songTitle,
          artist: song.artist,
          cover: song.artwork || 'assets/logo-radio.jpg',
          artwork: song.artwork || 'assets/logo-radio.jpg',
          previewUrl: song.previewUrl || '',
          source: 'dt',
          teacherName: dtCurrentTeacher.slice(0, 80),
          studentClass: dtCurrentClass.slice(0, 30),
          weekKey: weekKey,
          explicit: isExp
        });
      });

      dtWeeklySubmitted = [...dtWeeklySubmitted, ...createdEntries].slice(0, MAX_WEEKLY_CLASS_SONGS);
      saveLocalWeeklySongs(dtCurrentClass, weekKey, dtWeeklySubmitted);

      dtSongQueue = [];
      dtSelectedTrack = null;
      if (!dtPreviewAudio.paused) dtPreviewAudio.pause();
      renderDtQueue();
      updateQuotaUI(dtCurrentClass);

      const newRemaining = Math.max(0, MAX_WEEKLY_CLASS_SONGS - dtWeeklySubmitted.length);
      const doneMsgEl = document.getElementById('dtDoneMessage');
      const addMoreBtn = document.getElementById('dtAddMoreBtn');

      if (doneMsgEl) {
        doneMsgEl.textContent = newRemaining > 0
          ? `Enviaste ${songsToSubmit.length} música${songsToSubmit.length === 1 ? '' : 's'} da turma ${dtCurrentClass}. Ainda podes sugerir mais ${newRemaining} música${newRemaining === 1 ? '' : 's'} esta semana.`
          : `Enviaste ${songsToSubmit.length} música${songsToSubmit.length === 1 ? '' : 's'}! A turma ${dtCurrentClass} completou as 10 músicas desta semana.`;
      }
      if (addMoreBtn) {
        addMoreBtn.style.display = newRemaining > 0 ? 'inline-flex' : 'none';
      }

      goToDtStep(3);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
      }
    }
  });
}

function showDtAlert(type, message) {
  const container = document.getElementById('dtAlertContainer');
  if (!container) return;
  const icon = type === 'success'
    ? 'ri-checkbox-circle-fill'
    : type === 'warning'
      ? 'ri-alert-line'
      : 'ri-error-warning-line';
  container.innerHTML = `
    <div class="form-feedback ${type}">
      <i class="${icon}"></i>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function clearDtAlert() {
  const container = document.getElementById('dtAlertContainer');
  if (container) container.innerHTML = '';
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeJs(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;');
}
