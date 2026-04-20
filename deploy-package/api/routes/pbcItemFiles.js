"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = require("crypto");
const multer_1 = __importDefault(require("multer"));
const express_1 = require("express");
const env_1 = require("../config/env");
const auth_1 = require("../middleware/auth");
const types_1 = require("../models/types");
const router = (0, express_1.Router)();
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, path_1.default.resolve(__dirname, '../../uploads'));
    },
    filename: (_req, file, cb) => {
        const timestamp = Date.now();
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `item-${timestamp}-${safeName}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: env_1.env.maxUploadBytes },
});
// GET /api/pbc-item-files?pbcItemId=:id  — list files for a PBC item
router.get('/', auth_1.requireAuth, (req, res) => {
    const { pbcItemId } = req.query;
    if (!pbcItemId || typeof pbcItemId !== 'string') {
        res.status(400).json({ message: 'pbcItemId query param is required.' });
        return;
    }
    const item = types_1.pbcItems.find((i) => i.id === pbcItemId);
    if (!item) {
        res.status(404).json({ message: 'PBC item not found.' });
        return;
    }
    // Auditors see everything; clients only see their own clientId
    if (req.user?.role === 'client' && item.clientId !== req.user.clientId) {
        res.status(403).json({ message: 'Forbidden.' });
        return;
    }
    res.json(types_1.pbcItemFiles.filter((f) => f.pbcItemId === pbcItemId));
});
// POST /api/pbc-item-files/:pbcItemId  — upload a file for a PBC item (client or auditor)
router.post('/:pbcItemId', auth_1.requireAuth, (req, res) => {
    upload.single('file')(req, res, (error) => {
        if (error instanceof Error) {
            res.status(400).json({ message: error.message });
            return;
        }
        const item = types_1.pbcItems.find((i) => i.id === req.params.pbcItemId);
        if (!item) {
            res.status(404).json({ message: 'PBC item not found.' });
            return;
        }
        const authReq = req;
        // Clients can only upload to their own items
        if (authReq.user?.role === 'client' && item.clientId !== authReq.user.clientId) {
            res.status(403).json({ message: 'Forbidden.' });
            return;
        }
        if (!req.file) {
            res.status(400).json({ message: 'No file uploaded. Use form-data key: file.' });
            return;
        }
        const record = {
            id: (0, crypto_1.randomUUID)(),
            pbcItemId: item.id,
            clientId: item.clientId,
            originalName: req.file.originalname,
            storedName: req.file.filename,
            uploadedAt: new Date().toISOString(),
            uploadedByUserId: authReq.user?.sub ?? 'unknown',
            downloadUrl: `/uploads/${req.file.filename}`,
        };
        types_1.pbcItemFiles.push(record);
        item.activityDate = record.uploadedAt;
        res.status(201).json(record);
    });
});
// DELETE /api/pbc-item-files/:fileId  — delete a file (auditor or the client who uploaded it)
router.delete('/:fileId', auth_1.requireAuth, (req, res) => {
    const fileIndex = types_1.pbcItemFiles.findIndex((f) => f.id === req.params.fileId);
    if (fileIndex < 0) {
        res.status(404).json({ message: 'File not found.' });
        return;
    }
    const file = types_1.pbcItemFiles[fileIndex];
    // Clients can only delete files in their own clientId
    if (req.user?.role === 'client' && file.clientId !== req.user.clientId) {
        res.status(403).json({ message: 'Forbidden.' });
        return;
    }
    types_1.pbcItemFiles.splice(fileIndex, 1);
    const filePath = path_1.default.resolve(__dirname, '../../uploads', file.storedName);
    if (fs_1.default.existsSync(filePath)) {
        fs_1.default.unlinkSync(filePath);
    }
    res.json({ message: 'File deleted.' });
});
exports.default = router;
