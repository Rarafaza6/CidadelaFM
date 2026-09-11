/* ==========================================================================
   CALENDÁRIO ESTILO GOOGLE CALENDAR — Rádio EBS Cidadela
   Views: Month | Week | Day | Agenda
   ========================================================================== */

'use strict';

/* ─── State ────────────────────────────────────────────────────────────────── */
const GCal = (() => {
  // Current view: 'month' | 'week' | 'day' | 'agenda'
  let view = 'month';
  // The "anchor" date for the current view (first day of displayed period)
  let anchor = new Date();
  anchor.setHours(0, 0, 0, 0);
  // The selected day (highlighted)
  let selectedDate = localDateKey(new Date());
  // Mini-calendar: always shows the same month as the main view
  let miniMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);

  /* ─── Helpers ─────────────────────────────────────────────────────────────── */
  function localDateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function parseLocalDate(key) {
    if (!key) return null;
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }
  function startOfWeek(d) {
    const r = new Date(d);
    const day = r.getDay(); // 0=Sun
    const diff = (day === 0) ? -6 : 1 - day; // Monday-based
    r.setDate(r.getDate() + diff);
    r.setHours(0, 0, 0, 0);
    return r;
  }
  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  }
  function isToday(d) { return isSameDay(d, new Date()); }
  function fmtTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    if (isNaN(h)) return t;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')}`;
  }
  function getEvents() {
    return (window.db && typeof window.db.getCalendarEvents === 'function')
      ? window.db.getCalendarEvents()
      : [];
  }
  function eventsForDate(key) {
    return getEvents()
      .filter(e => e.date === key)
      .sort((a, b) => (a.startTime || '00:00').localeCompare(b.startTime || '00:00'));
  }
  function getColorHex(item) {
    const cat = CALENDAR_CATEGORY_COLORS?.[item.category || item.eventType];
    return cat?.hex || colorHexMap[item.color] || '#38bdf8';
  }
  function getColorKey(item) {
    const cat = CALENDAR_CATEGORY_COLORS?.[item.category || item.eventType];
    return item.color || cat?.color || 'blue';
  }
  const colorHexMap = {
    rose: '#f43f5e', amber: '#f59e0b', emerald: '#10b981',
    purple: '#a855f7', cyan: '#06b6d4', blue: '#38bdf8', slate: '#94a3b8'
  };

  /* ─── Navigation ──────────────────────────────────────────────────────────── */
  function navigate(delta) {
    if (view === 'month') {
      anchor = new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
    } else if (view === 'week') {
      anchor = addDays(anchor, delta * 7);
    } else if (view === 'day') {
      anchor = addDays(anchor, delta);
      selectedDate = localDateKey(anchor);
    } else if (view === 'agenda') {
      anchor = addDays(anchor, delta * 14);
    }
    miniMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    render();
  }

  function goToday() {
    anchor = new Date();
    anchor.setHours(0, 0, 0, 0);
    selectedDate = localDateKey(new Date());
    miniMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    render();
  }

  function setView(v) {
    view = v;
    render();
    // Update button states
    document.querySelectorAll('.gcal-view-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === v);
    });
  }

  function selectDay(key) {
    selectedDate = key;
    const d = parseLocalDate(key);
    if (d) {
      anchor = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      miniMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    }
    if (view === 'month' || view === 'agenda') {
      render();
    } else if (view === 'week') {
      render();
    } else {
      view = 'day';
      render();
      document.querySelectorAll('.gcal-view-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.view === 'day');
      });
    }
  }

  /* ─── Main Render ─────────────────────────────────────────────────────────── */
  function render() {
    renderMiniCalendar();
    renderHeader();
    const main = document.getElementById('gcalMain');
    if (!main) return;
    main.innerHTML = '';
    if (view === 'month') renderMonth(main);
    else if (view === 'week') renderWeek(main);
    else if (view === 'day') renderDay(main);
    else if (view === 'agenda') renderAgenda(main);
  }

  /* ─── Header ──────────────────────────────────────────────────────────────── */
  function renderHeader() {
    const el = document.getElementById('gcalRangeLabel');
    if (!el) return;
    const fmt = (d, opts) => new Intl.DateTimeFormat('pt-PT', opts).format(d);
    if (view === 'month') {
      el.textContent = fmt(anchor, { month: 'long', year: 'numeric' });
    } else if (view === 'week') {
      const ws = startOfWeek(anchor);
      const we = addDays(ws, 6);
      if (ws.getMonth() === we.getMonth()) {
        el.textContent = `${ws.getDate()}–${we.getDate()} ${fmt(ws, { month: 'long', year: 'numeric' })}`;
      } else {
        el.textContent = `${fmt(ws, { day: 'numeric', month: 'short' })} – ${fmt(we, { day: 'numeric', month: 'short', year: 'numeric' })}`;
      }
    } else if (view === 'day') {
      el.textContent = fmt(anchor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } else {
      el.textContent = fmt(anchor, { month: 'long', year: 'numeric' });
    }
  }

  /* ─── Mini Calendar ───────────────────────────────────────────────────────── */
  function renderMiniCalendar() {
    const titleEl = document.getElementById('gcalMiniTitle');
    const gridEl = document.getElementById('gcalMiniGrid');
    if (!titleEl || !gridEl) return;

    titleEl.textContent = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' }).format(miniMonth);
    const first = new Date(miniMonth.getFullYear(), miniMonth.getMonth(), 1);
    // Start on Monday
    const startDay = new Date(first);
    startDay.setDate(startDay.getDate() - ((startDay.getDay() + 6) % 7));
    const todayKey = localDateKey(new Date());
    const events = getEvents();
    const eventDays = new Set(events.map(e => e.date));

    let html = '';
    for (let i = 0; i < 42; i++) {
      const d = addDays(startDay, i);
      const key = localDateKey(d);
      const inMonth = d.getMonth() === miniMonth.getMonth();
      const isTod = key === todayKey;
      const isSel = key === selectedDate;
      const hasEvt = eventDays.has(key);
      html += `<button class="gcal-mini-day${inMonth ? '' : ' other-month'}${isTod ? ' today' : ''}${isSel ? ' selected' : ''}" 
                data-key="${key}" onclick="GCal.selectDay('${key}')" aria-label="${key}" title="${key}">
        ${d.getDate()}${hasEvt ? '<span class="gcal-mini-dot"></span>' : ''}
      </button>`;
    }
    gridEl.innerHTML = html;
  }

  function miniNavigate(delta) {
    miniMonth = new Date(miniMonth.getFullYear(), miniMonth.getMonth() + delta, 1);
    renderMiniCalendar();
  }

  /* ─── Month View ──────────────────────────────────────────────────────────── */
  function renderMonth(container) {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const startDay = new Date(first);
    startDay.setDate(startDay.getDate() - ((startDay.getDay() + 6) % 7));
    const todayKey = localDateKey(new Date());
    const events = getEvents();
    const eventMap = {};
    events.forEach(e => {
      if (!eventMap[e.date]) eventMap[e.date] = [];
      eventMap[e.date].push(e);
    });

    // Weekday headers
    const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    let html = `<div class="gcal-month-grid">
      <div class="gcal-month-weekdays">${days.map(d => `<div>${d}</div>`).join('')}</div>
      <div class="gcal-month-cells">`;

    for (let i = 0; i < 42; i++) {
      const d = addDays(startDay, i);
      const key = localDateKey(d);
      const inMonth = d.getMonth() === anchor.getMonth();
      const items = (eventMap[key] || []).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
      const isTod = key === todayKey;
      const isSel = key === selectedDate;

      const scriptForDay = (window.db && typeof window.db.getDailyScript === 'function') ? window.db.getDailyScript(key) : null;
      const hasScript = Boolean(scriptForDay && scriptForDay.content && scriptForDay.content.trim().length > 0);

      html += `<div class="gcal-month-cell${inMonth ? '' : ' other-month'}${isTod ? ' today' : ''}${isSel ? ' selected' : ''}" 
                   ondragover="event.preventDefault()" ondrop="GCal.dropOnDay(event,'${key}')"
                   onclick="GCal.selectDay('${key}')">
        <div class="gcal-month-cell-header">
          <span class="gcal-month-day-num" onclick="event.stopPropagation();GCal.selectDay('${key}');GCal.setView('day')">${d.getDate()}</span>
          ${hasScript ? `<button class="gcal-month-script-badge" onclick="event.stopPropagation();openDailyScriptFromCalendar('${key}')" title="Ver/Editar guião de ${key}"><i class="ri-file-text-fill"></i> Guião</button>` : ''}
          <button class="gcal-cell-add" onclick="event.stopPropagation();openCalendarEventModal('','${key}')" title="Novo evento" aria-label="Adicionar evento em ${key}"><i class="ri-add-line"></i></button>
        </div>
        <div class="gcal-month-cell-events">`;

      const maxShow = 3;
      items.slice(0, maxShow).forEach(item => {
        const hex = getColorHex(item);
        const timeStr = item.startTime ? `<span class="gcal-ev-time">${fmtTime(item.startTime)}</span>` : '';
        html += `<div class="gcal-month-event" style="--ev-color:${hex}" 
                      draggable="true" ondragstart="GCal.dragStart(event,'${item.id}')"
                      onclick="event.stopPropagation();openCalendarEventModal('${item.id}','${key}')"
                      title="${escapeHtml(item.title)}">
                    ${timeStr}<span>${escapeHtml(item.title)}</span>
                 </div>`;
      });
      if (items.length > maxShow) {
        const extra = items.length - maxShow;
        html += `<button class="gcal-more-events" onclick="event.stopPropagation();GCal.selectDay('${key}');GCal.setView('day')">+${extra} mais</button>`;
      }

      html += `</div>
      </div>`;
    }

    html += `</div></div>`;
    container.innerHTML = html;
  }

  /* ─── Week View ───────────────────────────────────────────────────────────── */
  function renderWeek(container) {
    const ws = startOfWeek(anchor);
    const todayKey = localDateKey(new Date());
    const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    const events = getEvents();
    const eventMap = {};
    days.forEach(d => {
      const key = localDateKey(d);
      eventMap[key] = events.filter(e => e.date === key).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    });

    // All-day events (no startTime)
    const allDayRow = days.map((d, i) => {
      const key = localDateKey(d);
      const allDay = eventMap[key].filter(e => !e.startTime);
      return `<div class="gcal-week-allday-cell" ondragover="event.preventDefault()" ondrop="GCal.dropOnDay(event,'${key}')">
        ${allDay.map(e => {
          const hex = getColorHex(e);
          return `<div class="gcal-week-allday-event" style="--ev-color:${hex}" 
                       onclick="openCalendarEventModal('${e.id}','${key}')">${escapeHtml(e.title)}</div>`;
        }).join('')}
      </div>`;
    }).join('');

    // Build 24-hour time grid
    const hours = Array.from({ length: 24 }, (_, h) => h);
    let timedCols = days.map((d, i) => {
      const key = localDateKey(d);
      const timed = eventMap[key].filter(e => e.startTime);
      return { key, timed, d };
    });

    // Column cells per hour
    let colCells = timedCols.map(({ key, timed, d }) => {
      const isT = key === todayKey;
      const isSel = key === selectedDate;
      let hourCells = hours.map(h => {
        const hKey = `${String(h).padStart(2, '0')}:00`;
        // Events starting in this hour
        const evs = timed.filter(e => {
          const [eh] = e.startTime.split(':').map(Number);
          return eh === h;
        });
        const evHtml = evs.map(e => {
          const hex = getColorHex(e);
          const [sh, sm] = e.startTime.split(':').map(Number);
          const topPct = (sm / 60) * 100;
          let heightPct = 100;
          if (e.endTime) {
            const [eh, em] = e.endTime.split(':').map(Number);
            const durationMins = (eh * 60 + em) - (sh * 60 + sm);
            heightPct = Math.max(25, (durationMins / 60) * 100);
          }
          return `<div class="gcal-week-event" style="--ev-color:${hex};top:${topPct}%;min-height:${Math.min(heightPct, 100 - topPct)}%"
                       draggable="true" ondragstart="GCal.dragStart(event,'${e.id}')"
                       onclick="event.stopPropagation();openCalendarEventModal('${e.id}','${key}')">
                    <span class="gcal-ev-title">${escapeHtml(e.title)}</span>
                    ${e.startTime ? `<span class="gcal-ev-time">${fmtTime(e.startTime)}${e.endTime ? '–' + fmtTime(e.endTime) : ''}</span>` : ''}
                  </div>`;
        }).join('');
        return `<div class="gcal-week-hour-slot" ondragover="event.preventDefault()" ondrop="GCal.dropOnDay(event,'${key}')"
                     onclick="openCalendarEventModal('','${key}')" title="Novo evento ${String(h).padStart(2,'0')}:00">
                  ${evHtml}
                </div>`;
      }).join('');
      return `<div class="gcal-week-col${isT ? ' today' : ''}${isSel ? ' selected' : ''}">
        ${hourCells}
      </div>`;
    }).join('');

    const dayHeaders = days.map(d => {
      const key = localDateKey(d);
      const isT = key === todayKey;
      const isSel = key === selectedDate;
      const dayNames = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
      const dayName = dayNames[(d.getDay() + 6) % 7];
      return `<div class="gcal-week-col-header${isT ? ' today' : ''}${isSel ? ' selected' : ''}" onclick="GCal.selectDay('${key}');GCal.setView('day')">
        <span class="gcal-wh-day">${dayName}</span>
        <span class="gcal-wh-num">${d.getDate()}</span>
      </div>`;
    }).join('');

    const hourLabels = hours.map(h => {
      const label = h === 0 ? '' : `${String(h).padStart(2, '0')}:00`;
      return `<div class="gcal-time-label">${label}</div>`;
    }).join('');

    container.innerHTML = `
      <div class="gcal-week-view">
        <div class="gcal-week-header">
          <div class="gcal-time-gutter"></div>
          ${dayHeaders}
        </div>
        <div class="gcal-week-allday-row">
          <div class="gcal-time-gutter gcal-allday-label">Dia todo</div>
          ${allDayRow}
        </div>
        <div class="gcal-week-body">
          <div class="gcal-time-col">${hourLabels}</div>
          <div class="gcal-week-cols">${colCells}</div>
        </div>
      </div>`;

    // Scroll to 8am by default
    const body = container.querySelector('.gcal-week-body');
    if (body) {
      setTimeout(() => { body.scrollTop = 8 * 60; }, 50);
    }
  }

  /* ─── Day View ────────────────────────────────────────────────────────────── */
  function renderDay(container) {
    const key = localDateKey(anchor);
    const events = eventsForDate(key);
    const allDay = events.filter(e => !e.startTime);
    const timed = events.filter(e => e.startTime);
    const hours = Array.from({ length: 24 }, (_, h) => h);

    const hourSlots = hours.map(h => {
      const evs = timed.filter(e => {
        const [eh] = e.startTime.split(':').map(Number);
        return eh === h;
      });
      const evHtml = evs.map(e => {
        const hex = getColorHex(e);
        const [sh, sm] = e.startTime.split(':').map(Number);
        const topPct = (sm / 60) * 100;
        let heightPct = 60;
        if (e.endTime) {
          const [eh, em] = e.endTime.split(':').map(Number);
          heightPct = Math.max(30, (((eh * 60 + em) - (sh * 60 + sm)) / 60) * 100);
        }
        return `<div class="gcal-day-event" style="--ev-color:${hex};top:${topPct}%;min-height:${Math.min(heightPct, 100 - topPct)}%"
                     onclick="openCalendarEventModal('${e.id}','${key}')">
                  <strong>${escapeHtml(e.title)}</strong>
                  <span>${fmtTime(e.startTime)}${e.endTime ? ' – ' + fmtTime(e.endTime) : ''}</span>
                  ${e.notes ? `<small>${escapeHtml(e.notes)}</small>` : ''}
                </div>`;
      }).join('');
      return `<div class="gcal-day-hour">
        <div class="gcal-time-label">${h === 0 ? '' : `${String(h).padStart(2,'0')}:00`}</div>
        <div class="gcal-day-hour-slot" onclick="openCalendarEventModal('','${key}')" 
             ondragover="event.preventDefault()" ondrop="GCal.dropOnDay(event,'${key}')">
          ${evHtml}
        </div>
      </div>`;
    }).join('');

    const allDayHtml = allDay.length ? `
      <div class="gcal-day-allday">
        <div class="gcal-time-label" style="font-size:0.7rem;padding-top:0.4rem;">Dia todo</div>
        <div class="gcal-day-allday-events">
          ${allDay.map(e => {
            const hex = getColorHex(e);
            return `<div class="gcal-day-allday-event" style="--ev-color:${hex}" onclick="openCalendarEventModal('${e.id}','${key}')">${escapeHtml(e.title)}</div>`;
          }).join('')}
        </div>
      </div>` : '';

    container.innerHTML = `
      <div class="gcal-day-view">
        ${allDayHtml}
        <div class="gcal-day-body">${hourSlots}</div>
      </div>`;

    // Scroll to 8am
    const body = container.querySelector('.gcal-day-body');
    if (body) setTimeout(() => { body.scrollTop = 8 * 60; }, 50);
  }

  /* ─── Agenda View ─────────────────────────────────────────────────────────── */
  function renderAgenda(container) {
    const events = getEvents();
    const todayKey = localDateKey(new Date());
    // Show 60 days ahead from anchor
    const days = Array.from({ length: 60 }, (_, i) => addDays(anchor, i));
    const relevantDays = days.filter(d => {
      const key = localDateKey(d);
      return events.some(e => e.date === key);
    });

    if (!relevantDays.length) {
      container.innerHTML = `<div class="gcal-agenda-empty">
        <i class="ri-calendar-check-line"></i>
        <strong>Sem eventos próximos</strong>
        <span>Adiciona o primeiro evento clicando em "+ Novo evento"</span>
      </div>`;
      return;
    }

    let html = '<div class="gcal-agenda-list">';
    relevantDays.forEach(d => {
      const key = localDateKey(d);
      const items = eventsForDate(key);
      if (!items.length) return;
      const isT = key === todayKey;
      const fmtDay = new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: 'numeric', month: 'long' }).format(d);

      html += `<div class="gcal-agenda-day${isT ? ' today' : ''}">
        <div class="gcal-agenda-date">
          <span class="gcal-agenda-weekday">${fmtDay.split(', ')[0] || ''}</span>
          <span class="gcal-agenda-daynum${isT ? ' today' : ''}">${d.getDate()}</span>
          <span class="gcal-agenda-month">${new Intl.DateTimeFormat('pt-PT', { month: 'short' }).format(d)}</span>
        </div>
        <div class="gcal-agenda-events">
          ${items.map(e => {
            const hex = getColorHex(e);
            const timeStr = e.startTime ? `${fmtTime(e.startTime)}${e.endTime ? ' – ' + fmtTime(e.endTime) : ''}` : 'Dia todo';
            return `<div class="gcal-agenda-event" onclick="openCalendarEventModal('${e.id}','${key}')">
              <div class="gcal-agenda-ev-color" style="background:${hex}"></div>
              <div class="gcal-agenda-ev-body">
                <strong>${escapeHtml(e.title)}</strong>
                <span>${timeStr}${e.assignedUserName ? ' · ' + escapeHtml(e.assignedUserName) : ''}</span>
                ${e.notes ? `<small>${escapeHtml(e.notes)}</small>` : ''}
              </div>
              <button class="gcal-agenda-ev-edit" onclick="event.stopPropagation();openCalendarEventModal('${e.id}','${key}')" title="Editar">
                <i class="ri-edit-line"></i>
              </button>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
  }

  /* ─── Drag & Drop ─────────────────────────────────────────────────────────── */
  let _draggingId = null;
  function dragStart(event, id) {
    _draggingId = id;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
    }
  }
  function dropOnDay(event, dateKey) {
    event.preventDefault();
    const id = event.dataTransfer?.getData('text/plain') || _draggingId;
    if (!id) return;
    window.db.updateCalendarEventDate(id, dateKey);
    selectedDate = dateKey;
    const d = parseLocalDate(dateKey);
    if (d) anchor = new Date(d);
    render();
    _draggingId = null;
  }

  /* ─── Category Legend ─────────────────────────────────────────────────────── */
  function renderLegend() {
    const el = document.getElementById('gcalLegend');
    if (!el || !window.CALENDAR_CATEGORY_COLORS) return;
    el.innerHTML = Object.entries(window.CALENDAR_CATEGORY_COLORS).map(([name, cfg]) => `
      <div class="gcal-legend-item" title="${name}">
        <span class="gcal-legend-dot" style="background:${cfg.hex}"></span>
        <span>${name}</span>
      </div>`).join('');
  }

  /* ─── Public API ──────────────────────────────────────────────────────────── */
  return {
    init() {
      render();
      renderLegend();
    },
    render,
    navigate,
    miniNavigate,
    goToday,
    setView,
    selectDay,
    dragStart,
    dropOnDay,
    localDateKey,
  };
})();

// Expose CALENDAR_CATEGORY_COLORS for GCal to use
function initGoogleCalendar() {
  if (!document.getElementById('gcalMain')) return;
  // Make CALENDAR_CATEGORY_COLORS accessible to module
  window.CALENDAR_CATEGORY_COLORS = CALENDAR_CATEGORY_COLORS;
  GCal.init();
}

// Called whenever Firestore data updates
function renderSharedCalendar() {
  if (document.getElementById('gcalMain')) {
    GCal.render();
  }
}
