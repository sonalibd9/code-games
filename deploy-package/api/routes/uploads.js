"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const multer_1 = __importDefault(require("multer"));
const express_1 = require("express");
const env_1 = require("../config/env");
const auth_1 = require("../middleware/auth");
const types_1 = require("../models/types");
const notifications_1 = require("./notifications");
const requirements_1 = require("../utils/requirements");
const router = (0, express_1.Router)();
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, path_1.default.resolve(__dirname, '../../uploads'));
    },
    filename: (_req, file, cb) => {
        const timestamp = Date.now();
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${timestamp}-${safeName}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: env_1.env.maxUploadBytes,
    },
});
router.post('/:requirementId', auth_1.requireAuth, (0, auth_1.requireRole)('client'), upload.single('file'), (req, res) => {
    const clientId = req.user?.clientId;
    const requirement = (0, requirements_1.getEffectiveRequirementsForClient)(clientId ?? '').find((item) => item.id === req.params.requirementId);
    if (!requirement) {
        res.status(404).json({ message: 'Requirement not found.' });
        return;
    }
    if (!clientId || requirement.clientId !== clientId) {
        res.status(403).json({ message: 'You can only upload against your own requirements.' });
        return;
    }
    if (!req.file) {
        res.status(400).json({ message: 'No file uploaded. Use form-data key: file.' });
        return;
    }
    const submission = {
        id: (0, crypto_1.randomUUID)(),
        requirementId: requirement.id,
        clientId: requirement.clientId,
        originalName: req.file.originalname,
        storedName: req.file.filename,
        uploadedAt: new Date().toISOString(),
        uploadedByUserId: req.user?.sub ?? 'unknown',
    };
    types_1.submissions.push(submission);
    const storedRequirement = types_1.requirements.find((item) => item.id === requirement.id);
    if (storedRequirement) {
        storedRequirement.status = 'submitted';
    }
    const isTrialBalance = requirement.title.toLowerCase().includes('trial balance');
    if (isTrialBalance) {
        const uploader = types_1.users.find((user) => user.id === req.user?.sub);
        const client = types_1.clients.find((item) => item.id === requirement.clientId);
        const notification = {
            id: (0, crypto_1.randomUUID)(),
            type: 'tb-uploaded',
            clientId: requirement.clientId,
            message: `Trial balance uploaded by ${uploader?.email ?? 'client'} for ${client?.name ?? requirement.clientId}. Requirement list can now be shared.`,
            createdAt: new Date().toISOString(),
        };
        types_1.notifications.unshift(notification);
        (0, notifications_1.broadcastNotification)(notification);
    }
    res.status(201).json(submission);
});
router.get('/', auth_1.requireAuth, (0, auth_1.requireRole)('auditor'), (_req, res) => {
    res.json(types_1.submissions);
});
exports.default = router;
