import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { Router } from 'express';
import { env } from '../config/env';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { Notification, notifications, pbcItemFiles, pbcItems, pbcLists, users } from '../models/types';
import { isPbcListVisibleToClient } from '../utils/pbcVisibility';
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
  reviewComment: z.string().optional(),
});

const downloadAllSchema = z.object({
  pbcListId: z.string().min(1),
});

const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[index] = value >>> 0;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date = new Date()): { date: number; time: number } {
  const year = Math.max(date.getFullYear(), 1980);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  return { date: dosDate, time: dosTime };
}

function sanitizeArchiveName(value: string): string {
  return value
    .replace(/[<>:"\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'file';
}

function createZipArchive(entries: Array<{ archiveName: string; content: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const { date, time } = getDosDateTime();

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.archiveName.replace(/\\/g, '/'));
    const checksum = crc32(entry.content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(entry.content.length, 18);
    localHeader.writeUInt32LE(entry.content.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, entry.content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(entry.content.length, 20);
    centralHeader.writeUInt32LE(entry.content.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + entry.content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

function canClientAccessPbcItem(pbcItemId: string, clientId?: string): boolean {
  const item = pbcItems.find((entry) => entry.id === pbcItemId);
  if (!item || item.clientId !== clientId) {
    return false;
  }

  const list = pbcLists.find((entry) => entry.id === item.pbcListId);
  return isPbcListVisibleToClient(list);
}

// GET /api/pbc-item-files?pbcItemId=:id  — list files for a PBC item
function getItemReviewStatus(pbcItemId: string): 'pending-review' | 'accepted' | 'rejected' {
  const files = pbcItemFiles.filter((entry) => entry.pbcItemId === pbcItemId);
  if (files.length === 0) {
    return 'pending-review';
  }

  const statuses = files.map((entry) => entry.reviewStatus ?? 'pending-review');
  if (statuses.some((status) => status === 'rejected')) {
    return 'rejected';
  }

  if (statuses.every((status) => status === 'accepted')) {
    return 'accepted';
  }

  return 'pending-review';
}

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
  if (req.user?.role === 'client' && !canClientAccessPbcItem(item.id, req.user.clientId)) {
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

// GET /api/pbc-item-files/download-all?pbcListId=:id - download all client uploads for a PBC list
router.get('/download-all', requireAuth, (req: AuthenticatedRequest, res) => {
  const parseResult = downloadAllSchema.safeParse(req.query);
  if (!parseResult.success) {
    res.status(400).json({ message: 'pbcListId query param is required.' });
    return;
  }

  const list = pbcLists.find((entry) => entry.id === parseResult.data.pbcListId);
  if (!list) {
    res.status(404).json({ message: 'PBC list not found.' });
    return;
  }

  if (req.user?.role === 'client' && (list.clientId !== req.user.clientId || !isPbcListVisibleToClient(list))) {
    res.status(403).json({ message: 'Forbidden.' });
    return;
  }

  const listItems = pbcItems.filter((item) => item.pbcListId === list.id);
  const listItemIds = new Set(listItems.map((item) => item.id));
  const itemsById = new Map(listItems.map((item) => [item.id, item]));
  const clientUserIds = new Set(users.filter((user) => user.role === 'client').map((user) => user.id));
  const seenArchiveNames = new Set<string>();

  const entries = pbcItemFiles
    .filter((file) => listItemIds.has(file.pbcItemId) && clientUserIds.has(file.uploadedByUserId))
    .flatMap((file, index) => {
      const filePath = path.resolve(__dirname, '../../uploads', file.storedName);
      if (!fs.existsSync(filePath)) {
        return [];
      }

      const item = itemsById.get(file.pbcItemId);
      const itemLabel = sanitizeArchiveName(
        `${item?.requestId ?? 'PBC Item'} - ${item?.description ?? 'Uploaded files'}`,
      );
      const fileLabel = sanitizeArchiveName(file.originalName);
      let archiveName = `${String(index + 1).padStart(3, '0')} - ${itemLabel}/${fileLabel}`;
      let duplicateIndex = 2;

      while (seenArchiveNames.has(archiveName.toLowerCase())) {
        const extension = path.extname(fileLabel);
        const baseName = extension ? fileLabel.slice(0, -extension.length) : fileLabel;
        archiveName = `${String(index + 1).padStart(3, '0')} - ${itemLabel}/${baseName} (${duplicateIndex})${extension}`;
        duplicateIndex += 1;
      }

      seenArchiveNames.add(archiveName.toLowerCase());
      return [{ archiveName, content: fs.readFileSync(filePath) }];
    });

  if (entries.length === 0) {
    res.status(404).json({ message: 'No client-uploaded PBC files found for this list.' });
    return;
  }

  const safeListName = sanitizeArchiveName(list.originalName.replace(/\.[^.]+$/, ''));
  const zipBuffer = createZipArchive(entries);

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="pbc-client-files-${safeListName}.zip"`);
  res.send(zipBuffer);
});

// POST /api/pbc-item-files/:pbcItemId - upload a file for a PBC item (client or auditor)
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
    if (authReq.user?.role === 'client' && !canClientAccessPbcItem(item.id, authReq.user.clientId)) {
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
    if (authReq.user?.role === 'client' && item.status === 'Pending') {
      item.status = 'In progress';
    }
    item.updatedAt = record.uploadedAt;

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
        itemDueDate: item.dueDate,
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
  file.reviewComment = parseResult.data.decision === 'rejected' ? (parseResult.data.reviewComment ?? '').trim() : '';
  file.reviewedAt = reviewedAt;
  file.reviewedByUserId = req.user.sub;

  const relatedItem = pbcItems.find((item) => item.id === file.pbcItemId);
  if (relatedItem) {
    const itemReviewStatus = getItemReviewStatus(relatedItem.id);

    if (itemReviewStatus === 'accepted') {
      relatedItem.status = 'Completed';
      relatedItem.activityDate = reviewedAt;
    } else if (itemReviewStatus === 'rejected') {
      relatedItem.status = 'Pending';
    } else if (relatedItem.status === 'Pending') {
      relatedItem.status = 'In progress';
    }

    relatedItem.updatedAt = reviewedAt;

    const reviewer = users.find((user) => user.id === req.user?.sub);
    const uploader = users.find((user) => user.id === file.uploadedByUserId);
    const decisionLabel = parseResult.data.decision === 'accepted' ? 'accepted' : 'rejected';
    const notification: Notification = {
      id: randomUUID(),
      type: 'pbc-item-file-reviewed',
      clientId: relatedItem.clientId,
      message: `Auditor ${decisionLabel} "${file.originalName}" for PBC item ${relatedItem.requestId}.`,
      createdAt: reviewedAt,
      uploadedAt: reviewedAt,
      uploadedByUserId: file.uploadedByUserId,
      uploadedByEmail: uploader?.email ?? 'client',
      fileName: file.originalName,
      pbcListId: relatedItem.pbcListId,
      pbcItemId: relatedItem.id,
      itemDueDate: relatedItem.dueDate,
      itemRequestId: relatedItem.requestId,
      itemDescription: relatedItem.description,
      reviewStatus: parseResult.data.decision,
      reviewComment: file.reviewComment,
      reviewedAt,
      reviewedByUserId: req.user.sub,
      reviewedByEmail: reviewer?.email ?? 'auditor',
      target: {
        page: 'pbc-item-detail',
        pbcListId: relatedItem.pbcListId,
        pbcItemId: relatedItem.id,
      },
    };

    notifications.unshift(notification);
    broadcastNotification(notification);
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
  if (req.user?.role === 'client' && (file.clientId !== req.user.clientId || !canClientAccessPbcItem(file.pbcItemId, req.user.clientId))) {
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
