/* ==========================================================================
   WAVE DOCS — ESTÚDIO EDITORIAL PROFISSIONAL (ADMIN-EDITOR.HTML)
   Editor rico com fiabilidade empresarial: IndexedDB + LocalStorage +
   Snapshots Automáticos + Slash Menu ("/") + Atalhos Markdown + Outline Vivo
   ========================================================================== */

let currentArticleId = null;
let savedRange = null;
let selectedInlineFigure = null;
let activeTableCell = null;
let autoSaveTimer = null;
let snapshotTimer = null;
let isEditorDirty = false;
let isReplacingInlineImage = false;
let slashMenuState = { active: false, query: '', index: 0, anchorNode: null, anchorOffset: 0 };

const DEFAULT_COVER_IMAGE = 'assets/logo-radio.jpg';
const IDB_NAME = 'WaveDocsStorageDB';
const IDB_STORE = 'drafts_and_snapshots';

/* ==========================================================================
   CAMADA DE PERSISTÊNCIA INDEXEDDB + LOCALSTORAGE (À PROVA DE FALHAS)
   ========================================================================== */
function openWaveDocsIDB() {
  return new Promise((resolve) => {
    if (!window.indexedDB) {
      resolve(null);
      return;
    }
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

async function idbSet(key, value) {
  const db = await openWaveDocsIDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (_) {
      resolve(false);
    }
  });
}

async function idbGet(key) {
  const db = await openWaveDocsIDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

async function idbRemove(key) {
  const db = await openWaveDocsIDB();
  if (!db) return;
  try {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
  } catch (_) {}
}

function setSyncStatus(state, message) {
  const el = document.getElementById('saveStatusText');
  if (!el) return;
  el.className = `wdoc-sync-pill is-${state}`;
  const icons = {
    saved: 'ri-checkbox-circle-line',
    saving: 'ri-loader-4-line ri-spin',
    dirty: 'ri-edit-circle-line',
    offline: 'ri-cloud-off-line'
  };
  el.innerHTML = `<i class="${icons[state] || icons.saved}"></i> <span>${message}</span>`;
}

function markEditorDirty() {
  isEditorDirty = true;
  setSyncStatus('dirty', 'Alterações em curso...');
}

/* ==========================================================================
   SANITIZAÇÃO AVANÇADA DE HTML (WORD / GOOGLE DOCS / WEB)
   ========================================================================== */
function cleanPastedHtml(rawHtml) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    doc.querySelectorAll('script, style, meta, link, noscript, iframe, object, embed, svg').forEach(el => el.remove());

    const allowedTags = new Set([
      'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'STRONG', 'B', 'EM', 'I', 'U', 'S',
      'BLOCKQUOTE', 'UL', 'OL', 'LI', 'A', 'IMG', 'FIGURE', 'FIGCAPTION',
      'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'HR', 'BR', 'MARK', 'ASIDE', 'DIV'
    ]);

    const allowedClasses = new Set([
      'article-figure', 'article-callout', 'callout-wave', 'callout-info',
      'callout-warning', 'callout-tip', 'article-callout-title', 'article-table',
      'article-highlight', 'article-divider', 'article-checklist',
      'article-qa-block', 'article-qa-question', 'article-qa-answer'
    ]);

    const walk = (node) => {
      const children = Array.from(node.childNodes);
      for (const child of children) {
        if (child.nodeType === 8) {
          child.remove();
          continue;
        }
        if (child.nodeType === 1) {
          // Converter H1 colado em H2 para preservar hierarquia da página
          if (child.tagName === 'H1') {
            const h2 = doc.createElement('h2');
            h2.innerHTML = child.innerHTML;
            child.replaceWith(h2);
            walk(h2);
            continue;
          }

          // Preservar negrito/itálico vindo de spans do Google Docs
          if (child.tagName === 'SPAN') {
            const st = child.getAttribute('style') || '';
            const isBold = /font-weight:\s*(bold|700|800|900)/i.test(st);
            const isItalic = /font-style:\s*italic/i.test(st);
            let replacement = child;
            if (isBold) {
              const strong = doc.createElement('strong');
              strong.innerHTML = child.innerHTML;
              child.replaceWith(strong);
              replacement = strong;
            } else if (isItalic) {
              const em = doc.createElement('em');
              em.innerHTML = child.innerHTML;
              child.replaceWith(em);
              replacement = em;
            }
            if (replacement !== child) {
              walk(replacement);
              continue;
            }
          }

          if (!allowedTags.has(child.tagName)) {
            walk(child);
            const frag = doc.createDocumentFragment();
            while (child.firstChild) frag.appendChild(child.firstChild);
            child.replaceWith(frag);
            continue;
          }

          if (child.tagName === 'DIV' && !child.classList.contains('article-qa-block')) {
            const p = doc.createElement('p');
            p.innerHTML = child.innerHTML;
            child.replaceWith(p);
            walk(p);
            continue;
          }

          // Limpar atributos perigosos ou estilos inline de Word/Docs
          const keptClasses = Array.from(child.classList).filter(c => allowedClasses.has(c));
          Array.from(child.attributes).forEach(attr => {
            const name = attr.name.toLowerCase();
            if (name === 'href' && child.tagName === 'A') return;
            if ((name === 'src' || name === 'alt') && child.tagName === 'IMG') return;
            if ((name === 'data-size' || name === 'data-align') && child.tagName === 'FIGURE') return;
            child.removeAttribute(attr.name);
          });
          if (keptClasses.length) child.className = keptClasses.join(' ');

          if (child.tagName === 'A') {
            const href = (child.getAttribute('href') || '').trim();
            if (href && !/^javascript:/i.test(href) && !/^data:/i.test(href)) {
              child.setAttribute('target', '_blank');
              child.setAttribute('rel', 'noopener noreferrer');
            } else {
              child.replaceWith(...child.childNodes);
              continue;
            }
          }

          walk(child);
        }
      }
    };

    walk(doc.body);
    return doc.body.innerHTML;
  } catch (_) {
    return rawHtml;
  }
}

/* ==========================================================================
   ARRANQUE DO WAVE DOCS
   ========================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  initNetworkWatcher();
  await window.db.ready();
  await initEditorAuth();
  initEditorEvents();
  await loadArticleFromQuery();
  await checkLocalDraftAvailability();
  updateStats();
  renderDocumentOutline();
  updateEditorialQualityChecklist();
});

function initNetworkWatcher() {
  const updateNet = () => {
    const connEl = document.getElementById('connectionStatusDisplay');
    if (navigator.onLine) {
      if (connEl) {
        connEl.style.color = '#34d399';
        connEl.innerHTML = '<i class="ri-wifi-line"></i> Ligado à Cloud + Proteção Local Ativa';
      }
      if (!isEditorDirty) setSyncStatus('saved', 'Pronto a editar');
    } else {
      if (connEl) {
        connEl.style.color = '#fbbf24';
        connEl.innerHTML = '<i class="ri-cloud-off-line"></i> Modo Offline (Rascunhos protegidos no dispositivo)';
      }
      setSyncStatus('offline', 'Offline • Guardado localmente');
    }
  };
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);
  updateNet();
}

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
    showEditorToast('Sessão iniciada com sucesso no Wave Docs.', 'success');
  } catch (_) {
    if (alertEl) {
      alertEl.innerHTML = '<span style="color: #f87171;"><i class="ri-error-warning-line"></i> Email ou palavra-passe incorretos.</span>';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
};

/* ==========================================================================
   EVENTOS DO EDITOR, MARKDOWN AUTO-FORMAT, SLASH MENU E COLAGEM
   ========================================================================== */
function initEditorEvents() {
  const body = document.getElementById('articleBody');
  const coverDropzone = document.getElementById('coverDropzone');
  const sheetCoverFigure = document.getElementById('sheetCoverFigure');
  const paperSheet = document.getElementById('editorPaperSheet');

  const todayIso = new Date().toISOString().slice(0, 10);
  const datePicker = document.getElementById('articleDatePicker');
  const dateInput = document.getElementById('articleDate');
  const broadcastInput = document.getElementById('articleBroadcastDate');
  if (datePicker && !datePicker.value) datePicker.value = todayIso;
  if (broadcastInput && !broadcastInput.value) broadcastInput.value = todayIso;
  if (dateInput && !dateInput.value) dateInput.value = formatPortugueseDate(todayIso);

  try {
    document.execCommand('defaultParagraphSeparator', false, 'p');
  } catch (_) {}

  if (body) {
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === body) {
        saveEditorSelection();
        updateActiveToolbarButtons();
        updateFloatingFormatBar();
        detectActiveTableContext();
      } else {
        hideFloatingFormatBar();
      }
    });

    body.addEventListener('input', () => {
      markEditorDirty();
      handleSlashCommandInput();
      updateStats();
      renderDocumentOutline();
      updateEditorialQualityChecklist();
      scheduleLocalDraftSave();
    });

    body.addEventListener('keyup', (e) => {
      saveEditorSelection();
      updateActiveToolbarButtons();
      if (e.key === ' ' || e.key === 'Enter') {
        tryMarkdownShortcutOnCurrentLine(e.key);
      }
    });

    body.addEventListener('mouseup', () => {
      saveEditorSelection();
      updateActiveToolbarButtons();
      setTimeout(updateFloatingFormatBar, 20);
    });

    body.addEventListener('keydown', (e) => {
      // Navegação no Slash Menu ("/")
      if (slashMenuState.active) {
        const items = getFilteredSlashCommands();
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          slashMenuState.index = (slashMenuState.index + 1) % Math.max(1, items.length);
          renderSlashCommandMenu();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          slashMenuState.index = (slashMenuState.index - 1 + Math.max(1, items.length)) % Math.max(1, items.length);
          renderSlashCommandMenu();
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          if (items[slashMenuState.index]) {
            e.preventDefault();
            executeSlashCommand(items[slashMenuState.index]);
            return;
          }
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeSlashCommandMenu();
          return;
        }
      }

      // Navegação Tab dentro de tabelas ou listas
      if (e.key === 'Tab') {
        const sel = window.getSelection();
        const node = sel?.anchorNode?.nodeType === 1 ? sel.anchorNode : sel?.anchorNode?.parentElement;
        const td = node?.closest('td, th');
        if (td) {
          e.preventDefault();
          const cells = Array.from(td.closest('table').querySelectorAll('th, td'));
          const idx = cells.indexOf(td);
          const next = cells[e.shiftKey ? idx - 1 : idx + 1];
          if (next) {
            const range = document.createRange();
            range.selectNodeContents(next);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          } else if (!e.shiftKey) {
            activeTableCell = td;
            tableAction('addRowAfter');
          }
          return;
        }

        const li = node?.closest('li');
        if (li) {
          e.preventDefault();
          document.execCommand(e.shiftKey ? 'outdent' : 'indent', false, null);
          saveEditorSelection();
          updateStats();
          scheduleLocalDraftSave();
          return;
        }
      }
    });

    // Clique em imagens ou tabelas
    body.addEventListener('click', (e) => {
      const img = e.target.closest('img');
      if (img && body.contains(img)) {
        selectInlineImage(img);
      } else if (!e.target.closest('#inlineImageToolbar')) {
        deselectInlineImage();
      }
      detectActiveTableContext();
    });

    // Colagem inteligente (Paste): imagens Base64 + links YouTube/Spotify + limpeza HTML
    body.addEventListener('paste', async (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (items) {
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
          return;
        }
      }

      const rawHtml = e.clipboardData?.getData('text/html');
      const plainText = (e.clipboardData?.getData('text/plain') || '').trim();

      // Auto-embed ao colar link isolado de YouTube ou Spotify
      if (plainText && /^https?:\/\/\S+$/i.test(plainText)) {
        const ytMatch = plainText.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
        const spMatch = plainText.match(/open\.spotify\.com\/(track|episode|playlist|show|album)\/([a-zA-Z0-9]+)/);
        if (ytMatch || spMatch) {
          e.preventDefault();
          insertEmbedByUrl(plainText);
          return;
        }
      }

      if (rawHtml) {
        e.preventDefault();
        const cleaned = cleanPastedHtml(rawHtml);
        insertHtmlAtCursor(cleaned);
        markEditorDirty();
        updateStats();
        renderDocumentOutline();
        scheduleLocalDraftSave();
      } else if (plainText && plainText.includes('\n\n')) {
        e.preventDefault();
        const paras = plainText
          .split(/\r?\n\s*\r?\n/)
          .map(p => p.trim())
          .filter(Boolean)
          .map(p => `<p>${escapeHtml(p).replace(/\r?\n/g, '<br>')}</p>`)
          .join('');
        insertHtmlAtCursor(paras);
        markEditorDirty();
        updateStats();
        renderDocumentOutline();
        scheduleLocalDraftSave();
      }
    });

    // Arrastar e largar fotos no corpo do artigo
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

  // Drag & Drop na zona de capa (sidebar e banner de topo)
  [coverDropzone, sheetCoverFigure].filter(Boolean).forEach(zone => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('is-dragover');
    });
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('is-dragover');
    });
    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('is-dragover');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) await handleCoverFileUpload(file);
    });
  });

  // Atalhos de teclado globais
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
    } else if (ctrl && e.key.toLowerCase() === 'f') {
      if (document.activeElement === body) {
        e.preventDefault();
        toggleFindReplaceBar(true);
      }
    } else if (ctrl && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      openPreviewModal();
    } else if (e.key === 'Escape') {
      closeSlashCommandMenu();
      hideFloatingFormatBar();
      document.querySelectorAll('.modal-overlay.active').forEach(m => {
        if (m.id !== 'editorAuthModal') m.classList.remove('active');
      });
      deselectInlineImage();
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (isEditorDirty) {
      saveLocalDraft(false);
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

/* ==========================================================================
   ATALHOS MARKDOWN EM TEMPO REAL (##, ###, >, -, 1., ---)
   ========================================================================== */
function tryMarkdownShortcutOnCurrentLine(triggerKey) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const node = sel.anchorNode;
  if (!node || node.nodeType !== 3) return;
  const block = node.parentElement?.closest('p, div');
  if (!block) return;

  const text = (block.textContent || '').replace(/\u00a0/g, ' ');
  if (triggerKey === ' ') {
    if (text === '## ') {
      block.textContent = '';
      formatBlock('h2');
    } else if (text === '### ') {
      block.textContent = '';
      formatBlock('h3');
    } else if (text === '#### ') {
      block.textContent = '';
      formatBlock('h4');
    } else if (text === '> ') {
      block.textContent = '';
      formatBlock('blockquote');
    } else if (text === '- ' || text === '* ') {
      block.textContent = '';
      execCmd('insertUnorderedList');
    } else if (text === '1. ') {
      block.textContent = '';
      execCmd('insertOrderedList');
    }
  } else if (triggerKey === 'Enter') {
    if (text.trim() === '---') {
      block.remove();
      insertDivider();
    }
  }
}

/* ==========================================================================
   MENU DE COMANDOS RÁPIDOS "/" (SLASH COMMANDS)
   ========================================================================== */
const SLASH_COMMANDS = [
  { id: 'h2', title: 'Título de Secção (H2)', desc: 'Cabeçalho principal no artigo', icon: 'ri-h-2', run: () => formatBlock('h2') },
  { id: 'h3', title: 'Subtítulo (H3)', desc: 'Subdivisão de tópico', icon: 'ri-h-3', run: () => formatBlock('h3') },
  { id: 'quote', title: 'Citação em Destaque', desc: 'Frase ou testemunho relevante', icon: 'ri-double-quotes-l', run: () => formatBlock('blockquote') },
  { id: 'qa', title: 'Bloco Pergunta & Resposta', desc: 'Ideal para entrevistas', icon: 'ri-question-answer-line', run: () => insertInterviewBlock() },
  { id: 'callout', title: 'Caixa de Destaque / Aviso', desc: 'Bloco colorido de informação', icon: 'ri-chat-quote-line', run: () => openCalloutModal() },
  { id: 'image', title: 'Fotografia do Computador', desc: 'Upload PNG/JPG em Base64', icon: 'ri-image-add-line', run: () => triggerInlineImageUpload() },
  { id: 'checklist', title: 'Lista de Verificação', desc: 'Pontos com visto verde', icon: 'ri-list-check-2', run: () => insertChecklist() },
  { id: 'ul', title: 'Lista de Pontos', desc: 'Tópicos simples', icon: 'ri-list-unordered', run: () => execCmd('insertUnorderedList') },
  { id: 'table', title: 'Tabela de Dados', desc: 'Grelha editável de linhas/colunas', icon: 'ri-table-2', run: () => openTableModal() },
  { id: 'embed', title: 'YouTube ou Spotify', desc: 'Incorporar vídeo ou música', icon: 'ri-vidicon-line', run: () => openEmbedModal() },
  { id: 'divider', title: 'Linha Divisória', desc: 'Separador visual entre secções', icon: 'ri-separator', run: () => insertDivider() }
];

function getFilteredSlashCommands() {
  const q = (slashMenuState.query || '').toLowerCase().trim();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(c => c.title.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q) || c.id.includes(q));
}

function handleSlashCommandInput() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) {
    closeSlashCommandMenu();
    return;
  }
  const node = sel.anchorNode;
  if (!node || node.nodeType !== 3) {
    closeSlashCommandMenu();
    return;
  }
  const textBefore = node.textContent.slice(0, sel.anchorOffset);
  const match = textBefore.match(/(?:^|\s)\/([a-zA-Z0-9À-ÿ]{0,16})$/);
  if (!match) {
    closeSlashCommandMenu();
    return;
  }

  slashMenuState.active = true;
  slashMenuState.query = match[1] || '';
  slashMenuState.index = 0;
  slashMenuState.anchorNode = node;
  slashMenuState.anchorOffset = sel.anchorOffset;

  const range = sel.getRangeAt(0).cloneRange();
  const rect = range.getBoundingClientRect();
  const menu = document.getElementById('slashCommandMenu');
  if (menu && rect) {
    menu.style.left = `${Math.min(window.innerWidth - 300, Math.max(12, rect.left))}px`;
    menu.style.top = `${Math.min(window.innerHeight - 340, rect.bottom + 8)}px`;
    renderSlashCommandMenu();
    menu.classList.add('active');
  }
}

function renderSlashCommandMenu() {
  const list = document.getElementById('slashCommandList');
  if (!list) return;
  const items = getFilteredSlashCommands();
  if (!items.length) {
    closeSlashCommandMenu();
    return;
  }
  list.innerHTML = items.map((item, idx) => `
    <button type="button" class="wdoc-slash-item ${idx === slashMenuState.index ? 'is-active' : ''}" onmousedown="event.preventDefault(); executeSlashCommandById('${item.id}')">
      <span class="wdoc-slash-icon"><i class="${item.icon}"></i></span>
      <span class="wdoc-slash-text">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.desc)}</small>
      </span>
    </button>
  `).join('');
}

window.executeSlashCommandById = function (id) {
  const cmd = SLASH_COMMANDS.find(c => c.id === id);
  if (cmd) executeSlashCommand(cmd);
};

function executeSlashCommand(cmd) {
  try {
    const node = slashMenuState.anchorNode;
    if (node && node.nodeType === 3) {
      const text = node.textContent;
      const before = text.slice(0, slashMenuState.anchorOffset);
      const after = text.slice(slashMenuState.anchorOffset);
      const cleanedBefore = before.replace(/\/([a-zA-Z0-9À-ÿ]{0,16})$/, '');
      node.textContent = cleanedBefore + after;
      const range = document.createRange();
      range.setStart(node, cleanedBefore.length);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      saveEditorSelection();
    }
  } catch (_) {}
  closeSlashCommandMenu();
  cmd.run();
}

function closeSlashCommandMenu() {
  slashMenuState.active = false;
  const menu = document.getElementById('slashCommandMenu');
  if (menu) menu.classList.remove('active');
}

/* ==========================================================================
   BARRA FLUTUANTE DE SELEÇÃO RÁPIDA
   ========================================================================== */
function updateFloatingFormatBar() {
  const bar = document.getElementById('floatingFormatBar');
  const body = document.getElementById('articleBody');
  const sel = window.getSelection();
  if (!bar || !body || !sel || sel.isCollapsed || !sel.toString().trim() || !body.contains(sel.anchorNode)) {
    hideFloatingFormatBar();
    return;
  }
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (!rect || (!rect.width && !rect.height)) {
    hideFloatingFormatBar();
    return;
  }
  bar.classList.add('active');
  const top = Math.max(12, rect.top - 46);
  const left = Math.min(window.innerWidth - 290, Math.max(12, rect.left + (rect.width / 2) - 135));
  bar.style.top = `${top}px`;
  bar.style.left = `${left}px`;
}

function hideFloatingFormatBar() {
  const bar = document.getElementById('floatingFormatBar');
  if (bar) bar.classList.remove('active');
}

/* ==========================================================================
   ÍNDICE DO DOCUMENTO (OUTLINE VIVO) E CHECKLIST DE PRONTIDÃO EDITORIAL
   ========================================================================== */
function renderDocumentOutline() {
  const body = document.getElementById('articleBody');
  const container = document.getElementById('docOutlineContainer');
  const badge = document.getElementById('outlineCountBadge');
  if (!body || !container) return;

  const headings = Array.from(body.querySelectorAll('h2, h3, h4'));
  if (badge) badge.textContent = `${headings.length} ${headings.length === 1 ? 'secção' : 'secções'}`;

  if (!headings.length) {
    container.innerHTML = '<div class="wdoc-outline-empty">Adiciona títulos (H2, H3) ou escreve <code>/</code> numa nova linha para estruturar o artigo.</div>';
    return;
  }

  container.innerHTML = headings.map((h, idx) => {
    const tag = h.tagName.toLowerCase();
    const label = (h.textContent || '').trim() || `Secção ${idx + 1}`;
    h.dataset.outlineIdx = String(idx);
    return `
      <button type="button" class="wdoc-outline-item is-${tag}" onclick="scrollToOutlineHeading(${idx})" title="${escapeHtml(label)}">
        <span class="wdoc-outline-tag">${tag.toUpperCase()}</span>
        <span style="overflow:hidden;text-overflow:ellipsis;">${escapeHtml(label)}</span>
      </button>
    `;
  }).join('');
}

window.scrollToOutlineHeading = function (idx) {
  const body = document.getElementById('articleBody');
  const h = body?.querySelector(`[data-outline-idx="${idx}"]`);
  if (!h) return;
  h.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const range = document.createRange();
  range.selectNodeContents(h);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
};

function updateEditorialQualityChecklist() {
  const title = (document.getElementById('articleTitle')?.value || '').trim();
  const cover = (document.getElementById('articleImage')?.value || '').trim();
  const excerpt = (document.getElementById('articleExcerpt')?.value || '').trim();
  const body = document.getElementById('articleBody');
  const text = (body?.innerText || '').trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const headings = body ? body.querySelectorAll('h2, h3').length : 0;

  const checks = {
    title: title.length >= 12,
    cover: Boolean(cover && cover !== DEFAULT_COVER_IMAGE),
    excerpt: excerpt.length >= 25,
    headings: headings >= 1,
    length: words >= 80
  };

  let score = 0;
  Object.entries(checks).forEach(([key, ok]) => {
    if (ok) score++;
    const li = document.querySelector(`#editorialQualityList [data-check="${key}"]`);
    if (li) {
      li.classList.toggle('is-done', ok);
      const icon = li.querySelector('i');
      if (icon) icon.className = ok ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line';
    }
  });

  const badge = document.getElementById('qualityScoreBadge');
  if (badge) {
    badge.textContent = `${score}/5`;
    badge.style.color = score >= 4 ? '#34d399' : (score >= 2 ? '#fbbf24' : '#94a3b8');
  }
}

/* ==========================================================================
   MODELOS EDITORIAIS RÁPIDOS (TEMPLATES)
   ========================================================================== */
window.applyEditorialTemplate = function (type) {
  const body = document.getElementById('articleBody');
  if (!body) return;
  const currentText = (body.innerText || '').trim();
  if (currentText.length > 140 && !confirm('Substituir o texto atual pelo modelo selecionado?')) {
    return;
  }

  const templates = {
    noticia: {
      cat: 'Notícia',
      vis: 'public',
      html: `
        <p><strong>Resumo inicial (Lead):</strong> Indica em duas frases o que aconteceu, quando, onde e quem esteve envolvido na EBS Cidadela.</p>
        <h2>O que aconteceu</h2>
        <p>Desenvolve aqui os detalhes principais da iniciativa ou acontecimento escolar.</p>
        <blockquote>"Insere aqui uma declaração ou testemunho de um aluno, professor ou organizador."</blockquote>
        <h2>Próximos passos</h2>
        <p>Explica como a comunidade escolar pode participar ou consultar mais informações.</p>
      `
    },
    entrevista: {
      cat: 'Entrevista',
      vis: 'public',
      html: `
        <p>Conversámos no estúdio da <strong>Wave Rádio</strong> com <em>[Nome do Entrevistado]</em> sobre o seu percurso e projetos na nossa escola.</p>
        <div class="article-qa-block">
          <p class="article-qa-question">Wave Rádio: Como surgiu a ideia para este projeto?</p>
          <p class="article-qa-answer"><strong>Entrevistado:</strong> Escreve aqui a resposta do convidado de forma clara e direta.</p>
        </div>
        <div class="article-qa-block">
          <p class="article-qa-question">Wave Rádio: Que mensagem deixas aos alunos da EBS Cidadela?</p>
          <p class="article-qa-answer"><strong>Entrevistado:</strong> Escreve aqui a segunda resposta ou conselho deixado em estúdio.</p>
        </div>
      `
    },
    evento: {
      cat: 'Evento Escolar',
      vis: 'public',
      html: `
        <p>A EBS Cidadela recebe mais uma atividade aberta à comunidade escolar. Consulta abaixo o programa e os detalhes essenciais.</p>
        <aside class="article-callout callout-info">
          <strong class="article-callout-title">Informações do Evento</strong>
          <p>Data, horário, local na escola e destinatários da atividade.</p>
        </aside>
        <h2>Destaques do Programa</h2>
        <ul class="article-checklist">
          <li>Momento de abertura e boas-vindas</li>
          <li>Atividades práticas com as turmas</li>
          <li>Encerramento com cobertura da Wave Rádio</li>
        </ul>
      `
    },
    economia: {
      cat: 'Economia',
      vis: 'economia',
      html: `
        <p>No espaço <strong>Economia em Frequência</strong> desta semana analisamos um conceito essencial do dia a dia de forma descomplicada.</p>
        <h2>O conceito em 1 minuto</h2>
        <p>Explica o tema económico com exemplos práticos para jovens e famílias.</p>
        <aside class="article-callout callout-tip">
          <strong class="article-callout-title">Dica Prática</strong>
          <p>Uma regra simples para aplicar na gestão do orçamento pessoal.</p>
        </aside>
      `
    },
    antena: {
      cat: 'Comunicado',
      vis: 'internal',
      html: `
        <p><strong>[ENTRA CAMA SONORA]</strong></p>
        <h2>Texto para o Locutor ler em Antena</h2>
        <p>Bom dia, Cidadela! Aqui fala a equipa da Wave Rádio com um aviso importante para todas as turmas:</p>
        <ul>
          <li>Ponto curto e direto número 1;</li>
          <li>Ponto curto e direto número 2.</li>
        </ul>
        <p><em>Fecho:</em> Continuem ligados à emissão da Wave Rádio!</p>
      `
    }
  };

  const tpl = templates[type];
  if (!tpl) return;
  const catEl = document.getElementById('articleCategory');
  const visEl = document.getElementById('articleVisibility');
  if (catEl) catEl.value = tpl.cat;
  if (visEl) visEl.value = tpl.vis;
  toggleBroadcastDateVisibility();
  body.innerHTML = tpl.html.trim();
  markEditorDirty();
  onEditorMetaInput();
  updateStats();
  renderDocumentOutline();
  updateEditorialQualityChecklist();
  scheduleLocalDraftSave();
  showEditorToast('Modelo editorial aplicado!', 'success');
};

/* ==========================================================================
   CARREGAMENTO DE ARTIGO EXISTENTE OU RASCUNHO
   ========================================================================== */
async function loadArticleFromQuery() {
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
    const portalParam = params.get('portal');
    if (portalParam === 'economia') {
      const visEl = document.getElementById('articleVisibility');
      const catEl = document.getElementById('articleCategory');
      const badgeEl = document.getElementById('editorModeBadge');
      if (visEl) visEl.value = 'economia';
      if (catEl) catEl.value = 'Economia';
      if (badgeEl) badgeEl.innerText = 'Economia em Frequência';
      toggleBroadcastDateVisibility();
    }
    body.innerHTML = '<p>Escreve aqui o desenvolvimento da notícia. Digita <strong>/</strong> em qualquer linha para abrir o menu rápido de blocos ou arrasta fotografias PNG/JPG diretamente para a folha.</p>';
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

  populateEditorFields(article);
  isEditorDirty = false;
  setSyncStatus('saved', 'Sincronizado com a Cloud');
}

function populateEditorFields(article) {
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
  const imageSource = article.imageSource || article.coverCredit || article.coverSource || '';
  const srcInput = document.getElementById('articleImageSource');
  if (srcInput) srcInput.value = imageSource;
  if (typeof window.onCoverCreditInput === 'function') window.onCoverCreditInput(imageSource);
  document.getElementById('articleExcerpt').value = article.excerpt || '';
  document.getElementById('articleFeatured').checked = Boolean(article.featured);

  const isInternal = article.visibility === 'internal' || article.onAir === true || Boolean(article.broadcastDate);
  let visSelectVal = 'public';
  if (isInternal) visSelectVal = 'internal';
  else if (article.portal === 'economia' || article.visibility === 'economia') visSelectVal = 'economia';
  else if (article.portal === 'both' || article.visibility === 'both') visSelectVal = 'both';
  document.getElementById('articleVisibility').value = visSelectVal;
  document.getElementById('articleBroadcastDate').value = article.broadcastDate || new Date().toISOString().slice(0, 10);
  if (document.getElementById('articleSpeaker')) document.getElementById('articleSpeaker').value = article.speaker || '';
  if (document.getElementById('articleCue') && article.cue) document.getElementById('articleCue').value = article.cue;

  toggleBroadcastDateVisibility();
  const loadedCover = (article.image || '').trim();
  const loadedContent = article.content || `<p>${escapeHtml(article.excerpt || '')}</p>`;
  document.getElementById('articleImage').value = loadedCover;
  document.getElementById('articleBody').innerHTML = loadedContent;
  updateCoverPreview(loadedCover || DEFAULT_COVER_IMAGE);
  onEditorMetaInput();
  updateExcerptCounter();
  updateStats();
  renderDocumentOutline();
  updateEditorialQualityChecklist();
}

/* ==========================================================================
   UPLOAD DE CAPA & FOTOGRAFIAS INLINE (COM OTIMIZAÇÃO AUTOMÁTICA DE QUOTA)
   ========================================================================== */
window.handleCoverFileUpload = async function (file) {
  if (!file) return;
  setSyncStatus('saving', 'A otimizar foto de capa...');

  try {
    const result = await window.imageFileToBase64(file, {
      maxWidth: 1200,
      maxHeight: 900,
      quality: 0.84,
      maxBase64Chars: 310000
    });

    const imageInput = document.getElementById('articleImage');
    if (imageInput) imageInput.value = result.dataUrl;
    updateCoverPreview(result.dataUrl, result.sizeKB);
    markEditorDirty();
    scheduleLocalDraftSave();
    updateStats();
    updateEditorialQualityChecklist();
    showEditorToast(`Foto de capa otimizada (${result.sizeKB} KB).`, 'success');
  } catch (err) {
    showEditorToast(err.message || 'Erro ao processar a imagem de capa.', 'error');
  } finally {
    setSyncStatus('saved', 'Capa atualizada');
  }
};

window.updateCoverPreview = function (url, sizeKB = null) {
  const preview = document.getElementById('coverPreview');
  const sheetCoverImg = document.getElementById('sheetCoverImg');
  const badge = document.getElementById('coverSizeBadge');
  const clean = String(url || '').trim();

  if (preview) preview.src = clean || DEFAULT_COVER_IMAGE;
  if (sheetCoverImg) sheetCoverImg.src = clean || DEFAULT_COVER_IMAGE;

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
  updateEditorialQualityChecklist();
};

window.onCoverCreditInput = function (val) {
  const text = String(val || '').trim();
  const caption = document.getElementById('sheetCoverCreditCaption');
  const textEl = document.getElementById('sheetCoverCreditText');
  if (caption && textEl) {
    if (text) {
      textEl.textContent = text;
      caption.style.display = 'flex';
    } else {
      caption.style.display = 'none';
      textEl.textContent = '';
    }
  }
  markEditorDirty();
  scheduleLocalDraftSave();
};

window.selectPresetCover = function (src, thumbEl) {
  const input = document.getElementById('articleImage');
  if (input) input.value = src;
  document.querySelectorAll('.word-preset-thumb').forEach(t => t.classList.remove('active'));
  if (thumbEl) thumbEl.classList.add('active');
  updateCoverPreview(src);
  markEditorDirty();
  scheduleLocalDraftSave();
};

window.clearCoverImage = function () {
  const input = document.getElementById('articleImage');
  const fileInput = document.getElementById('coverFileInput');
  if (input) input.value = '';
  if (fileInput) fileInput.value = '';
  updateCoverPreview('');
  markEditorDirty();
  scheduleLocalDraftSave();
};

window.triggerInlineImageUpload = function () {
  saveEditorSelection();
  isReplacingInlineImage = false;
  const input = document.getElementById('inlineImageFileInput');
  if (input) {
    input.value = '';
    input.click();
  }
};

window.replaceSelectedInlineImage = function () {
  if (!selectedInlineFigure) return;
  isReplacingInlineImage = true;
  const input = document.getElementById('inlineImageFileInput');
  if (input) {
    input.value = '';
    input.click();
  }
};

window.handleInlineImageFiles = async function (fileList) {
  if (!fileList || fileList.length === 0) return;
  const files = Array.from(fileList);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    setSyncStatus('saving', `A otimizar fotografia ${i + 1}/${files.length}...`);
    try {
      const result = await window.imageFileToBase64(file, {
        maxWidth: 960,
        maxHeight: 960,
        quality: 0.80,
        maxBase64Chars: 240000
      });

      if (isReplacingInlineImage && selectedInlineFigure) {
        const img = selectedInlineFigure.tagName === 'IMG' ? selectedInlineFigure : selectedInlineFigure.querySelector('img');
        if (img) img.src = result.dataUrl;
        isReplacingInlineImage = false;
        showEditorToast(`Fotografia substituída (${result.sizeKB} KB).`, 'success');
      } else {
        insertFigureHtml(result.dataUrl, file.name.replace(/\.[^.]+$/, ''), '');
        showEditorToast(`Fotografia inserida (${result.sizeKB} KB).`, 'success');
      }
    } catch (err) {
      showEditorToast(err.message || 'Não foi possível carregar a fotografia.', 'error');
    }
  }

  setSyncStatus('saved', 'Fotografia pronta');
  markEditorDirty();
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

/* Re-otimizar todas as imagens Base64 do documento para garantir que cabe no limite de 900KB */
async function recompressBase64DataUrl(dataUrl, maxW = 860, quality = 0.72) {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (w > maxW) {
        h = Math.round((h * maxW) / w);
        w = maxW;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0d1222';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

window.optimizeAllArticleImages = async function (silent = false) {
  const body = document.getElementById('articleBody');
  const coverInput = document.getElementById('articleImage');
  const beforeBytes = getTotalDocumentBytes();

  setSyncStatus('saving', 'A comprimir imagens...');
  if (coverInput && coverInput.value.startsWith('data:image/')) {
    coverInput.value = await recompressBase64DataUrl(coverInput.value, 1024, 0.74);
    updateCoverPreview(coverInput.value);
  }

  if (body) {
    const imgs = Array.from(body.querySelectorAll('img'));
    for (const img of imgs) {
      if (img.src && img.src.startsWith('data:image/')) {
        img.src = await recompressBase64DataUrl(img.src, 820, 0.70);
      }
    }
  }

  updateStats();
  scheduleLocalDraftSave();
  const afterBytes = getTotalDocumentBytes();
  const savedKB = Math.max(0, Math.round((beforeBytes - afterBytes) / 1024));
  setSyncStatus('saved', 'Imagens otimizadas');
  if (!silent) {
    showEditorToast(savedKB > 0 ? `Otimização concluída: poupaste ${savedKB} KB!` : 'As fotografias já estão no peso ideal.', 'success');
  }
};

/* Controlo de Imagem Selecionada */
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
  if (img && selectedInlineFigure.tagName === 'IMG') img.style.maxWidth = widthPct;
  markEditorDirty();
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
  markEditorDirty();
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
  if (figcaption) figcaption.focus();
};

window.removeSelectedInlineImage = function () {
  if (!selectedInlineFigure) return;
  selectedInlineFigure.remove();
  deselectInlineImage();
  markEditorDirty();
  updateStats();
  scheduleLocalDraftSave();
  showEditorToast('Fotografia removida do artigo.', 'info');
};

/* ==========================================================================
   EDIÇÃO CONTEXTUAL DE TABELAS (ADICIONAR / REMOVER LINHAS E COLUNAS)
   ========================================================================== */
function detectActiveTableContext() {
  const sel = window.getSelection();
  const body = document.getElementById('articleBody');
  const toolbar = document.getElementById('inlineTableToolbar');
  if (!sel || !sel.rangeCount || !body || !toolbar) return;

  const node = sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement;
  const cell = node && body.contains(node) ? node.closest('td, th') : null;
  if (cell) {
    activeTableCell = cell;
    toolbar.classList.add('active');
  } else {
    activeTableCell = null;
    toolbar.classList.remove('active');
  }
}

window.tableAction = function (action) {
  if (!activeTableCell) return;
  const tr = activeTableCell.closest('tr');
  const table = activeTableCell.closest('table');
  if (!tr || !table) return;
  const colIdx = Array.from(tr.children).indexOf(activeTableCell);

  if (action === 'addRowAfter') {
    const newRow = document.createElement('tr');
    const colCount = tr.children.length;
    for (let i = 0; i < colCount; i++) {
      const td = document.createElement('td');
      td.textContent = 'Dado';
      newRow.appendChild(td);
    }
    const tbody = table.querySelector('tbody') || table;
    if (tr.parentElement === tbody && tr.nextSibling) {
      tbody.insertBefore(newRow, tr.nextSibling);
    } else {
      tbody.appendChild(newRow);
    }
  } else if (action === 'addColAfter') {
    table.querySelectorAll('tr').forEach((row, rIdx) => {
      const cell = document.createElement(row.parentElement.tagName === 'THEAD' || rIdx === 0 ? 'th' : 'td');
      cell.textContent = cell.tagName === 'TH' ? 'Coluna' : 'Dado';
      const ref = row.children[colIdx];
      if (ref && ref.nextSibling) row.insertBefore(cell, ref.nextSibling);
      else row.appendChild(cell);
    });
  } else if (action === 'delRow') {
    if (table.querySelectorAll('tr').length <= 2) {
      table.remove();
      activeTableCell = null;
      detectActiveTableContext();
    } else {
      tr.remove();
    }
  } else if (action === 'delCol') {
    const cols = tr.children.length;
    if (cols <= 1) {
      table.remove();
      activeTableCell = null;
      detectActiveTableContext();
    } else {
      table.querySelectorAll('tr').forEach(row => {
        if (row.children[colIdx]) row.children[colIdx].remove();
      });
    }
  } else if (action === 'delTable') {
    table.remove();
    activeTableCell = null;
    detectActiveTableContext();
  }

  markEditorDirty();
  updateStats();
  scheduleLocalDraftSave();
};

/* ==========================================================================
   COMANDOS DE FORMATAÇÃO E BLOCOS EDITORIAIS
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
  markEditorDirty();
  updateActiveToolbarButtons();
  updateStats();
  renderDocumentOutline();
  scheduleLocalDraftSave();
};

window.formatBlock = function (tag) {
  restoreEditorSelection();
  try {
    document.execCommand('formatBlock', false, `<${tag}>`);
  } catch (_) {
    try {
      document.execCommand('formatBlock', false, tag);
    } catch (_) {}
  }
  saveEditorSelection();
  updateActiveToolbarButtons();
  markEditorDirty();
  updateStats();
  renderDocumentOutline();
  updateEditorialQualityChecklist();
  scheduleLocalDraftSave();
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
  markEditorDirty();
  updateStats();
  scheduleLocalDraftSave();
};

window.clearFormatting = function () {
  restoreEditorSelection();
  document.execCommand('removeFormat', false, null);
  document.execCommand('formatBlock', false, '<p>');
  markEditorDirty();
  updateStats();
  renderDocumentOutline();
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
  markEditorDirty();
  updateStats();
  scheduleLocalDraftSave();
};

window.insertInterviewBlock = function () {
  const html = `
    <div class="article-qa-block">
      <p class="article-qa-question">Wave Rádio: Escreve aqui a pergunta da entrevista?</p>
      <p class="article-qa-answer"><strong>Convidado:</strong> Escreve aqui a resposta do entrevistado.</p>
    </div>
    <p><br></p>
  `;
  insertHtmlAtCursor(html);
  markEditorDirty();
  updateStats();
  scheduleLocalDraftSave();
};

window.insertDivider = function () {
  insertHtmlAtCursor('<hr class="article-divider"><p><br></p>');
  markEditorDirty();
  updateStats();
  scheduleLocalDraftSave();
};

function updateActiveToolbarButtons() {
  ['bold', 'italic', 'underline', 'strikeThrough', 'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull', 'insertUnorderedList', 'insertOrderedList'].forEach(cmd => {
    const btn = document.querySelector(`.word-tool-btn[data-cmd="${cmd}"]`);
    if (btn) {
      try {
        btn.classList.toggle('active', document.queryCommandState(cmd));
      } catch (_) {}
    }
  });

  const blockSelect = document.getElementById('blockFormatSelect');
  if (blockSelect) {
    const sel = window.getSelection();
    if (sel && sel.anchorNode) {
      let node = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentNode : sel.anchorNode;
      const body = document.getElementById('articleBody');
      let matchedTag = 'p';
      while (node && node !== body && node !== document.body) {
        const tn = (node.tagName || '').toLowerCase();
        if (['h2', 'h3', 'h4', 'blockquote', 'p'].includes(tn)) {
          matchedTag = tn;
          break;
        }
        node = node.parentNode;
      }
      if (Array.from(blockSelect.options).some(o => o.value === matchedTag)) {
        blockSelect.value = matchedTag;
      }
    }
  }
}

/* ==========================================================================
   LOCALIZAR E SUBSTITUIR + MODO PAPEL CLARO + MODO FOCO (ZEN)
   ========================================================================== */
window.toggleFindReplaceBar = function (forceState) {
  const bar = document.getElementById('findReplaceBar');
  const btn = document.getElementById('toggleFindBarBtn');
  if (!bar) return;
  const next = typeof forceState === 'boolean' ? forceState : !bar.classList.contains('active');
  bar.classList.toggle('active', next);
  if (btn) btn.classList.toggle('active', next);
  if (next) {
    const input = document.getElementById('findInput');
    if (input) input.focus();
  }
};

window.highlightFindMatches = function () {
  const q = (document.getElementById('findInput')?.value || '').trim();
  const countEl = document.getElementById('findMatchCount');
  const body = document.getElementById('articleBody');
  if (!body || !countEl) return;
  if (!q) {
    countEl.textContent = '';
    return;
  }
  const text = body.innerText || '';
  const matches = text.toLowerCase().split(q.toLowerCase()).length - 1;
  countEl.textContent = matches > 0 ? `${matches} ocorrência(s)` : 'Sem resultados';
};

window.replaceNextMatch = function () {
  const findVal = document.getElementById('findInput')?.value || '';
  const replaceVal = document.getElementById('replaceInput')?.value || '';
  if (!findVal) return;
  if (window.find && window.find(findVal, false, false, true, false, false, false)) {
    const sel = window.getSelection();
    const body = document.getElementById('articleBody');
    if (sel && body && body.contains(sel.anchorNode)) {
      document.execCommand('insertText', false, replaceVal);
      markEditorDirty();
      highlightFindMatches();
      updateStats();
      scheduleLocalDraftSave();
    }
  }
};

window.replaceAllMatches = function () {
  const findVal = document.getElementById('findInput')?.value || '';
  const replaceVal = document.getElementById('replaceInput')?.value || '';
  const body = document.getElementById('articleBody');
  if (!findVal || !body) return;

  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  let count = 0;
  const escaped = findVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');
  nodes.forEach(n => {
    if (regex.test(n.nodeValue)) {
      const m = n.nodeValue.match(regex);
      count += m ? m.length : 0;
      n.nodeValue = n.nodeValue.replace(regex, replaceVal);
    }
  });

  if (count > 0) {
    markEditorDirty();
    highlightFindMatches();
    updateStats();
    scheduleLocalDraftSave();
    showEditorToast(`${count} substituição(ões) efetuada(s).`, 'success');
  } else {
    showEditorToast('Nenhuma ocorrência encontrada.', 'info');
  }
};

window.togglePaperTheme = function () {
  const isLight = document.body.classList.toggle('wdoc-paper-light');
  const btn = document.getElementById('togglePaperThemeBtn');
  if (btn) {
    btn.classList.toggle('active', isLight);
    btn.innerHTML = isLight ? '<i class="ri-moon-line"></i>' : '<i class="ri-sun-line"></i>';
  }
  showEditorToast(isLight ? 'Folha em Modo Papel Claro (como na página pública).' : 'Folha em Modo Estúdio Escuro.', 'info');
};

window.toggleZenMode = function () {
  const isZen = document.body.classList.toggle('wdoc-zen-mode');
  const btn = document.getElementById('toggleZenModeBtn');
  if (btn) {
    btn.classList.toggle('active', isZen);
    btn.innerHTML = isZen ? '<i class="ri-fullscreen-exit-line"></i>' : '<i class="ri-fullscreen-line"></i>';
  }
  showEditorToast(isZen ? 'Modo Foco ativado — escrita sem distrações.' : 'Painéis laterais restaurados.', 'info');
};

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
  markEditorDirty();
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
  markEditorDirty();
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
  markEditorDirty();
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
  for (let c = 1; c <= cols; c++) thead += `<th>Coluna ${c}</th>`;
  thead += '</tr></thead>';

  let tbody = '<tbody>';
  for (let r = 1; r < rows; r++) {
    tbody += '<tr>';
    for (let c = 1; c <= cols; c++) tbody += '<td>Dado</td>';
    tbody += '</tr>';
  }
  tbody += '</tbody>';

  insertHtmlAtCursor(`<table class="article-table">${thead}${tbody}</table><p><br></p>`);
  markEditorDirty();
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
  insertEmbedByUrl(rawUrl);
};

function insertEmbedByUrl(rawUrl) {
  let embedHtml = '';
  const ytMatch = rawUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
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
  markEditorDirty();
  updateStats();
  scheduleLocalDraftSave();
}

/* ==========================================================================
   METADADOS, RESUMO AUTOMÁTICO E MÉTRICAS (INCLUINDO TEMPO DE LOCUÇÃO)
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
  if (dateInput) dateInput.value = formatPortugueseDate(isoVal);
  onEditorMetaInput();
};

window.onEditorMetaInput = function () {
  const cat = document.getElementById('articleCategory')?.value || 'Notícia';
  const dateStr = document.getElementById('articleDate')?.value || 'Hoje';
  const titleVal = document.getElementById('articleTitle')?.value || '';
  const topTitle = document.getElementById('topBarDocTitle');
  if (topTitle && document.activeElement !== topTitle) {
    topTitle.value = titleVal;
  }
  const catPill = document.getElementById('sheetCategoryPill');
  const datePill = document.getElementById('sheetDatePill');
  if (catPill) catPill.innerHTML = `<i class="ri-price-tag-3-line"></i> ${escapeHtml(cat)}`;
  if (datePill) datePill.innerHTML = `<i class="ri-calendar-line"></i> ${escapeHtml(dateStr)}`;
  markEditorDirty();
  updateEditorialQualityChecklist();
  scheduleLocalDraftSave();
};

window.syncTitleFromTopBar = function (val) {
  const sheetTitle = document.getElementById('articleTitle');
  if (sheetTitle) sheetTitle.value = val;
  onEditorMetaInput();
};

/* ==========================================================================
   CONTROLOS ESTILO GOOGLE DOCS / WORD (MENUS DE TOPO, ZOOM, FONTE, ESPAÇAMENTO)
   ========================================================================== */
let currentPaperZoom = 100;

window.toggleTopMenu = function (triggerBtn) {
  const item = triggerBtn?.closest('.wdoc-menu-item');
  if (!item) return;
  const wasOpen = item.classList.contains('is-open');
  closeAllTopMenus();
  if (!wasOpen) item.classList.add('is-open');
};

window.closeAllTopMenus = function () {
  document.querySelectorAll('.wdoc-menu-item.is-open').forEach(el => el.classList.remove('is-open'));
};

document.addEventListener('click', (e) => {
  if (!e.target.closest('.wdoc-menu-item')) {
    closeAllTopMenus();
  }
});

window.changePaperZoom = function (delta) {
  if (delta === 0) currentPaperZoom = 100;
  else currentPaperZoom = Math.min(150, Math.max(70, currentPaperZoom + delta));
  const sheet = document.getElementById('editorPaperSheet');
  const label = document.getElementById('paperZoomLabel');
  if (sheet) {
    sheet.style.zoom = `${currentPaperZoom}%`;
  }
  if (label) label.textContent = `${currentPaperZoom}%`;
};

window.setEditorFontFamily = function (fontStack) {
  const body = document.getElementById('articleBody');
  if (body && fontStack) {
    body.style.fontFamily = fontStack;
  }
};

window.setLineSpacing = function (lh) {
  const body = document.getElementById('articleBody');
  if (body && lh) {
    body.style.lineHeight = lh;
    showEditorToast(`Espaçamento entre linhas ajustado para ${lh}.`, 'info');
  }
};

window.toggleWidePage = function () {
  const isWide = document.body.classList.toggle('wdoc-wide-page');
  showEditorToast(isWide ? 'Modo Página Larga ativado.' : 'Modo Folha A4 Padrão ativado.', 'info');
};

window.togglePanelVisibility = function (side) {
  if (side === 'left') document.body.classList.toggle('wdoc-hide-left');
  else if (side === 'right') document.body.classList.toggle('wdoc-hide-right');
};

window.selectAllDocumentText = function () {
  const body = document.getElementById('articleBody');
  if (!body) return;
  body.focus();
  const range = document.createRange();
  range.selectNodeContents(body);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
};

window.cleanEntireDocumentFormatting = function () {
  const body = document.getElementById('articleBody');
  if (!body) return;
  body.innerHTML = cleanPastedHtml(body.innerHTML);
  markEditorDirty();
  updateStats();
  renderDocumentOutline();
  scheduleLocalDraftSave();
  showEditorToast('Estilos do documento normalizados com sucesso.', 'success');
};

window.toggleBroadcastDateVisibility = function () {
  const visibility = document.getElementById('articleVisibility')?.value || 'public';
  const group = document.getElementById('broadcastDateGroup');
  if (group) group.style.display = visibility === 'internal' ? 'flex' : 'none';
  scheduleLocalDraftSave();
};

window.updateExcerptCounter = function () {
  const excerpt = document.getElementById('articleExcerpt')?.value || '';
  const counter = document.getElementById('excerptCharCount');
  if (counter) counter.textContent = `${excerpt.length} / 260`;
};

window.generateExcerptFromBody = function () {
  const body = document.getElementById('articleBody');
  const excerptEl = document.getElementById('articleExcerpt');
  if (!body || !excerptEl) return;

  const firstPara = body.querySelector('p');
  const rawSource = firstPara && (firstPara.innerText || '').trim().length >= 35
    ? firstPara.innerText
    : (body.innerText || '');
  const plain = rawSource.replace(/\s+/g, ' ').trim();
  if (!plain) {
    showEditorToast('Escreve primeiro o corpo do artigo para gerar o resumo.', 'warning');
    return;
  }

  excerptEl.value = plain.length > 210 ? `${plain.slice(0, 207)}...` : plain;
  updateExcerptCounter();
  updateEditorialQualityChecklist();
  markEditorDirty();
  scheduleLocalDraftSave();
  showEditorToast('Resumo gerado automaticamente a partir do artigo.', 'success');
};

function getTotalDocumentBytes() {
  const htmlContent = document.getElementById('articleBody')?.innerHTML || '';
  const coverImage = document.getElementById('articleImage')?.value || '';
  const title = document.getElementById('articleTitle')?.value || '';
  return new Blob([htmlContent, coverImage, title]).size;
}

function formatSpeechTime(words) {
  // Velocidade média de locução radiofónica em PT: ~135 palavras/minuto
  const totalSec = Math.max(5, Math.round((words / 135) * 60));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function updateStats() {
  const body = document.getElementById('articleBody');
  const text = (body?.innerText || '').trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const paragraphs = body ? Math.max(1, body.querySelectorAll('p, li, blockquote').length) : 0;
  const minutes = Math.max(1, Math.ceil(words / 180));
  const speechStr = formatSpeechTime(words);
  const imagesCount = body ? body.querySelectorAll('img').length : 0;

  const totalBytes = getTotalDocumentBytes();
  const totalKB = Math.max(1, Math.round(totalBytes / 1024));
  const maxKB = 900;
  const pct = Math.min(100, Math.round((totalKB / maxKB) * 100));

  const wordDisplay = document.getElementById('wordCountDisplay');
  const readDisplay = document.getElementById('readTimeDisplay');
  if (wordDisplay) wordDisplay.innerText = `${words} palavras • ${text.length} caracteres`;
  if (readDisplay) readDisplay.innerText = `Leitura: ${minutes} min • Locução em antena: ~${speechStr}`;

  const sideWords = document.getElementById('sideStatWords');
  const sideRead = document.getElementById('sideStatReadTime');
  const sideImgs = document.getElementById('sideStatImages');
  const sideSize = document.getElementById('sideStatSize');
  const quotaFill = document.getElementById('sideStatQuotaFill');

  if (sideWords) sideWords.textContent = `${words} • ${paragraphs} par.`;
  if (sideRead) sideRead.textContent = `${minutes} min • ~${speechStr}`;
  if (sideImgs) sideImgs.textContent = String(imagesCount);
  if (sideSize) sideSize.textContent = `${totalKB} KB / ${maxKB} KB`;
  if (quotaFill) {
    quotaFill.style.width = `${pct}%`;
    quotaFill.style.background = pct > 85 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#10b981';
  }
}

/* ==========================================================================
   AUTO-SAVE DE RASCUNHO (INDEXEDDB + LOCALSTORAGE) & HISTÓRICO DE VERSÕES
   ========================================================================== */
function getDraftStorageKey() {
  return currentArticleId ? `wave_editor_draft_${currentArticleId}` : 'wave_editor_draft_new';
}

function getSnapshotsStorageKey() {
  return currentArticleId ? `wave_editor_snapshots_${currentArticleId}` : 'wave_editor_snapshots_new';
}

function scheduleLocalDraftSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveLocalDraft(false);
  }, 1000);

  if (!snapshotTimer) {
    snapshotTimer = setTimeout(() => {
      snapshotTimer = null;
      saveVersionSnapshot('Ponto automático');
    }, 45000);
  }
}

async function saveLocalDraft(showToastNotification = false) {
  try {
    const draft = collectEditorPayload();
    draft.savedAt = Date.now();

    // Guardar em IndexedDB (suporta fotos Base64 sem limite de 5MB) + LocalStorage como fallback rápido
    await idbSet(getDraftStorageKey(), draft);
    try {
      localStorage.setItem(getDraftStorageKey(), JSON.stringify(draft));
    } catch (_) {}

    const timeStr = new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    setSyncStatus(navigator.onLine ? 'saved' : 'offline', `Rascunho guardado às ${timeStr}`);

    if (showToastNotification) {
      await saveVersionSnapshot('Guardado manualmente (Ctrl+S)');
      showEditorToast('Rascunho e ponto de restauro guardados neste dispositivo.', 'success');
    }
  } catch (err) {
    console.warn('Erro ao guardar rascunho:', err);
  }
}

window.saveLocalDraftExplicit = function () {
  saveLocalDraft(true);
};

async function getStoredDraft() {
  const idbDraft = await idbGet(getDraftStorageKey());
  if (idbDraft && (idbDraft.title || idbDraft.content)) return idbDraft;
  try {
    const raw = localStorage.getItem(getDraftStorageKey());
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}

async function checkLocalDraftAvailability() {
  try {
    const draft = await getStoredDraft();
    if (draft && (draft.title || draft.content)) {
      const btn = document.getElementById('restoreDraftBtn');
      if (btn) btn.style.display = 'inline-flex';
    }
  } catch (_) {}
}

window.restoreLocalDraft = async function () {
  try {
    const draft = await getStoredDraft();
    if (!draft) return;
    populateEditorFields(draft);
    markEditorDirty();
    showEditorToast('Rascunho recuperado com sucesso!', 'success');
  } catch (_) {
    showEditorToast('Não foi possível recuperar o rascunho.', 'error');
  }
};

/* ---------- Histórico de Versões (Snapshots) ---------- */
async function getVersionSnapshots() {
  const list = await idbGet(getSnapshotsStorageKey());
  if (Array.isArray(list)) return list;
  try {
    const raw = localStorage.getItem(getSnapshotsStorageKey());
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
}

async function saveVersionSnapshot(label = 'Ponto de restauro') {
  try {
    const payload = collectEditorPayload();
    const plain = (document.getElementById('articleBody')?.innerText || '').trim();
    if (!payload.title && plain.length < 20) return;

    const list = await getVersionSnapshots();
    const words = plain ? plain.split(/\s+/).filter(Boolean).length : 0;

    // Evitar duplicar se o conteúdo for igual ao último snapshot
    if (list.length > 0 && list[0].content === payload.content && list[0].title === payload.title) {
      return;
    }

    const entry = {
      snapId: `snap_${Date.now()}`,
      label,
      savedAt: Date.now(),
      words,
      ...payload
    };

    const updated = [entry, ...list].slice(0, 15);
    await idbSet(getSnapshotsStorageKey(), updated);
    try {
      localStorage.setItem(getSnapshotsStorageKey(), JSON.stringify(updated.slice(0, 5)));
    } catch (_) {}
  } catch (_) {}
}

window.openVersionHistoryModal = async function () {
  await renderVersionHistoryList();
  openEditorModal('editorHistoryModal');
};

window.createManualVersionSnapshot = async function () {
  await saveVersionSnapshot('Ponto criado manualmente');
  await renderVersionHistoryList();
  showEditorToast('Novo ponto de restauro criado!', 'success');
};

async function renderVersionHistoryList() {
  const container = document.getElementById('versionHistoryList');
  if (!container) return;
  const list = await getVersionSnapshots();
  if (!list.length) {
    container.innerHTML = '<div class="wdoc-outline-empty" style="text-align:center;padding:1.5rem;">Ainda não existem pontos de restauro para este artigo. Prime <b>Guardar Rascunho (Ctrl+S)</b> para criar o primeiro.</div>';
    return;
  }

  container.innerHTML = list.map((snap, idx) => {
    const dateStr = new Date(snap.savedAt).toLocaleString('pt-PT', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    return `
      <div class="wdoc-history-item">
        <div class="wdoc-history-meta">
          <strong>${escapeHtml(snap.title || 'Artigo sem título')} <span style="color:#38bdf8;font-size:0.74rem;">(${snap.words || 0} palavras)</span></strong>
          <small><i class="ri-time-line"></i> ${escapeHtml(dateStr)} • ${escapeHtml(snap.label || 'Snapshot')}</small>
        </div>
        <button type="button" class="btn-action" onclick="restoreVersionSnapshot(${idx})">
          <i class="ri-restart-line"></i> Restaurar
        </button>
      </div>
    `;
  }).join('');
}

window.restoreVersionSnapshot = async function (idx) {
  const list = await getVersionSnapshots();
  const snap = list[idx];
  if (!snap) return;
  if (!confirm('Restaurar o artigo para esta versão guardada?')) return;
  populateEditorFields(snap);
  closeEditorModal('editorHistoryModal');
  markEditorDirty();
  scheduleLocalDraftSave();
  showEditorToast('Versão restaurada com sucesso!', 'success');
};

/* ==========================================================================
   IMPORTAÇÃO & EXPORTAÇÃO (.MD, .HTML, .JSON, IMPRESSÃO)
   ========================================================================== */
window.openExportModal = function () {
  openEditorModal('editorExportModal');
};

function htmlToMarkdown(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  let md = '';
  temp.childNodes.forEach(node => {
    if (node.nodeType === 3) {
      md += node.textContent;
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    const text = (node.innerText || '').trim();
    if (tag === 'h2') md += `\n## ${text}\n\n`;
    else if (tag === 'h3') md += `\n### ${text}\n\n`;
    else if (tag === 'h4') md += `\n#### ${text}\n\n`;
    else if (tag === 'blockquote') md += `\n> ${text}\n\n`;
    else if (tag === 'ul') {
      node.querySelectorAll('li').forEach(li => { md += `- ${(li.innerText || '').trim()}\n`; });
      md += '\n';
    } else if (tag === 'ol') {
      Array.from(node.querySelectorAll('li')).forEach((li, i) => { md += `${i + 1}. ${(li.innerText || '').trim()}\n`; });
      md += '\n';
    } else if (tag === 'hr') {
      md += `\n---\n\n`;
    } else {
      md += `${text}\n\n`;
    }
  });
  return md.trim();
}

window.exportArticleAs = function (format) {
  const data = collectEditorPayload();
  const slug = (data.title || 'artigo-wave-docs')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'artigo-wave-docs';

  let contentStr = '';
  let mime = 'text/plain;charset=utf-8';
  let ext = 'txt';

  if (format === 'markdown') {
    ext = 'md';
    mime = 'text/markdown;charset=utf-8';
    contentStr = `# ${data.title || 'Sem Título'}\n\n` +
      `**Categoria:** ${data.category} | **Autor:** ${data.author} | **Data:** ${data.date}\n\n` +
      (data.excerpt ? `> ${data.excerpt}\n\n` : '') +
      htmlToMarkdown(data.content);
  } else if (format === 'html') {
    ext = 'html';
    mime = 'text/html;charset=utf-8';
    contentStr = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"><title>${escapeHtml(data.title)}</title></head><body style="max-width:780px;margin:2rem auto;font-family:sans-serif;line-height:1.7;"><h1>${escapeHtml(data.title)}</h1><p><strong>${escapeHtml(data.author)}</strong> • ${escapeHtml(data.date)}</p>${data.content}</body></html>`;
  } else if (format === 'json') {
    ext = 'json';
    mime = 'application/json;charset=utf-8';
    contentStr = JSON.stringify(data, null, 2);
  }

  const blob = new Blob([contentStr], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  closeEditorModal('editorExportModal');
  showEditorToast(`Ficheiro .${ext} exportado com sucesso!`, 'success');
};

window.printArticleSheet = function () {
  closeEditorModal('editorExportModal');
  window.print();
};

window.handleImportDocumentFile = function (file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const raw = String(e.target?.result || '');
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith('.json')) {
        const parsed = JSON.parse(raw);
        populateEditorFields(parsed);
      } else if (name.endsWith('.html') || name.endsWith('.htm')) {
        document.getElementById('articleBody').innerHTML = cleanPastedHtml(raw);
      } else {
        // Markdown ou TXT simples
        const lines = raw.split(/\r?\n/);
        let html = '';
        lines.forEach(line => {
          const t = line.trim();
          if (!t) return;
          if (t.startsWith('# ')) {
            const titleEl = document.getElementById('articleTitle');
            if (titleEl && !titleEl.value) titleEl.value = t.slice(2).trim();
            else html += `<h2>${escapeHtml(t.slice(2))}</h2>`;
          } else if (t.startsWith('## ')) html += `<h2>${escapeHtml(t.slice(3))}</h2>`;
          else if (t.startsWith('### ')) html += `<h3>${escapeHtml(t.slice(4))}</h3>`;
          else if (t.startsWith('> ')) html += `<blockquote>${escapeHtml(t.slice(2))}</blockquote>`;
          else html += `<p>${escapeHtml(t)}</p>`;
        });
        document.getElementById('articleBody').innerHTML = html || '<p></p>';
      }
      closeEditorModal('editorExportModal');
      markEditorDirty();
      updateStats();
      renderDocumentOutline();
      updateEditorialQualityChecklist();
      scheduleLocalDraftSave();
      showEditorToast(`Ficheiro "${file.name}" importado com sucesso!`, 'success');
    } catch (_) {
      showEditorToast('Não foi possível ler o ficheiro selecionado.', 'error');
    }
  };
  reader.readAsText(file);
};

/* ==========================================================================
   PRÉ-VISUALIZAÇÃO COMPLETA E PUBLICAÇÃO ASSÍNCRONA COM RETRY & AUTO-COMPRESSÃO
   ========================================================================== */
function collectEditorPayload() {
  deselectInlineImage();
  const title = document.getElementById('articleTitle')?.value?.trim() || '';
  const category = document.getElementById('articleCategory')?.value || 'Notícia';
  const author = document.getElementById('articleAuthor')?.value?.trim() || 'Equipa da Rádio • EBS Cidadela';
  const dateStr = document.getElementById('articleDate')?.value?.trim() || formatPortugueseDate(new Date().toISOString().slice(0, 10));
  let image = document.getElementById('articleImage')?.value?.trim() || '';
  const imageSource = document.getElementById('articleImageSource')?.value?.trim() || '';
  const content = document.getElementById('articleBody')?.innerHTML?.trim() || '';

  if (!image) image = DEFAULT_COVER_IMAGE;

  const plainText = (document.getElementById('articleBody')?.innerText || '').trim();
  const excerptInput = document.getElementById('articleExcerpt')?.value?.trim() || '';
  const excerpt = excerptInput || (plainText.length > 160 ? `${plainText.slice(0, 157)}...` : plainText);
  const rawVis = document.getElementById('articleVisibility')?.value || 'public';
  const visibility = rawVis === 'internal' ? 'internal' : 'public';
  const portal = rawVis === 'economia' ? 'economia' : (rawVis === 'both' ? 'both' : 'main');
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
    imageSource,
    coverCredit: imageSource,
    excerpt,
    content,
    readTime,
    visibility,
    portal,
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
      <figure style="margin: 0 0 1.75rem; border: 2px solid #282425; box-shadow: 5px 5px 0 #282425; background: #282425; overflow: hidden;">
        <img src="${escapeHtml(data.image)}" alt="" style="width: 100%; max-height: 440px; object-fit: cover; display: block;">
        ${data.imageSource ? `<figcaption style="padding: 0.5rem 0.95rem; background: #1a191a; color: #cbd5e1; font-family: monospace; font-size: 0.76rem; border-top: 1px solid #3f3a3b; display: flex; align-items: center; gap: 0.45rem;"><i class="ri-camera-lens-line" style="color: #ff545b;"></i> Fonte da imagem: <strong style="color: #ffffff;">${escapeHtml(data.imageSource)}</strong></figcaption>` : ''}
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

window.resetEditor = async function () {
  if (!confirm('Queres limpar todos os campos do editor? (Será criado automaticamente um ponto de restauro no Histórico antes de limpar)')) return;
  await saveVersionSnapshot('Antes de limpar documento');
  document.getElementById('articleTitle').value = '';
  document.getElementById('articleExcerpt').value = '';
  document.getElementById('articleImage').value = '';
  const srcInput = document.getElementById('articleImageSource');
  if (srcInput) srcInput.value = '';
  if (typeof window.onCoverCreditInput === 'function') window.onCoverCreditInput('');
  document.getElementById('articleVisibility').value = 'public';
  document.getElementById('articleFeatured').checked = false;
  toggleBroadcastDateVisibility();
  document.getElementById('articleBody').innerHTML = '<p>Começa a escrever o teu artigo...</p>';
  updateCoverPreview('');
  updateExcerptCounter();
  updateStats();
  renderDocumentOutline();
  updateEditorialQualityChecklist();
};

window.publishArticle = async function () {
  const auth = window.firebaseServices && window.firebaseServices.auth;
  if (auth && !auth.currentUser) {
    const modal = document.getElementById('editorAuthModal');
    if (modal) modal.classList.add('active');
    showEditorToast('Inicia sessão para poderes publicar o artigo na Cloud.', 'warning');
    return;
  }

  let data = collectEditorPayload();
  const plainText = (document.getElementById('articleBody')?.innerText || '').trim();

  if (!data.title || !plainText) {
    showEditorToast('Preenche o título e o corpo do artigo antes de publicar.', 'warning');
    return;
  }

  // Se o documento ultrapassar 900 KB, re-otimiza automaticamente as imagens antes de enviar para o Firestore
  let totalBytes = new Blob([JSON.stringify(data)]).size;
  if (totalBytes > 900000) {
    showEditorToast('A otimizar automaticamente as fotografias para caberem na Cloud...', 'info');
    await window.optimizeAllArticleImages(true);
    data = collectEditorPayload();
    totalBytes = new Blob([JSON.stringify(data)]).size;
  }

  if (totalBytes > 990000) {
    showEditorToast('O artigo ainda excede 980 KB. Remove uma fotografia para publicar.', 'error');
    return;
  }

  const btn = document.getElementById('publishArticleBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> A guardar na Cloud...';
  }
  setSyncStatus('saving', 'A sincronizar com a Cloud...');

  // Guardar sempre um snapshot local antes de publicar
  await saveVersionSnapshot('Versão publicada');

  let lastErr = null;
  let saved = null;

  // Até 3 tentativas automáticas com backoff em caso de falha momentânea de rede
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
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
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) {
        setSyncStatus('saving', `A tentar novamente (${attempt + 1}/3)...`);
        await new Promise(r => setTimeout(r, 800 * attempt));
      }
    }
  }

  if (lastErr) {
    console.error('Erro ao publicar artigo:', lastErr);
    await saveLocalDraft(false);
    showEditorToast('Falha na Cloud (o teu artigo está seguro no rascunho local): ' + (lastErr.message || 'Verifica a ligação.'), 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ri-send-plane-fill"></i> <span id="publishArticleBtnLabel">Tentar Publicar Novamente</span>';
    }
    setSyncStatus('offline', 'Guardado localmente (Cloud pendente)');
    return;
  }

  const oldDraftKey = getDraftStorageKey();
  currentArticleId = saved?.id || currentArticleId;
  isEditorDirty = false;

  try {
    localStorage.removeItem(oldDraftKey);
    await idbRemove(oldDraftKey);
  } catch (_) {}

  const restoreBtn = document.getElementById('restoreDraftBtn');
  if (restoreBtn) restoreBtn.style.display = 'none';

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="ri-checkbox-circle-line"></i> Guardado na Cloud';
    setTimeout(() => {
      btn.innerHTML = '<i class="ri-send-plane-fill"></i> <span id="publishArticleBtnLabel">Guardar Alterações</span>';
    }, 2500);
  }
  setSyncStatus('saved', 'Publicado na Cloud');
  showEditorToast('Artigo guardado e publicado com sucesso!', 'success');

  const publishedModal = document.getElementById('articlePublishedModal');
  if (publishedModal) {
    const viewLink = document.getElementById('publishedViewLink');
    const descEl = document.getElementById('publishedModalDesc');
    if (viewLink) {
      if (data.visibility === 'internal') {
        viewLink.href = 'admin.html#sec-anuncios';
        viewLink.innerHTML = '<i class="ri-arrow-left-line"></i> Ver no Painel de Emissão';
        if (descEl) descEl.textContent = 'O aviso interno para emissão foi registado e está pronto para leitura em antena.';
      } else {
        viewLink.href = `artigo.html?id=${encodeURIComponent(saved.id)}`;
        viewLink.innerHTML = '<i class="ri-external-link-line"></i> Abrir Artigo no Site';
        if (descEl) descEl.textContent = 'O teu artigo já se encontra publicado na Wave Rádio da EBS Cidadela.';
      }
    }
    openEditorModal('articlePublishedModal');
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
