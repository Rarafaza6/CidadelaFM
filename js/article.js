document.addEventListener('DOMContentLoaded', async () => {
  await window.db.ready();
  if (window.db.error) {
    window.showFirebaseError(document.getElementById('articleContent'));
    return;
  }
  renderArticle();
});

function renderArticle() {
  const target = document.getElementById('articleContent');
  const id = new URLSearchParams(window.location.search).get('id');
  const publicArticles = window.db.getPublicAnnouncements();
  const article = id ? publicArticles.find(item => item.id === id || item.slug === id) || null : null;

  if (!article) {
    target.innerHTML = '<div class="empty-state"><i class="ri-file-warning-line"></i><h1>Artigo não encontrado</h1><p>Este artigo pode ter sido removido ou o endereço está incompleto.</p><a class="btn-submit-main" href="noticias.html">Ver todas as notícias</a></div>';
    return;
  }

  document.title = `${article.title} | Rádio Escolar`;
  const related = publicArticles.filter(item => item.id !== article.id).slice(0, 3);
  const canonicalUrl = window.location.href;
  const safeContent = article.content || `<p>${escapeHtml(article.excerpt || '')}</p>`;

  target.innerHTML = `
    <header class="article-header">
      <span class="article-category-badge"><i class="ri-price-tag-3-line"></i> ${escapeHtml(article.category || article.tag || 'Notícia')}</span>
      <h1 class="article-main-title">${escapeHtml(article.title)}</h1>
      <p class="article-lead-paragraph">${escapeHtml(article.excerpt || '')}</p>
      <div class="article-meta-row">
        <div class="article-author-box"><span class="article-author-avatar"><i class="ri-user-3-line"></i></span><span><strong>${escapeHtml(article.author || 'Redação Rádio Cidadela')}</strong><br><small>${escapeHtml(article.date || '')}</small></span></div>
        <span><i class="ri-time-line"></i> ${escapeHtml(article.readTime || '2 min de leitura')}</span>
      </div>
    </header>
    <figure class="article-cover-wrapper"><img class="article-cover-img" src="${escapeHtml(article.image)}" alt="${escapeHtml(article.title)}"></figure>
    <article class="article-body-text">${safeContent}</article>
    <section class="article-share-panel"><strong>Partilha este artigo</strong><div class="share-buttons-group"><button class="btn-share" type="button" onclick="copyArticleLink()"><i class="ri-link"></i> Copiar ligação</button><a class="btn-share whatsapp" href="https://wa.me/?text=${encodeURIComponent(article.title + ' ' + canonicalUrl)}" target="_blank" rel="noopener"><i class="ri-whatsapp-line"></i> WhatsApp</a><button class="btn-share" type="button" onclick="window.print()"><i class="ri-printer-line"></i> Imprimir</button></div></section>
    ${related.length ? `<section class="related-articles"><div class="home-section-title"><h2><i class="ri-compass-3-line" style="color:var(--primary-blue)"></i> Artigos relacionados</h2></div><div class="home-grid-3">${related.map(renderRelatedCard).join('')}</div></section>` : ''}
  `;
}

function renderRelatedCard(article) {
  return `<a class="card-box related-article-card" href="artigo.html?id=${encodeURIComponent(article.id)}"><img src="${escapeHtml(article.image)}" alt="" loading="lazy"><div><span class="news-card-category">${escapeHtml(article.category || article.tag || 'Notícia')}</span><h3>${escapeHtml(article.title)}</h3><small><i class="ri-time-line"></i> ${escapeHtml(article.readTime || '2 min de leitura')}</small></div></a>`;
}

window.copyArticleLink = function() {
  navigator.clipboard.writeText(window.location.href).then(() => alert('Ligação copiada para a área de transferência.')).catch(() => alert('Copia a ligação diretamente da barra do navegador.'));
};

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
