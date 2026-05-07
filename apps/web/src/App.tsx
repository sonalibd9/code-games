import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  approvePbcList,
  deletePbcList,
  deletePbcItemFile,
  downloadPbcTemplate,
  downloadAllPbcItemFilesZip,
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
  updatePbcItemRemarks,
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

type PageState = 'portal' | 'auditor-client-select' | 'auditor-pbc' | 'trial-balance' | 'pbc-editor' | 'client-pbc-items' | 'pbc-item-detail' | 'ai-document-scanner';

interface DocumentInsights {
  clientName: string;
  bankName: string;
  accountNumber: string;
  amount: string;
  currency: string;
  validUntil: string;
}

interface TesseractRecognizer {
  recognize: (image: Blob | string, language: string) => Promise<{ data: { text: string } }>;
}

declare global {
  interface Window {
    Tesseract?: TesseractRecognizer;
  }
}

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

function getPbcDaysLabel(item: PbcItem): { className: string; label: string } {
  const activityReference = normalizeDateForInput(item.activityDate);
  const days = calcPendingDays(normalizeDateForInput(item.dueDate), activityReference || undefined);

  if (days === null) {
    return { className: 'pending-days-na', label: '-' };
  }

  if (activityReference) {
    if (days < 0) {
      return { className: 'pending-days-overdue', label: `${Math.abs(days)}d late` };
    }

    if (days === 0) {
      return { className: 'pending-days-done', label: 'On time' };
    }

    return { className: 'pending-days-ok', label: `${days}d early` };
  }

  if (days < 0) {
    return { className: 'pending-days-overdue', label: `${Math.abs(days)}d overdue` };
  }

  if (days === 0) {
    return { className: 'pending-days-today', label: 'Due today' };
  }

  return { className: days <= 7 ? 'pending-days-urgent' : 'pending-days-ok', label: `${days}d pending` };
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

  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/i.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  return '';
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

function extractDocumentInsights(text: string): DocumentInsights {
  const normalized = text.replace(/\r/g, '\n');
  const singleLine = normalized.replace(/\s+/g, ' ').trim();

  const clientNameMatch = normalized.match(/(?:client\s*name|customer\s*name|account\s*holder)\s*[:\-]\s*([^\n]+)/i);
  const bankNameMatch = normalized.match(/(?:bank\s*name|beneficiary\s*bank|bank)\s*[:\-]\s*([^\n]+)/i);
  const accountMatch = normalized.match(/(?:account\s*(?:number|no\.?)|a\/c\s*(?:number|no\.?))\s*[:\-]?\s*([A-Z0-9\-]{6,24})/i);
  const amountMatch = singleLine.match(/(?:amount|total|value)\s*[:\-]?\s*((?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{1,2})?)/i);
  const currencyMatch = singleLine.match(/\b(INR|USD|EUR|GBP|AED|AUD|CAD|SGD|JPY|CHF|CNY|NPR|PKR|LKR)\b/i);
  const validityMatch = normalized.match(/(?:valid\s*(?:until|till|through)|expiry\s*date|expiration\s*date)\s*[:\-]\s*([^\n]+)/i);

  return {
    clientName: clientNameMatch?.[1]?.trim() ?? '',
    bankName: bankNameMatch?.[1]?.trim() ?? '',
    accountNumber: accountMatch?.[1]?.trim() ?? '',
    amount: amountMatch?.[1]?.trim() ?? '',
    currency: currencyMatch?.[1]?.toUpperCase() ?? '',
    validUntil: validityMatch?.[1]?.trim() ?? '',
  };
}

async function loadTesseractRecognizer(): Promise<TesseractRecognizer> {
  if (typeof window === 'undefined') {
    throw new Error('OCR is only available in the browser.');
  }

  if (window.Tesseract) {
    return window.Tesseract;
  }

  await new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById('tesseract-cdn');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Could not load OCR engine.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'tesseract-cdn';
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load OCR engine.'));
    document.head.appendChild(script);
  });

  if (!window.Tesseract) {
    throw new Error('OCR engine failed to initialize.');
  }

  return window.Tesseract;
}

function calculateDueDate(requestedDate: string): string {
  if (!requestedDate) return '';

  const date = new Date(`${requestedDate}T00:00:00`);
  if (isNaN(date.getTime())) return '';

  date.setMonth(date.getMonth() + 3);

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

type SupportChatActionId =
  | 'ask-follow-up'
  | 'clear-chat'
  | 'open-audit-desk'
  | 'open-client-pbc-items'
  | 'open-document-scanner'
  | 'open-faq'
  | 'open-first-overdue'
  | 'open-first-pending-review'
  | 'open-first-rejected'
  | 'open-latest-notification'
  | 'open-notifications'
  | 'open-pbc-workspace'
  | 'open-requirements'
  | 'open-trial-balance';

interface SupportChatAction {
  id: SupportChatActionId;
  label: string;
  prompt?: string;
  targetId?: string;
}

interface SupportChatMessage {
  id: string;
  role: SupportChatRole;
  content: string;
  createdAt: string;
  isTyping?: boolean;
  actions?: SupportChatAction[];
}

const SUPPORT_QUICK_PROMPTS = [
  { label: 'Status brief', prompt: 'What needs attention right now?' },
  { label: 'Upload help', prompt: 'How do I upload a PBC file?' },
  { label: 'Review docs', prompt: 'Where do I review client documents?' },
  { label: 'Due dates', prompt: 'Which items are overdue or due soon?' },
  { label: 'Credentials', prompt: 'What are the demo credentials?' },
];

const AURI_EMOJI = '🧭';

interface SupportChatContext {
  isSignedIn: boolean;
  role?: AuthUser['role'];
  currentPage: PageState;
  activeClientName: string;
  notificationCount: number;
  latestNotificationSummary: string;
  pbcListCount: number;
  totalPbcItems: number;
  completedPbcItems: number;
  openPbcItems: number;
  overduePbcItems: PbcItem[];
  dueSoonPbcItems: PbcItem[];
  pendingReviewItems: PbcItem[];
  rejectedItems: PbcItem[];
  openRequirements: Requirement[];
  overdueRequirements: Requirement[];
  clientTrialBalanceCount: number;
  selectedPbcListName?: string;
}

interface SupportChatReply {
  content: string;
  actions?: SupportChatAction[];
}

const SUPPORT_CHAT_STORAGE_KEY = 'auriSupportChatMessages';

function createSupportWelcomeMessage(): SupportChatMessage {
  return {
    id: 'support-welcome',
    role: 'assistant',
    content: `Hi, I am ${AURI_EMOJI} Auri. I can help with logins, uploads, PBC lists, document review, trial balance, notifications, and workspace status.`,
    createdAt: new Date().toISOString(),
    actions: [
      { id: 'ask-follow-up', label: 'Status brief', prompt: 'What needs attention right now?' },
      { id: 'ask-follow-up', label: 'Upload help', prompt: 'How do I upload a PBC file?' },
    ],
  };
}

function normalizeSupportChatActions(value: unknown): SupportChatAction[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const actions = value.reduce<SupportChatAction[]>((acc, action) => {
    if (!action || typeof action !== 'object') {
      return acc;
    }

    const candidate = action as Partial<SupportChatAction>;
    if (typeof candidate.id === 'string' && typeof candidate.label === 'string') {
      acc.push({
        id: candidate.id as SupportChatActionId,
        label: candidate.label,
        prompt: typeof candidate.prompt === 'string' ? candidate.prompt : undefined,
        targetId: typeof candidate.targetId === 'string' ? candidate.targetId : undefined,
      });
    }

    return acc;
  }, []);

  return actions.length > 0 ? actions.slice(0, 4) : undefined;
}

function loadSavedSupportChatMessages(): SupportChatMessage[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SUPPORT_CHAT_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.reduce<SupportChatMessage[]>((acc, item) => {
      if (!item || typeof item !== 'object') {
        return acc;
      }

      const candidate = item as Partial<SupportChatMessage>;
      if (
        typeof candidate.id === 'string' &&
        (candidate.role === 'assistant' || candidate.role === 'user') &&
        typeof candidate.content === 'string'
      ) {
        acc.push({
          id: candidate.id,
          role: candidate.role,
          content: candidate.content,
          createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
          actions: normalizeSupportChatActions(candidate.actions),
        });
      }

      return acc;
    }, []).slice(-40);
  } catch {
    return [];
  }
}

function getInitialSupportChatMessages(): SupportChatMessage[] {
  const savedMessages = loadSavedSupportChatMessages();
  return savedMessages.length > 0 ? savedMessages : [createSupportWelcomeMessage()];
}

function formatSupportChatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function itemShortLabel(item: PbcItem): string {
  return `${item.requestId}: ${item.description}`;
}

function getPbcItemIdentityKey(item: Pick<PbcItem, 'clientId' | 'pbcListId' | 'requestId' | 'description' | 'owner' | 'riskAssertion'>): string {
  return [item.clientId, item.pbcListId, item.requestId, item.description, item.owner, item.riskAssertion]
    .map((value) => (value ?? '').trim().toLowerCase())
    .join('|');
}

function findPbcItemByItemIdentity(item: PbcItem, candidates: PbcItem[]): PbcItem | undefined {
  const identityKey = getPbcItemIdentityKey(item);
  const identityMatches = candidates.filter((candidate) => getPbcItemIdentityKey(candidate) === identityKey);
  if (identityMatches.length === 1) {
    return identityMatches[0];
  }

  const idMatches = candidates.filter((candidate) => candidate.id === item.id);
  return idMatches.length === 1 ? idMatches[0] : undefined;
}

function buildDefaultSupportActions(context: SupportChatContext): SupportChatAction[] {
  if (!context.isSignedIn) {
    return [
      { id: 'ask-follow-up', label: 'Demo credentials', prompt: 'What are the demo credentials?' },
      { id: 'open-faq', label: 'Open FAQ' },
    ];
  }

  const actions: SupportChatAction[] = [
    { id: 'ask-follow-up', label: 'Status brief', prompt: 'What needs attention right now?' },
    { id: context.role === 'auditor' ? 'open-pbc-workspace' : 'open-client-pbc-items', label: 'Open PBC' },
  ];

  if (context.notificationCount > 0) {
    actions.push({ id: 'open-notifications', label: 'Notifications' });
  }

  actions.push({ id: 'open-faq', label: 'FAQ' });
  return actions.slice(0, 4);
}

function getSupportChatReply(prompt: string, context: SupportChatContext): SupportChatReply {
  const text = prompt.toLowerCase();
  const roleLabel = context.role === 'auditor' ? 'auditor' : 'client';

  if (includesAny(text, ['clear', 'reset chat', 'start over'])) {
    return {
      content: 'I can reset this chat and keep the portal exactly where it is.',
      actions: [{ id: 'clear-chat', label: 'Clear chat' }],
    };
  }

  if (includesAny(text, ['credential', 'login', 'password', 'sign in', 'signin'])) {
    return {
      content: 'Use the auditor or client demo dropdown on the login card. Each selection fills the matching email and password automatically. Auditor demo accounts open review and PBC management tools; client demo accounts open upload and item response tools.',
      actions: [
        { id: 'ask-follow-up', label: 'Upload help', prompt: 'How do I upload a PBC file?' },
        { id: 'open-faq', label: 'Open FAQ' },
      ],
    };
  }

  if (!context.isSignedIn) {
    return {
      content: 'Sign in first and I can use the live portal context. Before login, I can still help with demo credentials, access requests, FAQs, and where each workflow lives.',
      actions: buildDefaultSupportActions(context),
    };
  }

  if (includesAny(text, ['status', 'summary', 'attention', 'priority', 'what do i do', 'what needs', 'health', 'dashboard', 'brief'])) {
    const focus = context.pendingReviewItems[0]
      ? `Start with pending review item ${itemShortLabel(context.pendingReviewItems[0])}.`
      : context.rejectedItems[0]
        ? `Start with rejected item ${itemShortLabel(context.rejectedItems[0])}.`
        : context.overduePbcItems[0]
          ? `Start with overdue item ${itemShortLabel(context.overduePbcItems[0])}.`
          : context.overdueRequirements[0]
            ? `Start with overdue requirement ${context.overdueRequirements[0].title}.`
            : 'Nothing urgent is standing out from the current portal data.';

    const actions: SupportChatAction[] = [
      context.pendingReviewItems[0]
        ? { id: 'open-first-pending-review', label: 'Open pending review', targetId: context.pendingReviewItems[0].id }
        : context.rejectedItems[0]
          ? { id: 'open-first-rejected', label: 'Open rejected item', targetId: context.rejectedItems[0].id }
          : context.overduePbcItems[0]
            ? { id: 'open-first-overdue', label: 'Open overdue item', targetId: context.overduePbcItems[0].id }
            : context.overdueRequirements[0]
              ? { id: 'open-requirements', label: 'Open requirement', targetId: context.overdueRequirements[0].id }
            : { id: context.role === 'auditor' ? 'open-pbc-workspace' : 'open-client-pbc-items', label: 'Open PBC' },
    ];

    if (context.role === 'auditor') {
      actions.push({ id: 'open-audit-desk', label: 'Audit desk' });
    }
    if (context.notificationCount > 0) {
      actions.push({ id: 'open-notifications', label: 'Notifications' });
    }

    return {
      content: `You are in the ${roleLabel} workspace for ${context.activeClientName}. I see ${pluralize(context.pbcListCount, 'PBC list')}, ${pluralize(context.totalPbcItems, 'PBC item')}, ${pluralize(context.openPbcItems, 'open item')}, ${pluralize(context.overduePbcItems.length, 'overdue item')}, ${pluralize(context.dueSoonPbcItems.length, 'item')} due soon, ${pluralize(context.pendingReviewItems.length, 'pending review')}, and ${pluralize(context.rejectedItems.length, 'rejected document')}. ${focus}`,
      actions: actions.slice(0, 4),
    };
  }

  if (includesAny(text, ['overdue', 'due soon', 'due date', 'deadline', 'late'])) {
    const nextDue = context.dueSoonPbcItems[0];
    const overdueItem = context.overduePbcItems[0];
    const overdueRequirement = context.overdueRequirements[0];
    const detail = overdueItem
      ? `Most urgent PBC item: ${itemShortLabel(overdueItem)}.`
      : overdueRequirement
        ? `Most urgent requirement: ${overdueRequirement.title}.`
        : nextDue
          ? `Next due PBC item: ${itemShortLabel(nextDue)}.`
          : 'No overdue or near-due item is visible in the current workspace.';

    return {
      content: `PBC due dates are tracked from each item's Due Date column. Current view: ${pluralize(context.overduePbcItems.length, 'overdue PBC item')}, ${pluralize(context.overdueRequirements.length, 'overdue requirement')}, and ${pluralize(context.dueSoonPbcItems.length, 'PBC item')} due within seven days. ${detail}`,
      actions: [
        overdueItem
          ? { id: 'open-first-overdue', label: 'Open overdue item', targetId: overdueItem.id }
          : overdueRequirement
            ? { id: 'open-requirements', label: 'Open requirement', targetId: overdueRequirement.id }
            : { id: context.role === 'auditor' ? 'open-pbc-workspace' : 'open-client-pbc-items', label: 'Open PBC' },
        { id: 'ask-follow-up', label: 'Status brief', prompt: 'What needs attention right now?' },
      ],
    };
  }

  if (includesAny(text, ['reject', 'rejected', 'correction', 'corrected', 'resubmit'])) {
    const firstRejected = context.rejectedItems[0];
    return {
      content: firstRejected
        ? `There are ${pluralize(context.rejectedItems.length, 'rejected document')} in the current workspace. Open ${firstRejected.requestId}, read the auditor remarks, upload the corrected file, and keep the item status current.`
        : 'I do not see any rejected documents in the current workspace. If a document is rejected later, open the item detail page, read the remarks, and upload the corrected support there.',
      actions: firstRejected
        ? [{ id: 'open-first-rejected', label: `Open ${firstRejected.requestId}`, targetId: firstRejected.id }]
        : buildDefaultSupportActions(context),
    };
  }

  if (includesAny(text, ['review', 'document', 'accept', 'approve document', 'pending review'])) {
    const firstPending = context.pendingReviewItems[0];
    return {
      content: firstPending
        ? `There are ${pluralize(context.pendingReviewItems.length, 'document')} waiting for review. Open ${firstPending.requestId}, download the uploaded file, then mark it accepted or rejected from the item detail page.`
        : 'Document review happens from a PBC item detail page. Auditors can download client files and mark each one accepted or rejected; clients can see rejection status and upload corrected files.',
      actions: firstPending
        ? [{ id: 'open-first-pending-review', label: `Open ${firstPending.requestId}`, targetId: firstPending.id }]
        : [{ id: context.role === 'auditor' ? 'open-pbc-workspace' : 'open-client-pbc-items', label: 'Open PBC' }],
    };
  }

  if (includesAny(text, ['auto', 'generate', 'trial balance', 'tb'])) {
    return {
      content: context.role === 'auditor'
        ? 'For auto PBC, open the selected client workspace, review the uploaded trial balance, generate the PBC list, then approve it for client access when the draft is ready. Clients cannot see auto-generated lists until approval.'
        : `Trial balance uploads sit with the client requirement workflow. I see ${pluralize(context.clientTrialBalanceCount, 'trial balance submission')} for this client workspace.`,
      actions: [
        { id: 'open-trial-balance', label: context.role === 'auditor' ? 'View trial balance' : 'Open portal' },
        { id: context.role === 'auditor' ? 'open-pbc-workspace' : 'open-requirements', label: context.role === 'auditor' ? 'Open PBC workspace' : 'Open requirements' },
      ],
    };
  }

  if (includesAny(text, ['upload', 'pbc', 'excel', 'csv', 'file', 'support'])) {
    return {
      content: context.role === 'auditor'
        ? 'Auditors can open a client workspace, upload a detailed PBC Excel or CSV, download a template, or generate an auto PBC list from trial balance data. Auto-generated lists must be approved before clients can respond.'
        : 'Clients can open an available PBC list, choose the requested item, and upload supporting documents from the item detail page. Use filenames that clearly match the request ID, account caption, or document description.',
      actions: [
        { id: context.role === 'auditor' ? 'open-pbc-workspace' : 'open-client-pbc-items', label: context.role === 'auditor' ? 'Open PBC workspace' : 'View PBC items' },
        { id: 'ask-follow-up', label: 'Filename tips', prompt: 'How should I name evidence files?' },
      ],
    };
  }

  if (includesAny(text, ['download', 'export', 'template'])) {
    return {
      content: 'Auditors can download the PBC template, export edited PBC items, or download all PBC items from the PBC workspace. Clients download or upload evidence from the relevant item or requirement area.',
      actions: [{ id: context.role === 'auditor' ? 'open-pbc-workspace' : 'open-client-pbc-items', label: 'Open PBC' }],
    };
  }

  if (includesAny(text, ['notification', 'bell', 'alert'])) {
    return {
      content: context.notificationCount > 0
        ? `There are ${pluralize(context.notificationCount, 'notification')} available. ${context.latestNotificationSummary || 'Open the bell menu to review the latest activity.'}`
        : 'I do not see active notifications for this workspace right now. New upload and review events appear in the bell menu.',
      actions: context.notificationCount > 0
        ? [
            { id: 'open-notifications', label: 'Open notifications' },
            context.role === 'auditor' ? { id: 'open-latest-notification', label: 'Latest upload' } : { id: 'open-requirements', label: 'Open portal' },
          ]
        : [{ id: 'open-requirements', label: 'Open portal' }],
    };
  }

  if (includesAny(text, ['filename', 'file name', 'quality', 'evidence', 'match'])) {
    return {
      content: 'Good evidence files should include the request ID or account caption, the period, and a short document name. For example: PBC-012_bank-confirmation_FY2025.pdf. Clear names reduce review time and avoid unnecessary rejection.',
      actions: [{ id: 'ask-follow-up', label: 'Review workflow', prompt: 'Where do I review client documents?' }],
    };
  }

  if (includesAny(text, ['scanner', 'scan', 'ocr', 'extract'])) {
    return {
      content: 'The AI document scanner helps read uploaded or local document images and extract key fields for review. It is useful for quick checks before formal audit review.',
      actions: [{ id: 'open-document-scanner', label: 'Open scanner' }],
    };
  }

  if (includesAny(text, ['faq', 'help', 'video', 'question'])) {
    return {
      content: 'The FAQ panel covers role access, upload locations, auditor-only tools, Auri help, and what to do when documents are rejected.',
      actions: [
        { id: 'open-faq', label: 'Open FAQ' },
        { id: 'ask-follow-up', label: 'Status brief', prompt: 'What needs attention right now?' },
      ],
    };
  }

  return {
    content: `I can help with the ${roleLabel} workspace for ${context.activeClientName}. Ask me about current status, overdue items, uploads, document review, trial balance, notifications, exports, scanner support, or demo credentials.`,
    actions: buildDefaultSupportActions(context),
  };
}

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

function getPbcDueDateColumnSummary(items: PbcItem[]): string {
  const dueDates = Array.from(
    new Set(items.map((item) => normalizeDateForInput(item.dueDate)).filter(Boolean)),
  ).sort();

  if (dueDates.length === 0) {
    return '';
  }

  if (dueDates.length === 1) {
    return formatDateLabel(dueDates[0]);
  }

  return `Multiple dates, earliest ${formatDateLabel(dueDates[0])}`;
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

function isTrialBalanceRequirement(requirement?: Requirement | null): boolean {
  return requirement?.title.toLowerCase().includes('trial balance') ?? false;
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
  const [activeInsightIndex, setActiveInsightIndex] = useState(0);
  const [isFaqOpen, setIsFaqOpen] = useState(false);
  const [activeFaqIndex, setActiveFaqIndex] = useState(0);
  const [isQuestionsOpen, setIsQuestionsOpen] = useState(false);
  const [isSupportChatOpen, setIsSupportChatOpen] = useState(false);
  const [scannerFile, setScannerFile] = useState<File | null>(null);
  const [scannerPreviewUrl, setScannerPreviewUrl] = useState('');
  const [scannerExtractedText, setScannerExtractedText] = useState('');
  const [scannerInsights, setScannerInsights] = useState<DocumentInsights | null>(null);
  const [scannerIsRunning, setScannerIsRunning] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [supportChatInput, setSupportChatInput] = useState('');
  const [isSupportChatExpanded, setIsSupportChatExpanded] = useState(false);
  const [supportChatCopiedMessageId, setSupportChatCopiedMessageId] = useState('');
  const typingTimerRef = useRef<number | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const supportChatScrollRef = useRef<HTMLDivElement | null>(null);
  const [supportChatMessages, setSupportChatMessages] = useState<SupportChatMessage[]>(getInitialSupportChatMessages);

  useEffect(() => {
    if (!isInsightsOpen) {
      return undefined;
    }

    const rotationTimer = window.setInterval(() => {
      setActiveInsightIndex((currentIndex) => (currentIndex + 1) % AUDITOR_INSIGHTS.length);
    }, 4200);

    return () => window.clearInterval(rotationTimer);
  }, [isInsightsOpen]);

  useEffect(() => {
    if (!isFaqOpen) {
      return undefined;
    }

    const rotationTimer = window.setInterval(() => {
      setActiveFaqIndex((currentIndex) => (currentIndex + 1) % FAQ_ITEMS.length);
    }, 4600);

    return () => window.clearInterval(rotationTimer);
  }, [isFaqOpen]);

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
  const hasLoadedNotificationSnapshotRef = useRef(false);

  function playNotificationTing() {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        return;
      }

      const audioContext = new AudioContextCtor();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = 1046;

      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.22);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.24);
      oscillator.onended = () => {
        void audioContext.close().catch(() => undefined);
      };
    } catch {
      // Ignore browser audio playback limitations.
    }
  }

  useEffect(() => {
    return () => {
      if (typingTimerRef.current !== null) {
        window.clearInterval(typingTimerRef.current);
      }
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || supportChatMessages.some((message) => message.isTyping)) {
      return;
    }

    try {
      const savedMessages = supportChatMessages.slice(-40).map(({ isTyping, ...message }) => message);
      window.localStorage.setItem(SUPPORT_CHAT_STORAGE_KEY, JSON.stringify(savedMessages));
    } catch {
      // Local storage can be disabled without affecting the chat itself.
    }
  }, [supportChatMessages]);

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

  const getClientListStats = (listId: string) => {
    const items = pbcAllItems.filter((item: PbcItem) => item.pbcListId === listId);
    const openItems = items.filter((item: PbcItem) => item.status !== 'Completed');
    const overdue = openItems.filter((item: PbcItem) => {
      const days = calcPendingDays(normalizeDateForInput(item.dueDate));
      return days !== null && days < 0;
    }).length;
    const dueSoon = openItems.filter((item: PbcItem) => {
      const days = calcPendingDays(normalizeDateForInput(item.dueDate));
      return days !== null && days >= 0 && days <= 7;
    }).length;
    const pendingReview = items.filter((item: PbcItem) => item.documentReviewStatus === 'Pending Review').length;
    const rejected = items.filter((item: PbcItem) => item.documentReviewStatus === 'Rejected').length;
    const highPriorityOpen = openItems.filter((item: PbcItem) => item.priority.toLowerCase().includes('high')).length;
    const completionRate = items.length > 0 ? Math.round((items.filter((item: PbcItem) => item.status === 'Completed').length / items.length) * 100) : 0;

    return {
      overdue,
      dueSoon,
      pendingReview,
      rejected,
      highPriorityOpen,
      completionRate,
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
        return isTrialBalanceRequirement(requirement);
      })
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }, [session, submissions, visibleRequirements]);

  const clientTrialBalanceSubmissionKeys = useMemo(() => {
    const keys = new Set<string>();

    clientTrialBalanceSubmissions.forEach((submission) => {
      keys.add(`id:${submission.requirementId}`);

      const requirement = visibleRequirements.find((item) => item.id === submission.requirementId);
      if (isTrialBalanceRequirement(requirement)) {
        keys.add(`fy:${getFinancialYearKey(requirement)}`);
      }
    });

    return keys;
  }, [clientTrialBalanceSubmissions, visibleRequirements]);

  const hasUploadedTrialBalanceForRequirement = (requirement: Requirement) =>
    clientTrialBalanceSubmissionKeys.has(`id:${requirement.id}`) ||
    clientTrialBalanceSubmissionKeys.has(`fy:${getFinancialYearKey(requirement)}`);

  const selectedAuditFinalisationDate = activeAuditorClientId
    ? (auditFinalisationDatesByClient[activeAuditorClientId] ?? auditFinalisationDate)
    : auditFinalisationDate;

  const getAuditFinalisationDateForClient = (clientId?: string) => {
    if (!clientId) {
      return normalizeDateForInput(selectedAuditFinalisationDate);
    }

    if (clientId === activeAuditorClientId) {
      return normalizeDateForInput(auditFinalisationDatesByClient[clientId] ?? auditFinalisationDate);
    }

    return normalizeDateForInput(auditFinalisationDatesByClient[clientId] ?? '');
  };

  const getAuditFinalisationDueDateForClient = (clientId?: string) => {
    const auditFinalisationBase = getAuditFinalisationDateForClient(clientId);
    return auditFinalisationBase ? calculateDueDate(auditFinalisationBase) : '';
  };

  const getClientVisibleRequirementDueDate = (requirement: Requirement) => {
    if (
      session?.user.role === 'client' &&
      isTrialBalanceRequirement(requirement) &&
      !hasUploadedTrialBalanceForRequirement(requirement)
    ) {
      return '';
    }

    if (isTrialBalanceRequirement(requirement)) {
      return getAuditFinalisationDueDateForClient(requirement.clientId);
    }

    return requirement.dueDate ?? '';
  };

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
      const days = calcPendingDays(getClientVisibleRequirementDueDate(requirement));
      return days !== null && days < 0;
    }).length;

    return {
      open,
      submitted,
      overdue,
      total: visibleRequirements.length,
    };
  }, [
    activeAuditorClientId,
    auditFinalisationDate,
    auditFinalisationDatesByClient,
    clientTrialBalanceSubmissionKeys,
    session,
    visibleRequirements,
  ]);

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

  const supportChatContext = useMemo<SupportChatContext>(() => {
    const openItems = visiblePbcItems.filter((item) => item.status !== 'Completed');
    const overduePbcItems = openItems.filter((item) => {
      const days = calcPendingDays(normalizeDateForInput(item.dueDate));
      return days !== null && days < 0;
    });
    const dueSoonPbcItems = openItems.filter((item) => {
      const days = calcPendingDays(normalizeDateForInput(item.dueDate));
      return days !== null && days >= 0 && days <= 7;
    });
    const pendingReviewItems = visiblePbcItems.filter((item) => item.documentReviewStatus === 'Pending Review');
    const rejectedItems = visiblePbcItems.filter((item) => item.documentReviewStatus === 'Rejected');
    const openRequirements = visibleRequirements.filter((requirement) => requirement.status === 'open');
    const overdueRequirements = openRequirements.filter((requirement) => {
      const days = calcPendingDays(getClientVisibleRequirementDueDate(requirement));
      return days !== null && days < 0;
    });
    const activeClientName = session?.user.role === 'auditor'
      ? clients.find((client) => client.id === activeAuditorClientId)?.name ?? (activeAuditorClientId || 'all clients')
      : 'your client workspace';
    const clientNotificationCount = overdueRequirements.length + overduePbcItems.length + dueSoonPbcItems.length + rejectedItems.length;

    return {
      isSignedIn: Boolean(session),
      role: session?.user.role,
      currentPage,
      activeClientName,
      notificationCount: session?.user.role === 'auditor' ? auditorNotifications.length : clientNotificationCount,
      latestNotificationSummary: session?.user.role === 'auditor'
        ? auditorNotifications[0]?.message ?? ''
        : rejectedItems[0]?.remarks || overduePbcItems[0]?.description || overdueRequirements[0]?.description || '',
      pbcListCount: visiblePbcLists.length,
      totalPbcItems: visiblePbcItems.length,
      completedPbcItems: pbcStatusSummary.completed,
      openPbcItems: openItems.length,
      overduePbcItems,
      dueSoonPbcItems,
      pendingReviewItems,
      rejectedItems,
      openRequirements,
      overdueRequirements,
      clientTrialBalanceCount: clientTrialBalanceSubmissions.length,
      selectedPbcListName: selectedPbcList?.originalName,
    };
  }, [
    activeAuditorClientId,
    auditFinalisationDate,
    auditFinalisationDatesByClient,
    auditorNotifications,
    clientTrialBalanceSubmissionKeys,
    clientTrialBalanceSubmissions.length,
    clients,
    currentPage,
    pbcStatusSummary.completed,
    selectedPbcList,
    session,
    visiblePbcItems,
    visiblePbcLists.length,
    visibleRequirements,
  ]);

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

  const selectedPbcDueDateColumnLabel = getPbcDueDateColumnSummary(visiblePbcItems);
  const selectedEditorDueDateColumnLabel = getPbcDueDateColumnSummary(pbcEditorRows);

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

  const getNotificationPbcItemDueDate = (notification: Notification) => {
    if (notification.target.page !== 'pbc-item-detail') {
      return '';
    }

    const itemDueDate = notification.itemDueDate
      || pbcAllItems.find((item) => item.id === notification.target.pbcItemId)?.dueDate
      || '';

    return normalizeDateForInput(itemDueDate);
  };

  const getNotificationSummary = (notification: Notification) => {
    const clientName = getClientLabel(notification.clientId);

    if (notification.target.page === 'trial-balance') {
      return `Uploaded trial balance for ${clientName}.`;
    }

    if (notification.target.page === 'pbc-item-detail') {
      const dueDate = getNotificationPbcItemDueDate(notification);
      const dueDateText = dueDate ? ` Due ${formatDateLabel(dueDate)}.` : '';
      return notification.itemRequestId
        ? `Uploaded supporting document for ${notification.itemRequestId}.${dueDateText}`
        : `Uploaded supporting document for review.${dueDateText}`;
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
    if (!scannerFile) {
      setScannerPreviewUrl('');
      return;
    }

    const objectUrl = URL.createObjectURL(scannerFile);
    setScannerPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [scannerFile]);

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

  async function refreshClientDashboardData(token: string) {
    const [reqs, pbcData, pbcItemsData, submissionList] = await Promise.all([
      fetchRequirements(token),
      fetchPbcLists(token),
      fetchPbcItems(token),
      fetchSubmissions(token),
    ]);

    setRequirements(reqs);
    setPbcLists(pbcData);
    setPbcAllItems(pbcItemsData);
    setSubmissions(submissionList);
    setSelectedRequirementId((current) => (current ? current : reqs[0]?.id ?? ''));

    if (pbcData.length > 0) {
      setSelectedPbcListId((current) => (current && pbcData.some((item) => item.id === current) ? current : pbcData[pbcData.length - 1].id));
    } else {
      setSelectedPbcListId('');
      setPbcEditorRows([]);
    }
  }

  useEffect(() => {
    if (!session || session.user.role !== 'auditor') {
      return;
    }

    hasLoadedNotificationSnapshotRef.current = false;

    const streamUrl = resolveApiUrl(`/api/notifications/stream?token=${encodeURIComponent(session.token)}`);
    const eventSource = new EventSource(streamUrl);

    const onSnapshot = (event: Event) => {
      const messageEvent = event as MessageEvent<string>;
      try {
        const payload = JSON.parse(messageEvent.data) as Notification[];
        setAuditorNotifications(payload);
        hasLoadedNotificationSnapshotRef.current = true;
      } catch {
        // Ignore malformed SSE payloads.
      }
    };

    const onNotification = (event: Event) => {
      const messageEvent = event as MessageEvent<string>;
      try {
        const payload = JSON.parse(messageEvent.data) as Notification;
        setAuditorNotifications((current) => [payload, ...current.filter((item) => item.id !== payload.id)]);
        if (hasLoadedNotificationSnapshotRef.current) {
          playNotificationTing();
        }
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

  useEffect(() => {
    if (!session || session.user.role !== 'client') {
      return;
    }

    const refreshIntervalMs = 10000;
    let disposed = false;

    const refresh = async () => {
      if (disposed) {
        return;
      }
      try {
        await refreshClientDashboardData(session.token);
      } catch {
        // Keep existing state on transient refresh errors.
      }
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    }, refreshIntervalMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };

    document.addEventListener('visibilitychange', onVisible);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session]);

  async function loadPbcEditorData(token: string, pbcListId: string) {
    const rows = await fetchPbcItems(token, pbcListId);
    const filled = rows.map((row) => {
      const normalizedDueDate = normalizeDateForInput(row.dueDate);
      const inferredPriority = inferPriorityFromRiskAssertion(row.riskAssertion);
      const finalPriority = row.priority || inferredPriority;
      return {
        ...row,
        priority: finalPriority,
        dueDate: normalizedDueDate,
      };
    });
    setPbcEditorRows(filled);
  }

  async function handleContinueToPbcWorkspace() {
    if (!session || !activeAuditorClientId) {
      return;
    }

    setError('');
    setPbcWorkspaceReturnPage('auditor-client-select');
    setCurrentPage('auditor-pbc');
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

      await loadPortalData(session.token, session.user.role);
      setSelectedPbcListId(uploaded.id);
      setPbcFile(null);
      setSuccessMessage(
        `Detailed PBC list uploaded successfully. Parsed ${uploaded.parsedItemCount ?? 0} rows. Due dates now use the Due Date column from the PBC list.`,
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

      await loadPortalData(session.token, session.user.role);
      setSelectedPbcListId(generated.id);
      await loadPbcEditorData(session.token, generated.id);
      setPbcEditorReturnPage('auditor-pbc');
      setCurrentPage('pbc-editor');

      const matchedCount = generated.matchedSubgroups?.length ?? 0;
      const unmatchedCount = generated.unmatchedSubgroups?.length ?? 0;
      setSuccessMessage(
        `Auto PBC generated from ${generated.trialBalanceFileName ?? 'the latest trial balance'} with ${generated.parsedItemCount ?? 0} item(s) across ${matchedCount} matched subgroup(s).${
          unmatchedCount > 0 ? ` ${unmatchedCount} subgroup(s) did not match the base PBC template.` : ''
        } Due dates can be reviewed and changed directly in the Due Date column. You can now adjust the list in PBC Editor and save changes. It remains hidden from the client until you approve it.`,
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

          return {
            ...row,
            riskAssertion: value,
            priority: nextPriority,
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

  async function handleDownloadAllPbcClientFiles() {
    if (!session || !selectedPbcListId) {
      return;
    }

    setError('');
    setSuccessMessage('');

    try {
      const fileBlob = await downloadAllPbcItemFilesZip(session.token, selectedPbcListId);
      const objectUrl = URL.createObjectURL(fileBlob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `pbc-client-files-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);

      setSuccessMessage('Downloaded all client-uploaded PBC files as a ZIP.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download client-uploaded PBC files.');
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

      const latestListItems = await fetchPbcItems(session.token, activePbcItem.pbcListId);
      const uploadTarget = findPbcItemByItemIdentity(activePbcItem, latestListItems);

      if (!uploadTarget) {
        throw new Error('PBC item not found. Please go back to the PBC list and reopen the item.');
      }

      setActivePbcItem(uploadTarget);
      setPbcEditorRows((current) =>
        current.map((item) => findPbcItemByItemIdentity(item, latestListItems) ?? item),
      );
      setClientItemRows((current) =>
        current.map((item) => findPbcItemByItemIdentity(item, latestListItems) ?? item),
      );

      await uploadPbcItemFile(session.token, uploadTarget.id, itemFileInput);
      const files = await fetchPbcItemFiles(session.token, uploadTarget.id);
      setPbcItemFiles(files);

      const [listItems, allItems] = await Promise.all([
        fetchPbcItems(session.token, uploadTarget.pbcListId),
        fetchPbcItems(session.token),
      ]);
      setPbcEditorRows((current) =>
        current.map((item) => findPbcItemByItemIdentity(item, listItems) ?? item),
      );
      setClientItemRows((current) =>
        current.map((item) => findPbcItemByItemIdentity(item, listItems) ?? item),
      );
      setPbcAllItems(allItems);
      const refreshedActive = listItems.find((item) => item.id === uploadTarget.id);
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
      const reviewComment = decision === 'rejected'
        ? window.prompt('Enter the reason for rejection. The client will be able to see this comment.', '')?.trim()
        : undefined;

      if (decision === 'rejected' && reviewComment === undefined) {
        return;
      }

      await reviewPbcItemFile(session.token, fileId, decision, reviewComment);

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

  function updateClientItemRemarkDraft(itemId: string, remarks: string) {
    setActivePbcItem((current) => (current?.id === itemId ? { ...current, remarks } : current));
    setClientItemRows((current) => current.map((item) => (item.id === itemId ? { ...item, remarks } : item)));
    setPbcAllItems((current) => current.map((item) => (item.id === itemId ? { ...item, remarks } : item)));
  }

  async function handleClientItemRemarksSave(itemId: string, remarks: string) {
    if (!session) {
      return;
    }

    setError('');

    try {
      const updatedItem = await updatePbcItemRemarks(session.token, itemId, remarks);
      setActivePbcItem((current) => (current?.id === updatedItem.id ? updatedItem : current));
      setClientItemRows((current) => current.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
      setPbcAllItems((current) => current.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
      setPbcEditorRows((current) => current.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update remarks.');
    }
  }

  function handleItemDetailBack() {
    setError('');
    setSuccessMessage('');
    setItemFileInput(null);

    if (session?.user.role === 'client' && activePbcListForClient) {
      setCurrentPage('client-pbc-items');
      return;
    }

    if (session?.user.role === 'auditor') {
      setCurrentPage('pbc-editor');
      return;
    }

    handleBackNavigation();
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

  function openAiDocumentScanner() {
    setError('');
    setSuccessMessage('');
    setIsAuditDeskOpen(false);
    setIsInsightsOpen(false);
    setIsFaqOpen(false);
    setIsQuestionsOpen(false);
    setIsSupportChatOpen(false);
    setIsNotificationMenuOpen(false);
    setCurrentPage('ai-document-scanner');
  }

  function handleScannerFileChange(file: File | null) {
    setScannerFile(file);
    setScannerExtractedText('');
    setScannerInsights(null);
    setScannerError('');
  }

  async function handleRunDocumentScan() {
    if (!scannerFile) {
      setScannerError('Please upload a document image first.');
      return;
    }

    setScannerIsRunning(true);
    setScannerError('');
    setScannerExtractedText('');
    setScannerInsights(null);

    try {
      const recognizer = await loadTesseractRecognizer();
      const result = await recognizer.recognize(scannerFile, 'eng');
      const extractedText = result.data.text ?? '';

      if (!extractedText.trim()) {
        setScannerError('No readable text found in this document. Try a clearer image.');
        return;
      }

      setScannerExtractedText(extractedText);
      setScannerInsights(extractDocumentInsights(extractedText));
    } catch (err) {
      setScannerError(err instanceof Error ? err.message : 'Could not scan this document.');
    } finally {
      setScannerIsRunning(false);
    }
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
      createdAt: new Date(timestamp).toISOString(),
    };
    const reply = getSupportChatReply(trimmed, supportChatContext);
    const assistantMessageId = `support-assistant-${timestamp}`;
    const assistantMessage: SupportChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      createdAt: new Date(timestamp + 1).toISOString(),
      isTyping: true,
      actions: reply.actions,
    };

    setSupportChatMessages((current) => [...current, userMessage, assistantMessage]);

    if (typingTimerRef.current !== null) {
      window.clearInterval(typingTimerRef.current);
    }

    const fullReply = reply.content;
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

  function resetSupportChat() {
    if (typingTimerRef.current !== null) {
      window.clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    setSupportChatCopiedMessageId('');
    setSupportChatMessages([createSupportWelcomeMessage()]);
  }

  async function copySupportChatMessage(message: SupportChatMessage) {
    if (!message.content.trim() || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(message.content);
      setSupportChatCopiedMessageId(message.id);
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        setSupportChatCopiedMessageId('');
        copiedTimerRef.current = null;
      }, 1600);
    } catch {
      // Clipboard permissions vary by browser and protocol.
    }
  }

  function closeSupportChatOverlays() {
    setIsSupportChatOpen(false);
    setIsAuditDeskOpen(false);
    setIsInsightsOpen(false);
    setIsFaqOpen(false);
    setIsQuestionsOpen(false);
    setIsNotificationMenuOpen(false);
  }

  function handleSupportChatAction(action: SupportChatAction) {
    if (action.prompt) {
      addSupportChatExchange(action.prompt);
      return;
    }

    if (action.id === 'clear-chat') {
      resetSupportChat();
      return;
    }

    setError('');
    setSuccessMessage('');

    if (action.id === 'open-faq') {
      setIsSupportChatOpen(false);
      setIsAuditDeskOpen(false);
      setIsInsightsOpen(false);
      setIsQuestionsOpen(false);
      setIsNotificationMenuOpen(false);
      setIsFaqOpen(true);
      return;
    }

    if (action.id === 'open-notifications') {
      setIsSupportChatOpen(false);
      setIsAuditDeskOpen(false);
      setIsInsightsOpen(false);
      setIsFaqOpen(false);
      setIsQuestionsOpen(false);
      setIsNotificationMenuOpen(true);
      return;
    }

    if (action.id === 'open-latest-notification') {
      const latestNotification = action.targetId
        ? auditorNotifications.find((notification) => notification.id === action.targetId)
        : auditorNotifications[0];
      if (latestNotification) {
        setIsSupportChatOpen(false);
        void handleNotificationNavigate(latestNotification);
      }
      return;
    }

    if (action.id === 'open-audit-desk') {
      if (session?.user.role !== 'auditor') {
        return;
      }

      setIsSupportChatOpen(false);
      setIsInsightsOpen(false);
      setIsFaqOpen(false);
      setIsQuestionsOpen(false);
      setIsNotificationMenuOpen(false);
      setIsAuditDeskOpen(true);
      return;
    }

    if (action.id === 'open-document-scanner') {
      openAiDocumentScanner();
      return;
    }

    if (action.id === 'open-trial-balance') {
      closeSupportChatOverlays();
      if (session?.user.role === 'auditor') {
        openTrialBalance(currentPage);
      } else {
        setCurrentPage('portal');
      }
      return;
    }

    if (action.id === 'open-pbc-workspace') {
      closeSupportChatOverlays();
      if (session?.user.role === 'auditor') {
        openPbcWorkspace(currentPage);
      } else {
        setCurrentPage('portal');
      }
      return;
    }

    if (action.id === 'open-client-pbc-items') {
      closeSupportChatOverlays();
      const targetList = selectedPbcList ?? visiblePbcLists[0];
      if (session?.user.role === 'client' && targetList) {
        void openClientPbcItems(targetList);
      } else if (session?.user.role === 'auditor') {
        openPbcWorkspace(currentPage);
      } else {
        setCurrentPage('portal');
      }
      return;
    }

    if (action.id === 'open-requirements') {
      closeSupportChatOverlays();
      if (action.targetId) {
        setSelectedRequirementId(action.targetId);
      }
      setCurrentPage('portal');
      return;
    }

    if (action.id === 'open-first-overdue' || action.id === 'open-first-pending-review' || action.id === 'open-first-rejected') {
      const sourceItems = action.id === 'open-first-overdue'
        ? supportChatContext.overduePbcItems
        : action.id === 'open-first-pending-review'
          ? supportChatContext.pendingReviewItems
          : supportChatContext.rejectedItems;
      const targetItem = action.targetId
        ? sourceItems.find((item) => item.id === action.targetId) ?? visiblePbcItems.find((item) => item.id === action.targetId)
        : sourceItems[0];

      closeSupportChatOverlays();
      if (targetItem) {
        void openItemDetail(targetItem);
      } else {
        setCurrentPage('portal');
      }
    }
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
        const dueDate = getNotificationPbcItemDueDate(notification);

        return {
          id: notification.id,
          title: notification.fileName,
          categoryLabel: category.label,
          summary: getNotificationSummary(notification),
          dateTime: notification.uploadedAt,
          primaryMeta: getClientLabel(notification.clientId),
          secondaryMeta: dueDate ? `Due ${formatDateLabel(dueDate)}` : notification.uploadedByEmail,
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
          secondaryMeta: `Due ${formatDateLabel(item.dueDate)}`,
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
      .map((requirement) => ({
        requirement,
        visibleDueDate: getClientVisibleRequirementDueDate(requirement),
        days: calcPendingDays(getClientVisibleRequirementDueDate(requirement)),
      }))
      .filter(({ days }) => days !== null && days < 0)
      .slice(0, 3)
      .forEach(({ requirement, visibleDueDate, days }) => {
        pushItem({
          id: `client-overdue-requirement-${requirement.id}`,
          title: requirement.title,
          categoryLabel: 'Overdue requirement',
          summary: `${Math.abs(days ?? 0)} day${Math.abs(days ?? 0) === 1 ? '' : 's'} overdue. ${requirement.description}`,
          dateTime: visibleDueDate || today.toISOString(),
          primaryMeta: 'Requirement upload',
          secondaryMeta: `Due ${formatDateLabel(visibleDueDate)}`,
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
      <aside className={`support-chat ${isSupportChatExpanded ? 'support-chat-expanded' : ''}`} role="dialog" aria-label="Auri support chatbot">
        <div className="support-chat-header">
          <div>
            <span className="support-chat-eyebrow">Support</span>
            <h3><span className="support-chat-avatar" aria-hidden="true">{AURI_EMOJI}</span>Auri</h3>
          </div>
          <div className="support-chat-header-actions">
            <button
              type="button"
              className="support-chat-header-button"
              onClick={resetSupportChat}
            >
              Clear
            </button>
            <button
              type="button"
              className="support-chat-header-button"
              onClick={() => setIsSupportChatExpanded((current) => !current)}
            >
              {isSupportChatExpanded ? 'Compact' : 'Expand'}
            </button>
            <button
              type="button"
              className="support-chat-close"
              aria-label="Close support chat"
              onClick={() => setIsSupportChatOpen(false)}
            >
              X
            </button>
          </div>
        </div>

        <div ref={supportChatScrollRef} className="support-chat-messages" aria-live="polite">
          {supportChatMessages.map((message) => (
            <div key={message.id} className={`support-chat-message support-chat-message-${message.role}`}>
              <div className="support-chat-message-content">
                {message.content}
                {message.isTyping ? <span aria-hidden="true">...</span> : null}
              </div>
              <div className="support-chat-message-meta">
                <span>{message.role === 'assistant' ? 'Auri' : 'You'} - {formatSupportChatTime(message.createdAt)}</span>
                {message.role === 'assistant' && !message.isTyping && message.content ? (
                  <button type="button" className="support-chat-message-copy" onClick={() => void copySupportChatMessage(message)}>
                    {supportChatCopiedMessageId === message.id ? 'Copied' : 'Copy'}
                  </button>
                ) : null}
              </div>
              {!message.isTyping && message.actions?.length ? (
                <div className="support-chat-actions">
                  {message.actions.map((action) => (
                    <button
                      key={`${message.id}-${action.label}`}
                      type="button"
                      onClick={() => handleSupportChatAction(action)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="support-chat-prompts" aria-label="Suggested support questions">
          {SUPPORT_QUICK_PROMPTS.map((item) => (
            <button
              key={item.prompt}
              type="button"
              onClick={() => addSupportChatExchange(item.prompt)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <form className="support-chat-form" onSubmit={handleSupportChatSubmit}>
          <label htmlFor="support-chat-input" className="sr-only">Ask support</label>
          <input
            id="support-chat-input"
            value={supportChatInput}
            onChange={(event) => setSupportChatInput(event.target.value)}
            placeholder="Ask about status, uploads, review..."
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
          <small>Ask about this workspace</small>
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
              <span>Due date <strong>{selectedPbcDueDateColumnLabel || '-'}</strong></span>
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

    const activeInsight = AUDITOR_INSIGHTS[activeInsightIndex % AUDITOR_INSIGHTS.length];

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

        <div className="insights-spotlight" key={activeInsight.title}>
          <div className="insights-spotlight-copy">
            <span className="insights-spotlight-label">
              Auditor Tip {activeInsightIndex + 1}/{AUDITOR_INSIGHTS.length}
            </span>
            <strong>{activeInsight.title}</strong>
            <p>{activeInsight.body}</p>
          </div>
          <div className="insights-motion-preview" aria-hidden="true">
            <span className="insights-motion-frame">
              <span />
              <span />
              <span />
            </span>
            <span className="insights-motion-frame">
              <span />
              <span />
              <span />
            </span>
            <span className="insights-motion-frame">
              <span />
              <span />
              <span />
            </span>
          </div>
          <div className="insights-progress" aria-hidden="true">
            <span />
          </div>
        </div>

        <div className="insights-grid" aria-label="Basic auditor knowledge">
          {AUDITOR_INSIGHTS.map((insight, index) => (
            <button
              key={insight.title}
              type="button"
              className={`insight-card ${index === activeInsightIndex ? 'is-active' : ''}`}
              aria-pressed={index === activeInsightIndex}
              aria-label={`Show insight: ${insight.title}`}
              onClick={() => setActiveInsightIndex(index)}
            >
              <span className="insight-card-index">{String(index + 1).padStart(2, '0')}</span>
              <h4>{insight.title}</h4>
              <p>{insight.body}</p>
            </button>
          ))}
        </div>
      </aside>
    );
  }

  function renderFaqPanel() {
    if (!isFaqOpen) {
      return null;
    }

    const activeFaq = FAQ_ITEMS[activeFaqIndex % FAQ_ITEMS.length];

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

        <div className="faq-intro faq-ai-spotlight" key={activeFaq.question}>
          <div className="faq-ai-copy">
            <span className="faq-ai-label">Auri AI answer {activeFaqIndex + 1}/{FAQ_ITEMS.length}</span>
            <strong>{activeFaq.question}</strong>
            <p>{activeFaq.answer}</p>
          </div>
          <div className="faq-ai-visual" aria-hidden="true">
            <span className="faq-ai-orb">AI</span>
            <span className="faq-ai-thread">
              <span />
              <span />
              <span />
            </span>
            <span className="faq-ai-response">
              <span />
              <span />
              <span />
            </span>
          </div>
          <div className="faq-ai-progress" aria-hidden="true">
            <span />
          </div>
        </div>

        <div className="faq-list">
          {FAQ_ITEMS.map((item, index) => (
            <button
              key={item.question}
              type="button"
              className={`faq-item ${index === activeFaqIndex ? 'is-active' : ''}`}
              aria-pressed={index === activeFaqIndex}
              aria-label={`Show answer: ${item.question}`}
              onClick={() => setActiveFaqIndex(index)}
            >
              <span className="faq-item-kicker">Q{index + 1}</span>
              <h4>{item.question}</h4>
              <p>{item.answer}</p>
            </button>
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
            {session ? (
              <button
                type="button"
                className="brand-nav-button"
                aria-current={currentPage === 'ai-document-scanner' ? 'page' : undefined}
                onClick={openAiDocumentScanner}
              >
                AI Document Scanner
              </button>
            ) : null}
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
                  <span className="portal-logo-orbit" />
                  <span className="portal-logo-scan" />
                  <span className="portal-logo-node portal-logo-node-one" />
                  <span className="portal-logo-node portal-logo-node-two" />
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
          <div className="feature-card feature-card-with-motion">
            <div className="feature-motion feature-motion-command" aria-hidden="true">
              <span />
              <span />
              <span />
              <i />
            </div>
            <h3>Command-center workspace</h3>
            <p>Select clients, publish PBC lists, and monitor completion signals from one focused view.</p>
          </div>
          <div className="feature-card feature-card-with-motion">
            <div className="feature-motion feature-motion-upload" aria-hidden="true">
              <span />
              <span />
              <i />
            </div>
            <h3>Guided client uploads</h3>
            <p>Clients see assigned requests and attach evidence directly against the exact PBC item.</p>
          </div>
          <div className="feature-card feature-card-with-motion">
            <div className="feature-motion feature-motion-review" aria-hidden="true">
              <span />
              <span />
              <span />
              <i />
            </div>
            <h3>Review signals that stand out</h3>
            <p>Status badges, upload alerts, and document outcomes keep priority follow-ups visible.</p>
          </div>
        </div>

        <section className="promo-video-showcase" aria-label="NeuAud product video">
          <div className="promo-video-copy">
            <span className="eyebrow">Product film</span>
            <h2>A fast walkthrough your team can understand in under a minute.</h2>
            <p>
              Use this as a quick opener for auditors, client contacts, and new users before they sign in.
              The reel shows the journey from workspace setup to final review without turning the page into another checklist.
            </p>
            <div className="promo-video-brief" aria-label="Product film details">
              <div>
                <strong>Executive view</strong>
              </div>
              <div>
                <strong>Evidence journey</strong>
              </div>
              <div>
                <strong>Control focus</strong>
              </div>
            </div>
            <div className="promo-video-storyline" aria-label="Product film storyline">
              <span>Story arc</span>
              <strong>Set up workspace -&gt; collect evidence -&gt; review -&gt; close</strong>
            </div>
          </div>

          <div className="promo-video-player" role="img" aria-label="Animated product tour of NeuAud audit collaboration features">
            <div className="promo-player-topbar">
              <span>NeuAud product tour</span>
              <strong>00:58</strong>
            </div>
            <div className="promo-video-stage">
              <div className="promo-reel-track">
                <article className="promo-scene promo-scene-control">
                  <div className="promo-scene-caption">
                    <span>01</span>
                    <strong>Audit command center</strong>
                    <p>Pick the client workspace, see open PBC lists, and start from the right engagement context.</p>
                  </div>
                  <div className="promo-screen-card promo-screen-dashboard">
                    <div className="promo-screen-header">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="promo-dashboard-grid">
                      <div><strong>54</strong><span>Total items</span></div>
                      <div><strong>3</strong><span>In progress</span></div>
                      <div><strong>0</strong><span>Overdue</span></div>
                    </div>
                    <div className="promo-progress-line"><span /></div>
                  </div>
                </article>

                <article className="promo-scene promo-scene-pbc">
                  <div className="promo-scene-caption">
                    <span>02</span>
                    <strong>PBC lists without spreadsheet drift</strong>
                    <p>Upload detailed lists or generate PBC items from trial balance mapping, then approve when ready.</p>
                  </div>
                  <div className="promo-screen-card promo-screen-table">
                    <div className="promo-table-row promo-table-head"><span>Request</span><span>Due date</span><span>Status</span></div>
                    <div className="promo-table-row"><span>Fixed asset register</span><strong>Aug 6</strong><em>Pending</em></div>
                    <div className="promo-table-row"><span>Depreciation support</span><strong>Aug 6</strong><em>In progress</em></div>
                    <div className="promo-table-row"><span>Review evidence</span><strong>Aug 6</strong><em>Pending</em></div>
                  </div>
                </article>

                <article className="promo-scene promo-scene-upload">
                  <div className="promo-scene-caption">
                    <span>03</span>
                    <strong>Client uploads land on the exact item</strong>
                    <p>Evidence, remarks, review comments, and files stay tied to the specific PBC request.</p>
                  </div>
                  <div className="promo-screen-card promo-upload-card">
                    <div className="promo-upload-drop">
                      <span />
                      <strong>Upload supporting file</strong>
                      <p>Mapped to BS-A-04</p>
                    </div>
                    <div className="promo-upload-file"><span>PDF</span><strong>Auditors Report E&amp;Y.pdf</strong></div>
                  </div>
                </article>

                <article className="promo-scene promo-scene-review">
                  <div className="promo-scene-caption">
                    <span>04</span>
                    <strong>Review decisions update the whole workspace</strong>
                    <p>Accept, reject with comments, and let dashboards reflect completed, pending, and in-progress work.</p>
                  </div>
                  <div className="promo-screen-card promo-review-card">
                    <div className="promo-review-doc"><span>Client document</span><strong>Pending review</strong></div>
                    <div className="promo-review-actions">
                      <span>Accept</span>
                      <span>Reject with reason</span>
                    </div>
                    <div className="promo-review-outcome">Status changes to Completed after acceptance</div>
                  </div>
                </article>

                <article className="promo-scene promo-scene-assist">
                  <div className="promo-scene-caption">
                    <span>05</span>
                    <strong>Notifications, exports, and Auri in one place</strong>
                    <p>Stay ahead of uploads, overdue items, technical updates, and download-ready PBC evidence packages.</p>
                  </div>
                  <div className="promo-screen-card promo-assist-card">
                    <div className="promo-assist-bubble"><strong>Auri</strong><span>What needs attention right now?</span></div>
                    <div className="promo-assist-list">
                      <span>New upload notification</span>
                      <span>Download all PBC files</span>
                      <span>Export updated Excel</span>
                    </div>
                  </div>
                </article>
              </div>
            </div>
            <div className="promo-video-controls" aria-hidden="true">
              <span className="promo-play-button" />
              <div className="promo-video-progress" />
              <span className="promo-volume-bars"><i /><i /><i /></span>
            </div>
          </div>
        </section>

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

  if (currentPage === 'ai-document-scanner') {
    return (
      <main className="page brand-shell ai-scanner-page">
        {renderBrandHeader()}
        {renderBackControls('top')}
        <section className="hero-banner compact">
          <h1>AI Document Scanner</h1>
          <p>Upload document images to run OCR and extract key fields like client name, bank details, amount, currency, and validity.</p>
        </section>

        <section className="card ai-scanner-card">
          <div className="ai-scanner-grid">
            <div className="ai-scanner-panel">
              <h2>Upload Document</h2>
              <p className="muted">Supported: image formats (`.png`, `.jpg`, `.jpeg`, `.webp`). For PDFs, upload a screenshot or page image.</p>
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,image/*"
                onChange={(event) => handleScannerFileChange(event.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                className="ai-scan-button"
                disabled={!scannerFile || scannerIsRunning}
                onClick={() => void handleRunDocumentScan()}
              >
                {scannerIsRunning ? 'Scanning...' : 'Scan Document'}
              </button>
              {scannerError ? <p className="error">{scannerError}</p> : null}
              {scannerPreviewUrl ? (
                <div className="ai-scanner-preview">
                  <img src={scannerPreviewUrl} alt="Document preview for OCR" />
                </div>
              ) : null}
            </div>

            <div className="ai-scanner-panel">
              <h2>Extracted Information</h2>
              {scannerInsights ? (
                <div className="ai-scanner-results">
                  <div><span>Client Name</span><strong>{scannerInsights.clientName || '-'}</strong></div>
                  <div><span>Bank Name</span><strong>{scannerInsights.bankName || '-'}</strong></div>
                  <div><span>Account Number</span><strong>{scannerInsights.accountNumber || '-'}</strong></div>
                  <div><span>Amount</span><strong>{scannerInsights.amount || '-'}</strong></div>
                  <div><span>Currency</span><strong>{scannerInsights.currency || '-'}</strong></div>
                  <div><span>Validity</span><strong>{scannerInsights.validUntil || '-'}</strong></div>
                </div>
              ) : (
                <p className="muted">Run OCR to view extracted document fields.</p>
              )}
            </div>
          </div>

          <div className="ai-scanner-text-wrap">
            <h3>Raw OCR Text</h3>
            <textarea
              value={scannerExtractedText}
              readOnly
              rows={8}
              placeholder="OCR output will appear here after scanning."
            />
          </div>
        </section>
      </main>
    );
  }

  if (session.user.role === 'auditor' && currentPage === 'auditor-client-select') {
    const selectedClientTrialBalance = submissions
      .filter((submission) => {
        if (!activeAuditorClientId || submission.clientId !== activeAuditorClientId) {
          return false;
        }
        const requirement = requirements.find((req) => req.id === submission.requirementId);
        return requirement?.title.toLowerCase().includes('trial balance') ?? false;
      })
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0];

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
                <p className="muted">Set the client context before opening the workspace. PBC due dates come from the Due Date column in the PBC list.</p>
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
                <span className="auditor-field-helper">Trial balance due date uses this date + 3 months. PBC items use the Due Date column in the PBC list.</span>
              </div>
            </div>
            <div className="auditor-startup-footer">
              {selectedClientTrialBalance ? (
                <div className="trial-balance-upload-pop" role="status" aria-live="polite">
                  <span className="trial-balance-upload-pop-title">Trial balance uploaded by client</span>
                  <strong className="trial-balance-upload-pop-file">{selectedClientTrialBalance.originalName}</strong>
                  <span className="trial-balance-upload-pop-time">
                    Uploaded {new Date(selectedClientTrialBalance.uploadedAt).toLocaleString()}
                  </span>
                </div>
              ) : null}
              <p className="muted auditor-startup-note">
                PBC item due dates are now read from each item&apos;s Due Date column across the workspace.
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
              {selectedPbcDueDateColumnLabel ? (
                <span className="audit-date-badge">
                  Due Date: <strong>{selectedPbcDueDateColumnLabel}</strong>
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
                <col className="client-pbc-col-days" />
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
                  <th>Pending / Overdue</th>
                  <th>Status</th>
                  <th>Document Review</th>
                  <th>Remarks</th>
                  <th>Files</th>
                </tr>
              </thead>
              <tbody>
                {clientItemRows.length === 0 ? (
                  <tr>
                    <td colSpan={12}>
                      <div className="table-empty-state">
                        <strong>No items found</strong>
                        <span>Your auditor-approved PBC items will appear here once available.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  clientItemRows.map((item) => {
                    const daysLabel = getPbcDaysLabel(item);

                    return (
                      <tr key={item.id}>
                        <td><span className="table-id-pill">{item.requestId}</span></td>
                        <td className="client-pbc-description-cell">{item.description}</td>
                        <td><span className="client-pbc-priority">{item.priority || '-'}</span></td>
                        <td className="client-pbc-text-cell">{item.riskAssertion || '-'}</td>
                        <td className="client-pbc-text-cell">{item.owner}</td>
                        <td className="table-date-cell">{formatDateLabel(item.requestedDate)}</td>
                        <td className="table-date-cell table-date-cell-due">{formatDateLabel(item.dueDate)}</td>
                        <td className="client-pbc-days-cell"><span className={daysLabel.className}>{daysLabel.label}</span></td>
                        <td>
                          <span className={`status-badge status-${item.status.toLowerCase().replace(/\s+/g, '-')}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="client-pbc-review-cell">{getDocumentReviewOutcomeLabel(item.documentReviewStatus)}</td>
                        <td className="client-pbc-remarks-cell">
                          <input
                            className="client-pbc-remarks-input"
                            value={item.remarks ?? ''}
                            aria-label={`Remarks for ${item.requestId}`}
                            onChange={(event) => updateClientItemRemarkDraft(item.id, event.target.value)}
                            onBlur={(event) => void handleClientItemRemarksSave(item.id, event.currentTarget.value)}
                          />
                        </td>
                        <td>
                          <button type="button" className="table-action-button client-pbc-upload-files-button" onClick={() => void openItemDetail(item)}>Upload Files</button>
                        </td>
                      </tr>
                    );
                  })
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

        <div className="page-inline-back-controls page-inline-back-controls-spaced">
          <button type="button" className="secondary page-inline-back-button" onClick={handleItemDetailBack}>
            {session.user.role === 'client' ? 'Back to PBC Items' : 'Back to PBC Editor'}
          </button>
        </div>

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
            <div className="item-meta-row">
              <span className="item-meta-label">Remarks</span>
              {session.user.role === 'client' ? (
                <input
                  className="client-pbc-remarks-input"
                  value={activePbcItem.remarks ?? ''}
                  aria-label={`Remarks for ${activePbcItem.requestId}`}
                  onChange={(event) => updateClientItemRemarkDraft(activePbcItem.id, event.target.value)}
                  onBlur={(event) => void handleClientItemRemarksSave(activePbcItem.id, event.currentTarget.value)}
                />
              ) : (
                <span>{activePbcItem.remarks || '-'}</span>
              )}
            </div>
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
                  <th>Review Comment</th>
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
                    <td>{file.reviewComment || '-'}</td>
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
              {selectedEditorDueDateColumnLabel ? (
                <p className="audit-date-badge" style={{ display: 'inline-flex', marginTop: 6 }}>
                  Due Date: <strong style={{ marginLeft: 4 }}>{selectedEditorDueDateColumnLabel}</strong>
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
            <button
              className="secondary"
              onClick={() => void handleDownloadAllPbcClientFiles()}
              disabled={!selectedPbcListId}
            >
              Download All PBC Files
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
            <button
              className="secondary"
              onClick={() => void handleDownloadAllPbcClientFiles()}
              disabled={!selectedPbcListId}
            >
              Download All PBC Files
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
          <div className="pbc-status-grid pbc-status-grid-balanced">
            {visiblePbcLists.map((item) => {
              const counts = getStatusCountsForList(item.id);
              const stats = getClientListStats(item.id);

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
                  <div className="pbc-extra-stats" aria-label="Additional PBC statistics">
                    <div className="pbc-extra-stat">
                      <span className="pbc-extra-stat-label">Completion</span>
                      <strong className="pbc-extra-stat-value">{stats.completionRate}%</strong>
                    </div>
                    <div className="pbc-extra-stat">
                      <span className="pbc-extra-stat-label">Overdue Open</span>
                      <strong className={`pbc-extra-stat-value ${stats.overdue > 0 ? 'is-alert' : ''}`}>{stats.overdue}</strong>
                    </div>
                    <div className="pbc-extra-stat">
                      <span className="pbc-extra-stat-label">Due in 7 Days</span>
                      <strong className="pbc-extra-stat-value">{stats.dueSoon}</strong>
                    </div>
                    <div className="pbc-extra-stat">
                      <span className="pbc-extra-stat-label">Pending Review</span>
                      <strong className="pbc-extra-stat-value">{stats.pendingReview}</strong>
                    </div>
                    <div className="pbc-extra-stat">
                      <span className="pbc-extra-stat-label">Rejected Docs</span>
                      <strong className={`pbc-extra-stat-value ${stats.rejected > 0 ? 'is-alert' : ''}`}>{stats.rejected}</strong>
                    </div>
                    <div className="pbc-extra-stat">
                      <span className="pbc-extra-stat-label">High Priority Open</span>
                      <strong className={`pbc-extra-stat-value ${stats.highPriorityOpen > 0 ? 'is-warn' : ''}`}>{stats.highPriorityOpen}</strong>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="pbc-status-card pbc-status-card-snapshot">
              <h3>Workspace Snapshot</h3>
              <p className="pbc-card-meta">Executive view across all active PBC lists</p>
              {(() => {
                const openItems = pbcStatusSummary.pending + pbcStatusSummary.inProgress;
                const highPriorityOpen = visiblePbcItems.filter((item) => item.status !== 'Completed' && item.priority.toLowerCase().includes('high')).length;
                const pendingReview = visiblePbcItems.filter((item) => item.documentReviewStatus === 'Pending Review').length;
                const rejectedDocs = visiblePbcItems.filter((item) => item.documentReviewStatus === 'Rejected').length;
                const highPriorityPressure = openItems > 0 ? Math.round((highPriorityOpen / openItems) * 100) : 0;
                const reviewBacklogRate = openItems > 0 ? Math.round((pendingReview / openItems) * 100) : 0;
                const weightedRisk = Math.min(100, Math.round((pbcStatusSummary.overdue * 2 + highPriorityOpen + rejectedDocs) / Math.max(1, openItems) * 100));
                const healthScore = Math.max(0, 100 - weightedRisk);
                const healthLabel = healthScore >= 75 ? 'Healthy' : healthScore >= 50 ? 'Watchlist' : 'At Risk';
                const topAction = pbcStatusSummary.overdue > 0
                  ? 'Clear overdue items first'
                  : pendingReview > 0
                    ? 'Close pending document reviews'
                    : highPriorityOpen > 0
                      ? 'Advance high-priority open requests'
                      : 'Maintain momentum on in-progress requests';

                return (
                  <>
                    <div className="snapshot-health-band">
                      <div>
                        <span className="snapshot-health-label">Delivery Health</span>
                        <strong className="snapshot-health-score">{healthScore}</strong>
                      </div>
                      <span className={`snapshot-health-pill ${healthScore < 50 ? 'danger' : healthScore < 75 ? 'warn' : 'ok'}`}>{healthLabel}</span>
                    </div>

                    <div className="snapshot-bars" aria-label="Execution indicators">
                      <div className="snapshot-bar-row">
                        <span>Completion Momentum</span>
                        <strong>{pbcStatusSummary.completionRate}%</strong>
                        <div className="snapshot-bar-track"><div className="snapshot-bar-fill info" style={{ width: `${pbcStatusSummary.completionRate}%` }} /></div>
                      </div>
                      <div className="snapshot-bar-row">
                        <span>High Priority Pressure</span>
                        <strong>{highPriorityPressure}%</strong>
                        <div className="snapshot-bar-track"><div className="snapshot-bar-fill warn" style={{ width: `${highPriorityPressure}%` }} /></div>
                      </div>
                      <div className="snapshot-bar-row">
                        <span>Review Backlog</span>
                        <strong>{reviewBacklogRate}%</strong>
                        <div className="snapshot-bar-track"><div className="snapshot-bar-fill danger" style={{ width: `${reviewBacklogRate}%` }} /></div>
                      </div>
                    </div>

                    <div className="snapshot-detail-grid">
                      <div className="snapshot-detail-card">
                        <span className="snapshot-detail-label">Top Action</span>
                        <strong className="snapshot-detail-value">{topAction}</strong>
                      </div>
                      <div className="snapshot-detail-card">
                        <span className="snapshot-detail-label">Open Workload</span>
                        <strong className="snapshot-detail-value">{openItems} active item{openItems === 1 ? '' : 's'}</strong>
                      </div>
                    </div>

                    <div className="pbc-snapshot-notes">
                      <p>Focus queue</p>
                      <p>{pbcStatusSummary.overdue} overdue, {highPriorityOpen} high-priority open, {pendingReview} pending review, {rejectedDocs} rejected.</p>
                      <p>Use View Items to clear overdue and review backlog first.</p>
                    </div>
                  </>
                );
              })()}
            </div>
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
                <td className="table-date-cell">{formatDateLabel(getClientVisibleRequirementDueDate(requirement))}</td>
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
