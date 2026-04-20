import path from 'path';
import { Router } from 'express';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { AuthenticatedRequest, requireAuth, requireRole } from '../middleware/auth';
import { pbcItems, pbcLists } from '../models/types';
import { parsePbcItemsFromFile } from '../utils/pbcParser';

const router = Router();

function inferPriorityFromRiskAssertion(value: string): string {
  const text = (value ?? '').trim().toLowerCase();
  if (!text) {
    return '';
  }

  const highSignals = [
    'fraud',
    'material',
    'going concern',
    'impairment',
    'significant risk',
    'revenue recognition',
    'litigation',
    'related party',
    'override',
  ];

  const mediumSignals = [
    'valuation',
    'estimate',
    'cut-off',
    'cutoff',
    'accuracy',
    'completeness',
    'classification',
    'presentation',
    'disclosure',
    'provision',
    'tax',
  ];

  if (highSignals.some((signal) => text.includes(signal))) {
    return 'High';
  }

  if (mediumSignals.some((signal) => text.includes(signal))) {
    return 'Medium';
  }

  return 'Low';
}

function isInvalidDueDate(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }

  return /^\d+$/.test(trimmed) && Number(trimmed) < 10000;
}

function repairPbcItemsIfNeeded(pbcListId: string): void {
  const currentItems = pbcItems.filter((item) => item.pbcListId === pbcListId);
  if (currentItems.length === 0) {
    return;
  }

  const invalidDueDateCount = currentItems.filter((item) => isInvalidDueDate(item.dueDate)).length;
  if (invalidDueDateCount !== currentItems.length) {
    return;
  }

  const list = pbcLists.find((item) => item.id === pbcListId);
  if (!list) {
    return;
  }

  const parsedItems = parsePbcItemsFromFile(path.resolve(__dirname, '../../uploads', list.storedName), list.id, list.clientId);
  if (parsedItems.length === 0) {
    return;
  }

  const preservedEdits = new Map(currentItems.map((item) => [item.requestId, item]));
  const repairedItems = parsedItems.map((parsed) => {
    const existing = preservedEdits.get(parsed.requestId);
    if (!existing) {
      return parsed;
    }

    return {
      ...parsed,
      riskAssertion: existing.riskAssertion || parsed.riskAssertion,
      status: existing.status || parsed.status,
      remarks: existing.remarks || parsed.remarks,
      activityDate: existing.activityDate || parsed.activityDate,
      updatedAt: existing.updatedAt || parsed.updatedAt,
    };
  });

  for (let index = pbcItems.length - 1; index >= 0; index -= 1) {
    if (pbcItems[index].pbcListId === pbcListId) {
      pbcItems.splice(index, 1);
    }
  }

  pbcItems.push(...repairedItems);
}

router.get('/', requireAuth, (req: AuthenticatedRequest, res) => {
  const pbcListId = req.query.pbcListId ? String(req.query.pbcListId) : undefined;

  if (pbcListId) {
    repairPbcItemsIfNeeded(pbcListId);
  }

  if (req.user?.role === 'auditor') {
    const result = pbcListId ? pbcItems.filter((item) => item.pbcListId === pbcListId) : pbcItems;
    res.json(result);
    return;
  }

  const clientListIds = pbcLists.filter((item) => item.clientId === req.user?.clientId).map((item) => item.id);
  const scoped = pbcItems.filter(
    (item) => clientListIds.includes(item.pbcListId) && (!pbcListId || item.pbcListId === pbcListId),
  );

  res.json(scoped);
});

const bulkUpdateSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      requestId: z.string().optional(),
      description: z.string().optional(),
      priority: z.string().optional(),
      riskAssertion: z.string().optional(),
      owner: z.string().optional(),
      requestedDate: z.string().optional(),
      dueDate: z.string().optional(),
      status: z.string().optional(),
      remarks: z.string().optional(),
    }),
  ),
});

const updateStatusSchema = z.object({
  status: z.string().min(1),
});

const exportPbcItemsSchema = z.object({
  pbcListId: z.string().min(1).optional(),
  itemIds: z.array(z.string().min(1)).optional(),
});

router.put('/:pbcItemId/status', requireAuth, (req: AuthenticatedRequest, res) => {
  const parseResult = updateStatusSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ message: 'Invalid status update payload.' });
    return;
  }

  const current = pbcItems.find((item) => item.id === req.params.pbcItemId);
  if (!current) {
    res.status(404).json({ message: 'PBC item not found.' });
    return;
  }

  if (req.user?.role === 'client' && current.clientId !== req.user.clientId) {
    res.status(403).json({ message: 'Forbidden.' });
    return;
  }

  current.status = parseResult.data.status;
  if (parseResult.data.status === 'Completed') {
    current.activityDate = new Date().toISOString();
  }
  current.updatedAt = new Date().toISOString();

  res.json(current);
});

router.put('/bulk', requireAuth, requireRole('auditor'), (req, res) => {
  const parseResult = bulkUpdateSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ message: 'Invalid PBC item update payload.' });
    return;
  }

  let updated = 0;

  for (const incoming of parseResult.data.items) {
    const current = pbcItems.find((item) => item.id === incoming.id);
    if (!current) {
      continue;
    }

    const previousStatus = current.status;

    current.requestId = incoming.requestId ?? current.requestId;
    current.description = incoming.description ?? current.description;
    current.riskAssertion = incoming.riskAssertion ?? current.riskAssertion;
    const inferredPriority = inferPriorityFromRiskAssertion(current.riskAssertion);
    current.priority = inferredPriority || incoming.priority || current.priority;
    current.owner = incoming.owner ?? current.owner;
    current.requestedDate = incoming.requestedDate ?? current.requestedDate;
    current.dueDate = incoming.dueDate ?? current.dueDate;
    current.status = incoming.status ?? current.status;
    if (incoming.status === 'Completed' && previousStatus !== 'Completed') {
      current.activityDate = new Date().toISOString();
    }
    current.remarks = incoming.remarks ?? current.remarks;
    current.updatedAt = new Date().toISOString();
    updated += 1;
  }

  res.json({ updatedCount: updated });
});

router.post('/export', requireAuth, (req: AuthenticatedRequest, res) => {
  const parseResult = exportPbcItemsSchema.safeParse(req.body ?? {});
  if (!parseResult.success) {
    res.status(400).json({ message: 'Invalid export request payload.' });
    return;
  }

  const { pbcListId, itemIds } = parseResult.data;

  let scopedItems = pbcItems;

  if (req.user?.role === 'client') {
    const clientListIds = pbcLists.filter((item) => item.clientId === req.user?.clientId).map((item) => item.id);
    scopedItems = scopedItems.filter((item) => clientListIds.includes(item.pbcListId));
  }

  if (pbcListId) {
    scopedItems = scopedItems.filter((item) => item.pbcListId === pbcListId);
  }

  if (itemIds && itemIds.length > 0) {
    const requestedIds = new Set(itemIds);
    scopedItems = scopedItems.filter((item) => requestedIds.has(item.id));
  }

  if (scopedItems.length === 0) {
    res.status(404).json({ message: 'No PBC items found to export.' });
    return;
  }

  const worksheetRows = scopedItems.map((item) => ({
    requestId: item.requestId,
    description: item.description,
    priority: item.priority,
    riskAssertion: item.riskAssertion,
    owner: item.owner,
    requestedDate: item.requestedDate,
    dueDate: item.dueDate,
    activityDate: item.activityDate,
    status: item.status,
    remarks: item.remarks,
    updatedAt: item.updatedAt,
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(worksheetRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'PBC Items');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const filename = `pbc-items-updated-${Date.now()}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

export default router;