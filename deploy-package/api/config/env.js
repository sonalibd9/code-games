"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = exports.allowedOrigins = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const maxUploadMbRaw = Number(process.env.MAX_UPLOAD_MB ?? '20');
const rawOrigins = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
exports.allowedOrigins = rawOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
exports.env = {
    port: Number(process.env.PORT ?? 4000),
    jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    corsOrigin: exports.allowedOrigins,
    maxUploadBytes: Number.isNaN(maxUploadMbRaw) ? 20 * 1024 * 1024 : maxUploadMbRaw * 1024 * 1024,
};
