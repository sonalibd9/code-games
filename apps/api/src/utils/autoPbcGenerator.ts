import fs from 'fs';
import * as XLSX from 'xlsx';
import { randomUUID } from 'crypto';
import { PbcItem } from '../models/types';

export interface AutoPbcMatchedSubgroup {
  subgroup: string;
  financialCaption: string;
  itemCount: number;
}

export interface AutoPbcGenerationResult {
  items: PbcItem[];
  detectedSubgroups: string[];
  matchedSubgroups: AutoPbcMatchedSubgroup[];
  unmatchedSubgroups: string[];
  templatePath: string;
}

interface BasePbcTemplateRow {
  pbcId: string;
  financialStatement: string;
  financialCaption: string;
  riskAssertion: string;
  description: string;
  purpose: string;
}

const SUBGROUP_HEADER_CANDIDATES = [
  'sub group',
  'subgroup',
  'account sub group',
  'account subgroup',
  'trial balance sub group',
  'trial balance subgroup',
  'financial caption',
  'fs caption',
  'caption',
  'account group',
  'group',
];

const CAPTION_ALIASES: Record<string, string[]> = {
  'Cash & Cash Equivalents': ['cash', 'bank', 'cash and bank', 'cash equivalents', 'bank balances'],
  'Trade Receivables': ['trade receivables', 'accounts receivable', 'receivables', 'debtors', 'ar'],
  Inventory: ['inventory', 'inventories', 'stock'],
  'Property, Plant & Equipment': ['property plant equipment', 'ppe', 'fixed assets', 'property and equipment'],
  'Intangible Assets': ['intangibles', 'intangible assets', 'goodwill'],
  'Prepaids & Other Assets': ['prepaids', 'prepaid expenses', 'other assets', 'deposits'],
  'Trade Payables': ['trade payables', 'accounts payable', 'payables', 'creditors', 'ap'],
  'Accrued Expenses': ['accruals', 'accrued expenses', 'accrued liabilities'],
  'Unearned Revenue': ['unearned revenue', 'deferred revenue', 'contract liabilities'],
  'Debt & Borrowings': ['debt', 'borrowings', 'loans', 'loan payable', 'notes payable'],
  'Share Capital': ['share capital', 'common stock', 'equity share capital', 'capital stock'],
  'Reserves & Retained Earnings': ['retained earnings', 'reserves', 'accumulated earnings'],
  Revenue: ['revenue', 'sales', 'turnover', 'income from operations'],
  'Employee Benefits Expense': ['employee benefits', 'payroll', 'salaries', 'wages', 'compensation'],
  'Depreciation & Amortization': ['depreciation', 'amortization', 'depreciation and amortization'],
  'Finance Costs': ['finance costs', 'interest expense', 'borrowing costs'],
  'Tax Expense': ['tax expense', 'income tax', 'current tax', 'deferred tax'],
  'Operating Activities': ['operating activities', 'cash flow operating'],
  'Investing Activities': ['investing activities', 'cash flow investing'],
  'Financing Activities': ['financing activities', 'cash flow financing'],
  'Journal Entries': ['journal entries', 'manual journal entries', 'je population'],
  'Accounting Estimates': ['accounting estimates', 'estimates', 'management estimates'],
  'Governance Oversight': ['governance oversight', 'board minutes', 'audit committee'],
  'Accounting Policies': ['accounting policies', 'significant accounting policies'],
  'Commitments & Contingencies': ['commitments', 'contingencies', 'legal matters'],
  'Related Party Transactions': ['related party', 'related parties', 'rpt'],
};

const ALWAYS_INCLUDE_CAPTIONS = [
  'Operating Activities',
  'Investing Activities',
  'Financing Activities',
  'Journal Entries',
  'Accounting Estimates',
  'Governance Oversight',
  'Accounting Policies',
  'Commitments & Contingencies',
  'Related Party Transactions',
];

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '');
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenize(value: string): string[] {
  const ignored = new Set(['and', 'or', 'the', 'of', 'to', 'from', 'for']);
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !ignored.has(token));
}

function readCellValue(row: Record<string, unknown>, candidates: string[]): string {
  const rowKeys = Object.keys(row);
  const normalizedRowKeys = rowKeys.map((key) => ({ raw: key, normalized: normalizeKey(key) }));

  for (const key of candidates) {
    const target = normalizeKey(key);
    const match = normalizedRowKeys.find((column) => column.normalized === target);
    if (match) {
      const value = row[match.raw];
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        return String(value).trim();
      }
    }
  }

  return '';
}

function shouldIgnoreSubgroup(value: string): boolean {
  const normalized = normalizeText(value);
  if (!normalized || normalized.length < 3) {
    return true;
  }

  return [
    'total',
    'grand total',
    'subtotal',
    'sub total',
    'balance sheet',
    'income statement',
    'profit and loss',
    'trial balance',
  ].includes(normalized);
}

function findSubgroupColumn(rows: unknown[][]): { headerRowIndex: number; columnIndex: number } | null {
  const maxRowsToScan = Math.min(rows.length, 30);

  for (let rowIndex = 0; rowIndex < maxRowsToScan; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    let bestMatch: { columnIndex: number; rank: number } | null = null;

    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const value = normalizeKey(String(row[columnIndex] ?? ''));
      if (!value) {
        continue;
      }

      const candidateIndex = SUBGROUP_HEADER_CANDIDATES.findIndex((candidate) => value === normalizeKey(candidate));
      if (candidateIndex >= 0 && (!bestMatch || candidateIndex < bestMatch.rank)) {
        bestMatch = { columnIndex, rank: candidateIndex };
      }
    }

    if (bestMatch) {
      return { headerRowIndex: rowIndex, columnIndex: bestMatch.columnIndex };
    }
  }

  return null;
}

function parseBasePbcTemplate(templatePath: string): BasePbcTemplateRow[] {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Base PBC template was not found at ${templatePath}.`);
  }

  const workbook = XLSX.readFile(templatePath, { raw: false });
  const sheetName = workbook.SheetNames.find((name) => /asset|pbc|bs/i.test(name)) ?? workbook.SheetNames[0];
  if (!sheetName) {
    return [];
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '', raw: false });

  return rows
    .map((row) => ({
      pbcId: readCellValue(row, ['PBC ID', 'Request ID', 'PBC']),
      financialStatement: readCellValue(row, ['Financial Statement', 'Statement']),
      financialCaption: readCellValue(row, ['Financial Caption', 'Sub Group', 'Subgroup', 'Caption']),
      riskAssertion: readCellValue(row, ['Risk / Assertion', 'Risk Assertion', 'Assertion', 'Risk']),
      description: readCellValue(row, ['PBC Description', 'Description', 'Requirement', 'Information Requested']),
      purpose: readCellValue(row, ['Purpose (FS / SOX / 10-K)', 'Purpose']),
    }))
    .filter((row) => row.financialCaption && row.description);
}

function findMatchingCaption(subgroup: string, captions: string[]): string | null {
  const normalizedSubgroup = normalizeKey(subgroup);
  const subgroupTokens = new Set(tokenize(subgroup));

  const exactCaption = captions.find((caption) => normalizeKey(caption) === normalizedSubgroup);
  if (exactCaption) {
    return exactCaption;
  }

  const exactAliasCaption = captions.find((caption) =>
    (CAPTION_ALIASES[caption] ?? []).some((alias) => normalizeKey(alias) === normalizedSubgroup),
  );
  if (exactAliasCaption) {
    return exactAliasCaption;
  }

  for (const caption of captions) {
    const normalizedCaption = normalizeKey(caption);
    if (normalizedCaption.length >= 5 && normalizedSubgroup.includes(normalizedCaption)) {
      return caption;
    }

    const aliases = CAPTION_ALIASES[caption] ?? [];
    if (aliases.some((alias) => {
      const normalizedAlias = normalizeKey(alias);
      return normalizedAlias.length >= 3 && normalizedSubgroup.includes(normalizedAlias);
    })) {
      return caption;
    }

    const captionTokens = tokenize(caption);
    const allCaptionTokensMatch = captionTokens.length > 0 && captionTokens.every((token) => subgroupTokens.has(token));
    if (allCaptionTokensMatch) {
      return caption;
    }
  }

  return null;
}

function extractTrialBalanceSubgroups(trialBalancePath: string, baseCaptions: string[]): string[] {
  const workbook = XLSX.readFile(trialBalancePath, { raw: false });
  const subgroups: string[] = [];
  const seen = new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', raw: false });
    const subgroupColumn = findSubgroupColumn(rows);

    if (subgroupColumn) {
      for (let rowIndex = subgroupColumn.headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
        const value = String(rows[rowIndex]?.[subgroupColumn.columnIndex] ?? '').trim();
        const normalized = normalizeKey(value);
        if (!value || shouldIgnoreSubgroup(value) || seen.has(normalized)) {
          continue;
        }
        seen.add(normalized);
        subgroups.push(value);
      }
      continue;
    }

    for (const row of rows) {
      for (const cell of row) {
        const value = String(cell ?? '').trim();
        const normalized = normalizeKey(value);
        if (!value || shouldIgnoreSubgroup(value) || seen.has(normalized)) {
          continue;
        }
        if (findMatchingCaption(value, baseCaptions)) {
          seen.add(normalized);
          subgroups.push(value);
        }
      }
    }
  }

  return subgroups;
}

function inferPriorityFromRiskAssertion(value: string): string {
  const text = (value ?? '').trim().toLowerCase();
  if (!text) {
    return 'Low';
  }

  if (['fraud', 'material', 'going concern', 'impairment', 'significant risk', 'litigation', 'override'].some((signal) => text.includes(signal))) {
    return 'High';
  }

  if (['valuation', 'estimate', 'cut-off', 'cutoff', 'accuracy', 'completeness', 'presentation', 'disclosure', 'tax'].some((signal) => text.includes(signal))) {
    return 'Medium';
  }

  return 'Low';
}

export function generateAutoPbcItemsFromTrialBalance(
  trialBalancePath: string,
  templatePath: string,
  pbcListId: string,
  clientId: string,
  uploadedAt: string,
): AutoPbcGenerationResult {
  const baseTemplateRows = parseBasePbcTemplate(templatePath);
  const baseCaptions = Array.from(new Set(baseTemplateRows.map((row) => row.financialCaption)));
  const detectedSubgroups = extractTrialBalanceSubgroups(trialBalancePath, baseCaptions);
  const captionToSourceSubgroup = new Map<string, string>();
  const unmatchedSubgroups: string[] = [];

  for (const subgroup of detectedSubgroups) {
    const caption = findMatchingCaption(subgroup, baseCaptions);
    if (!caption) {
      unmatchedSubgroups.push(subgroup);
      continue;
    }

    if (!captionToSourceSubgroup.has(caption)) {
      captionToSourceSubgroup.set(caption, subgroup);
    }
  }

  for (const caption of ALWAYS_INCLUDE_CAPTIONS) {
    if (baseCaptions.includes(caption) && !captionToSourceSubgroup.has(caption)) {
      captionToSourceSubgroup.set(caption, caption);
    }
  }

  const matchedCaptions = Array.from(captionToSourceSubgroup.keys());
  const now = new Date().toISOString();
  const requestedDate = uploadedAt.slice(0, 10);
  const items: PbcItem[] = [];
  const matchedSubgroups: AutoPbcMatchedSubgroup[] = [];

  for (const caption of matchedCaptions) {
    const templateRows = baseTemplateRows.filter((row) => row.financialCaption === caption);
    const subgroup = captionToSourceSubgroup.get(caption) ?? caption;
    matchedSubgroups.push({
      subgroup,
      financialCaption: caption,
      itemCount: templateRows.length,
    });

    templateRows.forEach((row) => {
      items.push({
        id: randomUUID(),
        pbcListId,
        clientId,
        requestId: row.pbcId || `AUTO-${items.length + 1}`,
        description: row.description,
        priority: inferPriorityFromRiskAssertion(row.riskAssertion),
        riskAssertion: row.riskAssertion,
        owner: row.financialCaption,
        requestedDate,
        dueDate: '',
        activityDate: '',
        status: 'Pending',
        remarks: '',
        updatedAt: now,
      });
    });
  }

  return {
    items,
    detectedSubgroups,
    matchedSubgroups,
    unmatchedSubgroups,
    templatePath,
  };
}
