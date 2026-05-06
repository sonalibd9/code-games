import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { Response, Router } from 'express';
import { env } from '../config/env';
import { AuthenticatedRequest, requireAuth, requireRole } from '../middleware/auth';
import { clients, pbcItems, pbcLists, requirements, submissions } from '../models/types';
import { generateAutoPbcItemsFromTrialBalance } from '../utils/autoPbcGenerator';
import { parsePbcItemsFromFile } from '../utils/pbcParser';
import { isPbcListVisibleToClient } from '../utils/pbcVisibility';

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

  res.json(pbcLists.filter((item) => item.clientId === req.user?.clientId && isPbcListVisibleToClient(item)));
});

function handleAutoGeneratePbc(req: AuthenticatedRequest, res: Response) {
  const client = clients.find((item) => item.id === req.params.clientId);
  if (!client) {
    res.status(404).json({ message: 'Client not found.' });
    return;
  }

  const submissionId = typeof req.body?.submissionId === 'string' ? req.body.submissionId : '';
  const clientTrialBalanceSubmissions = submissions
    .filter((submission) => {
      if (submission.clientId !== client.id) {
        return false;
      }

      const requirement = requirements.find((item) => item.id === submission.requirementId);
      return requirement?.title.toLowerCase().includes('trial balance') ?? false;
    })
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

  const trialBalanceSubmission = submissionId
    ? clientTrialBalanceSubmissions.find((submission) => submission.id === submissionId)
    : clientTrialBalanceSubmissions[0];

  if (!trialBalanceSubmission) {
    res.status(404).json({ message: 'No uploaded trial balance was found for this client.' });
    return;
  }

  const trialBalancePath = path.resolve(__dirname, '../../uploads', trialBalanceSubmission.storedName);
  if (!fs.existsSync(trialBalancePath)) {
    res.status(404).json({ message: 'The uploaded trial balance file could not be found on the server.' });
    return;
  }

  const uploadedAt = new Date().toISOString();
  const existingAutoList = pbcLists.find(
    (item) =>
      item.clientId === client.id &&
      item.source === 'auto-generated' &&
      (
        item.trialBalanceSubmissionId === trialBalanceSubmission.id ||
        item.trialBalanceFileName === trialBalanceSubmission.originalName
      ),
  );
  const pbcListId = existingAutoList?.id ?? randomUUID();

  try {
    const generated = generateAutoPbcItemsFromTrialBalance(
      trialBalancePath,
      env.autoPbcTemplatePath,
      pbcListId,
      client.id,
      uploadedAt,
    );

    if (generated.items.length === 0) {
      res.status(400).json({
        message: 'No matching PBC template rows were found for the trial balance subgroups.',
        detectedSubgroups: generated.detectedSubgroups,
        unmatchedSubgroups: generated.unmatchedSubgroups,
      });
      return;
    }

    const safeClientName = client.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const storedName = `auto-pbc-${Date.now()}-${safeClientName}.xlsx`;
    const storedPath = path.resolve(__dirname, '../../uploads', storedName);
    const worksheetRows = generated.items.map((item) => ({
      'Request ID': item.requestId,
      Description: item.description,
      Priority: item.priority,
      'Risk / Assertion': item.riskAssertion,
      Owner: item.owner,
      'Requested Date': item.requestedDate,
      'Due Date': item.dueDate,
      Status: item.status,
      Remarks: item.remarks,
    }));
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(worksheetRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Auto PBC');
    XLSX.writeFile(workbook, storedPath);

    const record = {
      id: pbcListId,
      clientId: client.id,
      originalName: `Auto PBC - ${client.name} - ${uploadedAt.slice(0, 10)}.xlsx`,
      storedName,
      uploadedAt,
      uploadedByUserId: req.user?.sub ?? 'unknown',
      downloadUrl: `/uploads/${storedName}`,
      source: 'auto-generated' as const,
      approvedForClient: false,
      trialBalanceSubmissionId: trialBalanceSubmission.id,
      trialBalanceFileName: trialBalanceSubmission.originalName,
    };

    if (existingAutoList) {
      for (let index = pbcItems.length - 1; index >= 0; index -= 1) {
        if (pbcItems[index].pbcListId === existingAutoList.id) {
          pbcItems.splice(index, 1);
        }
      }

      const previousGeneratedFilePath = path.resolve(__dirname, '../../uploads', existingAutoList.storedName);
      if (fs.existsSync(previousGeneratedFilePath)) {
        fs.unlinkSync(previousGeneratedFilePath);
      }

      existingAutoList.originalName = record.originalName;
      existingAutoList.storedName = record.storedName;
      existingAutoList.uploadedAt = record.uploadedAt;
      existingAutoList.uploadedByUserId = record.uploadedByUserId;
      existingAutoList.downloadUrl = record.downloadUrl;
      existingAutoList.approvedForClient = false;
      existingAutoList.approvedAt = undefined;
      existingAutoList.approvedByUserId = undefined;
      existingAutoList.trialBalanceSubmissionId = record.trialBalanceSubmissionId;
      existingAutoList.trialBalanceFileName = record.trialBalanceFileName;
    } else {
      pbcLists.push(record);
    }

    pbcItems.push(...generated.items);

    const responseRecord = existingAutoList ?? record;

    res.status(existingAutoList ? 200 : 201).json({
      ...responseRecord,
      parsedItemCount: generated.items.length,
      trialBalanceFileName: trialBalanceSubmission.originalName,
      detectedSubgroups: generated.detectedSubgroups,
      matchedSubgroups: generated.matchedSubgroups,
      unmatchedSubgroups: generated.unmatchedSubgroups,
    });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Could not generate auto PBC list.' });
  }
}

router.post('/auto-generate/:clientId', requireAuth, requireRole('auditor'), handleAutoGeneratePbc);
router.post('/:clientId/auto-generate', requireAuth, requireRole('auditor'), handleAutoGeneratePbc);

router.put('/:pbcListId/approve', requireAuth, requireRole('auditor'), (req: AuthenticatedRequest, res) => {
  const pbcList = pbcLists.find((item) => item.id === req.params.pbcListId);
  if (!pbcList) {
    res.status(404).json({ message: 'PBC list not found.' });
    return;
  }

  if (pbcList.source !== 'auto-generated') {
    res.status(400).json({ message: 'Only auto-generated PBC lists require client approval.' });
    return;
  }

  pbcList.approvedForClient = true;
  pbcList.approvedAt = new Date().toISOString();
  pbcList.approvedByUserId = req.user?.sub ?? 'unknown';

  res.json(pbcList);
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
      source: 'uploaded' as const,
      approvedForClient: true,
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
