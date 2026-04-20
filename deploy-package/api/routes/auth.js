"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const env_1 = require("../config/env");
const types_1 = require("../models/types");
const router = (0, express_1.Router)();
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
});
router.post('/login', (req, res) => {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
        res.status(400).json({ message: 'Invalid login payload.' });
        return;
    }
    const { email, password } = parseResult.data;
    const user = types_1.users.find((candidate) => candidate.email === email && candidate.password === password);
    if (!user) {
        res.status(401).json({ message: 'Invalid credentials.' });
        return;
    }
    const token = jsonwebtoken_1.default.sign({ sub: user.id, role: user.role, clientId: user.clientId }, env_1.env.jwtSecret, { expiresIn: '8h' });
    res.json({
        token,
        user: {
            id: user.id,
            email: user.email,
            role: user.role,
            clientId: user.clientId,
        },
    });
});
exports.default = router;
