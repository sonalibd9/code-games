import fs from 'fs';
import os from 'os';
import path from 'path';
import { Router } from 'express';

const router = Router();

const FAQ_VIDEO_FILE_NAME = 'Document Intelligence Overview (1).mp4';

function resolveFaqVideoPath(): string {
  const configuredPath = process.env.FAQ_VIDEO_PATH?.trim();
  if (configuredPath) {
    return configuredPath;
  }

  return path.resolve(os.homedir(), 'Downloads', FAQ_VIDEO_FILE_NAME);
}

router.get('/video', (_req, res) => {
  const filePath = resolveFaqVideoPath();

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ message: 'FAQ video not found on server.', filePath });
    return;
  }

  const fileStat = fs.statSync(filePath);
  const fileSize = fileStat.size;
  const rangeHeader = _req.headers.range;

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'no-store');

  if (rangeHeader) {
    const rangeMatch = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (!rangeMatch) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }

    const requestedStart = rangeMatch[1] ? Number(rangeMatch[1]) : 0;
    const requestedEnd = rangeMatch[2] ? Number(rangeMatch[2]) : fileSize - 1;

    if (
      Number.isNaN(requestedStart) ||
      Number.isNaN(requestedEnd) ||
      requestedStart < 0 ||
      requestedStart > requestedEnd ||
      requestedStart >= fileSize
    ) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }

    const end = Math.min(requestedEnd, fileSize - 1);
    const chunkSize = end - requestedStart + 1;

    res.status(206);
    res.setHeader('Content-Range', `bytes ${requestedStart}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunkSize);

    fs.createReadStream(filePath, { start: requestedStart, end }).pipe(res);
    return;
  }

  res.setHeader('Content-Length', fileSize);
  fs.createReadStream(filePath).pipe(res);
});

export default router;
