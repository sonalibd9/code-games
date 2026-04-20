"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const types_1 = require("../models/types");
const requirements_1 = require("../utils/requirements");
const router = (0, express_1.Router)();
const createRequirementSchema = zod_1.z.object({
    clientId: zod_1.z.string().min(1),
    title: zod_1.z.string().min(3),
    description: zod_1.z.string().min(3),
    dueDate: zod_1.z.string().optional(),
});
router.get('/', auth_1.requireAuth, (req, res) => {
    if (req.user?.role === 'auditor') {
        res.json((0, requirements_1.getEffectiveRequirementsForAuditor)());
        return;
    }
    const clientRequirements = (0, requirements_1.getEffectiveRequirementsForClient)(req.user?.clientId ?? '');
    res.json(clientRequirements);
});
router.post('/', auth_1.requireAuth, (0, auth_1.requireRole)('auditor'), (req, res) => {
    const parseResult = createRequirementSchema.safeParse(req.body);
    if (!parseResult.success) {
        res.status(400).json({ message: 'Invalid requirement payload.' });
        return;
    }
    const { clientId, title, description, dueDate } = parseResult.data;
    const clientExists = types_1.clients.some((client) => client.id === clientId);
    if (!clientExists) {
        res.status(404).json({ message: 'Client not found.' });
        return;
    }
    const requirement = {
        id: `r${types_1.requirements.length + 1}`,
        clientId,
        title,
        description,
        dueDate,
        status: 'open',
    };
    types_1.requirements.push(requirement);
    res.status(201).json(requirement);
});
exports.default = router;
