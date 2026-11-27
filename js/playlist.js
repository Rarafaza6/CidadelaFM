/* ==========================================================================
   PLAYLIST "SABIAS QUE..." — player de um lado, lista de episódios do outro
   playlist.html?disciplina=Economia[&ep=<id>]
   ========================================================================== */
(function () {
  'use strict';
  let episodes = [];
  let activeId = null;
  let discipline = '';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function getEpisodes() {
    const pods = window.db && window.db.getPodcasts ? window.db.getPodcasts() : [];
    return pods.filter(p =>
      String(p.category || '').trim().toLowerCase() === 'sabias que' &&
      String(p.discipline || 'Economia').trim().toLowerCase() === discipline.toLowerCase()
    );
  }

  function playEpisode(id, opts) {
    const ep = episodes.find(e => String(e.id) === String(id));
    if (!ep) return;
    activeId = ep.id;
    const url = ep.audioUrl || ep.spotifyUrl || ep.originalUrl || '';
    window.loadAndPlayPodcast(url, ep.title, ep.date || '', ep, {
      autoplay: !(opts && opts.autoplay === false),
      scroll: false
    });
    markActive();
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('ep', ep.id);
      history.replaceState(null, '', u);
    } catch (_) {}
  }

  function markActive() {
    document.querySelectorAll('.pl-episode').forEach(li => {
      const on = String(li.dataset.id) === String(activeId);
      li.classList.toggle('active', on);
      li.setAttribute('aria-current', on ? 'true' : 'false');
    });
  }

  function renderList() {
    const list = document.getElementById('playlistEpisodeList');
    const count = document.getElementById('plCount');
    if (!list) return;
    if (count) count.textContent = `${episodes.length} ${episodes.length === 1 ? 'ep.' : 'eps.'}`;

    if (episodes.length === 0) {
      list.innerHTML = '<li class="pl-empty"><i class="ri-mic-off-line" aria-hidden="true"></i><span>Ainda não existem episódios nesta playlist.</span></li>';
      return;
    }
    list.innerHTML = episodes.map((ep, i) => `
      <li class="pl-episode" data-id="${esc(ep.id)}">
        <button type="button" class="pl-episode-btn" aria-label="Ouvir ${esc(ep.title)}">
          <span class="pl-episode-num">${episodes.length - i}</span>
          <img class="pl-episode-thumb" src="${esc(ep.thumbnail || 'assets/logo-radio.jpg')}" alt="" loading="lazy" onerror="this.onerror=null;this.src='assets/logo-radio.jpg';">
          <span class="pl-episode-info">
            <strong>${esc(ep.title)}</strong>
            <small>${esc(ep.date || 'Recente')} · ${esc(ep.duration || '—')}</small>
          </span>
          <span class="pl-episode-icon" aria-hidden="true"><i class="ri-play-fill"></i></span>
        </button>
      </li>`).join('');
    list.querySelectorAll('.pl-episode-btn').forEach(btn => {
      btn.addEventListener('click', () => playEpisode(btn.closest('.pl-episode').dataset.id));
    });
    markActive();
  }

  function renderHead() {
    const title = document.getElementById('plTitle');
    const crumb = document.getElementById('plCrumb');
    const sub = document.getElementById('plSub');
    if (title) title.innerHTML = `Sabias que<br><span class="out">${esc(discipline)}<span class="dot">.</span></span>`;
    if (crumb) crumb.textContent = discipline;
    if (sub) sub.textContent = `Playlist de ${discipline} do podcast Sabias que... — escolhe um episódio na lista e ouve aqui ao lado.`;
    document.title = `${discipline} · Playlist Sabias que... | Rádio Wave • EBS da Cidadela`;
  }

  function init() {
    const params = new URLSearchParams(window.location.search);
    discipline = (params.get('disciplina') || 'Economia').trim() || 'Economia';
    episodes = getEpisodes();
    renderHead();
    renderList();

    if (episodes.length && !activeId) {
      const wanted = params.get('ep') || params.get('play');
      const target = (wanted && episodes.find(e => String(e.id) === String(wanted))) || episodes[0];
      playEpisode(target.id, { autoplay: Boolean(wanted) });
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (window.db && typeof window.db.ready === 'function') await window.db.ready();
    // dá tempo ao app.js para ligar os controlos do player
    setTimeout(init, 0);
    document.addEventListener('radio-db-updated', (e) => {
      if (e.detail && e.detail.collection && e.detail.collection !== 'podcasts') return;
      episodes = getEpisodes();
      renderList();
      if (!activeId && episodes.length) playEpisode(episodes[0].id, { autoplay: false });
    });
  });
})();
