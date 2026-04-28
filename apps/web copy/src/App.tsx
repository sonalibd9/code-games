import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  API_URL,
  deletePbcList,
  deletePbcItemFile,
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
} from './api';
import { AuthUser, ClientEntity, Notification, PbcItem, PbcItemFile, PbcList, Requirement } from './types';

interface Session {
  token: string;
  user: AuthUser;
}

type PageState = 'portal' | 'auditor-client-select' | 'auditor-pbc' | 'pbc-editor' | 'client-pbc-items' | 'pbc-item-detail';

function PieChart({ completed, inProgress, pending }: { completed: number; inProgress: number; pending: number }) {
  const total = completed + inProgress + pending;
  const r = 40;
  const cx = 60;
  const cy = 60;
  const C = 2 * Math.PI * r;

  const slices = [
    { len: total > 0 ? (completed / total) * C : 0, offset: C, color: '#69be28', label: 'Completed' },
    { len: total > 0 ? (inProgress / total) * C : 0, offset: total > 0 ? C - (completed / total) * C : C, color: '#f59e0b', label: 'In progress' },
    { len: total > 0 ? (pending / total) * C : 0, offset: total > 0 ? C - ((completed + inProgress) / total) * C : C, color: '#dc2626', label: 'Pending' },
  ];

  return (
    <div className="pie-chart-wrap">
      <div className="pie-chart-ring">
        <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)', display: 'block' }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={16} />
          {total === 0 ? (
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#d1d5db" strokeWidth={16} strokeDasharray={`${C} 0`} />
          ) : (
            slices.map((s) =>
              s.len > 0 ? (
                <circle
                  key={s.label}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={16}
                  strokeDasharray={`${s.len} ${C - s.len}`}
                  strokeDashoffset={s.offset}
                />
              ) : null
            )
          )}
        </svg>
        <div className="pie-chart-center">
          <span className="pie-chart-total">{total}</span>
          <span className="pie-chart-label">items</span>
        </div>
      </div>
    </div>
  );
}

function calcPendingDays(dueDate: string, referenceDate?: string): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return null;

  const baseDate = referenceDate ? new Date(referenceDate) : new Date();
  if (isNaN(baseDate.getTime())) return null;

  baseDate.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
}

function normalizeDateForInput(value: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return '';
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, '0');
    const day = slashMatch[2].padStart(2, '0');
    return `${slashMatch[3]}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function inferPriorityFromRiskAssertion(value: string): string {
  const text = (value ?? '').trim().toLowerCase();
  if (!text) {
    return '';
  }

  const highSignals = [
    'fraud',
    'material',
    'going concern',
    'impairment',
    'significant risk',
    'revenue recognition',
    'litigation',
    'related party',
    'override',
  ];

  const mediumSignals = [
    'valuation',
    'estimate',
    'cut-off',
    'cutoff',
    'accuracy',
    'completeness',
    'classification',
    'presentation',
    'disclosure',
    'provision',
    'tax',
  ];

  if (highSignals.some((signal) => text.includes(signal))) {
    return 'High';
  }

  if (mediumSignals.some((signal) => text.includes(signal))) {
    return 'Medium';
  }

  return 'Low';
}

function calculateDueDate(auditFinalisationDate: string, priority: string): string {
  if (!auditFinalisationDate) return '';
  
  const date = new Date(auditFinalisationDate + 'T00:00:00');
  if (isNaN(date.getTime())) return '';
  
  let monthsBack = 0;
  if ((priority ?? '').toLowerCase() === 'high') {
    monthsBack = 2;
  } else if ((priority ?? '').toLowerCase() === 'medium') {
    monthsBack = 1;
  }
  // Low priority or unset: 0 months back (same as audit finalisation date)
  date.setMonth(date.getMonth() - monthsBack);
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

interface ValidationIssue {
  itemId: string;
  requestId: string;
  severity: 'warning' | 'error';
  message: string;
}

function validateItemAgainstFiles(
  item: PbcItem,
  files: PbcItemFile[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Extract key terms from description and financial caption
  const descriptionTerms = (item.description ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 3);

  const captionTerms = (item.owner ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 3);

  const itemKeywords = new Set([...descriptionTerms, ...captionTerms]);

  // Check if item has no files
  if (files.length === 0) {
    issues.push({
      itemId: item.id,
      requestId: item.requestId,
      severity: 'warning',
      message: `No files uploaded for "${item.requestId}". A file should be uploaded for this item.`,
    });
    return issues;
  }

  // Check if file names contain relevant keywords
  const fileNameContent = files
    .map((f) => f.originalName.toLowerCase())
    .join(' ');

  const hasMatchingKeyword = Array.from(itemKeywords).some((keyword) =>
    fileNameContent.includes(keyword)
  );

  if (!hasMatchingKeyword && itemKeywords.size > 0) {
    const topKeywords = Array.from(itemKeywords)
      .slice(0, 3)
      .join(', ');
    issues.push({
      itemId: item.id,
      requestId: item.requestId,
      severity: 'warning',
      message: `Uploaded file name(s) may not match the item description/caption. Expected keywords like: ${topKeywords}`,
    });
  }

  return issues;
}

function PriorityBreakdownPanel({ items }: { items: PbcItem[] }) {
  const open = items.filter((i) => i.status !== 'Completed');
  const total = open.length;

  const counts = {
    high: open.filter((i) => (i.priority ?? '').toLowerCase() === 'high').length,
    medium: open.filter((i) => ['medium', 'meadium'].includes((i.priority ?? '').toLowerCase())).length,
    low: open.filter((i) => (i.priority ?? '').toLowerCase() === 'low').length,
  };
  const unset = total - counts.high - counts.medium - counts.low;

  const r = 40;
  const cx = 60;
  const cy = 60;
  const C = 2 * Math.PI * r;

  const slices = [
    { len: total > 0 ? (counts.high / total) * C : 0, color: '#dc2626', label: 'High' },
    { len: total > 0 ? (counts.medium / total) * C : 0, color: '#f59e0b', label: 'Medium' },
    { len: total > 0 ? (counts.low / total) * C : 0, color: '#22c55e', label: 'Low' },
    ...(unset > 0 ? [{ len: (unset / total) * C, color: '#94a3b8', label: 'Unset' }] : []),
  ];

  let offset = C;
  const circleSlices = slices.map((s) => {
    const slice = { ...s, offset };
    offset -= s.len;
    return slice;
  });

  return (
    <div className="priority-panel">
      <h3>Pending by Priority</h3>
      <p className="muted">{total} non-completed item{total !== 1 ? 's' : ''}</p>
      {total === 0 ? (
        <p className="priority-all-done">All items completed!</p>
      ) : (
        <div className="priority-donut-wrap">
          <div className="priority-donut-ring">
            <svg width="140" height="140" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)', display: 'block' }}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={16} />
              {circleSlices.map((s) =>
                s.len > 0 ? (
                  <circle
                    key={s.label}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={16}
                    strokeDasharray={`${s.len} ${C - s.len}`}
                    strokeDashoffset={s.offset}
                  />
                ) : null
              )}
            </svg>
            <div className="priority-donut-center">
              <span className="priority-donut-total">{total}</span>
              <span className="priority-donut-label">pending</span>
            </div>
          </div>
          <div className="priority-legend">
            {slices.map((slice) => (
              <div key={slice.label} className="priority-legend-item">
                <span className="priority-legend-color" style={{ background: slice.color }} />
                <span className="priority-legend-text">
                  {slice.label}: <strong>{slice === slices[0] ? counts.high : slice === slices[1] ? counts.medium : slice === slices[2] ? counts.low : unset}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [currentPage, setCurrentPage] = useState<PageState>('portal');
  const [session, setSession] = useState<Session | null>(null);
  const [auditorEmail, setAuditorEmail] = useState('auditor@firm.com');
  const [auditorPassword, setAuditorPassword] = useState('Auditor@123');
  const [clientEmail, setClientEmail] = useState('client.alpha@entity.com');
  const [clientPassword, setClientPassword] = useState('Client@123');
  const [error, setError] = useState('');

  const [clients, setClients] = useState<ClientEntity[]>([]);
  const [pbcLists, setPbcLists] = useState<PbcList[]>([]);
  const [pbcAllItems, setPbcAllItems] = useState<PbcItem[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [auditorNotifications, setAuditorNotifications] = useState<Notification[]>([]);

  const [pbcClientId, setPbcClientId] = useState('');
  const [pbcFile, setPbcFile] = useState<File | null>(null);

  const [selectedRequirementId, setSelectedRequirementId] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedPbcListId, setSelectedPbcListId] = useState('');
  const [pbcEditorRows, setPbcEditorRows] = useState<PbcItem[]>([]);
  const [updatedPbcItemIds, setUpdatedPbcItemIds] = useState<string[]>([]);
  const [activeAuditorClientId, setActiveAuditorClientId] = useState('');
  const [auditFinalisationDate, setAuditFinalisationDate] = useState('');

  // Item-level file upload state
  const [activePbcItem, setActivePbcItem] = useState<PbcItem | null>(null);
  const [activePbcListForClient, setActivePbcListForClient] = useState<PbcList | null>(null);
  const [clientItemRows, setClientItemRows] = useState<PbcItem[]>([]);
  const [pbcItemFiles, setPbcItemFiles] = useState<PbcItemFile[]>([]);
  const [itemFileInput, setItemFileInput] = useState<File | null>(null);

  const visibleRequirements = useMemo(() => {
    if (!session) {
      return [];
    }

    if (session.user.role === 'auditor') {
      return requirements;
    }

    return requirements.filter((requirement) => requirement.clientId === session.user.clientId);
  }, [requirements, session]);

  const getStatusCountsForList = (listId: string) => {
    const items = pbcAllItems.filter((item: PbcItem) => item.pbcListId === listId);
    return {
      completed: items.filter((item: PbcItem) => item.status === 'Completed').length,
      inProgress: items.filter((item: PbcItem) => item.status === 'In progress').length,
      pending: items.filter((item: PbcItem) => item.status !== 'Completed' && item.status !== 'In progress').length,
      total: items.length,
    };
  };

  const visiblePbcLists = useMemo(() => {
    if (!session) {
      return [];
    }

    if (session.user.role === 'auditor') {
      return activeAuditorClientId ? pbcLists.filter((item) => item.clientId === activeAuditorClientId) : pbcLists;
    }

    return pbcLists.filter((item) => item.clientId === session.user.clientId);
  }, [activeAuditorClientId, pbcLists, session]);

  useEffect(() => {
    if (!session || session.user.role !== 'auditor') {
      return;
    }

    if (visiblePbcLists.length === 0) {
      setSelectedPbcListId('');
      setPbcEditorRows([]);
      return;
    }

    if (!visiblePbcLists.some((item) => item.id === selectedPbcListId)) {
      setSelectedPbcListId(visiblePbcLists[visiblePbcLists.length - 1].id);
    }
  }, [selectedPbcListId, session, visiblePbcLists]);

  async function loadPortalData(token: string, role: AuthUser['role']) {
    const [reqs, pbcData, pbcItemsData] = await Promise.all([
      fetchRequirements(token),
      fetchPbcLists(token),
      fetchPbcItems(token),
    ]);
    setRequirements(reqs);
    if (role === 'client') {
      setSelectedRequirementId((current) => (current ? current : reqs[0]?.id ?? ''));
    }
    setPbcLists(pbcData);
    setPbcAllItems(pbcItemsData);

    if (pbcData.length > 0) {
      setSelectedPbcListId((current) => (current ? current : pbcData[pbcData.length - 1].id));
    } else {
      setSelectedPbcListId('');
      setPbcEditorRows([]);
    }

    if (role === 'auditor') {
      const [clientList, notificationList] = await Promise.all([fetchClients(token), fetchNotifications(token)]);
      setClients(clientList);
      setAuditorNotifications(notificationList);
      if (clientList.length > 0) {
        const defaultClientId = activeAuditorClientId || clientList[0].id;
        setPbcClientId(defaultClientId);
        setActiveAuditorClientId(defaultClientId);
      }
    } else {
      setAuditorNotifications([]);
    }
  }

  useEffect(() => {
    if (!session || session.user.role !== 'auditor') {
      return;
    }

    const streamUrl = `${API_URL}/api/notifications/stream?token=${encodeURIComponent(session.token)}`;
    const eventSource = new EventSource(streamUrl);

    const onSnapshot = (event: Event) => {
      const messageEvent = event as MessageEvent<string>;
      try {
        const payload = JSON.parse(messageEvent.data) as Notification[];
        setAuditorNotifications(payload);
      } catch {
        // Ignore malformed SSE payloads.
      }
    };

    const onNotification = (event: Event) => {
      const messageEvent = event as MessageEvent<string>;
      try {
        const payload = JSON.parse(messageEvent.data) as Notification;
        setAuditorNotifications((current) => [payload, ...current.filter((item) => item.id !== payload.id)]);
      } catch {
        // Ignore malformed SSE payloads.
      }
    };

    eventSource.addEventListener('snapshot', onSnapshot);
    eventSource.addEventListener('notification', onNotification);

    return () => {
      eventSource.removeEventListener('snapshot', onSnapshot);
      eventSource.removeEventListener('notification', onNotification);
      eventSource.close();
    };
  }, [session]);

  async function loadPbcEditorData(token: string, pbcListId: string) {
    const rows = await fetchPbcItems(token, pbcListId);
    const filled = rows.map((row) => {
      const normalizedDueDate = normalizeDateForInput(row.dueDate);
      const inferredPriority = inferPriorityFromRiskAssertion(row.riskAssertion);
      const finalPriority = inferredPriority || row.priority;
      const calculatedDueDate = auditFinalisationDate ? calculateDueDate(auditFinalisationDate, finalPriority) : normalizedDueDate;
      return {
        ...row,
        priority: finalPriority,
        dueDate: calculatedDueDate,
      };
    });
    setPbcEditorRows(filled);
  }

  async function handleContinueToPbcWorkspace() {
    if (!session || !activeAuditorClientId) {
      return;
    }

    setError('');

    try {
      if (auditFinalisationDate) {
        const clientListIds = pbcLists
          .filter((list) => list.clientId === activeAuditorClientId)
          .map((list) => list.id);

        const itemsNeedingDueDateSync = pbcAllItems.filter(
          (item) => clientListIds.includes(item.pbcListId) && normalizeDateForInput(item.dueDate) !== calculateDueDate(auditFinalisationDate, item.priority),
        );

        if (itemsNeedingDueDateSync.length > 0) {
          await savePbcItems(
            session.token,
            itemsNeedingDueDateSync.map((row) => ({
              id: row.id,
              requestId: row.requestId,
              description: row.description,
              priority: row.priority,
              riskAssertion: row.riskAssertion,
              owner: row.owner,
              requestedDate: row.requestedDate,
              dueDate: calculateDueDate(auditFinalisationDate, row.priority),
              status: row.status,
              remarks: row.remarks,
            })),
          );

          await loadPortalData(session.token, session.user.role);
        }
      }

      setCurrentPage('auditor-pbc');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply audit finalisation date to due dates.');
    }
  }

  async function handleLogin(expectedRole: 'auditor' | 'client', event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccessMessage('');

    const credentials =
      expectedRole === 'auditor'
        ? { email: auditorEmail, password: auditorPassword }
        : { email: clientEmail, password: clientPassword };

    try {
      const loginData = await login(credentials.email, credentials.password);

      if (loginData.user.role !== expectedRole) {
        setError(`This form is for ${expectedRole} login only.`);
        return;
      }

      setSession(loginData);
      await loadPortalData(loginData.token, loginData.user.role);
      setCurrentPage(loginData.user.role === 'auditor' ? 'auditor-client-select' : 'portal');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    }
  }

  async function handlePbcUpload(event: FormEvent) {
    event.preventDefault();
    const targetClientId = session?.user.role === 'auditor' ? activeAuditorClientId : pbcClientId;
    if (!session || !targetClientId || !pbcFile) {
      setError('Please select a client and choose an Excel or CSV PBC file.');
      return;
    }

    setError('');
    setSuccessMessage('');

    try {
      const uploaded = await uploadPbcList(session.token, targetClientId, pbcFile);

      let syncedCount = 0;
      if (auditFinalisationDate) {
        const uploadedListItems = await fetchPbcItems(session.token, uploaded.id);
        const itemsNeedingDueDateSync = uploadedListItems.filter(
          (item) => normalizeDateForInput(item.dueDate) !== calculateDueDate(auditFinalisationDate, item.priority),
        );

        if (itemsNeedingDueDateSync.length > 0) {
          await savePbcItems(
            session.token,
            itemsNeedingDueDateSync.map((row) => ({
              id: row.id,
              requestId: row.requestId,
              description: row.description,
              priority: row.priority,
              riskAssertion: row.riskAssertion,
              owner: row.owner,
              requestedDate: row.requestedDate,
              dueDate: calculateDueDate(auditFinalisationDate, row.priority),
              status: row.status,
              remarks: row.remarks,
            })),
          );
          syncedCount = itemsNeedingDueDateSync.length;
        }
      }

      await loadPortalData(session.token, session.user.role);
      setSelectedPbcListId(uploaded.id);
      setPbcFile(null);
      setSuccessMessage(
        `Detailed PBC list uploaded successfully. Parsed ${uploaded.parsedItemCount ?? 0} rows.${
          syncedCount > 0 ? ` Synced due date to audit finalisation date for ${syncedCount} item(s).` : ''
        }`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the detailed PBC list.');
    }
  }

  async function handleDeletePbcList(pbcListId: string) {
    if (!session) {
      return;
    }

    const shouldDelete = window.confirm('Delete this uploaded PBC list? This will remove its parsed items as well.');
    if (!shouldDelete) {
      return;
    }

    setError('');
    setSuccessMessage('');

    try {
      await deletePbcList(session.token, pbcListId);
      await loadPortalData(session.token, session.user.role);

      if (selectedPbcListId === pbcListId) {
        setSelectedPbcListId('');
        setPbcEditorRows([]);
      }

      setSuccessMessage('Detailed PBC list deleted successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete PBC list.');
    }
  }

  async function handleOpenPbcEditor() {
    if (!session) {
      return;
    }

    setError('');
    setSuccessMessage('');
    setCurrentPage('pbc-editor');

    if (selectedPbcListId) {
      try {
        await loadPbcEditorData(session.token, selectedPbcListId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load PBC editor data.');
      }
    }
  }

  async function handlePbcListSelection(pbcListId: string) {
    setSelectedPbcListId(pbcListId);
    setUpdatedPbcItemIds([]);
    if (!session || !pbcListId) {
      setPbcEditorRows([]);
      return;
    }

    setError('');
    setSuccessMessage('');

    try {
      await loadPbcEditorData(session.token, pbcListId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load PBC list items.');
    }
  }

  function updatePbcRow(index: number, field: keyof Pick<PbcItem, 'requestId' | 'description' | 'priority' | 'riskAssertion' | 'owner' | 'requestedDate' | 'dueDate' | 'status' | 'remarks'>, value: string) {
    const editedRowId = pbcEditorRows[index]?.id;

    setPbcEditorRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) {
          return row;
        }

        if (field === 'riskAssertion') {
          const inferredPriority = inferPriorityFromRiskAssertion(value);
          return { ...row, riskAssertion: value, priority: inferredPriority || row.priority };
        }

        return { ...row, [field]: value };
      }),
    );

    if (editedRowId) {
      setUpdatedPbcItemIds((current) => (current.includes(editedRowId) ? current : [...current, editedRowId]));
    }
  }

  async function handleSavePbcEdits() {
    if (!session || pbcEditorRows.length === 0) {
      return;
    }

    setError('');
    setSuccessMessage('');

    try {
      // Validate items against uploaded files
      const validationIssues: ValidationIssue[] = [];
      
      for (const row of pbcEditorRows) {
        const files = await fetchPbcItemFiles(session.token, row.id);
        const issues = validateItemAgainstFiles(row, files);
        validationIssues.push(...issues);
      }

      // Ask user for confirmation if validation issues found
      if (validationIssues.length > 0) {
        const confirmMsg = validationIssues
          .map((issue) => `• [${issue.requestId}] ${issue.message}`)
          .join('\n');
        const userConfirmed = window.confirm(
          `Validation Warning:\n\n${confirmMsg}\n\nDo you still want to save these items?`
        );
        if (!userConfirmed) {
          setError('Save cancelled by user.');
          return;
        }
      }

      const result = await savePbcItems(
        session.token,
        pbcEditorRows.map((row) => ({
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
        })),
      );

      if (selectedPbcListId) {
        await loadPbcEditorData(session.token, selectedPbcListId);
      }

      const updatedAllItems = await fetchPbcItems(session.token);
      setPbcAllItems(updatedAllItems);

      setSuccessMessage(`Saved ${result.updatedCount} PBC item updates.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save PBC edits.');
    }
  }

  async function handleDownloadUpdatedPbcItems() {
    if (!session || !selectedPbcListId) {
      return;
    }

    const updatedRows = pbcEditorRows.filter((row) => updatedPbcItemIds.includes(row.id));

    if (updatedRows.length === 0) {
      setError('No updated PBC items available for download.');
      setSuccessMessage('');
      return;
    }

    setError('');
    setSuccessMessage('');

    try {
      const fileBlob = await downloadUpdatedPbcItemsExcel(session.token, {
        pbcListId: selectedPbcListId,
        itemIds: updatedRows.map((row) => row.id),
      });

      const objectUrl = URL.createObjectURL(fileBlob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `pbc-items-updated-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);

      setSuccessMessage(`Downloaded ${updatedRows.length} updated PBC item(s) as Excel.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download updated PBC items.');
    }
  }

  async function handleDownloadAllPbcItems() {
    if (!session || !selectedPbcListId || pbcEditorRows.length === 0) {
      return;
    }

    setError('');
    setSuccessMessage('');

    try {
      const fileBlob = await downloadUpdatedPbcItemsExcel(session.token, {
        pbcListId: selectedPbcListId,
        itemIds: pbcEditorRows.map((row) => row.id),
      });

      const objectUrl = URL.createObjectURL(fileBlob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `pbc-items-all-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);

      setSuccessMessage(`Downloaded all ${pbcEditorRows.length} PBC item(s) as Excel.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download all PBC items.');
    }
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!session || !selectedRequirementId || !uploadFile) {
      setError('Please select a requirement and file.');
      return;
    }

    setError('');
    setSuccessMessage('');

    try {
      await uploadRequirementFile(session.token, selectedRequirementId, uploadFile);
      await loadPortalData(session.token, session.user.role);
      setUploadFile(null);
      setSuccessMessage('Client data uploaded successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
  }

  async function openItemDetail(item: PbcItem) {
    if (!session) return;
    setActivePbcItem(item);
    setError('');
    setSuccessMessage('');
    setItemFileInput(null);
    try {
      const files = await fetchPbcItemFiles(session.token, item.id);
      setPbcItemFiles(files);
    } catch {
      setPbcItemFiles([]);
    }
    setCurrentPage('pbc-item-detail');
  }

  async function openClientPbcItems(list: PbcList) {
    if (!session) return;
    setActivePbcListForClient(list);
    setError('');
    setSuccessMessage('');
    try {
      const items = await fetchPbcItems(session.token, list.id);
      setClientItemRows(items);
    } catch {
      setClientItemRows([]);
    }
    setCurrentPage('client-pbc-items');
  }

  async function handleItemFileUpload(event: FormEvent) {
    event.preventDefault();
    if (!session || !activePbcItem || !itemFileInput) {
      setError('Please select a file.');
      return;
    }
    setError('');
    setSuccessMessage('');
    try {
      // Validate file name against item before uploading
      const descriptionTerms = (activePbcItem.description ?? '')
        .toLowerCase()
        .split(/\s+/)
        .filter((term) => term.length > 3);
      const captionTerms = (activePbcItem.owner ?? '')
        .toLowerCase()
        .split(/\s+/)
        .filter((term) => term.length > 3);
      const itemKeywords = new Set([...descriptionTerms, ...captionTerms]);
      const fileNameLower = itemFileInput.name.toLowerCase();
      const hasMatchingKeyword = Array.from(itemKeywords).some((keyword) =>
        fileNameLower.includes(keyword)
      );

      if (!hasMatchingKeyword && itemKeywords.size > 0) {
        const topKeywords = Array.from(itemKeywords).slice(0, 3).join(', ');
        const confirmMsg = `File name "${itemFileInput.name}" may not match the item description/caption.\n\nExpected keywords like: ${topKeywords}\n\nDo you still want to upload this file?`;
        const userConfirmed = window.confirm(confirmMsg);
        if (!userConfirmed) {
          setError('Upload cancelled by user.');
          return;
        }
      }

      await uploadPbcItemFile(session.token, activePbcItem.id, itemFileInput);
      const files = await fetchPbcItemFiles(session.token, activePbcItem.id);
      setPbcItemFiles(files);

      const listItems = await fetchPbcItems(session.token, activePbcItem.pbcListId);
      setPbcEditorRows((current) =>
        current.map((item) => listItems.find((row) => row.id === item.id) ?? item),
      );
      setClientItemRows((current) =>
        current.map((item) => listItems.find((row) => row.id === item.id) ?? item),
      );
      const refreshedActive = listItems.find((item) => item.id === activePbcItem.id);
      if (refreshedActive) {
        setActivePbcItem(refreshedActive);
      }

      setItemFileInput(null);
      setSuccessMessage('File uploaded successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
  }

  async function handleDeleteItemFile(fileId: string) {
    if (!session || !activePbcItem) return;
    if (!window.confirm('Delete this file?')) return;
    setError('');
    try {
      await deletePbcItemFile(session.token, fileId);
      const files = await fetchPbcItemFiles(session.token, activePbcItem.id);
      setPbcItemFiles(files);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete file.');
    }
  }

  async function handleItemStatusChange(status: string) {
    if (!session || !activePbcItem) {
      return;
    }

    setError('');
    setSuccessMessage('');

    try {
      const updatedItem = await updatePbcItemStatus(session.token, activePbcItem.id, status);

      setActivePbcItem(updatedItem);
      setPbcEditorRows((current) => current.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
      setClientItemRows((current) => current.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
      setPbcAllItems((current) => current.map((item) => (item.id === updatedItem.id ? updatedItem : item)));

      setSuccessMessage('Item status updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update item status.');
    }
  }

  async function handleDownloadPbcTemplate() {
    if (!session) return;
    try {
      const blob = await downloadPbcTemplate(session.token, activeAuditorClientId || undefined);
      const selectedClient = clients.find((c) => c.id === activeAuditorClientId);
      const safeName = selectedClient ? selectedClient.name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'client';
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `pbc-template-${safeName}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download PBC template.');
    }
  }

  function handleLogout() {
    const shouldLogout = window.confirm('Are you sure you want to logout?');
    if (!shouldLogout) {
      return;
    }

    setSession(null);
    setCurrentPage('portal');
    setClients([]);
    setPbcLists([]);
    setPbcAllItems([]);
    setRequirements([]);
    setAuditorNotifications([]);
    setError('');
    setSuccessMessage('');
    setSelectedPbcListId('');
    setPbcEditorRows([]);
    setUpdatedPbcItemIds([]);
    setPbcClientId('');
    setPbcFile(null);
    setSelectedRequirementId('');
    setUploadFile(null);
    setActiveAuditorClientId('');
    setAuditFinalisationDate('');
    setActivePbcItem(null);
    setActivePbcListForClient(null);
    setClientItemRows([]);
    setPbcItemFiles([]);
    setItemFileInput(null);
  }

  function renderBrandHeader() {
    return (
      <header className="brand-header">
        <div className="brand-logo-wrap">
          <span className="brand-dot" />
          <span className="brand-name">Audit Collaboration Hub</span>
        </div>
        <nav className="brand-nav" aria-label="Primary">
          <span>Solutions</span>
          <span>Insights</span>
          <span>Support</span>
        </nav>
        {session ? (
          <button type="button" className="secondary brand-logout" onClick={handleLogout}>
            Logout
          </button>
        ) : null}
      </header>
    );
  }

  if (!session) {
    return (
      <main className="page brand-shell">
        {renderBrandHeader()}
        <section className="hero-banner">
          <h1>AI-powered audit collaboration</h1>
          <p>Streamline auditor and client workflows in one secure portal.</p>
        </section>
        <div className="inline" style={{ margin: '24px auto 80px', maxWidth: 980, alignItems: 'stretch', flexWrap: 'wrap' }}>
          <div className="card auth-card" style={{ marginBottom: 0 }}>
            <h1>Auditor Login</h1>
            <p className="muted">Use auditor credentials to manage all client PBC workspaces.</p>
            <form onSubmit={(event) => void handleLogin('auditor', event)}>
              <label htmlFor="auditor-email">Email</label>
              <input id="auditor-email" value={auditorEmail} onChange={(e) => setAuditorEmail(e.target.value)} />

              <label htmlFor="auditor-password">Password</label>
              <input
                id="auditor-password"
                type="password"
                value={auditorPassword}
                onChange={(e) => setAuditorPassword(e.target.value)}
              />

              <button type="submit">Sign In as Auditor</button>
            </form>
            <div>
              <p className="muted" style={{ marginBottom: 4 }}>Demo Credentials</p>
              <p className="muted" style={{ marginTop: 0 }}>Email: auditor@firm.com<br />Password: Auditor@123</p>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setAuditorEmail('auditor@firm.com');
                  setAuditorPassword('Auditor@123');
                }}
              >
                Use Demo Credentials
              </button>
            </div>
          </div>

          <div className="card auth-card" style={{ marginBottom: 0 }}>
            <h1>Client Login</h1>
            <p className="muted">Use client credentials to view and upload only your own client PBC list.</p>
            <form onSubmit={(event) => void handleLogin('client', event)}>
              <label htmlFor="client-email">Email</label>
              <input id="client-email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />

              <label htmlFor="client-password">Password</label>
              <input
                id="client-password"
                type="password"
                value={clientPassword}
                onChange={(e) => setClientPassword(e.target.value)}
              />

              <button type="submit">Sign In as Client</button>
            </form>
            <div>
              <p className="muted" style={{ marginBottom: 4 }}>Demo Credentials</p>
              <p className="muted" style={{ marginTop: 0 }}>Email: client.alpha@entity.com<br />Password: Client@123</p>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setClientEmail('client.alpha@entity.com');
                  setClientPassword('Client@123');
                }}
              >
                Use Demo Credentials
              </button>
            </div>
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
      </main>
    );
  }

  if (session.user.role === 'auditor' && currentPage === 'auditor-client-select') {
    return (
      <main className="page brand-shell">
        {renderBrandHeader()}
        <section className="hero-banner compact">
          <h1>Select client workspace</h1>
          <p>Choose a client to continue with PBC upload and dashboard monitoring.</p>
        </section>
        <section className="card" style={{ maxWidth: 700, margin: '0 auto 24px' }}>
          <h2>Auditor Startup</h2>
          <label htmlFor="auditor-client-select">Client</label>
          <select
            id="auditor-client-select"
            value={activeAuditorClientId}
            onChange={(e) => {
              setActiveAuditorClientId(e.target.value);
              setPbcClientId(e.target.value);
              setSelectedPbcListId('');
              setAuditFinalisationDate('');
            }}
          >
            <option value="">Select client</option>
            {clients.map((client) => (
              <option value={client.id} key={client.id}>
                {client.name} ({client.entityType})
              </option>
            ))}
          </select>

          <label htmlFor="audit-finalisation-date">Date of Audit Finalisation</label>
          <input
            id="audit-finalisation-date"
            type="date"
            value={auditFinalisationDate}
            onChange={(e) => setAuditFinalisationDate(e.target.value)}
          />
          <p className="muted" style={{ marginTop: 4 }}>
            This date will be used as the default due date for any PBC items that do not already have one.
          </p>

          <div className="actions">
            <button
              type="button"
              onClick={() => void handleContinueToPbcWorkspace()}
              disabled={!activeAuditorClientId}
            >
              Continue to PBC Workspace
            </button>
          </div>
        </section>

        <section className="card" style={{ maxWidth: 700, margin: '0 auto 24px' }}>
          <h2>Notifications</h2>
          {auditorNotifications.length === 0 ? (
            <p className="muted">No notifications yet.</p>
          ) : (
            <ul>
              {auditorNotifications.slice(0, 5).map((notification) => (
                <li key={notification.id} style={{ marginBottom: 8 }}>
                  <strong>{new Date(notification.createdAt).toLocaleString()}:</strong> {notification.message}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    );
  }

  if (session.user.role === 'auditor' && currentPage === 'auditor-pbc') {
    const selectedClient = clients.find((client) => client.id === activeAuditorClientId);

    return (
      <main className="page brand-shell">
        {renderBrandHeader()}
        <section className="hero-banner compact">
          <h1>PBC workspace</h1>
          <p>
            {selectedClient
              ? `Managing PBC for ${selectedClient.name}`
              : 'Upload detailed PBC files and track completion status.'}
          </p>
        </section>

        <section className="card">
          <div className="toolbar">
            <div>
              <h2>Detailed PBC Management</h2>
              <p className="muted">Upload PBC files and review dashboard status before opening the editor.</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {auditFinalisationDate ? (
                <span className="audit-date-badge">
                  Audit Finalisation: <strong>{new Date(auditFinalisationDate + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                </span>
              ) : null}
              <button className="secondary" onClick={() => setCurrentPage('auditor-client-select')}>
                Change Client
              </button>
            </div>
          </div>

          <form onSubmit={handlePbcUpload}>
            <label>Client</label>
            <input value={selectedClient ? `${selectedClient.name} (${selectedClient.entityType})` : ''} readOnly />

            <label htmlFor="pbc-file">PBC Excel File</label>
            <input
              id="pbc-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setPbcFile(e.target.files?.[0] ?? null)}
              required
            />

            <div className="actions">
              <button type="submit" disabled={!activeAuditorClientId}>Upload PBC List</button>
              <button
                type="button"
                className="secondary"
                onClick={() => void handleDownloadPbcTemplate()}
              >
                Download Blank Template
              </button>
            </div>
          </form>
        </section>

        <div className="pbc-workspace-split">
          <section className="card pbc-dashboard-card">
            <div className="toolbar">
              <div>
                <h2>PBC Status Dashboard</h2>
                <p className="muted">Review status distribution for the selected client's uploaded PBC lists.</p>
              </div>
              <button
                className="secondary"
                onClick={() => void handleOpenPbcEditor()}
                disabled={!selectedPbcListId}
              >
                Open PBC Editor
              </button>
            </div>

            {visiblePbcLists.length > 0 ? (
              <div className="pbc-status-grid">
                {visiblePbcLists.map((item) => {
                  const counts = getStatusCountsForList(item.id);

                  return (
                    <div key={item.id} className="pbc-status-card">
                      <h3>{item.originalName}</h3>
                      <PieChart completed={counts.completed} inProgress={counts.inProgress} pending={counts.pending} />
                      <div className="pbc-status-legend">
                        <div className="legend-item">
                          <span className="legend-color completed" />
                          <span>Completed: {counts.completed}</span>
                        </div>
                        <div className="legend-item">
                          <span className="legend-color in-progress" />
                          <span>In Progress: {counts.inProgress}</span>
                        </div>
                        <div className="legend-item">
                          <span className="legend-color pending" />
                          <span>Pending: {counts.pending}</span>
                        </div>
                      </div>
                      <div className="pbc-card-actions">
                        <button
                          className="danger"
                          type="button"
                          onClick={() => void handleDeletePbcList(item.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted">No PBC list uploaded yet for this client.</p>
            )}

            <label htmlFor="auditor-pbc-list">Select PBC list for editor</label>
            <select
              id="auditor-pbc-list"
              value={selectedPbcListId}
              onChange={(e) => setSelectedPbcListId(e.target.value)}
            >
              <option value="">Select uploaded PBC list</option>
              {visiblePbcLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.originalName}
                </option>
              ))}
            </select>
          </section>

          <section className="card priority-panel-card">
            <PriorityBreakdownPanel
              items={pbcAllItems.filter((item) => visiblePbcLists.some((l) => l.id === item.pbcListId))}
            />
          </section>
        </div>

        {successMessage ? <p className="success">{successMessage}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </main>
    );
  }

  // ── Client: browse items for a specific PBC list ──────────────────────────
  if (currentPage === 'client-pbc-items' && activePbcListForClient) {
    return (
      <main className="page brand-shell">
        {renderBrandHeader()}
        <section className="hero-banner compact">
          <h1>{activePbcListForClient.originalName}</h1>
          <p>Review items and upload supporting documents for each request.</p>
        </section>

        <section className="card">
          <div className="toolbar">
            <div>
              <h2>PBC Items</h2>
              <p className="muted">Click "Upload Files" on any item to attach supporting documents.</p>
            </div>
            <button className="secondary" onClick={() => setCurrentPage('portal')}>Back to Portal</button>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Request ID</th>
                <th style={{ minWidth: '280px' }}>Description</th>
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
              {clientItemRows.length === 0 ? (
                <tr><td colSpan={10}>No items found for this list.</td></tr>
              ) : (
                clientItemRows.map((item) => (
                  <tr key={item.id}>
                    <td>{item.requestId}</td>
                    <td style={{ whiteSpace: 'normal', wordBreak: 'break-word', minWidth: '280px' }}>{item.description}</td>
                    <td>{item.priority || '—'}</td>
                    <td>{item.riskAssertion || '—'}</td>
                    <td>{item.owner}</td>
                    <td>{item.requestedDate || '—'}</td>
                    <td>{item.dueDate || '—'}</td>
                    <td>
                      <span className={`status-badge status-${item.status.toLowerCase().replace(/\s+/g, '-')}`}>
                        {item.status}
                      </span>
                    </td>
                    <td>{item.remarks || '—'}</td>
                    <td>
                      <button onClick={() => void openItemDetail(item)}>Upload Files</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {successMessage ? <p className="success">{successMessage}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </main>
    );
  }

  // ── Item detail: view / upload files for a single PBC item ────────────────
  if (currentPage === 'pbc-item-detail' && activePbcItem) {
    const prevPage: PageState =
      session?.user.role === 'auditor' ? 'pbc-editor' : 'client-pbc-items';

    return (
      <main className="page brand-shell">
        {renderBrandHeader()}
        <section className="hero-banner compact">
          <h1>Item: {activePbcItem.requestId}</h1>
          <p>{activePbcItem.description}</p>
        </section>

        <section className="card item-detail-meta">
          <h2>Item Details</h2>
          <div className="item-meta-grid">
            <div className="item-meta-row"><span className="item-meta-label">Owner</span><span>{activePbcItem.owner || '—'}</span></div>
            <div className="item-meta-row"><span className="item-meta-label">Priority</span><span>{activePbcItem.priority || '—'}</span></div>
            <div className="item-meta-row"><span className="item-meta-label">Risk / Assertion</span><span>{activePbcItem.riskAssertion || '—'}</span></div>
            <div className="item-meta-row"><span className="item-meta-label">Requested Date</span><span>{activePbcItem.requestedDate || '—'}</span></div>
            <div className="item-meta-row"><span className="item-meta-label">Due Date</span><span>{activePbcItem.dueDate || '—'}</span></div>
            <div className="item-meta-row">
              <span className="item-meta-label">Status</span>
              <select
                value={activePbcItem.status}
                onChange={(e) => void handleItemStatusChange(e.target.value)}
                className={`status-select status-${activePbcItem.status.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <option value="Pending">Pending</option>
                <option value="In progress">In progress</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
            <div className="item-meta-row"><span className="item-meta-label">Remarks</span><span>{activePbcItem.remarks || '—'}</span></div>
          </div>
          <button className="secondary" style={{ marginTop: 16 }} onClick={() => setCurrentPage(prevPage)}>
            ← Back
          </button>
        </section>

        <section className="card">
          <h2>Upload Document</h2>
          <p className="muted">Attach files related to this PBC item request (PDF, Excel, images, ZIP, etc.).</p>
          <form onSubmit={(e) => void handleItemFileUpload(e)}>
            <label htmlFor="item-file-input">Select file</label>
            <input
              id="item-file-input"
              type="file"
              onChange={(e) => setItemFileInput(e.target.files?.[0] ?? null)}
              required
            />
            <div className="actions">
              <button type="submit" disabled={!itemFileInput}>Upload File</button>
            </div>
          </form>
        </section>

        <section className="card">
          <h2>Uploaded Documents</h2>
          {pbcItemFiles.length === 0 ? (
            <p className="muted">No files uploaded yet for this item.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Uploaded At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pbcItemFiles.map((file) => (
                  <tr key={file.id}>
                    <td>
                      <a className="file-link" href={`${API_URL}${file.downloadUrl}`} target="_blank" rel="noreferrer">
                        {file.originalName}
                      </a>
                    </td>
                    <td>{new Date(file.uploadedAt).toLocaleString()}</td>
                    <td>
                      <button type="button" className="danger" onClick={() => void handleDeleteItemFile(file.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {successMessage ? <p className="success">{successMessage}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </main>
    );
  }

  if (currentPage === 'pbc-editor') {
    const editorPbcLists = visiblePbcLists;

    return (
      <main className="page pbc-editor-page">
        {renderBrandHeader()}
        <div className="card">
          <div className="toolbar">
            <div>
              <h1>PBC Editor</h1>
              <p className="muted">Edit uploaded PBC list items and click Save Changes to preserve updates.</p>
              {auditFinalisationDate ? (
                <p className="audit-date-badge" style={{ display: 'inline-flex', marginTop: 6 }}>
                  Audit Finalisation: <strong style={{ marginLeft: 4 }}>{new Date(auditFinalisationDate + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                </p>
              ) : null}
            </div>
            <button className="secondary" onClick={() => setCurrentPage(session.user.role === 'auditor' ? 'auditor-pbc' : 'portal')}>Back</button>
          </div>
        </div>

        <section className="card">
          <label htmlFor="editor-list">PBC List</label>
          <select
            id="editor-list"
            value={selectedPbcListId}
            onChange={(e) => {
              void handlePbcListSelection(e.target.value);
            }}
          >
            <option value="">Select uploaded PBC list</option>
            {editorPbcLists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.originalName} - {list.clientId}
              </option>
            ))}
          </select>
        </section>

        <section className="card">
          <h2>PBC Items</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Request ID</th>
                <th style={{ minWidth: '280px' }}>Description</th>
                <th>Priority</th>
                <th>Risk / Assertion</th>
                <th>Financial caption</th>
                <th>Requested Date</th>
                <th>Due Date</th>
                <th style={{ width: '90px', maxWidth: '90px', whiteSpace: 'normal', wordBreak: 'break-word' }}>Uploaded/ Completed Date</th>
                <th>Pending Days</th>
                <th>Status</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {pbcEditorRows.length === 0 ? (
                <tr>
                  <td colSpan={12}>No PBC items found for this list.</td>
                </tr>
              ) : (
                pbcEditorRows.map((row, index) => (
                  <tr key={row.id}>
                    <td>
                      <input value={row.requestId} onChange={(e) => updatePbcRow(index, 'requestId', e.target.value)} />
                    </td>
                    <td>
                      <input style={{ minWidth: '260px' }} value={row.description} onChange={(e) => updatePbcRow(index, 'description', e.target.value)} />
                    </td>
                    <td>
                      <select
                        value={row.priority}
                        onChange={(e) => updatePbcRow(index, 'priority', e.target.value)}
                        className="priority-select"
                      >
                        <option value="">—</option>
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </td>
                    <td>
                      <input value={row.riskAssertion} onChange={(e) => updatePbcRow(index, 'riskAssertion', e.target.value)} />
                    </td>
                    <td>
                      <input value={row.owner} onChange={(e) => updatePbcRow(index, 'owner', e.target.value)} />
                    </td>
                    <td>
                      <input type="date" value={row.requestedDate} onChange={(e) => updatePbcRow(index, 'requestedDate', e.target.value)} />
                    </td>
                    <td>
                      <input type="date" value={normalizeDateForInput(row.dueDate)} onChange={(e) => updatePbcRow(index, 'dueDate', e.target.value)} />
                    </td>
                    <td style={{ width: '90px', maxWidth: '90px', whiteSpace: 'normal', wordBreak: 'break-word', fontSize: '11px' }}>
                      {normalizeDateForInput(row.activityDate)
                        ? new Date(`${normalizeDateForInput(row.activityDate)}T00:00:00`).toLocaleDateString()
                        : '—'}
                    </td>
                    <td>
                      {(() => {
                        const activityReference = normalizeDateForInput(row.activityDate);
                        const days = calcPendingDays(
                          normalizeDateForInput(row.dueDate),
                          activityReference || undefined,
                        );
                        if (days === null) return <span className="pending-days-na">—</span>;
                        if (activityReference) {
                          if (days < 0) return <span className="pending-days-overdue">{Math.abs(days)}d late</span>;
                          if (days === 0) return <span className="pending-days-done">On time</span>;
                          return <span className="pending-days-ok">{days}d early</span>;
                        }
                        if (days < 0) return <span className="pending-days-overdue">{Math.abs(days)}d overdue</span>;
                        if (days === 0) return <span className="pending-days-today">Due today</span>;
                        return <span className={days <= 7 ? 'pending-days-urgent' : 'pending-days-ok'}>{days}d</span>;
                      })()}
                    </td>
                    <td>
                      <select value={row.status} onChange={(e) => updatePbcRow(index, 'status', e.target.value)} className={`status-select status-${row.status.toLowerCase().replace(/\s+/g, '-')}`}>
                        <option value="Pending">Pending</option>
                        <option value="In progress">In progress</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </td>
                    <td>
                      <input value={row.remarks} onChange={(e) => updatePbcRow(index, 'remarks', e.target.value)} />
                    </td>
                    <td>
                      <button type="button" className="secondary" style={{ whiteSpace: 'nowrap' }} onClick={() => void openItemDetail(row)}>
                        Files
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="actions">
            <button onClick={handleSavePbcEdits} disabled={pbcEditorRows.length === 0}>
              Save Changes
            </button>
            <button
              className="secondary"
              onClick={() => void handleDownloadUpdatedPbcItems()}
              disabled={pbcEditorRows.length === 0 || updatedPbcItemIds.length === 0}
            >
              Download Updated Excel
            </button>
            <button
              className="secondary"
              onClick={() => void handleDownloadAllPbcItems()}
              disabled={pbcEditorRows.length === 0}
            >
              Download All Items
            </button>
          </div>

          {auditorNotifications.length === 0 ? (
            <p className="muted">No notifications yet.</p>
          ) : (
            <ul>
              {auditorNotifications.slice(0, 5).map((notification) => (
                <li key={notification.id} style={{ marginBottom: 8 }}>
                  <strong>{new Date(notification.createdAt).toLocaleString()}:</strong> {notification.message}
                </li>
              ))}
            </ul>
          )}
        </section>

        {successMessage ? <p className="success">{successMessage}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </main>
    );
  }

  return (
    <main className="page brand-shell">
      {renderBrandHeader()}
      <section className="hero-banner compact">
        <h1>AI-powered solutions for audit professionals</h1>
        <p>Track requirements, manage PBC lists, and monitor submission status.</p>
      </section>
      <div className="card">
        <h1>Audit Client Portal</h1>
        <p className="muted">
          Logged in as <strong>{session.user.email}</strong> ({session.user.role})
        </p>
      </div>

      <section className="card">
        <h2>Upload Client Data</h2>
        <form onSubmit={handleUpload}>
          <label htmlFor="requirement">Requirement</label>
          <select
            id="requirement"
            value={selectedRequirementId}
            onChange={(e) => setSelectedRequirementId(e.target.value)}
          >
            <option value="">Select requirement</option>
            {visibleRequirements.map((requirement) => (
              <option value={requirement.id} key={requirement.id}>
                {requirement.title}
              </option>
            ))}
          </select>

          <label htmlFor="file">File</label>
          <input
            id="file"
            type="file"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            required
          />

          <button type="submit">Upload</button>
        </form>
      </section>

      <section className="card">
        <h2>Detailed PBC Lists</h2>
        <p className="muted">Reference the latest PBC list from your auditor before uploading documents.</p>

        {visiblePbcLists.length > 0 ? (
          <div className="pbc-status-grid">
            {visiblePbcLists.map((item) => {
              const counts = getStatusCountsForList(item.id);

              return (
                <div key={item.id} className="pbc-status-card">
                  <h3>{item.originalName}</h3>
                  <PieChart completed={counts.completed} inProgress={counts.inProgress} pending={counts.pending} />
                  <div className="pbc-status-legend">
                    <div className="legend-item">
                      <span className="legend-color completed" />
                      <span>Completed: {counts.completed}</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-color in-progress" />
                      <span>In Progress: {counts.inProgress}</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-color pending" />
                      <span>Pending: {counts.pending}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        <table className="table">
          <thead>
            <tr>
              <th>File</th>
              <th>Client ID</th>
              <th>Uploaded At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visiblePbcLists.length === 0 ? (
              <tr>
                <td colSpan={4}>No PBC list uploaded yet.</td>
              </tr>
            ) : (
              visiblePbcLists.map((item) => (
                <tr key={item.id}>
                  <td>
                    <a className="file-link" href={`${API_URL}${item.downloadUrl}`} target="_blank" rel="noreferrer">
                      {item.originalName}
                    </a>
                  </td>
                  <td>{item.clientId}</td>
                  <td>{new Date(item.uploadedAt).toLocaleString()}</td>
                  <td>
                    <button type="button" onClick={() => void openClientPbcItems(item)}>View Items</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Requirement List</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Description</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Client ID</th>
            </tr>
          </thead>
          <tbody>
            {visibleRequirements.map((requirement) => (
              <tr key={requirement.id}>
                <td>{requirement.title}</td>
                <td>{requirement.description}</td>
                <td>{requirement.dueDate || '-'}</td>
                <td>{requirement.status}</td>
                <td>{requirement.clientId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {successMessage ? <p className="success">{successMessage}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}

export default App;
