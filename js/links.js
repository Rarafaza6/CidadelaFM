/* ==========================================================================
   RÁDIO EBS CIDADELA - MÓDULO LINKTREE (LINKS RÁPIDOS)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  await window.db.ready();
  if (window.db.error) {
    window.showFirebaseError(document.getElementById('linktreeContainer'));
    return;
  }
  renderLinktree();
  document.getElementById('linkSearchInput')?.addEventListener('input', renderLinktree);
});

function renderLinktree() {
  const container = document.getElementById('linktreeContainer');
  if (!container) return;

  const query = (document.getElementById('linkSearchInput')?.value || '').trim().toLowerCase();
  const links = window.db.getLinks().filter(link => {
    if (link.active === false) return false;
    return !query || `${link.title} ${link.subtitle || ''} ${link.badge || ''}`.toLowerCase().includes(query);
  });

  if (links.length === 0) {
    container.innerHTML = '<div class="linktree-empty"><i class="ri-search-eye-line"></i><strong>Nada por aqui</strong><span>Tenta outra palavra ou envia uma dedicatória à rádio.</span></div>';
    return;
  }

  container.innerHTML = '';
  links.forEach(link => {
    const a = document.createElement('a');
    a.href = link.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'linktree-btn';

    const iconClass = link.icon || 'ri-external-link-line';

    a.innerHTML = `
      <div class="linktree-btn-content">
        <i class="${iconClass} linktree-btn-icon"></i>
        <div style="text-align: left;">
          <div>${escapeHtml(link.title)}</div>
          ${link.subtitle ? `<div style="font-size: 0.78rem; font-weight: 400; color: var(--text-muted);">${escapeHtml(link.subtitle)}</div>` : ''}
        </div>
      </div>
      <span class="linktree-btn-arrow">${link.badge ? escapeHtml(link.badge) : '<i class="ri-arrow-right-up-line"></i>'}</span>
    `;

    container.appendChild(a);
  });
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
