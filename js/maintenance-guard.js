/* ==========================================================================
   RÁDIO ESCOLAR / RÁDIO WAVE — BLOQUEIO DE MANUTENÇÃO (POR DISPOSITIVO)
   Tranca todo o site exceto as páginas de votação.
   Desbloqueia apenas no navegador atual quando é introduzido o código "OlhaAOnda1@".
   ========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'radio_maintenance_unlock_v1';
  var UNLOCK_CODE = 'OlhaAOnda1@';

  // Permite desbloquear ou trancar rapidamente por URL (?unlock=OlhaAOnda1@ ou ?lock=1)
  try {
    var params = new URLSearchParams(window.location.search);
    var urlUnlock = params.get('unlock') || params.get('pass');
    if (urlUnlock === UNLOCK_CODE) {
      localStorage.setItem(STORAGE_KEY, UNLOCK_CODE);
      params.delete('unlock');
      params.delete('pass');
      var cleanSearch = params.toString();
      var newUrl = window.location.pathname + (cleanSearch ? '?' + cleanSearch : '') + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    } else if (params.get('lock') === '1') {
      localStorage.removeItem(STORAGE_KEY);
      params.delete('lock');
      var lockSearch = params.toString();
      var lockUrl = window.location.pathname + (lockSearch ? '?' + lockSearch : '') + window.location.hash;
      window.history.replaceState({}, '', lockUrl);
    }
  } catch (e) {}

  function isUnlocked() {
    try {
      return localStorage.getItem(STORAGE_KEY) === UNLOCK_CODE;
    } catch (e) {
      return false;
    }
  }

  function isExemptPath(pathname) {
    var decoded = '';
    try {
      decoded = decodeURIComponent(pathname || '').toLowerCase();
    } catch (e) {
      decoded = String(pathname || '').toLowerCase();
    }
    if (
      decoded.indexOf('/votação/') !== -1 ||
      decoded.indexOf('/votacao/') !== -1 ||
      decoded.endsWith('/voto.html') ||
      decoded.endsWith('voto.html') ||
      decoded.endsWith('/vote.html') ||
      decoded.endsWith('vote.html') ||
      decoded.endsWith('/manutencao.html') ||
      decoded.endsWith('manutencao.html') ||
      decoded.endsWith('/manutenção.html') ||
      decoded.endsWith('manutenção.html')
    ) {
      return true;
    }
    return false;
  }

  window.RadioMaintenance = {
    STORAGE_KEY: STORAGE_KEY,
    UNLOCK_CODE: UNLOCK_CODE,
    isUnlocked: isUnlocked,
    unlock: function (code) {
      if (String(code || '').trim() === UNLOCK_CODE) {
        try {
          localStorage.setItem(STORAGE_KEY, UNLOCK_CODE);
        } catch (e) {}
        return true;
      }
      return false;
    },
    lock: function () {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
    }
  };

  var currentPath = window.location.pathname || '';
  if (!isExemptPath(currentPath) && !isUnlocked()) {
    // Esconde imediatamente o documento para evitar qualquer flash antes do redirecionamento
    if (document.documentElement) {
      document.documentElement.style.visibility = 'hidden';
      document.documentElement.style.opacity = '0';
    }
    var fileName = currentPath.split('/').pop() || 'index.html';
    var target = fileName + (window.location.search || '') + (window.location.hash || '');
    window.location.replace('manutencao.html?redirect=' + encodeURIComponent(target));
    return;
  }

  // Se o utilizador desbloqueou o site, mostra um pequeno indicador discreto para poder voltar a trancar quando quiser
  if (!isExemptPath(currentPath) && isUnlocked()) {
    document.addEventListener('DOMContentLoaded', function () {
      if (document.getElementById('maintAdminBadge')) return;
      var badge = document.createElement('div');
      badge.id = 'maintAdminBadge';
      badge.style.cssText = [
        'position:fixed',
        'bottom:16px',
        'left:16px',
        'z-index:99999',
        'display:flex',
        'align-items:center',
        'gap:8px',
        'background:rgba(11, 41, 82, 0.92)',
        'backdrop-filter:blur(10px)',
        'color:#ffffff',
        'border:1px solid rgba(24, 145, 225, 0.45)',
        'border-radius:999px',
        'padding:6px 12px',
        'font-family:system-ui,-apple-system,sans-serif',
        'font-size:12px',
        'font-weight:600',
        'box-shadow:0 8px 24px rgba(0,0,0,0.35)'
      ].join(';');

      badge.innerHTML =
        '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 8px #10b981;"></span>' +
        '<span>Desbloqueado (Só para ti)</span>' +
        '<button type="button" id="maintRelockBtn" style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);color:#fff;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:700;cursor:pointer;transition:background 0.2s;">Trancar</button>';

      document.body.appendChild(badge);
      var btn = document.getElementById('maintRelockBtn');
      if (btn) {
        btn.addEventListener('click', function () {
          window.RadioMaintenance.lock();
          window.location.replace('manutencao.html');
        });
      }
    });
  }
})();
