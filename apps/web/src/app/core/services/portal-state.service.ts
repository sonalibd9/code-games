import { Injectable, signal, computed } from '@angular/core';
import {
  ClientEntity,
  Notification,
  PbcItem,
  PbcItemFile,
  PbcList,
  Requirement,
  Submission,
} from '../models/types';
import { AUDIT_FINALISATION_DATES_STORAGE_KEY } from '../models/constants';

function loadSavedAuditFinalisationDates(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(AUDIT_FINALISATION_DATES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, string>>((acc, [k, v]) => {
      if (typeof v === 'string') acc[k] = v;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

@Injectable({ providedIn: 'root' })
export class PortalStateService {
  // Data signals
  readonly clients = signal<ClientEntity[]>([]);
  readonly pbcLists = signal<PbcList[]>([]);
  readonly pbcAllItems = signal<PbcItem[]>([]);
  readonly requirements = signal<Requirement[]>([]);
  readonly submissions = signal<Submission[]>([]);
  readonly auditorNotifications = signal<Notification[]>([]);

  // Selection signals
  readonly activeAuditorClientId = signal<string>('');
  readonly selectedPbcListId = signal<string>('');
  readonly selectedRequirementId = signal<string>('');
  readonly pbcEditorRows = signal<PbcItem[]>([]);
  readonly updatedPbcItemIds = signal<string[]>([]);
  readonly pbcClientId = signal<string>('');

  // Item-level file state
  readonly activePbcItem = signal<PbcItem | null>(null);
  readonly activePbcListForClient = signal<PbcList | null>(null);
  readonly clientItemRows = signal<PbcItem[]>([]);
  readonly pbcItemFiles = signal<PbcItemFile[]>([]);

  // Audit finalisation dates
  readonly auditFinalisationDate = signal<string>('');
  readonly auditFinalisationDatesByClient = signal<Record<string, string>>(loadSavedAuditFinalisationDates());

  // UI state signals
  readonly isNotificationMenuOpen = signal<boolean>(false);
  readonly isAuditDeskOpen = signal<boolean>(false);
  readonly isInsightsOpen = signal<boolean>(false);
  readonly isFaqOpen = signal<boolean>(false);
  readonly isQuestionsOpen = signal<boolean>(false);
  readonly isSupportChatOpen = signal<boolean>(false);

  // Form/feedback signals
  readonly error = signal<string>('');
  readonly successMessage = signal<string>('');

  // Computed: visible pbc lists based on role + active client
  visiblePbcListsForAuditor(clientId: string): PbcList[] {
    return clientId
      ? this.pbcLists().filter((l) => l.clientId === clientId)
      : this.pbcLists();
  }

  visiblePbcListsForClient(clientId: string): PbcList[] {
    return this.pbcLists().filter(
      (l) => l.clientId === clientId && (l.source !== 'auto-generated' || l.approvedForClient),
    );
  }

  getStatusCountsForList(listId: string): { completed: number; inProgress: number; pending: number; total: number } {
    const items = this.pbcAllItems().filter((i) => i.pbcListId === listId);
    return {
      completed: items.filter((i) => i.status === 'Completed').length,
      inProgress: items.filter((i) => i.status === 'In progress').length,
      pending: items.filter((i) => i.status !== 'Completed' && i.status !== 'In progress').length,
      total: items.length,
    };
  }

  persistAuditFinalisationDates(): void {
    try {
      window.localStorage.setItem(
        AUDIT_FINALISATION_DATES_STORAGE_KEY,
        JSON.stringify(this.auditFinalisationDatesByClient()),
      );
    } catch {
      // ignore storage errors
    }
  }

  setAuditFinalisationDateForClient(clientId: string, date: string): void {
    this.auditFinalisationDatesByClient.update((current) => ({ ...current, [clientId]: date }));
    this.persistAuditFinalisationDates();
  }

  resetPortalData(): void {
    this.clients.set([]);
    this.pbcLists.set([]);
    this.pbcAllItems.set([]);
    this.requirements.set([]);
    this.submissions.set([]);
    this.auditorNotifications.set([]);
    this.error.set('');
    this.successMessage.set('');
    this.selectedPbcListId.set('');
    this.pbcEditorRows.set([]);
    this.updatedPbcItemIds.set([]);
    this.pbcClientId.set('');
    this.selectedRequirementId.set('');
    this.activeAuditorClientId.set('');
    this.auditFinalisationDate.set('');
    this.activePbcItem.set(null);
    this.activePbcListForClient.set(null);
    this.clientItemRows.set([]);
    this.pbcItemFiles.set([]);
    this.isNotificationMenuOpen.set(false);
    this.isAuditDeskOpen.set(false);
    this.isInsightsOpen.set(false);
    this.isFaqOpen.set(false);
    this.isQuestionsOpen.set(false);
    this.isSupportChatOpen.set(false);
  }
}
