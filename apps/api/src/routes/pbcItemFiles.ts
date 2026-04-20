import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { Router } from 'express';
import { env } from '../config/env';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { pbcItemFiles, pbcItems } from '../models/types';

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

  res.json(pbcItemFiles.filter((f) => f.pbcItemId === pbcItemId));
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
    };

    pbcItemFiles.push(record);
    item.activityDate = record.uploadedAt;
    res.status(201).json(record);
  });
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
