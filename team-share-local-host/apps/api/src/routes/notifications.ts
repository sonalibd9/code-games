import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthTokenPayload, requireAuth, requireRole } from '../middleware/auth';
import { Notification, notifications } from '../models/types';

const router = Router();
const subscribers = new Set<import('express').Response>();

function emitSse(res: import('express').Response, eventName: string, payload: unknown): void {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function resolveToken(req: import('express').Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length);
  }

  const tokenFromQuery = typeof req.query.token === 'string' ? req.query.token : undefined;
  return tokenFromQuery ?? null;
}

export function broadcastNotification(notification: Notification): void {
  for (const res of subscribers) {
    emitSse(res, 'notification', notification);
  }
}

router.get('/', requireAuth, requireRole('auditor'), (_req, res) => {
  res.json(notifications);
});

router.get('/stream', (req, res) => {
  const token = resolveToken(req);
  if (!token) {
    res.status(401).json({ message: 'Missing or invalid authorization token.' });
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
    if (payload.role !== 'auditor') {
      res.status(403).json({ message: 'Forbidden for this role.' });
      return;
    }
  } catch {
    res.status(401).json({ message: 'Invalid or expired token.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  emitSse(res, 'snapshot', notifications);
  subscribers.add(res);

  const heartbeatId = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeatId);
    subscribers.delete(res);
    res.end();
  });
});

export default router;
