import { PbcItem, Requirement } from '@core/models/types';

export function getFinancialYearLabel(requirement?: Requirement | null): string {
  const title = requirement?.title.trim();
  if (!title) return 'this financial year';
  const match = title.match(/\bFY\s*\d{4}\s*[-/]\s*\d{2,4}\b/i);
  return match ? match[0].replace(/\s+/g, ' ') : title;
}

export function normalizeDateForInput(value: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, '0');
    const day = slashMatch[2].padStart(2, '0');
    return `${slashMatch[3]}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function calcPendingDays(dueDate: string, referenceDate?: string): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return null;
  const baseDate = referenceDate ? new Date(referenceDate) : new Date();
  if (isNaN(baseDate.getTime())) return null;
  baseDate.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
}

export function inferPriorityFromRiskAssertion(value: string): string {
  const text = (value ?? '').trim().toLowerCase();
  if (!text) return '';
  const highSignals = ['fraud', 'material', 'going concern', 'impairment', 'significant risk', 'revenue recognition', 'litigation', 'related party', 'override'];
  const mediumSignals = ['valuation', 'estimate', 'cut-off', 'cutoff', 'accuracy', 'completeness', 'classification', 'presentation', 'disclosure', 'provision', 'tax'];
  if (highSignals.some((s) => text.includes(s))) return 'High';
  if (mediumSignals.some((s) => text.includes(s))) return 'Medium';
  return 'Low';
}

export function calculateDueDate(baseDueDate: string, priority: string): string {
  if (!baseDueDate) return '';
  const date = new Date(baseDueDate + 'T00:00:00');
  if (isNaN(date.getTime())) return '';
  let monthsBack = 0;
  if ((priority ?? '').toLowerCase() === 'high') monthsBack = 2;
  else if ((priority ?? '').toLowerCase() === 'medium') monthsBack = 1;
  date.setMonth(date.getMonth() - monthsBack);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateLabel(value?: string): string {
  if (!value) return '-';
  const normalized = normalizeDateForInput(value);
  if (!normalized) return value;
  return new Date(`${normalized}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function formatEntityType(value: string): string {
  const labels: Record<string, string> = {
    'listed-entity': 'Listed entity',
    'subsidiary': 'Subsidiary',
    'joint-venture': 'Joint venture',
    'body-corporate': 'Body corporate',
  };
  return labels[value] ?? value;
}

export function getSupportChatReply(prompt: string): string {
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

export interface ValidationIssue {
  itemId: string;
  requestId: string;
  severity: 'warning' | 'error';
  message: string;
}

export function validateItemAgainstFiles(item: PbcItem, files: Array<{ originalName: string }>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const descriptionTerms = (item.description ?? '').toLowerCase().split(/\s+/).filter((t) => t.length > 3);
  const captionTerms = (item.owner ?? '').toLowerCase().split(/\s+/).filter((t) => t.length > 3);
  const itemKeywords = new Set([...descriptionTerms, ...captionTerms]);

  if (files.length === 0) {
    issues.push({ itemId: item.id, requestId: item.requestId, severity: 'warning', message: `No files uploaded for "${item.requestId}". A file should be uploaded for this item.` });
    return issues;
  }

  const fileNameContent = files.map((f) => f.originalName.toLowerCase()).join(' ');
  const hasMatchingKeyword = Array.from(itemKeywords).some((k) => fileNameContent.includes(k));
  if (!hasMatchingKeyword && itemKeywords.size > 0) {
    const topKeywords = Array.from(itemKeywords).slice(0, 3).join(', ');
    issues.push({ itemId: item.id, requestId: item.requestId, severity: 'warning', message: `Uploaded file name(s) may not match the item description/caption. Expected keywords like: ${topKeywords}` });
  }
  return issues;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
