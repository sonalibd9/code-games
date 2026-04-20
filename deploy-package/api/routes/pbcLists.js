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
const fs_1 = __importDefault(require("fs"));
const crypto_1 = require("crypto");
const multer_1 = __importDefault(require("multer"));
const XLSX = __importStar(require("xlsx"));
const express_1 = require("express");
const env_1 = require("../config/env");
const auth_1 = require("../middleware/auth");
const types_1 = require("../models/types");
const pbcParser_1 = require("../utils/pbcParser");
const router = (0, express_1.Router)();
const allowedExtensions = new Set(['.xlsx', '.xls', '.csv']);
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, path_1.default.resolve(__dirname, '../../uploads'));
    },
    filename: (_req, file, cb) => {
        const timestamp = Date.now();
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `pbc-${timestamp}-${safeName}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: env_1.env.maxUploadBytes,
    },
    fileFilter: (_req, file, cb) => {
        const extension = path_1.default.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.has(extension)) {
            cb(new Error('Only Excel or CSV PBC files are allowed (.xlsx, .xls, .csv).'));
            return;
        }
        cb(null, true);
    },
});
router.get('/template', auth_1.requireAuth, (0, auth_1.requireRole)('auditor'), (req, res) => {
    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : '';
    const client = types_1.clients.find((item) => item.id === clientId);
    const clientName = client?.name ?? 'Client';
    const firmName = 'Audit Collaboration Hub';
    const generatedDate = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    // Build rows: 3 branding header rows + 1 blank + column headers + 1 empty data row
    const columnHeaders = [
        'Request ID',
        'Description',
        'Priority',
        'Risk / Assertion',
        'Owner',
        'Requested Date',
        'Due Date',
        'Status',
        'Remarks',
    ];
    const sheetData = [
        [firmName],
        [`Client: ${clientName}`],
        [`Generated: ${generatedDate}`],
        [],
        columnHeaders,
        Array(columnHeaders.length).fill(''),
    ];
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    // Column widths
    worksheet['!cols'] = [
        { wch: 14 }, // Request ID
        { wch: 40 }, // Description
        { wch: 12 }, // Priority
        { wch: 30 }, // Risk / Assertion
        { wch: 20 }, // Owner
        { wch: 16 }, // Requested Date
        { wch: 14 }, // Due Date
        { wch: 14 }, // Status
        { wch: 30 }, // Remarks
    ];
    // Merge cells for header rows across all columns
    const lastColIndex = columnHeaders.length - 1;
    worksheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: lastColIndex } }, // firm name
        { s: { r: 1, c: 0 }, e: { r: 1, c: lastColIndex } }, // client name
        { s: { r: 2, c: 0 }, e: { r: 2, c: lastColIndex } }, // generated date
    ];
    // Sheet name: Excel limits to 31 chars; strip invalid chars
    const sheetName = clientName.replace(/[\\/?*\[\]:]/g, '').slice(0, 31) || 'PBC List';
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const safeClientName = clientName.replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="pbc-template-${safeClientName}.xlsx"`);
    res.send(buffer);
});
router.get('/', auth_1.requireAuth, (req, res) => {
    if (req.user?.role === 'auditor') {
        res.json(types_1.pbcLists);
        return;
    }
    res.json(types_1.pbcLists.filter((item) => item.clientId === req.user?.clientId));
});
router.post('/:clientId', auth_1.requireAuth, (0, auth_1.requireRole)('auditor'), (req, res) => {
    upload.single('file')(req, res, (error) => {
        if (error instanceof Error) {
            res.status(400).json({ message: error.message });
            return;
        }
        const client = types_1.clients.find((item) => item.id === req.params.clientId);
        if (!client) {
            res.status(404).json({ message: 'Client not found.' });
            return;
        }
        if (!req.file) {
            res.status(400).json({ message: 'No PBC file uploaded. Use form-data key: file.' });
            return;
        }
        const record = {
            id: (0, crypto_1.randomUUID)(),
            clientId: client.id,
            originalName: req.file.originalname,
            storedName: req.file.filename,
            uploadedAt: new Date().toISOString(),
            uploadedByUserId: req.user?.sub ?? 'unknown',
            downloadUrl: `/uploads/${req.file.filename}`,
        };
        const parsedItems = (0, pbcParser_1.parsePbcItemsFromFile)(path_1.default.resolve(__dirname, '../../uploads', req.file.filename), record.id, client.id, record.uploadedAt);
        types_1.pbcLists.push(record);
        types_1.pbcItems.push(...parsedItems);
        res.status(201).json({ ...record, parsedItemCount: parsedItems.length });
    });
});
router.delete('/:pbcListId', auth_1.requireAuth, (0, auth_1.requireRole)('auditor'), (req, res) => {
    const pbcListIndex = types_1.pbcLists.findIndex((item) => item.id === req.params.pbcListId);
    if (pbcListIndex < 0) {
        res.status(404).json({ message: 'PBC list not found.' });
        return;
    }
    const [deletedList] = types_1.pbcLists.splice(pbcListIndex, 1);
    for (let index = types_1.pbcItems.length - 1; index >= 0; index -= 1) {
        if (types_1.pbcItems[index].pbcListId === deletedList.id) {
            types_1.pbcItems.splice(index, 1);
        }
    }
    const uploadedFilePath = path_1.default.resolve(__dirname, '../../uploads', deletedList.storedName);
    if (fs_1.default.existsSync(uploadedFilePath)) {
        fs_1.default.unlinkSync(uploadedFilePath);
    }
    res.json({ message: 'PBC list deleted successfully.' });
});
exports.default = router;
