import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthenticatedRequest, AuthTokenPayload, requireAuth } from '../middleware/auth';
import { Notification, notifications } from '../models/types';

const router = Router();
const subscribers = new Map<import('express').Response, AuthTokenPayload>();

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
  for (const [res, subscriber] of subscribers) {
    if (canReadNotification(subscriber, notification)) {
      emitSse(res, 'notification', notification);
    }
  }
}

function canReadNotification(user: Pick<AuthTokenPayload, 'role' | 'clientId'>, notification: Notification): boolean {
  if (user.role === 'auditor') {
    return notification.type !== 'pbc-item-file-reviewed';
  }

  return notification.type === 'pbc-item-file-reviewed' && notification.clientId === user.clientId;
}

router.get('/', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: 'Missing or invalid authorization token.' });
    return;
  }

  res.json(notifications.filter((notification) => canReadNotification(user, notification)));
});

router.get('/stream', (req, res) => {
  const token = resolveToken(req);
  if (!token) {
    res.status(401).json({ message: 'Missing or invalid authorization token.' });
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthTokenPayload;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    emitSse(res, 'snapshot', notifications.filter((notification) => canReadNotification(payload, notification)));
    subscribers.set(res, payload);

    const heartbeatId = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeatId);
      subscribers.delete(res);
      res.end();
    });
  } catch {
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
});

export default router;
