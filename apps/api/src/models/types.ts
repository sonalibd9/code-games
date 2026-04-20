export type EntityType = 'listed-entity' | 'subsidiary' | 'joint-venture' | 'body-corporate';
export type UserRole = 'auditor' | 'client';

export interface ClientEntity {
  id: string;
  name: string;
  entityType: EntityType;
}

export interface User {
  id: string;
  email: string;
  password: string;
  role: UserRole;
  clientId?: string;
}

export interface Requirement {
  id: string;
  clientId: string;
  title: string;
  description: string;
  dueDate?: string;
  status: 'open' | 'submitted';
}

export interface Submission {
  id: string;
  requirementId: string;
  clientId: string;
  originalName: string;
  storedName: string;
  uploadedAt: string;
  uploadedByUserId: string;
}

export interface PbcList {
  id: string;
  clientId: string;
  originalName: string;
  storedName: string;
  uploadedAt: string;
  uploadedByUserId: string;
  downloadUrl: string;
}

export interface PbcItem {
  id: string;
  pbcListId: string;
  clientId: string;
  requestId: string;
  description: string;
  priority: string;
  riskAssertion: string;
  owner: string;
  requestedDate: string;
  dueDate: string;
  activityDate: string;
  status: string;
  remarks: string;
  updatedAt: string;
}

export interface PbcItemFile {
  id: string;
  pbcItemId: string;
  clientId: string;
  originalName: string;
  storedName: string;
  uploadedAt: string;
  uploadedByUserId: string;
  downloadUrl: string;
}

export interface Notification {
  id: string;
  type: 'tb-uploaded';
  clientId: string;
  message: string;
  createdAt: string;
}

export const clients: ClientEntity[] = [
  { id: 'c1', name: 'Alpha Listed Co.', entityType: 'listed-entity' },
  { id: 'c2', name: 'Beta Subsidiary Pvt. Ltd.', entityType: 'subsidiary' },
  { id: 'c3', name: 'Gamma JV LLP', entityType: 'joint-venture' },
  { id: 'c4', name: 'Delta Body Corporate', entityType: 'body-corporate' },
];

export const users: User[] = [
  { id: 'u1', email: 'auditor@firm.com', password: 'Auditor@123', role: 'auditor' },
  { id: 'u2', email: 'client.alpha@entity.com', password: 'Client@123', role: 'client', clientId: 'c1' },
  { id: 'u3', email: 'client.beta@entity.com', password: 'Client@123', role: 'client', clientId: 'c2' },
];

export const requirements: Requirement[] = [
  {
    id: 'r1',
    clientId: 'c1',
    title: 'Trial balance for FY 2025-26',
    description: 'Upload signed trial balance with ledger mapping.',
    dueDate: '2026-04-30',
    status: 'open',
  },
];

export const submissions: Submission[] = [];

export const pbcLists: PbcList[] = [];

export const pbcItems: PbcItem[] = [];

export const pbcItemFiles: PbcItemFile[] = [];

export const notifications: Notification[] = [];
