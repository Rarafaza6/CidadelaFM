/* ==========================================================================
   WAVE PLAYER — Leitor de pré-escuta (30s) ao estilo Apple Music
   - Barra flutuante global (funciona no Editorial e no Ao Vivo)
   - Fila automática: ao acabar, passa à música seguinte da lista visível
   - Anterior / Seguinte, scrubber, volume, atalhos de teclado
   - Botão "+ Guião" direto no player
   ========================================================================== */
(function () {
  'use strict';

  const audio = new Audio();
  audio.preload = 'auto';

  const queues = { songs: [], aovivo: [] };
  let ctx = 'songs';
  let current = null; // { key, url, title, artist, artwork, explicit }
  let scrubbing = false;
  let root = null;
  const els = {};

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const fmt = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  function build() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'wavePlayer';
    root.className = 'wp';
    root.hidden = true;
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Leitor de pré-escuta');
    root.innerHTML = `
      <div class="wp-track">
        <div class="wp-art"><img alt="" src="assets/logo-radio.jpg"></div>
        <div class="wp-meta">
          <div class="wp-title"><span class="wp-e" hidden title="Conteúdo explícito [E]">E</span><span class="wp-title-text">—</span></div>
          <div class="wp-artist">—</div>
        </div>
      </div>

      <div class="wp-center">
        <div class="wp-controls">
          <button type="button" class="wp-btn" data-act="prev" title="Anterior (Ctrl+←)"><i class="ri-skip-back-fill"></i></button>
          <button type="button" class="wp-btn wp-btn-main" data-act="toggle" title="Reproduzir / Pausar (Espaço)"><i class="ri-play-fill"></i></button>
          <button type="button" class="wp-btn" data-act="next" title="Seguinte (Ctrl+→)"><i class="ri-skip-forward-fill"></i></button>
        </div>
        <div class="wp-scrub">
          <span class="wp-time wp-cur">0:00</span>
          <input type="range" class="wp-range wp-seek" min="0" max="1000" value="0" step="1" aria-label="Posição">
          <span class="wp-time wp-dur">0:30</span>
        </div>
      </div>

      <div class="wp-right">
        <button type="button" class="wp-pill" data-act="add" title="Adicionar ao Alinhamento do dia"><i class="ri-play-list-add-line"></i><span>Guião</span></button>
        <div class="wp-vol">
          <button type="button" class="wp-btn wp-btn-sm" data-act="mute" title="Silenciar"><i class="ri-volume-up-fill"></i></button>
          <input type="range" class="wp-range wp-volume" min="0" max="100" value="80" aria-label="Volume">
        </div>
        <button type="button" class="wp-btn wp-btn-sm" data-act="close" title="Fechar"><i class="ri-close-line"></i></button>
      </div>
    `;
    document.body.appendChild(root);

    els.img = root.querySelector('.wp-art img');
    els.title = root.querySelector('.wp-title-text');
    els.e = root.querySelector('.wp-e');
    els.artist = root.querySelector('.wp-artist');
    els.toggle = root.querySelector('[data-act="toggle"] i');
    els.seek = root.querySelector('.wp-seek');
    els.cur = root.querySelector('.wp-cur');
    els.dur = root.querySelector('.wp-dur');
    els.vol = root.querySelector('.wp-volume');
    els.muteIcon = root.querySelector('[data-act="mute"] i');
    els.prev = root.querySelector('[data-act="prev"]');
    els.next = root.querySelector('[data-act="next"]');

    root.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'toggle') api.toggle();
      else if (act === 'prev') api.prev();
      else if (act === 'next') api.next();
      else if (act === 'close') api.stop();
      else if (act === 'mute') { audio.muted = !audio.muted; paintVolume(); }
      else if (act === 'add') addToRundown();
    });

    els.seek.addEventListener('input', () => {
      scrubbing = true;
      const dur = audio.duration || 30;
      const t = (els.seek.value / 1000) * dur;
      els.cur.textContent = fmt(t);
      paintRange(els.seek);
    });
    els.seek.addEventListener('change', () => {
      const dur = audio.duration || 30;
      audio.currentTime = (els.seek.value / 1000) * dur;
      scrubbing = false;
    });

    const savedVol = parseFloat(localStorage.getItem('wave_player_volume'));
    audio.volume = isNaN(savedVol) ? 0.8 : Math.min(1, Math.max(0, savedVol));
    els.vol.value = Math.round(audio.volume * 100);
    els.vol.addEventListener('input', () => {
      audio.volume = els.vol.value / 100;
      audio.muted = false;
      try { localStorage.setItem('wave_player_volume', String(audio.volume)); } catch (_) {}
      paintVolume();
    });
    paintVolume();
  }

  function paintRange(input) {
    const pct = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty('--wp-pct', `${pct}%`);
  }

  function paintVolume() {
    if (!els.vol) return;
    paintRange(els.vol);
    const v = audio.muted ? 0 : audio.volume;
    els.muteIcon.className = v === 0 ? 'ri-volume-mute-fill' : (v < 0.5 ? 'ri-volume-down-fill' : 'ri-volume-up-fill');
  }

  function paintPlayState() {
    if (!els.toggle) return;
    els.toggle.className = audio.paused ? 'ri-play-fill' : 'ri-pause-fill';
    root.classList.toggle('is-playing', !audio.paused);
  }

  function paintTrack() {
    if (!current) return;
    els.img.src = current.artwork || 'assets/logo-radio.jpg';
    els.img.onerror = () => { els.img.onerror = null; els.img.src = 'assets/logo-radio.jpg'; };
    els.title.textContent = current.title || 'Música';
    els.artist.textContent = current.artist || '';
    els.e.hidden = !current.explicit;
    const q = queues[ctx] || [];
    const idx = q.findIndex(s => s.key === current.key);
    els.prev.disabled = idx <= 0;
    els.next.disabled = idx === -1 || idx >= q.length - 1;
  }

  function syncUI() {
    const playing = current && !audio.paused;
    document.querySelectorAll('[data-wp-key]').forEach(el => {
      const isCur = !!current && el.dataset.wpKey === current.key;
      el.classList.toggle('is-wp-current', isCur);
      el.classList.toggle('is-wp-playing', isCur && playing);
      const icon = el.querySelector('i');
      if (icon && el.classList.contains('wp-thumb-btn')) {
        icon.className = isCur && playing ? 'ri-pause-fill' : 'ri-play-fill';
      }
    });
    document.querySelectorAll('[data-wp-row]').forEach(el => {
      el.classList.toggle('is-wp-current-row', !!current && el.dataset.wpRow === current.key);
    });
  }

  function addToRundown() {
    if (!current) return;
    if (typeof window.addSongToAoVivoRundown === 'function') {
      window.addSongToAoVivoRundown(current.title, current.artist, !!current.explicit);
    }
  }

  function load(item) {
    current = item;
    build();
    root.hidden = false;
    document.body.classList.add('wp-open');
    audio.src = item.url;
    paintTrack();
    els.seek.value = 0;
    paintRange(els.seek);
    els.cur.textContent = '0:00';
    els.dur.textContent = '0:30';
    const p = audio.play();
    if (p && p.catch) {
      p.catch((err) => {
        if (err && err.name !== 'AbortError' && typeof window.showToast === 'function') {
          window.showToast('Não foi possível reproduzir esta prévia.', 'warning');
        }
      });
    }
    syncUI();
  }

  audio.addEventListener('play', () => { paintPlayState(); syncUI(); });
  audio.addEventListener('pause', () => { paintPlayState(); syncUI(); });
  audio.addEventListener('loadedmetadata', () => { if (els.dur) els.dur.textContent = fmt(audio.duration); });
  audio.addEventListener('timeupdate', () => {
    if (!els.seek || scrubbing) return;
    const dur = audio.duration || 30;
    const cur = audio.currentTime || 0;
    els.seek.value = Math.round((cur / dur) * 1000);
    paintRange(els.seek);
    els.cur.textContent = fmt(cur);
  });
  audio.addEventListener('ended', () => {
    // Autoplay: passa à seguinte da lista visível; se for a última, pára
    const q = queues[ctx] || [];
    const idx = current ? q.findIndex(s => s.key === current.key) : -1;
    if (idx !== -1 && idx < q.length - 1) api.next();
    else { paintPlayState(); syncUI(); }
  });
  audio.addEventListener('error', () => {
    if (!current) return;
    if (typeof window.showToast === 'function') window.showToast('Prévia indisponível. A saltar…', 'warning');
    const q = queues[ctx] || [];
    const idx = q.findIndex(s => s.key === current.key);
    if (idx !== -1 && idx < q.length - 1) api.next();
  });

  document.addEventListener('keydown', (e) => {
    if (!current || !root || root.hidden) return;
    const tag = (e.target && e.target.tagName) || '';
    const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable);
    if (e.code === 'Space' && !typing) { e.preventDefault(); api.toggle(); }
    else if (e.ctrlKey && e.key === 'ArrowRight') { e.preventDefault(); api.next(); }
    else if (e.ctrlKey && e.key === 'ArrowLeft') { e.preventDefault(); api.prev(); }
  });

  const api = {
    /** Regista a lista visível (apenas faixas com prévia) para um contexto. */
    setQueue(context, items) {
      queues[context] = (items || []).filter(s => s && s.url && s.key);
      if (current && context === ctx) paintTrack();
      syncUI();
    },
    /** Reproduz/pausa uma faixa da fila do contexto indicado. */
    playKey(key, context) {
      const c = context || ctx;
      const item = (queues[c] || []).find(s => s.key === key);
      if (!item) return;
      if (current && current.key === key && audio.src && ctx === c) { api.toggle(); return; }
      ctx = c;
      load(item);
    },
    toggle() {
      if (!current) return;
      if (audio.paused) audio.play().catch(() => {}); else audio.pause();
    },
    next() {
      const q = queues[ctx] || [];
      const idx = current ? q.findIndex(s => s.key === current.key) : -1;
      if (idx !== -1 && idx < q.length - 1) load(q[idx + 1]);
    },
    prev() {
      // Como no Apple Music: depois de 3s volta ao início da faixa
      if (audio.currentTime > 3) { audio.currentTime = 0; return; }
      const q = queues[ctx] || [];
      const idx = current ? q.findIndex(s => s.key === current.key) : -1;
      if (idx > 0) load(q[idx - 1]);
    },
    stop() {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      current = null;
      if (root) root.hidden = true;
      document.body.classList.remove('wp-open');
      syncUI();
    },
    syncUI,
    get current() { return current; }
  };

  window.WavePlayer = api;
})();
