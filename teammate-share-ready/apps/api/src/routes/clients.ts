import { Router } from 'express';
import { clients } from '../models/types';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, requireRole('auditor'), (_req, res) => {
  res.json(clients);
});

export default router;
