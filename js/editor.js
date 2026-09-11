document.addEventListener('DOMContentLoaded', initEditor);

async function initEditor() {
  const auth = window.firebaseServices && window.firebaseServices.auth;
  if (!auth) {
    window.location.href = 'admin.html';
    return;
  }

  let currentUser = auth.currentUser;
  if (!currentUser) {
    currentUser = await new Promise(resolve => {
      const unsubscribe = auth.onAuthStateChanged(user => {
        unsubscribe();
        resolve(user || null);
      });
    });
  }

  if (!currentUser) {
    window.location.href = 'admin.html';
    return;
  }

  await window.db.ready();
  await window.db.loadPrivateCollections();

  const params = new URLSearchParams(window.location.search);
  const article = params.get('id') ? window.db.getAnnouncementById(params.get('id')) : null;
  const briefDate = params.get('brief');
  const titleInput = document.getElementById('titleInput');
  const body = document.getElementById('editorBody');
  const imageInput = document.getElementById('imageInput');

  if (article) {
    titleInput.value = article.title || '';
    body.innerHTML = article.content || '';
    document.getElementById('categoryInput').value = article.category || article.tag || 'Evento';
    document.getElementById('authorInput').value = article.author || '';
    document.getElementById('excerptInput').value = article.excerpt || '';
    imageInput.value = article.image || '';
    document.getElementById('broadcastDateInput').value = article.broadcastDate || '';
    document.getElementById('onAirInput').checked = article.onAir === true;
    updateCoverPreview(article.image);
  } else if (briefDate) {
    prepareDailyBrief(briefDate);
  }

  document.querySelectorAll('[data-command]').forEach(button => {
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => executeCommand(button.dataset.command, button.dataset.value));
  });

  document.getElementById('formatSelect').addEventListener('change', event => {
    body.focus();
    document.execCommand('formatBlock', false, event.target.value);
    updateStatus();
  });
  document.getElementById('imageButton').addEventListener('click', insertImage);
  document.getElementById('linkButton').addEventListener('click', insertLink);
  document.getElementById('dividerButton').addEventListener('click', () => executeCommand('insertHorizontalRule'));
  imageInput.addEventListener('input', () => updateCoverPreview(imageInput.value));
  document.querySelectorAll('.word-preset-thumb').forEach(image => image.addEventListener('click', () => {
    imageInput.value = image.dataset.image;
    updateCoverPreview(image.dataset.image);
  }));
  [titleInput, body, document.getElementById('excerptInput')].forEach(field => field.addEventListener('input', updateStatus));
  document.getElementById('previewButton').addEventListener('click', togglePreview);
  document.getElementById('publishButton').addEventListener('click', () => publishArticle(article && article.id));
  updateStatus();
}

function prepareDailyBrief(dateKey) {
  const date = new Date(`${dateKey}T00:00`);
  if (Number.isNaN(date.getTime())) return;
  const events = window.db.getCalendarEvents().filter(event => event.date === dateKey);
  const formattedDate = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  document.getElementById('titleInput').value = `Guião de antena — ${formattedDate}`;
  document.getElementById('categoryInput').value = 'Emissão';
  document.getElementById('broadcastDateInput').value = dateKey;
  document.getElementById('onAirInput').checked = true;
  const moments = events.length
    ? `<ul>${events.map(event => `<li><strong>${escapeHtml(event.title)}</strong>${event.notes ? ` — ${escapeHtml(event.notes)}` : ''}</li>`).join('')}</ul>`
    : '<p>Não há eventos registados para esta data. Acrescenta os avisos e destaques da emissão.</p>';
  document.getElementById('editorBody').innerHTML = `<p><strong>Bom dia, comunidade escolar!</strong> Este é o guião de leitura da Rádio Cidadela para ${escapeHtml(formattedDate)}.</p><h2>Hoje em destaque</h2>${moments}<h2>Avisos da equipa</h2><ul><li>Adicionar aviso ou informação da escola.</li><li>Adicionar música, rubrica ou convidado em destaque.</li></ul><p>Boa emissão!</p>`;
  document.getElementById('excerptInput').value = `Guião e avisos de antena para ${formattedDate}.`;
}
function executeCommand(command, value = null) {
  document.getElementById('editorBody').focus();
  document.execCommand(command, false, value);
  updateStatus();
}

function insertImage() {
  const url = prompt('URL da imagem a inserir no artigo:');
  if (!url) return;
  executeCommand('insertImage', url);
}

function insertLink() {
  const url = prompt('URL da ligação:');
  if (!url) return;
  executeCommand('createLink', url);
}

function updateCoverPreview(url) {
  const preview = document.getElementById('coverPreview');
  preview.innerHTML = url ? `<img class="word-cover-preview-img" src="${escapeHtml(url)}" alt="Pré-visualização da capa">` : '<span style="color:var(--text-muted)">Pré-visualização da capa</span>';
}

function updateStatus() {
  const text = document.getElementById('editorBody').innerText.trim();
  const count = text ? text.split(/\s+/).length : 0;
  document.getElementById('wordCount').textContent = `${count} palavra${count === 1 ? '' : 's'}`;
  document.getElementById('saveStatus').innerHTML = '<i class="ri-edit-line"></i> Alterações por publicar';
}

function togglePreview() {
  const body = document.getElementById('editorBody');
  body.classList.toggle('editor-preview-mode');
  const button = document.getElementById('previewButton');
  const active = body.classList.contains('editor-preview-mode');
  button.innerHTML = active ? '<i class="ri-edit-line"></i> Continuar a editar' : '<i class="ri-eye-line"></i> Pré-visualizar';
  body.contentEditable = active ? 'false' : 'true';
}

function publishArticle(id) {
  const title = document.getElementById('titleInput').value.trim();
  const content = document.getElementById('editorBody').innerHTML.trim();
  if (!title || !content || content === '<br>') {
    alert('Adiciona um título e algum conteúdo antes de publicar.');
    return;
  }

  const plainText = document.getElementById('editorBody').innerText.trim();
  const excerpt = document.getElementById('excerptInput').value.trim() || (plainText.length > 150 ? `${plainText.slice(0, 147)}...` : plainText);
  const broadcastDate = document.getElementById('broadcastDateInput').value || '';
  const onAir = document.getElementById('onAirInput').checked;
  const isInternalBrief = Boolean(broadcastDate || onAir);
  const data = {
    title,
    content,
    excerpt,
    category: document.getElementById('categoryInput').value,
    tag: document.getElementById('categoryInput').value,
    author: document.getElementById('authorInput').value.trim() || 'Equipa da Rádio • EBS Cidadela',
    image: document.getElementById('imageInput').value.trim() || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=1200&q=80',
    readTime: `${Math.max(1, Math.ceil(plainText.split(/\s+/).length / 180))} min de leitura`,
    broadcastDate,
    onAir,
    visibility: isInternalBrief ? 'internal' : 'public'
  };
  const saved = id ? window.db.updateAnnouncement(id, data) : window.db.addAnnouncement(data);
  if (saved) {
    if (isInternalBrief) {
      window.location.href = 'admin.html#sec-resumo';
      return;
    }
    window.location.href = `artigo.html?id=${encodeURIComponent(saved.id)}`;
  }
}

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
