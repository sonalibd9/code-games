import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PortalStateService } from '@core/services/portal-state.service';
import { formatDateLabel } from '@core/utils/pbc-utils';
import { AuthService } from '@core/services/auth.service';

@Component({
  selector: 'app-audit-desk-panel',
  standalone: true,
  template: `
    @if (isOpen) {
      <aside class="audit-desk-panel" role="dialog" aria-label="Audit Desk">
        <div class="audit-desk-header">
          <div>
            <span class="audit-desk-eyebrow">Audit Desk</span>
            <h3>Today's audit priorities</h3>
          </div>
          <button type="button" class="audit-desk-close" aria-label="Close Audit Desk" (click)="closed.emit()">X</button>
        </div>
        <div class="audit-desk-content">
          <section class="audit-desk-snapshot">
            <div>
              <span class="audit-desk-label">Client snapshot</span>
              <strong>{{ activeClientName }}</strong>
              <p>{{ activeClientType }}</p>
            </div>
            <div class="audit-desk-snapshot-grid">
              <span>PBC lists <strong>{{ pbcListCount }}</strong></span>
              <span>Open items <strong>{{ openItemCount }}</strong></span>
            </div>
          </section>
          <section class="audit-desk-section">
            <div class="audit-desk-section-heading">
              <h4>Quick Actions</h4>
              <span>Jump to common audit tasks</span>
            </div>
            <div class="audit-desk-actions">
              <button type="button" (click)="navigateWorkspace()">Open Workspace</button>
              <button type="button" class="secondary" [disabled]="!state.activeAuditorClientId()" (click)="navigatePbc()">Upload PBC List</button>
              <button type="button" class="secondary" [disabled]="!state.selectedPbcListId()" (click)="navigateEditor()">Open PBC Editor</button>
              <button type="button" class="secondary" [disabled]="!state.activeAuditorClientId()" (click)="navigateTrialBalance()">View Trial Balance</button>
            </div>
          </section>
        </div>
      </aside>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditDeskPanelComponent {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();

  protected state = inject(PortalStateService);
  private router = inject(Router);

  get activeClientName(): string {
    const id = this.state.activeAuditorClientId();
    return this.state.clients().find((c) => c.id === id)?.name ?? 'No client selected';
  }

  get activeClientType(): string {
    const id = this.state.activeAuditorClientId();
    const client = this.state.clients().find((c) => c.id === id);
    if (!client) return 'Client workspace';
    const labels: Record<string, string> = { 'listed-entity': 'Listed entity', 'subsidiary': 'Subsidiary', 'joint-venture': 'Joint venture', 'body-corporate': 'Body corporate' };
    return labels[client.entityType] ?? client.entityType;
  }

  get pbcListCount(): number {
    const clientId = this.state.activeAuditorClientId();
    return this.state.pbcLists().filter((l) => l.clientId === clientId).length;
  }

  get openItemCount(): number {
    return this.state.pbcAllItems().filter((i) => i.status !== 'Completed').length;
  }

  navigateWorkspace(): void { this.closed.emit(); this.router.navigate(['/auditor/clients']); }
  navigatePbc(): void { this.closed.emit(); this.router.navigate(['/auditor/pbc']); }
  navigateEditor(): void { this.closed.emit(); this.router.navigate(['/auditor/pbc-editor']); }
  navigateTrialBalance(): void { this.closed.emit(); this.router.navigate(['/auditor/trial-balance']); }
}
