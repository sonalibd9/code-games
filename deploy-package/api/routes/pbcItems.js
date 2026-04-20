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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const express_1 = require("express");
const zod_1 = require("zod");
const XLSX = __importStar(require("xlsx"));
const auth_1 = require("../middleware/auth");
const types_1 = require("../models/types");
const pbcParser_1 = require("../utils/pbcParser");
const router = (0, express_1.Router)();
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
function isInvalidDueDate(value) {
    const trimmed = value.trim();
    if (!trimmed) {
        return true;
    }
    return /^\d+$/.test(trimmed) && Number(trimmed) < 10000;
}
function repairPbcItemsIfNeeded(pbcListId) {
    const currentItems = types_1.pbcItems.filter((item) => item.pbcListId === pbcListId);
    if (currentItems.length === 0) {
        return;
    }
    const invalidDueDateCount = currentItems.filter((item) => isInvalidDueDate(item.dueDate)).length;
    if (invalidDueDateCount !== currentItems.length) {
        return;
    }
    const list = types_1.pbcLists.find((item) => item.id === pbcListId);
    if (!list) {
        return;
    }
    const parsedItems = (0, pbcParser_1.parsePbcItemsFromFile)(path_1.default.resolve(__dirname, '../../uploads', list.storedName), list.id, list.clientId);
    if (parsedItems.length === 0) {
        return;
    }
    const preservedEdits = new Map(currentItems.map((item) => [item.requestId, item]));
    const repairedItems = parsedItems.map((parsed) => {
        const existing = preservedEdits.get(parsed.requestId);
        if (!existing) {
            return parsed;
        }
        return {
            ...parsed,
            riskAssertion: existing.riskAssertion || parsed.riskAssertion,
            status: existing.status || parsed.status,
            remarks: existing.remarks || parsed.remarks,
            activityDate: existing.activityDate || parsed.activityDate,
            updatedAt: existing.updatedAt || parsed.updatedAt,
        };
    });
    for (let index = types_1.pbcItems.length - 1; index >= 0; index -= 1) {
        if (types_1.pbcItems[index].pbcListId === pbcListId) {
            types_1.pbcItems.splice(index, 1);
        }
    }
    types_1.pbcItems.push(...repairedItems);
}
router.get('/', auth_1.requireAuth, (req, res) => {
    const pbcListId = req.query.pbcListId ? String(req.query.pbcListId) : undefined;
    if (pbcListId) {
        repairPbcItemsIfNeeded(pbcListId);
    }
    if (req.user?.role === 'auditor') {
        const result = pbcListId ? types_1.pbcItems.filter((item) => item.pbcListId === pbcListId) : types_1.pbcItems;
        res.json(result);
        return;
    }
    const clientListIds = types_1.pbcLists.filter((item) => item.clientId === req.user?.clientId).map((item) => item.id);
    const scoped = types_1.pbcItems.filter((item) => clientListIds.includes(item.pbcListId) && (!pbcListId || item.pbcListId === pbcListId));
    res.json(scoped);
});
const bulkUpdateSchema = zod_1.z.object({
    items: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string().min(1),
        requestId: zod_1.z.string().optional(),
        description: zod_1.z.string().optional(),
        priority: zod_1.z.string().optional(),
        riskAssertion: zod_1.z.string().optional(),
        owner: zod_1.z.string().optional(),
        requestedDate: zod_1.z.string().optional(),
        dueDate: zod_1.z.string().optional(),
        status: zod_1.z.string().optional(),
        remarks: zod_1.z.string().optional(),
    })),
});
const updateStatusSchema = zod_1.z.object({
    status: zod_1.z.string().min(1),
});
const exportPbcItemsSchema = zod_1.z.object({
    pbcListId: zod_1.z.string().min(1).optional(),
    itemIds: zod_1.z.array(zod_1.z.string().min(1)).optional(),
});
router.put('/:pbcItemId/status', auth_1.requireAuth, (req, res) => {
    const parseResult = updateStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
        res.status(400).json({ message: 'Invalid status update payload.' });
        return;
    }
    const current = types_1.pbcItems.find((item) => item.id === req.params.pbcItemId);
    if (!current) {
        res.status(404).json({ message: 'PBC item not found.' });
        return;
    }
    if (req.user?.role === 'client' && current.clientId !== req.user.clientId) {
        res.status(403).json({ message: 'Forbidden.' });
        return;
    }
    current.status = parseResult.data.status;
    if (parseResult.data.status === 'Completed') {
        current.activityDate = new Date().toISOString();
    }
    current.updatedAt = new Date().toISOString();
    res.json(current);
});
router.put('/bulk', auth_1.requireAuth, (0, auth_1.requireRole)('auditor'), (req, res) => {
    const parseResult = bulkUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
        res.status(400).json({ message: 'Invalid PBC item update payload.' });
        return;
    }
    let updated = 0;
    for (const incoming of parseResult.data.items) {
        const current = types_1.pbcItems.find((item) => item.id === incoming.id);
        if (!current) {
            continue;
        }
        const previousStatus = current.status;
        current.requestId = incoming.requestId ?? current.requestId;
        current.description = incoming.description ?? current.description;
        current.riskAssertion = incoming.riskAssertion ?? current.riskAssertion;
        const inferredPriority = inferPriorityFromRiskAssertion(current.riskAssertion);
        current.priority = inferredPriority || incoming.priority || current.priority;
        current.owner = incoming.owner ?? current.owner;
        current.requestedDate = incoming.requestedDate ?? current.requestedDate;
        current.dueDate = incoming.dueDate ?? current.dueDate;
        current.status = incoming.status ?? current.status;
        if (incoming.status === 'Completed' && previousStatus !== 'Completed') {
            current.activityDate = new Date().toISOString();
        }
        current.remarks = incoming.remarks ?? current.remarks;
        current.updatedAt = new Date().toISOString();
        updated += 1;
    }
    res.json({ updatedCount: updated });
});
router.post('/export', auth_1.requireAuth, (req, res) => {
    const parseResult = exportPbcItemsSchema.safeParse(req.body ?? {});
    if (!parseResult.success) {
        res.status(400).json({ message: 'Invalid export request payload.' });
        return;
    }
    const { pbcListId, itemIds } = parseResult.data;
    let scopedItems = types_1.pbcItems;
    if (req.user?.role === 'client') {
        const clientListIds = types_1.pbcLists.filter((item) => item.clientId === req.user?.clientId).map((item) => item.id);
        scopedItems = scopedItems.filter((item) => clientListIds.includes(item.pbcListId));
    }
    if (pbcListId) {
        scopedItems = scopedItems.filter((item) => item.pbcListId === pbcListId);
    }
    if (itemIds && itemIds.length > 0) {
        const requestedIds = new Set(itemIds);
        scopedItems = scopedItems.filter((item) => requestedIds.has(item.id));
    }
    if (scopedItems.length === 0) {
        res.status(404).json({ message: 'No PBC items found to export.' });
        return;
    }
    const worksheetRows = scopedItems.map((item) => ({
        requestId: item.requestId,
        description: item.description,
        priority: item.priority,
        riskAssertion: item.riskAssertion,
        owner: item.owner,
        requestedDate: item.requestedDate,
        dueDate: item.dueDate,
        activityDate: item.activityDate,
        status: item.status,
        remarks: item.remarks,
        updatedAt: item.updatedAt,
    }));
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(worksheetRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'PBC Items');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = `pbc-items-updated-${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
});
exports.default = router;
