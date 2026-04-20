"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePbcItemsFromFile = parsePbcItemsFromFile;
const XLSX = __importStar(require("xlsx"));
const crypto_1 = require("crypto");
function normalizeHeaderKey(key) {
    return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}
function isLikelyDateValue(value) {
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
function readCellValue(row, candidates) {
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
function readCellValueByPosition(row, position) {
    const values = Object.values(row).map((value) => (value === null || value === undefined ? '' : String(value).trim()));
    return values[position] ?? '';
}
function readLikelyDateFromRow(row) {
    const values = Object.values(row).map((value) => (value === null || value === undefined ? '' : String(value).trim()));
    const dateLike = values.find((value) => isLikelyDateValue(value));
    return dateLike ?? '';
}
function normalizeDueDate(value) {
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
function isRowEmpty(values) {
    return values.every((value) => value.trim() === '');
}
function normalizeStatus(value) {
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
function inferPriorityFromRiskAssertion(value) {
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
function parsePbcItemsFromFile(filePath, pbcListId, clientId, uploadedAt) {
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
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    let headerRowIndex = 0;
    for (let i = 0; i < rawRows.length; i++) {
        const cells = rawRows[i].map((cell) => String(cell ?? '').trim().toLowerCase());
        if (cells.some((cell) => knownHeaderTerms.has(cell))) {
            headerRowIndex = i;
            break;
        }
    }
    const rows = XLSX.utils.sheet_to_json(worksheet, {
        defval: '',
        range: headerRowIndex,
    });
    const parsedItems = [];
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
            id: (0, crypto_1.randomUUID)(),
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
