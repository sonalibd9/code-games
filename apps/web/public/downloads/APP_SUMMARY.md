# Audit Client Portal - Application Summary

## Executive Summary

Audit Client Portal is a full-stack audit collaboration app for managing client requirements, trial balance uploads, detailed PBC lists, evidence collection, document review, notifications, and AI-assisted support. The app gives auditors a controlled workspace for planning and review, while clients receive a focused portal for uploading requested documents and responding to PBC items.

The current implementation is a working demo/MVP built as a monorepo with a React + TypeScript frontend and a Node.js + Express + TypeScript backend. It uses JWT authentication, role-based access, local file uploads, in-memory data stores, and Excel/CSV parsing for PBC workflows.

## Product Purpose

The app is designed to reduce common audit delays by keeping client requests, uploads, review status, due dates, and follow-up priorities in one place. It supports both structured requirement uploads and detailed PBC item workflows, including trial-balance-driven PBC generation.

Primary goals:

- Give auditors a single view of client readiness, overdue items, uploads, review queues, and PBC progress.
- Give clients a simple, scoped workspace where they can upload evidence only for their assigned entity and approved PBC lists.
- Reduce review friction with status tracking, remarks, document review outcomes, notifications, and downloadable exports.
- Add AI-style assistance through Auri, the AI document scanner, animated insights, and AI-enhanced FAQ guidance.

## Users and Roles

### Auditor

Auditors can:

- Sign in with auditor credentials.
- Select an active client workspace.
- View all clients and client entities.
- Create document/data requirements.
- Review trial balance submissions.
- Upload detailed PBC Excel/CSV lists.
- Download a PBC template.
- Auto-generate PBC lists from uploaded trial balances.
- Approve auto-generated PBC lists for client visibility.
- Edit PBC item rows in the PBC editor.
- Export updated PBC items to Excel.
- Download all PBC item files or all client-uploaded PBC evidence.
- Review uploaded PBC item files as accepted or rejected.
- Add review comments and remarks.
- Open the Audit Desk, Auditor Insights, FAQ, Auri assistant, and AI Document Scanner.
- Receive and inspect upload notifications.

### Client

Clients can:

- Sign in with client credentials.
- View only their own requirements and approved PBC lists.
- Upload files against assigned requirements.
- Upload, replace, or delete trial balance submissions where allowed.
- Open approved detailed PBC lists.
- View PBC item status, due dates, pending days, priority, owner, and review outcome.
- Upload support documents against individual PBC items.
- Edit client-visible remarks.
- Delete their own PBC item files where permitted.
- Track rejected documents and respond with corrected evidence.
- Use Auri and FAQ guidance for workflow help.

## Main Application Areas

### 1. Unified Login and Role-Based Routing

The app uses a single sign-in experience. Credentials determine whether the user enters the auditor workspace or client portal. The frontend stores the authenticated session and uses the JWT token for API requests.

Demo users include:

- Auditor: `auditor@firm.com` / `Auditor@123`
- Auditor reviewer: `auditor.reviewer@firm.com` / `Reviewer@123`
- Alpha client: `client.alpha@entity.com` / `Client@123`
- Beta client: `client.beta@entity.com` / `Client@123`

### 2. Auditor Home Workspace

The auditor home page acts as a setup and monitoring area. Auditors choose a client workspace, set audit finalisation context, review workspace metrics, inspect notifications, and open deeper workflows such as PBC management, trial balance review, and access request tooling.

Key auditor summary indicators include:

- Active client.
- PBC list count.
- PBC item completion rate.
- Overdue items.
- Due-soon items.
- Pending-review documents.
- Rejected documents.
- High-priority open items.
- Client upload notifications.

### 3. Requirement Management

Auditors can create requirements for a client with a title, description, requested date, and due date. The API supports due date calculation from requested date, including the common audit pattern of due date = requested date + 3 months.

Clients see only their own effective requirements. Requirement status changes when files are uploaded or deleted.

### 4. Trial Balance Workflow

The app treats trial balance uploads as a special requirement type. Clients upload trial balance files from their portal. The API detects trial balance requirements by title, prevents accidental duplicate uploads for the same financial year, and supports replacement confirmation.

Auditors can open a Trial Balance Submissions page to view and download client-submitted trial balance files.

### 5. Detailed PBC List Workflow

Auditors can upload detailed PBC lists in Excel or CSV format. The backend parses uploaded files into structured PBC items with fields such as:

- Request ID
- Description
- Priority
- Risk / assertion
- Owner
- Requested date
- Due date
- Activity date
- Status
- Remarks

The frontend presents PBC progress through list cards, charts, status summaries, and detailed tables.

### 6. Auto PBC Generation

Auditors can generate PBC lists from uploaded trial balance files. The backend reads trial balance data, identifies financial statement subgroups, maps those subgroups to template-driven PBC items, and writes an auto-generated Excel file.

Auto-generated PBC lists are not visible to clients immediately. Auditors must review and approve them before client access is enabled. This keeps draft PBC work under auditor control.

Auto PBC metadata can include:

- Detected trial balance subgroups.
- Matched financial captions.
- Generated item count.
- Unmatched subgroups.
- Source trial balance file.
- Approval status and approval timestamp.

### 7. PBC Editor

The PBC Editor lets auditors review and edit parsed or generated PBC items. Auditors can update row-level fields, save bulk edits, export updated items, open item detail pages, and manage auto-generated list visibility.

The editor supports:

- Bulk save of edited PBC rows.
- Updated PBC item export to Excel.
- Download all PBC items.
- Download all client-uploaded files for a selected PBC list.
- Review-status visibility per item.
- Pending days and due-date indicators.

### 8. Client PBC Workspace

Clients see approved PBC lists for their own client entity. Each list includes completion and risk indicators. Clients can open the list, inspect item details, and upload supporting files.

Client-facing PBC item information includes:

- Request ID and description.
- Priority.
- Risk/assertion.
- Owner.
- Requested date.
- Due date.
- Pending days.
- Item status.
- Document review outcome.
- Remarks.
- Upload action.

### 9. PBC Item Detail and Evidence Review

Each PBC item has a detail page where users can view metadata, upload files, and inspect uploaded documents.

Auditors can:

- Download uploaded evidence.
- Accept files.
- Reject files with comments.
- Delete files.
- Update item status.

Clients can:

- Upload evidence.
- View review status.
- See rejection context.
- Update remarks where allowed.
- Delete their own files where permitted.

Document review state is summarized at item level:

- No Document
- Pending Review
- Accepted
- Rejected

### 10. Notifications

The backend creates notifications for client uploads, including trial balance uploads, requirement uploads, and PBC item file uploads. Auditors can fetch notifications and receive live notification events through a stream endpoint.

Notifications include target metadata so the frontend can route the user to the relevant portal, trial balance, or PBC item detail page.

### 11. Auri Support Chat

Auri is the built-in support assistant. It provides contextual answers and actions based on the current session, role, active client, PBC status, overdue items, rejected documents, notifications, and selected workspace.

Auri can help with:

- Login and demo credentials.
- Upload guidance.
- PBC status summaries.
- Overdue and due-soon items.
- Rejected document follow-up.
- Pending review workflows.
- Trial balance and auto PBC guidance.
- Export/download guidance.
- Notifications.
- Filename and evidence quality tips.
- FAQ and scanner guidance.

The chat supports quick prompts, action buttons, persisted messages, copy actions, minimized/expanded states, and role-aware navigation.

### 12. AI Document Scanner

The AI Document Scanner is a frontend workflow for reading uploaded or local document images and extracting useful fields for quick review. It uses browser-side OCR support through Tesseract when available.

Scanner outputs can include fields such as:

- Client name.
- Bank name.
- Account number.
- Amount.
- Currency.
- Valid-until date.

The scanner is intended as a quick pre-review aid, not a replacement for formal audit evidence review.

### 13. Animated Auditor Insights

The Auditor Insights panel provides practical audit reminders in an animated, GIF-like format. It rotates through audit tips, highlights the active insight, shows an animated progress strip, and lets users select individual cards.

Insight topics include:

- PBC health checks.
- Evidence quality.
- Due date discipline.
- Trial balance reminders.
- Review priority.
- Client follow-up.
- Documentation standards.
- Delay signals.

### 14. AI-Enhanced FAQ Panel

The FAQ/F&Q panel has an AI-style answer spotlight. It rotates through common questions, shows an animated query/response preview, displays progress, and lets users select question cards.

FAQ topics include:

- How role detection works.
- Who can issue client upload access.
- Where clients upload evidence.
- Whether clients can see auditor-only tools.
- What Auri can help with.
- What to do when a document is rejected.

## Technical Architecture

### Monorepo Layout

```text
apps/
  api/   Node.js + Express + TypeScript backend
  web/   React + TypeScript + Vite frontend
```

Root package scripts:

- `npm run dev:web`
- `npm run dev:api`
- `npm run build`

### Frontend

Frontend stack:

- React 18
- TypeScript
- Vite
- CSS modules via a shared stylesheet
- Browser fetch API
- Local storage for persisted UI context where needed

Important frontend files:

- `apps/web/src/App.tsx`: main application state, routing, views, workflows, Auri, scanner, FAQ, insights, and PBC screens.
- `apps/web/src/api.ts`: typed API wrapper and download/upload helpers.
- `apps/web/src/types.ts`: frontend data contracts.
- `apps/web/src/styles.css`: full app styling, responsive layout, dark mode, animation, tables, panels, and workflow UI.

### Backend

Backend stack:

- Node.js
- Express
- TypeScript
- JWT authentication
- Zod validation
- Multer file uploads
- XLSX parsing/export
- Helmet, CORS, rate limiting, and Morgan logging

Important backend files:

- `apps/api/src/app.ts`: Express app, middleware, CORS rules, route registration, health endpoint.
- `apps/api/src/index.ts`: server startup.
- `apps/api/src/config/env.ts`: environment loading.
- `apps/api/src/middleware/auth.ts`: JWT verification and role checks.
- `apps/api/src/models/types.ts`: in-memory domain models and seed data.
- `apps/api/src/routes/*`: route handlers.
- `apps/api/src/utils/pbcParser.ts`: PBC file parsing.
- `apps/api/src/utils/autoPbcGenerator.ts`: trial-balance-driven PBC generation.
- `apps/api/src/utils/requirements.ts`: effective requirement generation.
- `apps/api/src/utils/pbcVisibility.ts`: client visibility rules.

## API Surface

Key API routes:

| Area | Endpoint | Purpose |
| --- | --- | --- |
| Auth | `POST /api/auth/login` | Login and receive JWT/session user |
| Clients | `GET /api/clients` | Auditor-only client list |
| Requirements | `GET /api/requirements` | Role-scoped requirement list |
| Requirements | `POST /api/requirements` | Auditor creates a requirement |
| Uploads | `POST /api/uploads/:requirementId` | Client uploads requirement file |
| Uploads | `GET /api/uploads` | Role-scoped uploads |
| Uploads | `GET /api/uploads/download/:fileName` | Auditor downloads requirement upload |
| Uploads | `DELETE /api/uploads/:submissionId` | Delete permitted trial balance uploads |
| PBC Lists | `GET /api/pbc-lists` | Role-scoped PBC lists |
| PBC Lists | `GET /api/pbc-lists/template` | Download auditor PBC template |
| PBC Lists | `POST /api/pbc-lists/:clientId` | Auditor uploads PBC list |
| PBC Lists | `POST /api/pbc-lists/auto-generate/:clientId` | Generate PBC from trial balance |
| PBC Lists | `PUT /api/pbc-lists/:pbcListId/approve` | Approve auto-generated list for client |
| PBC Lists | `DELETE /api/pbc-lists/:pbcListId` | Auditor deletes PBC list |
| PBC Items | `GET /api/pbc-items` | Role-scoped PBC items |
| PBC Items | `PUT /api/pbc-items/:pbcItemId/status` | Update item status |
| PBC Items | `PUT /api/pbc-items/:pbcItemId/remarks` | Update item remarks |
| PBC Items | `PUT /api/pbc-items/bulk` | Auditor bulk updates PBC rows |
| PBC Items | `POST /api/pbc-items/export` | Export PBC items to Excel |
| PBC Files | `GET /api/pbc-item-files` | List files for a PBC item |
| PBC Files | `POST /api/pbc-item-files/:pbcItemId` | Upload file for a PBC item |
| PBC Files | `PUT /api/pbc-item-files/:fileId/review` | Auditor accepts/rejects file |
| PBC Files | `DELETE /api/pbc-item-files/:fileId` | Delete permitted PBC item file |
| PBC Files | `GET /api/pbc-item-files/download-all` | Download all client files as ZIP |
| Notifications | `GET /api/notifications` | Auditor notification list |
| Notifications | `GET /api/notifications/stream` | Notification stream |
| FAQ | `GET /api/faqs/video` | Optional FAQ video delivery |
| Health | `GET /health` | API health check |

## Data Model Summary

Primary entities:

- `ClientEntity`: client account/entity metadata.
- `User`: user login, role, and optional client link.
- `Requirement`: high-level document/data request.
- `Submission`: uploaded file against a requirement.
- `PbcList`: uploaded or auto-generated PBC list.
- `PbcItem`: structured item parsed from a PBC list.
- `PbcItemFile`: evidence file uploaded for one PBC item.
- `Notification`: upload/review activity for auditor awareness.

Current persistence:

- Domain records are stored in in-memory arrays.
- Uploaded files are stored in `apps/api/uploads`.
- Generated/exported Excel and ZIP files are produced by the API.

## Security and Access Controls

Current security baseline:

- JWT access tokens with 8-hour expiry.
- Role checks for auditor-only and client-only actions.
- Client scoping for requirements, submissions, PBC lists, PBC items, and files.
- CORS allow-list with local development and ngrok support.
- Helmet security headers.
- Express rate limiting.
- Upload size limits.
- Server-side validation with Zod in key routes.
- Client visibility gating for auto-generated PBC lists.

Important note: demo passwords are stored in code for development only. Production should replace this with secure password hashing, database-backed users, SSO/MFA, and hardened secrets management.

## Local Development

Install dependencies:

```bash
npm install
```

Run backend:

```bash
npm run dev:api
```

Run frontend:

```bash
npm run dev:web
```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Health: `http://localhost:4000/health`

Build all workspaces:

```bash
npm run build
```

## Demo Flow

Suggested end-to-end walkthrough:

1. Sign in as an auditor.
2. Select a client workspace.
3. Create or review requirements.
4. Sign in as a client and upload a trial balance.
5. Return as auditor and review the trial balance upload.
6. Generate an auto PBC list from the trial balance.
7. Review the generated list and approve it for client access.
8. Sign in as the client and open the approved PBC list.
9. Upload evidence against a PBC item.
10. Return as auditor and review the uploaded file.
11. Accept or reject the evidence.
12. Use Auri, Auditor Insights, and FAQ to demonstrate AI-assisted guidance.

## Current Limitations

The app is suitable as a demo/MVP but not yet production hardened.

Known limitations:

- Data is stored in memory and resets when the API restarts.
- Uploaded files are stored locally rather than in durable object storage.
- Demo passwords are stored in source-controlled seed data.
- No database migrations or audit trail tables exist yet.
- No malware scanning or file content validation beyond basic upload handling.
- No SSO/MFA.
- No production logging, SIEM forwarding, or monitoring.
- AI document scanner is browser/OCR-assisted and should be treated as a review aid only.

## Recommended Production Enhancements

Before production use, add:

- Persistent database for users, clients, requirements, PBC lists, items, files, reviews, notifications, and audit logs.
- Password hashing or SSO/MFA.
- Object storage for uploaded files, with encryption at rest.
- Malware scanning and file type validation.
- Full audit trail of uploads, downloads, review decisions, status changes, and approvals.
- Role/permission administration.
- Email or Teams/Slack notification integration.
- Background jobs for parsing, scanning, and large export generation.
- Robust server-side pagination/filtering for large PBC lists.
- Formal automated test coverage for API routes and critical frontend workflows.
- Deployment-specific environment management and secrets handling.

## One-Line Positioning

Audit Client Portal is a role-based audit collaboration workspace that combines PBC automation, client evidence collection, auditor review controls, notifications, and AI-assisted guidance into one practical audit readiness portal.
