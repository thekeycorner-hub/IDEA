(() => {
  const config = window.IDEA_SITE_CONFIG || {};
  const apiUrl = String(config.API_URL || '').trim();
  const tokenKey = 'ideaReportAuthToken';
  const userKey = 'ideaReportAuthUser';
  const loginForm = document.getElementById('reportLoginForm');
  if (loginForm) {
    const loginButton = document.getElementById('reportLoginButton');
    const loginError = document.getElementById('reportLoginError');
    const showLoginError = (message) => {
      loginError.textContent = message;
      loginError.classList.toggle('visible', Boolean(message));
    };
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      showLoginError('');
      if (!apiUrl) {
        showLoginError('The login service is not configured. Please contact the site administrator.');
        return;
      }
      loginButton.disabled = true;
      loginButton.textContent = 'Checking login…';
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({
            action: 'login',
            username: document.getElementById('reportUsername').value.trim(),
            password: document.getElementById('reportPassword').value
          })
        });
        if (!response.ok) throw new Error(`Login service returned ${response.status}.`);
        let result;
        try { result = await response.json(); }
        catch (_) { throw new Error('The login service returned an unexpected response. Check the Apps Script web app deployment.'); }
        if (!result.success || !result.token || !result.user) throw new Error(result.message || 'Login failed. Check your Login ID and password.');
        const user = {
          username: result.user.username || '',
          displayName: result.user.displayName || '',
          role: result.user.role || ''
        };
        sessionStorage.setItem(tokenKey, result.token);
        sessionStorage.setItem(userKey, JSON.stringify(user));
        window.location.assign(user.role === 'Admin' ? 'admin-dashboard.html' : 'daily-report.html');
      } catch (error) {
        showLoginError(error.message || 'Unable to connect to the login service.');
      } finally {
        loginButton.disabled = false;
        loginButton.textContent = 'Sign in →';
      }
    });
    return;
  }
  const workspace = document.getElementById('reportWorkspace');
  const projectSelect = document.getElementById('reportProject');
  const dateInput = document.getElementById('reportDate');
  const status = document.getElementById('reportStatus');
  const saveHint = document.getElementById('reportSaveHint');
  const saveButton = document.getElementById('saveReportButton');
  const formError = document.getElementById('reportFormError');
  const entryDialog = document.getElementById('entryDialog');
  const entryForm = document.getElementById('entryForm');
  const entryFields = document.getElementById('entryFields');
  const lists = { workforce: [], material: [], cashFlow: [] };
  let projects = [];
  let workforceTypes = [];
  let materialTypes = [];
  let projectParties = [];
  let reportId = '';
  let remarks = '';
  let user = {};
  let dirty = false;
  let loading = false;
  let saving = false;
  let editorKind = '';
  let editorId = '';
  let lastProjectValue = '';
  let lastDateValue = '';

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const newId = () => globalThis.crypto?.randomUUID?.() || `row-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const amount = (value) => new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0
  }).format(Number(value) || 0);
  const num = (value) => Number(value) || 0;
  const todayIso = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  const isoToAppDate = (value) => {
    const [year, month, day] = String(value || '').split('-');
    return year && month && day ? `${day}/${month}/${year}` : '';
  };
  const token = () => sessionStorage.getItem(tokenKey) || '';

  function showFormError(message) {
    formError.textContent = message;
    formError.classList.toggle('visible', Boolean(message));
  }

  function setStatus(message, state = '') {
    status.textContent = message;
    status.dataset.state = state;
    saveHint.textContent = message;
  }

  async function apiGet(action, params = {}) {
    const url = new URL(apiUrl);
    url.searchParams.set('action', action);
    url.searchParams.set('token', token());
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    let result;
    try { result = await response.json(); }
    catch (_) { throw new Error('The Apps Script service returned an unexpected response.'); }
    if (!result.success) throw new Error(result.message || 'Unable to load report data.');
    return result;
  }

  async function apiPost(payload) {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Save failed (${response.status})`);
    let result;
    try { result = await response.json(); }
    catch (_) { throw new Error('The Apps Script service returned an unexpected response.'); }
    if (!result.success) throw new Error(result.message || 'Unable to save report.');
    return result;
  }

  function setWorkspaceVisible() {
    document.body.classList.add('authenticated-view');
    workspace.hidden = false;
    document.getElementById('reportUserName').textContent = `${user.displayName || user.username || 'User'} · ${user.role || ''}`.trim();
    dateInput.max = todayIso();
    if (user.role !== 'Admin') {
      dateInput.value = todayIso();
      dateInput.disabled = true;
    } else if (!dateInput.value) dateInput.value = todayIso();
    lastDateValue = dateInput.value;
    loadAppData();
  }

  async function loadAppData() {
    if (!apiUrl) {
      setStatus('The login service is not configured. Contact the site administrator.', 'error');
      return;
    }
    loading = true;
    updateControls();
    setStatus('Loading projects and report libraries…', 'loading');
    try {
      const [projectResult, workforceResult, materialResult] = await Promise.all([
        apiGet('projects'), apiGet('workforceList'), apiGet('materialList')
      ]);
      projects = projectResult.projects || [];
      workforceTypes = (workforceResult.workforce || []).filter((item) => String(item.status || 'Active').toLowerCase() === 'active');
      materialTypes = (materialResult.materials || []).filter((item) => String(item.status || 'Active').toLowerCase() === 'active');
      projectSelect.innerHTML = '<option value="">Select Project</option>' + projects.map((project) =>
        `<option value="${escapeHtml(project.name)}">${escapeHtml(project.name)}</option>`).join('');
      if (!projects.length) throw new Error('No active projects are available for this account.');
      loading = false;
      updateControls();
      setStatus('Select a project and date to load the daily report.');
    } catch (error) {
      loading = false;
      updateControls();
      setStatus(error.message || 'Unable to load projects.', 'error');
      if (/session|sign in|token/i.test(error.message || '')) {
        signOut(true);
        showLoginError('Your login session expired. Please sign in again.');
      }
    }
  }

  function updateControls() {
    saveButton.disabled = loading || saving || !projectSelect.value || !dateInput.value;
    document.querySelectorAll('.add-action').forEach((button) => {
      button.disabled = loading || !projectSelect.value;
    });
  }

  function markDirty() {
    dirty = true;
    setStatus('Unsaved changes', 'draft');
    updateControls();
  }

  async function loadReport() {
    const project = projectSelect.value;
    const date = isoToAppDate(dateInput.value);
    if (!project || !date) return;
    loading = true;
    dirty = false;
    reportId = '';
    lists.workforce = [];
    lists.material = [];
    lists.cashFlow = [];
    remarks = '';
    projectParties = [];
    renderAll();
    updateControls();
    setStatus('Loading daily report…', 'loading');
    showFormError('');
    try {
      const [report, partyResult] = await Promise.all([
        apiGet('dailyReport', { date, project }),
        apiGet('partyList', { projectId: projects.find((item) => item.name === project)?.id || '' })
      ]);
      projectParties = (partyResult.parties || []).filter((party) => {
        const ids = Array.isArray(party.assignedProjectIds)
          ? party.assignedProjectIds.map(String)
          : String(party.assignedProjectIds || party.assignedProjects || '').split(',').map((id) => id.trim());
        return ids.includes(String(projects.find((item) => item.name === project)?.id || '')) &&
          String(party.status || 'Active').toLowerCase() === 'active';
      });
      reportId = report.found ? String(report.reportId || '') : '';
      lists.workforce = (report.workforce || []).map((row) => ({ ...row, id: newId() }));
      lists.material = (report.materials || []).map((row) => ({ ...row, id: newId() }));
      lists.cashFlow = (report.cashFlow || []).map((row) => ({ ...row, id: newId() }));
      remarks = report.remarks || '';
      renderAll();
      dirty = false;
      lastProjectValue = project;
      lastDateValue = dateInput.value;
      setStatus(reportId ? 'Saved to server · existing report loaded' : 'New report · Draft', reportId ? 'saved' : 'draft');
    } catch (error) {
      setStatus(error.message || 'Unable to load this report.', 'error');
      showFormError(error.message || 'Unable to load this report.');
      lastProjectValue = project;
      lastDateValue = dateInput.value;
    } finally {
      loading = false;
      updateControls();
    }
  }

  function rowActions(kind, id) {
    return `<div class="record-actions"><button type="button" data-edit="${kind}" data-id="${escapeHtml(id)}">Edit</button><button type="button" data-delete="${kind}" data-id="${escapeHtml(id)}">Delete</button></div>`;
  }

  function renderList(elementId, items, renderer, emptyMessage) {
    const element = document.getElementById(elementId);
    element.innerHTML = items.length ? items.map(renderer).join('') : `<div class="record-empty">${escapeHtml(emptyMessage)}</div>`;
  }

  function renderAll() {
    renderList('workforceList', lists.workforce, (item) => {
      const total = num(item.count) * num(item.rate);
      return `<div class="report-record"><div class="record-main"><div class="record-title">${escapeHtml(item.contractor || 'Unassigned contractor')} · ${escapeHtml(item.name)}</div><div class="record-detail">${escapeHtml(item.count)} persons × ${amount(item.rate)}</div></div><strong class="record-amount">${amount(total)}</strong>${rowActions('workforce', item.id)}</div>`;
    }, 'No workforce entries');
    const workforceTotal = lists.workforce.reduce((sum, item) => sum + num(item.count) * num(item.rate), 0);
    document.getElementById('workforceTotal').textContent = amount(workforceTotal);

    renderList('materialList', lists.material, (item) => {
      const total = num(item.quantity) * num(item.cost);
      return `<div class="report-record"><div class="record-main"><div class="record-title">${escapeHtml(item.name)}</div><div class="record-detail">${escapeHtml(item.vendor)} · ${escapeHtml(item.quantity)} ${escapeHtml(item.unit || '')} × ${amount(item.cost)}${item.description ? ` · ${escapeHtml(item.description)}` : ''}</div></div><strong class="record-amount">${amount(total)}</strong>${rowActions('material', item.id)}</div>`;
    }, 'No material entries');
    document.getElementById('materialTotal').textContent = amount(lists.material.reduce((sum, item) => sum + num(item.quantity) * num(item.cost), 0));

    renderList('cashFlowList', lists.cashFlow, (item) => {
      const direction = item.flowType === 'IN' ? 'in' : 'out';
      return `<div class="report-record"><div class="record-main"><div class="record-title">${escapeHtml(item.paidTo)}</div><div class="record-detail">${escapeHtml(item.flowType)} · ${escapeHtml(item.paymentMode)}${item.note ? ` · ${escapeHtml(item.note)}` : ''}</div></div><strong class="record-amount ${direction}">${item.flowType === 'IN' ? '+' : '−'}${amount(item.amount)}</strong>${rowActions('cashFlow', item.id)}</div>`;
    }, 'No cash flow entries');
    document.getElementById('cashInTotal').textContent = amount(lists.cashFlow.filter((item) => item.flowType === 'IN').reduce((sum, item) => sum + num(item.amount), 0));
    document.getElementById('cashOutTotal').textContent = amount(lists.cashFlow.filter((item) => item.flowType !== 'IN').reduce((sum, item) => sum + num(item.amount), 0));
    document.getElementById('reportRemarks').value = remarks;
  }

  function optionList(items, valueKey, labelKey, selected, includeSelected = true) {
    const options = [...items];
    if (includeSelected && selected && !options.some((item) => String(item[valueKey]) === String(selected))) {
      options.unshift({ [valueKey]: selected, [labelKey]: selected });
    }
    return options.map((item) => `<option value="${escapeHtml(item[valueKey])}"${String(item[valueKey]) === String(selected) ? ' selected' : ''}>${escapeHtml(item[labelKey])}</option>`).join('');
  }

  function entryField(name, label, input, full = false) {
    return `<label class="entry-field${full ? ' full' : ''}"><span>${escapeHtml(label)}</span>${input}</label>`;
  }

  function selectInput(name, label, options, selected, prompt, full = false) {
    const choices = `<option value="">${escapeHtml(prompt)}</option>${options}`;
    return entryField(name, label, `<select name="${name}" data-entry-field="${name}" required>${choices}</select>`, full);
  }

  function textInput(name, label, value, placeholder, type = 'text', full = false, extra = '') {
    return entryField(name, label, `<input name="${name}" data-entry-field="${name}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${extra} required>`, full);
  }

  function openEditor(kind, id = '') {
    if (!projectSelect.value) return;
    editorKind = kind;
    editorId = id;
    const current = id ? lists[kind].find((item) => item.id === id) : null;
    const existingValue = (key, fallback = '') => current?.[key] ?? fallback;
    let fields = '';
    if (kind === 'workforce') {
      const contractors = projectParties.filter((party) => String(party.type).toLowerCase() === 'contractor');
      const contractorOptions = optionList(contractors, 'name', 'name', existingValue('contractor'), true);
      const workforceOptions = optionList(workforceTypes, 'name', 'name', existingValue('name'), true);
      fields += selectInput('contractor', 'Contractor', contractorOptions, '', 'Select contractor', true);
      fields += selectInput('name', 'Workforce type', workforceOptions, '', 'Select workforce type');
      fields += textInput('count', 'Person count', existingValue('count', '1'), '0', 'number', false, 'min="1" step="1"');
      fields += textInput('rate', 'Rate per person (₹)', existingValue('rate', '0'), '0', 'number', false, 'min="0" step="0.01"');
    } else if (kind === 'material') {
      const vendors = projectParties.filter((party) => ['supplier', 'contractor'].includes(String(party.type).toLowerCase()));
      const vendorOptions = optionList(vendors, 'name', 'name', existingValue('vendor'), true);
      const materialOptions = optionList(materialTypes, 'name', 'name', existingValue('name'), true);
      fields += selectInput('vendor', 'Supplier / Contractor', vendorOptions, '', 'Select Supplier', true);
      fields += selectInput('name', 'Material', materialOptions, '', 'Select material', true);
      fields += textInput('quantity', 'Quantity', existingValue('quantity', '1'), '0', 'number', false, 'min="0.01" step="0.01"');
      fields += textInput('cost', 'Unit price (₹)', existingValue('cost', '0'), '0', 'number', false, 'min="0" step="0.01"');
      fields += entryField('description', 'Description', `<textarea name="description" data-entry-field="description" placeholder="Add a description (optional)">${escapeHtml(existingValue('description'))}</textarea>`, true);
    } else {
      const partyOptions = projectParties.map((party) => ({ name: party.name, value: party.name }));
      const paidTo = existingValue('paidTo');
      const existingParty = partyOptions.some((party) => party.value === paidTo);
      const selectedParty = existingParty ? paidTo : '__other__';
      const selectOptions = partyOptions.map((party) => `<option value="${escapeHtml(party.value)}"${party.value === selectedParty ? ' selected' : ''}>${escapeHtml(party.name)}</option>`).join('') + `<option value="__other__"${selectedParty === '__other__' ? ' selected' : ''}>Other / Miscellaneous</option>`;
      fields += selectInput('paidToChoice', 'Paid To / Received From', selectOptions, '', 'Select party', true);
      fields += textInput('paidToOther', 'Expense / person name', selectedParty === '__other__' ? paidTo : '', 'Enter name', 'text', true);
      fields += textInput('amount', 'Amount (₹)', existingValue('amount'), '0', 'number', false, 'min="0.01" step="0.01"');
      const modes = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Others'].map((value) => ({ value, label: value }));
      fields += selectInput('paymentMode', 'Payment mode', optionList(modes, 'value', 'label', existingValue('paymentMode', 'Cash'), true), '', 'Choose mode');
      const flows = [{ value: 'OUT', label: 'OUT' }, { value: 'IN', label: 'IN' }];
      fields += selectInput('flowType', 'Cash flow', optionList(flows, 'value', 'label', existingValue('flowType', 'OUT'), true), '', 'IN / OUT');
      fields += entryField('note', 'Note', `<textarea name="note" data-entry-field="note" placeholder="Optional note">${escapeHtml(existingValue('note'))}</textarea>`, true);
    }
    document.getElementById('entryDialogTitle').textContent = `${current ? 'Edit' : 'Add'} ${kind === 'cashFlow' ? 'Cash Flow' : kind === 'material' ? 'Material' : 'Workforce'}`;
    entryFields.innerHTML = fields;
    // Set select values after markup creation.
    const selected = current || {};
    if (kind === 'workforce') {
      entryFields.querySelector('[name="contractor"]').value = selected.contractor || '';
      entryFields.querySelector('[name="name"]').value = selected.name || '';
    } else if (kind === 'material') {
      entryFields.querySelector('[name="vendor"]').value = selected.vendor || '';
      entryFields.querySelector('[name="name"]').value = selected.name || '';
    } else {
      entryFields.querySelector('[name="paidToChoice"]').value = selectedPartyFor(current);
      entryFields.querySelector('[name="paymentMode"]').value = selected.paymentMode || 'Cash';
      entryFields.querySelector('[name="flowType"]').value = selected.flowType || 'OUT';
      updateOtherPayeeVisibility();
    }
    entryDialog.showModal();
  }

  function selectedPartyFor(item) {
    if (!item) return '';
    return projectParties.some((party) => party.name === item.paidTo) ? item.paidTo : '__other__';
  }

  function updateOtherPayeeVisibility() {
    const select = entryFields.querySelector('[name="paidToChoice"]');
    const otherInput = entryFields.querySelector('[name="paidToOther"]');
    const other = otherInput?.closest('.entry-field');
    if (other) {
      other.hidden = select?.value !== '__other__';
      otherInput.required = select?.value === '__other__';
    }
  }

  function closeEditor() {
    if (entryDialog.open) entryDialog.close();
    entryForm.reset();
    editorKind = '';
    editorId = '';
  }

  function signOut(showLogin = true) {
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem(userKey);
    if (showLogin) window.location.replace('login.html');
  }

  projectSelect.addEventListener('change', () => {
    if (dirty && !window.confirm('Discard unsaved report changes and switch projects?')) {
      projectSelect.value = lastProjectValue;
      return;
    }
    lastProjectValue = projectSelect.value;
    loadReport();
  });

  dateInput.addEventListener('change', () => {
    if (dirty && !window.confirm('Discard unsaved report changes and switch dates?')) {
      dateInput.value = lastDateValue;
      return;
    }
    lastDateValue = dateInput.value;
    loadReport();
  });

  document.getElementById('reportRemarks').addEventListener('input', (event) => {
    remarks = event.target.value;
    markDirty();
  });

  workspace.addEventListener('click', (event) => {
    const addButton = event.target.closest('[data-add]');
    if (addButton) return openEditor(addButton.dataset.add);
    const editButton = event.target.closest('[data-edit]');
    if (editButton) return openEditor(editButton.dataset.edit, editButton.dataset.id);
    const deleteButton = event.target.closest('[data-delete]');
    if (deleteButton) {
      const kind = deleteButton.dataset.delete;
      const id = deleteButton.dataset.id;
      lists[kind] = lists[kind].filter((item) => item.id !== id);
      renderAll();
      markDirty();
    }
  });

  entryFields.addEventListener('change', (event) => {
    if (event.target.name === 'paidToChoice') updateOtherPayeeVisibility();
    if (event.target.name === 'name' && editorKind === 'material') {
      const material = materialTypes.find((item) => item.name === event.target.value);
      const quantityField = entryFields.querySelector('[name="quantity"]');
      const current = editorId ? lists.material.find((item) => item.id === editorId) : null;
      if (material && !current) quantityField.dataset.unit = material.unit || 'Nos';
    }
  });

  entryForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const read = (name) => entryFields.querySelector(`[data-entry-field="${name}"]`)?.value.trim() || '';
    let item;
    if (editorKind === 'workforce') {
      item = { id: editorId || newId(), contractor: read('contractor'), name: read('name'), count: read('count'), rate: read('rate') };
      if (!item.contractor || !item.name || Number(item.count) <= 0 || Number(item.rate) < 0) return;
    } else if (editorKind === 'material') {
      const type = materialTypes.find((row) => row.name === read('name'));
      const current = editorId ? lists.material.find((row) => row.id === editorId) : null;
      item = {
        id: editorId || newId(), vendor: read('vendor'), name: read('name'), quantity: read('quantity'),
        unit: current?.unit || type?.unit || 'Nos', cost: read('cost'), description: read('description')
      };
      if (!item.vendor || !item.name || Number(item.quantity) <= 0 || Number(item.cost) < 0) return;
    } else {
      const choice = read('paidToChoice');
      item = {
        id: editorId || newId(), paidTo: choice === '__other__' ? read('paidToOther') : choice,
        amount: read('amount'), paymentMode: read('paymentMode'), flowType: read('flowType'), note: read('note')
      };
      if (!item.paidTo || Number(item.amount) <= 0 || !['IN', 'OUT'].includes(item.flowType)) return;
    }
    const index = lists[editorKind].findIndex((row) => row.id === item.id);
    if (index < 0) lists[editorKind].push(item);
    else lists[editorKind][index] = item;
    renderAll();
    closeEditor();
    markDirty();
  });

  document.getElementById('entryDialogClose').addEventListener('click', closeEditor);
  document.getElementById('entryCancel').addEventListener('click', closeEditor);
  entryDialog.addEventListener('click', (event) => { if (event.target === entryDialog) closeEditor(); });
  document.getElementById('reportLogoutButton').addEventListener('click', () => signOut(true));

  saveButton.addEventListener('click', async () => {
    showFormError('');
    const project = projectSelect.value;
    const date = isoToAppDate(dateInput.value);
    const hasContent = lists.workforce.length || lists.material.length || lists.cashFlow.length || remarks.trim();
    if (!project || !date) return showFormError('Select a project and report date.');
    if (!hasContent) return showFormError('Enter at least one report item or a remark.');
    const invalidWorkforce = lists.workforce.some((item) => !item.name || !item.contractor || Number(item.count) <= 0 || Number(item.rate) < 0);
    if (invalidWorkforce) return showFormError('Check workforce name, contractor, count and rate.');
    const invalidMaterials = lists.material.some((item) => !item.name || !item.vendor || Number(item.quantity) <= 0 || Number(item.cost) < 0);
    if (invalidMaterials) return showFormError('Check material, supplier, quantity and rate.');
    const invalidCashFlow = lists.cashFlow.some((item) => !item.paidTo || Number(item.amount) <= 0 || !['IN', 'OUT'].includes(item.flowType));
    if (invalidCashFlow) return showFormError('Check cash flow party, amount and IN/OUT.');

    saving = true;
    updateControls();
    setStatus('Saving report…', 'saving');
    const payload = {
      token: token(), date, project, remarks,
      workforce: lists.workforce.map(({ name, count, rate, contractor }) => ({ name, count, rate, contractor })),
      materials: lists.material.map(({ name, quantity, unit, cost, vendor, description }) => ({ name, quantity, unit, cost, vendor, description })),
      cashFlow: lists.cashFlow.map(({ paidTo, amount: value, paymentMode, flowType, note }) => ({ paidTo, amount: value, paymentMode, flowType, note }))
    };
    if (reportId) {
      payload.action = 'updateReport';
      payload.reportId = reportId;
    }
    try {
      const result = await apiPost(payload);
      reportId = result.reportId || reportId;
      dirty = false;
      setStatus(reportId ? 'Saved to server' : 'Report saved', 'saved');
      showFormError('');
    } catch (error) {
      setStatus('Unable to save report', 'error');
      showFormError(error.message || 'Unable to save report.');
    } finally {
      saving = false;
      updateControls();
    }
  });

  try {
    const storedToken = token();
    const storedUser = JSON.parse(sessionStorage.getItem(userKey) || '{}');
    if (storedToken && storedUser.username) {
      user = storedUser;
      setWorkspaceVisible();
    } else {
      window.location.replace('login.html');
    }
  } catch (_) {
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem(userKey);
    window.location.replace('login.html');
  }
})();
