/* ==========================================================================
   WAVE RUNDOWN STUDIO — Criador de Guiões + Músicas Escolhidas
   Unifica a secção "Guiões & Alinhamento" (sec-guioes) e o ecrã "Ao Vivo":
     - Folha Oficial editável diretamente na tabela (ordem, título, texto/guião, duração)
     - Drag & Drop + reordenação + numeração automática 1..N
     - 1 clique para marcar/desmarcar "(fazer live)" a amarelo
     - Preenchimento automático da duração real (m:ss) via Apple Music / iTunes
     - Banco lateral com 3 fontes:
         1. Pedidos dos Alunos & DT (com filtro Seguras, preview e estado "No guião")
         2. Pesquisa direta no catálogo Apple Music (qualquer música + duração automática)
         3. Agenda, Efemérides & Avisos do dia (1 clique para inserir como fala/rubrica)
   ========================================================================== */
(function () {
  'use strict';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const toast = (m, t) => { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); };
  const $ = (id) => document.getElementById(id);

  function localDateKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  function formatEmissionHeader(dateKey) {
    try {
      const [y, m, d] = dateKey.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return `DIA DA EMISSÃO: ${d} de ${MONTHS[dt.getMonth()]} ${y}`;
    } catch (_) {
      return `DIA DA EMISSÃO: ${dateKey}`;
    }
  }

  function formatDateShortPt(dateKey) {
    try {
      const [y, m, d] = dateKey.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return `${d} de ${MONTHS[dt.getMonth()]}`;
    } catch (_) {
      return dateKey;
    }
  }

  function parseSec(durStr) {
    if (!durStr) return 0;
    const p = String(durStr).trim().split(':').map(n => parseInt(n, 10));
    if (p.length === 2 && !isNaN(p[0]) && !isNaN(p[1])) return p[0] * 60 + p[1];
    if (p.length === 3 && !isNaN(p[0]) && !isNaN(p[1]) && !isNaN(p[2])) return p[0] * 3600 + p[1] * 60 + p[2];
    return 0;
  }

  function fmtSec(total) {
    total = Math.max(0, Math.round(total || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function msToMinSec(ms) {
    if (!ms || ms <= 0) return '';
    return fmtSec(Math.round(ms / 1000));
  }

  /* ---------- Estado do Estúdio ---------- */
  const state = {
    date: localDateKey(new Date()),
    pickerTab: 'requests', // 'requests' | 'catalog' | 'agenda'
    reqFilter: 'safe',     // 'safe' | 'all' | 'dt'
    reqSearch: '',
    catQuery: '',
    catResults: [],
    catLoading: false,
    dragIdx: -1
  };

  // Cache de durações e metadados do iTunes por chave de música
  const durationCache = new Map();

  function getItems(dateKey = state.date) {
    if (!window.db || typeof window.db.getDailyRundown !== 'function') return [];
    const r = window.db.getDailyRundown(dateKey);
    return Array.isArray(r && r.items) ? r.items.map(it => Object.assign({}, it)) : [];
  }

  function saveItems(items, dateKey = state.date) {
    if (!window.db || typeof window.db.saveDailyRundown !== 'function') return;
    window.db.saveDailyRundown(dateKey, items);
    showSavedIndicator();
  }

  function showSavedIndicator() {
    const el = $('rsSaveBadge');
    if (!el) return;
    el.classList.add('is-flash');
    el.innerHTML = '<i class="ri-check-double-line"></i> Guardado';
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('is-flash'), 1200);
  }

  function syncDateEverywhere(dateKey) {
    state.date = dateKey;
    try { window.aoVivoSelectedDate = dateKey; } catch (_) {}
    try { window.editorialSelectedDate = dateKey; } catch (_) {}
    const p1 = $('rsDatePicker');
    if (p1 && p1.value !== dateKey) p1.value = dateKey;
    const p2 = $('aoVivoDatePicker');
    if (p2 && p2.value !== dateKey) p2.value = dateKey;
  }

  function nextOrderNumber(items) {
    let max = 0;
    (items || []).forEach(it => {
      if (it.type === 'interval') return;
      const n = parseInt(it.order, 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return max + 1;
  }

  /* ---------- Lookup automático de duração + preview no Apple Music ---------- */
  async function enrichSongMetadata(itemId, title, artist, dateKey) {
    const cleanQ = `${title || ''} ${artist && !/especificado/i.test(artist) ? artist : ''}`.trim();
    if (!cleanQ) return;
    const cacheKey = cleanQ.toLowerCase();

    let meta = durationCache.get(cacheKey);
    if (!meta) {
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanQ)}&entity=song&limit=4`);
        if (!res.ok) return;
        const data = await res.json();
        const track = (data && data.results && data.results[0]) || null;
        if (!track) return;
        meta = {
          duration: msToMinSec(track.trackTimeMillis),
          previewUrl: track.previewUrl || '',
          artwork: (track.artworkUrl100 || '').replace('100x100bb', '300x300bb') || '',
          artist: track.artistName || artist || ''
        };
        durationCache.set(cacheKey, meta);
      } catch (_) {
        return;
      }
    }

    const items = getItems(dateKey);
    const idx = items.findIndex(x => x.id === itemId);
    if (idx === -1) return;
    let changed = false;
    if (!items[idx].duration && meta.duration) { items[idx].duration = meta.duration; changed = true; }
    if (!items[idx].previewUrl && meta.previewUrl) { items[idx].previewUrl = meta.previewUrl; changed = true; }
    if (!items[idx].artwork && meta.artwork) { items[idx].artwork = meta.artwork; changed = true; }
    if ((!items[idx].artist || /especificado/i.test(items[idx].artist)) && meta.artist) {
      items[idx].artist = meta.artist;
      changed = true;
    }
    if (changed) {
      saveItems(items, dateKey);
      renderAll();
    }
  }

  /* ---------- Operações no Guião ---------- */
  function autoNumberInPlace(items) {
    let n = 1;
    (items || []).forEach(it => {
      if (it.type === 'interval') it.order = '';
      else it.order = n++;
    });
  }

  function addItem(partial, opts = {}) {
    const dateKey = opts.dateKey || state.date;
    const items = getItems(dateKey);
    const type = partial.type || 'music';
    const isInterval = type === 'interval';
    const id = partial.id || `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const rawTitle = String(partial.title || '').trim();
    const hasLiveInTitle = /\(fazer live\)/i.test(rawTitle);
    const cleanedTitle = rawTitle.replace(/\s*\(fazer live\)\s*/gi, ' ').trim();

    const entry = {
      id,
      order: isInterval ? '' : (partial.order !== undefined && partial.order !== '' ? partial.order : nextOrderNumber(items)),
      type,
      title: cleanedTitle || (isInterval ? '2º Intervalo' : 'Novo Item'),
      artist: isInterval ? '' : String(partial.artist || partial.description || '').trim(),
      description: String(partial.description || '').trim(),
      duration: isInterval ? '' : String(partial.duration || '').trim(),
      highlightLive: Boolean(partial.highlightLive || hasLiveInTitle),
      status: partial.status || 'pending',
      isExplicit: Boolean(partial.isExplicit || (window.isExplicitSong && window.isExplicitSong(cleanedTitle, partial.artist))),
      previewUrl: partial.previewUrl || '',
      artwork: partial.artwork || ''
    };

    if (typeof opts.insertAt === 'number' && opts.insertAt >= 0 && opts.insertAt <= items.length) {
      items.splice(opts.insertAt, 0, entry);
      autoNumberInPlace(items);
    } else {
      items.push(entry);
    }
    saveItems(items, dateKey);
    renderAll();

    if (type === 'music' && (!entry.duration || !entry.previewUrl)) {
      enrichSongMetadata(entry.id, entry.title, entry.artist, dateKey);
    }
    return entry;
  }

  function presetPayload(kind) {
    if (kind === 'jingle_open') return { type: 'jingle', title: 'Jingle Rádio Wave', duration: '1:43' };
    if (kind === 'talk_live') return { type: 'talk', title: 'Intervenção do Locutor', artist: 'Notas / texto para ler em direto...', duration: '1:00', highlightLive: true };
    if (kind === 'rubrica') {
      const d = parseInt(state.date.split('-')[2], 10) || '';
      return { type: 'rubrica', title: `Dica do dia / Dia ${d}`.trim(), artist: 'Curiosidade ou destaque escolar', duration: '0:25' };
    }
    if (kind === 'interval') return { type: 'interval', title: '2º Intervalo' };
    if (kind === 'jingle_end') return { type: 'jingle', title: 'Fim da Emissão - Jingle', duration: '0:30' };
    return { type: 'talk', title: 'Novo Bloco', duration: '1:00' };
  }

  function addPreset(kind, opts = {}) {
    const p = presetPayload(kind);
    addItem(p, opts);
    toast(`"${p.title}" adicionado ao guião.`, 'success');
  }

  function updateField(idx, field, value, dateKey = state.date) {
    const items = getItems(dateKey);
    if (!items[idx]) return;
    const cleanVal = String(value == null ? '' : value).replace(/\r?\n/g, ' ').trim();
    if (field === 'order') {
      items[idx].order = cleanVal;
    } else if (field === 'title') {
      if (!cleanVal) return;
      items[idx].title = cleanVal;
      if (items[idx].type === 'music') {
        items[idx].isExplicit = Boolean(window.isExplicitSong && window.isExplicitSong(items[idx].title, items[idx].artist));
      }
    } else if (field === 'artist') {
      items[idx].artist = cleanVal;
      if (items[idx].type === 'music') {
        items[idx].isExplicit = Boolean(window.isExplicitSong && window.isExplicitSong(items[idx].title, items[idx].artist));
      }
    } else if (field === 'duration') {
      items[idx].duration = cleanVal;
    }
    saveItems(items, dateKey);
    updateTotalsUI(items, dateKey);
    if (typeof window.renderAoVivoRundown === 'function') window.renderAoVivoRundown(dateKey);
  }

  function removeItem(idx, dateKey = state.date) {
    const items = getItems(dateKey);
    const i = Number(idx);
    if (isNaN(i) || i < 0 || i >= items.length) return false;
    const removed = items[i];
    items.splice(i, 1);
    autoNumberInPlace(items);
    if (items.length === 0) {
      try { localStorage.setItem(`wave_rundown_cleared_${dateKey}`, 'true'); } catch (_) {}
    }
    saveItems(items, dateKey);
    renderAll();
    try { if (typeof window.renderAoVivoRundown === 'function') window.renderAoVivoRundown(dateKey); } catch (_) {}
    toast(`"${(removed && removed.title) || 'Linha'}" removida do guião.`, 'info');
    return true;
  }

  function removeByTitle(title, dateKey = state.date) {
    const norm = String(title || '').toLowerCase().trim();
    if (!norm) return false;
    const items = getItems(dateKey);
    const idx = items.findIndex(it => it.type === 'music' && String(it.title || '').toLowerCase().trim() === norm);
    if (idx === -1) return false;
    return removeItem(idx, dateKey);
  }

  function toggleLiveTag(idx, dateKey = state.date) {
    const items = getItems(dateKey);
    if (!items[idx]) return;
    const cur = Boolean(items[idx].highlightLive) || /\(fazer live\)/i.test(items[idx].title);
    items[idx].title = String(items[idx].title || '').replace(/\s*\(fazer live\)\s*/gi, ' ').trim();
    items[idx].highlightLive = !cur;
    saveItems(items, dateKey);
    renderAll();
  }

  function cycleType(idx, dateKey = state.date) {
    const order = ['music', 'talk', 'jingle', 'rubrica'];
    const items = getItems(dateKey);
    if (!items[idx] || items[idx].type === 'interval') return;
    const next = order[(order.indexOf(items[idx].type) + 1) % order.length];
    items[idx].type = next;
    saveItems(items, dateKey);
    renderAll();
  }

  function renumberSequential(dateKey = state.date) {
    const items = getItems(dateKey);
    let n = 1;
    items.forEach(it => {
      if (it.type === 'interval') it.order = '';
      else it.order = n++;
    });
    saveItems(items, dateKey);
    renderAll();
    toast('Ordem renumerada de 1 a ' + (n - 1) + '.', 'success');
  }

  function reorderItems(fromIdx, toIdx, dateKey = state.date) {
    const items = getItems(dateKey);
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= items.length || toIdx > items.length || fromIdx === toIdx) return;
    const [moved] = items.splice(fromIdx, 1);
    const adj = fromIdx < toIdx ? toIdx - 1 : toIdx;
    items.splice(adj, 0, moved);
    autoNumberInPlace(items);
    saveItems(items, dateKey);
    renderAll();
  }

  function duplicateToDate(targetDate) {
    if (!targetDate) return;
    const srcItems = getItems(state.date).map((it, i) => Object.assign({}, it, {
      id: `item-${Date.now()}-${i}`,
      status: 'pending'
    }));
    saveItems(srcItems, targetDate);
    syncDateEverywhere(targetDate);
    renderAll();
    toast(`Guião copiado para ${formatDateShortPt(targetDate)}!`, 'success');
  }

  function autoFillTopSafeSongs(maxToAdd = 5) {
    const suggestions = (window.db && window.db.getSuggestions && window.db.getSuggestions()) || [];
    const grouped = typeof window.buildGroupedSongsList === 'function' ? window.buildGroupedSongsList(suggestions) : [];
    const current = getItems(state.date);
    const existingKeys = new Set(current.map(it => `${String(it.title || '').toLowerCase()}___${String(it.artist || '').toLowerCase()}`));

    const candidates = grouped
      .filter(g => g.status === 'pending' && !(window.isExplicitSong && window.isExplicitSong(g.songTitle, g.artist)))
      .filter(g => !existingKeys.has(g.key))
      .sort((a, b) => b.count - a.count)
      .slice(0, maxToAdd);

    if (!candidates.length) {
      toast('Não há mais músicas seguras novas para adicionar.', 'info');
      return;
    }

    candidates.forEach(g => {
      addItem({
        type: 'music',
        title: g.songTitle,
        artist: g.artist,
        isExplicit: false,
        previewUrl: g.previewUrl || '',
        artwork: g.artwork || ''
      });
    });
    toast(`${candidates.length} música(s) mais pedida(s) adicionada(s) ao guião!`, 'success');
  }

  /* ---------- Render da Barra de Dias da Semana ---------- */
  function renderWeekStrip() {
    const strip = $('rsWeekStrip');
    if (!strip) return;
    const [y, m, d] = state.date.split('-').map(Number);
    const base = new Date(y, m - 1, d);
    const pills = [];
    for (let offset = -2; offset <= 4; offset++) {
      const dt = new Date(base);
      dt.setDate(base.getDate() + offset);
      const key = localDateKey(dt);
      const isToday = key === localDateKey(new Date());
      const isActive = key === state.date;
      const hasCustom = Boolean(localStorage.getItem(`wave_rundown_${key}`));
      pills.push(`
        <button type="button" class="rs-day-pill ${isActive ? 'active' : ''} ${isToday ? 'is-today' : ''}" data-date="${key}" title="${formatEmissionHeader(key)}">
          <span class="rs-day-w">${isToday ? 'Hoje' : WEEKDAYS_SHORT[dt.getDay()]}</span>
          <strong class="rs-day-n">${dt.getDate()}</strong>
          ${hasCustom ? '<span class="rs-day-dot"></span>' : ''}
        </button>`);
    }
    strip.innerHTML = pills.join('');
  }

  function updateTotalsUI(items, dateKey = state.date) {
    let sec = 0;
    let musicCount = 0;
    let talkCount = 0;
    (items || []).forEach(it => {
      if (it.duration) sec += parseSec(it.duration);
      if (it.type === 'music') musicCount++;
      else if (it.type === 'talk' || it.type === 'rubrica') talkCount++;
    });
    const nonInt = (items || []).filter(it => it.type !== 'interval').length;

    const set = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };
    set('rsSheetTitle', esc(formatEmissionHeader(dateKey)));
    set('rsTotalDuration', `<i class="ri-timer-line"></i> ${fmtSec(sec)}`);
    set('rsTotalItems', `<i class="ri-list-check-2"></i> ${nonInt} ${nonInt === 1 ? 'item' : 'itens'} (${musicCount} músicas · ${talkCount} falas)`);
  }

  /* ---------- Render da Tabela Principal do Estúdio ---------- */
  function renderStudioTable() {
    const tbody = $('rsTbody');
    if (!tbody) return;
    const items = getItems(state.date);
    updateTotalsUI(items, state.date);
    renderWeekStrip();

    if (!items.length) {
      tbody.innerHTML = `
        <tr class="rs-empty-drop-row">
          <td colspan="4" class="rs-empty-cell" id="rsEmptyDropzone">
            <div class="rs-dropzone-box">
              <i class="ri-drag-drop-line"></i>
              <strong>Arrasta músicas ou blocos para aqui para montar o Guião de ${esc(formatDateShortPt(state.date))}</strong>
              <span>Podes arrastar músicas dos Pedidos / Catálogo à direita, ou arrastar blocos (Jingle, Fala, Intervalo) da barra acima.</span>
              <div class="rs-empty-actions">
                <button type="button" class="sh-btn is-primary" data-rs-act="preset" data-kind="jingle_open"><i class="ri-radio-line"></i> + Jingle Abertura</button>
                <button type="button" class="sh-btn is-ok" data-rs-act="autofill"><i class="ri-magic-line"></i> + Top 5 Seguras</button>
                <button type="button" class="sh-btn" onclick="loadDefaultTemplateRundown()"><i class="ri-file-list-3-line"></i> Estrutura Base</button>
              </div>
            </div>
          </td>
        </tr>`;
      return;
    }

    const playQueue = [];

    tbody.innerHTML = items.map((item, idx) => {
      if (item.type === 'interval') {
        return `
          <tr class="rundown-interval-row rs-row" draggable="true" data-idx="${idx}">
            <td colspan="4" class="rundown-interval-cell">
              <div class="rundown-interval-wrap">
                <span class="rs-drag-handle no-print" title="Arrastar para mover"><i class="ri-draggable"></i></span>
                <span class="rundown-interval-title rs-editable" contenteditable="true" spellcheck="false" data-field="title" data-idx="${idx}" title="Clica para editar o nome do intervalo">${esc(item.title || '2º Intervalo')}</span>
                <div class="rundown-interval-actions no-print">
                  <button type="button" class="rundown-icon-btn" onclick="moveRundownItem(${idx}, -1)" title="Subir" ${idx === 0 ? 'disabled' : ''}><i class="ri-arrow-up-s-line"></i></button>
                  <button type="button" class="rundown-icon-btn" onclick="moveRundownItem(${idx}, 1)" title="Descer" ${idx === items.length - 1 ? 'disabled' : ''}><i class="ri-arrow-down-s-line"></i></button>
                  <button type="button" class="rundown-icon-btn" style="color:#f87171;" onclick="deleteRundownItem(${idx})" title="Eliminar"><i class="ri-delete-bin-line"></i></button>
                </div>
              </div>
            </td>
          </tr>`;
      }

      const isOnAir = item.status === 'on_air';
      const isPlayed = item.status === 'played';
      const rowClass = isOnAir ? 'is-on-air-row' : (isPlayed ? 'is-played-row' : '');
      const displayOrder = (item.order !== undefined && item.order !== null && String(item.order).trim() !== '') ? item.order : (idx + 1);

      const rawTitle = String(item.title || '');
      const subtitle = String(item.artist || item.description || '');
      const hasLive = Boolean(item.highlightLive) || /\(fazer live\)/i.test(rawTitle) || /\(fazer live\)/i.test(subtitle);
      const cleanedTitle = rawTitle.replace(/\s*\(fazer live\)\s*/gi, ' ').trim();

      const kindMap = {
        music: ['is-music', 'ri-music-2-line', 'Música'],
        talk: ['is-talk', 'ri-mic-line', 'Fala'],
        jingle: ['is-jingle', 'ri-radio-line', 'Jingle'],
        rubrica: ['is-rubrica', 'ri-lightbulb-line', 'Rubrica']
      };
      const k = kindMap[item.type] || kindMap.music;

      const isExplicit = Boolean(item.isExplicit) || Boolean(item.type === 'music' && window.isExplicitSong && window.isExplicitSong(cleanedTitle, subtitle));
      const wpKey = `rundown_${item.id || idx}`;
      if (item.previewUrl) {
        playQueue.push({
          key: wpKey,
          url: item.previewUrl,
          title: cleanedTitle,
          artist: subtitle,
          artwork: item.artwork || 'assets/logo-radio.jpg',
          explicit: isExplicit
        });
      }

      let statusBtn = '';
      if (isOnAir) {
        statusBtn = `<button type="button" class="rundown-status-toggle-btn is-on-air" onclick="toggleRundownItemStatus(${idx})" title="NO AR — clica quando terminar"><span class="aovivo-live-pulse" style="width:7px;height:7px;"></span> NO AR</button>`;
      } else if (isPlayed) {
        statusBtn = `<button type="button" class="rundown-status-toggle-btn is-played" onclick="toggleRundownItemStatus(${idx})" title="Concluído — clica para reabrir"><i class="ri-check-line"></i> Feito</button>`;
      } else {
        statusBtn = `<button type="button" class="rundown-status-toggle-btn is-pending" onclick="toggleRundownItemStatus(${idx})" title="Colocar NO AR"><i class="ri-broadcast-line"></i> Emitir</button>`;
      }

      return `
        <tr class="rs-row ${rowClass}" draggable="true" data-idx="${idx}" data-wp-row="${esc(wpKey)}">
          <td class="rundown-order-cell">
            <div class="rs-order-wrap">
              <span class="rs-drag-handle no-print" title="Arrastar linha"><i class="ri-draggable"></i></span>
              <span class="rs-order-num rs-editable" contenteditable="true" spellcheck="false" data-field="order" data-idx="${idx}" title="Clica para editar nº de ordem">${esc(String(displayOrder))}</span>
            </div>
          </td>
          <td class="rundown-desc-cell">
            <div class="rundown-item-title-line">
              <button type="button" class="rundown-kind-pill ${k[0]} no-print" onclick="RundownStudio.cycleType(${idx})" title="Clica para alternar tipo (Música / Fala / Jingle / Rubrica)"><i class="${k[1]}"></i> ${k[2]}</button>
              ${item.previewUrl ? `<button type="button" class="rs-mini-play no-print" data-wp-key="${esc(wpKey)}" onclick="WavePlayer.playKey('${esc(wpKey)}', 'rundown')" title="Ouvir prévia (30s)"><i class="ri-play-fill"></i></button>` : ''}
              ${isExplicit ? '<span class="song-explicit-tag live-explicit-tag" title="Conteúdo impróprio para contexto escolar [E]">E</span>' : ''}
              <span class="rundown-item-name rs-editable" contenteditable="true" spellcheck="false" data-field="title" data-idx="${idx}" title="Clica para editar título">${esc(cleanedTitle || item.title)}</span>
              ${hasLive ? '<span class="rundown-live-tag">(fazer live)</span>' : ''}
              <button type="button" class="rs-live-toggle no-print ${hasLive ? 'active' : ''}" onclick="RundownStudio.toggleLive(${idx})" title="Ativar/desativar etiqueta amarela (fazer live)">live</button>
            </div>
            <div class="rundown-item-subtitle rs-editable ${subtitle ? '' : 'is-placeholder'}" contenteditable="true" spellcheck="false" data-field="artist" data-idx="${idx}" data-placeholder="${item.type === 'talk' || item.type === 'rubrica' ? 'Escreve aqui o texto/notas que o locutor vai dizer…' : 'Artista ou nota…'}">${esc(subtitle)}</div>
          </td>
          <td class="rundown-duration-cell">
            <span class="rs-dur-edit rs-editable ${item.duration ? '' : 'is-placeholder'}" contenteditable="true" spellcheck="false" data-field="duration" data-idx="${idx}" data-placeholder="0:00" title="Clica para editar duração (m:ss)">${esc(item.duration || '')}</span>
          </td>
          <td class="rundown-actions-cell no-print">
            <div class="rundown-row-btn-group">
              ${statusBtn}
              <button type="button" class="rundown-icon-btn" onclick="moveRundownItem(${idx}, -1)" title="Subir" ${idx === 0 ? 'disabled style="opacity:0.3;"' : ''}><i class="ri-arrow-up-s-line"></i></button>
              <button type="button" class="rundown-icon-btn" onclick="moveRundownItem(${idx}, 1)" title="Descer" ${idx === items.length - 1 ? 'disabled style="opacity:0.3;"' : ''}><i class="ri-arrow-down-s-line"></i></button>
              <button type="button" class="rundown-icon-btn" style="color:#f87171;" onclick="deleteRundownItem(${idx})" title="Eliminar"><i class="ri-delete-bin-line"></i></button>
            </div>
          </td>
        </tr>`;
    }).join('');

    if (window.WavePlayer) {
      window.WavePlayer.setQueue('rundown', playQueue);
    }
  }

  /* ---------- Render do Banco Lateral (Pedidos / Catálogo / Agenda) ---------- */
  function renderPicker() {
    const body = $('rsPickerBody');
    if (!body) return;

    document.querySelectorAll('.rs-ptab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.ptab === state.pickerTab);
    });

    const currentItems = getItems(state.date);
    const inRundownSet = new Set(
      currentItems
        .filter(it => it.type === 'music')
        .map(it => `${String(it.title || '').toLowerCase().trim()}___${String(it.artist || '').toLowerCase().trim()}`)
    );
    const inRundownTitles = new Set(
      currentItems.map(it => String(it.title || '').toLowerCase().trim())
    );

    // TAB 1: PEDIDOS DOS ALUNOS & DT
    if (state.pickerTab === 'requests') {
      const suggestions = (window.db && window.db.getSuggestions && window.db.getSuggestions()) || [];
      const allGrouped = typeof window.buildGroupedSongsList === 'function' ? window.buildGroupedSongsList(suggestions) : [];

      const safePendingCount = allGrouped.filter(s => s.status === 'pending' && !(window.isExplicitSong && window.isExplicitSong(s.songTitle, s.artist))).length;
      const badgeEl = $('rsPickerReqCount');
      if (badgeEl) badgeEl.textContent = safePendingCount;

      let list = allGrouped.filter(s => s.status === 'pending').map(s => {
        const ex = Boolean(window.isExplicitSong && window.isExplicitSong(s.songTitle, s.artist));
        return Object.assign({}, s, { ex });
      });

      if (state.reqFilter === 'safe') list = list.filter(s => !s.ex);
      else if (state.reqFilter === 'dt') list = list.filter(s => s.hasDT && !s.ex);

      if (state.reqSearch) {
        const q = state.reqSearch.toLowerCase();
        list = list.filter(s => `${s.songTitle} ${s.artist} ${(s.dtClasses || []).join(' ')}`.toLowerCase().includes(q));
      }
      list.sort((a, b) => b.count - a.count);

      const queueForPlayer = [];
      const cardsHtml = list.length ? list.map(s => {
        const already = inRundownSet.has(s.key) || inRundownTitles.has(s.songTitle.toLowerCase().trim());
        const wpKey = `req_${s.key}`;
        if (s.previewUrl) {
          queueForPlayer.push({ key: wpKey, url: s.previewUrl, title: s.songTitle, artist: s.artist, artwork: s.artwork, explicit: s.ex });
        }
        const dtChip = (s.dtClasses && s.dtClasses.length)
          ? `<span class="rs-mini-dt">DT ${esc(s.dtClasses[0])}</span>`
          : '';
        const dateInfo = typeof window.formatSongRequestDate === 'function'
          ? window.formatSongRequestDate(s.latestTimestamp, s.firstTimestamp, s.count)
          : null;
        const dateChip = dateInfo
          ? `<span class="rs-dur-pill" title="${esc(dateInfo.tooltip)}"><i class="ri-calendar-line"></i> ${esc(dateInfo.shortDate)}</span>`
          : '';
        return `
          <div class="rs-song-card ${already ? 'is-added' : ''} ${s.ex ? 'is-explicit' : ''}" draggable="true" data-drag-type="song" data-pick-song="${esc(s.songTitle)}" data-pick-artist="${esc(s.artist)}" data-pick-exp="${s.ex ? '1' : '0'}" data-pick-preview="${esc(s.previewUrl || '')}" data-pick-art="${esc(s.artwork || '')}" data-wp-row="${esc(wpKey)}" title="Arrasta para a posição desejada no guião ou clica em + Guião">
            <span class="rs-card-grip" aria-hidden="true"><i class="ri-draggable"></i></span>
            <div class="rs-song-cover">
              <button type="button" class="wp-thumb-btn ${s.previewUrl ? '' : 'is-nopreview'}" data-wp-key="${esc(wpKey)}" ${s.previewUrl ? `onclick="WavePlayer.playKey('${esc(wpKey)}', 'studio_req')"` : 'tabindex="-1"'} title="${s.previewUrl ? 'Ouvir prévia (30s)' : 'Sem prévia'}">
                <img src="${esc(s.artwork || 'assets/logo-radio.jpg')}" alt="" loading="lazy" onerror="this.onerror=null;this.src='assets/logo-radio.jpg';">
                <i class="ri-play-fill"></i>
              </button>
            </div>
            <div class="rs-song-info">
              <div class="rs-song-title">
                ${s.ex ? '<span class="song-explicit-tag mini">E</span>' : ''}
                <span>${esc(s.songTitle)}</span>
              </div>
              <div class="rs-song-sub">
                <span>${esc(s.artist)}</span>
                <span class="rs-votes-pill"><i class="ri-fire-fill"></i> ${s.count}</span>
                ${dtChip}
                ${dateChip}
              </div>
            </div>
            <button type="button" class="rs-add-btn ${already ? 'is-added' : ''}" data-pick-song="${esc(s.songTitle)}" data-pick-artist="${esc(s.artist)}" data-pick-exp="${s.ex ? '1' : '0'}" data-pick-preview="${esc(s.previewUrl || '')}" data-pick-art="${esc(s.artwork || '')}" title="${already ? 'Já está no guião (clica ou arrasta para adicionar outra vez)' : 'Clica ou arrasta para o guião'}">
              <i class="${already ? 'ri-check-line' : 'ri-add-line'}"></i> ${already ? 'No guião' : 'Guião'}
            </button>
          </div>`;
      }).join('') : `<div class="rs-picker-empty"><i class="ri-music-2-line"></i><span>Nenhuma música encontrada com este filtro.</span></div>`;

      body.innerHTML = `
        <div class="rs-picker-controls">
          <div class="rs-picker-search">
            <i class="ri-search-line"></i>
            <input type="search" id="rsReqSearchInput" placeholder="Filtrar músicas pedidas…" value="${esc(state.reqSearch)}" autocomplete="off">
          </div>
          <div class="rs-picker-chips">
            <button type="button" class="rs-fchip ${state.reqFilter === 'safe' ? 'active' : ''}" data-rf="safe"><i class="ri-shield-check-line"></i> Seguras</button>
            <button type="button" class="rs-fchip ${state.reqFilter === 'dt' ? 'active' : ''}" data-rf="dt"><i class="ri-graduation-cap-line"></i> Turmas (DT)</button>
            <button type="button" class="rs-fchip ${state.reqFilter === 'all' ? 'active' : ''}" data-rf="all">Todas</button>
            <button type="button" class="rs-fchip is-magic" data-rs-act="autofill" title="Preencher automaticamente com as 5 músicas seguras mais votadas"><i class="ri-sparkling-line"></i> + Top 5</button>
          </div>
        </div>
        <div class="rs-picker-list">${cardsHtml}</div>`;

      if (window.WavePlayer) window.WavePlayer.setQueue('studio_req', queueForPlayer);

      const inp = $('rsReqSearchInput');
      if (inp) {
        inp.addEventListener('input', (e) => {
          state.reqSearch = e.target.value;
          renderPicker();
          const ni = $('rsReqSearchInput');
          if (ni) { ni.focus(); ni.setSelectionRange(ni.value.length, ni.value.length); }
        });
      }
      return;
    }

    // TAB 2: PESQUISA DIRETA NO CATÁLOGO APPLE MUSIC (QUALQUER MÚSICA + DURAÇÃO REAL)
    if (state.pickerTab === 'catalog') {
      const queueForCatalog = [];
      const resultsHtml = state.catLoading
        ? `<div class="rs-picker-empty"><i class="ri-loader-4-line ri-spin"></i><span>A procurar no Apple Music…</span></div>`
        : (state.catResults.length ? state.catResults.map((t, i) => {
          const dur = msToMinSec(t.trackTimeMillis);
          const art = (t.artworkUrl100 || '').replace('100x100bb', '300x300bb') || 'assets/logo-radio.jpg';
          const ex = t.trackExplicitness === 'explicit' || t.trackExplicitness === 'cleaned' || Boolean(window.isExplicitSong && window.isExplicitSong(t.trackName, t.artistName));
          const already = inRundownTitles.has(String(t.trackName || '').toLowerCase().trim());
          const wpKey = `cat_${t.trackId || i}`;
          if (t.previewUrl) {
            queueForCatalog.push({ key: wpKey, url: t.previewUrl, title: t.trackName, artist: t.artistName, artwork: art, explicit: ex });
          }
          return `
            <div class="rs-song-card ${already ? 'is-added' : ''} ${ex ? 'is-explicit' : ''}" draggable="true" data-drag-type="song" data-pick-song="${esc(t.trackName)}" data-pick-artist="${esc(t.artistName)}" data-pick-dur="${esc(dur)}" data-pick-exp="${ex ? '1' : '0'}" data-pick-preview="${esc(t.previewUrl || '')}" data-pick-art="${esc(art)}" data-wp-row="${esc(wpKey)}" title="Arrasta para a posição desejada no guião ou clica em + Guião">
              <span class="rs-card-grip" aria-hidden="true"><i class="ri-draggable"></i></span>
              <div class="rs-song-cover">
                <button type="button" class="wp-thumb-btn ${t.previewUrl ? '' : 'is-nopreview'}" data-wp-key="${esc(wpKey)}" ${t.previewUrl ? `onclick="WavePlayer.playKey('${esc(wpKey)}', 'studio_cat')"` : 'tabindex="-1"'}>
                  <img src="${esc(art)}" alt="" loading="lazy">
                  <i class="ri-play-fill"></i>
                </button>
              </div>
              <div class="rs-song-info">
                <div class="rs-song-title">
                  ${ex ? '<span class="song-explicit-tag mini">E</span>' : ''}
                  <span>${esc(t.trackName)}</span>
                </div>
                <div class="rs-song-sub">
                  <span>${esc(t.artistName)}</span>
                  ${dur ? `<span class="rs-dur-pill"><i class="ri-time-line"></i> ${dur}</span>` : ''}
                </div>
              </div>
              <button type="button" class="rs-add-btn ${already ? 'is-added' : ''}" data-pick-song="${esc(t.trackName)}" data-pick-artist="${esc(t.artistName)}" data-pick-dur="${esc(dur)}" data-pick-exp="${ex ? '1' : '0'}" data-pick-preview="${esc(t.previewUrl || '')}" data-pick-art="${esc(art)}">
                <i class="${already ? 'ri-check-line' : 'ri-add-line'}"></i> ${already ? 'No guião' : 'Guião'}
              </button>
            </div>`;
        }).join('') : `<div class="rs-picker-empty"><i class="ri-disc-line"></i><span>Pesquisa qualquer música ou artista no catálogo mundial. A duração (m:ss) e a prévia entram automaticamente no guião.</span></div>`);

      body.innerHTML = `
        <div class="rs-picker-controls">
          <div class="rs-picker-search">
            <i class="ri-search-2-line"></i>
            <input type="search" id="rsCatalogInput" placeholder="Procurar no Apple Music (ex: Jungle Back on 74)…" value="${esc(state.catQuery)}" autocomplete="off">
          </div>
        </div>
        <div class="rs-picker-list">${resultsHtml}</div>`;

      if (window.WavePlayer) window.WavePlayer.setQueue('studio_cat', queueForCatalog);

      const catInp = $('rsCatalogInput');
      if (catInp) {
        catInp.addEventListener('input', (e) => {
          state.catQuery = e.target.value;
          clearTimeout(catInp._t);
          const q = state.catQuery.trim();
          if (q.length < 2) { state.catResults = []; renderPicker(); return; }
          catInp._t = setTimeout(() => searchCatalog(q), 280);
        });
      }
      return;
    }

    // TAB 3: AGENDA, EFEMÉRIDES & AVISOS DO DIA
    if (state.pickerTab === 'agenda') {
      const topics = typeof window.getCalendarTopicsForDate === 'function' ? window.getCalendarTopicsForDate(state.date) : [];
      const notices = (window.db && window.db.getAnnouncements ? window.db.getAnnouncements() : [])
        .filter(a => a && (a.onAir === true || a.visibility === 'internal' || a.broadcastDate === state.date));
      const facts = (window.db && window.db.getSabesQue ? window.db.getSabesQue() : []).slice(0, 5);

      const blocks = [];

      topics.forEach(t => {
        blocks.push(`
          <div class="rs-agenda-card" draggable="true" data-drag-type="agenda" data-pick-talk="${esc(t.title)}" data-pick-notes="${esc(t.notes || t.bulletText || '')}" data-pick-kind="rubrica" title="Arrasta para a tabela ou clica em Inserir">
            <div class="rs-agenda-meta"><span class="rs-agenda-badge is-cal"><i class="ri-draggable"></i> <i class="ri-calendar-event-line"></i> ${esc(t.category || 'Calendário')}</span><small>${esc(t.timingTag || 'Hoje')}</small></div>
            <strong>${esc(t.title)}</strong>
            ${t.notes ? `<p>${esc(t.notes)}</p>` : ''}
            <button type="button" class="rs-add-btn" data-pick-talk="${esc(t.title)}" data-pick-notes="${esc(t.notes || t.bulletText || '')}" data-pick-kind="rubrica"><i class="ri-add-line"></i> Inserir no Guião</button>
          </div>`);
      });

      notices.forEach(n => {
        const plain = String(n.content || n.excerpt || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        blocks.push(`
          <div class="rs-agenda-card" draggable="true" data-drag-type="agenda" data-pick-talk="${esc(n.title)}" data-pick-notes="${esc(plain)}" data-pick-kind="talk" title="Arrasta para a tabela ou clica em Inserir">
            <div class="rs-agenda-meta"><span class="rs-agenda-badge is-mic"><i class="ri-draggable"></i> <i class="ri-mic-2-line"></i> Aviso em Antena</span></div>
            <strong>${esc(n.title)}</strong>
            ${plain ? `<p>${esc(plain.slice(0, 140))}</p>` : ''}
            <button type="button" class="rs-add-btn" data-pick-talk="${esc(n.title)}" data-pick-notes="${esc(plain)}" data-pick-kind="talk"><i class="ri-add-line"></i> Inserir como Fala (live)</button>
          </div>`);
      });

      facts.forEach(f => {
        blocks.push(`
          <div class="rs-agenda-card" draggable="true" data-drag-type="agenda" data-pick-talk="Dica do dia: ${esc(f.title || 'Sabias que...')}" data-pick-notes="${esc(f.text || f.content || '')}" data-pick-kind="rubrica" title="Arrasta para a tabela ou clica em Inserir">
            <div class="rs-agenda-meta"><span class="rs-agenda-badge is-fact"><i class="ri-draggable"></i> <i class="ri-lightbulb-flash-line"></i> Sabias que...</span></div>
            <strong>${esc(f.title || 'Curiosidade')}</strong>
            <p>${esc(String(f.text || f.content || '').slice(0, 140))}</p>
            <button type="button" class="rs-add-btn" data-pick-talk="Dica do dia: ${esc(f.title || 'Sabias que...')}" data-pick-notes="${esc(f.text || f.content || '')}" data-pick-kind="rubrica"><i class="ri-add-line"></i> Inserir Rubrica</button>
          </div>`);
      });

      body.innerHTML = blocks.length
        ? `<div class="rs-picker-list">${blocks.join('')}</div>`
        : `<div class="rs-picker-empty"><i class="ri-calendar-check-line"></i><span>Sem avisos ou eventos específicos para esta data.</span></div>`;
    }
  }

  function searchRundownDeezerJSONP(q, limit = 12) {
    return new Promise((resolve) => {
      const cb = 'rs_dz_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
      const script = document.createElement('script');
      let done = false;
      const timer = setTimeout(() => { done = true; cleanup(); resolve([]); }, 4500);
      const cleanup = () => { clearTimeout(timer); try { delete window[cb]; } catch (_) {} if (script.parentNode) script.parentNode.removeChild(script); };
      window[cb] = (data) => {
        if (done) return;
        cleanup();
        if (!data || !Array.isArray(data.data)) return resolve([]);
        const mapped = data.data.map(item => ({
          trackId: item.id,
          trackName: item.title,
          artistName: item.artist ? item.artist.name : '',
          trackTimeMillis: (item.duration || 0) * 1000,
          artworkUrl100: (item.album && (item.album.cover_big || item.album.cover_medium || item.album.cover)) || 'assets/brand/favicon-negativa.png',
          previewUrl: item.preview || '',
          trackExplicitness: item.explicit_lyrics ? 'explicit' : 'notExplicit'
        }));
        resolve(mapped);
      };
      script.src = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=${limit}&output=jsonp&callback=${cb}`;
      script.onerror = () => { cleanup(); resolve([]); };
      document.head.appendChild(script);
    });
  }

  async function searchCatalog(q) {
    state.catLoading = true;
    renderPicker();
    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=12`);
      if (res.ok) {
        const data = await res.json();
        state.catResults = (data && data.results) || [];
      } else {
        throw new Error('iTunes status ' + res.status);
      }
    } catch (_) {
      try {
        state.catResults = await searchRundownDeezerJSONP(q, 12);
      } catch (e2) {
        state.catResults = [];
      }
    } finally {
      state.catLoading = false;
      renderPicker();
      const inp = $('rsCatalogInput');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }
  }

  /* ---------- Render Global (Estúdio + Ao Vivo) ---------- */
  function renderAll() {
    renderStudioTable();
    renderPicker();
    if (typeof window.renderAoVivoRundown === 'function') {
      window.renderAoVivoRundown(state.date);
    }
  }

  /* ---------- Eventos do Estúdio ---------- */
  function bindStudioEvents() {
    const root = $('sec-guioes');
    if (!root || root._rsBound) return;
    root._rsBound = true;

    // Cliques gerais no estúdio
    root.addEventListener('click', (e) => {
      const dayBtn = e.target.closest('.rs-day-pill');
      if (dayBtn && dayBtn.dataset.date) {
        syncDateEverywhere(dayBtn.dataset.date);
        renderAll();
        return;
      }

      const ptab = e.target.closest('.rs-ptab');
      if (ptab && ptab.dataset.ptab) {
        state.pickerTab = ptab.dataset.ptab;
        renderPicker();
        return;
      }

      const rf = e.target.closest('[data-rf]');
      if (rf) {
        state.reqFilter = rf.dataset.rf;
        renderPicker();
        return;
      }

      const actBtn = e.target.closest('[data-rs-act]');
      if (actBtn) {
        const act = actBtn.dataset.rsAct;
        if (act === 'preset') addPreset(actBtn.dataset.kind);
        else if (act === 'autofill') autoFillTopSafeSongs(5);
        else if (act === 'renumber') renumberSequential();
        else if (act === 'custom') {
          if (typeof window.openAddRundownItemModal === 'function') window.openAddRundownItemModal();
        } else if (act === 'duplicate') {
          const target = prompt('Copiar este guião para que data? (AAAA-MM-DD)', localDateKey(new Date(Date.now() + 86400000)));
          if (target && /^\d{4}-\d{2}-\d{2}$/.test(target.trim())) duplicateToDate(target.trim());
        }
        return;
      }

      const pickSong = e.target.closest('button[data-pick-song]');
      if (pickSong) {
        const title = pickSong.dataset.pickSong;
        if (pickSong.classList.contains('is-added')) {
          removeByTitle(title, state.date);
          return;
        }
        const artist = pickSong.dataset.pickArtist || '';
        const dur = pickSong.dataset.pickDur || '';
        const isExp = pickSong.dataset.pickExp === '1';
        const preview = pickSong.dataset.pickPreview || '';
        const art = pickSong.dataset.pickArt || '';
        if (isExp && !confirm(`⚠ "${title}" está sinalizada como imprópria para contexto escolar [E].\n\nQueres mesmo adicionar ao guião?`)) return;
        addItem({ type: 'music', title, artist, duration: dur, isExplicit: isExp, previewUrl: preview, artwork: art });
        toast(`"${title}" adicionada ao guião!`, 'success');
        return;
      }

      const pickTalk = e.target.closest('[data-pick-talk]');
      if (pickTalk) {
        const kind = pickTalk.dataset.pickKind || 'talk';
        addItem({
          type: kind,
          title: pickTalk.dataset.pickTalk,
          artist: pickTalk.dataset.pickNotes || '',
          duration: kind === 'rubrica' ? '0:25' : '1:00',
          highlightLive: kind === 'talk'
        });
        toast('Tópico inserido no guião!', 'success');
      }
    });

    // Edição inline nas células da tabela (blur ou Enter)
    const tbody = $('rsTbody');
    if (tbody) {
      tbody.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.classList.contains('rs-editable')) {
          e.preventDefault();
          e.target.blur();
        }
      });
      tbody.addEventListener('focusout', (e) => {
        const el = e.target;
        if (!el || !el.classList || !el.classList.contains('rs-editable')) return;
        const idx = parseInt(el.dataset.idx, 10);
        const field = el.dataset.field;
        if (!isNaN(idx) && field) {
          updateField(idx, field, el.textContent);
          el.classList.toggle('is-placeholder', !el.textContent.trim());
        }
      });
    }

    bindGlobalDragAndDrop();
  }

  /* ---------- Motor Global de Drag & Drop (Estúdio + Ao Vivo) ---------- */
  let activeDrag = null; // { kind: 'row'|'song'|'preset'|'agenda', fromIdx, item }

  function clearDropIndicators() {
    document.querySelectorAll('.is-drop-before, .is-drop-after, .is-drop-active, .is-dragging').forEach(el => {
      el.classList.remove('is-drop-before', 'is-drop-after', 'is-drop-active', 'is-dragging');
    });
    document.body.classList.remove('rs-dragging-row', 'rs-dragging-new');
  }

  function bindGlobalDragAndDrop() {
    if (document.body._rsDndBound) return;
    document.body._rsDndBound = true;

    // 1. Início do Drag (qualquer fonte: linha da tabela, música, bloco do topo ou cartão da agenda)
    document.addEventListener('dragstart', (e) => {
      // Se estiver a selecionar texto dentro de um campo editável focado, não arrasta a linha
      if (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('rs-editable')) {
        if (document.activeElement.contains(e.target)) {
          e.preventDefault();
          return;
        }
      }

      const songCard = e.target.closest('[data-drag-type="song"]');
      if (songCard) {
        activeDrag = {
          kind: 'song',
          item: {
            type: 'music',
            title: songCard.dataset.pickSong || '',
            artist: songCard.dataset.pickArtist || '',
            duration: songCard.dataset.pickDur || '',
            isExplicit: songCard.dataset.pickExp === '1',
            previewUrl: songCard.dataset.pickPreview || '',
            artwork: songCard.dataset.pickArt || ''
          }
        };
        songCard.classList.add('is-dragging');
        document.body.classList.add('rs-dragging-new');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'copyMove';
          try { e.dataTransfer.setData('text/plain', activeDrag.item.title); } catch (_) {}
        }
        return;
      }

      const agendaCard = e.target.closest('[data-drag-type="agenda"]');
      if (agendaCard) {
        const k = agendaCard.dataset.pickKind || 'talk';
        activeDrag = {
          kind: 'agenda',
          item: {
            type: k,
            title: agendaCard.dataset.pickTalk || 'Intervenção',
            artist: agendaCard.dataset.pickNotes || '',
            duration: k === 'rubrica' ? '0:25' : '1:00',
            highlightLive: k === 'talk'
          }
        };
        agendaCard.classList.add('is-dragging');
        document.body.classList.add('rs-dragging-new');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'copyMove';
          try { e.dataTransfer.setData('text/plain', activeDrag.item.title); } catch (_) {}
        }
        return;
      }

      const presetBtn = e.target.closest('.rs-qbtn[data-kind]');
      if (presetBtn) {
        activeDrag = {
          kind: 'preset',
          presetKind: presetBtn.dataset.kind,
          item: presetPayload(presetBtn.dataset.kind)
        };
        presetBtn.classList.add('is-dragging');
        document.body.classList.add('rs-dragging-new');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'copyMove';
          try { e.dataTransfer.setData('text/plain', activeDrag.item.title); } catch (_) {}
        }
        return;
      }

      const tr = e.target.closest('tr[data-idx]');
      if (tr && (tr.closest('#rsTbody') || tr.closest('#aoVivoRundownTbody'))) {
        activeDrag = {
          kind: 'row',
          fromIdx: parseInt(tr.dataset.idx, 10)
        };
        tr.classList.add('is-dragging');
        document.body.classList.add('rs-dragging-row');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', String(activeDrag.fromIdx)); } catch (_) {}
        }
      }
    });

    document.addEventListener('dragend', () => {
      activeDrag = null;
      clearDropIndicators();
    });

    // 2. DragOver (sobre linhas da tabela, sobre folha vazia ou sobre a zona de lixo)
    document.addEventListener('dragover', (e) => {
      if (!activeDrag) return;

      // Zona de remover linha
      const trash = e.target.closest('#rsTrashDropzone');
      if (trash && activeDrag.kind === 'row') {
        e.preventDefault();
        trash.classList.add('is-drop-active');
        return;
      } else {
        const tEl = $('rsTrashDropzone');
        if (tEl) tEl.classList.remove('is-drop-active');
      }

      // Linha específica da tabela (Estúdio ou Ao Vivo)
      const tr = e.target.closest('tr[data-idx]');
      if (tr && (tr.closest('#rsTbody') || tr.closest('#aoVivoRundownTbody'))) {
        e.preventDefault();
        const rect = tr.getBoundingClientRect();
        const isAfter = (e.clientY - rect.top) > (rect.height / 2);
        document.querySelectorAll('.is-drop-before, .is-drop-after').forEach(el => {
          if (el !== tr) el.classList.remove('is-drop-before', 'is-drop-after');
        });
        tr.classList.toggle('is-drop-before', !isAfter);
        tr.classList.toggle('is-drop-after', isAfter);
        return;
      }

      // Folha do Guião (quando vazia ou no fundo da tabela)
      const sheet = e.target.closest('#rsSheet, #aoVivoRundownSheet');
      if (sheet) {
        e.preventDefault();
        sheet.classList.add('is-drop-active');
      }
    });

    // 3. Drop (largar na posição exata)
    document.addEventListener('drop', (e) => {
      if (!activeDrag) return;
      const drag = activeDrag;

      // Largar no Lixo para eliminar linha
      const trash = e.target.closest('#rsTrashDropzone');
      if (trash && drag.kind === 'row' && !isNaN(drag.fromIdx)) {
        e.preventDefault();
        activeDrag = null;
        clearDropIndicators();
        const items = getItems(state.date);
        if (items[drag.fromIdx]) {
          const removedTitle = items[drag.fromIdx].title || 'Linha';
          items.splice(drag.fromIdx, 1);
          autoNumberInPlace(items);
          saveItems(items, state.date);
          renderAll();
          toast(`"${removedTitle}" removida do guião.`, 'info');
        }
        return;
      }

      const tr = e.target.closest('tr[data-idx]');
      const sheet = e.target.closest('#rsSheet, #aoVivoRundownSheet');
      if (!tr && !sheet) return;

      e.preventDefault();
      let insertAt = getItems(state.date).length;
      if (tr) {
        const targetIdx = parseInt(tr.dataset.idx, 10);
        const rect = tr.getBoundingClientRect();
        const isAfter = (e.clientY - rect.top) > (rect.height / 2);
        insertAt = isAfter ? targetIdx + 1 : targetIdx;
      }

      activeDrag = null;
      clearDropIndicators();

      if (drag.kind === 'row') {
        reorderItems(drag.fromIdx, insertAt, state.date);
        return;
      }

      if (drag.item) {
        if (drag.item.isExplicit && !confirm(`⚠ "${drag.item.title}" está sinalizada como imprópria para contexto escolar [E].\n\nQueres mesmo adicionar ao guião?`)) {
          return;
        }
        addItem(drag.item, { dateKey: state.date, insertAt });
        toast(`"${drag.item.title}" colocada na posição #${insertAt + 1} do guião!`, 'success');
      }
    });
  }

  /* ---------- Ligação com Funções Globais Existentes ---------- */
  window.RundownStudio = {
    getDate() { return state.date; },
    deleteItem(idx) { return removeItem(idx, state.date); },
    render() {
      bindStudioEvents();
      syncDateEverywhere(state.date);
      renderAll();
    },
    setDate(dateKey) {
      if (!dateKey) return;
      syncDateEverywhere(dateKey);
      renderAll();
    },
    shiftDate(deltaDays) {
      const [y, m, d] = state.date.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() + deltaDays);
      syncDateEverywhere(localDateKey(dt));
      renderAll();
    },
    today() {
      syncDateEverywhere(localDateKey(new Date()));
      renderAll();
    },
    toggleLive(idx) { toggleLiveTag(idx, state.date); },
    cycleType(idx) { cycleType(idx, state.date); },
    addItem,
    addPreset,
    autoFillTopSafeSongs,
    renumberSequential
  };

  // Substitui as funções globais para manter tudo sincronizado entre Editorial, Mural, Músicas e Ao Vivo
  window.renderEditorialDailyScript = function () {
    if (window.editorialSelectedDate && window.editorialSelectedDate !== state.date) {
      syncDateEverywhere(window.editorialSelectedDate);
    }
    window.RundownStudio.render();
  };

  window.changeEditorialDate = function (delta) { window.RundownStudio.shiftDate(delta); };
  window.setEditorialDateToday = function () { window.RundownStudio.today(); };
  window.onEditorialDatePickerChange = function (val) { window.RundownStudio.setDate(val); };

  // Botão "Novo guião de emissão" no Mural abre diretamente o Estúdio de Guiões
  window.openNewRundownModal = function () {
    if (typeof window.switchAdminSection === 'function') window.switchAdminSection('sec-guioes');
    window.RundownStudio.render();
  };

  // Quando adicionam música a partir de Músicas Pedidas ou do Ao Vivo, preenche duração automaticamente
  window.addSongToAoVivoRundown = function (songTitle, artist, isExplicit, extra = {}) {
    const dateKey = window.aoVivoSelectedDate || state.date;
    syncDateEverywhere(dateKey);
    addItem({
      type: 'music',
      title: songTitle,
      artist: artist,
      duration: extra.duration || '',
      isExplicit: Boolean(isExplicit),
      previewUrl: extra.previewUrl || '',
      artwork: extra.artwork || ''
    }, { dateKey });
    toast(`"${songTitle}" adicionada ao Guião de ${formatDateShortPt(dateKey)}!`, 'success');
  };

  // Sincroniza mudança de data feita no ecrã Ao Vivo com o Estúdio
  const origChangeAoVivo = window.changeAoVivoDate;
  window.changeAoVivoDate = function (delta) {
    if (typeof origChangeAoVivo === 'function') origChangeAoVivo(delta);
    if (window.aoVivoSelectedDate) {
      state.date = window.aoVivoSelectedDate;
      renderStudioTable();
      renderPicker();
    }
  };

  const origSetTodayAoVivo = window.setAoVivoDateToday;
  window.setAoVivoDateToday = function () {
    if (typeof origSetTodayAoVivo === 'function') origSetTodayAoVivo();
    if (window.aoVivoSelectedDate) {
      state.date = window.aoVivoSelectedDate;
      renderStudioTable();
      renderPicker();
    }
  };

  const origPickerAoVivo = window.onAoVivoDatePickerChange;
  window.onAoVivoDatePickerChange = function (val) {
    if (typeof origPickerAoVivo === 'function') origPickerAoVivo(val);
    if (val) {
      state.date = val;
      renderStudioTable();
      renderPicker();
    }
  };

  document.addEventListener('radio-db-updated', (e) => {
    const c = e && e.detail && e.detail.collection;
    if (!c || c === 'rundowns' || c === 'suggestions' || c === 'calendarEvents' || c === 'announcements') {
      renderStudioTable();
      renderPicker();
    }
  });

  document.addEventListener('wave-explicit-updated', () => {
    renderStudioTable();
    renderPicker();
  });

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => window.RundownStudio.render(), 300);
  });
})();
