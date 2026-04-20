"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastNotification = broadcastNotification;
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const auth_1 = require("../middleware/auth");
const types_1 = require("../models/types");
const router = (0, express_1.Router)();
const subscribers = new Set();
function emitSse(res, eventName, payload) {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
}
function resolveToken(req) {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
        return header.slice('Bearer '.length);
    }
    const tokenFromQuery = typeof req.query.token === 'string' ? req.query.token : undefined;
    return tokenFromQuery ?? null;
}
function broadcastNotification(notification) {
    for (const res of subscribers) {
        emitSse(res, 'notification', notification);
    }
}
router.get('/', auth_1.requireAuth, (0, auth_1.requireRole)('auditor'), (_req, res) => {
    res.json(types_1.notifications);
});
router.get('/stream', (req, res) => {
    const token = resolveToken(req);
    if (!token) {
        res.status(401).json({ message: 'Missing or invalid authorization token.' });
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
        if (payload.role !== 'auditor') {
            res.status(403).json({ message: 'Forbidden for this role.' });
            return;
        }
    }
    catch {
        res.status(401).json({ message: 'Invalid or expired token.' });
        return;
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    emitSse(res, 'snapshot', types_1.notifications);
    subscribers.add(res);
    const heartbeatId = setInterval(() => {
        res.write(': keepalive\n\n');
    }, 25000);
    req.on('close', () => {
        clearInterval(heartbeatId);
        subscribers.delete(res);
        res.end();
    });
});
exports.default = router;
