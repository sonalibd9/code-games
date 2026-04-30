import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { Router } from 'express';
import { env } from '../config/env';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { Notification, notifications, pbcItemFiles, pbcItems, users } from '../models/types';
import { broadcastNotification } from './notifications';
import { z } from 'zod';

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.resolve(__dirname, '../../uploads'));
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `item-${timestamp}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.maxUploadBytes },
});

const reviewSchema = z.object({
  decision: z.enum(['accepted', 'rejected']),
});

// GET /api/pbc-item-files?pbcItemId=:id  — list files for a PBC item
router.get('/', requireAuth, (req: AuthenticatedRequest, res) => {
  const { pbcItemId } = req.query;
  if (!pbcItemId || typeof pbcItemId !== 'string') {
    res.status(400).json({ message: 'pbcItemId query param is required.' });
    return;
  }

  const item = pbcItems.find((i) => i.id === pbcItemId);
  if (!item) {
    res.status(404).json({ message: 'PBC item not found.' });
    return;
  }

  // Auditors see everything; clients only see their own clientId
  if (req.user?.role === 'client' && item.clientId !== req.user.clientId) {
    res.status(403).json({ message: 'Forbidden.' });
    return;
  }

  res.json(
    pbcItemFiles
      .filter((f) => f.pbcItemId === pbcItemId)
      .map((file) => ({
        ...file,
        reviewStatus: file.reviewStatus ?? 'pending-review',
      })),
  );
});

// POST /api/pbc-item-files/:pbcItemId  — upload a file for a PBC item (client or auditor)
router.post('/:pbcItemId', requireAuth, (req, res) => {
  upload.single('file')(req, res, (error?: unknown) => {
    if (error instanceof Error) {
      res.status(400).json({ message: error.message });
      return;
    }

    const item = pbcItems.find((i) => i.id === req.params.pbcItemId);
    if (!item) {
      res.status(404).json({ message: 'PBC item not found.' });
      return;
    }

    const authReq = req as AuthenticatedRequest;

    // Clients can only upload to their own items
    if (authReq.user?.role === 'client' && item.clientId !== authReq.user.clientId) {
      res.status(403).json({ message: 'Forbidden.' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ message: 'No file uploaded. Use form-data key: file.' });
      return;
    }

    const record = {
      id: randomUUID(),
      pbcItemId: item.id,
      clientId: item.clientId,
      originalName: req.file.originalname,
      storedName: req.file.filename,
      uploadedAt: new Date().toISOString(),
      uploadedByUserId: authReq.user?.sub ?? 'unknown',
      downloadUrl: `/uploads/${req.file.filename}`,
      reviewStatus: 'pending-review' as const,
    };

    pbcItemFiles.push(record);
    item.activityDate = record.uploadedAt;

    if (authReq.user?.role === 'client') {
      const uploader = users.find((user) => user.id === authReq.user?.sub);
      const notification: Notification = {
        id: randomUUID(),
        type: 'pbc-item-file-uploaded',
        clientId: item.clientId,
        message: `${uploader?.email ?? 'client'} uploaded "${record.originalName}" for PBC item ${item.requestId}.`,
        createdAt: record.uploadedAt,
        uploadedAt: record.uploadedAt,
        uploadedByUserId: record.uploadedByUserId,
        uploadedByEmail: uploader?.email ?? 'client',
        fileName: record.originalName,
        pbcListId: item.pbcListId,
        pbcItemId: item.id,
        itemRequestId: item.requestId,
        itemDescription: item.description,
        target: {
          page: 'pbc-item-detail',
          pbcListId: item.pbcListId,
          pbcItemId: item.id,
        },
      };

      notifications.unshift(notification);
      broadcastNotification(notification);
    }

    res.status(201).json(record);
  });
});

router.put('/:fileId/review', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== 'auditor') {
    res.status(403).json({ message: 'Only auditors can review uploaded files.' });
    return;
  }

  const parseResult = reviewSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ message: 'Invalid review payload.' });
    return;
  }

  const file = pbcItemFiles.find((entry) => entry.id === req.params.fileId);
  if (!file) {
    res.status(404).json({ message: 'File not found.' });
    return;
  }

  const reviewedAt = new Date().toISOString();
  file.reviewStatus = parseResult.data.decision;
  file.reviewedAt = reviewedAt;
  file.reviewedByUserId = req.user.sub;

  const relatedItem = pbcItems.find((item) => item.id === file.pbcItemId);
  if (relatedItem && parseResult.data.decision === 'rejected') {
    relatedItem.status = 'Pending';
    relatedItem.updatedAt = reviewedAt;
  }

  res.json(file);
});

// DELETE /api/pbc-item-files/:fileId  — delete a file (auditor or the client who uploaded it)
router.delete('/:fileId', requireAuth, (req: AuthenticatedRequest, res) => {
  const fileIndex = pbcItemFiles.findIndex((f) => f.id === req.params.fileId);
  if (fileIndex < 0) {
    res.status(404).json({ message: 'File not found.' });
    return;
  }

  const file = pbcItemFiles[fileIndex];

  // Clients can only delete files in their own clientId
  if (req.user?.role === 'client' && file.clientId !== req.user.clientId) {
    res.status(403).json({ message: 'Forbidden.' });
    return;
  }

  pbcItemFiles.splice(fileIndex, 1);

  const filePath = path.resolve(__dirname, '../../uploads', file.storedName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  res.json({ message: 'File deleted.' });
});

export default router;
