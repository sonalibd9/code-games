import './styles.css';
import {
  API_URL,
  deletePbcItemFile,
  deletePbcList,
  downloadPbcTemplate,
  downloadUpdatedPbcItemsExcel,
  fetchClients,
  fetchNotifications,
  fetchPbcItemFiles,
  fetchPbcItems,
  fetchPbcLists,
  fetchRequirements,
  login,
  savePbcItems,
  updatePbcItemStatus,
  uploadPbcItemFile,
  uploadPbcList,
  uploadRequirementFile,
} from './api.ts';

const root = document.getElementById('root');

const state = {
  theme: 'light',
  session: null,
  currentPage: 'login',
  clients: [],
  requirements: [],
  pbcLists: [],
  pbcAllItems: [],
  auditorNotifications: [],
  activeAuditorClientId: '',
  auditFinalisationDate: '',
  selectedPbcListId: '',
  pbcEditorRows: [],
  updatedPbcItemIds: [],
  activePbcListForClient: null,
  clientItemRows: [],
  activePbcItem: null,
  pbcItemFiles: [],
  selectedRequirementId: '',
  successMessage: '',
  errorMessage: '',
  eventSource: null,
  sseConnected: false,
  auditorLogin: {
    email: 'auditor@firm.com',
    password: 'Auditor@123',
  },
  clientLogin: {
    email: 'client.alpha@entity.com',
    password: 'Client@123',
  },
};

function initializeTheme() {
  const stored = window.localStorage.getItem('portal-theme');
  if (stored === 'dark' || stored === 'light') {
    state.theme = stored;
  } else {
    state.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme();
}

function applyTheme() {
  document.body.classList.toggle('theme-dark', state.theme === 'dark');
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  window.localStorage.setItem('portal-theme', state.theme);
  applyTheme();
  render();
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return escapeHtml(value);
  return parsed.toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return escapeHtml(value);
  return parsed.toLocaleString();
}

function normalizeDateForInput(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function inferPriorityFromRiskAssertion(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return '';

  const highSignals = ['fraud', 'material', 'going concern', 'impairment', 'significant risk', 'revenue recognition', 'litigation', 'related party', 'override'];
  const mediumSignals = ['valuation', 'estimate', 'cut-off', 'cutoff', 'accuracy', 'completeness', 'classification', 'presentation', 'disclosure', 'provision', 'tax'];

  if (highSignals.some((signal) => text.includes(signal))) return 'High';
  if (mediumSignals.some((signal) => text.includes(signal))) return 'Medium';
  return 'Low';
}

function calculateDueDate(auditFinalisationDate, priority) {
  if (!auditFinalisationDate) return '';
  const date = new Date(`${auditFinalisationDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';

  let monthsBack = 0;
  if (String(priority ?? '').toLowerCase() === 'high') monthsBack = 2;
  else if (String(priority ?? '').toLowerCase() === 'medium') monthsBack = 1;

  date.setMonth(date.getMonth() - monthsBack);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function calcPendingDays(dueDate, referenceDate) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;

  const baseDate = referenceDate ? new Date(referenceDate) : new Date();
  if (Number.isNaN(baseDate.getTime())) return null;

  due.setHours(0, 0, 0, 0);
  baseDate.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
}

function getStatusCountsForList(listId) {
  const items = state.pbcAllItems.filter((item) => item.pbcListId === listId);
  return {
    completed: items.filter((item) => item.status === 'Completed').length,
    inProgress: items.filter((item) => item.status === 'In progress').length,
    pending: items.filter((item) => item.status !== 'Completed' && item.status !== 'In progress').length,
    total: items.length,
  };
}

function getVisibleRequirements() {
  if (!state.session) return [];
  if (state.session.user.role === 'auditor') return state.requirements;
  return state.requirements.filter((item) => item.clientId === state.session.user.clientId);
}

function getVisiblePbcLists() {
  if (!state.session) return [];
  if (state.session.user.role === 'auditor') {
    return state.activeAuditorClientId
      ? state.pbcLists.filter((item) => item.clientId === state.activeAuditorClientId)
      : state.pbcLists;
  }
  return state.pbcLists.filter((item) => item.clientId === state.session.user.clientId);
}

function getSelectedClient() {
  return state.clients.find((client) => client.id === state.activeAuditorClientId) ?? null;
}

function setMessage(type, message) {
  state.successMessage = type === 'success' ? message : '';
  state.errorMessage = type === 'error' ? message : '';
}

function clearMessages() {
  state.successMessage = '';
  state.errorMessage = '';
}

function renderMessages() {
  return `
    ${state.successMessage ? `<p class="success">${escapeHtml(state.successMessage)}</p>` : ''}
    ${state.errorMessage ? `<p class="error">${escapeHtml(state.errorMessage)}</p>` : ''}
  `;
}

function disconnectNotificationStream() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  state.sseConnected = false;
}

function connectNotificationStream() {
  disconnectNotificationStream();
  if (!state.session || state.session.user.role !== 'auditor') return;

  const url = `${API_URL}/api/notifications/stream?token=${encodeURIComponent(state.session.token)}`;
  const eventSource = new EventSource(url);
  state.eventSource = eventSource;

  eventSource.addEventListener('open', () => {
    state.sseConnected = true;
    render();
  });

  eventSource.addEventListener('error', () => {
    state.sseConnected = false;
    render();
  });

  eventSource.addEventListener('snapshot', (event) => {
    try {
      state.auditorNotifications = JSON.parse(event.data);
      render();
    } catch {
      // ignore malformed data
    }
  });

  eventSource.addEventListener('notification', (event) => {
    try {
      const notification = JSON.parse(event.data);
      state.auditorNotifications = [notification, ...state.auditorNotifications.filter((item) => item.id !== notification.id)];
      render();
    } catch {
      // ignore malformed data
    }
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function loadPortalData() {
  if (!state.session) return;
  const { token, user } = state.session;
  const [requirements, pbcLists, pbcItems] = await Promise.all([
    fetchRequirements(token),
    fetchPbcLists(token),
    fetchPbcItems(token),
  ]);

  state.requirements = requirements;
  state.pbcLists = pbcLists;
  state.pbcAllItems = pbcItems;

  if (user.role === 'client') {
    state.selectedRequirementId = state.selectedRequirementId || requirements[0]?.id || '';
    state.auditorNotifications = [];
  }

  if (user.role === 'auditor') {
    const [clients, notifications] = await Promise.all([
      fetchClients(token),
      fetchNotifications(token),
    ]);
    state.clients = clients;
    state.auditorNotifications = notifications;
    if (clients.length > 0 && !state.activeAuditorClientId) {
      state.activeAuditorClientId = clients[0].id;
    }
  }

  const visibleLists = getVisiblePbcLists();
  if (!visibleLists.some((item) => item.id === state.selectedPbcListId)) {
    state.selectedPbcListId = visibleLists[visibleLists.length - 1]?.id || '';
  }
}

async function loadPbcEditorData(pbcListId) {
  if (!state.session || !pbcListId) {
    state.pbcEditorRows = [];
    return;
  }

  const rows = await fetchPbcItems(state.session.token, pbcListId);
  state.pbcEditorRows = rows.map((row) => {
    const inferredPriority = inferPriorityFromRiskAssertion(row.riskAssertion);
    const finalPriority = inferredPriority || row.priority;
    const normalizedDueDate = normalizeDateForInput(row.dueDate);
    const calculatedDueDate = state.auditFinalisationDate ? calculateDueDate(state.auditFinalisationDate, finalPriority) : normalizedDueDate;
    return {
      ...row,
      priority: finalPriority,
      dueDate: calculatedDueDate,
    };
  });
  state.updatedPbcItemIds = [];
}

async function handleLogin(expectedRole, form) {
  clearMessages();
  const email = form.querySelector('[name="email"]').value.trim();
  const password = form.querySelector('[name="password"]').value;

  try {
    const session = await login(email, password);
    if (session.user.role !== expectedRole) {
      setMessage('error', `This form is for ${expectedRole} login only.`);
      render();
      return;
    }

    state.session = session;
    state.currentPage = session.user.role === 'auditor' ? 'auditor-client-select' : 'portal';
    await loadPortalData();
    if (session.user.role === 'auditor') connectNotificationStream();
    render();
  } catch (error) {
    setMessage('error', error instanceof Error ? error.message : 'Login failed.');
    render();
  }
}

async function handleContinueToPbcWorkspace() {
  if (!state.session || !state.activeAuditorClientId) return;
  clearMessages();

  try {
    if (state.auditFinalisationDate) {
      const clientListIds = state.pbcLists.filter((list) => list.clientId === state.activeAuditorClientId).map((list) => list.id);
      const itemsNeedingSync = state.pbcAllItems.filter((item) => clientListIds.includes(item.pbcListId) && normalizeDateForInput(item.dueDate) !== calculateDueDate(state.auditFinalisationDate, item.priority));
      if (itemsNeedingSync.length > 0) {
        await savePbcItems(state.session.token, itemsNeedingSync.map((row) => ({
          id: row.id,
          requestId: row.requestId,
          description: row.description,
          priority: row.priority,
          riskAssertion: row.riskAssertion,
          owner: row.owner,
          requestedDate: row.requestedDate,
          dueDate: calculateDueDate(state.auditFinalisationDate, row.priority),
          status: row.status,
          remarks: row.remarks,
        })));
        await loadPortalData();
      }
    }

    state.currentPage = 'auditor-pbc';
    render();
  } catch (error) {
    setMessage('error', error instanceof Error ? error.message : 'Could not apply audit finalisation date.');
    render();
  }
}

async function handlePbcUpload(form) {
  if (!state.session || !state.activeAuditorClientId) return;
  clearMessages();
  const file = form.querySelector('#pbc-file')?.files?.[0];
  if (!file) {
    setMessage('error', 'Please choose an Excel or CSV PBC file.');
    render();
    return;
  }

  try {
    const uploaded = await uploadPbcList(state.session.token, state.activeAuditorClientId, file);
    await loadPortalData();
    state.selectedPbcListId = uploaded.id;
    setMessage('success', `Detailed PBC list uploaded successfully. Parsed ${uploaded.parsedItemCount ?? 0} rows.`);
    render();
  } catch (error) {
    setMessage('error', error instanceof Error ? error.message : 'Could not upload the detailed PBC list.');
    render();
  }
}

async function handleDownloadPbcTemplate() {
  if (!state.session) return;
  try {
    const blob = await downloadPbcTemplate(state.session.token, state.activeAuditorClientId || undefined);
    const client = getSelectedClient();
    const safeName = (client?.name || 'client').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadBlob(blob, `pbc-template-${safeName}.xlsx`);
  } catch (error) {
    setMessage('error', error instanceof Error ? error.message : 'Could not download PBC template.');
    render();
  }
}

async function handleDeletePbcList(pbcListId) {
  if (!state.session) return;
  const confirmed = window.confirm('Delete this uploaded PBC list? This will remove its parsed items as well.');
  if (!confirmed) return;

  clearMessages();
  try {
    await deletePbcList(state.session.token, pbcListId);
    await loadPortalData();
    if (state.selectedPbcListId === pbcListId) state.selectedPbcListId = '';
    setMessage('success', 'Detailed PBC list deleted successfully.');
    render();
  } catch (error) {
    setMessage('error', error instanceof Error ? error.message : 'Could not delete PBC list.');
    render();
  }
}

async function handleOpenPbcEditor() {
  if (!state.session || !state.selectedPbcListId) return;
  clearMessages();
  try {
    await loadPbcEditorData(state.selectedPbcListId);
    state.currentPage = 'pbc-editor';
    render();
  } catch (error) {
    setMessage('error', error instanceof Error ? error.message : 'Could not load PBC editor data.');
    render();
  }
}

async function handlePbcListSelection(pbcListId) {
  state.selectedPbcListId = pbcListId;
  clearMessages();
  if (!pbcListId) {
    state.pbcEditorRows = [];
    render();
    return;
  }

  try {
    await loadPbcEditorData(pbcListId);
    render();
  } catch (error) {
    setMessage('error', error instanceof Error ? error.message : 'Could not load PBC list items.');
    render();
  }
}

function updatePbcRow(index, field, value) {
  const row = state.pbcEditorRows[index];
  if (!row) return;
  if (field === 'riskAssertion') {
    row.riskAssertion = value;
    row.priority = inferPriorityFromRiskAssertion(value) || row.priority;
  } else {
    row[field] = value;
  }
  if (!state.updatedPbcItemIds.includes(row.id)) state.updatedPbcItemIds.push(row.id);
}

async function handleSavePbcEdits() {
  if (!state.session || state.pbcEditorRows.length === 0) return;
  clearMessages();
  try {
    const result = await savePbcItems(state.session.token, state.pbcEditorRows.map((row) => ({
      id: row.id,
      requestId: row.requestId,
      description: row.description,
      priority: inferPriorityFromRiskAssertion(row.riskAssertion) || row.priority,
      riskAssertion: row.riskAssertion,
      owner: row.owner,
      requestedDate: row.requestedDate,
      dueDate: row.dueDate,
      status: row.status,
      remarks: row.remarks,
    })));
    if (state.selectedPbcListId) await loadPbcEditorData(state.selectedPbcListId);
    state.pbcAllItems = await fetchPbcItems(state.session.token);
    setMessage('success', `Saved ${result.updatedCount} PBC item updates.`);
    render();
  } catch (error) {
    setMessage('error', error instanceof Error ? error.message : 'Could not save PBC edits.');
    render();
  }
}

async function handleDownloadUpdatedPbcItems() {
  if (!state.session || !state.selectedPbcListId) return;
  const rows = state.pbcEditorRows.filter((row) => state.updatedPbcItemIds.includes(row.id));
  if (rows.length === 0) {
    setMessage('error', 'No updated PBC items available for download.');
    render();
    return;
  }

  try {
    const blob = await downloadUpdatedPbcItemsExcel(state.session.token, {
      pbcListId: state.selectedPbcListId,
      itemIds: rows.map((row) => row.id),
    });
    downloadBlob(blob, `pbc-items-updated-${new Date().toISOString().slice(0, 10)}.xlsx`);
    setMessage('success', `Downloaded ${rows.length} updated PBC item(s) as Excel.`);
    render();
  } catch (error) {
    setMessage('error', error instanceof Error ? error.message : 'Could not download updated PBC items.');
    render();
  }
}

async function handleDownloadAllPbcItems() {
  if (!state.session || !state.selectedPbcListId || state.pbcEditorRows.length === 0) return;
  try {
    const blob = await downloadUpdatedPbcItemsExcel(state.session.token, {
      pbcListId: state.selectedPbcListId,
      itemIds: state.pbcEditorRows.map((row) => row.id),
    });
    downloadBlob(blob, `pbc-items-all-${new Date().toISOString().slice(0, 10)}.xlsx`);
    setMessage('success', `Downloaded all ${state.pbcEditorRows.length} PBC item(s) as Excel.`);
    render();
  } catch (error) {
    setMessage('error', error instanceof Error ? error.message : 'Could not download all PBC items.');
    render();
  }
}

async function handleRequirementUpload(form) {
  if (!state.session || !state.selectedRequirementId) return;
  clearMessages();
  const file = form.querySelector('#requirement-file')?.files?.[0];
  if (!file) {
    setMessage('error', 'Please select a file.');
    render();
    return;
  }

  try {
    await uploadRequirementFile(state.session.token, state.selectedRequirementId, file);
    await loadPortalData();
    setMessage('success', 'Client data uploaded successfully.');
    render();
  } catch (error) {
    setMessage('error', error instanceof Error ? error.message : 'Upload failed.');
    render();
  }
}

async function openClientPbcItems(pbcListId) {
  if (!state.session) return;
  const list = state.pbcLists.find((item) => item.id === pbcListId);
  if (!list) return;
  state.activePbcListForClient = list;
  state.clientItemRows = await fetchPbcItems(state.session.token, list.id);
  state.currentPage = 'client-pbc-items';
  render();
}

async function openItemDetail(itemId) {
  if (!state.session) return;
  const item = [...state.clientItemRows, ...state.pbcEditorRows, ...state.pbcAllItems].find((entry) => entry.id === itemId);
  if (!item) return;
  state.activePbcItem = item;
  try {
    state.pbcItemFiles = await fetchPbcItemFiles(state.session.token, item.id);
  } catch {
    state.pbcItemFiles = [];
  }
  state.currentPage = 'pbc-item-detail';
  render();
}

async function handleItemFileUpload(form) {
  if (!state.session || !state.activePbcItem) return;
  clearMessages();
  const file = form.querySelector('#item-file-input')?.files?.[0];
  if (!file) {
    setMessage('error', 'Please select a file.');
    render();
    return;
  }

  try {
    await uploadPbcItemFile(state.session.token, state.activePbcItem.id, file);
    state.pbcItemFiles = await fetchPbcItemFiles(state.session.token, state.activePbcItem.id);
    const refreshedItems = await fetchPbcItems(state.session.token, state.activePbcItem.pbcListId);
    if (state.activePbcListForClient?.id === state.activePbcItem.pbcListId) {
      state.clientItemRows = refreshedItems;
    }
    const refreshed = refreshedItems.find((item) => item.id === state.activePbcItem.id) ?? state.activePbcItem;
    state.activePbcItem = refreshed;
    state.pbcEditorRows = state.pbcEditorRows.map((item) => (item.id === refreshed.id ? refreshed : item));
    state.pbcAllItems = state.pbcAllItems.map((item) => (item.id === refreshed.id ? refreshed : item));
    setMessage('success', 'File uploaded successfully.');
    render();
  } catch (error) {
    setMessage('error', error instanceof Error ? error.message : 'Could not upload file.');
    render();
  }
}

async function handleDeleteItemFile(fileId) {
  if (!state.session || !state.activePbcItem) return;
  clearMessages();
  try {
    await deletePbcItemFile(state.session.token, fileId);
    state.pbcItemFiles = await fetchPbcItemFiles(state.session.token, state.activePbcItem.id);
    setMessage('success', 'File deleted successfully.');
    render();
  } catch (error) {
    setMessage('error', error instanceof Error ? error.message : 'Could not delete file.');
    render();
  }
}

async function handleItemStatusChange(status) {
  if (!state.session || !state.activePbcItem) return;
  clearMessages();
  try {
    const updated = await updatePbcItemStatus(state.session.token, state.activePbcItem.id, status);
    state.activePbcItem = updated;
    state.clientItemRows = state.clientItemRows.map((item) => (item.id === updated.id ? updated : item));
    state.pbcEditorRows = state.pbcEditorRows.map((item) => (item.id === updated.id ? updated : item));
    state.pbcAllItems = state.pbcAllItems.map((item) => (item.id === updated.id ? updated : item));
    setMessage('success', 'Item status updated successfully.');
    render();
  } catch (error) {
    setMessage('error', error instanceof Error ? error.message : 'Could not update item status.');
    render();
  }
}

function handleLogout() {
  if (!window.confirm('Are you sure you want to logout?')) return;
  disconnectNotificationStream();
  state.session = null;
  state.currentPage = 'login';
  state.clients = [];
  state.requirements = [];
  state.pbcLists = [];
  state.pbcAllItems = [];
  state.auditorNotifications = [];
  state.activeAuditorClientId = '';
  state.auditFinalisationDate = '';
  state.selectedPbcListId = '';
  state.pbcEditorRows = [];
  state.updatedPbcItemIds = [];
  state.activePbcListForClient = null;
  state.clientItemRows = [];
  state.activePbcItem = null;
  state.pbcItemFiles = [];
  state.selectedRequirementId = '';
  clearMessages();
  render();
}

function renderBrandHeader() {
  const themeButtonLabel = state.theme === 'dark' ? '☀ Light' : '🌙 Dark';

  return `
    <header class="brand-header">
      <div class="brand-logo-wrap">
        <span class="brand-dot"></span>
        <span class="brand-name">Audit Collaboration Hub</span>
      </div>
      <nav class="brand-nav" aria-label="Primary">
        <span>Solutions</span>
        <span>Insights</span>
        <span>Support</span>
      </nav>
      <button type="button" class="secondary theme-toggle" data-action="toggle-theme">${themeButtonLabel}</button>
      ${state.session ? '<button type="button" class="secondary brand-logout" data-action="logout">Logout</button>' : ''}
    </header>
  `;
}

function renderNotificationsPanel() {
  if (state.auditorNotifications.length === 0) {
    return '<p class="muted">No notifications yet.</p>';
  }
  return `
    <ul>
      ${state.auditorNotifications.slice(0, 5).map((notification) => `
        <li style="margin-bottom:8px;">
          <strong>${escapeHtml(formatDateTime(notification.createdAt))}:</strong> ${escapeHtml(notification.message)}
        </li>
      `).join('')}
    </ul>
  `;
}

function renderFeatureStrip(mode) {
  const cards =
    mode === 'auditor'
      ? [
          { title: 'Portfolio Visibility', desc: 'Track all client PBC progress from one workspace.' },
          { title: 'Live Alerts', desc: 'Get real-time trial balance and status notifications.' },
          { title: 'Controlled Sharing', desc: 'Standardized templates reduce onboarding friction.' },
        ]
      : [
          { title: 'Secure Submission', desc: 'Upload trial balance and supporting files safely.' },
          { title: 'Clear Priorities', desc: 'See pending, due, and completed PBC requests instantly.' },
          { title: 'Single Collaboration Hub', desc: 'Coordinate with auditors in one streamlined portal.' },
        ];

  return `
    <section class="feature-grid">
      ${cards
        .map(
          (card) => `
        <article class="feature-card">
          <h3>${escapeHtml(card.title)}</h3>
          <p>${escapeHtml(card.desc)}</p>
        </article>
      `,
        )
        .join('')}
    </section>
  `;
}

function renderDonutChart({ total, completed, inProgress, pending, high, medium, low, unset, mode }) {
  const r = 40;
  const cx = 60;
  const cy = 60;
  const circumference = 2 * Math.PI * r;

  const slices =
    mode === 'status'
      ? [
          { value: completed, color: '#38bdf8' },
          { value: inProgress, color: '#f59e0b' },
          { value: pending, color: '#dc2626' },
        ]
      : [
          { value: high, color: '#dc2626' },
          { value: medium, color: '#f59e0b' },
          { value: low, color: '#38bdf8' },
          ...(unset > 0 ? [{ value: unset, color: '#94a3b8' }] : []),
        ];

  let offset = circumference;
  const circles = slices
    .map((slice) => {
      const len = total > 0 ? (slice.value / total) * circumference : 0;
      const currentOffset = offset;
      offset -= len;
      if (len <= 0) return '';
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${slice.color}" stroke-width="16" stroke-dasharray="${len} ${circumference - len}" stroke-dashoffset="${currentOffset}" />`;
    })
    .join('');

  return `
    <div class="${mode === 'status' ? 'pie-chart-wrap' : 'priority-donut-wrap'}">
      <div class="${mode === 'status' ? 'pie-chart-ring' : 'priority-donut-ring'}">
        <svg width="120" height="120" viewBox="0 0 120 120" style="transform:rotate(-90deg);display:block;">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="16" />
          ${total === 0 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#d1d5db" stroke-width="16" stroke-dasharray="${circumference} 0" />` : circles}
        </svg>
        <div class="${mode === 'status' ? 'pie-chart-center' : 'priority-donut-center'}">
          <span class="${mode === 'status' ? 'pie-chart-total' : 'priority-donut-total'}">${total}</span>
          <span class="${mode === 'status' ? 'pie-chart-label' : 'priority-donut-label'}">${mode === 'status' ? 'items' : 'pending'}</span>
        </div>
      </div>
    </div>
  `;
}

function formatPercent(value, total) {
  if (!total || total <= 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function renderPriorityPanel(items) {
  const open = items.filter((item) => item.status !== 'Completed');
  const high = open.filter((item) => String(item.priority).toLowerCase() === 'high').length;
  const medium = open.filter((item) => String(item.priority).toLowerCase() === 'medium').length;
  const low = open.filter((item) => String(item.priority).toLowerCase() === 'low').length;
  const unset = open.length - high - medium - low;

  return `
    <div class="priority-panel">
      <h3>Pending by Priority</h3>
      <p class="muted">${open.length} non-completed item${open.length === 1 ? '' : 's'}</p>
      ${renderDonutChart({ total: open.length, high, medium, low, unset, mode: 'priority' })}
      <div class="priority-legend">
        <div class="priority-legend-item"><span class="priority-legend-color" style="background:#dc2626"></span><span class="priority-legend-text">High: <strong>${high}</strong> (${formatPercent(high, open.length)})</span></div>
        <div class="priority-legend-item"><span class="priority-legend-color" style="background:#f59e0b"></span><span class="priority-legend-text">Medium: <strong>${medium}</strong> (${formatPercent(medium, open.length)})</span></div>
        <div class="priority-legend-item"><span class="priority-legend-color" style="background:#38bdf8"></span><span class="priority-legend-text">Low: <strong>${low}</strong> (${formatPercent(low, open.length)})</span></div>
        ${unset > 0 ? `<div class="priority-legend-item"><span class="priority-legend-color" style="background:#94a3b8"></span><span class="priority-legend-text">Unset: <strong>${unset}</strong> (${formatPercent(unset, open.length)})</span></div>` : ''}
      </div>
    </div>
  `;
}

function renderStatusCards(lists) {
  if (lists.length === 0) return '<p class="muted">No PBC list uploaded yet for this client.</p>';
  return `
    <div class="pbc-status-grid">
      ${lists.map((item) => {
        const counts = getStatusCountsForList(item.id);
        return `
          <div class="pbc-status-card">
            <h3>${escapeHtml(item.originalName)}</h3>
            ${renderDonutChart({ total: counts.total, completed: counts.completed, inProgress: counts.inProgress, pending: counts.pending, mode: 'status' })}
            <p><strong>Total:</strong> ${counts.total}</p>
            <div class="pbc-status-legend">
              <div class="legend-item"><span class="legend-color completed"></span><span>Completed: ${counts.completed} (${formatPercent(counts.completed, counts.total)})</span></div>
              <div class="legend-item"><span class="legend-color in-progress"></span><span>In Progress: ${counts.inProgress} (${formatPercent(counts.inProgress, counts.total)})</span></div>
              <div class="legend-item"><span class="legend-color pending"></span><span>Pending: ${counts.pending} (${formatPercent(counts.pending, counts.total)})</span></div>
            </div>
            <div class="pbc-card-actions">
              <button class="danger" type="button" data-action="delete-pbc-list" data-id="${item.id}">Delete</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderLoginPage() {
  return `
    <main class="page brand-shell">
      ${renderBrandHeader()}
      <section class="hero-banner professional">
        <div class="hero-content">
          <h1>AI-powered audit collaboration</h1>
          <p>Streamline auditor and client workflows in one secure portal.</p>
          <div class="hero-chips">
            <span>Enterprise-grade access</span>
            <span>Real-time notifications</span>
            <span>Structured PBC workflows</span>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true"></div>
      </section>
      ${renderFeatureStrip('login')}
      <div class="inline" style="margin:24px auto 80px;max-width:980px;align-items:stretch;flex-wrap:wrap;">
        <div class="card auth-card" style="margin-bottom:0;">
          <h1>Auditor Login</h1>
          <p class="muted">Use auditor credentials to manage all client PBC workspaces.</p>
          <form id="auditor-login-form">
            <label for="auditor-email">Email</label>
            <input id="auditor-email" name="email" value="${escapeHtml(state.auditorLogin.email)}" />
            <label for="auditor-password">Password</label>
            <input id="auditor-password" name="password" type="password" value="${escapeHtml(state.auditorLogin.password)}" />
            <button type="submit">Sign In as Auditor</button>
          </form>
          <div>
            <p class="muted" style="margin-bottom:4px;">Demo Credentials</p>
            <p class="muted" style="margin-top:0;">Email: auditor@firm.com<br />Password: Auditor@123</p>
            <button type="button" class="secondary" id="use-auditor-demo">Use Demo Credentials</button>
          </div>
        </div>
        <div class="card auth-card" style="margin-bottom:0;">
          <h1>Client Login</h1>
          <p class="muted">Use client credentials to view and upload only your own client PBC list.</p>
          <form id="client-login-form">
            <label for="client-email">Email</label>
            <input id="client-email" name="email" value="${escapeHtml(state.clientLogin.email)}" />
            <label for="client-password">Password</label>
            <input id="client-password" name="password" type="password" value="${escapeHtml(state.clientLogin.password)}" />
            <button type="submit">Sign In as Client</button>
          </form>
          <div>
            <p class="muted" style="margin-bottom:4px;">Demo Credentials</p>
            <p class="muted" style="margin-top:0;">Email: client.alpha@entity.com<br />Password: Client@123</p>
            <button type="button" class="secondary" id="use-client-demo">Use Demo Credentials</button>
          </div>
        </div>
      </div>
      ${renderMessages()}
    </main>
  `;
}

function renderAuditorClientSelectPage() {
  return `
    <main class="page brand-shell">
      ${renderBrandHeader()}
      <section class="hero-banner compact">
        <h1>Select client workspace</h1>
        <p>Choose a client to continue with PBC upload and dashboard monitoring.</p>
      </section>
      <section class="card" style="max-width:700px;margin:0 auto 24px;">
        <h2>Auditor Startup</h2>
        <label for="auditor-client-select">Client</label>
        <select id="auditor-client-select">
          <option value="">Select client</option>
          ${state.clients.map((client) => `<option value="${client.id}" ${client.id === state.activeAuditorClientId ? 'selected' : ''}>${escapeHtml(client.name)} (${escapeHtml(client.entityType)})</option>`).join('')}
        </select>
        <label for="audit-finalisation-date">Date of Audit Finalisation</label>
        <input id="audit-finalisation-date" type="date" value="${escapeHtml(state.auditFinalisationDate)}" />
        <p class="muted" style="margin-top:4px;">This date will be used as the default due date for any PBC items that do not already have one.</p>
        <div class="actions">
          <button type="button" id="continue-auditor-workspace" ${!state.activeAuditorClientId ? 'disabled' : ''}>Continue to PBC Workspace</button>
        </div>
      </section>
      <section class="card" style="max-width:700px;margin:0 auto 24px;">
        <div class="toolbar">
          <h2>Notifications</h2>
          <span class="muted">${state.sseConnected ? 'Live' : 'Reconnecting...'}</span>
        </div>
        ${renderNotificationsPanel()}
      </section>
      ${renderMessages()}
    </main>
  `;
}

function renderAuditorWorkspacePage() {
  const selectedClient = getSelectedClient();
  const visibleLists = getVisiblePbcLists();
  const visibleItems = state.pbcAllItems.filter((item) => visibleLists.some((list) => list.id === item.pbcListId));

  return `
    <main class="page brand-shell">
      ${renderBrandHeader()}
      <section class="hero-banner compact professional">
        <div class="hero-content">
          <h1>PBC workspace</h1>
          <p>${selectedClient ? `Managing PBC for ${escapeHtml(selectedClient.name)}` : 'Upload detailed PBC files and track completion status.'}</p>
          <div class="hero-chips">
            <span>Audit control tower</span>
            <span>Client-wise status view</span>
            <span>Template-driven onboarding</span>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true"></div>
      </section>
      ${renderFeatureStrip('auditor')}
      <section class="card">
        <div class="toolbar">
          <div>
            <h2>Detailed PBC Management</h2>
            <p class="muted">Upload PBC files and review dashboard status before opening the editor.</p>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
            ${state.auditFinalisationDate ? `<span class="audit-date-badge">Audit Finalisation: <strong>${escapeHtml(formatDate(`${state.auditFinalisationDate}T00:00:00`))}</strong></span>` : ''}
            <button class="secondary" type="button" id="change-client-button">Change Client</button>
          </div>
        </div>
        <form id="pbc-upload-form">
          <label>Client</label>
          <input value="${selectedClient ? `${escapeHtml(selectedClient.name)} (${escapeHtml(selectedClient.entityType)})` : ''}" readonly />
          <label for="pbc-file">PBC Excel File</label>
          <input id="pbc-file" type="file" accept=".xlsx,.xls,.csv" required />
          <div class="actions">
            <button type="submit" ${!state.activeAuditorClientId ? 'disabled' : ''}>Upload PBC List</button>
            <button type="button" class="secondary" id="download-pbc-template">Download Blank Template</button>
          </div>
        </form>
      </section>
      <div class="pbc-workspace-split">
        <section class="card pbc-dashboard-card">
          <div class="toolbar">
            <div>
              <h2>PBC Status Dashboard</h2>
              <p class="muted">Review status distribution for the selected client's uploaded PBC lists.</p>
            </div>
            <button class="secondary" type="button" id="open-pbc-editor" ${!state.selectedPbcListId ? 'disabled' : ''}>Open PBC Editor</button>
          </div>
          ${renderStatusCards(visibleLists)}
          <label for="auditor-pbc-list">Select PBC list for editor</label>
          <select id="auditor-pbc-list">
            <option value="">Select uploaded PBC list</option>
            ${visibleLists.map((list) => `<option value="${list.id}" ${list.id === state.selectedPbcListId ? 'selected' : ''}>${escapeHtml(list.originalName)}</option>`).join('')}
          </select>
          <div style="margin-top:16px;">
            <div class="toolbar">
              <h2>Notifications</h2>
              <span class="muted">${state.sseConnected ? 'Live' : 'Reconnecting...'}</span>
            </div>
            ${renderNotificationsPanel()}
          </div>
        </section>
        <section class="card priority-panel-card">
          ${renderPriorityPanel(visibleItems)}
        </section>
      </div>
      ${renderMessages()}
    </main>
  `;
}

function renderClientPortalPage() {
  const visibleRequirements = getVisibleRequirements();
  const visibleLists = getVisiblePbcLists();

  return `
    <main class="page brand-shell">
      ${renderBrandHeader()}
      <section class="hero-banner compact professional">
        <div class="hero-content">
          <h1>AI-powered solutions for audit professionals</h1>
          <p>Track requirements, manage PBC lists, and monitor submission status.</p>
          <div class="hero-chips">
            <span>Secure document submission</span>
            <span>Clear request tracking</span>
            <span>Audit-ready collaboration</span>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true"></div>
      </section>
      ${renderFeatureStrip('client')}
      <div class="card">
        <h1>Audit Client Portal</h1>
        <p class="muted">Logged in as <strong>${escapeHtml(state.session.user.email)}</strong> (${escapeHtml(state.session.user.role)})</p>
      </div>
      <section class="card">
        <h2>Upload Client Data</h2>
        <form id="requirement-upload-form">
          <label for="requirement-select">Requirement</label>
          <select id="requirement-select">
            <option value="">Select requirement</option>
            ${visibleRequirements.map((requirement) => `<option value="${requirement.id}" ${requirement.id === state.selectedRequirementId ? 'selected' : ''}>${escapeHtml(requirement.title)}</option>`).join('')}
          </select>
          <label for="requirement-file">File</label>
          <input id="requirement-file" type="file" required />
          <button type="submit">Upload</button>
        </form>
      </section>
      <section class="card">
        <h2>Detailed PBC Lists</h2>
        <p class="muted">Reference the latest PBC list from your auditor before uploading documents.</p>
        ${visibleLists.length > 0 ? renderStatusCards(visibleLists).replace(/Delete/g, 'View').replace(/data-action="delete-pbc-list"/g, 'data-action="view-client-list"') : ''}
        <table class="table">
          <thead>
            <tr><th>File</th><th>Client ID</th><th>Uploaded At</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${visibleLists.length === 0 ? '<tr><td colspan="4">No PBC list uploaded yet.</td></tr>' : visibleLists.map((item) => `
              <tr>
                <td><a class="file-link" href="${API_URL}${item.downloadUrl}" target="_blank" rel="noreferrer">${escapeHtml(item.originalName)}</a></td>
                <td>${escapeHtml(item.clientId)}</td>
                <td>${escapeHtml(formatDateTime(item.uploadedAt))}</td>
                <td><button type="button" data-action="view-client-list" data-id="${item.id}">View Items</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>
      <section class="card">
        <h2>Requirement List</h2>
        <table class="table">
          <thead>
            <tr><th>Title</th><th>Description</th><th>Due Date</th><th>Status</th><th>Client ID</th></tr>
          </thead>
          <tbody>
            ${visibleRequirements.map((requirement) => `
              <tr>
                <td>${escapeHtml(requirement.title)}</td>
                <td>${escapeHtml(requirement.description)}</td>
                <td>${escapeHtml(requirement.dueDate || '-')}</td>
                <td>${escapeHtml(requirement.status)}</td>
                <td>${escapeHtml(requirement.clientId)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>
      ${renderMessages()}
    </main>
  `;
}

function renderClientPbcItemsPage() {
  const list = state.activePbcListForClient;
  if (!list) return renderClientPortalPage();

  return `
    <main class="page brand-shell">
      ${renderBrandHeader()}
      <section class="hero-banner compact">
        <h1>${escapeHtml(list.originalName)}</h1>
        <p>Review items and upload supporting documents for each request.</p>
      </section>
      <section class="card">
        <div class="toolbar">
          <div>
            <h2>PBC Items</h2>
            <p class="muted">Click Upload Files on any item to attach supporting documents.</p>
          </div>
          <button class="secondary" type="button" data-action="go-client-portal">Back to Portal</button>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Request ID</th>
              <th style="min-width:280px;">Description</th>
              <th>Priority</th>
              <th>Risk / Assertion</th>
              <th>Financial caption</th>
              <th>Requested Date</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Remarks</th>
              <th>Files</th>
            </tr>
          </thead>
          <tbody>
            ${state.clientItemRows.length === 0 ? '<tr><td colspan="10">No items found for this list.</td></tr>' : state.clientItemRows.map((item) => `
              <tr>
                <td>${escapeHtml(item.requestId)}</td>
                <td style="white-space:normal;word-break:break-word;min-width:280px;">${escapeHtml(item.description)}</td>
                <td>${escapeHtml(item.priority || '—')}</td>
                <td>${escapeHtml(item.riskAssertion || '—')}</td>
                <td>${escapeHtml(item.owner || '—')}</td>
                <td>${escapeHtml(item.requestedDate || '—')}</td>
                <td>${escapeHtml(item.dueDate || '—')}</td>
                <td><span class="status-badge status-${escapeHtml(String(item.status).toLowerCase().replace(/\s+/g, '-'))}">${escapeHtml(item.status)}</span></td>
                <td>${escapeHtml(item.remarks || '—')}</td>
                <td><button type="button" data-action="open-item-detail" data-id="${item.id}">Upload Files</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>
      ${renderMessages()}
    </main>
  `;
}

function renderItemDetailPage() {
  const item = state.activePbcItem;
  if (!item || !state.session) return renderClientPortalPage();
  const prevAction = state.session.user.role === 'auditor' ? 'go-pbc-editor' : 'go-client-items';

  return `
    <main class="page brand-shell">
      ${renderBrandHeader()}
      <section class="hero-banner compact">
        <h1>Item: ${escapeHtml(item.requestId)}</h1>
        <p>${escapeHtml(item.description)}</p>
      </section>
      <section class="card item-detail-meta">
        <h2>Item Details</h2>
        <div class="item-meta-grid">
          <div class="item-meta-row"><span class="item-meta-label">Owner</span><span>${escapeHtml(item.owner || '—')}</span></div>
          <div class="item-meta-row"><span class="item-meta-label">Priority</span><span>${escapeHtml(item.priority || '—')}</span></div>
          <div class="item-meta-row"><span class="item-meta-label">Risk / Assertion</span><span>${escapeHtml(item.riskAssertion || '—')}</span></div>
          <div class="item-meta-row"><span class="item-meta-label">Requested Date</span><span>${escapeHtml(item.requestedDate || '—')}</span></div>
          <div class="item-meta-row"><span class="item-meta-label">Due Date</span><span>${escapeHtml(item.dueDate || '—')}</span></div>
          <div class="item-meta-row"><span class="item-meta-label">Status</span>
            <select id="item-status-select" class="status-select status-${escapeHtml(String(item.status).toLowerCase().replace(/\s+/g, '-'))}">
              <option value="Pending" ${item.status === 'Pending' ? 'selected' : ''}>Pending</option>
              <option value="In progress" ${item.status === 'In progress' ? 'selected' : ''}>In progress</option>
              <option value="Completed" ${item.status === 'Completed' ? 'selected' : ''}>Completed</option>
            </select>
          </div>
          <div class="item-meta-row"><span class="item-meta-label">Remarks</span><span>${escapeHtml(item.remarks || '—')}</span></div>
        </div>
        <button class="secondary" style="margin-top:16px;" type="button" data-action="${prevAction}">← Back</button>
      </section>
      <section class="card">
        <h2>Upload Document</h2>
        <p class="muted">Attach files related to this PBC item request.</p>
        <form id="item-file-upload-form">
          <label for="item-file-input">Select file</label>
          <input id="item-file-input" type="file" required />
          <div class="actions"><button type="submit">Upload File</button></div>
        </form>
      </section>
      <section class="card">
        <h2>Uploaded Documents</h2>
        ${state.pbcItemFiles.length === 0 ? '<p class="muted">No files uploaded yet for this item.</p>' : `
          <table class="table">
            <thead><tr><th>File Name</th><th>Uploaded At</th><th>Actions</th></tr></thead>
            <tbody>
              ${state.pbcItemFiles.map((file) => `
                <tr>
                  <td><a class="file-link" href="${API_URL}${file.downloadUrl}" target="_blank" rel="noreferrer">${escapeHtml(file.originalName)}</a></td>
                  <td>${escapeHtml(formatDateTime(file.uploadedAt))}</td>
                  <td><button type="button" class="danger" data-action="delete-item-file" data-id="${file.id}">Delete</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </section>
      ${renderMessages()}
    </main>
  `;
}

function renderPendingDaysCell(row) {
  const activityReference = normalizeDateForInput(row.activityDate);
  const days = calcPendingDays(normalizeDateForInput(row.dueDate), activityReference || undefined);
  if (days === null) return '<span class="pending-days-na">—</span>';
  if (activityReference) {
    if (days < 0) return `<span class="pending-days-overdue">${Math.abs(days)}d late</span>`;
    if (days === 0) return '<span class="pending-days-done">On time</span>';
    return `<span class="pending-days-ok">${days}d early</span>`;
  }
  if (days < 0) return `<span class="pending-days-overdue">${Math.abs(days)}d overdue</span>`;
  if (days === 0) return '<span class="pending-days-today">Due today</span>';
  return `<span class="${days <= 7 ? 'pending-days-urgent' : 'pending-days-ok'}">${days}d</span>`;
}

function renderPbcEditorPage() {
  const visibleLists = getVisiblePbcLists();
  return `
    <main class="page pbc-editor-page">
      ${renderBrandHeader()}
      <div class="card">
        <div class="toolbar">
          <div>
            <h1>PBC Editor</h1>
            <p class="muted">Edit uploaded PBC list items and click Save Changes to preserve updates.</p>
            ${state.auditFinalisationDate ? `<p class="audit-date-badge" style="display:inline-flex;margin-top:6px;">Audit Finalisation: <strong style="margin-left:4px;">${escapeHtml(formatDate(`${state.auditFinalisationDate}T00:00:00`))}</strong></p>` : ''}
          </div>
          <button class="secondary" type="button" data-action="go-auditor-workspace">Back</button>
        </div>
      </div>
      <section class="card">
        <label for="editor-list">PBC List</label>
        <select id="editor-list">
          <option value="">Select uploaded PBC list</option>
          ${visibleLists.map((list) => `<option value="${list.id}" ${list.id === state.selectedPbcListId ? 'selected' : ''}>${escapeHtml(list.originalName)} - ${escapeHtml(list.clientId)}</option>`).join('')}
        </select>
      </section>
      <section class="card">
        <h2>PBC Items</h2>
        <table class="table" id="pbc-editor-table">
          <thead>
            <tr>
              <th>Request ID</th>
              <th style="min-width:280px;">Description</th>
              <th>Priority</th>
              <th>Risk / Assertion</th>
              <th>Financial caption</th>
              <th>Requested Date</th>
              <th>Due Date</th>
              <th style="width:90px;max-width:90px;white-space:normal;word-break:break-word;">Uploaded/ Completed Date</th>
              <th>Pending Days</th>
              <th>Status</th>
              <th>Remarks</th>
              <th>Files</th>
            </tr>
          </thead>
          <tbody>
            ${state.pbcEditorRows.length === 0 ? '<tr><td colspan="12">No PBC items found for this list.</td></tr>' : state.pbcEditorRows.map((row, index) => `
              <tr>
                <td><input data-row-index="${index}" data-field="requestId" value="${escapeHtml(row.requestId)}" /></td>
                <td><input style="min-width:260px;" data-row-index="${index}" data-field="description" value="${escapeHtml(row.description)}" /></td>
                <td>
                  <select data-row-index="${index}" data-field="priority" class="priority-select">
                    <option value="" ${!row.priority ? 'selected' : ''}>—</option>
                    <option value="Low" ${row.priority === 'Low' ? 'selected' : ''}>Low</option>
                    <option value="Medium" ${row.priority === 'Medium' ? 'selected' : ''}>Medium</option>
                    <option value="High" ${row.priority === 'High' ? 'selected' : ''}>High</option>
                  </select>
                </td>
                <td><input data-row-index="${index}" data-field="riskAssertion" value="${escapeHtml(row.riskAssertion)}" /></td>
                <td><input data-row-index="${index}" data-field="owner" value="${escapeHtml(row.owner)}" /></td>
                <td><input type="date" data-row-index="${index}" data-field="requestedDate" value="${escapeHtml(normalizeDateForInput(row.requestedDate))}" /></td>
                <td><input type="date" data-row-index="${index}" data-field="dueDate" value="${escapeHtml(normalizeDateForInput(row.dueDate))}" /></td>
                <td style="width:90px;max-width:90px;white-space:normal;word-break:break-word;font-size:11px;">${escapeHtml(normalizeDateForInput(row.activityDate) ? formatDate(`${normalizeDateForInput(row.activityDate)}T00:00:00`) : '—')}</td>
                <td>${renderPendingDaysCell(row)}</td>
                <td>
                  <select data-row-index="${index}" data-field="status" class="status-select status-${escapeHtml(String(row.status).toLowerCase().replace(/\s+/g, '-'))}">
                    <option value="Pending" ${row.status === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="In progress" ${row.status === 'In progress' ? 'selected' : ''}>In progress</option>
                    <option value="Completed" ${row.status === 'Completed' ? 'selected' : ''}>Completed</option>
                  </select>
                </td>
                <td><input data-row-index="${index}" data-field="remarks" value="${escapeHtml(row.remarks)}" /></td>
                <td><button type="button" class="secondary" data-action="open-item-detail" data-id="${row.id}">Files</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="actions">
          <button type="button" id="save-pbc-edits" ${state.pbcEditorRows.length === 0 ? 'disabled' : ''}>Save Changes</button>
          <button type="button" class="secondary" id="download-updated-pbc" ${state.updatedPbcItemIds.length === 0 ? 'disabled' : ''}>Download Updated Excel</button>
          <button type="button" class="secondary" id="download-all-pbc" ${state.pbcEditorRows.length === 0 ? 'disabled' : ''}>Download All Items</button>
        </div>
        <div style="margin-top:16px;">
          <div class="toolbar">
            <h2>Notifications</h2>
            <span class="muted">${state.sseConnected ? 'Live' : 'Reconnecting...'}</span>
          </div>
          ${renderNotificationsPanel()}
        </div>
      </section>
      ${renderMessages()}
    </main>
  `;
}

function render() {
  if (!state.session) {
    root.innerHTML = renderLoginPage();
    bindLoginPage();
    return;
  }

  if (state.session.user.role === 'auditor' && state.currentPage === 'auditor-client-select') {
    root.innerHTML = renderAuditorClientSelectPage();
    bindCommonPageEvents();
    bindAuditorClientSelectPage();
    return;
  }

  if (state.session.user.role === 'auditor' && state.currentPage === 'auditor-pbc') {
    root.innerHTML = renderAuditorWorkspacePage();
    bindCommonPageEvents();
    bindAuditorWorkspacePage();
    return;
  }

  if (state.currentPage === 'client-pbc-items') {
    root.innerHTML = renderClientPbcItemsPage();
    bindCommonPageEvents();
    bindClientPbcItemsPage();
    return;
  }

  if (state.currentPage === 'pbc-item-detail') {
    root.innerHTML = renderItemDetailPage();
    bindCommonPageEvents();
    bindItemDetailPage();
    return;
  }

  if (state.currentPage === 'pbc-editor') {
    root.innerHTML = renderPbcEditorPage();
    bindCommonPageEvents();
    bindPbcEditorPage();
    return;
  }

  root.innerHTML = renderClientPortalPage();
  bindCommonPageEvents();
  bindClientPortalPage();
}

function bindCommonPageEvents() {
  root.querySelector('[data-action="toggle-theme"]')?.addEventListener('click', toggleTheme);
  root.querySelector('[data-action="logout"]')?.addEventListener('click', handleLogout);
  root.querySelectorAll('[data-action="delete-item-file"]').forEach((button) => {
    button.addEventListener('click', () => void handleDeleteItemFile(button.dataset.id));
  });
  root.querySelector('[data-action="go-client-portal"]')?.addEventListener('click', () => {
    state.currentPage = 'portal';
    render();
  });
  root.querySelector('[data-action="go-auditor-workspace"]')?.addEventListener('click', () => {
    state.currentPage = 'auditor-pbc';
    render();
  });
  root.querySelector('[data-action="go-pbc-editor"]')?.addEventListener('click', async () => {
    state.currentPage = 'pbc-editor';
    render();
  });
  root.querySelector('[data-action="go-client-items"]')?.addEventListener('click', () => {
    state.currentPage = 'client-pbc-items';
    render();
  });
}

function bindLoginPage() {
  root.querySelector('[data-action="toggle-theme"]')?.addEventListener('click', toggleTheme);
  root.querySelector('#auditor-login-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    state.auditorLogin.email = root.querySelector('#auditor-email').value;
    state.auditorLogin.password = root.querySelector('#auditor-password').value;
    void handleLogin('auditor', event.currentTarget);
  });
  root.querySelector('#client-login-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    state.clientLogin.email = root.querySelector('#client-email').value;
    state.clientLogin.password = root.querySelector('#client-password').value;
    void handleLogin('client', event.currentTarget);
  });
  root.querySelector('#use-auditor-demo')?.addEventListener('click', () => {
    state.auditorLogin = { email: 'auditor@firm.com', password: 'Auditor@123' };
    render();
  });
  root.querySelector('#use-client-demo')?.addEventListener('click', () => {
    state.clientLogin = { email: 'client.alpha@entity.com', password: 'Client@123' };
    render();
  });
}

function bindAuditorClientSelectPage() {
  root.querySelector('#auditor-client-select')?.addEventListener('change', (event) => {
    state.activeAuditorClientId = event.target.value;
    state.selectedPbcListId = '';
    render();
  });
  root.querySelector('#audit-finalisation-date')?.addEventListener('change', (event) => {
    state.auditFinalisationDate = event.target.value;
  });
  root.querySelector('#continue-auditor-workspace')?.addEventListener('click', () => void handleContinueToPbcWorkspace());
}

function bindAuditorWorkspacePage() {
  root.querySelector('#change-client-button')?.addEventListener('click', () => {
    state.currentPage = 'auditor-client-select';
    render();
  });
  root.querySelector('#pbc-upload-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void handlePbcUpload(event.currentTarget);
  });
  root.querySelector('#download-pbc-template')?.addEventListener('click', () => void handleDownloadPbcTemplate());
  root.querySelector('#open-pbc-editor')?.addEventListener('click', () => void handleOpenPbcEditor());
  root.querySelector('#auditor-pbc-list')?.addEventListener('change', (event) => {
    state.selectedPbcListId = event.target.value;
    render();
  });
  root.querySelectorAll('[data-action="delete-pbc-list"]').forEach((button) => {
    button.addEventListener('click', () => void handleDeletePbcList(button.dataset.id));
  });
}

function bindClientPortalPage() {
  root.querySelector('#requirement-select')?.addEventListener('change', (event) => {
    state.selectedRequirementId = event.target.value;
  });
  root.querySelector('#requirement-upload-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleRequirementUpload(event.currentTarget);
  });
  root.querySelectorAll('[data-action="view-client-list"]').forEach((button) => {
    button.addEventListener('click', () => void openClientPbcItems(button.dataset.id));
  });
}

function bindClientPbcItemsPage() {
  root.querySelectorAll('[data-action="open-item-detail"]').forEach((button) => {
    button.addEventListener('click', () => void openItemDetail(button.dataset.id));
  });
}

function bindItemDetailPage() {
  root.querySelector('#item-status-select')?.addEventListener('change', (event) => {
    void handleItemStatusChange(event.target.value);
  });
  root.querySelector('#item-file-upload-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleItemFileUpload(event.currentTarget);
  });
}

function bindPbcEditorPage() {
  root.querySelector('#editor-list')?.addEventListener('change', (event) => {
    void handlePbcListSelection(event.target.value);
  });
  root.querySelector('#save-pbc-edits')?.addEventListener('click', () => void handleSavePbcEdits());
  root.querySelector('#download-updated-pbc')?.addEventListener('click', () => void handleDownloadUpdatedPbcItems());
  root.querySelector('#download-all-pbc')?.addEventListener('click', () => void handleDownloadAllPbcItems());
  root.querySelector('#pbc-editor-table')?.addEventListener('input', (event) => {
    const target = event.target;
    if (!target.dataset?.field) return;
    updatePbcRow(Number(target.dataset.rowIndex), target.dataset.field, target.value);
  });
  root.querySelector('#pbc-editor-table')?.addEventListener('change', (event) => {
    const target = event.target;
    if (!target.dataset?.field) return;
    updatePbcRow(Number(target.dataset.rowIndex), target.dataset.field, target.value);
  });
  root.querySelectorAll('[data-action="open-item-detail"]').forEach((button) => {
    button.addEventListener('click', () => void openItemDetail(button.dataset.id));
  });
}

initializeTheme();
render();
