# WK Audit Portal - FAB Sandbox Deployment Package

## Contents
- frontend/   ? Static web app (HTML/CSS/JS) — serve from any static host
- api/        ? Node.js Express API (compiled JS)

## Deploying the API
1. cd api
2. npm install --production
3. Set environment variables (see below)
4. node index.js

## Environment Variables Required (API)
- PORT=3000
- JWT_SECRET=<your-secret>
- CORS_ORIGIN=<frontend-url>

## Deploying the Frontend
- Upload the contents of frontend/ to your static web host
- Update the API base URL in the app if needed (currently reads from VITE_API_URL at build time)
