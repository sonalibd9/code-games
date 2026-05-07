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
  requestedDate: z.string().optional(),
  dueDate: z.string().optional(),
});

function calculateRequirementDueDate(requestedDate?: string): string | undefined {
  const trimmed = requestedDate?.trim();
  if (!trimmed) {
    return undefined;
  }

  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  date.setMonth(date.getMonth() + 3);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

  const { clientId, title, description, requestedDate, dueDate } = parseResult.data;
  const clientExists = clients.some((client) => client.id === clientId);
  if (!clientExists) {
    res.status(404).json({ message: 'Client not found.' });
    return;
  }

  const effectiveRequestedDate = requestedDate?.trim()
    || (dueDate?.trim()
      ? (() => {
          const fallbackDate = new Date(`${dueDate.trim()}T00:00:00`);
          if (Number.isNaN(fallbackDate.getTime())) {
            return '';
          }
          fallbackDate.setMonth(fallbackDate.getMonth() - 3);
          const year = fallbackDate.getFullYear();
          const month = String(fallbackDate.getMonth() + 1).padStart(2, '0');
          const day = String(fallbackDate.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        })()
      : '');

  const requirement = {
    id: `r${requirements.length + 1}`,
    clientId,
    title,
    description,
    requestedDate: effectiveRequestedDate || undefined,
    dueDate: calculateRequirementDueDate(effectiveRequestedDate) ?? dueDate,
    status: 'open' as const,
  };

  requirements.push(requirement);
  res.status(201).json(requirement);
});

export default router;
