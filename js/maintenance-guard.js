/* ==========================================================================
   RÁDIO ESCOLAR / WAVE RÁDIO — BLOQUEIO DE MANUTENÇÃO (SINCRONIZADO COM ADMIN)
   Pode ser ativado/desativado a qualquer momento no Painel de Administração
   (admin.html) via Cloud Firestore, ou desbloqueado localmente pelo administrador
   com a chave "OlhaAOnda1@".
   ========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'radio_maintenance_unlock_v1';
  var FORCE_LOCK_KEY = 'radio_maintenance_force_lock';
  var CLOUD_MAINT_KEY = 'radio_cloud_maintenance_active';
  var CLOUD_MAINT_MSG_KEY = 'radio_cloud_maintenance_msg';
  var UNLOCK_CODE = 'OlhaAOnda1@';
  var MAINTENANCE_ENABLED = false;
  var FIRESTORE_REST_URL = 'https://firestore.googleapis.com/v1/projects/cidadelafm/databases/(default)/documents/announcements/system_maintenance';

  // Permite desbloquear ou trancar rapidamente por URL (?unlock=OlhaAOnda1@ ou ?lock=1)
  try {
    var params = new URLSearchParams(window.location.search);
    var urlUnlock = params.get('unlock') || params.get('pass');
    if (urlUnlock === UNLOCK_CODE) {
      localStorage.setItem(STORAGE_KEY, UNLOCK_CODE);
      localStorage.removeItem(FORCE_LOCK_KEY);
      params.delete('unlock');
      params.delete('pass');
      var cleanSearch = params.toString();
      var newUrl = window.location.pathname + (cleanSearch ? '?' + cleanSearch : '') + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    } else if (params.get('lock') === '1') {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(FORCE_LOCK_KEY, '1');
      params.delete('lock');
      var lockSearch = params.toString();
      var lockUrl = window.location.pathname + (lockSearch ? '?' + lockSearch : '') + window.location.hash;
      window.history.replaceState({}, '', lockUrl);
    }
  } catch (e) {}

  function isMaintenanceActive() {
    try {
      return (
        MAINTENANCE_ENABLED ||
        localStorage.getItem(CLOUD_MAINT_KEY) === '1' ||
        localStorage.getItem(FORCE_LOCK_KEY) === '1'
      );
    } catch (e) {
      return MAINTENANCE_ENABLED;
    }
  }

  function isUnlocked() {
    if (!isMaintenanceActive()) return true;
    try {
      return localStorage.getItem(STORAGE_KEY) === UNLOCK_CODE;
    } catch (e) {
      return false;
    }
  }

  function isMaintenancePage(pathname) {
    var decoded = '';
    try {
      decoded = decodeURIComponent(pathname || '').toLowerCase();
    } catch (e) {
      decoded = String(pathname || '').toLowerCase();
    }
    return decoded.endsWith('/manutencao.html') || decoded.endsWith('manutencao.html');
  }

  function isExemptPath(pathname) {
    var decoded = '';
    try {
      decoded = decodeURIComponent(pathname || '').toLowerCase();
    } catch (e) {
      decoded = String(pathname || '').toLowerCase();
    }
    if (
      decoded.endsWith('/vote.html') ||
      decoded.endsWith('vote.html') ||
      decoded.endsWith('/manutencao.html') ||
      decoded.endsWith('manutencao.html') ||
      decoded.endsWith('/admin.html') ||
      decoded.endsWith('admin.html') ||
      decoded.endsWith('/admin-editor.html') ||
      decoded.endsWith('admin-editor.html')
    ) {
      return true;
    }
    return false;
  }

  function redirectToMaintenance() {
    var currentPath = window.location.pathname || '';
    if (isExemptPath(currentPath) || isUnlocked()) return;
    if (document.documentElement) {
      document.documentElement.style.visibility = 'hidden';
      document.documentElement.style.opacity = '0';
    }
    var fileName = currentPath.split('/').pop() || 'index.html';
    var target = fileName + (window.location.search || '') + (window.location.hash || '');
    window.location.replace('manutencao.html?redirect=' + encodeURIComponent(target));
  }

  function renderAdminUnlockedBadge() {
    var currentPath = window.location.pathname || '';
    var existing = document.getElementById('maintAdminBadge');
    if (!isMaintenanceActive() || isExemptPath(currentPath) || !isUnlocked()) {
      if (existing) existing.remove();
      return;
    }
    if (existing || !document.body) return;

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
      'background:rgba(40, 36, 37, 0.96)',
      'backdrop-filter:blur(10px)',
      'color:#f5f1f1',
      'border:2px solid #ff2a32',
      'box-shadow:4px 4px 0 #121011',
      'padding:7px 12px',
      'font-family:system-ui,-apple-system,sans-serif',
      'font-size:12px',
      'font-weight:700'
    ].join(';');

    badge.innerHTML =
      '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 8px #10b981;"></span>' +
      '<span>Manutenção Ativa (Desbloqueado p/ ti)</span>' +
      '<button type="button" id="maintRelockBtn" style="background:#e4232a;border:1px solid #f5f1f1;color:#fff;padding:3px 9px;font-size:11px;font-weight:700;cursor:pointer;">Trancar</button>';

    document.body.appendChild(badge);
    var btn = document.getElementById('maintRelockBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        window.RadioMaintenance.lock();
        window.location.replace('manutencao.html');
      });
    }
  }

  function applyCloudMaintenanceState(enabled, message) {
    try {
      localStorage.setItem(CLOUD_MAINT_KEY, enabled ? '1' : '0');
      if (typeof message === 'string') {
        localStorage.setItem(CLOUD_MAINT_MSG_KEY, message);
      }
      if (!enabled) {
        localStorage.removeItem(FORCE_LOCK_KEY);
      }
    } catch (e) {}

    var currentPath = window.location.pathname || '';
    if (enabled) {
      if (!isExemptPath(currentPath) && !isUnlocked()) {
        redirectToMaintenance();
      } else {
        renderAdminUnlockedBadge();
      }
    } else {
      var existing = document.getElementById('maintAdminBadge');
      if (existing) existing.remove();
    }
  }

  window.RadioMaintenance = {
    STORAGE_KEY: STORAGE_KEY,
    UNLOCK_CODE: UNLOCK_CODE,
    isMaintenanceActive: isMaintenanceActive,
    isUnlocked: isUnlocked,
    getCustomMessage: function () {
      try {
        return localStorage.getItem(CLOUD_MAINT_MSG_KEY) || '';
      } catch (e) {
        return '';
      }
    },
    unlock: function (code) {
      if (String(code || '').trim() === UNLOCK_CODE) {
        try {
          localStorage.setItem(STORAGE_KEY, UNLOCK_CODE);
          localStorage.removeItem(FORCE_LOCK_KEY);
        } catch (e) {}
        return true;
      }
      return false;
    },
    lock: function () {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem(FORCE_LOCK_KEY, '1');
      } catch (e) {}
    }
  };

  // 1. Verificação síncrona imediata com o estado em cache
  var currentPath = window.location.pathname || '';
  if (isMaintenanceActive() && !isExemptPath(currentPath) && !isUnlocked()) {
    redirectToMaintenance();
    return;
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderAdminUnlockedBadge();
  });

  // 2. Escutar atualizações em tempo real vindas do Firebase SDK (js/firebase-config.js)
  document.addEventListener('radio-maintenance-updated', function (e) {
    var detail = (e && e.detail) || {};
    applyCloudMaintenanceState(Boolean(detail.enabled), detail.message || '');
  });

  // 3. Verificação direta via REST API do Cloud Firestore (garante funcionamento imediato mesmo na 1.ª visita ou em manutencao.html)
  if (typeof window.fetch === 'function') {
    window.fetch(FIRESTORE_REST_URL, { cache: 'no-store' })
      .then(function (res) {
        if (res.status === 404) {
          applyCloudMaintenanceState(false, '');
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then(function (data) {
        if (!data || !data.fields) return;
        var enabled = Boolean(
          data.fields.maintenanceEnabled &&
          data.fields.maintenanceEnabled.booleanValue === true
        );
        var msg = (data.fields.maintenanceMessage && data.fields.maintenanceMessage.stringValue) || '';
        applyCloudMaintenanceState(enabled, msg);
        document.dispatchEvent(new CustomEvent('radio-maintenance-cloud-checked', {
          detail: { enabled: enabled, message: msg }
        }));
      })
      .catch(function () {});
  }
})();
