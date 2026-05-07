export const AUDIT_FINALISATION_DATES_STORAGE_KEY = 'auditFinalisationDatesByClient';

export const TECHNICAL_UPDATES_LINK =
  'https://answerconnect.cch.com/app/acr/combinable-document?nodeId=csh-da-filter!WKUS-TAL-DOCS-PHC-%7B30d62655-566c-3f42-b5a1-c23f405878f2%7D--WKUS_TAL_20329%23ARM59EB54A181BA18466525896B006159A5';

export const RECENT_TECHNICAL_UPDATES = [
  'AnswerConnect.AI experience refresh with improved research entry points',
  'Updated privacy and cookie preference controls for user sessions',
  'Expanded support/help access links and external tax resource shortcuts',
  'Current published platform build reference: Version 32.3.4',
];

export const AURI_EMOJI = '🧭';

export const AUDITOR_INSIGHTS = [
  {
    title: 'PBC Health Check',
    body: 'Focus first on overdue, high-priority, and pending-review items. These usually create the most audit delays.',
  },
  {
    title: 'Evidence Quality Tip',
    body: 'Files should clearly match the request ID or account caption. Clear filenames reduce review time and follow-up questions.',
  },
  {
    title: 'Due Date Discipline',
    body: 'High-risk items should be requested earlier than routine items so there is time for review, correction, and re-upload.',
  },
  {
    title: 'Trial Balance Reminder',
    body: 'Always reconcile the uploaded trial balance with the final signed financial statements before relying on it for audit work.',
  },
  {
    title: 'Review Priority',
    body: 'Start with documents linked to fraud risk, revenue, estimates, related parties, provisions, and going concern.',
  },
  {
    title: 'Client Follow-Up Tip',
    body: 'Group follow-ups by client and priority instead of sending separate messages for every missing file.',
  },
  {
    title: 'Documentation Standard',
    body: 'A good audit file should show what was requested, what was received, who reviewed it, and the final conclusion.',
  },
  {
    title: 'Common Delay Signal',
    body: 'Items with no upload, rejected documents, or unclear filenames are early signs of client-side blockers.',
  },
];

export const FAQ_ITEMS = [
  {
    question: 'How does the portal know whether I am an auditor or client?',
    answer:
      'Use the single sign-in form. The credentials determine the role and open the correct portal experience automatically.',
  },
  {
    question: 'Who can issue client upload access?',
    answer:
      'Auditors can issue client upload access after signing in. The request form is available inside the auditor startup area.',
  },
  {
    question: 'Where do clients upload evidence?',
    answer:
      'Clients can upload files against assigned requirements and attach supporting documents directly from PBC item detail pages.',
  },
  {
    question: 'Can clients see auditor-only tools?',
    answer:
      'No. Auditor-only areas such as Audit Desk, client provisioning, and review workflows are hidden from client users.',
  },
  {
    question: 'What does Auri help with?',
    answer:
      'Auri can answer quick questions about login, PBC uploads, item status, document review, trial balance, and notifications.',
  },
  {
    question: 'What should I do if a document is rejected?',
    answer:
      'Review the item remarks or auditor feedback, upload the corrected document, and keep the item status updated.',
  },
];

export const DEMO_CREDENTIALS = [
  { label: 'Audit lead', email: 'auditor@firm.com', password: 'Auditor@123', variant: 'auditor' },
  { label: 'Audit reviewer', email: 'auditor.reviewer@firm.com', password: 'Reviewer@123', variant: 'auditor' },
  { label: 'Alpha client', email: 'client.alpha@entity.com', password: 'Client@123', variant: 'client' },
  { label: 'Beta client', email: 'client.beta@entity.com', password: 'Client@123', variant: 'client' },
] as const;

export const DEMO_AUDITOR_CREDENTIALS = DEMO_CREDENTIALS.filter((c) => c.variant === 'auditor');
export const DEMO_CLIENT_CREDENTIALS = DEMO_CREDENTIALS.filter((c) => c.variant === 'client');

export const SUPPORT_QUICK_PROMPTS = [
  'How do I upload a PBC file?',
  'Where do I review client documents?',
  'What are the demo credentials?',
];
