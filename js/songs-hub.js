/* ==========================================================================
   SONGS HUB — página "Músicas Pedidas" (redesenhada de raiz)
   Fluxo: Por decidir → Tocada / Arquivar. Explícitas ficam isoladas e bloqueadas.
   ========================================================================== */
(function () {
  'use strict';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const toast = (m, t) => { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); };
  const $ = (id) => document.getElementById(id);

  const state = { tab: 'todo', source: 'all', sort: 'votes', search: '', selected: new Set() };
  let groups = [];            // todas as músicas agrupadas (com veredicto)
  let visible = [];           // músicas da vista atual
  let lastHash = '';
  let raf = 0;

  /* ---------- Dados ---------- */
  function buildGroups() {
    const base = typeof window.buildGroupedSongsList === 'function'
      ? window.buildGroupedSongsList(window.db.getSuggestions())
      : [];
    return base.map(g => {
      const v = window.ExplicitEngine ? window.ExplicitEngine.verdict(g.songTitle, g.artist) : { state: 'unknown', src: '', words: [] };
      return Object.assign({}, g, {
        v,
        ex: v.state === 'explicit',
        storedExplicit: g.explicitOverrides ? g.explicitOverrides.includes(true) : false,
        title: g.songTitle
      });
    });
  }

  const inTab = {
    todo: g => g.status === 'pending' && !g.ex,
    explicit: g => g.status === 'pending' && g.ex,
    played: g => g.status === 'played',
    archived: g => g.status === 'archived',
    all: () => true
  };

  /* ---------- Render ---------- */
  /* ---------- Render ---------- */
  function getFirstRequester(g) {
    const reqs = (g.requests && g.requests.length) ? g.requests : [];
    if (reqs.length > 0 && reqs[0]) {
      return reqs[0];
    }
    const defaultName = (g.studentIdentities && g.studentIdentities[0]) || (g.hasDT ? (g.dtClasses[0] || 'Diretor de Turma') : 'Aluno da Escola');
    const defaultMeta = g.hasDT ? (g.dtClasses[0] || 'Docente') : 'Web';
    const defaultDate = typeof window.formatSongRequestDate === 'function'
      ? (window.formatSongRequestDate(g.latestTimestamp, g.firstTimestamp, g.count)?.label || 'Hoje')
      : 'Hoje';
    return {
      name: defaultName,
      meta: defaultMeta,
      dateFormatted: defaultDate,
      timeFormatted: '',
      isDt: !!g.hasDT,
      who: defaultName,
      when: defaultDate
    };
  }

  function rowHtml(g, idx) {
    const key = esc(g.key);
    const played = g.status === 'played';
    const archived = g.status === 'archived';
    const sel = state.selected.has(g.key);
    const thumb = `
      <button type="button" class="wp-thumb-btn ${g.previewUrl ? '' : 'is-nopreview'}" data-wp-key="${key}" ${g.previewUrl ? `data-act="play"` : 'tabindex="-1"'} title="${g.previewUrl ? 'Ouvir prévia (30s)' : 'Sem prévia disponível'}">
        <img src="${esc(g.artwork)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='assets/logo-radio.jpg';">
        <i class="ri-play-fill"></i>
      </button>`;

    const reqs = (g.requests && g.requests.length) ? g.requests : [];
    const firstReq = getFirstRequester(g);
    const moreCount = reqs.length > 1 ? reqs.length - 1 : (g.count > 1 ? g.count - 1 : 0);
    const fullHistoryTooltip = reqs.length > 0
      ? reqs.map((r, i) => `${i + 1}. ${r.name || r.who}${r.meta ? ` (${r.meta})` : ''} — ${r.when || r.dateFormatted}`).join('\n')
      : `${firstReq.name}${firstReq.meta ? ` (${firstReq.meta})` : ''} — ${firstReq.dateFormatted}`;

    const addBtn = g.ex
      ? `<button type="button" class="sh-btn is-danger-soft" data-act="add" title="Música explícita — só adicionar se tiveres a certeza"><i class="ri-play-list-add-line"></i> Guião</button>`
      : `<button type="button" class="sh-btn is-primary" data-act="add" title="Adicionar ao alinhamento do dia"><i class="ri-play-list-add-line"></i> Guião</button>`;

    const playedBtn = played
      ? `<button type="button" class="sh-btn" data-act="reopen" title="Voltar a pendente"><i class="ri-restart-line"></i> Reabrir</button>`
      : `<button type="button" class="sh-btn is-ok" data-act="played" title="Marcar como tocada"><i class="ri-check-double-line"></i> Tocada</button>`;

    const archiveBtn = archived
      ? `<button type="button" class="sh-icon" data-act="reopen" title="Desarquivar"><i class="ri-inbox-unarchive-line"></i></button>`
      : `<button type="button" class="sh-icon" data-act="archive" title="Arquivar (esconde da fila)"><i class="ri-archive-line"></i></button>`;

    const exceptionBtn = g.ex
      ? `<button type="button" class="sh-icon" data-act="safe" title="Falso alarme: esta música é segura"><i class="ri-shield-check-line"></i></button>`
      : (g.v.state === 'clean' ? `<button type="button" class="sh-icon sh-icon-faint" data-act="flag" title="Exceção: tratar como explícita"><i class="ri-flag-line"></i></button>` : '');

    // Classificação de radiodifusão
    let verdictHtml = '';
    if (g.ex) {
      const why = g.v.manual ? 'Manual' : (g.v.src === 'itunes' ? 'Catálogo' : (g.v.words && g.v.words.length ? g.v.words.slice(0, 3).join(', ') : 'Letra'));
      verdictHtml = `<span class="sh-status-tag is-explicit" title="Conteúdo Explícito — ${esc(why)}"><i class="ri-forbid-line"></i> Explícita [E]</span>`;
    } else if (g.v.state === 'clean') {
      verdictHtml = `<span class="sh-status-tag is-clean" title="Música verificada: Apropriada para a escola"><i class="ri-checkbox-circle-line"></i> Apropriada</span>`;
    } else {
      verdictHtml = `<span class="sh-status-tag is-checking" title="A verificar conformidade"><i class="ri-loader-4-line ri-spin"></i> A verificar</span>`;
    }

    return `
      <div class="sh-row ${g.ex ? 'is-explicit' : ''} ${played ? 'is-played' : ''} ${archived ? 'is-archived' : ''} ${sel ? 'is-selected' : ''}" data-key="${key}" data-wp-row="${key}">
        <label class="sh-check" title="Selecionar linha"><input type="checkbox" data-act="select" ${sel ? 'checked' : ''}><span></span></label>
        
        <div class="sh-cell-votes" title="${g.count} pedido(s)">
          <b>${g.count}</b>
          <small>${g.count === 1 ? 'PEDIDO' : 'PEDIDOS'}</small>
        </div>
        
        <div class="sh-cell-cover">${thumb}</div>
        
        <div class="sh-cell-track">
          <div class="sh-track-title">
            ${g.ex ? '<span class="song-explicit-tag mini" title="Conteúdo Explícito [E]">E</span>' : ''}
            <span>${esc(g.songTitle)}</span>
          </div>
          <div class="sh-track-artist">${esc(g.artist)}</div>
        </div>
        
        <div class="sh-cell-requester" title="${esc(fullHistoryTooltip)}">
          <div class="sh-req-name">
            <i class="${firstReq.isDt ? 'ri-graduation-cap-line' : 'ri-user-3-line'}"></i>
            <span>${esc(firstReq.name)}</span>
            ${moreCount > 0 ? `<span class="sh-req-badge-more" title="${moreCount} outro(s) pedido(s)">+${moreCount}</span>` : ''}
          </div>
          ${firstReq.meta ? `<div class="sh-req-meta">${esc(firstReq.meta)}</div>` : ''}
        </div>
        
        <div class="sh-cell-time" title="${esc(fullHistoryTooltip)}">
          <div class="sh-time-date">${esc(firstReq.dateFormatted)}</div>
          ${firstReq.timeFormatted ? `<div class="sh-time-hour"><i class="ri-time-line"></i> ${esc(firstReq.timeFormatted)}</div>` : ''}
        </div>
        
        <div class="sh-cell-verdict">${verdictHtml}</div>
        
        <div class="sh-cell-actions">
          ${addBtn}${playedBtn}${archiveBtn}${exceptionBtn}
          <button type="button" class="sh-icon is-danger" data-act="delete" title="Eliminar pedidos"><i class="ri-delete-bin-line"></i></button>
        </div>
      </div>`;
  }

  function emptyHtml() {
    const msg = {
      todo: ['ri-checkbox-circle-line', 'Tudo decidido!', 'Não há músicas seguras por decidir. Bom trabalho.'],
      explicit: ['ri-shield-check-line', 'Sem músicas explícitas pendentes', 'Nada de preocupante na fila neste momento.'],
      played: ['ri-music-2-line', 'Ainda nada tocado', 'As músicas marcadas como tocadas aparecem aqui.'],
      archived: ['ri-archive-line', 'Arquivo vazio', 'As músicas arquivadas aparecem aqui.'],
      all: ['ri-music-2-line', 'Sem pedidos', 'Ainda não chegaram pedidos de música.']
    }[state.tab];
    const filtered = state.search || state.source !== 'all';
    return `<div class="sh-empty"><i class="${msg[0]}"></i><strong>${filtered ? 'Nada encontrado' : msg[1]}</strong><span>${filtered ? 'Tenta limpar a pesquisa ou os filtros.' : msg[2]}</span></div>`;
  }

  function render() {
    const list = $('shList');
    if (!list || !window.db) return;

    groups = buildGroups();

    // Contadores
    const counts = {};
    Object.keys(inTab).forEach(k => { counts[k] = groups.filter(inTab[k]).length; });
    Object.keys(counts).forEach(k => {
      const el = document.querySelector(`[data-sh-count="${k}"]`);
      if (el) el.textContent = counts[k];
    });
    document.querySelectorAll('.sh-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === state.tab));
    const expTab = document.querySelector('.sh-tab[data-tab="explicit"]');
    if (expTab) expTab.classList.toggle('has-alert', counts.explicit > 0);

    // Filtros
    const q = state.search;
    visible = groups.filter(inTab[state.tab]).filter(g => {
      if (state.source === 'dt' && !g.hasDT) return false;
      if (state.source === 'web' && !g.hasWeb) return false;
      if (q && !`${g.songTitle} ${g.artist} ${(g.dtClasses || []).join(' ')} ${(g.studentIdentities || []).join(' ')} ${(g.requests || []).map(r => `${r.who} ${r.when}`).join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (state.sort === 'recent') visible.sort((a, b) => b.latestTimestamp - a.latestTimestamp || b.count - a.count);
    else if (state.sort === 'az') visible.sort((a, b) => a.songTitle.localeCompare(b.songTitle, 'pt'));
    else visible.sort((a, b) => b.count - a.count || b.latestTimestamp - a.latestTimestamp);

    // Limpa seleção de músicas que já não existem na vista
    const visKeys = new Set(visible.map(g => g.key));
    state.selected.forEach(k => { if (!visKeys.has(k)) state.selected.delete(k); });

    // Estado do motor
    const st = window.ExplicitEngine ? window.ExplicitEngine.stats(groups) : { total: groups.length, done: groups.length, busy: 0 };
    const pct = st.total ? Math.round((st.done / st.total) * 100) : 100;
    const eng = $('shEngine');
    if (eng) {
      eng.classList.toggle('is-busy', st.busy > 0);
      eng.innerHTML = st.busy > 0
        ? `<i class="ri-radar-line"></i><span>A verificar conteúdo explícito… <b>${st.done}/${st.total}</b></span><div class="sh-engine-bar"><div style="width:${pct}%"></div></div>`
        : `<i class="ri-shield-check-fill"></i><span>Verificação automática ativa · <b>${st.done}/${st.total}</b> músicas analisadas</span>`;
    }

    // Banner explícitas
    const banner = $('shBanner');
    if (banner) {
      if (state.tab === 'explicit' && counts.explicit > 0) {
        banner.hidden = false;
        banner.innerHTML = `<i class="ri-shield-keyhole-line"></i><div><strong>${counts.explicit} música${counts.explicit > 1 ? 's' : ''} explícita${counts.explicit > 1 ? 's' : ''} bloqueada${counts.explicit > 1 ? 's' : ''} para emissão escolar</strong><span>Já estão fora da fila "Por decidir". Passa o rato no estado para ver porquê.</span></div><button type="button" class="sh-btn is-danger" data-act="archive-all-explicit"><i class="ri-archive-line"></i> Arquivar todas</button>`;
      } else {
        banner.hidden = true;
      }
    }

    // Barra de seleção
    renderBulk();

    // Lista (só toca no DOM se algo mudou → sem piscar)
    const html = visible.length ? visible.map(rowHtml).join('') : emptyHtml();
    const hash = `${state.tab}|${html.length}|${simpleHash(html)}`;
    if (hash !== lastHash) {
      lastHash = hash;
      list.innerHTML = html;
    }

    const all = $('shSelectAll');
    if (all) {
      all.checked = visible.length > 0 && visible.every(g => state.selected.has(g.key));
      all.indeterminate = state.selected.size > 0 && !all.checked;
    }

    if (window.WavePlayer) {
      window.WavePlayer.setQueue('songs', visible.map(s => ({
        key: s.key, url: s.previewUrl, title: s.songTitle, artist: s.artist, artwork: s.artwork, explicit: s.ex
      })));
    }
    const total = $('shTotalRequests');
    if (total) total.textContent = `${groups.reduce((n, g) => n + g.count, 0)} pedidos · ${groups.length} temas`;

    if (window.ExplicitEngine) window.ExplicitEngine.scan(groups);
  }

  function schedule() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(render);
  }

  function simpleHash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return h;
  }

  function renderBulk() {
    const bar = $('shBulk');
    if (!bar) return;
    const n = state.selected.size;
    bar.classList.toggle('is-open', n > 0);
    const c = $('shBulkCount');
    if (c) c.textContent = `${n} selecionada${n === 1 ? '' : 's'}`;
  }

  /* ---------- Ações ---------- */
  const byKey = (k) => groups.find(g => g.key === k);
  const refreshOthers = () => {
    try { if (typeof updateKPIs === 'function') updateKPIs(); } catch (_) {}
    try { if (typeof renderAoVivoSongs === 'function') renderAoVivoSongs(currentAoVivoSongFilter); } catch (_) {}
  };

  function setStatus(gs, status) {
    gs.forEach(g => (g.ids || []).forEach(id => window.db.updateSuggestionStatus(id, status)));
    refreshOthers();
    schedule();
  }

  function addToRundown(gs) {
    const explicitOnes = gs.filter(g => g.ex);
    if (explicitOnes.length) {
      const names = explicitOnes.slice(0, 3).map(g => `"${g.songTitle}"`).join(', ');
      if (!confirm(`⚠ ${explicitOnes.length === 1 ? 'Esta música é explícita' : 'Estas músicas são explícitas'} (${names}) e não deve${explicitOnes.length === 1 ? '' : 'm'} passar em contexto escolar.\n\nAdicionar mesmo assim ao guião?`)) return false;
    }
    if (typeof window.addSongToAoVivoRundown !== 'function') { toast('Alinhamento indisponível.', 'warning'); return false; }
    gs.forEach(g => window.addSongToAoVivoRundown(g.songTitle, g.artist, g.ex));
    return true;
  }

  function deleteGroups(gs) {
    const label = gs.length === 1 ? `"${gs[0].songTitle}"` : `${gs.length} músicas`;
    if (!confirm(`Eliminar todos os pedidos de ${label}?`)) return;
    gs.forEach(g => (g.ids || []).forEach(id => {
      if (window.db.cache && Array.isArray(window.db.cache.suggestions)) {
        window.db.cache.suggestions = window.db.cache.suggestions.filter(s => s.id !== id);
      }
      window.db.remove('suggestions', id).catch(console.error);
    }));
    state.selected.clear();
    refreshOthers();
    schedule();
    toast(`Pedidos de ${label} eliminados.`, 'info');
  }

  function handleRowAction(act, key) {
    const g = byKey(key);
    if (!g) return;
    switch (act) {
      case 'play': if (window.WavePlayer) window.WavePlayer.playKey(key, 'songs'); break;
      case 'add': addToRundown([g]); break;
      case 'played': setStatus([g], 'played'); break;
      case 'reopen': setStatus([g], 'pending'); break;
      case 'archive': setStatus([g], 'archived'); break;
      case 'delete': deleteGroups([g]); break;
      case 'safe':
        window.ExplicitEngine.setOverride(key, 'safe');
        toast(`"${g.songTitle}" passou a Segura.`, 'success');
        break;
      case 'flag':
        window.ExplicitEngine.setOverride(key, 'explicit');
        toast(`"${g.songTitle}" tratada como explícita.`, 'info');
        break;
      default: break;
    }
  }

  function selectedGroups() { return Array.from(state.selected).map(byKey).filter(Boolean); }

  function bindOnce() {
    const list = $('shList');
    if (!list || list._shBound) return;
    list._shBound = true;

    list.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const row = el.closest('.sh-row');
      if (!row) return;
      const act = el.dataset.act;
      if (act === 'select') return; // tratado em 'change'
      handleRowAction(act, row.dataset.key);
    });
    list.addEventListener('change', (e) => {
      if (!e.target.matches('[data-act="select"]')) return;
      const row = e.target.closest('.sh-row');
      if (!row) return;
      if (e.target.checked) state.selected.add(row.dataset.key); else state.selected.delete(row.dataset.key);
      row.classList.toggle('is-selected', e.target.checked);
      renderBulk();
      const all = $('shSelectAll');
      if (all) { all.checked = visible.length > 0 && visible.every(g => state.selected.has(g.key)); all.indeterminate = state.selected.size > 0 && !all.checked; }
    });

    $('shBanner').addEventListener('click', (e) => {
      if (!e.target.closest('[data-act="archive-all-explicit"]')) return;
      const gs = groups.filter(inTab.explicit);
      if (!gs.length) return;
      setStatus(gs, 'archived');
      toast(`${gs.length} música(s) explícita(s) arquivada(s).`, 'success');
    });

    document.querySelectorAll('.sh-tab').forEach(t => t.addEventListener('click', () => {
      state.tab = t.dataset.tab; state.selected.clear(); lastHash = ''; schedule();
    }));
    document.querySelectorAll('.sh-seg-btn').forEach(b => b.addEventListener('click', () => {
      state.source = b.dataset.source;
      document.querySelectorAll('.sh-seg-btn').forEach(x => x.classList.toggle('active', x === b));
      lastHash = ''; schedule();
    }));
    $('shSort').addEventListener('change', (e) => { state.sort = e.target.value; lastHash = ''; schedule(); });
    let st;
    $('shSearch').addEventListener('input', (e) => {
      clearTimeout(st);
      st = setTimeout(() => { state.search = e.target.value.trim().toLowerCase(); lastHash = ''; schedule(); }, 140);
    });
    $('shSelectAll').addEventListener('change', (e) => {
      visible.forEach(g => { if (e.target.checked) state.selected.add(g.key); else state.selected.delete(g.key); });
      lastHash = ''; schedule();
    });

    $('shBulk').addEventListener('click', (e) => {
      const b = e.target.closest('[data-bulk]');
      if (!b) return;
      const gs = selectedGroups();
      if (!gs.length) return;
      const a = b.dataset.bulk;
      if (a === 'played') { setStatus(gs, 'played'); state.selected.clear(); }
      else if (a === 'archive') { setStatus(gs, 'archived'); state.selected.clear(); }
      else if (a === 'add') { if (addToRundown(gs)) { state.selected.clear(); lastHash = ''; schedule(); } }
      else if (a === 'delete') deleteGroups(gs);
      else if (a === 'clear') { state.selected.clear(); lastHash = ''; schedule(); }
    });

    // Atalho: "/" foca a pesquisa
    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''))) return;
      const sec = $('sec-musicas');
      if (!sec || sec.style.display === 'none') return;
      e.preventDefault();
      $('shSearch').focus();
    });
  }

  /* ---------- API pública ---------- */
  const api = {
    render() { bindOnce(); schedule(); },
    setTab(tab) { state.tab = tab; state.selected.clear(); lastHash = ''; schedule(); },

    rescan() {
      if (!window.ExplicitEngine) return;
      const n = window.ExplicitEngine.rescan(groups);
      toast(n ? `A reverificar ${n} músicas…` : 'Nada para verificar.', 'info');
    },

    copySafe() {
      const list = buildGroups().filter(inTab.todo).sort((a, b) => b.count - a.count);
      if (!list.length) { toast('Não há músicas seguras por decidir.', 'warning'); return; }
      const text = list.map((s, i) => `${i + 1}. ${s.songTitle} — ${s.artist} (${s.count}x)`).join('\n');
      navigator.clipboard.writeText(text)
        .then(() => toast(`${list.length} músicas seguras copiadas!`, 'success'))
        .catch(() => toast('Não foi possível copiar.', 'error'));
    },

    clearAll() {
      if (!confirm('Eliminar TODOS os pedidos de música? Esta ação não pode ser desfeita.')) return;
      if (window.WavePlayer) window.WavePlayer.stop();
      window.db.clearSuggestions();
      refreshOthers();
      schedule();
    }
  };
  window.SongsHub = api;

  // Substitui a renderização antiga e liga os eventos da base de dados / motor
  window.renderSongRankingTable = function () { api.render(); };
  document.addEventListener('wave-explicit-updated', () => { schedule(); try { if (typeof renderAoVivoSongs === 'function') renderAoVivoSongs(currentAoVivoSongFilter); } catch (_) {} });
  document.addEventListener('radio-db-updated', (e) => {
    const c = e && e.detail && e.detail.collection;
    if (!c || c === 'suggestions') schedule();
  });
  document.addEventListener('DOMContentLoaded', () => { bindOnce(); });
})();
