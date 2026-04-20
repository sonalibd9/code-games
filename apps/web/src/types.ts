export type EntityType = 'listed-entity' | 'subsidiary' | 'joint-venture' | 'body-corporate';
export type UserRole = 'auditor' | 'client';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  clientId?: string;
}

export interface ClientEntity {
  id: string;
  name: string;
  entityType: EntityType;
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
  parsedItemCount?: number;
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
