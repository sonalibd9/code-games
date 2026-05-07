# NeuAud — Audit Client Portal

Secure web portal for audit engagements where:
- Auditors define document/data requirements by client.
- Clients securely upload files against assigned requirements.
- Access is role-based (`auditor`, `client`) with JWT authentication.

## Project Structure

```
apps/
  web/          Angular 17 frontend (standalone components, lazy routes, OnPush)
    src/
      app/
        core/       Models, services, guards, utils (barrel index.ts per folder)
        shared/     Reusable components and pipes
        features/   Lazy-loaded feature modules (login, auditor, client)
      environments/ environment.ts / environment.prod.ts
  api/          Node.js + Express + TypeScript backend
scripts/        Dev startup scripts (PowerShell / CMD)
.github/
  workflows/    CI/CD pipelines (Azure App Service + Static Web Apps)
```

## Core Capabilities

- Client entity support: listed entity, subsidiary, joint venture, body corporate
- Auditor workflow:
  - Login
  - View client list
  - Create requirements per client
- Client workflow:
  - Login
  - View own requirements only
  - Upload files for own requirements only
- Security baseline:
  - JWT auth and role checks
  - CORS allow-list
  - Rate limiting
  - Helmet headers
  - Upload size limits

## Seed Users (Development)

- Auditor: `auditor@firm.com` / `Auditor@123`
- Client: `client.alpha@entity.com` / `Client@123`

## Setup

### 1) Install Node.js
This workspace requires Node.js 20+ (npm included).

### 2) Install dependencies (workspace root)

```bash
npm install
```

### 3) Configure environment

Copy and edit:
- `apps/api/.env.example` to `apps/api/.env`
- `apps/web/.env.example` to `apps/web/.env`

At minimum set a strong `JWT_SECRET` in `apps/api/.env`.

### 4) Run in development

**Option A — VS Code:** Use `Ctrl+Shift+B` (Run All task) or the Terminal panel tasks.

**Option B — Scripts:**
```powershell
# PowerShell (opens API in a new window, Web in current)
.\scripts\start-all.ps1

# Command Prompt
scripts\start-all.cmd
```

**Option C — manual terminals:**
```bash
# Terminal 1
npm run dev:api

# Terminal 2
npm run dev:web
```

Frontend (Angular): `http://localhost:3000`
Backend: `http://localhost:4000`

## API Endpoints (MVP)

- `POST /api/auth/login`
- `GET /api/clients` (auditor)
- `GET /api/requirements` (auditor/client scoped)
- `POST /api/requirements` (auditor)
- `POST /api/uploads/:requirementId` (client)
- `GET /api/uploads` (auditor)

## Important Notes

- Current data store is in-memory for MVP/demo only.
- For production: add database, encryption-at-rest storage, malware scanning, audit trail tables, SSO/MFA, and SIEM logging.
