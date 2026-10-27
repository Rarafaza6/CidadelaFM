document.addEventListener('DOMContentLoaded', async () => {
  await window.db.ready();
  if (window.db.error) {
    window.showFirebaseError(document.getElementById('articleContent'));
    return;
  }
  renderArticle();
});

document.addEventListener('radio-db-updated', (e) => {
  if (!e.detail || e.detail.collection === 'announcements') {
    renderArticle();
  }
});

function renderArticle() {
  const target = document.getElementById('articleContent');
  const id = new URLSearchParams(window.location.search).get('id');
  const publicArticles = window.db.getPublicAnnouncements();
  const article = id ? publicArticles.find(item => item.id === id || item.slug === id) || null : null;

  if (!article) {
    target.innerHTML = `
      <div class="hv2-empty-state" style="padding: 4rem 1.5rem;">
        <div class="hv2-empty-icon"><i class="ri-file-warning-line"></i></div>
        <h2>Artigo não encontrado</h2>
        <p>Este artigo pode ter sido removido ou o endereço está incompleto.</p>
        <div style="margin-top: 1.5rem;">
          <a class="hv2-btn-primary" href="noticias.html" style="display: inline-flex;"><i class="ri-newspaper-line"></i> Ver todas as notícias</a>
        </div>
      </div>
    `;
    return;
  }

  document.title = `${article.title} | Wave Rádio`;
  const related = publicArticles.filter(item => item.id !== article.id).slice(0, 3);
  const canonicalUrl = window.location.href;
  const rawContent = article.content || `<p>${escapeHtml(article.excerpt || '')}</p>`;
  let safeContent = String(rawContent)
    .replace(/\scontenteditable="true"/gi, '')
    .replace(/\sis-selected-inline-img/gi, '');

  let coverImg = (article.image || '').trim();

  // Garantir que a capa aparece sempre acima de tudo e é exatamente a mesma da listagem de notícias
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = safeContent;
  const bodyImgs = Array.from(tempDiv.querySelectorAll('img'));
  if (bodyImgs.length > 0) {
    const firstBodyImg = bodyImgs[0];
    const firstSrc = (firstBodyImg.getAttribute('src') || '').trim();
    if (!coverImg && firstSrc) {
      coverImg = firstSrc;
    }
    // Remover imagens do arranque/desenvolvimento para que a capa fique apenas no topo
    bodyImgs.forEach((img, idx) => {
      const src = (img.getAttribute('src') || '').trim();
      const firstElem = tempDiv.firstElementChild;
      const isLeadingImg = idx === 0 && firstElem && (firstElem === img || firstElem.contains(img));
      if (idx === 0 || src === coverImg || isLeadingImg) {
        const wrap = img.closest('figure') || (img.parentElement && img.parentElement.tagName === 'P' && img.parentElement.textContent.trim() === '' ? img.parentElement : img);
        wrap.remove();
      }
    });
    safeContent = tempDiv.innerHTML;
  }
  if (!coverImg) coverImg = 'assets/logo-radio.jpg';

  // Evitar repetir o início do desenvolvimento caso o resumo tenha sido gerado automaticamente a partir do corpo
  const plainBody = (tempDiv.textContent || '').replace(/\s+/g, ' ').trim();
  const rawExcerpt = String(article.excerpt || '').replace(/\s+/g, ' ').trim();
  const cleanExcerptPrefix = rawExcerpt.replace(/\.{3}$/, '').trim();
  const showLead = Boolean(
    rawExcerpt &&
    cleanExcerptPrefix &&
    !plainBody.toLowerCase().startsWith(cleanExcerptPrefix.toLowerCase())
  );

  target.innerHTML = `
    <figure class="article-cover-wrapper"><img class="article-cover-img" src="${escapeHtml(coverImg)}" alt="${escapeHtml(article.title)}" onerror="this.onerror=null;this.src='assets/logo-radio.jpg';"></figure>
    <header class="article-header">
      <span class="article-category-badge"><i class="ri-price-tag-3-line"></i> ${escapeHtml(article.category || article.tag || 'Notícia')}</span>
      <h1 class="article-main-title">${escapeHtml(article.title)}</h1>
      <div class="article-meta-row">
        <div class="article-author-box"><span class="article-author-avatar"><i class="ri-user-3-line"></i></span><span><strong>${escapeHtml(article.author || 'Redação Rádio Cidadela')}</strong><br><small>${escapeHtml(article.date || '')}</small></span></div>
        <span><i class="ri-time-line"></i> ${escapeHtml(article.readTime || '2 min de leitura')}</span>
      </div>
    </header>
    ${showLead ? `<p class="article-lead-paragraph">${escapeHtml(article.excerpt)}</p>` : ''}
    <article class="article-body-text">${safeContent}</article>
    <section class="article-share-panel"><strong>Partilha este artigo</strong><div class="share-buttons-group"><button class="btn-share" type="button" onclick="copyArticleLink(this)"><i class="ri-link"></i> Copiar ligação</button><a class="btn-share whatsapp" href="https://wa.me/?text=${encodeURIComponent(article.title + ' ' + canonicalUrl)}" target="_blank" rel="noopener"><i class="ri-whatsapp-line"></i> WhatsApp</a><button class="btn-share" type="button" onclick="window.print()"><i class="ri-printer-line"></i> Imprimir</button></div></section>
    ${related.length ? `<section class="related-articles"><div class="home-section-title"><h2><i class="ri-compass-3-line" style="color:var(--red)"></i> Artigos relacionados</h2></div><div class="home-grid-3">${related.map(renderRelatedCard).join('')}</div></section>` : ''}
  `;
}

function renderRelatedCard(article) {
  const coverImg = article.image || 'assets/logo-radio.jpg';
  return `<a class="card-box related-article-card" href="artigo.html?id=${encodeURIComponent(article.id)}"><img src="${escapeHtml(coverImg)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='assets/logo-radio.jpg';"><div><span class="news-card-category">${escapeHtml(article.category || article.tag || 'Notícia')}</span><h3>${escapeHtml(article.title)}</h3><small><i class="ri-time-line"></i> ${escapeHtml(article.readTime || '2 min de leitura')}</small></div></a>`;
}

window.copyArticleLink = function(btnEl) {
  var btn = btnEl || document.querySelector('.article-share-panel .btn-share');
  navigator.clipboard.writeText(window.location.href).then(function() {
    if (btn) {
      var orig = btn.innerHTML;
      btn.innerHTML = '<i class="ri-check-line"></i> Ligação copiada!';
      setTimeout(function() { btn.innerHTML = orig; }, 2200);
    }
  }).catch(function() {});
};

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
