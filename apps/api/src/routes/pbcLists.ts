import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { Router } from 'express';
import { env } from '../config/env';
import { AuthenticatedRequest, requireAuth, requireRole } from '../middleware/auth';
import { clients, pbcItems, pbcLists } from '../models/types';
import { parsePbcItemsFromFile } from '../utils/pbcParser';

const router = Router();

const allowedExtensions = new Set(['.xlsx', '.xls', '.csv']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.resolve(__dirname, '../../uploads'));
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `pbc-${timestamp}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: env.maxUploadBytes,
  },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      cb(new Error('Only Excel or CSV PBC files are allowed (.xlsx, .xls, .csv).'));
      return;
    }

    cb(null, true);
  },
});


router.get('/template', requireAuth, requireRole('auditor'), (req: AuthenticatedRequest, res) => {
  const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : '';
  const client = clients.find((item) => item.id === clientId);
  const clientName = client?.name ?? 'Client';
  const firmName = 'Audit Collaboration Hub';
  const generatedDate = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  // Build rows: 3 branding header rows + 1 blank + column headers + 1 empty data row
  const columnHeaders = [
    'Request ID',
    'Description',
    'Priority',
    'Risk / Assertion',
    'Owner',
    'Requested Date',
    'Due Date',
    'Status',
    'Remarks',
  ];

  const sheetData = [
    [firmName],
    [`Client: ${clientName}`],
    [`Generated: ${generatedDate}`],
    [],
    columnHeaders,
    Array(columnHeaders.length).fill(''),
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

  // Column widths
  worksheet['!cols'] = [
    { wch: 14 }, // Request ID
    { wch: 40 }, // Description
    { wch: 12 }, // Priority
    { wch: 30 }, // Risk / Assertion
    { wch: 20 }, // Owner
    { wch: 16 }, // Requested Date
    { wch: 14 }, // Due Date
    { wch: 14 }, // Status
    { wch: 30 }, // Remarks
  ];

  // Merge cells for header rows across all columns
  const lastColIndex = columnHeaders.length - 1;
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastColIndex } }, // firm name
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastColIndex } }, // client name
    { s: { r: 2, c: 0 }, e: { r: 2, c: lastColIndex } }, // generated date
  ];

  // Sheet name: Excel limits to 31 chars; strip invalid chars
  const sheetName = clientName.replace(/[\\/?*\[\]:]/g, '').slice(0, 31) || 'PBC List';
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const safeClientName = clientName.replace(/[^a-zA-Z0-9_-]/g, '_');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="pbc-template-${safeClientName}.xlsx"`);
  res.send(buffer);
});

router.get('/', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.user?.role === 'auditor') {
    res.json(pbcLists);
    return;
  }

  res.json(pbcLists.filter((item) => item.clientId === req.user?.clientId));
});

router.post('/:clientId', requireAuth, requireRole('auditor'), (req, res) => {
  upload.single('file')(req, res, (error?: unknown) => {
    if (error instanceof Error) {
      res.status(400).json({ message: error.message });
      return;
    }

    const client = clients.find((item) => item.id === req.params.clientId);
    if (!client) {
      res.status(404).json({ message: 'Client not found.' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ message: 'No PBC file uploaded. Use form-data key: file.' });
      return;
    }

    const record = {
      id: randomUUID(),
      clientId: client.id,
      originalName: req.file.originalname,
      storedName: req.file.filename,
      uploadedAt: new Date().toISOString(),
      uploadedByUserId: (req as AuthenticatedRequest).user?.sub ?? 'unknown',
      downloadUrl: `/uploads/${req.file.filename}`,
    };

    const parsedItems = parsePbcItemsFromFile(
      path.resolve(__dirname, '../../uploads', req.file.filename),
      record.id,
      client.id,
      record.uploadedAt,
    );

    pbcLists.push(record);
    pbcItems.push(...parsedItems);
    res.status(201).json({ ...record, parsedItemCount: parsedItems.length });
  });
});

router.delete('/:pbcListId', requireAuth, requireRole('auditor'), (req, res) => {
  const pbcListIndex = pbcLists.findIndex((item) => item.id === req.params.pbcListId);
  if (pbcListIndex < 0) {
    res.status(404).json({ message: 'PBC list not found.' });
    return;
  }

  const [deletedList] = pbcLists.splice(pbcListIndex, 1);

  for (let index = pbcItems.length - 1; index >= 0; index -= 1) {
    if (pbcItems[index].pbcListId === deletedList.id) {
      pbcItems.splice(index, 1);
    }
  }

  const uploadedFilePath = path.resolve(__dirname, '../../uploads', deletedList.storedName);
  if (fs.existsSync(uploadedFilePath)) {
    fs.unlinkSync(uploadedFilePath);
  }

  res.json({ message: 'PBC list deleted successfully.' });
});

export default router;