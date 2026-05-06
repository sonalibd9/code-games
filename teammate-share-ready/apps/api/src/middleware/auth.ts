import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UserRole } from '../models/types';

export interface AuthTokenPayload {
  sub: string;
  role: UserRole;
  clientId?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Missing or invalid authorization token.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized.' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: 'Forbidden for this role.' });
      return;
    }

    next();
  };
}
