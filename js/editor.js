/* ==========================================================================
   RÁDIO EBS CIDADELA — ESTÚDIO EDITORIAL DE ARTIGOS (ADMIN-EDITOR.HTML)
   Editor rico com alojamento gratuito de fotografias PNG/JPG em Base64
   ========================================================================== */

let currentArticleId = null;
let savedRange = null;
let selectedInlineFigure = null;
let autoSaveTimer = null;
const DEFAULT_COVER_IMAGE = 'assets/logo-radio.jpg';

document.addEventListener('DOMContentLoaded', async () => {
  await window.db.ready();
  await initEditorAuth();
  initEditorEvents();
  loadArticleFromQuery();
  checkLocalDraftAvailability();
  updateStats();
});

/* ==========================================================================
   AUTENTICAÇÃO E SESSÃO FIREBASE
   ========================================================================== */
async function initEditorAuth() {
  const auth = window.firebaseServices && window.firebaseServices.auth;
  const modal = document.getElementById('editorAuthModal');
  if (!auth) return;

  try {
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
  } catch (_) {}

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      if (modal) modal.classList.add('active');
      return;
    }
    if (modal) modal.classList.remove('active');
    try {
      await window.db.loadPrivateCollections();
    } catch (_) {}
  });
}

window.handleEditorLogin = async function (event) {
  event.preventDefault();
  const auth = window.firebaseServices && window.firebaseServices.auth;
  const email = document.getElementById('editorAuthEmail')?.value?.trim() || '';
  const pass = document.getElementById('editorAuthPassword')?.value || '';
  const alertEl = document.getElementById('editorAuthAlert');
  const btn = document.getElementById('editorLoginBtn');

  if (!auth || !email || !pass) return;
  if (btn) btn.disabled = true;
  if (alertEl) alertEl.innerHTML = '<span style="color: var(--text-muted);"><i class="ri-loader-4-line ri-spin"></i> A autenticar...</span>';

  try {
    await auth.signInWithEmailAndPassword(email, pass);
    if (alertEl) alertEl.innerHTML = '';
    showEditorToast('Sessão iniciada com sucesso.', 'success');
  } catch (err) {
    if (alertEl) {
      alertEl.innerHTML = '<span style="color: #f87171;"><i class="ri-error-warning-line"></i> Email ou palavra-passe incorretos.</span>';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
};

/* ==========================================================================
   INICIALIZAÇÃO DE EVENTOS, DRAG-AND-DROP E PASTE BASE64
   ========================================================================== */
function initEditorEvents() {
  const body = document.getElementById('articleBody');
  const coverDropzone = document.getElementById('coverDropzone');
  const paperSheet = document.getElementById('editorPaperSheet');

  // Inicializar data de hoje por defeito
  const todayIso = new Date().toISOString().slice(0, 10);
  const datePicker = document.getElementById('articleDatePicker');
  const dateInput = document.getElementById('articleDate');
  const broadcastInput = document.getElementById('articleBroadcastDate');
  if (datePicker && !datePicker.value) datePicker.value = todayIso;
  if (broadcastInput && !broadcastInput.value) broadcastInput.value = todayIso;
  if (dateInput && !dateInput.value) {
    dateInput.value = formatPortugueseDate(todayIso);
  }

  if (body) {
    body.addEventListener('input', () => {
      updateStats();
      scheduleLocalDraftSave();
    });

    body.addEventListener('keyup', () => {
      saveEditorSelection();
      updateActiveToolbarButtons();
    });

    body.addEventListener('mouseup', () => {
      saveEditorSelection();
      updateActiveToolbarButtons();
    });

    // Clique em imagens dentro do corpo para mostrar barra de redimensionamento/legenda
    body.addEventListener('click', (e) => {
      const img = e.target.closest('img');
      if (img && body.contains(img)) {
        selectInlineImage(img);
      } else if (!e.target.closest('#inlineImageToolbar')) {
        deselectInlineImage();
      }
    });

    // Colar imagens (Ctrl+V de print ou imagem copiada) -> Base64 automático
    body.addEventListener('paste', async (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      const imageFiles = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        saveEditorSelection();
        await handleInlineImageFiles(imageFiles);
      }
    });

    // Arrastar e largar fotos diretamente no corpo do artigo
    body.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (paperSheet) paperSheet.classList.add('is-dragover');
    });

    body.addEventListener('dragleave', () => {
      if (paperSheet) paperSheet.classList.remove('is-dragover');
    });

    body.addEventListener('drop', async (e) => {
      if (paperSheet) paperSheet.classList.remove('is-dragover');
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        const imgFiles = Array.from(files).filter(f => f.type && f.type.startsWith('image/'));
        if (imgFiles.length > 0) {
          e.preventDefault();
          saveEditorSelection();
          await handleInlineImageFiles(imgFiles);
        }
      }
    });
  }

  // Drag & Drop na zona de capa
  if (coverDropzone) {
    coverDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      coverDropzone.classList.add('is-dragover');
    });
    coverDropzone.addEventListener('dragleave', () => {
      coverDropzone.classList.remove('is-dragover');
    });
    coverDropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      coverDropzone.classList.remove('is-dragover');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) {
        await handleCoverFileUpload(file);
      }
    });
  }

  // Atalhos de teclado globais no editor
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveLocalDraftExplicit();
    } else if (ctrl && e.key.toLowerCase() === 'k') {
      if (document.activeElement === body) {
        e.preventDefault();
        openLinkModal();
      }
    } else if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(m => {
        if (m.id !== 'editorAuthModal') m.classList.remove('active');
      });
      deselectInlineImage();
    }
  });
}

/* ==========================================================================
   CARREGAMENTO DE ARTIGO EXISTENTE OU RASCUNHO
   ========================================================================== */
function loadArticleFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const briefDate = params.get('brief');

  const body = document.getElementById('articleBody');

  if (!id && briefDate) {
    const eventItem = window.db.getCalendarEvents().find(item => item.date === briefDate && item.source === 'editorial')
      || window.db.getCalendarEvents().find(item => item.date === briefDate);
    document.getElementById('editorModeBadge').innerText = 'Aviso para Emissão';
    document.getElementById('articleVisibility').value = 'internal';
    document.getElementById('articleBroadcastDate').value = briefDate;
    toggleBroadcastDateVisibility();
    document.getElementById('articleTitle').value = eventItem ? `${eventItem.title} — Nota de Antena` : `Guião de Emissão (${briefDate})`;
    document.getElementById('articleCategory').value = 'Comunicado';
    document.getElementById('articleExcerpt').value = eventItem?.notes || 'Tópicos breves para leitura em antena.';
    body.innerHTML = `<p><strong>Data da emissão:</strong> ${escapeHtml(briefDate)}</p><h2>Pontos para ler em antena</h2><ul><li>${escapeHtml(eventItem?.title || 'Efeméride ou destaque do dia')}</li><li>${escapeHtml(eventItem?.notes || 'Contextualizar em 2 a 3 frases claras para a comunidade escolar.')}</li></ul><p><em>Fecho sugerido:</em> Continuamos ligados na Wave Rádio da EBS Cidadela.</p>`;
    onEditorMetaInput();
    updateExcerptCounter();
    updateStats();
    return;
  }

  if (!id) {
    body.innerHTML = '<p>Escreve aqui o desenvolvimento da notícia. Podes usar os botões acima para formatar títulos, listas, destaques e carregar fotografias PNG ou JPG diretamente do computador.</p>';
    onEditorMetaInput();
    updateExcerptCounter();
    return;
  }

  const article = window.db.getAnnouncementById(id);
  if (!article) {
    body.innerHTML = '<p>Artigo não encontrado. Podes escrever um novo artigo abaixo.</p>';
    return;
  }

  currentArticleId = article.id;
  document.getElementById('editorModeBadge').innerText = 'A Editar Artigo';
  const pubLabel = document.getElementById('publishArticleBtnLabel');
  if (pubLabel) pubLabel.innerText = 'Guardar Alterações';

  document.getElementById('articleTitle').value = article.title || '';

  const catSelect = document.getElementById('articleCategory');
  const catValue = article.category || article.tag || 'Notícia';
  if (catSelect) {
    if (!Array.from(catSelect.options).some(opt => opt.value === catValue)) {
      const customOpt = document.createElement('option');
      customOpt.value = catValue;
      customOpt.textContent = catValue;
      catSelect.appendChild(customOpt);
    }
    catSelect.value = catValue;
  }

  document.getElementById('articleAuthor').value = article.author || 'Equipa da Rádio • EBS Cidadela';
  document.getElementById('articleDate').value = article.date || formatPortugueseDate(new Date().toISOString().slice(0, 10));
  document.getElementById('articleImage').value = article.image || '';
  document.getElementById('articleExcerpt').value = article.excerpt || '';
  document.getElementById('articleFeatured').checked = Boolean(article.featured);

  const isInternal = article.visibility === 'internal' || article.onAir === true || Boolean(article.broadcastDate);
  document.getElementById('articleVisibility').value = isInternal ? 'internal' : 'public';
  document.getElementById('articleBroadcastDate').value = article.broadcastDate || new Date().toISOString().slice(0, 10);
  if (document.getElementById('articleSpeaker')) document.getElementById('articleSpeaker').value = article.speaker || '';
  if (document.getElementById('articleCue') && article.cue) document.getElementById('articleCue').value = article.cue;

  toggleBroadcastDateVisibility();
  let loadedCover = (article.image || '').trim();
  let loadedContent = article.content || `<p>${escapeHtml(article.excerpt || '')}</p>`;
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = loadedContent;
  const firstBodyImg = tempDiv.querySelector('img');
  if (firstBodyImg) {
    const firstSrc = (firstBodyImg.getAttribute('src') || '').trim();
    if (!loadedCover && firstSrc) {
      loadedCover = firstSrc;
      const wrap = firstBodyImg.closest('figure') || firstBodyImg;
      wrap.remove();
      loadedContent = tempDiv.innerHTML;
    } else if (firstSrc && firstSrc === loadedCover) {
      const wrap = firstBodyImg.closest('figure') || firstBodyImg;
      wrap.remove();
      loadedContent = tempDiv.innerHTML;
    }
  }
  document.getElementById('articleImage').value = loadedCover;
  body.innerHTML = loadedContent;
  updateCoverPreview(loadedCover || DEFAULT_COVER_IMAGE);
  onEditorMetaInput();
  updateExcerptCounter();
  updateStats();
}

/* ==========================================================================
   UPLOAD DE CAPA (PNG / JPG PARA BASE64 GRATUITO)
   ========================================================================== */
window.handleCoverFileUpload = async function (file) {
  if (!file) return;
  const statusEl = document.getElementById('saveStatusText');
  if (statusEl) {
    statusEl.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> A converter foto de capa para Base64...';
  }

  try {
    const result = await window.imageFileToBase64(file, {
      maxWidth: 1200,
      maxHeight: 900,
      quality: 0.84,
      maxBase64Chars: 330000
    });

    const imageInput = document.getElementById('articleImage');
    if (imageInput) imageInput.value = result.dataUrl;
    updateCoverPreview(result.dataUrl, result.sizeKB);
    scheduleLocalDraftSave();
    updateStats();
    showEditorToast(`Foto de capa convertida para Base64 (${result.sizeKB} KB).`, 'success');
  } catch (err) {
    showEditorToast(err.message || 'Erro ao processar a imagem de capa.', 'error');
  } finally {
    if (statusEl) {
      statusEl.innerHTML = '<i class="ri-checkbox-circle-line"></i> Capa atualizada';
    }
  }
};

window.updateCoverPreview = function (url, sizeKB = null) {
  const preview = document.getElementById('coverPreview');
  const sheetCoverImg = document.getElementById('sheetCoverImg');
  const badge = document.getElementById('coverSizeBadge');
  const clean = String(url || '').trim();

  if (preview) {
    preview.src = clean || DEFAULT_COVER_IMAGE;
  }
  if (sheetCoverImg) {
    sheetCoverImg.src = clean || DEFAULT_COVER_IMAGE;
  }

  document.querySelectorAll('.word-preset-thumb').forEach(thumb => {
    thumb.classList.toggle('active', thumb.getAttribute('src') === (clean || DEFAULT_COVER_IMAGE));
  });

  if (badge) {
    if (clean.startsWith('data:image/')) {
      const kb = sizeKB || Math.max(1, Math.round((clean.length * 0.75) / 1024));
      badge.textContent = `Base64 • ${kb} KB`;
      badge.style.background = 'rgba(16, 185, 129, 0.25)';
      badge.style.color = '#6ee7b7';
    } else if (clean && clean !== DEFAULT_COVER_IMAGE) {
      badge.textContent = 'URL Personalizado';
      badge.style.background = 'rgba(56, 189, 248, 0.25)';
      badge.style.color = '#7dd3fc';
    } else {
      badge.textContent = 'Capa padrão';
      badge.style.background = 'rgba(15, 23, 42, 0.75)';
      badge.style.color = '#cbd5e1';
    }
  }
  updateStats();
};

window.selectPresetCover = function (src, thumbEl) {
  const input = document.getElementById('articleImage');
  if (input) input.value = src;
  document.querySelectorAll('.word-preset-thumb').forEach(t => t.classList.remove('active'));
  if (thumbEl) thumbEl.classList.add('active');
  updateCoverPreview(src);
  scheduleLocalDraftSave();
};

window.clearCoverImage = function () {
  const input = document.getElementById('articleImage');
  const fileInput = document.getElementById('coverFileInput');
  if (input) input.value = '';
  if (fileInput) fileInput.value = '';
  updateCoverPreview('');
  scheduleLocalDraftSave();
};

/* ==========================================================================
   UPLOAD DE FOTOGRAFIAS INLINE NO TEXTO (PNG / JPG PARA BASE64)
   ========================================================================== */
window.triggerInlineImageUpload = function () {
  saveEditorSelection();
  const input = document.getElementById('inlineImageFileInput');
  if (input) {
    input.value = '';
    input.click();
  }
};

window.handleInlineImageFiles = async function (fileList) {
  if (!fileList || fileList.length === 0) return;
  const files = Array.from(fileList);
  const statusEl = document.getElementById('saveStatusText');
  const currentCover = (document.getElementById('articleImage')?.value || '').trim();
  const presetCovers = [DEFAULT_COVER_IMAGE, 'assets/brand/og-image.jpg', 'assets/logo-cidadela.png'];
  let startIdx = 0;

  // Se ainda não há capa personalizada, a primeira foto carregada vai diretamente para a Capa (acima de tudo)
  if (!currentCover || presetCovers.includes(currentCover)) {
    await window.handleCoverFileUpload(files[0]);
    startIdx = 1;
  }

  for (let i = startIdx; i < files.length; i++) {
    const file = files[i];
    if (statusEl) {
      statusEl.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> A converter imagem ${i + 1}/${files.length} para Base64...`;
    }
    try {
      const result = await window.imageFileToBase64(file, {
        maxWidth: 980,
        maxHeight: 980,
        quality: 0.82,
        maxBase64Chars: 260000
      });
      insertFigureHtml(result.dataUrl, file.name.replace(/\.[^.]+$/, ''), '');
      showEditorToast(`Fotografia inserida no artigo (${result.sizeKB} KB em Base64).`, 'success');
    } catch (err) {
      showEditorToast(err.message || 'Não foi possível carregar a fotografia.', 'error');
    }
  }

  if (statusEl && startIdx < files.length) {
    statusEl.innerHTML = '<i class="ri-checkbox-circle-line"></i> Fotografia inserida';
  }
  updateStats();
  scheduleLocalDraftSave();
};

function insertFigureHtml(src, altText = 'Fotografia do artigo', captionText = '') {
  const body = document.getElementById('articleBody');
  if (!body) return;
  restoreEditorSelection();

  const figureHtml = `
    <figure class="article-figure" data-size="100%" data-align="center">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(altText || 'Fotografia do artigo')}">
      <figcaption contenteditable="true" data-placeholder="Escreve uma legenda opcional para esta foto...">${escapeHtml(captionText)}</figcaption>
    </figure>
    <p><br></p>
  `;

  insertHtmlAtCursor(figureHtml);
  updateStats();
  scheduleLocalDraftSave();
}

/* Controlo de Imagem Selecionada dentro do Artigo */
function selectInlineImage(imgEl) {
  deselectInlineImage();
  const figure = imgEl.closest('figure') || imgEl;
  selectedInlineFigure = figure;
  imgEl.classList.add('is-selected-inline-img');
  const toolbar = document.getElementById('inlineImageToolbar');
  if (toolbar) toolbar.style.display = 'flex';
}

function deselectInlineImage() {
  document.querySelectorAll('#articleBody img.is-selected-inline-img').forEach(el => {
    el.classList.remove('is-selected-inline-img');
  });
  selectedInlineFigure = null;
  const toolbar = document.getElementById('inlineImageToolbar');
  if (toolbar) toolbar.style.display = 'none';
}

window.resizeSelectedInlineImage = function (widthPct) {
  if (!selectedInlineFigure) return;
  selectedInlineFigure.setAttribute('data-size', widthPct);
  selectedInlineFigure.style.maxWidth = widthPct;
  const img = selectedInlineFigure.tagName === 'IMG' ? selectedInlineFigure : selectedInlineFigure.querySelector('img');
  if (img && selectedInlineFigure.tagName === 'IMG') {
    img.style.maxWidth = widthPct;
  }
  scheduleLocalDraftSave();
};

window.alignSelectedInlineImage = function (alignment) {
  if (!selectedInlineFigure) return;
  selectedInlineFigure.setAttribute('data-align', alignment);
  if (alignment === 'left') {
    selectedInlineFigure.style.marginLeft = '0';
    selectedInlineFigure.style.marginRight = 'auto';
  } else if (alignment === 'right') {
    selectedInlineFigure.style.marginLeft = 'auto';
    selectedInlineFigure.style.marginRight = '0';
  } else {
    selectedInlineFigure.style.marginLeft = 'auto';
    selectedInlineFigure.style.marginRight = 'auto';
  }
  scheduleLocalDraftSave();
};

window.editSelectedInlineImageCaption = function () {
  if (!selectedInlineFigure) return;
  let figcaption = selectedInlineFigure.tagName === 'FIGURE' ? selectedInlineFigure.querySelector('figcaption') : null;
  if (!figcaption && selectedInlineFigure.tagName === 'IMG') {
    const wrapper = document.createElement('figure');
    wrapper.className = 'article-figure';
    selectedInlineFigure.parentNode.insertBefore(wrapper, selectedInlineFigure);
    wrapper.appendChild(selectedInlineFigure);
    figcaption = document.createElement('figcaption');
    figcaption.contentEditable = 'true';
    wrapper.appendChild(figcaption);
    selectedInlineFigure = wrapper;
  }
  if (figcaption) {
    figcaption.focus();
  }
};

window.removeSelectedInlineImage = function () {
  if (!selectedInlineFigure) return;
  selectedInlineFigure.remove();
  deselectInlineImage();
  updateStats();
  scheduleLocalDraftSave();
  showEditorToast('Fotografia removida do artigo.', 'info');
};

/* ==========================================================================
   COMANDOS DE FORMATAÇÃO E ELEMENTOS RICOS
   ========================================================================== */
function saveEditorSelection() {
  const sel = window.getSelection();
  const body = document.getElementById('articleBody');
  if (sel && sel.rangeCount > 0 && body && body.contains(sel.anchorNode)) {
    savedRange = sel.getRangeAt(0).cloneRange();
  }
}

function restoreEditorSelection() {
  const body = document.getElementById('articleBody');
  if (!body) return;
  body.focus();
  if (savedRange) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }
}

function insertHtmlAtCursor(html) {
  const body = document.getElementById('articleBody');
  if (!body) return;
  restoreEditorSelection();
  if (document.queryCommandSupported && document.queryCommandSupported('insertHTML')) {
    document.execCommand('insertHTML', false, html);
  } else {
    body.insertAdjacentHTML('beforeend', html);
  }
  saveEditorSelection();
}

window.execCmd = function (command, value = null) {
  restoreEditorSelection();
  document.execCommand(command, false, value);
  saveEditorSelection();
  updateActiveToolbarButtons();
  updateStats();
  scheduleLocalDraftSave();
};

window.formatBlock = function (tag) {
  execCmd('formatBlock', `<${tag}>`);
};

window.toggleHighlight = function () {
  restoreEditorSelection();
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) {
    showEditorToast('Seleciona primeiro o texto que queres realçar.', 'info');
    return;
  }
  const text = sel.toString();
  document.execCommand('insertHTML', false, `<mark class="article-highlight">${escapeHtml(text)}</mark>`);
  updateStats();
  scheduleLocalDraftSave();
};

window.clearFormatting = function () {
  restoreEditorSelection();
  document.execCommand('removeFormat', false, null);
  document.execCommand('formatBlock', false, '<p>');
  updateStats();
  scheduleLocalDraftSave();
};

window.insertChecklist = function () {
  const html = `
    <ul class="article-checklist">
      <li>Ponto a verificar 1</li>
      <li>Ponto a verificar 2</li>
    </ul>
    <p><br></p>
  `;
  insertHtmlAtCursor(html);
  updateStats();
  scheduleLocalDraftSave();
};

window.insertDivider = function () {
  insertHtmlAtCursor('<hr class="article-divider"><p><br></p>');
  updateStats();
  scheduleLocalDraftSave();
};

function updateActiveToolbarButtons() {
  ['bold', 'italic', 'underline', 'strikeThrough'].forEach(cmd => {
    const btn = document.querySelector(`.word-tool-btn[data-cmd="${cmd}"]`);
    if (btn) {
      try {
        btn.classList.toggle('active', document.queryCommandState(cmd));
      } catch (_) {}
    }
  });
}

/* ==========================================================================
   MODAIS DE INSERÇÃO (LINK, IMAGEM URL, CALLOUT, TABELA, EMBED)
   ========================================================================== */
window.openEditorModal = function (id) {
  saveEditorSelection();
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('active');
    setTimeout(() => {
      const firstInput = modal.querySelector('input:not([type="hidden"]), textarea, select');
      if (firstInput) firstInput.focus();
    }, 60);
  }
};

window.closeEditorModal = function (id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
};

window.openLinkModal = function () {
  saveEditorSelection();
  const sel = window.getSelection();
  const selectedText = sel ? sel.toString().trim() : '';
  document.getElementById('linkModalText').value = selectedText;
  document.getElementById('linkModalUrl').value = '';
  openEditorModal('editorLinkModal');
};

window.confirmInsertLink = function (e) {
  e.preventDefault();
  const text = document.getElementById('linkModalText').value.trim();
  const url = document.getElementById('linkModalUrl').value.trim();
  if (!url) return;
  closeEditorModal('editorLinkModal');
  const label = text || url;
  insertHtmlAtCursor(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a> `);
  updateStats();
  scheduleLocalDraftSave();
};

window.openImageUrlModal = function () {
  document.getElementById('imageModalUrl').value = '';
  document.getElementById('imageModalCaption').value = '';
  openEditorModal('editorImageUrlModal');
};

window.confirmInsertImageUrl = function (e) {
  e.preventDefault();
  const url = document.getElementById('imageModalUrl').value.trim();
  const caption = document.getElementById('imageModalCaption').value.trim();
  if (!url) return;
  closeEditorModal('editorImageUrlModal');
  insertFigureHtml(url, caption || 'Fotografia do artigo', caption);
};

window.openCalloutModal = function () {
  document.getElementById('calloutModalTitle').value = 'Em Destaque';
  document.getElementById('calloutModalBody').value = '';
  openEditorModal('editorCalloutModal');
};

window.confirmInsertCallout = function (e) {
  e.preventDefault();
  const type = document.getElementById('calloutModalType').value || 'wave';
  const title = document.getElementById('calloutModalTitle').value.trim() || 'Em Destaque';
  const body = document.getElementById('calloutModalBody').value.trim();
  if (!body) return;
  closeEditorModal('editorCalloutModal');

  const html = `
    <aside class="article-callout callout-${escapeHtml(type)}">
      <strong class="article-callout-title">${escapeHtml(title)}</strong>
      <p>${escapeHtml(body)}</p>
    </aside>
    <p><br></p>
  `;
  insertHtmlAtCursor(html);
  updateStats();
  scheduleLocalDraftSave();
};

window.openTableModal = function () {
  openEditorModal('editorTableModal');
};

window.confirmInsertTable = function (e) {
  e.preventDefault();
  const rows = Math.min(20, Math.max(2, parseInt(document.getElementById('tableModalRows').value, 10) || 3));
  const cols = Math.min(8, Math.max(2, parseInt(document.getElementById('tableModalCols').value, 10) || 3));
  closeEditorModal('editorTableModal');

  let thead = '<thead><tr>';
  for (let c = 1; c <= cols; c++) {
    thead += `<th>Coluna ${c}</th>`;
  }
  thead += '</tr></thead>';

  let tbody = '<tbody>';
  for (let r = 1; r < rows; r++) {
    tbody += '<tr>';
    for (let c = 1; c <= cols; c++) {
      tbody += '<td>Dado</td>';
    }
    tbody += '</tr>';
  }
  tbody += '</tbody>';

  insertHtmlAtCursor(`<table class="article-table">${thead}${tbody}</table><p><br></p>`);
  updateStats();
  scheduleLocalDraftSave();
};

window.openEmbedModal = function () {
  document.getElementById('embedModalUrl').value = '';
  openEditorModal('editorEmbedModal');
};

window.confirmInsertEmbed = function (e) {
  e.preventDefault();
  const rawUrl = document.getElementById('embedModalUrl').value.trim();
  if (!rawUrl) return;
  closeEditorModal('editorEmbedModal');

  let embedHtml = '';
  // YouTube
  const ytMatch = rawUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  // Spotify
  const spMatch = rawUrl.match(/open\.spotify\.com\/(track|episode|playlist|show|album)\/([a-zA-Z0-9]+)/);

  if (ytMatch) {
    const videoId = ytMatch[1];
    embedHtml = `
      <div class="article-embed-wrapper" contenteditable="false">
        <iframe src="https://www.youtube.com/embed/${videoId}" title="Vídeo YouTube" style="width:100%; aspect-ratio:16/9; border:0;" allowfullscreen loading="lazy"></iframe>
      </div>
      <p><br></p>
    `;
  } else if (spMatch) {
    const type = spMatch[1];
    const id = spMatch[2];
    embedHtml = `
      <div class="article-embed-wrapper" contenteditable="false">
        <iframe src="https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0" width="100%" height="152" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
      </div>
      <p><br></p>
    `;
  } else {
    embedHtml = `<p><a href="${escapeHtml(rawUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(rawUrl)}</a></p>`;
  }

  insertHtmlAtCursor(embedHtml);
  updateStats();
  scheduleLocalDraftSave();
};

/* ==========================================================================
   METADADOS, RESUMO AUTOMÁTICO E ESTATÍSTICAS
   ========================================================================== */
function formatPortugueseDate(isoDateStr) {
  try {
    const [y, m, d] = isoDateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch (_) {
    return new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
  }
}

window.onArticleDatePickerChange = function (isoVal) {
  if (!isoVal) return;
  const dateInput = document.getElementById('articleDate');
  if (dateInput) {
    dateInput.value = formatPortugueseDate(isoVal);
  }
  onEditorMetaInput();
};

window.onEditorMetaInput = function () {
  const cat = document.getElementById('articleCategory')?.value || 'Notícia';
  const dateStr = document.getElementById('articleDate')?.value || 'Hoje';
  const catPill = document.getElementById('sheetCategoryPill');
  const datePill = document.getElementById('sheetDatePill');
  if (catPill) catPill.innerHTML = `<i class="ri-price-tag-3-line"></i> ${escapeHtml(cat)}`;
  if (datePill) datePill.innerHTML = `<i class="ri-calendar-line"></i> ${escapeHtml(dateStr)}`;
  scheduleLocalDraftSave();
};

window.toggleBroadcastDateVisibility = function () {
  const visibility = document.getElementById('articleVisibility')?.value || 'public';
  const group = document.getElementById('broadcastDateGroup');
  if (group) {
    group.style.display = visibility === 'internal' ? 'flex' : 'none';
  }
  scheduleLocalDraftSave();
};

window.updateExcerptCounter = function () {
  const excerpt = document.getElementById('articleExcerpt')?.value || '';
  const counter = document.getElementById('excerptCharCount');
  if (counter) {
    counter.textContent = `${excerpt.length} / 260`;
  }
};

window.generateExcerptFromBody = function () {
  const body = document.getElementById('articleBody');
  const excerptEl = document.getElementById('articleExcerpt');
  if (!body || !excerptEl) return;

  const plain = (body.innerText || '').replace(/\s+/g, ' ').trim();
  if (!plain) {
    showEditorToast('Escreve primeiro o corpo do artigo para gerar o resumo.', 'warning');
    return;
  }

  excerptEl.value = plain.length > 210 ? `${plain.slice(0, 207)}...` : plain;
  updateExcerptCounter();
  scheduleLocalDraftSave();
  showEditorToast('Resumo gerado automaticamente a partir do texto.', 'success');
};

function updateStats() {
  const body = document.getElementById('articleBody');
  const text = (body?.innerText || '').trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const minutes = Math.max(1, Math.ceil(words / 180));
  const imagesCount = body ? body.querySelectorAll('img').length : 0;

  const htmlContent = body?.innerHTML || '';
  const coverImage = document.getElementById('articleImage')?.value || '';
  const totalBytes = new Blob([htmlContent, coverImage]).size;
  const totalKB = Math.max(1, Math.round(totalBytes / 1024));
  const maxKB = 900;
  const pct = Math.min(100, Math.round((totalKB / maxKB) * 100));

  const wordDisplay = document.getElementById('wordCountDisplay');
  const readDisplay = document.getElementById('readTimeDisplay');
  if (wordDisplay) wordDisplay.innerText = `${words} palavras • ${text.length} caracteres`;
  if (readDisplay) readDisplay.innerText = `Tempo estimado: ${minutes} min de leitura`;

  const sideWords = document.getElementById('sideStatWords');
  const sideRead = document.getElementById('sideStatReadTime');
  const sideImgs = document.getElementById('sideStatImages');
  const sideSize = document.getElementById('sideStatSize');
  const quotaFill = document.getElementById('sideStatQuotaFill');

  if (sideWords) sideWords.textContent = String(words);
  if (sideRead) sideRead.textContent = `${minutes} min`;
  if (sideImgs) sideImgs.textContent = String(imagesCount);
  if (sideSize) sideSize.textContent = `${totalKB} KB / ${maxKB} KB`;
  if (quotaFill) {
    quotaFill.style.width = `${pct}%`;
    quotaFill.style.background = pct > 85 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#10b981';
  }
}

/* ==========================================================================
   AUTO-SAVE DE RASCUNHO LOCAL & RECUPERAÇÃO
   ========================================================================== */
function getDraftStorageKey() {
  return currentArticleId ? `wave_editor_draft_${currentArticleId}` : 'wave_editor_draft_new';
}

function scheduleLocalDraftSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveLocalDraft(false);
  }, 1200);
}

function saveLocalDraft(showToastNotification = false) {
  try {
    const draft = collectEditorPayload();
    draft.savedAt = Date.now();
    localStorage.setItem(getDraftStorageKey(), JSON.stringify(draft));
    const statusEl = document.getElementById('saveStatusText');
    const timeStr = new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    if (statusEl) {
      statusEl.innerHTML = `<i class="ri-check-double-line" style="color:#34d399;"></i> Rascunho guardado às ${timeStr}`;
    }
    if (showToastNotification) {
      showEditorToast('Rascunho guardado localmente neste navegador.', 'success');
    }
  } catch (err) {
    console.warn('Não foi possível guardar rascunho local:', err);
  }
}

window.saveLocalDraftExplicit = function () {
  saveLocalDraft(true);
};

function checkLocalDraftAvailability() {
  try {
    const raw = localStorage.getItem(getDraftStorageKey());
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (draft && (draft.title || draft.content)) {
      const btn = document.getElementById('restoreDraftBtn');
      if (btn) btn.style.display = 'inline-flex';
    }
  } catch (_) {}
}

window.restoreLocalDraft = function () {
  try {
    const raw = localStorage.getItem(getDraftStorageKey());
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (!draft) return;

    document.getElementById('articleTitle').value = draft.title || '';
    document.getElementById('articleCategory').value = draft.category || 'Notícia';
    document.getElementById('articleAuthor').value = draft.author || 'Equipa da Rádio • EBS Cidadela';
    document.getElementById('articleDate').value = draft.date || formatPortugueseDate(new Date().toISOString().slice(0, 10));
    document.getElementById('articleImage').value = draft.image || '';
    document.getElementById('articleExcerpt').value = draft.excerpt || '';
    document.getElementById('articleVisibility').value = draft.visibility || 'public';
    document.getElementById('articleBroadcastDate').value = draft.broadcastDate || '';
    document.getElementById('articleFeatured').checked = Boolean(draft.featured);
    document.getElementById('articleBody').innerHTML = draft.content || '<p></p>';

    toggleBroadcastDateVisibility();
    updateCoverPreview(draft.image || '');
    onEditorMetaInput();
    updateExcerptCounter();
    updateStats();
    showEditorToast('Rascunho recuperado com sucesso!', 'success');
  } catch (_) {
    showEditorToast('Não foi possível recuperar o rascunho.', 'error');
  }
};

/* ==========================================================================
   PRÉ-VISUALIZAÇÃO COMPLETA E PUBLICAÇÃO ASSÍNCRONA
   ========================================================================== */
function collectEditorPayload() {
  deselectInlineImage();
  const title = document.getElementById('articleTitle')?.value?.trim() || '';
  const category = document.getElementById('articleCategory')?.value || 'Notícia';
  const author = document.getElementById('articleAuthor')?.value?.trim() || 'Equipa da Rádio • EBS Cidadela';
  const dateStr = document.getElementById('articleDate')?.value?.trim() || formatPortugueseDate(new Date().toISOString().slice(0, 10));
  let image = document.getElementById('articleImage')?.value?.trim() || '';
  let content = document.getElementById('articleBody')?.innerHTML?.trim() || '';

  // Se não foi escolhida capa dedicada mas há uma foto no corpo, promover a foto a capa acima do texto
  if (!image || image === DEFAULT_COVER_IMAGE) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const firstImg = tempDiv.querySelector('img');
    if (firstImg) {
      const firstSrc = (firstImg.getAttribute('src') || '').trim();
      if (firstSrc) {
        image = firstSrc;
        const fig = firstImg.closest('figure');
        if (fig) fig.remove();
        else firstImg.remove();
        content = tempDiv.innerHTML.trim();
      }
    }
  }
  if (!image) image = DEFAULT_COVER_IMAGE;

  const plainText = (document.getElementById('articleBody')?.innerText || '').trim();
  const excerptInput = document.getElementById('articleExcerpt')?.value?.trim() || '';
  const excerpt = excerptInput || (plainText.length > 160 ? `${plainText.slice(0, 157)}...` : plainText);
  const visibility = document.getElementById('articleVisibility')?.value || 'public';
  const broadcastDate = visibility === 'internal'
    ? (document.getElementById('articleBroadcastDate')?.value || new Date().toISOString().slice(0, 10))
    : '';
  const speaker = document.getElementById('articleSpeaker')?.value?.trim() || '';
  const cue = document.getElementById('articleCue')?.value || '';
  const featured = Boolean(document.getElementById('articleFeatured')?.checked);
  const words = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;
  const readTime = `${Math.max(1, Math.ceil(words / 180))} min de leitura`;

  return {
    id: currentArticleId || undefined,
    title,
    category,
    tag: category,
    author,
    date: dateStr,
    image,
    excerpt,
    content,
    readTime,
    visibility,
    onAir: visibility === 'internal',
    broadcastDate,
    speaker,
    cue,
    featured
  };
}

window.openPreviewModal = function () {
  const data = collectEditorPayload();
  const container = document.getElementById('articlePreviewContainer');
  if (!container) return;

  const excerptInput = document.getElementById('articleExcerpt')?.value?.trim() || '';

  container.innerHTML = `
    <div style="max-width: 780px; margin: 0 auto; font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;">
      <figure style="margin: 0 0 1.75rem; border: 2px solid #282425; box-shadow: 5px 5px 0 #282425; background: #282425;">
        <img src="${escapeHtml(data.image)}" alt="" style="width: 100%; max-height: 440px; object-fit: cover; display: block;">
      </figure>
      <span style="display: inline-flex; align-items: center; gap: 0.4rem; background: #c91820; color: #f4efea; padding: 0.35rem 0.85rem; font-family: monospace; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 1rem;">
        <i class="ri-price-tag-3-line"></i> ${escapeHtml(data.category)}
      </span>
      <h1 style="font-size: clamp(2.1rem, 4vw, 3.2rem); line-height: 1.05; color: #282425; margin: 0 0 1rem; font-weight: 800;">
        ${escapeHtml(data.title || 'Título do Artigo Sem Nome')}
      </h1>
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.85rem 0; border-top: 2px solid #282425; border-bottom: 2px solid #282425; font-size: 0.8rem; text-transform: uppercase; margin-bottom: 1.75rem;">
        <div><strong>${escapeHtml(data.author)}</strong> • <span>${escapeHtml(data.date)}</span></div>
        <span><i class="ri-time-line"></i> ${escapeHtml(data.readTime)}</span>
      </div>
      ${excerptInput ? `<p style="font-size: 1.12rem; line-height: 1.55; color: #3f3a3b; border-left: 5px solid #e4232a; padding-left: 1rem; margin-bottom: 1.5rem;">${escapeHtml(excerptInput)}</p>` : ''}
      <div class="article-body-preview-content" style="font-size: 1.05rem; line-height: 1.8; color: #282425;">
        ${data.content || '<p>Sem conteúdo.</p>'}
      </div>
    </div>
  `;

  openEditorModal('articlePreviewModal');
};

window.resetEditor = function () {
  if (!confirm('Tens a certeza de que queres limpar todos os campos do editor?')) return;
  document.getElementById('articleTitle').value = '';
  document.getElementById('articleExcerpt').value = '';
  document.getElementById('articleImage').value = '';
  document.getElementById('articleVisibility').value = 'public';
  document.getElementById('articleFeatured').checked = false;
  toggleBroadcastDateVisibility();
  document.getElementById('articleBody').innerHTML = '<p>Começa a escrever o teu artigo...</p>';
  updateCoverPreview('');
  updateExcerptCounter();
  updateStats();
};

window.publishArticle = async function () {
  const auth = window.firebaseServices && window.firebaseServices.auth;
  if (auth && !auth.currentUser) {
    const modal = document.getElementById('editorAuthModal');
    if (modal) modal.classList.add('active');
    showEditorToast('Inicia sessão para poderes publicar o artigo.', 'warning');
    return;
  }

  const data = collectEditorPayload();
  const plainText = (document.getElementById('articleBody')?.innerText || '').trim();

  if (!data.title || !plainText) {
    showEditorToast('Preenche o título e o corpo do artigo antes de publicar.', 'warning');
    return;
  }

  // Verificar tamanho total para garantir que cabe no limite de 1 MiB do Firestore
  const totalBytes = new Blob([JSON.stringify(data)]).size;
  if (totalBytes > 980000) {
    showEditorToast('O artigo tem demasiadas fotografias pesadas. Remove uma foto para ficar abaixo de 950 KB.', 'error');
    return;
  }

  const btn = document.getElementById('publishArticleBtn');
  const statusEl = document.getElementById('saveStatusText');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> A guardar na Cloud...';
  }
  if (statusEl) {
    statusEl.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> A sincronizar com a base de dados...';
  }

  try {
    let saved = null;
    if (typeof window.db.saveAnnouncementAsync === 'function') {
      saved = await window.db.saveAnnouncementAsync(data);
    } else {
      saved = currentArticleId
        ? window.db.updateAnnouncement(currentArticleId, data)
        : window.db.addAnnouncement(data);
      if (saved && saved._writePromise) {
        await saved._writePromise;
      }
    }

    // Limpar rascunho local após publicação bem-sucedida
    try {
      localStorage.removeItem(getDraftStorageKey());
    } catch (_) {}

    showEditorToast('Artigo guardado e publicado com sucesso!', 'success');

    setTimeout(() => {
      if (data.visibility === 'internal') {
        window.location.href = 'admin.html';
      } else {
        window.location.href = `artigo.html?id=${encodeURIComponent(saved.id)}`;
      }
    }, 350);
  } catch (err) {
    console.error('Erro ao publicar artigo:', err);
    showEditorToast('Erro ao guardar na base de dados: ' + (err.message || 'Verifica a tua sessão.'), 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ri-send-plane-fill"></i> <span id="publishArticleBtnLabel">Guardar e Publicar</span>';
    }
    if (statusEl) {
      statusEl.innerHTML = '<i class="ri-error-warning-line" style="color:#f87171;"></i> Falha ao sincronizar';
    }
  }
};

/* ==========================================================================
   NOTIFICAÇÕES TOAST & UTILITÁRIOS
   ========================================================================== */
function showEditorToast(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  const icons = {
    success: 'ri-checkbox-circle-fill',
    error: 'ri-error-warning-fill',
    warning: 'ri-alert-fill',
    info: 'ri-information-fill'
  };
  toast.innerHTML = `
    <div class="toast-icon"><i class="${icons[type] || icons.info}"></i></div>
    <div class="toast-body">
      <span>${escapeHtml(message)}</span>
    </div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-hiding');
    setTimeout(() => toast.remove(), 260);
  }, 3600);
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
