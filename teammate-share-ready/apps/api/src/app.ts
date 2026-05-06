import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { env } from './config/env';
import authRouter from './routes/auth';
import clientsRouter from './routes/clients';
import pbcItemsRouter from './routes/pbcItems';
import pbcListsRouter from './routes/pbcLists';
import pbcItemFilesRouter from './routes/pbcItemFiles';
import requirementsRouter from './routes/requirements';
import uploadsRouter from './routes/uploads';
import notificationsRouter from './routes/notifications';

const app = express();

function isAllowedLocalDevOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:') {
      return false;
    }

    const host = parsed.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return true;
    }

    return (
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    );
  } catch {
    return false;
  }
}

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, mobile apps)
      if (!origin) {
        callback(null, true);
        return;
      }
      // Allow any ngrok tunnel domain automatically
      if (/^https:\/\/[a-z0-9-]+\.ngrok(-free)?\.app$/.test(origin) ||
          /^https:\/\/[a-z0-9-]+\.ngrok\.io$/.test(origin)) {
        callback(null, true);
        return;
      }
      // Allow explicitly listed origins from CORS_ORIGIN env var
      if (env.corsOrigin.includes(origin)) {
        callback(null, true);
        return;
      }
      if (isAllowedLocalDevOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS: origin '${origin}' is not allowed.`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(morgan('tiny'));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/pbc-items', pbcItemsRouter);
app.use('/api/pbc-lists', pbcListsRouter);
app.use('/api/pbc-item-files', pbcItemFilesRouter);
app.use('/api/requirements', requirementsRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ message: 'Unexpected server error.', detail: err.message });
});

export default app;
