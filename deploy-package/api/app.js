"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = __importDefault(require("path"));
const env_1 = require("./config/env");
const auth_1 = __importDefault(require("./routes/auth"));
const clients_1 = __importDefault(require("./routes/clients"));
const pbcItems_1 = __importDefault(require("./routes/pbcItems"));
const pbcLists_1 = __importDefault(require("./routes/pbcLists"));
const pbcItemFiles_1 = __importDefault(require("./routes/pbcItemFiles"));
const requirements_1 = __importDefault(require("./routes/requirements"));
const uploads_1 = __importDefault(require("./routes/uploads"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const app = (0, express_1.default)();
function isAllowedLocalDevOrigin(origin) {
    try {
        const parsed = new URL(origin);
        if (parsed.protocol !== 'http:') {
            return false;
        }
        const host = parsed.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
            return true;
        }
        return (host.startsWith('192.168.') ||
            host.startsWith('10.') ||
            /^172\.(1[6-9]|2\d|3[0-1])\./.test(host));
    }
    catch {
        return false;
    }
}
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. curl, mobile apps)
        if (!origin) {
            callback(null, true);
            return;
        }
        // Allow any ngrok tunnel domain automatically
        if (/^https:\/\/[a-z0-9-]+\.ngrok(-free)?\.app$/.test(origin) ||
            /^https:\/\/[a-z0-9-]+\.ngrok\.io$/.test(origin)) {
            callback(null, true);
            return;
        }
        // Allow explicitly listed origins from CORS_ORIGIN env var
        if (env_1.env.corsOrigin.includes(origin)) {
            callback(null, true);
            return;
        }
        if (isAllowedLocalDevOrigin(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`CORS: origin '${origin}' is not allowed.`));
    },
    credentials: true,
}));
app.use(express_1.default.json({ limit: '2mb' }));
app.use((0, morgan_1.default)('tiny'));
app.use((0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
}));
app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
app.use('/api/auth', auth_1.default);
app.use('/api/clients', clients_1.default);
app.use('/api/pbc-items', pbcItems_1.default);
app.use('/api/pbc-lists', pbcLists_1.default);
app.use('/api/pbc-item-files', pbcItemFiles_1.default);
app.use('/api/requirements', requirements_1.default);
app.use('/api/uploads', uploads_1.default);
app.use('/api/notifications', notifications_1.default);
app.use('/uploads', express_1.default.static(path_1.default.resolve(__dirname, '../uploads')));
app.use((err, _req, res, _next) => {
    res.status(500).json({ message: 'Unexpected server error.', detail: err.message });
});
exports.default = app;
