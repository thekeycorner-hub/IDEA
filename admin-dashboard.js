(() => {
  const config = window.IDEA_SITE_CONFIG || {};
  const apiUrl = String(config.API_URL || '').trim();
  const tokenKey = 'ideaReportAuthToken';
  const userKey = 'ideaReportAuthUser';
  const token = sessionStorage.getItem(tokenKey) || '';
  let user = {};
  try { user = JSON.parse(sessionStorage.getItem(userKey) || '{}'); } catch (_) { user = {}; }
  if (!token || !user.username) { window.location.replace('login.html'); return; }
  if (user.role !== 'Admin') { window.location.replace('daily-report.html'); return; }

  let explicitLogout = false;
  window.addEventListener('beforeunload', (event) => {
    if (explicitLogout) return;
    event.preventDefault();
    event.returnValue = '';
  });
  window.addEventListener('pagehide', () => {
    if (explicitLogout) return;
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem(userKey);
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && (!sessionStorage.getItem(tokenKey) || !sessionStorage.getItem(userKey))) {
      window.location.replace('login.html');
    }
  });

  const state = { projects: [], parties: [], materials: [], workforce: [], users: [], tasks: [], summary: null, page: 'overview' };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0);
  const number = (value) => Number(value) || 0;
  let alertTimer = 0;
  let editing = { kind: '', id: '' };
  let taskEditing = null;

  $('#adminSidebarUser').textContent = `${user.displayName || user.username} · Admin`;

  function notify(message, error = false) {
    const el = $('#adminAlert');
    el.textContent = message;
    el.classList.toggle('error', error);
    el.classList.add('visible');
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => el.classList.remove('visible'), 4200);
  }

  function showSecret(title, message, value) {
    $('#adminSecretTitle').textContent = title;
    $('#adminSecretMessage').textContent = message;
    $('#adminSecretValue').textContent = value || '';
    $('#adminSecretDialog').showModal();
  }

  async function get(action, params = {}) {
    const url = new URL(apiUrl);
    url.searchParams.set('action', action);
    url.searchParams.set('token', token);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    const result = await response.json();
    if (!result.success) throw new Error(result.message || 'Unable to load admin data.');
    return result;
  }

  async function post(payload) {
    const response = await fetch(apiUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ ...payload, token })
    });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    const result = await response.json();
    if (!result.success) throw new Error(result.message || 'Unable to save changes.');
    return result;
  }

  function closeSidebar() {
    $('#adminSidebar')?.classList.remove('open');
    $('#adminSidebarScrim')?.classList.remove('visible');
    $('#adminMenuToggle')?.setAttribute('aria-expanded', 'false');
  }

  function setPage(page) {
    state.page = page;
    const view = page.endsWith('-library') ? 'library' : page;
    document.body.classList.toggle('tasks-page-active', view === 'tasks');
    $$('.admin-page').forEach((el) => el.classList.toggle('active', el.dataset.view === view));
    $$('.admin-nav [data-page]').forEach((el) => el.classList.toggle('active', el.dataset.page === page));
    const titles = { overview: 'Dashboard', projects: 'Projects', tasks: 'Task Schedules', 'party-library': 'Party Library', 'material-library': 'Material Library', 'workforce-library': 'Workforce Library', users: 'User management' };
    if (view === 'library') {
      const selectedLibrary = page === 'party-library' ? 'party' : page === 'material-library' ? 'material' : page === 'workforce-library' ? 'workforce' : 'all';
      $('#adminLibraryGrid').dataset.libraryView = selectedLibrary;
      $('#libraryPageTitle').textContent = titles[page] || 'Libraries';
      $('#libraryPageDescription').textContent = selectedLibrary === 'party' ? 'Manage parties, types, contacts, and project assignments.' : selectedLibrary === 'material' ? 'Manage material names, units, and active status.' : selectedLibrary === 'workforce' ? 'Manage workforce types, rates, and active status.' : 'Manage parties, materials, and workforce types.';
    }
    if (view === 'overview' && $('#summaryProjectSelect').value && state.summary?.project?.id !== $('#summaryProjectSelect').value) loadProjectSummary($('#summaryProjectSelect').value);
    if (view === 'tasks' && $('#summaryProjectSelect').value) loadProjectTasks($('#summaryProjectSelect').value);
    closeSidebar();
  }

  function statusPill(status) {
    const value = String(status || 'Active');
    const type = value.toLowerCase() === 'active' ? '' : value.toLowerCase() === 'inactive' ? 'inactive' : 'other';
    return `<span class="admin-status ${type}">${escapeHtml(value)}</span>`;
  }

  function rowActions(kind, id, extras = '') {
    return `<div class="admin-row-actions"><button type="button" data-action="edit" data-kind="${kind}" data-id="${escapeHtml(id)}">Edit</button>${extras}</div>`;
  }

  function renderOverview() {
    const stats = { overviewProjects: state.projects.filter((p) => p.status === 'Active').length, overviewParties: state.parties.length, overviewMaterials: state.materials.length, overviewUsers: state.users.filter((u) => u.status === 'Active').length };
    Object.entries(stats).forEach(([id, value]) => { const el = $(`#${id}`); if (el) el.textContent = value; });
  }

  function filtered(items, queryId, statusId, fields) {
    const query = String($(queryId)?.value || '').trim().toLowerCase();
    const status = String($(statusId)?.value || '');
    return items.filter((item) => (!status || item.status === status) && (!query || fields.some((key) => String(item[key] || '').toLowerCase().includes(query))));
  }

  function renderProjects() {
    const rows = filtered(state.projects, '#projectSearch', '#projectStatusFilter', ['id', 'name', 'client', 'location', 'scope', 'status']);
    $('#projectsRows').innerHTML = rows.length ? rows.map((p) => `<tr><td><div class="admin-cell-title">${escapeHtml(p.name)}</div><div class="admin-cell-sub">${escapeHtml(p.id)}</div></td><td>${escapeHtml(p.client || '—')}</td><td>${escapeHtml(p.location || '—')}</td><td>${statusPill(p.status)}</td><td>${escapeHtml(p.pmcPercent || '0')}% / ${escapeHtml(p.gstPercent || '0')}%</td><td>${rowActions('project', p.id, `<button type="button" data-action="client-access" data-id="${escapeHtml(p.id)}">Access code</button>`)}</td></tr>`).join('') : '<tr><td class="empty" colspan="6">No matching projects</td></tr>';
  }

  function assignedProjectNames(party) {
    const ids = Array.isArray(party.assignedProjectIds) ? party.assignedProjectIds.map(String) : String(party.assignedProjectIds || '').split(',').map((v) => v.trim());
    return ids.map((id) => state.projects.find((project) => project.id === id)?.name || id).join(', ') || '—';
  }

  function renderParties() {
    const rows = filtered(state.parties, '#partySearch', '#partyStatusFilter', ['id', 'name', 'type', 'mobile', 'address']);
    $('#partiesRows').innerHTML = rows.length ? rows.map((p) => `<tr><td><div class="admin-cell-title">${escapeHtml(p.name)}</div><div class="admin-cell-sub">${escapeHtml(p.id)}</div></td><td>${escapeHtml(p.type || 'Others')}</td><td>${escapeHtml(p.mobile || '—')}</td><td>${escapeHtml(assignedProjectNames(p))}</td><td>${statusPill(p.status)}</td><td>${rowActions('party', p.id)}</td></tr>`).join('') : '<tr><td class="empty" colspan="6">No matching parties</td></tr>';
  }

  function renderMaterials() {
    const rows = filtered(state.materials, '#materialSearch', '#materialStatusFilter', ['id', 'name', 'unit', 'status']);
    $('#materialsRows').innerHTML = rows.length ? rows.map((m) => `<tr><td><div class="admin-cell-title">${escapeHtml(m.name)}</div><div class="admin-cell-sub">${escapeHtml(m.id)}</div></td><td>${escapeHtml(m.unit || '—')}</td><td>${statusPill(m.status)}</td><td>${rowActions('material', m.id)}</td></tr>`).join('') : '<tr><td class="empty" colspan="4">No matching materials</td></tr>';
  }

  function renderWorkforce() {
    const rows = filtered(state.workforce, '#workforceSearch', '#workforceStatusFilter', ['id', 'name', 'category', 'unit', 'status']);
    $('#workforceRows').innerHTML = rows.length ? rows.map((w) => `<tr><td><div class="admin-cell-title">${escapeHtml(w.name)}</div><div class="admin-cell-sub">${escapeHtml(w.id)}</div></td><td>${escapeHtml(w.category || '—')}</td><td>${escapeHtml(w.unit || '—')}</td><td>${money(w.defaultRate)}</td><td>${statusPill(w.status)}</td><td>${rowActions('workforce', w.id)}</td></tr>`).join('') : '<tr><td class="empty" colspan="6">No matching workforce types</td></tr>';
  }

  function renderUsers() {
    const rows = filtered(state.users, '#userSearch', '#userStatusFilter', ['id', 'username', 'displayName', 'role', 'status']);
    $('#usersRows').innerHTML = rows.length ? rows.map((u) => `<tr><td><div class="admin-cell-title">${escapeHtml(u.displayName)}</div><div class="admin-cell-sub">${escapeHtml(u.id)}</div></td><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.role)}</td><td>${statusPill(u.status)}</td><td>${rowActions('user', u.id, `<button type="button" data-action="reset-password" data-id="${escapeHtml(u.id)}">Reset password</button>${u.status === 'Active' && u.id !== user.id ? `<button type="button" data-action="deactivate-user" data-id="${escapeHtml(u.id)}">Deactivate</button>` : ''}`)}</td></tr>`).join('') : '<tr><td class="empty" colspan="5">No matching users</td></tr>';
  }

  function renderProjectTasks() {
    const project = state.projects.find((item) => item.id === $('#summaryProjectSelect').value);
    $('#taskListProject').textContent = project ? `Tasks · ${project.name}` : 'Project Tasks';
    const rows = state.tasks;
    $('#taskSchedulesRows').innerHTML = rows.length ? rows.map((task) => {
      const progress = Math.max(0, Math.min(100, number(task.progress)));
      const taskStatus = progress >= 100 ? 'Completed' : progress > 0 ? 'In progress' : 'Not started';
      return `<tr><td><div class="admin-cell-title">${escapeHtml(task.title)}</div>${task.description ? `<div class="admin-cell-sub">${escapeHtml(task.description)}</div>` : ''}</td><td>${escapeHtml(task.startDate)}</td><td>${escapeHtml(task.endDate)}</td><td><div class="admin-task-progress"><span><i style="width:${progress}%"></i></span><b>${taskStatus} · ${progress}%</b></div></td><td class="admin-task-comments">${escapeHtml(task.comments || '—')}</td><td><button type="button" class="admin-task-edit-button" data-edit-task="${escapeHtml(task.taskId)}">Edit</button></td></tr>`;
    }).join('') : '<tr><td class="empty" colspan="6">No tasks scheduled for this project.</td></tr>';
  }

  async function loadProjectTasks(projectId) {
    if (!projectId) { state.tasks = []; renderProjectTasks(); return; }
    $('#taskSchedulesRows').innerHTML = '<tr><td class="empty" colspan="6">Loading tasks…</td></tr>';
    try {
      const result = await get('projectTasks', { projectId });
      state.tasks = result.tasks || [];
      renderProjectTasks();
    } catch (error) {
      $('#taskSchedulesRows').innerHTML = `<tr><td class="empty" colspan="6">${escapeHtml(error.message || 'Unable to load tasks.')}</td></tr>`;
    }
  }

  function renderAll() { renderOverview(); renderProjects(); renderParties(); renderMaterials(); renderWorkforce(); renderUsers(); }

  function renderProjectSummary(result, selectedMonth = 'all') {
    const p = result.project || {};
    const months = result.months || {};
    const monthKeys = Object.keys(months).sort().reverse();
    const selectedKeys = selectedMonth === 'all' ? monthKeys : (months[selectedMonth] ? [selectedMonth] : []);
    const totals = selectedKeys.reduce((sum, key) => {
      const m = months[key] || {};
      sum.workforce += number(m.workforceBillAmount);
      sum.material += (m.materials || []).reduce((s, item) => s + number(item.total), 0);
      sum.cashIn += number(m.cashIn); sum.cashOut += number(m.cashOut);
      sum.reports += (m.reports || []).length;
      sum.remarks += (m.remarks || []).length;
      sum.materialEntries += (m.materials || []).length;
      return sum;
    }, { workforce: 0, material: 0, cashIn: 0, cashOut: 0, reports: 0, remarks: 0, materialEntries: 0 });
    const materialMap = new Map(); const reports = []; const remarks = [];
    selectedKeys.forEach((key) => {
      const m = months[key] || {};
      (m.materials || []).forEach((item) => {
        const name = String(item.name || '').trim();
        const k = name.toLowerCase(); const current = materialMap.get(k) || { name, unit: item.unit || '', quantity: 0, total: 0 };
        current.quantity += number(item.quantity); current.total += number(item.total); materialMap.set(k, current);
      });
      (m.reports || []).forEach((report) => reports.push({ ...report, month: key }));
      (m.remarks || []).forEach((remark) => remarks.push({ ...remark, month: key }));
    });
    const parties = selectedMonth === 'all' ? (result.parties || []) : ((months[selectedMonth] || {}).parties || result.parties || []);
    const currency = (x) => money(x);
    const summaryTables = new Map();
    const tableRows = (headers, rows) => rows.length ? rows.map((row) => `<tr>${row.map((value) => `<td>${value}</td>`).join('')}</tr>`).join('') : `<tr><td class="empty" colspan="${headers.length}">No records</td></tr>`;
    const table = (title, headers, rows, icon = '', popupHeaders = headers, popupRows = rows, popupMonthRows = null) => {
      summaryTables.set(title, { headers: popupHeaders, rows: popupRows, monthRows: popupMonthRows });
      return `<article class="admin-summary-card"><div class="admin-summary-card-head"><h3>${icon ? `<span>${icon}</span>` : ''}${escapeHtml(title)}</h3>${rows.length ? `<button type="button" class="admin-summary-view" data-summary-view="${escapeHtml(title)}">View All</button>` : ''}</div><div class="admin-summary-table-wrap"><table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.slice(0, 6).map((row) => `<tr>${row.map((value) => `<td>${value}</td>`).join('')}</tr>`).join('') : `<tr><td class="empty" colspan="${headers.length}">No records</td></tr>`}</tbody></table></div></article>`;
    };
    const materialRecords = [...materialMap.values()];
    const materialRows = materialRecords.map((m) => [`<strong>${escapeHtml(m.name)}</strong>`, `${escapeHtml(m.quantity)} ${escapeHtml(m.unit || '')}`, currency(m.total)]);
    const partyRows = parties.map((v) => [`<strong>${escapeHtml(v.name)}</strong>`, escapeHtml(v.type || '—'), currency(v.balance)]);
    const selectedProjectId = String(p.id || $('#summaryProjectSelect').value || '');
    const ledgerButton = (partyId, partyName) => partyId
      ? `<button type="button" class="admin-ledger-button" data-ledger-party-id="${escapeHtml(partyId)}" data-ledger-party-name="${escapeHtml(partyName)}" data-ledger-project-id="${escapeHtml(selectedProjectId)}">View ledger</button>`
      : '<span class="admin-ledger-unavailable">—</span>';
    const materialPopupRows = materialRecords.map((m) => [`<strong>${escapeHtml(m.name)}</strong>`, `${escapeHtml(m.quantity)} ${escapeHtml(m.unit || '')}`, currency(m.total), `<button type="button" class="admin-ledger-button" data-ledger-material-name="${escapeHtml(m.name)}" data-ledger-project-id="${escapeHtml(selectedProjectId)}" data-ledger-month="${escapeHtml(selectedMonth)}">View ledger</button>`]);
    const partyPopupRows = parties.map((party) => {
      const billAmount = number(party.billAmount);
      const amountPaid = number(party.amountPaid);
      const calculatedBalance = Math.max(0, billAmount - amountPaid);
      const advancePaid = Math.max(0, amountPaid - billAmount);
      return [`<strong>${escapeHtml(party.name)}</strong>`, escapeHtml(party.type || '—'), currency(billAmount), currency(amountPaid), currency(calculatedBalance), currency(advancePaid), ledgerButton(party.partyId || party.id, party.name)];
    });
    const partyTotals = parties.reduce((totals, party) => {
      const billAmount = number(party.billAmount);
      const amountPaid = number(party.amountPaid);
      totals.billAmount += billAmount;
      totals.amountPaid += amountPaid;
      totals.balance += Math.max(0, billAmount - amountPaid);
      totals.advancePaid += Math.max(0, amountPaid - billAmount);
      return totals;
    }, { billAmount: 0, amountPaid: 0, balance: 0, advancePaid: 0 });
    if (parties.length) partyPopupRows.push(['<strong>Total</strong>', '', `<strong>${currency(partyTotals.billAmount)}</strong>`, `<strong>${currency(partyTotals.amountPaid)}</strong>`, `<strong>${currency(partyTotals.balance)}</strong>`, `<strong>${currency(partyTotals.advancePaid)}</strong>`, '']);
    const reportRow = (v) => [escapeHtml(v.date), escapeHtml(v.workforce || v.workforceCount || 0), currency(Math.max(0, number(v.expenditure) - number(v.materialCost))), currency(v.materialCost), currency(v.expenditure)];
    const remarkRow = (v) => [escapeHtml(v.date), `<span class="admin-preserve-lines">${escapeHtml(v.text)}</span>`];
    const reportRows = reports.sort((a,b) => String(b.isoDate || b.date).localeCompare(String(a.isoDate || a.date))).map(reportRow);
    const remarkRows = remarks.sort((a,b) => String(b.isoDate || b.date).localeCompare(String(a.isoDate || a.date))).map(remarkRow);
    const reportPopupMonthRows = monthKeys.flatMap((key) => (months[key]?.reports || []).map((v) => ({ month: key, sortDate: String(v.isoDate || v.date), row: reportRow(v) })))
      .sort((a,b) => b.sortDate.localeCompare(a.sortDate));
    const remarkPopupMonthRows = monthKeys.flatMap((key) => (months[key]?.remarks || []).map((v) => ({ month: key, sortDate: String(v.isoDate || v.date), row: remarkRow(v) })))
      .sort((a,b) => b.sortDate.localeCompare(a.sortDate));
    const expenditure = totals.workforce + totals.material;
    const serviceCharge = expenditure * number(p.pmcPercent) / 100;
    const serviceGst = serviceCharge * number(p.gstPercent) / 100;
    const projectTotals = monthKeys.reduce((sum, key) => {
      const month = months[key] || {};
      sum.material += (month.materials || []).reduce((amount, item) => amount + number(item.total), 0);
      sum.workforce += number(month.workforceBillAmount);
      sum.cashIn += number(month.cashIn);
      sum.cashOut += number(month.cashOut);
      return sum;
    }, { material: 0, workforce: 0, cashIn: 0, cashOut: 0 });
    const projectExpenditure = projectTotals.material + projectTotals.workforce;
    const projectServiceCharge = projectExpenditure * number(p.pmcPercent) / 100;
    const projectServiceGst = projectServiceCharge * number(p.gstPercent) / 100;
    const balance = parties.reduce((sum, party) => sum + number(party.balance), 0);
    const monthLabel = (key) => key === 'all' ? 'Total Project' : new Date(`${key}-01T12:00:00`).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    const monthOptions = `<option value="all"${selectedMonth === 'all' ? ' selected' : ''}>Total Project</option>${monthKeys.map((key) => `<option value="${escapeHtml(key)}"${key === selectedMonth ? ' selected' : ''}>${escapeHtml(monthLabel(key))}</option>`).join('')}`;
    const projectImage = String(p.imageUrl || p.Imageurl || p.image || '').trim();
    const driveId = projectImage.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([\w-]+)/)?.[1];
    const imageMarkup = `<div class="admin-project-image-placeholder"><span>🏗</span><strong>${escapeHtml(p.name || 'Project')}</strong></div><img id="adminProjectImage" alt="${escapeHtml(p.name || 'Project')} image" hidden>`;
    const trend = monthKeys.slice(0, 8).reverse().map((key) => {
      const item = months[key] || {};
      const material = (item.materials || []).reduce((sum, entry) => sum + number(entry.total), 0);
      const workforce = number(item.workforceBillAmount);
      const serviceChargeInclGst = (material + workforce) * number(p.pmcPercent) / 100 * (1 + number(p.gstPercent) / 100);
      return { key, material, workforce, serviceChargeInclGst, total: material + workforce };
    });
    const peak = Math.max(1, ...trend.map((item) => Math.max(item.total, item.serviceChargeInclGst)));
    const compactMoney = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
    const trendAmountLevels = [peak, peak * .75, peak * .5, peak * .25, 0];
    const trendGroups = trend.map((item) => `<div class="admin-trend-month" title="${escapeHtml(monthLabel(item.key))}: Material ${escapeHtml(currency(item.material))}, Workforce ${escapeHtml(currency(item.workforce))}, Service charge incl. GST ${escapeHtml(currency(item.serviceChargeInclGst))}"><div class="admin-trend-group"><span class="material" style="height:${item.material / peak * 100}%"></span><span class="workforce" style="height:${item.workforce / peak * 100}%"></span><span class="service-charge" style="height:${item.serviceChargeInclGst / peak * 100}%"></span></div></div>`).join('');
    const chartBars = trend.length ? `<div class="admin-trend-chart"><div class="admin-trend-axis">${trendAmountLevels.map((amount) => `<span>${escapeHtml(compactMoney(amount))}</span>`).join('')}</div><div class="admin-trend-plot"><div class="admin-trend-bars">${trendGroups}</div><div class="admin-trend-months">${trend.map((item) => `<span>${escapeHtml(new Date(`${item.key}-01T12:00:00`).toLocaleString('en-IN', { month: 'short' }))}</span>`).join('')}</div></div></div>` : '<div class="admin-trend-empty">No monthly data</div>';
    const recentExpense = table('Material List',['Material','Quantity','Bill Amount'],materialRows,'▧',['Material','Quantity','Bill Amount','Ledger'],materialPopupRows);
    const partyTable = table('Party List (Vendors / Contractors)',['Party','Type','Balance'],partyRows,'♧',['Party','Type','Bill Amount','Amount Paid','Balance','Advance Paid','Ledger'],partyPopupRows);
    const remarksTable = table('Recent Site Remarks',['Date','Remarks'],remarkRows,'▤',['Date','Remarks'],remarkRows,remarkPopupMonthRows);
    const reportsTable = table('Recent Daily Expenses',['Date','Workforce','Workforce Cost','Material Cost','Total'],reportRows,'▣',['Date','Workforce','Workforce Cost','Material Cost','Total'],reportRows,reportPopupMonthRows);
    const cashFlowCard = `<article class="admin-summary-card admin-cashflow-card"><div class="admin-summary-card-head"><h3><span>▥</span>Cash Flow <small>(Total Project)</small></h3></div><div class="admin-cashflow-content"><div class="admin-cashflow-items"><div><span>▧</span><b>Material</b><strong>${currency(projectTotals.material)}</strong></div><div><span>♙</span><b>Workforce</b><strong>${currency(projectTotals.workforce)}</strong></div><div><span>▣</span><b>Total Expenditure</b><strong>${currency(projectExpenditure)}</strong></div><div><span>％</span><b>Service Charge + GST</b><strong>${currency(projectServiceCharge + projectServiceGst)}</strong></div><div><span>↗</span><b>Cash In</b><strong>${currency(projectTotals.cashIn)}</strong></div><div><span>↘</span><b>Cash Out</b><strong>${currency(projectTotals.cashOut)}</strong></div></div><div class="admin-cashflow-visual"><div class="admin-trend"><strong>Monthly Expenditure Trend</strong>${chartBars}</div><div class="admin-cash-legend"><span><i class="material"></i>Materials</span><span><i class="workforce"></i>Workforce</span><span><i class="service-charge"></i>Service charge incl. GST</span></div></div></div></article>`;
    $('#projectSummaryContent').innerHTML = `
      <section class="admin-project-details-card">
        <div class="admin-project-details-content"><div class="admin-project-title-row"><div><div class="admin-project-eyebrow">PROJECT DASHBOARD</div><h2>${escapeHtml(p.name || 'Project')}</h2></div>${statusPill(p.status)}</div>
          <div class="admin-project-facts"><div><small>Project ID</small><strong>${escapeHtml(p.id || '—')}</strong></div><div><small>Client Name</small><strong>${escapeHtml(p.client || 'Client not specified')}</strong></div><div><small>Location</small><strong>${escapeHtml(p.location || '—')}</strong></div><div><small>Project By</small><strong>${escapeHtml(p.pmcContractor || p.pmcContractorName || '—')}</strong></div><div><small>Start Date</small><strong>${escapeHtml(p.startDate || '—')}</strong></div><div><small>PMC Service Charge</small><strong>${escapeHtml(p.pmcPercent || 0)}%</strong></div><div><small>GST on Service Charge</small><strong>${escapeHtml(p.gstPercent || 0)}%</strong></div></div>
        </div><div class="admin-project-image">${imageMarkup}</div>
      </section>
      <section class="admin-summary-section"><div class="admin-summary-section-head"><h2><span>▥</span>Monthly Summary</h2><select id="adminSummaryMonth" aria-label="Select summary month">${monthOptions}</select></div>
        <div class="admin-summary-kpis admin-summary-kpis-five"><article class="admin-summary-kpi blue"><span>Total Expenditure</span><strong>${currency(expenditure)}</strong><small>Material and workforce bills</small></article><article class="admin-summary-kpi green"><span>Material Bill Amount</span><strong>${currency(totals.material)}</strong><small>${totals.materialEntries} entries</small></article><article class="admin-summary-kpi blue"><span>Workforce Bill</span><strong>${currency(totals.workforce)}</strong><small>Workforce expenditure</small></article><article class="admin-summary-kpi purple"><span>Service Charge + GST</span><strong>${currency(serviceCharge + serviceGst)}</strong><small>${escapeHtml(p.gstPercent || 0)}% GST</small></article><article class="admin-summary-kpi red"><span>Outstanding Payables</span><strong>${currency(balance)}</strong><small>Party balances</small></article></div>
      </section>
      ${cashFlowCard}
      <div class="admin-summary-grid admin-summary-grid-reference">
        ${recentExpense}${partyTable}
      </div>
      <div class="admin-summary-grid admin-summary-grid-reference">
        ${reportsTable}${remarksTable}
      </div>`;
    const projectImageElement = $('#adminProjectImage');
    if (projectImageElement && projectImage) {
      projectImageElement.onerror = () => { projectImageElement.hidden = true; };
      if (driveId) loadAdminProjectImage(p.id, projectImageElement);
      else { projectImageElement.src = projectImage; projectImageElement.hidden = false; }
    }
    $('#adminSummaryMonth').addEventListener('change', (event) => renderProjectSummary(result, event.target.value));
    $$('[data-summary-view]', $('#projectSummaryContent')).forEach((button) => button.addEventListener('click', () => {
      const recordSet = summaryTables.get(button.dataset.summaryView);
      if (!recordSet) return;
      $('#adminRecordsTitle').textContent = button.dataset.summaryView;
      const monthFilter = $('#adminRecordsMonthFilter');
      monthFilter.onchange = null;
      monthFilter.hidden = !recordSet.monthRows;
      $('#adminRecordsBody').dataset.ledgerContext = '';
      $('#adminRecordsBody').classList.remove('admin-ledger-mode');
      if (recordSet.monthRows) {
        const availableMonths = [...new Set(recordSet.monthRows.map((item) => item.month))].sort().reverse();
        monthFilter.innerHTML = `<option value="all">Total Project</option>${availableMonths.map((key) => `<option value="${escapeHtml(key)}">${escapeHtml(monthLabel(key))}</option>`).join('')}`;
        monthFilter.value = selectedMonth !== 'all' && availableMonths.includes(selectedMonth) ? selectedMonth : 'all';
        const renderMonthRows = () => {
          const selected = monthFilter.value;
          const rows = recordSet.monthRows.filter((item) => selected === 'all' || item.month === selected).map((item) => item.row);
          $('#adminRecordsBody').innerHTML = `<div class="admin-records-table-wrap"><table><thead><tr>${recordSet.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${tableRows(recordSet.headers, rows)}</tbody></table></div>`;
        };
        monthFilter.onchange = renderMonthRows;
        renderMonthRows();
      } else {
        monthFilter.innerHTML = '';
        $('#adminRecordsBody').innerHTML = `<div class="admin-records-table-wrap"><table><thead><tr>${recordSet.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${tableRows(recordSet.headers, recordSet.rows)}</tbody></table></div>`;
      }
      $('#adminRecordsDialog').showModal();
    }));
  }

  async function loadAdminProjectImage(projectId, image) {
    const url = new URL(apiUrl);
    url.searchParams.set('action', 'adminProjectImage');
    url.searchParams.set('token', token);
    url.searchParams.set('projectId', projectId || '');
    try {
      const response = await fetch(url, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success || !result.dataUrl) throw new Error(result.message || 'Unable to load project image');
      image.src = result.dataUrl;
      image.hidden = false;
    } catch (_) { image.hidden = true; }
  }

  async function loadProjectSummary(projectId) {
    const host = $('#projectSummaryContent');
    if (!projectId) { state.summary = null; host.innerHTML = '<div class="admin-empty">Select a project to view its data.</div>'; return; }
    host.innerHTML = '<div class="admin-empty">Loading project data…</div>';
    try {
      const result = await get('androidProjectSummary', { projectId });
      state.summary = result;
      renderProjectSummary(result);
    } catch (error) { state.summary = null; host.innerHTML = `<div class="admin-empty">${escapeHtml(error.message || 'Unable to load project data.')}</div>`; }
  }

  function field(label, name, value = '', type = 'text', full = false, attrs = '') {
    return `<label class="admin-field${full ? ' full' : ''}"><span>${escapeHtml(label)}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${attrs}></label>`;
  }
  function selectField(label, name, choices, value = '', full = false) {
    return `<label class="admin-field${full ? ' full' : ''}"><span>${escapeHtml(label)}</span><select name="${name}">${choices.map((option) => `<option value="${escapeHtml(option.value)}"${String(option.value) === String(value) ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></label>`;
  }
  const statuses = (values) => values.map((v) => ({ value: v, label: v }));

  function openForm(kind, record = null) {
    editing = { kind, id: record?.id || '' };
    const body = $('#adminDialogBody'); let html = '';
    const statusField = (value = 'Active', values = ['Active', 'Inactive']) => selectField('Status', 'status', statuses(values), value);
    if (kind === 'user') {
      html += field('Login ID', 'username', record?.username || '', 'text', false, `autocomplete="off" ${record ? 'readonly' : 'required'} minlength="3" maxlength="40"`);
      html += field('Display name', 'displayName', record?.displayName || '', 'text', false, 'required');
      html += selectField('Role', 'role', statuses(['Supervisor', 'Admin']), record?.role || 'Supervisor');
      html += statusField(record?.status || 'Active');
    } else if (kind === 'project') {
      const contractors = state.parties.filter((p) => p.type === 'Contractor').map((p) => ({ value: p.id, label: `${p.name}${p.status === 'Active' ? '' : ' (Inactive)'}` }));
      html += field('Project name', 'name', record?.name || '', 'text', false, 'required');
      html += field('Client name', 'client', record?.client || '');
      html += field('Location', 'location', record?.location || '');
      html += field('Scope', 'scope', record?.scope || '');
      html += field('PMC %', 'pmcPercent', record?.pmcPercent || '0', 'number', false, 'min="0" max="100" step="0.01"');
      html += selectField('PMC Contractor', 'pmcContractorId', [{ value: '', label: 'None' }, ...contractors], record?.pmcContractorId || '');
      html += field('GST %', 'gstPercent', record?.gstPercent || '0', 'number', false, 'min="0" max="100" step="0.01"');
      html += field('Start date (dd/MM/yyyy)', 'startDate', record?.startDate || '');
      html += field('End date (dd/MM/yyyy)', 'endDate', record?.endDate || '');
      html += statusField(record?.status || 'Active', ['Active', 'Inactive', 'Completed', 'On Hold']);
      html += field('Image URL', 'image', record?.image || '', 'url', true);
      html += field('Drawings folder URL or ID', 'drawingsFolder', record?.drawingsFolder || '', 'text', true);
      html += field('Bills folder URL or ID', 'billsFolder', record?.billsFolder || '', 'text', true);
    } else if (kind === 'party') {
      const selected = new Set(Array.isArray(record?.assignedProjectIds) ? record.assignedProjectIds.map(String) : []);
      html += field('Party name', 'name', record?.name || '', 'text', false, 'required');
      html += selectField('Party type', 'type', statuses(['Supplier', 'Contractor', 'Client', 'Others']), record?.type || 'Supplier');
      html += field('Mobile / contact', 'mobile', record?.mobile || '');
      html += field('GSTIN', 'gstin', record?.gstin || '');
      html += field('Address', 'address', record?.address || '', 'text', true);
      html += `<label class="admin-field full"><span>Assign projects</span><div class="admin-checklist">${state.projects.map((p) => `<label><input type="checkbox" name="assignedProjectIds" value="${escapeHtml(p.id)}"${selected.has(String(p.id)) ? ' checked' : ''}>${escapeHtml(p.name)} <small>(${escapeHtml(p.id)})</small></label>`).join('') || 'No projects available'}</div></label>`;
      html += `<label class="admin-field full"><span>Notes</span><textarea name="notes">${escapeHtml(record?.notes || '')}</textarea></label>`;
      html += statusField(record?.status || 'Active');
    } else if (kind === 'material') {
      html += field('Material name', 'name', record?.name || '', 'text', false, 'required');
      html += field('Unit', 'unit', record?.unit || 'Nos', 'text', false, 'required');
      html += statusField(record?.status || 'Active');
    } else if (kind === 'workforce') {
      html += field('Workforce name', 'name', record?.name || '', 'text', false, 'required');
      html += selectField('Category', 'category', statuses(['Skilled', 'Semi-Skilled', 'Unskilled', 'Other']), record?.category || 'Skilled');
      html += field('Unit', 'unit', record?.unit || 'Person', 'text', false, 'required');
      html += field('Default rate (₹)', 'defaultRate', record?.defaultRate || '0', 'number', false, 'min="0" step="0.01"');
      html += statusField(record?.status || 'Active');
    }
    body.innerHTML = html;
    $('#adminDialogKicker').textContent = kind === 'user' ? 'USER MANAGEMENT' : 'MASTER LIBRARY';
    $('#adminDialogTitle').textContent = `${record ? 'Edit' : 'Add'} ${kind === 'user' ? 'User' : kind === 'party' ? 'Party' : kind === 'project' ? 'Project' : kind === 'material' ? 'Material' : 'Workforce Type'}`;
    $('#adminDialogSave').textContent = record ? 'Save changes' : 'Add record';
    $('#adminDialogError').textContent = '';
    $('#adminDialogError').classList.remove('visible');
    $('#adminDialog').showModal();
  }

  function formPayload(form) {
    const values = Object.fromEntries(new FormData(form).entries());
    if (editing.kind === 'party') values.assignedProjectIds = $$('input[name="assignedProjectIds"]:checked', form).map((el) => el.value);
    if (editing.id) values.id = editing.id;
    const action = { user: 'adminSaveUser', project: 'adminSaveProject', party: 'saveParty', material: 'saveMaterial', workforce: 'saveWorkforce' }[editing.kind];
    return { action, ...values };
  }

  async function reloadData() {
    const [projectResult, userResult, partyResult, materialResult, workforceResult] = await Promise.all([
      get('adminProjects'), get('adminUsers'), get('partyList'), get('materialList'), get('workforceList')
    ]);
    state.projects = projectResult.projects || [];
    state.users = userResult.users || [];
    state.parties = partyResult.parties || [];
    state.materials = materialResult.materials || [];
    state.workforce = workforceResult.workforce || [];
    const select = $('#summaryProjectSelect'); const selected = select.value;
    select.innerHTML = '<option value="">Select project</option>' + state.projects.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} · ${escapeHtml(p.id)}</option>`).join('');
    if (state.projects.some((p) => p.id === selected)) select.value = selected;
    else select.value = (state.projects.find((p) => String(p.status).toLowerCase() === 'active') || state.projects[0] || {}).id || '';
    renderAll();
    if (select.value) loadProjectSummary(select.value);
    else if (!select.value) $('#projectSummaryContent').innerHTML = '<div class="admin-empty">Add a project to view project data.</div>';
    if (state.page === 'tasks') loadProjectTasks(select.value);
  }

  $$('.admin-nav [data-page]').forEach((button) => button.addEventListener('click', () => setPage(button.dataset.page)));
  $$('[data-go]').forEach((button) => button.addEventListener('click', () => setPage(button.dataset.go)));
  $('#summaryProjectSelect').addEventListener('change', () => {
    state.summary = null;
    if (state.page === 'tasks') loadProjectTasks($('#summaryProjectSelect').value);
    else setPage('overview');
  });
  $('#taskScheduleForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const projectId = $('#summaryProjectSelect').value;
    if (!projectId) { notify('Select a project before adding tasks.', true); return; }
    const button = $('#saveTaskSchedule');
    const status = $('#taskFormStatus');
    button.disabled = true; status.textContent = 'Saving schedule…';
    try {
      await post({
        action: 'createProjectTask', projectId,
        title: $('#taskTitle').value.trim(), description: $('#taskDescription').value.trim(),
        startDate: $('#taskStartDate').value, endDate: $('#taskEndDate').value
      });
      $('#taskScheduleForm').reset(); status.textContent = 'Task schedule added.';
      await loadProjectTasks(projectId);
    } catch (error) { status.textContent = error.message || 'Unable to add task.'; }
    finally { button.disabled = false; }
  });
  function openTaskEdit(task) {
    taskEditing = task;
    $('#taskEditTitle').textContent = task.title || 'Edit task';
    $('#taskEditProgress').value = String(Math.max(0, Math.min(100, number(task.progress))));
    $('#taskEditComments').value = task.comments || '';
    $('#taskEditError').textContent = '';
    $('#taskEditError').classList.remove('visible');
    $('#taskEditDialog').showModal();
  }
  $('#taskSchedulesRows').addEventListener('click', (event) => {
    const button = event.target.closest('[data-edit-task]');
    if (!button) return;
    const task = state.tasks.find((item) => item.taskId === button.dataset.editTask);
    if (task) openTaskEdit(task);
  });
  $('#taskEditClose').addEventListener('click', () => $('#taskEditDialog').close());
  $('#taskEditCancel').addEventListener('click', () => $('#taskEditDialog').close());
  $('#taskEditDialog').addEventListener('click', (event) => { if (event.target === $('#taskEditDialog')) $('#taskEditDialog').close(); });
  $('#taskEditForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!taskEditing) return;
    const save = $('#taskEditSave'); const errorBox = $('#taskEditError');
    save.disabled = true; errorBox.textContent = ''; errorBox.classList.remove('visible');
    try {
      await post({
        action: 'adminEditProjectTask', projectId: taskEditing.projectId,
        taskId: taskEditing.taskId, progress: Number($('#taskEditProgress').value),
        comments: $('#taskEditComments').value
      });
      $('#taskEditDialog').close();
      notify('Task status and comments updated.');
      await loadProjectTasks(taskEditing.projectId);
    } catch (error) {
      errorBox.textContent = error.message || 'Unable to update task.';
      errorBox.classList.add('visible');
    } finally { save.disabled = false; }
  });
  $('#adminMenuToggle').addEventListener('click', () => {
    const open = $('#adminSidebar').classList.toggle('open');
    $('#adminSidebarScrim').classList.toggle('visible', open);
    $('#adminMenuToggle').setAttribute('aria-expanded', String(open));
  });
  $('#adminSidebarScrim').addEventListener('click', closeSidebar);
  $('#adminLogout').addEventListener('click', () => {
    explicitLogout = true;
    sessionStorage.removeItem(tokenKey); sessionStorage.removeItem(userKey); window.location.replace('login.html');
  });
  ['project', 'party', 'material', 'workforce', 'user'].forEach((kind) => {
    $$(`[data-add="${kind}"]`).forEach((button) => button.addEventListener('click', () => openForm(kind)));
  });
  ['project', 'party', 'material', 'workforce', 'user'].forEach((kind) => {
    const query = $(`#${kind}Search`); const status = $(`#${kind}StatusFilter`);
    query?.addEventListener('input', renderAll); status?.addEventListener('change', renderAll);
  });
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const record = ({ project: state.projects, party: state.parties, material: state.materials, workforce: state.workforce, user: state.users })[button.dataset.kind]?.find((item) => String(item.id) === button.dataset.id);
    try {
      if (button.dataset.action === 'edit' && record) openForm(button.dataset.kind, record);
      if (button.dataset.action === 'client-access' && record) {
        const operation = record.accessConfigured ? 'reset' : 'generate';
        if (!window.confirm(`${operation === 'reset' ? 'Reset' : 'Generate'} the client access code for ${record.name}?`)) return;
        const result = await post({ action: 'adminClientAccess', projectId: record.id, operation });
        showSecret('Client access code', result.message, result.accessCode);
        await reloadData();
      }
      if (button.dataset.action === 'reset-password' && record) {
        if (!window.confirm(`Reset the password for ${record.username}? The current session will be invalidated.`)) return;
        const result = await post({ action: 'adminResetPassword', id: record.id });
        showSecret('Temporary password', result.message, result.temporaryPassword);
      }
      if (button.dataset.action === 'deactivate-user' && record) {
        if (!window.confirm(`Deactivate ${record.username}?`)) return;
        await post({ action: 'adminDeactivateUser', id: record.id });
        notify('User deactivated.'); await reloadData();
      }
    } catch (error) { notify(error.message || 'Admin action failed.', true); }
  });
  $('#adminDialogClose').addEventListener('click', () => $('#adminDialog').close());
  $('#adminDialogCancel').addEventListener('click', () => $('#adminDialog').close());
  $('#adminDialog').addEventListener('click', (event) => { if (event.target === $('#adminDialog')) $('#adminDialog').close(); });
  $('#adminRecordsClose').addEventListener('click', () => $('#adminRecordsDialog').close());
  $('#adminRecordsBody').addEventListener('click', async (event) => {
    const materialButton = event.target.closest('[data-ledger-material-name]');
    if (materialButton) {
      const { ledgerMaterialName: materialName, ledgerProjectId: projectId, ledgerMonth: month } = materialButton.dataset;
      const body = $('#adminRecordsBody');
      body.classList.add('admin-ledger-mode');
      $('#adminRecordsMonthFilter').hidden = true;
      $('#adminRecordsTitle').textContent = `${materialName} — Material Ledger`;
      body.innerHTML = '<div class="admin-empty">Loading material records…</div>';
      try {
        const result = await get('adminMaterialHistory', { projectId, materialName, month });
        const entries = result.entries || [];
        const headers = ['Date', 'Vendor / Contractor', 'Quantity', 'Unit Cost', 'Amount', 'Description'];
        const rows = entries.map((entry) => [escapeHtml(entry.date || '—'), escapeHtml(entry.vendor || '—'), `${escapeHtml(entry.quantity)} ${escapeHtml(entry.unit || '')}`, money(entry.rate), money(entry.total), escapeHtml(entry.description || '—')]);
        const rowMarkup = rows.length ? rows.map((row) => `<tr>${row.map((value) => `<td>${value}</td>`).join('')}</tr>`).join('') : `<tr><td class="empty" colspan="${headers.length}">No matching material records</td></tr>`;
        body.innerHTML = `<div class="admin-records-table-wrap admin-ledger-scroll"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rowMarkup}</tbody></table></div><div class="admin-ledger-footer">${entries.length} record${entries.length === 1 ? '' : 's'} · Total: <strong>${money(entries.reduce((sum, entry) => sum + number(entry.total), 0))}</strong></div>`;
      } catch (error) {
        body.innerHTML = `<p class="admin-ledger-error">${escapeHtml(error.message || 'Unable to load material records.')}</p>`;
      }
      return;
    }
    const button = event.target.closest('[data-ledger-party-id]');
    if (!button) return;
    const { ledgerPartyId: partyId, ledgerPartyName: partyName, ledgerProjectId: projectId } = button.dataset;
    const body = $('#adminRecordsBody');
    const monthFilter = $('#adminRecordsMonthFilter');
    monthFilter.hidden = true;
    monthFilter.onchange = null;
    body.classList.add('admin-ledger-mode');
    body.dataset.ledgerContext = 'party-ledger';
    $('#adminRecordsTitle').textContent = `${partyName} — Ledger`;
    body.innerHTML = '<div class="admin-empty">Loading ledger…</div>';
    try {
      const result = await get('androidPartyHistory', { projectId, partyId });
      const entries = result.entries || [];
      const headers = ['Date', 'Debit / Credit', 'Material / Payment', 'Description', 'Balance'];
      const availableMonths = [...new Set(entries.map((entry) => String(entry.isoDate || '').slice(0, 7)).filter((month) => /^\d{4}-\d{2}$/.test(month)))].sort().reverse();
      const labelMonth = (month) => new Date(`${month}-01T12:00:00`).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
      monthFilter.innerHTML = `<option value="all">Total Project</option>${availableMonths.map((month) => `<option value="${escapeHtml(month)}">${escapeHtml(labelMonth(month))}</option>`).join('')}`;
      monthFilter.value = 'all';
      const renderPartyLedger = () => {
        const month = monthFilter.value;
        const filteredEntries = entries.filter((entry) => month === 'all' || String(entry.isoDate || '').startsWith(`${month}-`));
        const rows = [...filteredEntries].sort((a, b) => String(a.isoDate || '').localeCompare(String(b.isoDate || '')) || String(a.id || '').localeCompare(String(b.id || ''))).map((entry) => {
          const delta = number(entry.delta);
          const amount = money(Math.abs(delta));
          const direction = delta >= 0 ? 'Cr ' : 'Dr ';
          return [escapeHtml(entry.date || entry.isoDate || '—'), `<span class="${delta >= 0 ? 'ledger-credit' : 'ledger-debit'}">${direction}${amount}</span>`, escapeHtml(entry.item || entry.source || '—'), escapeHtml(entry.description || '—'), money(entry.runningBalance)];
        });
        const tableRows = rows.length ? rows.map((row) => `<tr>${row.map((value) => `<td>${value}</td>`).join('')}</tr>`).join('') : `<tr><td class="empty" colspan="${headers.length}">No ledger entries</td></tr>`;
        const chronologicalEntries = [...filteredEntries].sort((a, b) => String(a.isoDate || '').localeCompare(String(b.isoDate || '')));
        const closingBalance = month === 'all' ? result.balance : (chronologicalEntries.length ? chronologicalEntries[chronologicalEntries.length - 1].runningBalance : 0);
        body.innerHTML = `<div class="admin-records-table-wrap admin-ledger-scroll"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table></div><div class="admin-ledger-footer">Closing balance: <strong>${money(closingBalance)}</strong></div>`;
      };
      monthFilter.onchange = renderPartyLedger;
      monthFilter.hidden = false;
      renderPartyLedger();
    } catch (error) {
      monthFilter.hidden = true;
      body.innerHTML = `<p class="admin-ledger-error">${escapeHtml(error.message || 'Unable to load party ledger.')}</p>`;
    }
  });
  $('#adminRecordsDialog').addEventListener('click', (event) => { if (event.target === $('#adminRecordsDialog')) $('#adminRecordsDialog').close(); });
  $('#adminCloseSecret').addEventListener('click', () => $('#adminSecretDialog').close());
  $('#adminCopySecret').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#adminSecretValue').textContent); notify('Copied to clipboard.'); }
    catch (_) { notify('Copy is unavailable. Select and copy the code manually.', true); }
  });
  $('#adminDialogForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#adminDialogSave'); const errorBox = $('#adminDialogError');
    errorBox.textContent = ''; errorBox.classList.remove('visible'); button.disabled = true;
    try {
      const result = await post(formPayload(event.currentTarget));
      $('#adminDialog').close();
      if (result.temporaryPassword) showSecret('Temporary password', result.message, result.temporaryPassword);
      else notify(result.message || 'Changes saved.');
      await reloadData();
    } catch (error) { errorBox.textContent = error.message || 'Unable to save changes.'; errorBox.classList.add('visible'); }
    finally { button.disabled = false; }
  });

  if (!apiUrl) { notify('The Apps Script URL is not configured.', true); return; }
  reloadData().catch((error) => notify(error.message || 'Unable to load admin data.', true));
})();
