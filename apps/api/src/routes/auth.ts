import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env';
import { users } from '../models/types';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post('/login', (req, res) => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ message: 'Invalid login payload.' });
    return;
  }

  const { email, password } = parseResult.data;
  const user = users.find((candidate) => candidate.email === email && candidate.password === password);

  if (!user) {
    res.status(401).json({ message: 'Invalid credentials.' });
    return;
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role, clientId: user.clientId },
    env.jwtSecret,
    { expiresIn: '8h' },
  );

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      clientId: user.clientId,
    },
  });
});

export default router;
