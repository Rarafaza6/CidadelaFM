/* ==========================================================================
   WAVE TIME MACHINE — HISTÓRICO GLOBAL DE VERSÕES PARA TODO O SITE
   Interceta automaticamente todas as criações, edições e eliminações em
   todas as coleções de window.db (Guiões, Notícias, Podcasts, Sabias Que,
   Links, Equipa, Calendário, Tarefas, Votações, Nerd Alert, Músicas,
   Mensagens, Utilizadores e Definições do Site) e permite restaurar
   qualquer versão anterior ou item eliminado com 1 clique.
   ========================================================================== */
(function () {
  'use strict';

  const IDB_NAME = 'WaveGlobalVersionHistoryDB';
  const IDB_STORE = 'global_versions';
  const MAX_LOCAL_VERSIONS = 400;

  const COLLECTION_META = {
    announcements: { label: 'Notícias & Avisos', icon: 'ri-article-line', color: '#38bdf8' },
    sabesQue: { label: 'Sabias Que...', icon: 'ri-lightbulb-flash-line', color: '#fbbf24' },
    rundowns: { label: 'Guiões & Alinhamento', icon: 'ri-file-list-3-line', color: '#60a5fa' },
    podcasts: { label: 'Podcasts', icon: 'ri-headphones-line', color: '#a78bfa' },
    links: { label: 'Links Rápidos', icon: 'ri-links-line', color: '#34d399' },
    teamMembers: { label: 'Equipa do Site', icon: 'ri-user-star-line', color: '#ec4899' },
    calendarEvents: { label: 'Calendário', icon: 'ri-calendar-event-line', color: '#38bdf8' },
    tasks: { label: 'Tarefas da Equipa', icon: 'ri-todo-line', color: '#10b981' },
    polls: { label: 'Votações & Sondagens', icon: 'ri-bar-chart-2-line', color: '#c084fc' },
    nerdChallenges: { label: 'Desafios Alerta Nerd', icon: 'ri-flashlight-fill', color: '#f59e0b' },
    nerdSubmissions: { label: 'Submissões Alerta Nerd', icon: 'ri-mail-check-line', color: '#fb923c' },
    suggestions: { label: 'Músicas Pedidas', icon: 'ri-music-2-line', color: '#f43f5e' },
    messages: { label: 'Mensagens Recebidas', icon: 'ri-chat-heart-line', color: '#e879f9' },
    teamMemos: { label: 'Recados da Equipa', icon: 'ri-sticky-note-line', color: '#fde047' },
    adminUsers: { label: 'Utilizadores & Perfis', icon: 'ri-shield-user-line', color: '#fb7185' },
    siteSettings: { label: 'Definições & Visibilidade', icon: 'ri-settings-4-line', color: '#94a3b8' }
  };

  const ACTION_META = {
    create: { label: 'Criado', badgeClass: 'vh-badge-create', icon: 'ri-add-circle-line' },
    update: { label: 'Editado', badgeClass: 'vh-badge-update', icon: 'ri-edit-2-line' },
    delete: { label: 'Eliminado', badgeClass: 'vh-badge-delete', icon: 'ri-delete-bin-line' },
    restore: { label: 'Restaurado', badgeClass: 'vh-badge-restore', icon: 'ri-restart-line' },
    snapshot: { label: 'Backup Manual', badgeClass: 'vh-badge-snapshot', icon: 'ri-save-3-line' }
  };

  let idbPromise = null;
  let isRestoring = false;
  let lastWriteSignature = new Map();
  let filterState = { collection: 'all', action: 'all', query: '' };

  /* ---------- IndexedDB ---------- */
  function openIDB() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise((resolve) => {
      if (!window.indexedDB) { resolve(null); return; }
      try {
        const req = window.indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE, { keyPath: 'versionId' });
          }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
    return idbPromise;
  }

  async function getAllVersions() {
    const db = await openIDB();
    if (!db) {
      try {
        return JSON.parse(localStorage.getItem('wave_global_version_history') || '[]');
      } catch (_) { return []; }
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).getAll();
        req.onsuccess = () => {
          const list = Array.isArray(req.result) ? req.result : [];
          list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          resolve(list);
        };
        req.onerror = () => resolve([]);
      } catch (_) {
        resolve([]);
      }
    });
  }

  async function saveVersionEntry(entry) {
    const db = await openIDB();
    if (db) {
      await new Promise((resolve) => {
        try {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).put(entry);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (_) { resolve(false); }
      });

      // Limpar entradas antigas acima de MAX_LOCAL_VERSIONS
      const all = await getAllVersions();
      if (all.length > MAX_LOCAL_VERSIONS) {
        const toDelete = all.slice(MAX_LOCAL_VERSIONS);
        try {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          const store = tx.objectStore(IDB_STORE);
          toDelete.forEach(item => store.delete(item.versionId));
        } catch (_) {}
      }
    }

    // Espelhar resumo compacto em localStorage
    try {
      const prev = JSON.parse(localStorage.getItem('wave_global_version_history') || '[]');
      const next = [entry, ...prev.filter(x => x.versionId !== entry.versionId)].slice(0, 60);
      localStorage.setItem('wave_global_version_history', JSON.stringify(next));
    } catch (_) {}

    // Tentar sincronizar com Firestore (caso as regras para versionHistory estejam ativas)
    try {
      const fs = window.firebaseServices && window.firebaseServices.firestore;
      const auth = window.firebaseServices && window.firebaseServices.auth;
      if (fs && auth && auth.currentUser) {
        const payloadBytes = new Blob([JSON.stringify(entry)]).size;
        if (payloadBytes < 900000) {
          fs.collection('versionHistory').doc(entry.versionId).set(entry).catch(() => {});
        }
      }
    } catch (_) {}

    updateHistoryBadges();
  }

  /* ---------- Extração Inteligente de Título e Resumo ---------- */
  function resolveVirtualCollection(collection, docId, data) {
    if (collection === 'announcements' && data) {
      if (data.recordType === 'sabes_que') return 'sabesQue';
      if (docId === 'system_maintenance' || docId === 'system_visibility' || data.isSystemConfig) return 'siteSettings';
    }
    return collection;
  }

  function extractItemTitle(collection, docId, data) {
    if (!data || typeof data !== 'object') return `Registo #${docId}`;
    if (docId === 'system_maintenance') {
      return `Modo de Manutenção (${data.maintenanceEnabled ? 'ATIVADO' : 'Desativado'})`;
    }
    if (docId === 'system_visibility' || docId === 'visibility') {
      return 'Visibilidade de Páginas & Secções (Modo Beta)';
    }
    if (collection === 'rundowns') {
      const itemsCount = Array.isArray(data.items) ? data.items.length : 0;
      return `${data.title || 'Guião de Emissão'} (${data.date || docId} · ${itemsCount} itens)`;
    }
    if (collection === 'suggestions') {
      return `${data.songTitle || data.title || 'Música'} — ${data.artist || ''}`;
    }
    if (collection === 'messages') {
      return `Mensagem de ${data.name || data.senderName || 'Aluno'}: "${String(data.message || '').slice(0, 45)}"`;
    }
    if (collection === 'teamMembers') {
      return `${data.name || 'Membro'} (${data.role || 'Equipa'})`;
    }
    if (collection === 'polls') {
      return data.question || data.title || `Votação #${docId}`;
    }
    if (collection === 'calendarEvents') {
      return `${data.title || 'Evento'} (${data.date || ''})`;
    }
    return data.title || data.name || data.question || data.text || data.label || `Item #${docId}`;
  }

  function extractItemSummary(collection, docId, data) {
    if (!data || typeof data !== 'object') return '';
    if (collection === 'rundowns' && Array.isArray(data.items)) {
      return data.items.slice(0, 4).map(i => i.title).filter(Boolean).join(' → ') || 'Guião vazio';
    }
    if (collection === 'announcements' || collection === 'sabesQue') {
      return data.excerpt || String(data.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    }
    if (collection === 'podcasts') {
      return `${data.category || 'Podcast'} • ${data.hosts || data.author || ''}`;
    }
    if (collection === 'links') {
      return data.url || '';
    }
    if (collection === 'tasks') {
      return `Estado: ${data.status || 'todo'} • Responsável: ${data.assignee || 'Equipa'}`;
    }
    if (collection === 'suggestions') {
      return `Estado: ${data.status || 'pending'} ${data.teacherName ? '• ' + data.teacherName : ''}`;
    }
    return '';
  }

  function getCurrentActorName() {
    if (window.currentUserProfile && window.currentUserProfile.name) {
      return window.currentUserProfile.name;
    }
    const auth = window.firebaseServices && window.firebaseServices.auth;
    if (auth && auth.currentUser) {
      return auth.currentUser.displayName || auth.currentUser.email || 'Admin';
    }
    return 'Equipa Admin';
  }

  function cloneCleanData(obj) {
    if (!obj || typeof obj !== 'object') return null;
    try {
      const copy = {};
      Object.keys(obj).forEach(k => {
        if (obj[k] !== undefined && k !== '_writePromise') {
          copy[k] = obj[k];
        }
      });
      return JSON.parse(JSON.stringify(copy));
    } catch (_) {
      return null;
    }
  }

  function findExistingInCache(db, collection, id) {
    if (!db || !db.cache) return null;
    const arr = db.cache[collection];
    if (!Array.isArray(arr)) return null;
    return arr.find(item => item && String(item.id || item.date) === String(id)) || null;
  }

  /* ---------- Interceção Universal de window.db.write e window.db.remove ---------- */
  function attachDatabaseHooks() {
    const db = window.db;
    if (!db || db._versionHistoryHooked) return;
    db._versionHistoryHooked = true;

    const origWrite = db.write.bind(db);
    const origRemove = db.remove.bind(db);

    db.write = function (collection, id, data) {
      if (!isRestoring && collection !== 'versionHistory') {
        try {
          const cleanAfter = cloneCleanData({ ...data, id: data?.id || id });
          const virtualCol = resolveVirtualCollection(collection, id, cleanAfter);

          // Evitar gravar snapshots duplicados seguidos para o mesmo documento em < 2.5 segundos
          const sigKey = `${collection}:${id}`;
          const contentHash = JSON.stringify(cleanAfter).length + '_' + extractItemTitle(virtualCol, id, cleanAfter);
          const prevSig = lastWriteSignature.get(sigKey);
          const now = Date.now();

          if (!prevSig || prevSig.hash !== contentHash || (now - prevSig.time) > 2500) {
            lastWriteSignature.set(sigKey, { hash: contentHash, time: now });
            const isNew = !prevSig && (!data || !data.updatedAt);
            const entry = {
              versionId: `ver_${now}_${Math.random().toString(36).slice(2, 7)}`,
              timestamp: now,
              collection,
              virtualCollection: virtualCol,
              docId: String(id),
              action: isNew ? 'create' : 'update',
              actor: getCurrentActorName(),
              title: extractItemTitle(virtualCol, id, cleanAfter),
              summary: extractItemSummary(virtualCol, id, cleanAfter),
              snapshot: cleanAfter
            };
            saveVersionEntry(entry);
          }
        } catch (err) {
          console.warn('WaveTimeMachine write hook error:', err);
        }
      }
      return origWrite(collection, id, data);
    };

    db.remove = function (collection, id) {
      if (!isRestoring && collection !== 'versionHistory' && collection !== 'sabesQue') {
        try {
          // Capturar estado do item antes de ser removido (ou do último snapshot conhecido)
          const cached = findExistingInCache(db, collection, id) || (db._lastDeletedSnapshot && db._lastDeletedSnapshot[`${collection}:${id}`]);
          getAllVersions().then(all => {
            const lastVer = all.find(v => v.collection === collection && String(v.docId) === String(id) && v.snapshot);
            const snapToSave = cloneCleanData(cached) || (lastVer ? lastVer.snapshot : { id });
            const virtualCol = resolveVirtualCollection(collection, id, snapToSave);
            const now = Date.now();
            const entry = {
              versionId: `ver_${now}_${Math.random().toString(36).slice(2, 7)}`,
              timestamp: now,
              collection,
              virtualCollection: virtualCol,
              docId: String(id),
              action: 'delete',
              actor: getCurrentActorName(),
              title: extractItemTitle(virtualCol, id, snapToSave),
              summary: extractItemSummary(virtualCol, id, snapToSave) || 'Item eliminado — pode ser restaurado a qualquer momento',
              snapshot: snapToSave
            };
            saveVersionEntry(entry);
          });
        } catch (err) {
          console.warn('WaveTimeMachine remove hook error:', err);
        }
      }
      return origRemove(collection, id);
    };

    // Intercetar métodos delete* que filtram a cache antes de chamar this.remove()
    const deleteMethods = [
      ['deleteAnnouncement', 'announcements'],
      ['deleteSabesQue', 'announcements'],
      ['deletePodcast', 'podcasts'],
      ['deleteLink', 'links'],
      ['deleteTeamMember', 'teamMembers'],
      ['deleteCalendarEvent', 'calendarEvents'],
      ['deleteTask', 'tasks'],
      ['deletePoll', 'polls'],
      ['deleteNerdChallenge', 'nerdChallenges'],
      ['deleteMessage', 'messages'],
      ['deleteTeamMemo', 'teamMemos'],
      ['deleteAdminUser', 'adminUsers']
    ];

    db._lastDeletedSnapshot = {};
    deleteMethods.forEach(([fnName, colName]) => {
      if (typeof db[fnName] === 'function') {
        const origFn = db[fnName].bind(db);
        db[fnName] = function (id, ...rest) {
          const existing = findExistingInCache(db, colName, id);
          if (existing) {
            db._lastDeletedSnapshot[`${colName}:${id}`] = cloneCleanData(existing);
          }
          return origFn(id, ...rest);
        };
      }
    });
  }

  /* ---------- Restauro Universal de Qualquer Versão ---------- */
  async function restoreVersionById(versionId) {
    const all = await getAllVersions();
    const entry = all.find(v => v.versionId === versionId);
    if (!entry || !entry.snapshot) {
      if (typeof window.showToast === 'function') window.showToast('Ponto de restauro não encontrado.', 'error');
      return;
    }

    const colMeta = COLLECTION_META[entry.virtualCollection || entry.collection] || { label: entry.collection };
    const dateStr = new Date(entry.timestamp).toLocaleString('pt-PT');
    if (!confirm(`Restaurar "${entry.title}" (${colMeta.label}) para a versão de ${dateStr}?`)) {
      return;
    }

    const db = window.db;
    if (!db) return;

    try {
      isRestoring = true;
      const snap = cloneCleanData(entry.snapshot);
      const col = entry.collection;
      const docId = entry.docId || snap.id;

      // Atualizar cache em memória imediatamente
      if (!db.cache[col]) db.cache[col] = [];
      const arr = db.cache[col];
      const idx = arr.findIndex(item => item && String(item.id || item.date) === String(docId));
      if (idx !== -1) {
        arr[idx] = { ...snap, id: docId };
      } else {
        arr.unshift({ ...snap, id: docId });
      }

      // Escrever no Cloud Firestore
      await db.write(col, String(docId), { ...snap, id: docId, restoredAt: Date.now() });

      // Sincronizar estados especiais se necessário
      if (docId === 'system_maintenance' && typeof db.syncMaintenanceState === 'function') {
        db.syncMaintenanceState();
      }
      if (docId === 'system_visibility' && typeof db.syncSiteVisibilityState === 'function') {
        db.syncSiteVisibilityState();
      }

      isRestoring = false;

      // Registar o próprio evento de restauro no histórico
      const now = Date.now();
      await saveVersionEntry({
        versionId: `ver_${now}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: now,
        collection: col,
        virtualCollection: entry.virtualCollection || col,
        docId: String(docId),
        action: 'restore',
        actor: getCurrentActorName(),
        title: entry.title,
        summary: `Restaurado para a versão de ${dateStr}`,
        snapshot: snap
      });

      // Atualizar todas as vistas do painel Admin
      document.dispatchEvent(new CustomEvent('radio-db-updated', { detail: { collection: col } }));
      if (typeof window.loadAdminDashboard === 'function') {
        try { window.loadAdminDashboard(); } catch (_) {}
      }
      if (window.RundownStudio && typeof window.RundownStudio.refresh === 'function') {
        try { window.RundownStudio.refresh(); } catch (_) {}
      }
      if (window.SongsHub && typeof window.SongsHub.render === 'function') {
        try { window.SongsHub.render(); } catch (_) {}
      }

      await renderHistoryUI();
      if (typeof window.showToast === 'function') {
        window.showToast(`"${entry.title}" restaurado com sucesso!`, 'success');
      }
    } catch (err) {
      isRestoring = false;
      console.error('Erro ao restaurar versão:', err);
      if (typeof window.showToast === 'function') {
        window.showToast('Erro ao restaurar versão: ' + (err.message || ''), 'error');
      }
    }
  }

  /* ---------- Criar Backup Completo do Estado Atual do Site ---------- */
  async function createFullSiteCheckpoint(customLabel) {
    const db = window.db;
    if (!db || !db.cache) return;
    const label = customLabel || prompt('Nome para este ponto de restauro global do site:', `Checkpoint Geral (${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })})`);
    if (label === null) return;

    const collectionsToSnap = [
      'announcements', 'rundowns', 'podcasts', 'links', 'teamMembers',
      'calendarEvents', 'tasks', 'polls', 'nerdChallenges'
    ];

    let count = 0;
    const now = Date.now();
    for (const col of collectionsToSnap) {
      const items = Array.isArray(db.cache[col]) ? db.cache[col] : [];
      for (const item of items.slice(0, 25)) {
        if (!item) continue;
        const docId = item.id || item.date;
        if (!docId) continue;
        const clean = cloneCleanData(item);
        const virtualCol = resolveVirtualCollection(col, docId, clean);
        await saveVersionEntry({
          versionId: `ver_${now}_${count}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: now,
          collection: col,
          virtualCollection: virtualCol,
          docId: String(docId),
          action: 'snapshot',
          actor: getCurrentActorName(),
          title: extractItemTitle(virtualCol, docId, clean),
          summary: `${label} • ${extractItemSummary(virtualCol, docId, clean)}`,
          snapshot: clean
        });
        count++;
      }
    }

    await renderHistoryUI();
    if (typeof window.showToast === 'function') {
      window.showToast(`Ponto de restauro global criado (${count} itens protegidos)!`, 'success');
    }
  }

  /* ---------- Exportar / Importar Histórico Completo (.JSON) ---------- */
  async function exportFullHistoryJson() {
    const all = await getAllVersions();
    const blob = new Blob([JSON.stringify({ exportedAt: Date.now(), versions: all }, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wave-radio-historico-versoes-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (typeof window.showToast === 'function') {
      window.showToast('Histórico completo exportado em .JSON!', 'success');
    }
  }

  /* ---------- Interface e Renderização ---------- */
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  async function updateHistoryBadges() {
    const all = await getAllVersions();
    const badge = document.getElementById('sideNavBadgeHistory');
    const topCount = document.getElementById('vhTotalCountBadge');
    if (badge) badge.textContent = all.length > 0 ? String(all.length) : '';
    if (topCount) topCount.textContent = `${all.length} versões guardadas`;
  }

  async function renderHistoryUI() {
    const all = await getAllVersions();
    updateHistoryBadges();

    const q = (filterState.query || '').toLowerCase().trim();
    const filtered = all.filter(v => {
      const col = v.virtualCollection || v.collection;
      if (filterState.collection !== 'all' && col !== filterState.collection) return false;
      if (filterState.action !== 'all' && v.action !== filterState.action) return false;
      if (q) {
        const hay = `${v.title || ''} ${v.summary || ''} ${v.actor || ''} ${v.docId || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // KPIs da secção
    const kpiTotal = document.getElementById('vhKpiTotal');
    const kpiDeletes = document.getElementById('vhKpiDeletes');
    const kpiRestores = document.getElementById('vhKpiRestores');
    if (kpiTotal) kpiTotal.textContent = String(all.length);
    if (kpiDeletes) kpiDeletes.textContent = String(all.filter(v => v.action === 'delete').length);
    if (kpiRestores) kpiRestores.textContent = String(all.filter(v => v.action === 'restore').length);

    const html = filtered.length === 0
      ? `<div class="vh-empty">
           <i class="ri-history-line"></i>
           <strong>Nenhuma versão encontrada</strong>
           <span>Todas as alterações que fizeres em notícias, guiões, músicas, podcasts, links, calendário, tarefas ou definições aparecem automaticamente aqui.</span>
         </div>`
      : filtered.slice(0, 120).map(v => {
          const colKey = v.virtualCollection || v.collection;
          const colMeta = COLLECTION_META[colKey] || { label: colKey, icon: 'ri-database-2-line', color: '#94a3b8' };
          const actMeta = ACTION_META[v.action] || ACTION_META.update;
          const dt = new Date(v.timestamp);
          const dateLabel = dt.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
          const timeLabel = dt.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

          return `
            <div class="vh-row">
              <div class="vh-col-icon" style="color:${colMeta.color}; border-color:${colMeta.color}44; background:${colMeta.color}18;">
                <i class="${colMeta.icon}"></i>
              </div>
              <div class="vh-main">
                <div class="vh-top-line">
                  <span class="vh-col-tag" style="color:${colMeta.color};">${esc(colMeta.label)}</span>
                  <span class="vh-act-badge ${actMeta.badgeClass}"><i class="${actMeta.icon}"></i> ${esc(actMeta.label)}</span>
                  <strong class="vh-title">${esc(v.title)}</strong>
                </div>
                ${v.summary ? `<div class="vh-summary">${esc(v.summary)}</div>` : ''}
                <div class="vh-meta">
                  <span><i class="ri-calendar-line"></i> ${esc(dateLabel)} às <b>${esc(timeLabel)}</b></span>
                  <span><i class="ri-user-3-line"></i> ${esc(v.actor || 'Admin')}</span>
                  <span><i class="ri-fingerprint-line"></i> ID: <code>${esc(v.docId)}</code></span>
                </div>
              </div>
              <div class="vh-actions">
                <button type="button" class="btn-action" onclick="WaveTimeMachine.inspect('${esc(v.versionId)}')" title="Inspecionar dados completos desta versão">
                  <i class="ri-code-s-slash-line"></i> Ver Dados
                </button>
                <button type="button" class="btn-submit-main" style="padding: 0.45rem 0.85rem; font-size: 0.8rem;" onclick="WaveTimeMachine.restore('${esc(v.versionId)}')" title="Restaurar este item para esta versão exata">
                  <i class="ri-restart-line"></i> Restaurar
                </button>
              </div>
            </div>
          `;
        }).join('');

    const mainList = document.getElementById('vhMainTimelineList');
    const modalList = document.getElementById('vhModalTimelineList');
    if (mainList) mainList.innerHTML = html;
    if (modalList) modalList.innerHTML = html;
  }

  async function inspectVersionById(versionId) {
    const all = await getAllVersions();
    const entry = all.find(v => v.versionId === versionId);
    if (!entry) return;
    const modal = document.getElementById('vhInspectModal');
    const pre = document.getElementById('vhInspectJsonPre');
    const title = document.getElementById('vhInspectTitle');
    const restoreBtn = document.getElementById('vhInspectRestoreBtn');
    if (!modal || !pre) return;

    if (title) title.textContent = `${entry.title} (${new Date(entry.timestamp).toLocaleString('pt-PT')})`;
    const displaySnap = { ...entry.snapshot };
    if (typeof displaySnap.image === 'string' && displaySnap.image.startsWith('data:image/')) {
      displaySnap.image = `[Fotografia Base64 • ${Math.round((displaySnap.image.length * 0.75) / 1024)} KB]`;
    }
    pre.textContent = JSON.stringify(displaySnap, null, 2);
    if (restoreBtn) {
      restoreBtn.onclick = () => {
        modal.classList.remove('active');
        restoreVersionById(versionId);
      };
    }
    modal.classList.add('active');
  }

  function openQuickModal(defaultCollection = 'all') {
    filterState.collection = defaultCollection || 'all';
    document.querySelectorAll('.vh-col-select').forEach(sel => { sel.value = filterState.collection; });
    renderHistoryUI();
    const modal = document.getElementById('vhQuickModal');
    if (modal) modal.classList.add('active');
  }

  function bindUIEvents() {
    document.querySelectorAll('.vh-col-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        filterState.collection = e.target.value;
        document.querySelectorAll('.vh-col-select').forEach(s => { s.value = filterState.collection; });
        renderHistoryUI();
      });
    });

    document.querySelectorAll('.vh-act-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        filterState.action = e.target.value;
        document.querySelectorAll('.vh-act-select').forEach(s => { s.value = filterState.action; });
        renderHistoryUI();
      });
    });

    document.querySelectorAll('.vh-search-input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        filterState.query = e.target.value;
        document.querySelectorAll('.vh-search-input').forEach(i => { if (i !== e.target) i.value = filterState.query; });
        renderHistoryUI();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bindUIEvents();
    if (window.db) {
      await window.db.ready();
      attachDatabaseHooks();
      await renderHistoryUI();
    }
  });

  window.WaveTimeMachine = {
    render: renderHistoryUI,
    restore: restoreVersionById,
    inspect: inspectVersionById,
    checkpoint: createFullSiteCheckpoint,
    exportJson: exportFullHistoryJson,
    openModal: openQuickModal
  };
})();
