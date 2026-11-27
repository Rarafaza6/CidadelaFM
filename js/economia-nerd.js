/* ==========================================================================
   NERD ALERT DE ECONOMIA — aba lateral na página Economia em Frequência
   Aparece só quando existe um desafio ativo com portal "economia" no Admin
   (Alerta Nerd > Onde aparece = Economia). Respostas guardadas com hora exata
   em nerdSubmissions (visíveis no Admin > Alerta Nerd).
   ========================================================================== */
(function () {
  'use strict';
  const PORTAL = 'economia';
  const LS = 'wave_econ_nerd_submitted_';
  let current = null;
  let root = null;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  function fmt(ms) {
    const d = new Date(Number(ms) || Date.now());
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  }
  function getReceipt(id) { try { return JSON.parse(localStorage.getItem(LS + id)); } catch (_) { return null; } }
  function setReceipt(id, r) { try { localStorage.setItem(LS + id, JSON.stringify(r)); } catch (_) {} }

  function ensureRoot() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'econNerdRoot';
    root.innerHTML = `
      <button type="button" class="econ-nerd-tab" id="econNerdTab" aria-haspopup="dialog" aria-controls="econNerdPanel">
        <i class="ri-flashlight-fill" aria-hidden="true"></i><span>Nerd Alert · Economia</span>
      </button>
      <div class="econ-nerd-backdrop" id="econNerdBackdrop"></div>
      <aside class="econ-nerd-panel" id="econNerdPanel" role="dialog" aria-modal="true" aria-labelledby="econNerdTitle" aria-hidden="true">
        <button type="button" class="econ-nerd-close" id="econNerdClose" aria-label="Fechar"><i class="ri-close-line"></i></button>
        <div class="econ-nerd-body" id="econNerdBody"></div>
      </aside>`;
    document.body.appendChild(root);
    ensureNav();
    const open = () => togglePanel(true);
    const close = () => togglePanel(false);
    root.querySelector('#econNerdTab').addEventListener('click', open);
    root.querySelector('#econNerdClose').addEventListener('click', close);
    root.querySelector('#econNerdBackdrop').addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    return root;
  }

  /* Botão verde no banner superior (desktop) e no menu mobile */
  function ensureNav() {
    const bar = document.querySelector('.w-nav-in');
    if (bar && !bar.querySelector('[data-econ-nerd-nav]')) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'econ-nerd-nav-btn';
      b.setAttribute('data-econ-nerd-nav', 'true');
      b.innerHTML = '<i class="ri-flashlight-fill" aria-hidden="true"></i> Nerd Alert';
      b.addEventListener('click', () => togglePanel(true));
      const cta = bar.querySelector('.w-nav-cta');
      if (cta && cta.parentNode) cta.parentNode.insertBefore(b, cta); else bar.appendChild(b);
    }
    const drawer = document.getElementById('mobileMenu');
    if (drawer && !drawer.querySelector('[data-econ-nerd-nav]')) {
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'w-btn w-btn-block econ-nerd-drawer-btn';
      d.setAttribute('data-econ-nerd-nav', 'true');
      d.innerHTML = '<i class="ri-flashlight-fill" aria-hidden="true"></i> Nerd Alert · Economia';
      d.addEventListener('click', () => { drawer.classList.remove('open'); togglePanel(true); });
      const cta = drawer.querySelector('.w-btn-red');
      if (cta && cta.parentNode) cta.parentNode.insertBefore(d, cta); else drawer.appendChild(d);
    }
  }

  function removeNav() {
    document.querySelectorAll('[data-econ-nerd-nav]').forEach(el => el.remove());
  }

  function togglePanel(show) {
    if (!root) return;
    root.classList.toggle('open', show);
    root.querySelector('#econNerdPanel').setAttribute('aria-hidden', show ? 'false' : 'true');
  }

  function renderBody() {
    const body = document.getElementById('econNerdBody');
    if (!body || !current) return;
    const c = current;
    const receipt = getReceipt(c.id);
    body.innerHTML = `
      <span class="econ-nerd-pill"><i class="ri-flashlight-fill"></i> Desafio ativo</span>
      <h2 id="econNerdTitle">${esc(c.title || 'Nerd Alert de Economia')}</h2>
      ${c.image ? `<img class="econ-nerd-img" src="${esc(c.image)}" alt="" loading="lazy">` : ''}
      <p class="econ-nerd-question">${esc(c.question)}</p>
      ${c.hint ? `<p class="econ-nerd-hint"><i class="ri-lightbulb-flash-line"></i> ${esc(c.hint)}</p>` : ''}
      ${c.prize ? `<p class="econ-nerd-prize"><i class="ri-trophy-fill"></i> ${esc(c.prize)}</p>` : ''}
      ${receipt ? receiptHtml(receipt) : formHtml()}`;
    const form = document.getElementById('econNerdForm');
    if (form) form.addEventListener('submit', onSubmit);
  }

  function receiptHtml(r) {
    return `<div class="econ-nerd-receipt"><strong><i class="ri-checkbox-circle-fill"></i> Resposta registada!</strong>
      <span>${esc(r.fullName)} · ${esc(r.studentClass)}</span>
      <span>Hora exata: <b>${esc(fmt(r.submittedAt))}</b></span></div>`;
  }

  function formHtml() {
    return `<form id="econNerdForm" class="econ-nerd-form" novalidate>
      <div class="econ-nerd-row">
        <label>Nome *<input id="enFirst" maxlength="80" autocomplete="given-name" required></label>
        <label>Apelido *<input id="enLast" maxlength="80" autocomplete="family-name" required></label>
      </div>
      <div class="econ-nerd-row">
        <label>Turma *<input id="enClass" maxlength="30" placeholder="10.º B" required></label>
        <label>Email *<input id="enEmail" type="email" maxlength="140" autocomplete="email" required></label>
      </div>
      <label>A tua resposta *<textarea id="enAnswer" rows="4" maxlength="500" required></textarea></label>
      <p class="econ-nerd-msg" id="enMsg" role="status" aria-live="polite"></p>
      <button type="submit" class="w-btn w-btn-red w-btn-block" id="enSubmit"><i class="ri-flashlight-fill" aria-hidden="true"></i> Submeter resposta</button>
    </form>`;
  }

  async function onSubmit(e) {
    e.preventDefault();
    const v = (id) => String(document.getElementById(id)?.value || '').trim();
    const msg = document.getElementById('enMsg');
    const first = v('enFirst'), last = v('enLast'), cls = v('enClass').toUpperCase(), email = v('enEmail').toLowerCase(), answer = v('enAnswer');
    if (!first || !last || !cls || !answer || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      msg.textContent = 'Preenche todos os campos com um email válido.';
      return;
    }
    if (!current || !current.active) { msg.textContent = 'Este desafio já não está ativo.'; return; }
    const btn = document.getElementById('enSubmit');
    btn.disabled = true;
    try {
      const entry = window.db.addNerdSubmission({
        challengeId: current.id,
        challengeTitle: current.title || 'Nerd Alert de Economia',
        firstName: first, lastName: last, studentClass: cls, email, answer
      });
      if (entry && entry._writePromise) await entry._writePromise;
      setReceipt(current.id, { fullName: entry.fullName, studentClass: cls, submittedAt: entry.submittedAt });
      renderBody();
    } catch (err) {
      console.error(err);
      msg.textContent = 'Não foi possível enviar. Tenta novamente.';
      btn.disabled = false;
    }
  }

  function sync() {
    if (!window.db || typeof window.db.getActiveNerdChallenge !== 'function') return;
    const ch = window.db.getActiveNerdChallenge(PORTAL);
    const changed = (ch && ch.id) !== (current && current.id) || (ch && current && ch.updatedAt !== current.updatedAt);
    current = ch && ch.active ? ch : null;
    if (!current) {
      if (root) { togglePanel(false); root.style.display = 'none'; }
      removeNav();
      return;
    }
    ensureRoot().style.display = '';
    ensureNav();
    if (changed || !document.getElementById('econNerdTitle')) renderBody();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (window.db && typeof window.db.ready === 'function') await window.db.ready();
    sync();
    document.addEventListener('radio-db-updated', (e) => {
      if (!e.detail || e.detail.collection === 'nerdChallenges') sync();
    });
  });
})();
