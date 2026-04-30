import dotenv from 'dotenv';

dotenv.config();

const maxUploadMbRaw = Number(process.env.MAX_UPLOAD_MB ?? '20');

const rawOrigins = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
export const allowedOrigins: string[] = rawOrigins
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  corsOrigin: allowedOrigins,
  maxUploadBytes: Number.isNaN(maxUploadMbRaw) ? 20 * 1024 * 1024 : maxUploadMbRaw * 1024 * 1024,
};
