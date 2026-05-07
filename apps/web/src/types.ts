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
  requestedDate?: string;
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
  source: 'uploaded' | 'auto-generated';
  approvedForClient: boolean;
  approvedAt?: string;
  approvedByUserId?: string;
  parsedItemCount?: number;
  trialBalanceFileName?: string;
  detectedSubgroups?: string[];
  matchedSubgroups?: Array<{
    subgroup: string;
    financialCaption: string;
    itemCount: number;
  }>;
  unmatchedSubgroups?: string[];
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
  documentReviewStatus?: 'No Document' | 'Pending Review' | 'Accepted' | 'Rejected';
  documentReviewedAt?: string;
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
  reviewStatus: 'pending-review' | 'accepted' | 'rejected';
  reviewComment?: string;
  reviewedAt?: string;
  reviewedByUserId?: string;
}

export type NotificationType = 'trial-balance-uploaded' | 'requirement-uploaded' | 'pbc-item-file-uploaded';

export interface NotificationTarget {
  page: 'trial-balance' | 'portal' | 'pbc-item-detail';
  requirementId?: string;
  pbcListId?: string;
  pbcItemId?: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  clientId: string;
  message: string;
  createdAt: string;
  uploadedAt: string;
  uploadedByUserId: string;
  uploadedByEmail: string;
  fileName: string;
  requirementId?: string;
  requirementTitle?: string;
  pbcListId?: string;
  pbcItemId?: string;
  itemDueDate?: string;
  itemRequestId?: string;
  itemDescription?: string;
  target: NotificationTarget;
}
