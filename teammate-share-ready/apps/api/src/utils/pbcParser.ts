import * as XLSX from 'xlsx';
import { randomUUID } from 'crypto';
import { PbcItem } from '../models/types';

function normalizeHeaderKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isLikelyDateValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (/^\d{5}(\.\d+)?$/.test(trimmed)) {
    return true;
  }

  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(trimmed)) {
    return true;
  }

  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(trimmed)) {
    return true;
  }

  return !Number.isNaN(Date.parse(trimmed));
}

function readCellValue(row: Record<string, unknown>, candidates: string[]): string {
  const rowKeys = Object.keys(row);
  const normalizedRowKeys = rowKeys.map((key) => ({ raw: key, normalized: normalizeHeaderKey(key) }));

  for (const key of candidates) {
    const target = normalizeHeaderKey(key);
    const exact = normalizedRowKeys.find((column) => column.normalized === target);
    const partial = normalizedRowKeys.find((column) => column.normalized.includes(target) || target.includes(column.normalized));
    const match = exact ?? partial;

    if (match) {
      const value = row[match.raw];
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        return String(value).trim();
      }
    }
  }

  return '';
}

function readCellValueByPosition(row: Record<string, unknown>, position: number): string {
  const values = Object.values(row).map((value) => (value === null || value === undefined ? '' : String(value).trim()));
  return values[position] ?? '';
}

function readLikelyDateFromRow(row: Record<string, unknown>): string {
  const values = Object.values(row).map((value) => (value === null || value === undefined ? '' : String(value).trim()));
  const dateLike = values.find((value) => isLikelyDateValue(value));
  return dateLike ?? '';
}

function normalizeDueDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (/^\d+$/.test(trimmed) && Number(trimmed) < 10000) {
    return '';
  }

  if (/^\d{5}(\.\d+)?$/.test(trimmed)) {
    const parsed = XLSX.SSF.parse_date_code(Number(trimmed));
    if (parsed) {
      const month = String(parsed.m).padStart(2, '0');
      const day = String(parsed.d).padStart(2, '0');
      return `${parsed.y}-${month}-${day}`;
    }
  }

  return trimmed;
}

function isRowEmpty(values: string[]): boolean {
  return values.every((value) => value.trim() === '');
}

function normalizeStatus(value: string): string {
  const lower = (value ?? '').trim().toLowerCase();
  if (lower === 'completed' || lower === 'complete' || lower === 'done' || lower === 'closed') {
    return 'Completed';
  }
  if (lower === 'in progress' || lower === 'inprogress' || lower === 'in-progress' || lower === 'wip' || lower === 'ongoing') {
    return 'In progress';
  }
  // Everything else (blank, 'open', 'pending', 'not started', etc.) defaults to Pending
  return 'Pending';
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

export function parsePbcItemsFromFile(filePath: string, pbcListId: string, clientId: string, uploadedAt?: string): PbcItem[] {
  const workbook = XLSX.readFile(filePath, { raw: false });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return [];
  }

  const worksheet = workbook.Sheets[firstSheetName];

  // Detect the actual column-header row so branding/title rows at the top are skipped.
  // Known canonical column names that appear in the header row.
  const knownHeaderTerms = new Set([
    'request id', 'requestid', 'pbc id', 'pbc', 'description', 'requirement',
    'information requested', 'particulars',
  ]);

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '' });
  let headerRowIndex = 0;
  for (let i = 0; i < rawRows.length; i++) {
    const cells = (rawRows[i] as unknown[]).map((cell) => String(cell ?? '').trim().toLowerCase());
    if (cells.some((cell) => knownHeaderTerms.has(cell))) {
      headerRowIndex = i;
      break;
    }
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
    range: headerRowIndex,
  });

  const parsedItems: PbcItem[] = [];

  for (const [index, row] of rows.entries()) {
    const priorityFromHeader = readCellValue(row, [
      'Priority',
      'Priority Level',
      'Urgency',
      'Rank',
    ]);
    const riskAssertionFromHeader = readCellValue(row, [
      'Risk / Assertion',
      'Risk/Assertion',
      'Risk Assertion',
      'Assertion',
      'Risk',
    ]);

    const requestIdFromHeader = readCellValue(row, [
      'Request ID',
      'RequestId',
      'PBC ID',
      'PBC',
      'Id',
      'PBC No',
      'PBC Number',
      'Ref',
    ]);
    const descriptionFromHeader = readCellValue(row, [
      'Description',
      'Requirement',
      'Item',
      'Details',
      'Information Requested',
      'Particulars',
    ]);
    const ownerFromHeader = readCellValue(row, [
      'Owner',
      'Responsible',
      'PIC',
      'Prepared By',
      'Client Owner',
      'Client POC',
    ]);
    const dueDateFromHeader = readCellValue(row, [
      'Due Date',
      'DueDate',
      'Target Date',
      'Expected Date',
      'Submission Date',
      'Date Required',
      'Required Date',
      'Deadline',
      'Client Due Date',
    ]);
    const statusFromHeader = readCellValue(row, [
      'Status',
      'Current Status',
      'Progress',
    ]);
    const remarksFromHeader = readCellValue(row, [
      'Remarks',
      'Comment',
      'Notes',
      'Auditor Remarks',
    ]);

    const requestId = requestIdFromHeader || readCellValueByPosition(row, 0) || `PBC-${index + 1}`;
    const description = descriptionFromHeader || readCellValueByPosition(row, 1);
    const owner = ownerFromHeader || readCellValueByPosition(row, 2);
    const requestedDateFromHeader = readCellValue(row, [
      'Requested Date',
      'RequestedDate',
      'Request Date',
      'Date Requested',
      'Submission Requested Date',
    ]);

    const positionalDueDate = readCellValueByPosition(row, 3);
    const dueDateCandidate = dueDateFromHeader || (isLikelyDateValue(positionalDueDate) ? positionalDueDate : readLikelyDateFromRow(row));
    const dueDate = normalizeDueDate(dueDateCandidate);

    const requestedDateCandidate = requestedDateFromHeader || '';
    const requestedDate = normalizeDueDate(requestedDateCandidate) || (uploadedAt ? uploadedAt.slice(0, 10) : '');

    const rawStatus = statusFromHeader || readCellValueByPosition(row, 4);
    const status = normalizeStatus(rawStatus);
    const inferredPriority = inferPriorityFromRiskAssertion(riskAssertionFromHeader);
    const remarks = remarksFromHeader || readCellValueByPosition(row, 5);

    if (isRowEmpty([requestId, description, owner, dueDate, status, remarks])) {
      continue;
    }

    parsedItems.push({
      id: randomUUID(),
      pbcListId,
      clientId,
      requestId,
      description,
      priority: inferredPriority || priorityFromHeader,
      riskAssertion: riskAssertionFromHeader,
      owner,
      requestedDate,
      dueDate,
      activityDate: status === 'Completed' ? (uploadedAt ?? new Date().toISOString()) : '',
      status,
      remarks,
      updatedAt: new Date().toISOString(),
    });
  }

  return parsedItems;
}
