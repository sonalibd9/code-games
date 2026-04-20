"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const types_1 = require("../models/types");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.get('/', auth_1.requireAuth, (0, auth_1.requireRole)('auditor'), (_req, res) => {
    res.json(types_1.clients);
});
exports.default = router;
