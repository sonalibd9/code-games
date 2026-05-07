import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@core/services/auth.service';
import { PortalStateService } from '@core/services/portal-state.service';
import { ApiService } from '@core/services/api.service';
import { formatEntityType, formatDateLabel, normalizeDateForInput, calculateDueDate, inferPriorityFromRiskAssertion, downloadBlob } from '@core/utils/pbc-utils';
import { MetricCardComponent } from '@shared/components/metric-card/metric-card.component';
import { PieChartComponent } from '@shared/components/pie-chart/pie-chart.component';
import { CompletionBarComponent } from '@shared/components/completion-bar/completion-bar.component';
import { FormatDatePipe } from '@shared/pipes/format-date.pipe';

@Component({
  selector: 'app-client-select',
  standalone: true,
  imports: [FormsModule, MetricCardComponent, PieChartComponent, CompletionBarComponent, FormatDatePipe],
  templateUrl: './client-select.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientSelectComponent {
  protected auth = inject(AuthService);
  protected state = inject(PortalStateService);
  private api = inject(ApiService);
  private router = inject(Router);

  formatEntityType = formatEntityType;
  formatDateLabel = formatDateLabel;

  get activeClient() {
    return this.state.clients().find((c) => c.id === this.state.activeAuditorClientId()) ?? null;
  }

  get activeClientPbcLists() {
    return this.state.pbcLists().filter((l) => l.clientId === this.state.activeAuditorClientId());
  }

  get activeClientItems() {
    const listIds = new Set(this.activeClientPbcLists.map((l) => l.id));
    return this.state.pbcAllItems().filter((i) => listIds.has(i.pbcListId));
  }

  get pbcStatusCounts() {
    const items = this.activeClientItems;
    return {
      completed: items.filter((i) => i.status === 'Completed').length,
      inProgress: items.filter((i) => i.status === 'In progress').length,
      pending: items.filter((i) => i.status !== 'Completed' && i.status !== 'In progress').length,
      total: items.length,
    };
  }

  selectClient(clientId: string): void {
    this.state.activeAuditorClientId.set(clientId);
    this.state.pbcClientId.set(clientId);
    const saved = this.state.auditFinalisationDatesByClient()[clientId] ?? '';
    this.state.auditFinalisationDate.set(saved);
  }

  setFinalisationDate(date: string): void {
    const clientId = this.state.activeAuditorClientId();
    if (clientId) this.state.setAuditFinalisationDateForClient(clientId, date);
    this.state.auditFinalisationDate.set(date);
  }

  async continueToPbcWorkspace(): Promise<void> {
    const token = this.auth.token();
    const clientId = this.state.activeAuditorClientId();
    if (!token || !clientId) return;
    this.state.error.set('');
    try {
      await this.router.navigate(['/auditor/pbc']);
    } catch (err) {
      this.state.error.set(err instanceof Error ? err.message : 'Could not navigate to workspace.');
    }
  }

  openTrialBalance(): void {
    this.router.navigate(['/auditor/trial-balance']);
  }

  async downloadTemplate(): Promise<void> {
    const token = this.auth.token();
    if (!token) return;
    try {
      const blob = await firstValueFrom(this.api.downloadPbcTemplate(token, this.state.activeAuditorClientId() || undefined));
      const client = this.activeClient;
      const safeName = client ? client.name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'client';
      downloadBlob(blob, `pbc-template-${safeName}.xlsx`);
    } catch (err) {
      this.state.error.set(err instanceof Error ? err.message : 'Could not download PBC template.');
    }
  }
}
