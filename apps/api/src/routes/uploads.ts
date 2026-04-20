import path from 'path';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { Router } from 'express';
import { env } from '../config/env';
import { AuthenticatedRequest, requireAuth, requireRole } from '../middleware/auth';
import { Notification, clients, notifications, requirements, submissions, users } from '../models/types';
import { broadcastNotification } from './notifications';
import { getEffectiveRequirementsForClient } from '../utils/requirements';

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.resolve(__dirname, '../../uploads'));
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${timestamp}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: env.maxUploadBytes,
  },
});

router.post('/:requirementId', requireAuth, requireRole('client'), upload.single('file'), (req: AuthenticatedRequest, res) => {
  const clientId = req.user?.clientId;
  const requirement = getEffectiveRequirementsForClient(clientId ?? '').find((item) => item.id === req.params.requirementId);

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
    id: randomUUID(),
    requirementId: requirement.id,
    clientId: requirement.clientId,
    originalName: req.file.originalname,
    storedName: req.file.filename,
    uploadedAt: new Date().toISOString(),
    uploadedByUserId: req.user?.sub ?? 'unknown',
  };

  submissions.push(submission);

  const storedRequirement = requirements.find((item) => item.id === requirement.id);
  if (storedRequirement) {
    storedRequirement.status = 'submitted';
  }

  const isTrialBalance = requirement.title.toLowerCase().includes('trial balance');
  if (isTrialBalance) {
    const uploader = users.find((user) => user.id === req.user?.sub);
    const client = clients.find((item) => item.id === requirement.clientId);

    const notification: Notification = {
      id: randomUUID(),
      type: 'tb-uploaded',
      clientId: requirement.clientId,
      message: `Trial balance uploaded by ${uploader?.email ?? 'client'} for ${client?.name ?? requirement.clientId}. Requirement list can now be shared.`,
      createdAt: new Date().toISOString(),
    };

    notifications.unshift(notification);
    broadcastNotification(notification);
  }

  res.status(201).json(submission);
});

router.get('/', requireAuth, requireRole('auditor'), (_req, res) => {
  res.json(submissions);
});

export default router;
