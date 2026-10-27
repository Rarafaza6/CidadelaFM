/* ==========================================================================
   WAVE RÁDIO — PÁGINA DA EQUIPA (equipa.html)
   Carrega os membros da equipa em tempo real a partir do Firestore (teamMembers),
   apresentando foto (ou avatar com iniciais), etiqueta de turma no canto inferior
   esquerdo da foto, nome, cargo e ligação opcional para rede social ao clicar no perfil.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  await window.db.ready();
  if (window.db.error) {
    window.showFirebaseError(document.getElementById('teamGrid'));
    return;
  }

  renderTeamPage();
});

document.addEventListener('radio-db-updated', (e) => {
  if (!e.detail || e.detail.collection === 'teamMembers') {
    renderTeamPage();
  }
});

function getMemberInitials(name) {
  const parts = String(name || 'Wave Rádio')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'WR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function normalizeSocialUrl(raw) {
  const val = String(raw || '').trim();
  if (!val) return '';
  if (/^https?:\/\//i.test(val)) return val;
  if (val.startsWith('@')) {
    return `https://www.instagram.com/${encodeURIComponent(val.slice(1))}`;
  }
  return `https://${val.replace(/^\/+/, '')}`;
}

function renderTeamPage() {
  const grid = document.getElementById('teamGrid');
  if (!grid || !window.db || typeof window.db.getTeamMembers !== 'function') return;

  const allMembers = window.db.getTeamMembers();

  if (allMembers.length === 0) {
    grid.innerHTML = `
      <div class="hv2-empty-state">
        <div class="hv2-empty-icon"><i class="ri-team-line"></i></div>
        <h3>A equipa está a ser atualizada</h3>
        <p>Os membros e respetivas fotografias estão a ser carregados pela coordenação da Wave Rádio.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = allMembers.map((member, index) => {
    const hasPhoto = Boolean(member.photo && String(member.photo).trim());
    const initials = getMemberInitials(member.name);
    const roleLabel = String(member.role || 'Equipa Wave Rádio').trim();
    const classTag = String(member.bio || member.studentClass || '').trim();
    const socialHref = member.socialEnabled ? normalizeSocialUrl(member.socialUrl) : '';
    const isClickable = Boolean(member.socialEnabled && socialHref);

    const innerHtml = `
      <div class="team-member-photo-wrap">
        ${hasPhoto ? `
          <img
            class="team-member-photo"
            src="${escapeHtml(member.photo)}"
            alt="${escapeHtml(member.name)}"
            loading="lazy"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
          >
          <div class="team-member-placeholder" style="display: none;" aria-hidden="true">
            <span class="team-member-initials">${escapeHtml(initials)}</span>
            <span class="team-member-placeholder-badge"><i class="ri-mic-2-fill"></i> Wave Rádio</span>
          </div>
        ` : `
          <div class="team-member-placeholder" aria-hidden="true">
            <span class="team-member-initials">${escapeHtml(initials)}</span>
            <span class="team-member-placeholder-badge"><i class="ri-mic-2-fill"></i> Wave Rádio</span>
          </div>
        `}
        ${classTag ? `<span class="team-member-role-badge">${escapeHtml(classTag)}</span>` : ''}
      </div>
      <div class="team-member-body">
        <h3 class="team-member-name">${escapeHtml(member.name)}</h3>
        <p class="team-member-role-line">${escapeHtml(roleLabel)}</p>
      </div>
    `;

    if (isClickable) {
      return `
        <a
          class="card-box team-member-card is-social-link"
          href="${escapeHtml(socialHref)}"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ver rede social de ${escapeHtml(member.name)}"
          style="animation-delay: ${Math.min(index * 55, 350)}ms"
        >
          ${innerHtml}
        </a>
      `;
    }

    return `
      <article class="card-box team-member-card" style="animation-delay: ${Math.min(index * 55, 350)}ms">
        ${innerHtml}
      </article>
    `;
  }).join('');
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
