// Secure project-file browser for the existing Drawings and Bills dashboard buttons.
(() => {
  const apiUrl = window.IDEA_SITE_CONFIG?.API_URL || '';
  const params = new URLSearchParams(location.search);
  const projectId = params.get('projectId') || '';
  const token = sessionStorage.getItem('ideaClientAccessToken') || '';
  const sessionProjectId = sessionStorage.getItem('ideaClientProjectId') || '';
  const modal = document.getElementById('modal');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);

  function showModal(heading, content) {
    title.textContent = heading;
    body.innerHTML = content;
    modal.classList.add('show');
  }

  function requestUrl(action, kind, fileId) {
    const url = new URL(apiUrl);
    url.searchParams.set('action', action);
    url.searchParams.set('projectId', projectId);
    url.searchParams.set('accessToken', token);
    if (kind) url.searchParams.set('kind', kind);
    if (fileId) url.searchParams.set('fileId', fileId);
    return url.toString();
  }

  async function loadFolder(kind) {
    if (!apiUrl || !token || projectId !== sessionProjectId) {
      showModal(kind, '<p class="empty">Your client session has expired. Sign in again to view project files.</p>');
      return;
    }
    showModal(kind, '<p class="empty">Loading project files…</p>');
    try {
      const response = await fetch(requestUrl('clientDriveList', kind));
      if (!response.ok) throw new Error('Drive request failed (' + response.status + ').');
      const result = await response.json();
      if (!result.success) throw new Error(result.message || 'Unable to load project files.');
      const files = result.files || [];
      if (!files.length) {
        body.innerHTML = '<p class="empty">No supported files were found in this folder.</p>';
        return;
      }
      body.innerHTML = '<div class="client-drive-list">' + files.map(file =>
        '<div class="client-drive-row"><div><strong>' + escapeHtml(file.name) + '</strong>' +
        '<small>' + escapeHtml(file.mimeType) + ' · ' + escapeHtml(file.updated || '') +
        (file.tooLarge ? ' · Too large to preview' : '') + '</small></div>' +
        (file.tooLarge ? '' : '<button type="button" class="client-drive-preview" data-drive-file="' +
          escapeHtml(file.id) + '">Preview</button>') + '</div>'
      ).join('') + '</div>';
    } catch (error) {
      body.innerHTML = '<p class="empty">' + escapeHtml(error.message || 'Unable to load project files.') + '</p>';
    }
  }

  async function previewFile(fileId, kind) {
    showModal(kind, '<p class="empty">Loading preview…</p>');
    try {
      const response = await fetch(requestUrl('clientDriveFile', kind, fileId));
      if (!response.ok) throw new Error('File request failed (' + response.status + ').');
      const result = await response.json();
      if (!result.success) throw new Error(result.message || 'Unable to open this file.');
      const dataUrl = 'data:' + result.mimeType + ';base64,' + result.base64;
      const preview = result.mimeType === 'application/pdf'
        ? '<iframe class="client-drive-pdf" title="' + escapeHtml(result.name) + '" src="' + dataUrl + '"></iframe>'
        : '<img class="client-drive-image" alt="' + escapeHtml(result.name) + '" src="' + dataUrl + '">';
      showModal(result.name, '<button type="button" class="client-drive-back" data-drive-back="' +
        escapeHtml(kind) + '">← Back to ' + escapeHtml(kind) + '</button>' + preview);
    } catch (error) {
      showModal(kind, '<p class="empty">' + escapeHtml(error.message || 'Unable to open this file.') + '</p>');
    }
  }

  document.getElementById('openDriveDrawings')?.addEventListener('click', () => loadFolder('Drawings'));
  document.getElementById('openDriveBills')?.addEventListener('click', () => loadFolder('Bills'));
  body?.addEventListener('click', event => {
    const previewButton = event.target.closest('[data-drive-file]');
    if (previewButton) {
      const kind = title.textContent;
      previewFile(previewButton.dataset.driveFile, kind);
      return;
    }
    const backButton = event.target.closest('[data-drive-back]');
    if (backButton) loadFolder(backButton.dataset.driveBack);
  });

  const style = document.createElement('style');
  style.textContent = '.client-drive-list{display:grid;gap:10px}.client-drive-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid #e5e5e5;border-radius:10px;background:#fff}.client-drive-row strong,.client-drive-row small{display:block;overflow-wrap:anywhere}.client-drive-row small{margin-top:4px;color:#777;font-size:12px}.client-drive-preview,.client-drive-back{border:0;border-radius:8px;background:#111;color:#fff;padding:9px 12px;cursor:pointer}.client-drive-image{display:block;max-width:100%;max-height:70vh;margin:14px auto;object-fit:contain}.client-drive-pdf{width:100%;height:70vh;border:0;margin-top:12px}.client-drive-back{margin-bottom:12px}';
  document.head.append(style);
})();
