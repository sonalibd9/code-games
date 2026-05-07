import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  approvePbcList,
  deletePbcList,
  deletePbcItemFile,
  downloadPbcTemplate,
  downloadUpdatedPbcItemsExcel,
  deleteSubmission,
  fetchClients,
  fetchNotifications,
  fetchPbcItemFiles,
  fetchPbcItems,
  fetchPbcLists,
  fetchRequirements,
  fetchSubmissions,
  generateAutoPbcList,
  login,
  savePbcItems,
  resolveApiUrl,
  reviewPbcItemFile,
  updatePbcItemStatus,
  uploadPbcItemFile,
  uploadPbcList,
  uploadRequirementFile,
} from './api';
import { AuthUser, ClientEntity, Notification, PbcItem, PbcItemFile, PbcList, Requirement, Submission } from './types';

interface Session {
  token: string;
  user: AuthUser;
}

interface NotificationFeedItem {
  id: string;
  title: string;
  categoryLabel: string;
  summary: string;
  dateTime: string;
  primaryMeta: string;
  secondaryMeta: string;
  actionLabel: string;
  onOpen: () => void;
}

type PageState = 'portal' | 'auditor-client-select' | 'auditor-pbc' | 'trial-balance' | 'pbc-editor' | 'client-pbc-items' | 'pbc-item-detail';

const AUDIT_FINALISATION_DATES_STORAGE_KEY = 'auditFinalisationDatesByClient';
const TECHNICAL_UPDATES_LINK = 'https://answerconnect.cch.com/app/acr/combinable-document?nodeId=csh-da-filter!WKUS-TAL-DOCS-PHC-%7B30d62655-566c-3f42-b5a1-c23f405878f2%7D--WKUS_TAL_20329%23ARM59EB54A181BA18466525896B006159A5';
const RECENT_TECHNICAL_UPDATES = [
  'AnswerConnect.AI experience refresh with improved research entry points',
  'Updated privacy and cookie preference controls for user sessions',
  'Expanded support/help access links and external tax resource shortcuts',
  'Current published platform build reference: Version 32.3.4',
];

function loadSavedAuditFinalisationDates(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(AUDIT_FINALISATION_DATES_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, value]) => {
      if (typeof value === 'string') {
        acc[key] = value;
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
}

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

function calculateDueDate(baseDueDate: string, priority: string): string {
  if (!baseDueDate) return '';
  
  const date = new Date(baseDueDate + 'T00:00:00');
  if (isNaN(date.getTime())) return '';
  
  let monthsBack = 0;
  if ((priority ?? '').toLowerCase() === 'high') {
    monthsBack = 2;
  } else if ((priority ?? '').toLowerCase() === 'medium') {
    monthsBack = 1;
  }
  // Low priority or unset: 0 months back (same as the base due date).
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
        <p className="priority-all-done">All items completed.</p>
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

type MetricTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

type SupportChatRole = 'assistant' | 'user';

interface SupportChatMessage {
  id: string;
  role: SupportChatRole;
  content: string;
  isTyping?: boolean;
}

const SUPPORT_QUICK_PROMPTS = [
  'How do I upload a PBC file?',
  'Where do I review client documents?',
  'What are the demo credentials?',
];

const AURI_EMOJI = '🧭';

const AUDITOR_INSIGHTS = [
  {
    title: 'PBC Health Check',
    body: 'Focus first on overdue, high-priority, and pending-review items. These usually create the most audit delays.',
  },
  {
    title: 'Evidence Quality Tip',
    body: 'Files should clearly match the request ID or account caption. Clear filenames reduce review time and follow-up questions.',
  },
  {
    title: 'Due Date Discipline',
    body: 'High-risk items should be requested earlier than routine items so there is time for review, correction, and re-upload.',
  },
  {
    title: 'Trial Balance Reminder',
    body: 'Always reconcile the uploaded trial balance with the final signed financial statements before relying on it for audit work.',
  },
  {
    title: 'Review Priority',
    body: 'Start with documents linked to fraud risk, revenue, estimates, related parties, provisions, and going concern.',
  },
  {
    title: 'Client Follow-Up Tip',
    body: 'Group follow-ups by client and priority instead of sending separate messages for every missing file.',
  },
  {
    title: 'Documentation Standard',
    body: 'A good audit file should show what was requested, what was received, who reviewed it, and the final conclusion.',
  },
  {
    title: 'Common Delay Signal',
    body: 'Items with no upload, rejected documents, or unclear filenames are early signs of client-side blockers.',
  },
];

const FAQ_ITEMS = [
  {
    question: 'How does the portal know whether I am an auditor or client?',
    answer: 'Use the single sign-in form. The credentials determine the role and open the correct portal experience automatically.',
  },
  {
    question: 'Who can issue client upload access?',
    answer: 'Auditors can issue client upload access after signing in. The request form is available inside the auditor startup area.',
  },
  {
    question: 'Where do clients upload evidence?',
    answer: 'Clients can upload files against assigned requirements and attach supporting documents directly from PBC item detail pages.',
  },
  {
    question: 'Can clients see auditor-only tools?',
    answer: 'No. Auditor-only areas such as Audit Desk, client provisioning, and review workflows are hidden from client users.',
  },
  {
    question: 'What does Auri help with?',
    answer: 'Auri can answer quick questions about login, PBC uploads, item status, document review, trial balance, and notifications.',
  },
  {
    question: 'What should I do if a document is rejected?',
    answer: 'Review the item remarks or auditor feedback, upload the corrected document, and keep the item status updated.',
  },
];

const DEMO_CREDENTIALS = [
  { label: 'Audit lead', email: 'auditor@firm.com', password: 'Auditor@123', variant: 'auditor' },
  { label: 'Audit reviewer', email: 'auditor.reviewer@firm.com', password: 'Reviewer@123', variant: 'auditor' },
  { label: 'Alpha client', email: 'client.alpha@entity.com', password: 'Client@123', variant: 'client' },
  { label: 'Beta client', email: 'client.beta@entity.com', password: 'Client@123', variant: 'client' },
] as const;

const DEMO_AUDITOR_CREDENTIALS = DEMO_CREDENTIALS.filter((credential) => credential.variant === 'auditor');
const DEMO_CLIENT_CREDENTIALS = DEMO_CREDENTIALS.filter((credential) => credential.variant === 'client');

function getSupportChatReply(prompt: string): string {
  const text = prompt.toLowerCase();

  if (text.includes('credential') || text.includes('login') || text.includes('password')) {
    return 'Use the auditor or client demo dropdown on the login card. Each selection fills the matching email and password automatically.';
  }

  if (text.includes('upload') && (text.includes('pbc') || text.includes('excel') || text.includes('file'))) {
    return 'Auditors can open a client workspace, choose a PBC Excel or CSV file, and upload it from Detailed PBC Management. Clients can upload support from each PBC item detail page.';
  }

  if (text.includes('review') || text.includes('document') || text.includes('accept') || text.includes('reject')) {
    return 'Open the PBC item detail page from the editor or notification panel. Auditors can download client files and mark each document as accepted or rejected.';
  }

  if (text.includes('trial balance')) {
    return 'Auditors can use View Trial Balance from the client selection or PBC workspace screens to review trial balance submissions by client.';
  }

  if (text.includes('notification')) {
    return 'Auditor notifications appear in the bell menu after clients upload requirement files or PBC item documents.';
  }

  return 'I can help with login, PBC uploads, item status, document review, trial balance submissions, and notifications. Try asking about one of those workflows.';
}

function MetricCard({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: MetricTone;
}) {
  return (
    <div className={`metric-card metric-card-${tone}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      {detail ? <span className="metric-detail">{detail}</span> : null}
    </div>
  );
}

function CompletionBar({ completed, total }: { completed: number; total: number }) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="completion-bar" aria-label={`${percentage}% complete`}>
      <span className="completion-bar-fill" style={{ width: `${percentage}%` }} />
      <span className="completion-bar-label">{percentage}% complete</span>
    </div>
  );
}

function formatEntityType(value: ClientEntity['entityType']): string {
  const labels: Record<ClientEntity['entityType'], string> = {
    'listed-entity': 'Listed entity',
    'subsidiary': 'Subsidiary',
    'joint-venture': 'Joint venture',
    'body-corporate': 'Body corporate',
  };

  return labels[value] ?? value;
}

function formatDateLabel(value?: string): string {
  if (!value) {
    return '-';
  }

  const normalized = normalizeDateForInput(value);
  if (!normalized) {
    return value;
  }

  return new Date(`${normalized}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getFinancialYearLabel(requirement?: Requirement | null): string {
  const title = requirement?.title.trim();
  if (!title) {
    return 'this financial year';
  }

  const match = title.match(/\bFY\s*\d{4}\s*[-/]\s*\d{2,4}\b/i);
  return match ? match[0].replace(/\s+/g, ' ') : title;
}

function getFinancialYearKey(requirement?: Requirement | null): string {
  return getFinancialYearLabel(requirement).toLowerCase().replace(/\s+/g, ' ').trim();
}

function RequirementStatusPill({ status }: { status: Requirement['status'] }) {
  return (
    <span className={`status-pill status-pill-${status}`}>
      {status === 'submitted' ? 'Submitted' : 'Open'}
    </span>
  );
}

function App() {
  const [currentPage, setCurrentPage] = useState<PageState>('portal');
  const [trialBalanceReturnPage, setTrialBalanceReturnPage] = useState<PageState>('auditor-client-select');
  const [pbcWorkspaceReturnPage, setPbcWorkspaceReturnPage] = useState<PageState>('auditor-client-select');
  const [pbcEditorReturnPage, setPbcEditorReturnPage] = useState<PageState>('auditor-pbc');
  const [pageHistory, setPageHistory] = useState<PageState[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [passwordResetNotice, setPasswordResetNotice] = useState('');
  const [error, setError] = useState('');
  const [accessName, setAccessName] = useState('');
  const [accessEmail, setAccessEmail] = useState('');
  const [accessCompany, setAccessCompany] = useState('');
  const [accessNotes, setAccessNotes] = useState('');
  const [accessRequestNotice, setAccessRequestNotice] = useState('');
  const [questionName, setQuestionName] = useState('');
  const [questionEmail, setQuestionEmail] = useState('');
  const [questionCategory, setQuestionCategory] = useState('Portal access');
  const [questionText, setQuestionText] = useState('');
  const [questionNotice, setQuestionNotice] = useState('');

  const [clients, setClients] = useState<ClientEntity[]>([]);
  const [pbcLists, setPbcLists] = useState<PbcList[]>([]);
  const [pbcAllItems, setPbcAllItems] = useState<PbcItem[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [auditorNotifications, setAuditorNotifications] = useState<Notification[]>([]);
  const [isNotificationMenuOpen, setIsNotificationMenuOpen] = useState(false);
  const [isAuditDeskOpen, setIsAuditDeskOpen] = useState(false);
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [isFaqOpen, setIsFaqOpen] = useState(false);
  const [isQuestionsOpen, setIsQuestionsOpen] = useState(false);
  const [isSupportChatOpen, setIsSupportChatOpen] = useState(false);
  const [supportChatInput, setSupportChatInput] = useState('');
  const typingTimerRef = useRef<number | null>(null);
  const supportChatScrollRef = useRef<HTMLDivElement | null>(null);
  const [supportChatMessages, setSupportChatMessages] = useState<SupportChatMessage[]>(() => [
    {
      id: 'support-welcome',
      role: 'assistant',
      content: `Hi, I am ${AURI_EMOJI} Auri. I can help with logins, uploads, PBC lists, document review, trial balance, and notifications.`,
    },
  ]);

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
  const [auditFinalisationDatesByClient, setAuditFinalisationDatesByClient] = useState<Record<string, string>>(() => loadSavedAuditFinalisationDates());

  // Item-level file upload state
  const [activePbcItem, setActivePbcItem] = useState<PbcItem | null>(null);
  const [activePbcListForClient, setActivePbcListForClient] = useState<PbcList | null>(null);
  const [clientItemRows, setClientItemRows] = useState<PbcItem[]>([]);
  const [pbcItemFiles, setPbcItemFiles] = useState<PbcItemFile[]>([]);
  const [itemFileInput, setItemFileInput] = useState<File | null>(null);
  const previousPageRef = useRef<PageState>('portal');
  const skipHistoryRef = useRef(false);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current !== null) {
        window.clearInterval(typingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isSupportChatOpen || !supportChatScrollRef.current) {
      return;
    }
    supportChatScrollRef.current.scrollTop = supportChatScrollRef.current.scrollHeight;
  }, [isSupportChatOpen, supportChatMessages]);

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

    return pbcLists.filter(
      (item) => item.clientId === session.user.clientId && (item.source !== 'auto-generated' || item.approvedForClient),
    );
  }, [activeAuditorClientId, pbcLists, session]);

  const selectedPbcList = useMemo(
    () => visiblePbcLists.find((list) => list.id === selectedPbcListId) ?? null,
    [selectedPbcListId, visiblePbcLists],
  );

  const visiblePbcItems = useMemo(() => {
    const visibleListIds = new Set(visiblePbcLists.map((list) => list.id));
    return pbcAllItems.filter((item) => visibleListIds.has(item.pbcListId));
  }, [pbcAllItems, visiblePbcLists]);

  const clientTrialBalanceSubmissions = useMemo(() => {
    if (!session || session.user.role !== 'client') {
      return [];
    }

    return submissions
      .filter((submission) => {
        const requirement = visibleRequirements.find((item) => item.id === submission.requirementId);
        return requirement?.title.toLowerCase().includes('trial balance') ?? false;
      })
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }, [session, submissions, visibleRequirements]);

  const pbcStatusSummary = useMemo(() => {
    const completed = visiblePbcItems.filter((item) => item.status === 'Completed').length;
    const inProgress = visiblePbcItems.filter((item) => item.status === 'In progress').length;
    const pending = visiblePbcItems.filter((item) => item.status !== 'Completed' && item.status !== 'In progress').length;
    const overdue = visiblePbcItems.filter((item) => {
      if (item.status === 'Completed') {
        return false;
      }
      const days = calcPendingDays(normalizeDateForInput(item.dueDate));
      return days !== null && days < 0;
    }).length;
    const dueSoon = visiblePbcItems.filter((item) => {
      if (item.status === 'Completed') {
        return false;
      }
      const days = calcPendingDays(normalizeDateForInput(item.dueDate));
      return days !== null && days >= 0 && days <= 7;
    }).length;
    const total = visiblePbcItems.length;

    return {
      completed,
      inProgress,
      pending,
      overdue,
      dueSoon,
      total,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [visiblePbcItems]);

  const requirementSummary = useMemo(() => {
    const open = visibleRequirements.filter((requirement) => requirement.status === 'open').length;
    const submitted = visibleRequirements.filter((requirement) => requirement.status === 'submitted').length;
    const overdue = visibleRequirements.filter((requirement) => {
      if (requirement.status === 'submitted') {
        return false;
      }
      const days = calcPendingDays(requirement.dueDate ?? '');
      return days !== null && days < 0;
    }).length;

    return {
      open,
      submitted,
      overdue,
      total: visibleRequirements.length,
    };
  }, [visibleRequirements]);

  const auditDeskClient = useMemo(() => {
    if (!session || session.user.role !== 'auditor') {
      return null;
    }

    return clients.find((client) => client.id === activeAuditorClientId) ?? clients[0] ?? null;
  }, [activeAuditorClientId, clients, session]);

  const auditDeskSummary = useMemo(() => {
    const openItems = visiblePbcItems.filter((item) => item.status !== 'Completed');
    const overdueItems = openItems.filter((item) => {
      const days = calcPendingDays(normalizeDateForInput(item.dueDate));
      return days !== null && days < 0;
    });
    const highPriorityItems = openItems.filter((item) => (item.priority ?? '').toLowerCase() === 'high');
    const pendingReviewItems = visiblePbcItems.filter((item) => item.documentReviewStatus === 'Pending Review');
    const rejectedItems = visiblePbcItems.filter((item) => item.documentReviewStatus === 'Rejected');
    const noDocumentItems = openItems.filter((item) => !item.documentReviewStatus || item.documentReviewStatus === 'No Document');

    const followUpMap = new Map<string, PbcItem>();
    [...overdueItems, ...rejectedItems, ...noDocumentItems].forEach((item) => {
      followUpMap.set(item.id, item);
    });

    return {
      openItems,
      overdueItems,
      highPriorityItems,
      pendingReviewItems,
      rejectedItems,
      noDocumentItems,
      followUpItems: Array.from(followUpMap.values()).slice(0, 5),
    };
  }, [visiblePbcItems]);

  const auditDeskRecentActivity = useMemo(() => {
    const notificationActivity = auditorNotifications.slice(0, 4).map((notification) => ({
      id: `notification-${notification.id}`,
      title: notification.fileName,
      detail: notification.message,
      date: notification.uploadedAt,
    }));

    const listActivity = [...visiblePbcLists]
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      .slice(0, 4)
      .map((list) => ({
        id: `pbc-list-${list.id}`,
        title: list.originalName,
        detail: `PBC list uploaded for ${clients.find((client) => client.id === list.clientId)?.name ?? list.clientId}`,
        date: list.uploadedAt,
      }));

    return [...notificationActivity, ...listActivity]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [auditorNotifications, visiblePbcLists, clients]);

  const getClientLabel = (clientId: string) => clients.find((client) => client.id === clientId)?.name ?? clientId;

  const selectedAuditFinalisationDate = activeAuditorClientId
    ? (auditFinalisationDatesByClient[activeAuditorClientId] ?? '')
    : auditFinalisationDate;

  const getClientRequirementDueDate = (clientId?: string) => {
    if (!clientId) {
      return '';
    }

    const clientRequirements = requirements.filter((requirement) => requirement.clientId === clientId);
    const trialBalanceRequirement = clientRequirements.find(
      (requirement) =>
        requirement.title.toLowerCase().includes('trial balance') &&
        normalizeDateForInput(requirement.dueDate ?? ''),
    );
    const fallbackRequirement = clientRequirements.find((requirement) => normalizeDateForInput(requirement.dueDate ?? ''));

    return normalizeDateForInput((trialBalanceRequirement ?? fallbackRequirement)?.dueDate ?? '');
  };

  const getPbcDueDateBaseForClient = (clientId?: string) => {
    if (!clientId) {
      return selectedAuditFinalisationDate;
    }

    return getClientRequirementDueDate(clientId) || auditFinalisationDatesByClient[clientId] || '';
  };

  const getPbcDueDateForClient = (clientId: string | undefined, priority: string) => {
    const requirementDueDate = getClientRequirementDueDate(clientId);
    if (requirementDueDate) {
      return requirementDueDate;
    }

    const fallbackDueDate = getPbcDueDateBaseForClient(clientId);
    return fallbackDueDate ? calculateDueDate(fallbackDueDate, priority) : '';
  };

  const selectedClientRequirementDueDate = getClientRequirementDueDate(activeAuditorClientId);
  const selectedPbcDueDateBase = getPbcDueDateBaseForClient(activeAuditorClientId);
  const selectedPbcDueDateBaseLabel = selectedClientRequirementDueDate ? 'Requirement Due Date' : 'Audit Finalisation';
  const selectedEditorClientId = selectedPbcList?.clientId || activeAuditorClientId;
  const selectedEditorDueDateBase = selectedPbcList?.clientId
    ? getPbcDueDateBaseForClient(selectedPbcList.clientId)
    : selectedPbcDueDateBase;

  const hasPreviousPage = pageHistory.length > 0;

  const getNotificationLinkLabel = (notification: Notification) => {
    if (notification.target.page === 'trial-balance') {
      return 'Open trial balance';
    }

    if (notification.target.page === 'pbc-item-detail') {
      return notification.itemRequestId ? `Open ${notification.itemRequestId}` : 'Open item';
    }

    return 'Open requirement';
  };

  const getNotificationCategory = (notification: Notification) => {
    if (notification.target.page === 'trial-balance') {
      return { label: 'Trial balance', badge: 'TB' };
    }

    if (notification.target.page === 'pbc-item-detail') {
      return { label: 'PBC item', badge: 'PBC' };
    }

    return { label: 'Requirement', badge: 'REQ' };
  };

  const getNotificationSummary = (notification: Notification) => {
    const clientName = getClientLabel(notification.clientId);

    if (notification.target.page === 'trial-balance') {
      return `Uploaded trial balance for ${clientName}.`;
    }

    if (notification.target.page === 'pbc-item-detail') {
      return notification.itemRequestId
        ? `Uploaded supporting document for ${notification.itemRequestId}.`
        : 'Uploaded supporting document for review.';
    }

    return notification.requirementTitle
      ? `Uploaded document for ${notification.requirementTitle}.`
      : notification.message;
  };

  const formatNotificationTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getDocumentReviewOutcomeLabel = (status?: PbcItem['documentReviewStatus']) => {
    if (status === 'Accepted' || status === 'Rejected') {
      return status;
    }

    return '';
  };

  useEffect(() => {
    setIsNotificationMenuOpen(false);
  }, [currentPage]);

  useEffect(() => {
    if (!session || session.user.role !== 'auditor') {
      return;
    }

    if (!activeAuditorClientId) {
      setAuditFinalisationDate('');
      return;
    }

    setAuditFinalisationDate(auditFinalisationDatesByClient[activeAuditorClientId] ?? '');
  }, [activeAuditorClientId, auditFinalisationDatesByClient, session]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      AUDIT_FINALISATION_DATES_STORAGE_KEY,
      JSON.stringify(auditFinalisationDatesByClient),
    );
  }, [auditFinalisationDatesByClient]);

  useEffect(() => {
    const previousPage = previousPageRef.current;

    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      previousPageRef.current = currentPage;
      return;
    }

    if (previousPage !== currentPage) {
      setPageHistory((history) => [...history, previousPage]);
      previousPageRef.current = currentPage;
    }
  }, [currentPage]);

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
    const [reqs, pbcData, pbcItemsData, submissionList] = await Promise.all([
      fetchRequirements(token),
      fetchPbcLists(token),
      fetchPbcItems(token),
      fetchSubmissions(token),
    ]);
    setRequirements(reqs);
    if (role === 'client') {
      setSelectedRequirementId((current) => (current ? current : reqs[0]?.id ?? ''));
    }
    setPbcLists(pbcData);
    setPbcAllItems(pbcItemsData);
    setSubmissions(submissionList);

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

    const streamUrl = resolveApiUrl(`/api/notifications/stream?token=${encodeURIComponent(session.token)}`);
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

  async function loadPbcEditorData(token: string, pbcListId: string, clientIdOverride?: string) {
    const rows = await fetchPbcItems(token, pbcListId);
    const listClientId = clientIdOverride ?? pbcLists.find((list) => list.id === pbcListId)?.clientId ?? activeAuditorClientId;
    const filled = rows.map((row) => {
      const normalizedDueDate = normalizeDateForInput(row.dueDate);
      const inferredPriority = inferPriorityFromRiskAssertion(row.riskAssertion);
      const finalPriority = row.priority || inferredPriority;
      const calculatedDueDate = listClientId ? getPbcDueDateForClient(listClientId, finalPriority) : normalizedDueDate;
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
      const dueDateBase = getPbcDueDateBaseForClient(activeAuditorClientId);
      if (dueDateBase) {
        const clientListIds = pbcLists
          .filter((list) => list.clientId === activeAuditorClientId)
          .map((list) => list.id);

        const itemsNeedingDueDateSync = pbcAllItems.filter(
          (item) => clientListIds.includes(item.pbcListId) && normalizeDateForInput(item.dueDate) !== getPbcDueDateForClient(activeAuditorClientId, item.priority),
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
              dueDate: getPbcDueDateForClient(activeAuditorClientId, row.priority),
              status: row.status,
              remarks: row.remarks,
            })),
          );

          await loadPortalData(session.token, session.user.role);
        }
      }

      setPbcWorkspaceReturnPage('auditor-client-select');
      setCurrentPage('auditor-pbc');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply requirement due date to PBC item due dates.');
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccessMessage('');
    setPasswordResetNotice('');

    const credentials = {
      email: loginEmail.trim(),
      password: loginPassword,
    };

    if (!credentials.email || !credentials.password) {
      setError('Please enter your email and password.');
      return;
    }

    try {
      const loginData = await login(credentials.email, credentials.password);

      setSession(loginData);
      
      try {
        await loadPortalData(loginData.token, loginData.user.role);
      } catch (dataErr) {
        setError(`Failed to load portal data: ${dataErr instanceof Error ? dataErr.message : 'Unknown error'}`);
        return;
      }

      const nextPage = loginData.user.role === 'auditor' ? 'auditor-client-select' : 'portal';
      skipHistoryRef.current = nextPage !== currentPage;
      previousPageRef.current = nextPage;
      setPageHistory([]);
      setCurrentPage(nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    }
  }

  function handleForgotPassword() {
    const email = loginEmail.trim();
    setError('');

    if (!email) {
      setPasswordResetNotice('Enter your registered email first, then request a password reset.');
      return;
    }

    const demoCredential = DEMO_CREDENTIALS.find(
      (credential) => credential.email.toLowerCase() === email.toLowerCase(),
    );

    if (demoCredential) {
      setLoginEmail(demoCredential.email);
      setLoginPassword(demoCredential.password);
      setPasswordResetNotice(`Password reset to the demo default for ${demoCredential.label}. You can sign in now.`);
      return;
    }

    setPasswordResetNotice(`Reset request prepared for ${email}. Please ask your portal administrator to issue a secure reset link.`);
  }

  async function handleAuditorTrialBalanceLogin() {
    setError('');
    setSuccessMessage('');

    const email = loginEmail.trim() || 'auditor@firm.com';
    const password = loginPassword || 'Auditor@123';

    setLoginEmail(email);
    setLoginPassword(password);

    try {
      const loginData = await login(email, password);

      if (loginData.user.role !== 'auditor') {
        setError('This shortcut is for auditor login only.');
        return;
      }

      setSession(loginData);
      await loadPortalData(loginData.token, loginData.user.role);
      skipHistoryRef.current = true;
      previousPageRef.current = 'trial-balance';
      setPageHistory([]);
      setTrialBalanceReturnPage('auditor-client-select');
      setCurrentPage('trial-balance');
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
      const dueDateBase = getPbcDueDateBaseForClient(targetClientId);
      const dueDateSourceLabel = getClientRequirementDueDate(targetClientId) ? 'client requirement due date' : 'audit finalisation fallback date';
      if (dueDateBase) {
        const uploadedListItems = await fetchPbcItems(session.token, uploaded.id);
        const itemsNeedingDueDateSync = uploadedListItems.filter(
          (item) => normalizeDateForInput(item.dueDate) !== getPbcDueDateForClient(targetClientId, item.priority),
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
              dueDate: getPbcDueDateForClient(targetClientId, row.priority),
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
          syncedCount > 0 ? ` Calculated due date from the ${dueDateSourceLabel} for ${syncedCount} item(s).` : ''
        }`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the detailed PBC list.');
    }
  }

  async function handleGenerateAutoPbc() {
    if (!session || session.user.role !== 'auditor' || !activeAuditorClientId) {
      setError('Please select a client before generating an auto PBC list.');
      return;
    }

    setError('');
    setSuccessMessage('');

    try {
      const generated = await generateAutoPbcList(session.token, activeAuditorClientId);
      let syncedCount = 0;
      const dueDateBase = getPbcDueDateBaseForClient(activeAuditorClientId);
      const dueDateSourceLabel = getClientRequirementDueDate(activeAuditorClientId) ? 'client requirement due date' : 'audit finalisation fallback date';

      if (dueDateBase) {
        const generatedItems = await fetchPbcItems(session.token, generated.id);
        const itemsNeedingDueDateSync = generatedItems.filter(
          (item) => normalizeDateForInput(item.dueDate) !== getPbcDueDateForClient(activeAuditorClientId, item.priority),
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
              dueDate: getPbcDueDateForClient(activeAuditorClientId, row.priority),
              status: row.status,
              remarks: row.remarks,
            })),
          );
          syncedCount = itemsNeedingDueDateSync.length;
        }
      }

      await loadPortalData(session.token, session.user.role);
      setSelectedPbcListId(generated.id);
      await loadPbcEditorData(session.token, generated.id, activeAuditorClientId);
      setPbcEditorReturnPage('auditor-pbc');
      setCurrentPage('pbc-editor');

      const matchedCount = generated.matchedSubgroups?.length ?? 0;
      const unmatchedCount = generated.unmatchedSubgroups?.length ?? 0;
      setSuccessMessage(
        `Auto PBC generated from ${generated.trialBalanceFileName ?? 'the latest trial balance'} with ${generated.parsedItemCount ?? 0} item(s) across ${matchedCount} matched subgroup(s).${
          unmatchedCount > 0 ? ` ${unmatchedCount} subgroup(s) did not match the base PBC template.` : ''
        }${syncedCount > 0 ? ` Due dates were calculated from the ${dueDateSourceLabel} for ${syncedCount} item(s).` : ''} You can now adjust the list in PBC Editor and save changes. It remains hidden from the client until you approve it.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate auto PBC list from trial balance.');
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

  async function handleOpenPbcEditor(returnPage: PageState = currentPage) {
    if (!session) {
      return;
    }

    setError('');
    setSuccessMessage('');
    setPbcEditorReturnPage(returnPage === 'pbc-editor' ? 'auditor-pbc' : returnPage);
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
          const nextPriority = inferredPriority || row.priority;
          const nextDueDate = selectedEditorClientId
            ? getPbcDueDateForClient(selectedEditorClientId, nextPriority)
            : row.dueDate;

          return {
            ...row,
            riskAssertion: value,
            priority: nextPriority,
            dueDate: nextDueDate,
          };
        }

        if (field === 'priority') {
          const nextDueDate = selectedEditorClientId
            ? getPbcDueDateForClient(selectedEditorClientId, value)
            : row.dueDate;

          return {
            ...row,
            priority: value,
            dueDate: nextDueDate,
          };
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
          priority: row.priority,
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

    const selectedRequirement = visibleRequirements.find((item) => item.id === selectedRequirementId);
    const isTrialBalanceUpload = selectedRequirement?.title.toLowerCase().includes('trial balance') ?? false;
    let shouldReplaceExistingTrialBalance = false;
    let trialBalanceFinancialYearLabel = '';

    if (isTrialBalanceUpload) {
      trialBalanceFinancialYearLabel = getFinancialYearLabel(selectedRequirement);
      const selectedFinancialYearKey = getFinancialYearKey(selectedRequirement);
      const normalizedUploadName = uploadFile.name.trim().toLowerCase();
      const duplicateTrialBalance = clientTrialBalanceSubmissions.find(
        (submission) => submission.originalName.trim().toLowerCase() === normalizedUploadName,
      );
      const existingFinancialYearTrialBalance = clientTrialBalanceSubmissions.find((submission) => {
        const submissionRequirement = visibleRequirements.find((item) => item.id === submission.requirementId);

        if (!submissionRequirement) {
          return submission.requirementId === selectedRequirementId;
        }

        return getFinancialYearKey(submissionRequirement) === selectedFinancialYearKey;
      });

      if (duplicateTrialBalance) {
        window.alert(`Duplicate file name detected: "${uploadFile.name}" has already been uploaded as a trial balance.`);
      }

      if (existingFinancialYearTrialBalance) {
        const shouldReplace = window.confirm(
          `A trial balance for ${trialBalanceFinancialYearLabel} is already uploaded as "${existingFinancialYearTrialBalance.originalName}".\n\nDo you want to replace it with "${uploadFile.name}"?`,
        );

        if (!shouldReplace) {
          setError(`Upload cancelled because a trial balance for ${trialBalanceFinancialYearLabel} already exists.`);
          return;
        }

        shouldReplaceExistingTrialBalance = true;
      } else if (duplicateTrialBalance) {
        const shouldContinue = window.confirm(`Do you want to continue and upload "${uploadFile.name}" again?`);

        if (!shouldContinue) {
          setError('Upload cancelled because a trial balance with the same file name already exists.');
          return;
        }
      }
    }

    try {
      await uploadRequirementFile(session.token, selectedRequirementId, uploadFile, {
        replaceExistingTrialBalance: shouldReplaceExistingTrialBalance,
      });
      await loadPortalData(session.token, session.user.role);
      setUploadFile(null);
      setSuccessMessage(
        shouldReplaceExistingTrialBalance
          ? `Trial balance for ${trialBalanceFinancialYearLabel} replaced successfully.`
          : 'Client data uploaded successfully.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
  }

  async function handleApprovePbcList(pbcListId: string) {
    if (!session || session.user.role !== 'auditor') {
      return;
    }

    setError('');
    setSuccessMessage('');

    try {
      const approved = await approvePbcList(session.token, pbcListId);
      setPbcLists((current) => current.map((list) => (list.id === approved.id ? approved : list)));
      setSelectedPbcListId(approved.id);
      setSuccessMessage('Auto PBC approved for client access. The client can now view the list and upload supporting documents.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not approve this PBC list for the client.');
    }
  }

  async function handleDeleteTrialBalanceUpload(submission: Submission) {
    if (!session) {
      return;
    }

    const shouldDelete = window.confirm(`Delete uploaded trial balance "${submission.originalName}"?`);
    if (!shouldDelete) {
      return;
    }

    setError('');
    setSuccessMessage('');

    try {
      await deleteSubmission(session.token, submission.id);
      await loadPortalData(session.token, session.user.role);
      setSuccessMessage('Trial balance upload deleted successfully. You can upload the corrected file now.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the trial balance upload.');
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

  async function handleReviewItemFile(fileId: string, decision: 'accepted' | 'rejected') {
    if (!session || session.user.role !== 'auditor' || !activePbcItem) {
      return;
    }

    setError('');
    setSuccessMessage('');

    try {
      await reviewPbcItemFile(session.token, fileId, decision);

      const [files, listItems, allItems] = await Promise.all([
        fetchPbcItemFiles(session.token, activePbcItem.id),
        fetchPbcItems(session.token, activePbcItem.pbcListId),
        fetchPbcItems(session.token),
      ]);

      setPbcItemFiles(files);
      setPbcEditorRows((current) => current.map((item) => listItems.find((row) => row.id === item.id) ?? item));
      setClientItemRows((current) => current.map((item) => listItems.find((row) => row.id === item.id) ?? item));
      setPbcAllItems(allItems);

      const refreshedItem = listItems.find((item) => item.id === activePbcItem.id);
      if (refreshedItem) {
        setActivePbcItem(refreshedItem);
      }

      setSuccessMessage(
        decision === 'accepted'
          ? 'Document accepted successfully.'
          : 'Document rejected. Item status set to Pending.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not review document.');
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

  function handleBackNavigation() {
    setPageHistory((history) => {
      if (history.length === 0) {
        return history;
      }

      const updatedHistory = [...history];
      const previousPage = updatedHistory.pop();

      if (previousPage) {
        skipHistoryRef.current = true;
        setCurrentPage(previousPage);
      }

      return updatedHistory;
    });
  }

  function openTrialBalance(returnPage: PageState = currentPage) {
    setTrialBalanceReturnPage(returnPage === 'trial-balance' ? 'auditor-client-select' : returnPage);
    setCurrentPage('trial-balance');
  }

  function handleTrialBalanceBack() {
    setCurrentPage(trialBalanceReturnPage === 'trial-balance' ? 'auditor-client-select' : trialBalanceReturnPage);
  }

  function openPbcWorkspace(returnPage: PageState = currentPage) {
    setPbcWorkspaceReturnPage(returnPage === 'auditor-pbc' ? 'auditor-client-select' : returnPage);
    setCurrentPage('auditor-pbc');
  }

  function handlePbcWorkspaceBack() {
    setCurrentPage(pbcWorkspaceReturnPage === 'auditor-pbc' ? 'auditor-client-select' : pbcWorkspaceReturnPage);
  }

  function handlePbcEditorBack() {
    setCurrentPage(pbcEditorReturnPage === 'pbc-editor' ? 'auditor-pbc' : pbcEditorReturnPage);
  }

  function handleWorkspaceNavigation() {
    setIsAuditDeskOpen(false);
    setIsInsightsOpen(false);
    setIsFaqOpen(false);
    setIsQuestionsOpen(false);
    setIsSupportChatOpen(false);
    setIsNotificationMenuOpen(false);

    if (!session) {
      setCurrentPage('portal');
      return;
    }

    if (session.user.role === 'auditor') {
      if (activeAuditorClientId) {
        openPbcWorkspace(currentPage);
      } else {
        setCurrentPage('auditor-client-select');
      }
      return;
    }

    setCurrentPage('portal');
  }

  function handleAuditDeskToggle() {
    if (!session || session.user.role !== 'auditor') {
      return;
    }

    setIsAuditDeskOpen((current) => !current);
    setIsInsightsOpen(false);
    setIsFaqOpen(false);
    setIsQuestionsOpen(false);
    setIsSupportChatOpen(false);
    setIsNotificationMenuOpen(false);
  }

  function addSupportChatExchange(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }

    const timestamp = Date.now();
    const userMessage: SupportChatMessage = {
      id: `support-user-${timestamp}`,
      role: 'user',
      content: trimmed,
    };
    const assistantMessageId = `support-assistant-${timestamp}`;
    const assistantMessage: SupportChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      isTyping: true,
    };

    setSupportChatMessages((current) => [...current, userMessage, assistantMessage]);

    if (typingTimerRef.current !== null) {
      window.clearInterval(typingTimerRef.current);
    }

    const fullReply = getSupportChatReply(trimmed);
    let index = 0;

    typingTimerRef.current = window.setInterval(() => {
      index += 2;
      const nextContent = fullReply.slice(0, index);
      const isComplete = index >= fullReply.length;

      setSupportChatMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content: nextContent,
                isTyping: !isComplete,
              }
            : message,
        ),
      );

      if (isComplete && typingTimerRef.current !== null) {
        window.clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    }, 18);
  }

  function handleSupportChatSubmit(event: FormEvent) {
    event.preventDefault();
    const prompt = supportChatInput.trim();
    if (!prompt) {
      return;
    }

    setSupportChatInput('');
    addSupportChatExchange(prompt);
  }

  function handleAccessRequest(event: FormEvent) {
    event.preventDefault();

    const trimmedName = accessName.trim();
    const trimmedEmail = accessEmail.trim();
    const trimmedCompany = accessCompany.trim();

    if (!trimmedName || !trimmedEmail || !trimmedCompany) {
      setAccessRequestNotice('Please complete the required fields before submitting the access request.');
      return;
    }

    const requestPayload = {
      name: trimmedName,
      email: trimmedEmail,
      company: trimmedCompany,
      requestedAccess: 'client-upload',
      notes: accessNotes.trim(),
      requestedAt: new Date().toISOString(),
    };
    const requestId = `AR-${Date.now().toString().slice(-6)}`;

    try {
      window.localStorage.setItem('latestCredentialAccessRequest', JSON.stringify({ ...requestPayload, requestId }));
    } catch {
      // The confirmation still helps the user continue even if local storage is unavailable.
    }

    setAccessRequestNotice(`Request ${requestId} saved for ${trimmedEmail}. Client upload access can now be reviewed and provisioned by the auditor.`);
    setAccessName('');
    setAccessEmail('');
    setAccessCompany('');
    setAccessNotes('');
  }

  function handleQuestionSubmit(event: FormEvent) {
    event.preventDefault();

    const trimmedName = questionName.trim();
    const trimmedEmail = questionEmail.trim();
    const trimmedQuestion = questionText.trim();

    if (!trimmedName || !trimmedEmail || !trimmedQuestion) {
      setQuestionNotice('Please add your name, email, and question before submitting.');
      return;
    }

    const questionId = `Q-${Date.now().toString().slice(-6)}`;
    const questionPayload = {
      id: questionId,
      name: trimmedName,
      email: trimmedEmail,
      category: questionCategory,
      question: trimmedQuestion,
      submittedAt: new Date().toISOString(),
    };

    try {
      const currentQuestions = JSON.parse(window.localStorage.getItem('clientQuestions') ?? '[]') as unknown;
      const questions = Array.isArray(currentQuestions) ? currentQuestions : [];
      window.localStorage.setItem('clientQuestions', JSON.stringify([questionPayload, ...questions].slice(0, 25)));
    } catch {
      // The local confirmation still gives the user a clear next step.
    }

    setQuestionNotice(`Question ${questionId} submitted. The support/audit team can review it and add it to F&Q if useful.`);
    setQuestionName('');
    setQuestionEmail('');
    setQuestionCategory('Portal access');
    setQuestionText('');
  }

  async function handleNotificationNavigate(notification: Notification) {
    if (!session || session.user.role !== 'auditor') {
      return;
    }

    setError('');
    setSuccessMessage('');
    setIsNotificationMenuOpen(false);
    setActiveAuditorClientId(notification.clientId);
    setPbcClientId(notification.clientId);

    try {
      if (notification.target.page === 'trial-balance') {
        const latestSubmissions = await fetchSubmissions(session.token);
        setSubmissions(latestSubmissions);
        openTrialBalance(currentPage);
        return;
      }

      if (notification.target.page === 'portal') {
        await loadPortalData(session.token, session.user.role);
        setSelectedRequirementId(notification.target.requirementId ?? '');
        setCurrentPage('portal');
        return;
      }

      if (notification.target.page === 'pbc-item-detail' && notification.target.pbcListId && notification.target.pbcItemId) {
        const [allItems, listItems, itemFiles] = await Promise.all([
          fetchPbcItems(session.token),
          fetchPbcItems(session.token, notification.target.pbcListId),
          fetchPbcItemFiles(session.token, notification.target.pbcItemId),
        ]);

        const activeItem = listItems.find((item) => item.id === notification.target.pbcItemId);
        if (!activeItem) {
          setError('The uploaded item could not be found.');
          openPbcWorkspace(currentPage);
          return;
        }

        setPbcAllItems(allItems);
        setSelectedPbcListId(notification.target.pbcListId);
        setPbcEditorRows(listItems);
        setClientItemRows(listItems);
        setActivePbcListForClient(pbcLists.find((list) => list.id === notification.target.pbcListId) ?? null);
        setActivePbcItem(activeItem);
        setPbcItemFiles(itemFiles);
        setCurrentPage('pbc-item-detail');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open notification target.');
    }
  }

  function openClientRequirementNotification(requirementId: string) {
    setIsNotificationMenuOpen(false);
    setSelectedRequirementId(requirementId);
    setCurrentPage('portal');
  }

  function getNotificationFeedItems(): NotificationFeedItem[] {
    if (!session) {
      return [];
    }

    if (session.user.role === 'auditor') {
      return auditorNotifications.map((notification) => {
        const category = getNotificationCategory(notification);

        return {
          id: notification.id,
          title: notification.fileName,
          categoryLabel: category.label,
          summary: getNotificationSummary(notification),
          dateTime: notification.uploadedAt,
          primaryMeta: getClientLabel(notification.clientId),
          secondaryMeta: notification.uploadedByEmail,
          actionLabel: getNotificationLinkLabel(notification),
          onOpen: () => void handleNotificationNavigate(notification),
        };
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const feedItems: NotificationFeedItem[] = [];
    const seenIds = new Set<string>();
    const pushItem = (item: NotificationFeedItem) => {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        feedItems.push(item);
      }
    };

    visiblePbcItems
      .filter((item) => item.documentReviewStatus === 'Rejected')
      .slice(0, 4)
      .forEach((item) => {
        pushItem({
          id: `client-rejected-${item.id}`,
          title: item.requestId,
          categoryLabel: 'Action required',
          summary: item.remarks || 'Auditor rejected the uploaded support. Please review and upload the corrected document.',
          dateTime: item.updatedAt || item.dueDate || today.toISOString(),
          primaryMeta: item.owner || 'PBC item',
          secondaryMeta: item.description,
          actionLabel: 'Open item',
          onOpen: () => {
            setIsNotificationMenuOpen(false);
            void openItemDetail(item);
          },
        });
      });

    visiblePbcItems
      .filter((item) => item.status !== 'Completed')
      .map((item) => ({ item, days: calcPendingDays(normalizeDateForInput(item.dueDate)) }))
      .filter(({ days }) => days !== null && days < 0)
      .slice(0, 4)
      .forEach(({ item, days }) => {
        pushItem({
          id: `client-overdue-pbc-${item.id}`,
          title: item.requestId,
          categoryLabel: 'Overdue PBC',
          summary: `${Math.abs(days ?? 0)} day${Math.abs(days ?? 0) === 1 ? '' : 's'} overdue. ${item.description}`,
          dateTime: item.dueDate || item.updatedAt || today.toISOString(),
          primaryMeta: item.owner || 'PBC item',
          secondaryMeta: `Due ${formatDateLabel(item.dueDate)}`,
          actionLabel: 'Open item',
          onOpen: () => {
            setIsNotificationMenuOpen(false);
            void openItemDetail(item);
          },
        });
      });

    visibleRequirements
      .filter((requirement) => requirement.status === 'open')
      .map((requirement) => ({ requirement, days: calcPendingDays(requirement.dueDate ?? '') }))
      .filter(({ days }) => days !== null && days < 0)
      .slice(0, 3)
      .forEach(({ requirement, days }) => {
        pushItem({
          id: `client-overdue-requirement-${requirement.id}`,
          title: requirement.title,
          categoryLabel: 'Overdue requirement',
          summary: `${Math.abs(days ?? 0)} day${Math.abs(days ?? 0) === 1 ? '' : 's'} overdue. ${requirement.description}`,
          dateTime: requirement.dueDate || today.toISOString(),
          primaryMeta: 'Requirement upload',
          secondaryMeta: `Due ${formatDateLabel(requirement.dueDate)}`,
          actionLabel: 'Upload',
          onOpen: () => openClientRequirementNotification(requirement.id),
        });
      });

    visiblePbcItems
      .filter((item) => item.status !== 'Completed')
      .map((item) => ({ item, days: calcPendingDays(normalizeDateForInput(item.dueDate)) }))
      .filter(({ days }) => days !== null && days >= 0 && days <= 7)
      .slice(0, 3)
      .forEach(({ item, days }) => {
        pushItem({
          id: `client-due-pbc-${item.id}`,
          title: item.requestId,
          categoryLabel: 'Due soon',
          summary: days === 0 ? `Due today. ${item.description}` : `Due in ${days} day${days === 1 ? '' : 's'}. ${item.description}`,
          dateTime: item.dueDate || item.updatedAt || today.toISOString(),
          primaryMeta: item.owner || 'PBC item',
          secondaryMeta: `Due ${formatDateLabel(item.dueDate)}`,
          actionLabel: 'Open item',
          onOpen: () => {
            setIsNotificationMenuOpen(false);
            void openItemDetail(item);
          },
        });
      });

    visiblePbcLists
      .slice()
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      .slice(0, 2)
      .forEach((list) => {
        pushItem({
          id: `client-pbc-list-${list.id}`,
          title: list.originalName,
          categoryLabel: 'PBC list',
          summary: 'PBC list is available for document uploads.',
          dateTime: list.uploadedAt,
          primaryMeta: `${getStatusCountsForList(list.id).total} item${getStatusCountsForList(list.id).total === 1 ? '' : 's'}`,
          secondaryMeta: list.source === 'auto-generated' ? 'Generated by auditor' : 'Uploaded by auditor',
          actionLabel: 'View items',
          onOpen: () => {
            setIsNotificationMenuOpen(false);
            void openClientPbcItems(list);
          },
        });
      });

    return feedItems.slice(0, 10);
  }

  const notificationFeedItems = getNotificationFeedItems();
  const notificationCount = notificationFeedItems.length;
  const notificationMenuTitle = session?.user.role === 'auditor' ? 'Client Upload Notifications' : 'Notifications';
  const selectedDemoCredential = DEMO_CREDENTIALS.find((credential) => credential.email === loginEmail) ?? null;
  const selectedAuditorDemoCredential = selectedDemoCredential?.variant === 'auditor' ? selectedDemoCredential : null;
  const selectedClientDemoCredential = selectedDemoCredential?.variant === 'client' ? selectedDemoCredential : null;

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

  function renderBackControls(position: 'top' | 'bottom') {
    void position;
    return null;
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
    setSubmissions([]);
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
    setTrialBalanceReturnPage('auditor-client-select');
    setPbcWorkspaceReturnPage('auditor-client-select');
    setPbcEditorReturnPage('auditor-pbc');
    setIsNotificationMenuOpen(false);
    setIsAuditDeskOpen(false);
    setIsInsightsOpen(false);
    setIsFaqOpen(false);
    setIsQuestionsOpen(false);
    setIsSupportChatOpen(false);
    skipHistoryRef.current = true;
    previousPageRef.current = 'portal';
    setPageHistory([]);
  }

  function renderNotificationList(limit = 5, variant: 'panel' | 'menu' = 'panel') {
    const items = notificationFeedItems.slice(0, limit);

    if (items.length === 0) {
      return <p className="muted">No notifications yet.</p>;
    }

    return (
      <ul className={`notification-list notification-list-${variant}`}>
        {items.map((notification) => (
            <li key={notification.id} className="notification-item">
              <div className="notification-item-main">
                <div className="notification-item-content">
                  <div className="notification-item-top">
                    <div className="notification-title-block">
                      <div className="notification-title-row">
                        <strong className="notification-file-name">{notification.title}</strong>
                        <span className="notification-type">{notification.categoryLabel}</span>
                      </div>
                      <p className="notification-item-message">{notification.summary}</p>
                    </div>
                    <time className="notification-item-time" dateTime={notification.dateTime}>
                      {formatNotificationTime(notification.dateTime)}
                    </time>
                  </div>
                  <div className="notification-item-bottom">
                    <div className="notification-item-meta" aria-label="Notification details">
                      <span>{notification.primaryMeta}</span>
                      <span>{notification.secondaryMeta}</span>
                    </div>
                    <button
                      type="button"
                      className="notification-link"
                      onClick={notification.onOpen}
                    >
                      {notification.actionLabel}
                    </button>
                  </div>
                </div>
              </div>
            </li>
        ))}
      </ul>
    );
  }

  function renderSupportChat() {
    if (!isSupportChatOpen) {
      return null;
    }

    return (
      <aside className="support-chat" role="dialog" aria-label="Auri support chatbot">
        <div className="support-chat-header">
          <div>
            <span className="support-chat-eyebrow">Support</span>
            <h3><span className="support-chat-avatar" aria-hidden="true">{AURI_EMOJI}</span>Auri</h3>
          </div>
          <button
            type="button"
            className="support-chat-close"
            aria-label="Close support chat"
            onClick={() => setIsSupportChatOpen(false)}
          >
            X
          </button>
        </div>

        <div ref={supportChatScrollRef} className="support-chat-messages" aria-live="polite">
          {supportChatMessages.map((message) => (
            <div key={message.id} className={`support-chat-message support-chat-message-${message.role}`}>
              {message.content}
              {message.isTyping ? <span aria-hidden="true">...</span> : null}
            </div>
          ))}
        </div>

        <div className="support-chat-prompts" aria-label="Suggested support questions">
          {SUPPORT_QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => addSupportChatExchange(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>

        <form className="support-chat-form" onSubmit={handleSupportChatSubmit}>
          <label htmlFor="support-chat-input" className="sr-only">Ask support</label>
          <input
            id="support-chat-input"
            value={supportChatInput}
            onChange={(event) => setSupportChatInput(event.target.value)}
            placeholder="Ask about uploads, review, login..."
          />
          <button type="submit" disabled={!supportChatInput.trim()}>
            Send
          </button>
        </form>
      </aside>
    );
  }

  function renderSupportChatLauncher() {
    if (isSupportChatOpen) {
      return null;
    }

    return (
      <button
        type="button"
        className="support-chat-launcher"
        aria-label="Open Auri support chatbot"
        onClick={() => {
          setIsSupportChatOpen(true);
          setIsAuditDeskOpen(false);
          setIsInsightsOpen(false);
          setIsFaqOpen(false);
          setIsQuestionsOpen(false);
          setIsNotificationMenuOpen(false);
        }}
      >
        <span className="support-chat-launcher-avatar" aria-hidden="true">{AURI_EMOJI}</span>
        <span className="support-chat-launcher-copy">
          <strong>Auri is online</strong>
          <small>Ask a quick portal question</small>
        </span>
      </button>
    );
  }

  function renderAuditDeskPanel() {
    if (!isAuditDeskOpen) {
      return null;
    }

    if (!session || session.user.role !== 'auditor') {
      return null;
    }

    const clientName = auditDeskClient?.name ?? 'No client selected';
    const entityType = auditDeskClient ? formatEntityType(auditDeskClient.entityType) : 'Client workspace';

    return (
      <aside className="audit-desk-panel" role="dialog" aria-label="Audit Desk">
        <div className="audit-desk-header">
          <div>
            <span className="audit-desk-eyebrow">Audit Desk</span>
            <h3>Today&apos;s audit priorities</h3>
          </div>
          <button type="button" className="audit-desk-close" aria-label="Close Audit Desk" onClick={() => setIsAuditDeskOpen(false)}>
            X
          </button>
        </div>

        <div className="audit-desk-content">
          <section className="audit-desk-snapshot">
            <div>
              <span className="audit-desk-label">Client snapshot</span>
              <strong>{clientName}</strong>
              <p>{entityType}</p>
            </div>
            <div className="audit-desk-snapshot-grid">
              <span>PBC lists <strong>{visiblePbcLists.length}</strong></span>
              <span>Open items <strong>{auditDeskSummary.openItems.length}</strong></span>
              <span>Due date base <strong>{formatDateLabel(selectedPbcDueDateBase)}</strong></span>
            </div>
          </section>

          <section className="audit-desk-section">
            <div className="audit-desk-section-heading">
              <h4>Quick Actions</h4>
              <span>Jump to common audit tasks</span>
            </div>
            <div className="audit-desk-actions">
              <button type="button" onClick={handleWorkspaceNavigation}>
                Open Workspace
              </button>
              <button
                type="button"
                className="secondary"
                disabled={!activeAuditorClientId}
                onClick={() => {
                  setIsAuditDeskOpen(false);
                  openPbcWorkspace(currentPage);
                }}
              >
                Upload PBC List
              </button>
              <button
                type="button"
                className="secondary"
                disabled={!selectedPbcListId}
                onClick={() => {
                  setIsAuditDeskOpen(false);
                  void handleOpenPbcEditor();
                }}
              >
                Open PBC Editor
              </button>
              <button
                type="button"
                className="secondary"
                disabled={!activeAuditorClientId}
                onClick={() => {
                  setIsAuditDeskOpen(false);
                  openTrialBalance(currentPage);
                }}
              >
                View Trial Balance
              </button>
              <button
                type="button"
                className="secondary"
                disabled={!activeAuditorClientId}
                onClick={() => void handleDownloadPbcTemplate()}
              >
                Download Template
              </button>
            </div>
          </section>

          <div className="audit-desk-columns">
            <section className="audit-desk-section">
              <div className="audit-desk-section-heading">
                <h4>Follow-Up List</h4>
                <span>Missing, rejected, or overdue evidence</span>
              </div>
              {auditDeskSummary.followUpItems.length === 0 ? (
                <p className="audit-desk-muted">No urgent follow-ups right now.</p>
              ) : (
                <ul className="audit-desk-list">
                  {auditDeskSummary.followUpItems.map((item) => (
                    <li key={item.id}>
                      <strong>{item.requestId || 'PBC item'}</strong>
                      <span>{item.description || item.owner || 'Evidence follow-up needed'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="audit-desk-section">
              <div className="audit-desk-section-heading">
                <h4>Recent Activity</h4>
                <span>Latest uploads and notifications</span>
              </div>
              {auditDeskRecentActivity.length === 0 ? (
                <p className="audit-desk-muted">No recent activity yet.</p>
              ) : (
                <ul className="audit-desk-list">
                  {auditDeskRecentActivity.map((activity) => (
                    <li key={activity.id}>
                      <strong>{activity.title}</strong>
                      <span>{activity.detail}</span>
                      <em>{formatDateLabel(activity.date)}</em>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </aside>
    );
  }

  function renderInsightsPanel() {
    if (!isInsightsOpen) {
      return null;
    }

    return (
      <aside className="insights-panel" role="dialog" aria-label="Auditor insights">
        <div className="insights-panel-header">
          <div>
            <span className="insights-eyebrow">Auditor Insights</span>
            <h3>Practical audit reminders</h3>
          </div>
          <button
            type="button"
            className="insights-close"
            aria-label="Close auditor insights"
            onClick={() => setIsInsightsOpen(false)}
          >
            X
          </button>
        </div>

        <div className="insights-spotlight">
          <span>Auditor Tip</span>
          <strong>Start with items that can block the close.</strong>
          <p>Overdue, high-risk, rejected, and pending-review items deserve the first pass each morning.</p>
        </div>

        <div className="insights-grid" aria-label="Basic auditor knowledge">
          {AUDITOR_INSIGHTS.map((insight) => (
            <article key={insight.title} className="insight-card">
              <h4>{insight.title}</h4>
              <p>{insight.body}</p>
            </article>
          ))}
        </div>
      </aside>
    );
  }

  function renderFaqPanel() {
    if (!isFaqOpen) {
      return null;
    }

    return (
      <aside className="faq-panel" role="dialog" aria-label="Frequently asked questions">
        <div className="faq-panel-header">
          <div>
            <span className="faq-eyebrow">F&Q</span>
            <h3>Quick answers</h3>
          </div>
          <button
            type="button"
            className="faq-close"
            aria-label="Close F&Q"
            onClick={() => setIsFaqOpen(false)}
          >
            X
          </button>
        </div>

        <div className="faq-intro">
          <strong>Find the right path faster.</strong>
          <p>Short answers for sign-in, client access, uploads, Auri, and role visibility.</p>
        </div>

        <div className="faq-list">
          {FAQ_ITEMS.map((item) => (
            <article key={item.question} className="faq-item">
              <h4>{item.question}</h4>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </aside>
    );
  }

  function renderQuestionsPanel() {
    if (!isQuestionsOpen) {
      return null;
    }

    if (!session || session.user.role !== 'client') {
      return null;
    }

    return (
      <aside className="questions-panel" role="dialog" aria-label="Submit a question">
        <div className="questions-panel-header">
          <div>
            <span className="questions-eyebrow">Questions</span>
            <h3>Ask something new</h3>
          </div>
          <button
            type="button"
            className="questions-close"
            aria-label="Close Questions"
            onClick={() => setIsQuestionsOpen(false)}
          >
            X
          </button>
        </div>

        <div className="questions-intro">
          <strong>Could not find it in F&Q?</strong>
          <p>Send a new question for the support or audit team to review. Useful questions can be added back into F&Q later.</p>
        </div>

        <form className="questions-form" onSubmit={handleQuestionSubmit}>
          <div className="questions-grid">
            <div>
              <label htmlFor="question-name">Your name</label>
              <input
                id="question-name"
                value={questionName}
                onChange={(event) => setQuestionName(event.target.value)}
                placeholder="Full name"
                required
              />
            </div>
            <div>
              <label htmlFor="question-email">Email</label>
              <input
                id="question-email"
                type="email"
                value={questionEmail}
                onChange={(event) => setQuestionEmail(event.target.value)}
                placeholder="name@company.com"
                required
              />
            </div>
          </div>

          <label htmlFor="question-category">Topic</label>
          <select
            id="question-category"
            value={questionCategory}
            onChange={(event) => setQuestionCategory(event.target.value)}
          >
            <option>Portal access</option>
            <option>Upload process</option>
            <option>PBC item support</option>
            <option>Document review</option>
            <option>Other</option>
          </select>

          <label htmlFor="question-text">Question</label>
          <textarea
            id="question-text"
            rows={4}
            value={questionText}
            onChange={(event) => setQuestionText(event.target.value)}
            placeholder="Write the question you want the team to answer."
            required
          />

          <div className="questions-actions">
            <button type="submit">Submit Question</button>
          </div>
          {questionNotice ? <p className="questions-notice">{questionNotice}</p> : null}
        </form>
      </aside>
    );
  }

  function renderBrandHeader() {
    return (
      <>
        <header className="brand-header">
          <div className="brand-logo-wrap">
            <span className="brand-dot" />
            <span className="brand-name">Audit Collaboration Hub</span>
          </div>
          <nav className="brand-nav" aria-label="Primary">
            {session?.user.role === 'auditor' ? (
              <button
                type="button"
                className="brand-nav-button"
                aria-expanded={isAuditDeskOpen ? 'true' : 'false'}
                onClick={handleAuditDeskToggle}
              >
                Audit Desk
              </button>
            ) : null}
            <button
              type="button"
              className="brand-nav-button"
              aria-expanded={isInsightsOpen ? 'true' : 'false'}
              onClick={() => {
                setIsInsightsOpen((current) => !current);
                setIsAuditDeskOpen(false);
                setIsFaqOpen(false);
                setIsQuestionsOpen(false);
                setIsSupportChatOpen(false);
              }}
            >
              Insights
            </button>
            <button
              type="button"
              className="brand-nav-button"
              aria-expanded={isFaqOpen ? 'true' : 'false'}
              onClick={() => {
                setIsFaqOpen((current) => !current);
                setIsAuditDeskOpen(false);
                setIsInsightsOpen(false);
                setIsQuestionsOpen(false);
                setIsSupportChatOpen(false);
              }}
            >
              FAQ
            </button>
            {session?.user.role === 'client' ? (
              <button
                type="button"
                className="brand-nav-button"
                aria-expanded={isQuestionsOpen ? 'true' : 'false'}
                onClick={() => {
                  setQuestionEmail((current) => current || session.user.email);
                  setIsQuestionsOpen((current) => !current);
                  setIsAuditDeskOpen(false);
                  setIsInsightsOpen(false);
                  setIsFaqOpen(false);
                  setIsSupportChatOpen(false);
                }}
              >
                Questions
              </button>
            ) : null}
            <button
              type="button"
              className="brand-nav-button"
              aria-expanded={isSupportChatOpen ? 'true' : 'false'}
              onClick={() => {
                setIsSupportChatOpen((current) => !current);
                setIsAuditDeskOpen(false);
                setIsInsightsOpen(false);
                setIsFaqOpen(false);
                setIsQuestionsOpen(false);
              }}
            >
              Support
            </button>
          </nav>
          {session ? (
            <div className="brand-actions">
              <div className="notification-bell-wrap">
                <button
                  type="button"
                  className="notification-bell"
                  aria-label="Open notifications"
                  aria-expanded={isNotificationMenuOpen ? 'true' : 'false'}
                  onClick={() => setIsNotificationMenuOpen((current) => !current)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="notification-bell-icon">
                    <path d="M12 3a4 4 0 0 0-4 4v1.1c0 .7-.2 1.4-.6 2L6 12.5c-.5.8-.7 1.8-.3 2.7.4.9 1.2 1.4 2.2 1.4h8.2c1 0 1.8-.5 2.2-1.4.4-.9.2-1.9-.3-2.7L16.6 10c-.4-.6-.6-1.3-.6-2V7a4 4 0 0 0-4-4Zm0 18a2.7 2.7 0 0 0 2.4-1.5h-4.8A2.7 2.7 0 0 0 12 21Z" fill="currentColor" />
                  </svg>
                  {notificationCount > 0 ? (
                    <span className="notification-badge">{notificationCount > 9 ? '9+' : notificationCount}</span>
                  ) : null}
                </button>
                {isNotificationMenuOpen ? (
                  <div className="notification-menu">
                    <div className="notification-menu-header">
                      <h3>{notificationMenuTitle}</h3>
                      <span className="notification-menu-count">{notificationCount} active</span>
                    </div>
                    {renderNotificationList(6, 'menu')}
                  </div>
                ) : null}
              </div>
              <button type="button" className="secondary brand-logout" onClick={handleLogout}>
                Logout
              </button>
            </div>
          ) : null}
        </header>
        {renderAuditDeskPanel()}
        {renderInsightsPanel()}
        {renderFaqPanel()}
        {renderQuestionsPanel()}
        {renderSupportChat()}
        {renderSupportChatLauncher()}
      </>
    );
  }

  if (!session) {
    return (
      <main className="page brand-shell">
        {renderBrandHeader()}
        <section className="hero-banner professional">
          <div className="hero-content">
            <h1><span className="hero-title-highlight">One stop solution for audit collaboration</span></h1>
            <p className="hero-copy-highlight">Track PBC evidence, client uploads, document review, and finalisation signals without scattered follow-ups.</p>
            <div className="hero-chips" aria-label="Portal highlights">
              <span>Live PBC control</span>
              <span>Auri assist</span>
              <span>Client-safe uploads</span>
            </div>
          </div>
          <div className="hero-art portal-hero-visual" aria-hidden="true">
            <div className="portal-visual-window">
              <div className="portal-visual-topbar">
                <span />
                <span />
                <span />
              </div>
              <div className="portal-visual-body portal-visual-body-branded">
                <div className="portal-visual-logo-card">
                  <img src="/neuaud-logo-cropped.png" alt="" />
                </div>
                <div className="portal-visual-brand-meta">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
            <div className="portal-visual-shield">
              <span />
            </div>
          </div>
        </section>

        <div className="feature-grid portal-feature-grid">
          <div className="feature-card">
            <h3>Command-center workspace</h3>
            <p>Select clients, publish PBC lists, and monitor completion signals from one focused view.</p>
          </div>
          <div className="feature-card">
            <h3>Guided client uploads</h3>
            <p>Clients see assigned requests and attach evidence directly against the exact PBC item.</p>
          </div>
          <div className="feature-card">
            <h3>Review signals that stand out</h3>
            <p>Status badges, upload alerts, and document outcomes keep priority follow-ups visible.</p>
          </div>
        </div>

        <section className="login-stage" aria-label="Sign in">
          <div className="login-preview-panel" aria-hidden="true">
            <div className="login-preview-topline">
              <span>Protected portal entry</span>
              <strong>Smart role routing</strong>
            </div>
            <div className="login-preview-window">
              <div className="preview-window-header">
                <span />
                <span />
                <span />
              </div>
              <div className="preview-kpi-row">
                <div>
                  <strong>1</strong>
                  <span>Secure sign-in</span>
                </div>
                <div>
                  <strong>2</strong>
                  <span>Tailored workspaces</span>
                </div>
              </div>
              <div className="preview-timeline">
                <div>
                  <strong>Authenticate securely</strong>
                  <span>Credentials decide the right portal view and protect client-only workspaces</span>
                </div>
                <div>
                  <strong>Open assigned workspace</strong>
                  <span>Clients and auditors see only the tools, requests, and files relevant to them</span>
                </div>
                <div>
                  <strong>Approve before release</strong>
                  <span>Auto PBC lists stay with auditors until they are reviewed and approved for client access</span>
                </div>
                <div>
                  <strong>Auri is online</strong>
                  <span>Quick support, FAQs, and insight prompts are available from the main navigation</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card auth-card unified-login-card">
            <span className="eyebrow">Secure entry</span>
            <h1>Welcome back</h1>
            <p className="muted">Use your credentials and the portal will open the right auditor or client experience automatically.</p>
            <form onSubmit={(event) => void handleLogin(event)}>
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                value={loginEmail}
                onChange={(event) => {
                  setLoginEmail(event.target.value);
                  setPasswordResetNotice('');
                }}
                autoComplete="email"
              />

              <div className="login-password-row">
                <label htmlFor="login-password">Password</label>
                <button type="button" className="forgot-password-button" onClick={handleForgotPassword}>
                  Forgot password?
                </button>
              </div>
              <input
                id="login-password"
                type="password"
                value={loginPassword}
                onChange={(event) => {
                  setLoginPassword(event.target.value);
                  setPasswordResetNotice('');
                }}
                autoComplete="current-password"
              />
              {passwordResetNotice ? <p className="password-reset-notice">{passwordResetNotice}</p> : null}

              <button type="submit">Sign In</button>
            </form>
            <div className="demo-credentials-panel">
              <div className="demo-credentials-heading">
                <strong>Quick demo access</strong>
                <span>Pick a profile and credentials fill instantly.</span>
              </div>
              <div className="demo-credential-picker-grid">
                <div className="demo-credential-select-card">
                  <label htmlFor="demo-auditor-select">Auditor demo</label>
                  <div className="demo-credential-select-wrap">
                    <select
                      id="demo-auditor-select"
                      className="demo-credential-select"
                      value={selectedAuditorDemoCredential?.email ?? ''}
                      aria-describedby="demo-credential-hint"
                      onChange={(event) => {
                        const credential = DEMO_AUDITOR_CREDENTIALS.find((item) => item.email === event.target.value);
                        if (!credential) {
                          return;
                        }

                        setLoginEmail(credential.email);
                        setLoginPassword(credential.password);
                        setPasswordResetNotice('');
                      }}
                    >
                      <option value="">Select auditor</option>
                      {DEMO_AUDITOR_CREDENTIALS.map((credential) => (
                        <option key={credential.email} value={credential.email}>
                          {credential.label} | {credential.email}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="demo-credential-select-card demo-credential-select-card-client">
                  <label htmlFor="demo-client-select">Client demo</label>
                  <div className="demo-credential-select-wrap">
                    <select
                      id="demo-client-select"
                      className="demo-credential-select"
                      value={selectedClientDemoCredential?.email ?? ''}
                      aria-describedby="demo-credential-hint"
                      onChange={(event) => {
                        const credential = DEMO_CLIENT_CREDENTIALS.find((item) => item.email === event.target.value);
                        if (!credential) {
                          return;
                        }

                        setLoginEmail(credential.email);
                        setLoginPassword(credential.password);
                        setPasswordResetNotice('');
                      }}
                    >
                      <option value="">Select client</option>
                      {DEMO_CLIENT_CREDENTIALS.map((credential) => (
                        <option key={credential.email} value={credential.email}>
                          {credential.label} | {credential.email}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div
                  id="demo-credential-hint"
                  className={`demo-credential-selected ${
                    selectedDemoCredential ? `demo-credential-selected-${selectedDemoCredential.variant}` : ''
                  }`}
                >
                  {selectedDemoCredential ? (
                    <>
                      <span className="demo-credential-avatar">
                        {selectedDemoCredential.variant === 'auditor' ? 'AU' : 'CL'}
                      </span>
                      <span className="demo-credential-selected-copy">
                        <span>{selectedDemoCredential.variant === 'auditor' ? 'Auditor workspace' : 'Client workspace'}</span>
                        <strong>{selectedDemoCredential.label}</strong>
                        <small>{selectedDemoCredential.email}</small>
                      </span>
                      <em>Ready</em>
                    </>
                  ) : (
                    <>
                      <span className="demo-credential-avatar demo-credential-avatar-muted">ID</span>
                      <span className="demo-credential-selected-copy">
                        <span>No profile selected</span>
                        <strong>Choose an account</strong>
                        <small>Email and password will be populated automatically.</small>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {error ? <p className="error">{error}</p> : null}

        <footer className="portal-build-footer" aria-label="Software build and legal information">
          <div className="portal-build-product">
            <span className="portal-legal-mark">
              <img src="/neuaud-logo-cropped.png" alt="" />
            </span>
            <strong>NeuAud Portal</strong>
            <span className="portal-build-version">v0.1.0</span>
          </div>
          <div className="portal-build-meta">
            <span>Build 2026.05</span>
            <span>Auto PBC Engine</span>
            <span>Auri Assist</span>
            <span>Role-Aware Access</span>
          </div>
          <p className="portal-legal-copy">
            Privacy | Copyright 2026 NeuAud. All rights reserved. Proprietary and confidential platform; access is limited to authorized users.
          </p>
        </footer>
      </main>
    );
  }

  if (session.user.role === 'auditor' && currentPage === 'auditor-client-select') {
    return (
      <main className="page brand-shell auditor-home-page">
        {renderBrandHeader()}
        {renderBackControls('top')}
        <section className="hero-banner compact auditor-home-hero">
          <h1>Select client workspace</h1>
          <p>Choose a client to continue with PBC upload and dashboard monitoring.</p>
        </section>

        <section className="metric-grid workspace-metrics auditor-home-metrics" aria-label="Auditor workspace summary">
          <MetricCard label="Active clients" value={clients.length} detail="Available workspaces" tone="info" />
          <MetricCard label="PBC lists" value={pbcLists.length} detail="Uploaded across clients" />
          <MetricCard label="Open requirements" value={requirementSummary.open} detail={`${requirementSummary.submitted} submitted`} tone="warning" />
          <MetricCard label="New notifications" value={auditorNotifications.length} detail="Client upload activity" tone={auditorNotifications.length > 0 ? 'danger' : 'success'} />
        </section>

        <div className="auditor-startup-layout">
          <section className="card auditor-startup-card">
            <div className="section-heading auditor-startup-heading">
              <div>
                <span className="auditor-startup-eyebrow">Workspace setup</span>
                <h2>Auditor Startup</h2>
                <p className="muted">Set the client context before opening the workspace. PBC due dates use the client requirement due date when available.</p>
              </div>
              <span className={`auditor-startup-status ${activeAuditorClientId ? 'ready' : 'pending'}`}>
                {activeAuditorClientId ? 'Client selected' : 'Select client first'}
              </span>
            </div>
            <div className="auditor-startup-field-grid">
              <div className="auditor-startup-field-card">
                <label htmlFor="auditor-client-select">Client workspace</label>
                <select
                  id="auditor-client-select"
                  value={activeAuditorClientId}
                  onChange={(e) => {
                    setActiveAuditorClientId(e.target.value);
                    setPbcClientId(e.target.value);
                    setSelectedPbcListId('');
                  }}
                >
                  <option value="">Select client</option>
                  {clients.map((client) => (
                    <option value={client.id} key={client.id}>
                      {client.name} ({formatEntityType(client.entityType)})
                    </option>
                  ))}
                </select>
                <span className="auditor-field-helper">Choose the active engagement before opening PBC tools.</span>
              </div>

              <div className="auditor-startup-field-card">
                <label htmlFor="audit-finalisation-date">Date of Audit Finalisation</label>
                <input
                  id="audit-finalisation-date"
                  type="date"
                  value={auditFinalisationDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    setAuditFinalisationDate(value);
                    if (activeAuditorClientId) {
                      setAuditFinalisationDatesByClient((current) => ({
                        ...current,
                        [activeAuditorClientId]: value,
                      }));
                    }
                  }}
                />
                <span className="auditor-field-helper">Fallback only. The client requirement due date is used first for PBC due-date calculations.</span>
              </div>
            </div>
            <div className="auditor-startup-footer">
              <p className="muted auditor-startup-note">
                PBC item due dates are now calculated from the client requirement due date first, with audit finalisation as the fallback.
              </p>

              <div className="actions auditor-startup-actions">
                <button
                  type="button"
                  className="major-action-button major-action-button-primary"
                  onClick={() => void handleContinueToPbcWorkspace()}
                  disabled={!activeAuditorClientId}
                >
                  Continue to PBC Workspace
                </button>
                <button
                  type="button"
                  className="secondary major-action-button major-action-button-secondary"
                  onClick={() => openTrialBalance('auditor-client-select')}
                >
                  View Uploaded Trial Balance
                </button>
              </div>
            </div>
          </section>

          <div className="auditor-followup-layout">
            <section className="access-request-card access-request-card-auditor">
              <div className="access-request-copy">
                <span className="eyebrow">Client provisioning</span>
                <h2>Issue client upload access</h2>
                <p>Create a controlled access request for a client contact who needs to upload evidence and respond to PBC items.</p>
                <div className="access-request-tags" aria-label="Client access highlights">
                  <span>Client upload access</span>
                  <span>Auditor issued</span>
                  <span>Engagement scoped</span>
                </div>
                <div className="access-request-steps" aria-label="Client access process">
                  <div>
                    <strong>01</strong>
                    <span>Enter client contact</span>
                  </div>
                  <div>
                    <strong>02</strong>
                    <span>Confirm client entity</span>
                  </div>
                  <div>
                    <strong>03</strong>
                    <span>Provision upload credentials</span>
                  </div>
                </div>
              </div>

              <form className="access-request-form" onSubmit={handleAccessRequest}>
                <div className="access-form-heading">
                  <span>Access Request</span>
                  <strong>Client upload access</strong>
                </div>
                <div className="access-request-grid">
                  <div>
                    <label htmlFor="access-name">Client contact name</label>
                    <input
                      id="access-name"
                      placeholder="Name as per engagement records"
                      value={accessName}
                      onChange={(event) => setAccessName(event.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="access-email">Client work email</label>
                    <input
                      id="access-email"
                      type="email"
                      placeholder="name@client.com"
                      value={accessEmail}
                      onChange={(event) => setAccessEmail(event.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="access-company">Client entity / organization</label>
                    <input
                      id="access-company"
                      placeholder="Company or client entity"
                      value={accessCompany}
                      onChange={(event) => setAccessCompany(event.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label>Access type</label>
                    <div className="access-static-field">Client upload access</div>
                  </div>
                </div>

                <label htmlFor="access-notes">Provisioning notes</label>
                <textarea
                  id="access-notes"
                  rows={3}
                  value={accessNotes}
                  onChange={(event) => setAccessNotes(event.target.value)}
                  placeholder="Mention engagement, deadline, or any upload scope restriction."
                />

                <div className="access-request-actions">
                  <button type="submit">Issue Access Request</button>
                </div>
                {accessRequestNotice ? <p className="access-request-notice">{accessRequestNotice}</p> : null}
              </form>
            </section>

            <aside className="card auditor-notifications-card">
              <div className="section-heading">
                <div>
                  <h2>Notifications</h2>
                  <p className="muted">Latest client upload activity and follow-up signals.</p>
                </div>
              </div>
              {renderNotificationList()}
            </aside>
          </div>
        </div>

        {renderBackControls('bottom')}
      </main>
    );
  }

  if (session.user.role === 'auditor' && currentPage === 'auditor-pbc') {
    const selectedClient = clients.find((client) => client.id === activeAuditorClientId);

    return (
      <main className="page brand-shell">
        {renderBrandHeader()}
        {renderBackControls('top')}
        <section className="hero-banner compact">
          <h1>PBC workspace</h1>
          <p>
            {selectedClient
              ? `Managing PBC for ${selectedClient.name}`
              : 'Upload detailed PBC files and track completion status.'}
          </p>
        </section>

        <div className="page-inline-back-controls page-inline-back-controls-spaced">
          <button type="button" className="secondary page-inline-back-button" onClick={handlePbcWorkspaceBack}>
            Back to Previous Page
          </button>
        </div>

        <section className="metric-grid workspace-metrics" aria-label="PBC workspace summary">
          <MetricCard label="PBC lists" value={visiblePbcLists.length} detail="For selected client" tone="info" />
          <MetricCard label="Total items" value={pbcStatusSummary.total} detail={`${pbcStatusSummary.completionRate}% complete`} />
          <MetricCard label="In progress" value={pbcStatusSummary.inProgress} detail={`${pbcStatusSummary.pending} pending`} tone="warning" />
          <MetricCard label="Overdue" value={pbcStatusSummary.overdue} detail={`${pbcStatusSummary.dueSoon} due within 7 days`} tone={pbcStatusSummary.overdue > 0 ? 'danger' : 'success'} />
        </section>

        <section className="card pbc-management-card">
          <div className="pbc-management-header">
            <div className="pbc-management-title">
              <span className="client-list-eyebrow">PBC control center</span>
              <h2>Detailed PBC Management</h2>
              <p className="muted">Upload PBC files and review dashboard status before opening the editor.</p>
            </div>
            <div className="pbc-management-header-actions">
              {selectedPbcDueDateBase ? (
                <span className="audit-date-badge">
                  {selectedPbcDueDateBaseLabel}: <strong>{formatDateLabel(selectedPbcDueDateBase)}</strong>
                </span>
              ) : null}
              <button type="button" className="secondary pbc-management-header-button" onClick={() => setCurrentPage('auditor-client-select')}>
                Change Client
              </button>
              <button type="button" className="secondary pbc-management-header-button" onClick={() => openTrialBalance('auditor-pbc')}>
                View Trial Balance
              </button>
            </div>
          </div>

          <form className="pbc-management-form" onSubmit={handlePbcUpload}>
            <div className="pbc-management-fields">
              <div className="pbc-management-field">
                <label htmlFor="pbc-client">Client</label>
                <input id="pbc-client" value={selectedClient ? `${selectedClient.name} (${formatEntityType(selectedClient.entityType)})` : ''} readOnly />
              </div>

              <div className="pbc-management-field">
                <label htmlFor="pbc-file">PBC Excel File</label>
                <input
                  id="pbc-file"
                  className="pbc-management-file-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => setPbcFile(e.target.files?.[0] ?? null)}
                  required
                />
              </div>
            </div>

            <div className="pbc-management-actions" aria-label="PBC management actions">
              <button type="submit" className="pbc-management-action pbc-management-action-primary" disabled={!activeAuditorClientId}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 4 6.8 9.2l1.4 1.4L11 7.8V16h2V7.8l2.8 2.8 1.4-1.4L12 4Zm-6 14v2h12v-2H6Z" fill="currentColor" />
                </svg>
                <span>Upload PBC List</span>
              </button>
              <button
                type="button"
                className="pbc-management-action pbc-management-action-secondary"
                onClick={() => void handleDownloadPbcTemplate()}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M11 4h2v8.2l2.8-2.8 1.4 1.4L12 16l-5.2-5.2 1.4-1.4 2.8 2.8V4Zm-5 14h12v2H6v-2Z" fill="currentColor" />
                </svg>
                <span>Download Blank Template</span>
              </button>
              <button
                type="button"
                className="pbc-management-action pbc-management-action-tertiary"
                onClick={() => void handleGenerateAutoPbc()}
                disabled={!activeAuditorClientId}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m12 2 1.4 4.6L18 8l-4.6 1.4L12 14 10.6 9.4 6 8l4.6-1.4L12 2Zm6 10 .9 3.1L22 16l-3.1.9L18 20l-.9-3.1L14 16l3.1-.9L18 12ZM6 13l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z" fill="currentColor" />
                </svg>
                <span>Generate Auto PBC</span>
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button
                type="button"
                className="secondary"
                onClick={() => openTrialBalance('auditor-pbc')}
              >
                View Trial Balance
              </button>
            </div>

            {visiblePbcLists.length > 0 ? (
              <div className="pbc-status-grid">
                {visiblePbcLists.map((item) => {
                  const counts = getStatusCountsForList(item.id);

                  return (
                    <div key={item.id} className="pbc-status-card">
                      <h3>{item.originalName}</h3>
                      {item.source === 'auto-generated' ? (
                        <div className="pbc-list-badge-row">
                          <span className={`pbc-visibility-badge ${item.approvedForClient ? 'approved' : 'draft'}`}>
                            {item.approvedForClient ? 'Approved for client' : 'Auditor draft'}
                          </span>
                        </div>
                      ) : null}
                      <p className="pbc-card-meta">{counts.total} item{counts.total !== 1 ? 's' : ''} | Uploaded {formatDateLabel(item.uploadedAt)}</p>
                      <CompletionBar completed={counts.completed} total={counts.total} />
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

            {selectedPbcList?.source === 'auto-generated' ? (
              <div className={`auto-pbc-approval-panel ${selectedPbcList.approvedForClient ? 'approved' : 'draft'}`}>
                <div>
                  <span className="auto-pbc-approval-eyebrow">Client visibility</span>
                  <h3>{selectedPbcList.approvedForClient ? 'Auto PBC is visible to the client' : 'Auto PBC is waiting for auditor approval'}</h3>
                  <p>
                    {selectedPbcList.approvedForClient
                      ? `Approved ${selectedPbcList.approvedAt ? formatDateLabel(selectedPbcList.approvedAt) : 'for client access'}.`
                      : 'Review and adjust the generated list, then approve it when the client should start uploading support.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleApprovePbcList(selectedPbcList.id)}
                  disabled={selectedPbcList.approvedForClient}
                >
                  {selectedPbcList.approvedForClient ? 'Approved' : 'Approve for Client'}
                </button>
              </div>
            ) : null}
          </section>

          <section className="card priority-panel-card">
            <PriorityBreakdownPanel
              items={visiblePbcItems}
            />
          </section>
        </div>

        {successMessage ? <p className="success">{successMessage}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {renderBackControls('bottom')}
      </main>
    );
  }

  // ── Client: browse items for a specific PBC list ──────────────────────────
  if (currentPage === 'client-pbc-items' && activePbcListForClient) {
    return (
      <main className="page brand-shell">
        {renderBrandHeader()}
        {renderBackControls('top')}
        <section className="hero-banner compact">
          <h1>{activePbcListForClient.originalName}</h1>
          <p>Review items and upload supporting documents for each request.</p>
        </section>

        <section className="card client-pbc-items-card">
          <div className="client-pbc-items-heading">
            <div>
              <span className="client-list-eyebrow">Document requests</span>
              <h2>PBC Items</h2>
              <p className="muted">Click "Upload Files" on any item to attach supporting documents.</p>
            </div>
            <button type="button" className="secondary client-pbc-back-button" onClick={() => setCurrentPage('portal')}>Back to Portal</button>
          </div>

          <div className="client-pbc-table-wrap">
            <table className="table client-pbc-items-table">
              <colgroup>
                <col className="client-pbc-col-request" />
                <col className="client-pbc-col-description" />
                <col className="client-pbc-col-priority" />
                <col className="client-pbc-col-risk" />
                <col className="client-pbc-col-caption" />
                <col className="client-pbc-col-date" />
                <col className="client-pbc-col-date" />
                <col className="client-pbc-col-status" />
                <col className="client-pbc-col-review" />
                <col className="client-pbc-col-remarks" />
                <col className="client-pbc-col-files" />
              </colgroup>
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Description</th>
                  <th>Priority</th>
                  <th>Risk / Assertion</th>
                  <th>Financial Caption</th>
                  <th>Requested Date</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Document Review</th>
                  <th>Remarks</th>
                  <th>Files</th>
                </tr>
              </thead>
              <tbody>
                {clientItemRows.length === 0 ? (
                  <tr>
                    <td colSpan={11}>
                      <div className="table-empty-state">
                        <strong>No items found</strong>
                        <span>Your auditor-approved PBC items will appear here once available.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  clientItemRows.map((item) => (
                    <tr key={item.id}>
                      <td><span className="table-id-pill">{item.requestId}</span></td>
                      <td className="client-pbc-description-cell">{item.description}</td>
                      <td><span className="client-pbc-priority">{item.priority || '-'}</span></td>
                      <td className="client-pbc-text-cell">{item.riskAssertion || '-'}</td>
                      <td className="client-pbc-text-cell">{item.owner}</td>
                      <td className="table-date-cell">{formatDateLabel(item.requestedDate)}</td>
                      <td className="table-date-cell table-date-cell-due">{formatDateLabel(item.dueDate)}</td>
                      <td>
                        <span className={`status-badge status-${item.status.toLowerCase().replace(/\s+/g, '-')}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="client-pbc-review-cell">{getDocumentReviewOutcomeLabel(item.documentReviewStatus)}</td>
                      <td className="client-pbc-remarks-cell" title={item.remarks || '-'}>
                        {item.remarks || '-'}
                      </td>
                      <td>
                        <button type="button" className="table-action-button client-pbc-upload-files-button" onClick={() => void openItemDetail(item)}>Upload Files</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {successMessage ? <p className="success">{successMessage}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {renderBackControls('bottom')}
      </main>
    );
  }

  // ── Item detail: view / upload files for a single PBC item ────────────────
  if (currentPage === 'pbc-item-detail' && activePbcItem) {
    return (
      <main className="page brand-shell">
        {renderBrandHeader()}
        {renderBackControls('top')}
        <section className="hero-banner compact">
          <h1>Item: {activePbcItem.requestId}</h1>
          <p>{activePbcItem.description}</p>
        </section>

        <section className="card item-detail-meta">
          <h2>Item Details</h2>
          <div className="item-meta-grid">
            <div className="item-meta-row"><span className="item-meta-label">Owner</span><span>{activePbcItem.owner || '-'}</span></div>
            <div className="item-meta-row"><span className="item-meta-label">Priority</span><span>{activePbcItem.priority || '-'}</span></div>
            <div className="item-meta-row"><span className="item-meta-label">Risk / Assertion</span><span>{activePbcItem.riskAssertion || '-'}</span></div>
            <div className="item-meta-row"><span className="item-meta-label">Requested Date</span><span>{formatDateLabel(activePbcItem.requestedDate)}</span></div>
            <div className="item-meta-row"><span className="item-meta-label">Due Date</span><span>{formatDateLabel(activePbcItem.dueDate)}</span></div>
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
            <div className="item-meta-row"><span className="item-meta-label">Remarks</span><span>{activePbcItem.remarks || '-'}</span></div>
          </div>
        </section>

        {session.user.role === 'client' ? (
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
        ) : null}

        <section className="card">
          <h2>{session.user.role === 'auditor' ? 'Client Uploaded Documents' : 'Uploaded Documents'}</h2>
          {pbcItemFiles.length === 0 ? (
            <p className="muted">No files uploaded yet for this item.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Uploaded At</th>
                  <th>Review Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pbcItemFiles.map((file) => (
                  <tr key={file.id}>
                    <td>
                      <a className="file-link" href={resolveApiUrl(file.downloadUrl)} target="_blank" rel="noreferrer">
                        {file.originalName}
                      </a>
                    </td>
                    <td>{new Date(file.uploadedAt).toLocaleString()}</td>
                    <td>
                      {file.reviewStatus === 'accepted'
                        ? 'Accepted'
                        : file.reviewStatus === 'rejected'
                        ? 'Rejected'
                        : 'Pending Review'}
                    </td>
                    <td>
                      {session.user.role === 'auditor' ? (
                        <div className="inline">
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => void handleReviewItemFile(file.id, 'accepted')}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => void handleReviewItemFile(file.id, 'rejected')}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <button type="button" className="danger" onClick={() => void handleDeleteItemFile(file.id)}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {successMessage ? <p className="success">{successMessage}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {renderBackControls('bottom')}
      </main>
    );
  }

  // Trial Balance Viewer Page for Auditors
  if (session.user.role === 'auditor' && currentPage === 'trial-balance') {
    const trialBalanceSubmissions = submissions.filter((sub) => {
      const req = requirements.find((r) => r.id === sub.requirementId);
      return req && req.title.toLowerCase().includes('trial balance');
    });

    const submissionsByClient = trialBalanceSubmissions.reduce(
      (acc, sub) => {
        if (!acc[sub.clientId]) {
          acc[sub.clientId] = [];
        }
        acc[sub.clientId].push(sub);
        return acc;
      },
      {} as Record<string, Submission[]>,
    );

    const handleDownloadSubmission = async (submission: Submission) => {
      try {
        const response = await fetch(resolveApiUrl(`/api/uploads/download/${encodeURIComponent(submission.storedName)}`), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to download file');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = submission.originalName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not download trial balance file.');
      }
    };

    return (
      <main className="page brand-shell">
        {renderBrandHeader()}
        {renderBackControls('top')}
        <section className="hero-banner compact">
          <h1>Trial Balance Submissions</h1>
          <p>Review all trial balance uploads from clients.</p>
        </section>

        <div className="page-inline-back-controls page-inline-back-controls-spaced">
          <button type="button" className="secondary page-inline-back-button" onClick={handleTrialBalanceBack}>
            Back to Previous Page
          </button>
        </div>

        <div style={{ maxWidth: 1000, margin: '24px auto' }}>
          {Object.keys(submissionsByClient).length === 0 ? (
            <section className="card">
              <p className="muted">No trial balance submissions yet. Clients will upload their trial balance files here.</p>
            </section>
          ) : (
            Object.entries(submissionsByClient).map(([clientId, subs]) => {
              const client = clients.find((c) => c.id === clientId);
              return (
                <section key={clientId} className="card" style={{ marginBottom: 24 }}>
                  <h2>{client?.name || clientId}</h2>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>File Name</th>
                        <th>Uploaded By</th>
                        <th>Uploaded At</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subs
                        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
                        .map((sub) => {
                          const uploader = requirements.find((r) => r.id === sub.requirementId);
                          return (
                            <tr key={sub.id}>
                              <td>{sub.originalName}</td>
                              <td>{sub.uploadedByUserId}</td>
                              <td>{new Date(sub.uploadedAt).toLocaleString()}</td>
                              <td>
                                <button onClick={() => void handleDownloadSubmission(sub)}>Download</button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </section>
              );
            })
          )}
        </div>

        {error ? <p className="error">{error}</p> : null}
        {renderBackControls('bottom')}
      </main>
    );
  }

  if (currentPage === 'pbc-editor') {
    const editorPbcLists = visiblePbcLists;

    return (
      <main className="page pbc-editor-page">
        {renderBrandHeader()}
        {renderBackControls('top')}
        <div className="card">
          <div className="toolbar">
            <div>
              <h1>PBC Editor</h1>
              <p className="muted">Edit uploaded PBC list items and click Save Changes to preserve updates.</p>
              {selectedEditorDueDateBase ? (
                <p className="audit-date-badge" style={{ display: 'inline-flex', marginTop: 6 }}>
                  Due Date Base: <strong style={{ marginLeft: 4 }}>{formatDateLabel(selectedEditorDueDateBase)}</strong>
                </p>
              ) : null}
            </div>
            <button type="button" className="secondary" onClick={handlePbcEditorBack}>
              Back to Previous Page
            </button>
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
          {selectedPbcList?.source === 'auto-generated' ? (
            <div className={`auto-pbc-approval-panel auto-pbc-approval-panel-editor ${selectedPbcList.approvedForClient ? 'approved' : 'draft'}`}>
              <div>
                <span className="auto-pbc-approval-eyebrow">Client visibility</span>
                <h3>{selectedPbcList.approvedForClient ? 'Approved for client access' : 'Client cannot see this draft yet'}</h3>
                <p>
                  {selectedPbcList.approvedForClient
                    ? 'The client can now open this PBC list and upload documents against each item.'
                    : 'Make your manual adjustments here, save the list, then approve it when it is ready for the client.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleApprovePbcList(selectedPbcList.id)}
                disabled={selectedPbcList.approvedForClient}
              >
                {selectedPbcList.approvedForClient ? 'Approved' : 'Approve for Client'}
              </button>
            </div>
          ) : null}
        </section>

        <section className="card">
          <h2>PBC Items</h2>
          <div className="actions pbc-editor-top-actions">
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
          <div className="pbc-editor-table-scroll" role="region" aria-label="Editable PBC items" tabIndex={0}>
            <table className="table pbc-editor-table">
              <colgroup>
                <col className="pbc-editor-col-request" />
                <col className="pbc-editor-col-description" />
                <col className="pbc-editor-col-priority" />
                <col className="pbc-editor-col-risk" />
                <col className="pbc-editor-col-caption" />
                <col className="pbc-editor-col-date" />
                <col className="pbc-editor-col-date" />
                <col className="pbc-editor-col-activity" />
                <col className="pbc-editor-col-pending" />
                <col className="pbc-editor-col-status" />
                <col className="pbc-editor-col-review" />
                <col className="pbc-editor-col-remarks" />
                <col className="pbc-editor-col-action" />
              </colgroup>
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Description</th>
                <th>Priority</th>
                <th>Risk / Assertion</th>
                <th>Financial caption</th>
                <th>Requested Date</th>
                <th>Due Date</th>
                <th>Uploaded/ Completed Date</th>
                <th>Pending Days</th>
                <th>Status</th>
                <th>Document Review</th>
                <th>Remarks</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pbcEditorRows.length === 0 ? (
                <tr>
                  <td colSpan={13}>No PBC items found for this list.</td>
                </tr>
              ) : (
                pbcEditorRows.map((row, index) => (
                  <tr key={row.id}>
                    <td>
                      <input value={row.requestId} onChange={(e) => updatePbcRow(index, 'requestId', e.target.value)} />
                    </td>
                    <td>
                      <input value={row.description} onChange={(e) => updatePbcRow(index, 'description', e.target.value)} />
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
                    <td className="pbc-editor-activity-cell">
                      {normalizeDateForInput(row.activityDate)
                        ? new Date(`${normalizeDateForInput(row.activityDate)}T00:00:00`).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="pbc-editor-pending-cell">
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
                    <td className="pbc-editor-review-cell">{getDocumentReviewOutcomeLabel(row.documentReviewStatus)}</td>
                    <td>
                      <input value={row.remarks} onChange={(e) => updatePbcRow(index, 'remarks', e.target.value)} />
                    </td>
                    <td className="pbc-editor-action-cell">
                      <button type="button" className="secondary pbc-editor-file-button" onClick={() => void openItemDetail(row)}>
                        {session.user.role === 'auditor' ? 'View/Download' : 'Files'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
              </tbody>
            </table>
          </div>
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

          {renderNotificationList()}
        </section>

        {successMessage ? <p className="success">{successMessage}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {renderBackControls('bottom')}
      </main>
    );
  }

  return (
    <main className="page brand-shell">
      {renderBrandHeader()}
      {renderBackControls('top')}
      <section className="hero-banner compact">
        <h1>AI-powered solutions for audit professionals</h1>
        <p>Track requirements, manage PBC lists, and monitor submission status.</p>
      </section>

      {session.user.role === 'client' ? (
        <a
          className="technical-updates-bar"
          href={TECHNICAL_UPDATES_LINK}
          target="_blank"
          rel="noreferrer"
          title="Open full technical updates"
        >
          <span className="technical-updates-label">Recent Technical Updates</span>
          <div className="technical-updates-track-wrap" aria-label="Rolling technical updates">
            <div className="technical-updates-track">
              {[...RECENT_TECHNICAL_UPDATES, ...RECENT_TECHNICAL_UPDATES].map((update, index) => (
                <span key={`${update}-${index}`} className="technical-updates-item">
                  {update}
                </span>
              ))}
            </div>
          </div>
          <span className="technical-updates-open">Open</span>
        </a>
      ) : null}

      <section className="workspace-intro">
        <div>
          <span className="eyebrow">Signed in workspace</span>
          <h1>Audit Client Portal</h1>
          <p className="muted">
            Logged in as <strong>{session.user.email}</strong> ({session.user.role})
          </p>
        </div>
        <span className="role-pill">{session.user.role === 'auditor' ? 'Auditor access' : 'Client access'}</span>
      </section>

      <section className="metric-grid workspace-metrics" aria-label="Portal summary">
        <MetricCard label="Requirements" value={requirementSummary.total} detail={`${requirementSummary.open} open`} tone="info" />
        <MetricCard label="Submitted" value={requirementSummary.submitted} detail="Requirement uploads" tone="success" />
        <MetricCard label="PBC items" value={pbcStatusSummary.total} detail={`${pbcStatusSummary.completionRate}% complete`} />
        <MetricCard label="Overdue" value={requirementSummary.overdue + pbcStatusSummary.overdue} detail="Needs attention" tone={requirementSummary.overdue + pbcStatusSummary.overdue > 0 ? 'danger' : 'success'} />
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Upload Client Data</h2>
            <p className="muted">Submit files against assigned requirements and keep the auditor review queue current.</p>
          </div>
        </div>
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

          <button type="submit" className="client-upload-button">
            <svg className="client-upload-button-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 4 6.8 9.2l1.4 1.4L11 7.8V16h2V7.8l2.8 2.8 1.4-1.4L12 4Zm-6 14v2h12v-2H6Z" fill="currentColor" />
            </svg>
            <span>Upload</span>
          </button>
        </form>

        <div className="client-trial-balance-panel">
          <div>
            <span className="eyebrow">Trial balance controls</span>
            {clientTrialBalanceSubmissions[0] ? (
              <>
                <h3>{clientTrialBalanceSubmissions[0].originalName}</h3>
                <p className="muted">Uploaded {new Date(clientTrialBalanceSubmissions[0].uploadedAt).toLocaleString()}</p>
              </>
            ) : (
              <>
                <h3>No trial balance uploaded yet</h3>
                <p className="muted">The delete action will become available after a trial balance file is uploaded.</p>
              </>
            )}
          </div>
          <button
            type="button"
            className="danger client-trial-balance-delete"
            disabled={!clientTrialBalanceSubmissions[0]}
            onClick={() => {
              const latestTrialBalance = clientTrialBalanceSubmissions[0];
              if (latestTrialBalance) {
                void handleDeleteTrialBalanceUpload(latestTrialBalance);
              }
            }}
          >
            Delete Trial Balance
          </button>
        </div>
      </section>

      <section className="card client-list-card">
        <div className="client-list-heading">
          <div>
            <span className="client-list-eyebrow">PBC workspace</span>
            <h2>Detailed PBC Lists</h2>
            <p className="muted">Reference the latest PBC list from your auditor before uploading documents.</p>
          </div>
          <span className="client-list-count">{visiblePbcLists.length} active</span>
        </div>

        {visiblePbcLists.length > 0 ? (
          <div className="pbc-status-grid">
            {visiblePbcLists.map((item) => {
              const counts = getStatusCountsForList(item.id);

              return (
                <div key={item.id} className="pbc-status-card">
                  <h3>{item.originalName}</h3>
                  <p className="pbc-card-meta">{counts.total} item{counts.total !== 1 ? 's' : ''} | Uploaded {formatDateLabel(item.uploadedAt)}</p>
                  <CompletionBar completed={counts.completed} total={counts.total} />
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

        <table className="table client-data-table">
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
                <td colSpan={4}>
                  <div className="table-empty-state">
                    <strong>No PBC list uploaded yet</strong>
                    <span>Your auditor-approved PBC lists will appear here once available.</span>
                  </div>
                </td>
              </tr>
            ) : (
              visiblePbcLists.map((item) => (
                <tr key={item.id}>
                  <td>
                    <a className="file-link" href={resolveApiUrl(item.downloadUrl)} target="_blank" rel="noreferrer">
                      {item.originalName}
                    </a>
                  </td>
                  <td><span className="table-id-pill">{item.clientId}</span></td>
                  <td className="table-date-cell">{formatDateLabel(item.uploadedAt)}</td>
                  <td>
                    <button type="button" className="table-action-button" onClick={() => void openClientPbcItems(item)}>View Items</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="card client-list-card">
        <div className="client-list-heading">
          <div>
            <span className="client-list-eyebrow">Client requests</span>
            <h2>Requirement List</h2>
            <p className="muted">Track current requests, due dates, and upload status from one view.</p>
          </div>
          <span className="client-list-count">{visibleRequirements.length} request{visibleRequirements.length === 1 ? '' : 's'}</span>
        </div>
        <table className="table client-data-table">
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
                <td className="table-date-cell">{formatDateLabel(requirement.dueDate)}</td>
                <td><RequirementStatusPill status={requirement.status} /></td>
                <td><span className="table-id-pill">{requirement.clientId}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {successMessage ? <p className="success">{successMessage}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {renderBackControls('bottom')}
    </main>
  );
}

export default App;
