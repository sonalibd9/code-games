import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { requirements, clients } from '../models/types';
import { getEffectiveRequirementsForAuditor, getEffectiveRequirementsForClient } from '../utils/requirements';

const router = Router();

const createRequirementSchema = z.object({
  clientId: z.string().min(1),
  title: z.string().min(3),
  description: z.string().min(3),
  dueDate: z.string().optional(),
});

router.get('/', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.user?.role === 'auditor') {
    res.json(getEffectiveRequirementsForAuditor());
    return;
  }

  const clientRequirements = getEffectiveRequirementsForClient(req.user?.clientId ?? '');
  res.json(clientRequirements);
});

router.post('/', requireAuth, requireRole('auditor'), (req, res) => {
  const parseResult = createRequirementSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ message: 'Invalid requirement payload.' });
    return;
  }

  const { clientId, title, description, dueDate } = parseResult.data;
  const clientExists = clients.some((client) => client.id === clientId);
  if (!clientExists) {
    res.status(404).json({ message: 'Client not found.' });
    return;
  }

  const requirement = {
    id: `r${requirements.length + 1}`,
    clientId,
    title,
    description,
    dueDate,
    status: 'open' as const,
  };

  requirements.push(requirement);
  res.status(201).json(requirement);
});

export default router;
