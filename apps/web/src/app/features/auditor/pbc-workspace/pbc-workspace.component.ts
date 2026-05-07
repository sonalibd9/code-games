import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@core/services/auth.service';
import { PortalStateService } from '@core/services/portal-state.service';
import { ApiService } from '@core/services/api.service';
import { ConfirmDialogService } from '@core/services/confirm-dialog.service';
import { PbcList } from '@core/models/types';
import { formatDateLabel, normalizeDateForInput, calculateDueDate, inferPriorityFromRiskAssertion, downloadBlob } from '@core/utils/pbc-utils';
import { FormatDatePipe } from '@shared/pipes/format-date.pipe';
import { PieChartComponent } from '@shared/components/pie-chart/pie-chart.component';

@Component({
  selector: 'app-pbc-workspace',
  standalone: true,
  imports: [FormsModule, FormatDatePipe, PieChartComponent],
  templateUrl: './pbc-workspace.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PbcWorkspaceComponent {
  protected auth = inject(AuthService);
  protected state = inject(PortalStateService);
  private api = inject(ApiService);
  private router = inject(Router);
  private confirmDialog = inject(ConfirmDialogService);

  pbcFile: File | null = null;
  formatDateLabel = formatDateLabel;

  get activeClientPbcLists(): PbcList[] {
    return this.state.pbcLists().filter((l) => l.clientId === this.state.activeAuditorClientId());
  }

  get activeClientName(): string {
    return this.state.clients().find((c) => c.id === this.state.activeAuditorClientId())?.name ?? '';
  }

  getStatusCounts(listId: string) {
    return this.state.getStatusCountsForList(listId);
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.pbcFile = input.files?.[0] ?? null;
  }

  async uploadPbcList(): Promise<void> {
    const token = this.auth.token();
    const clientId = this.state.activeAuditorClientId();
    if (!token || !clientId || !this.pbcFile) {
      this.state.error.set('Please select a client and choose an Excel or CSV PBC file.');
      return;
    }
    this.state.error.set('');
    this.state.successMessage.set('');
    try {
      const uploaded = await firstValueFrom(this.api.uploadPbcList(token, clientId, this.pbcFile));
      await this.reloadData(token);
      this.state.selectedPbcListId.set(uploaded.id);
      this.pbcFile = null;
      this.state.successMessage.set(`Detailed PBC list uploaded successfully. Parsed ${uploaded.parsedItemCount ?? 0} rows.`);
    } catch (err) {
      this.state.error.set(err instanceof Error ? err.message : 'Could not upload the detailed PBC list.');
    }
  }

  async generateAutoPbc(): Promise<void> {
    const token = this.auth.token();
    const clientId = this.state.activeAuditorClientId();
    if (!token || !clientId) {
      this.state.error.set('Please select a client before generating an auto PBC list.');
      return;
    }
    this.state.error.set('');
    this.state.successMessage.set('');
    try {
      const generated = await firstValueFrom(this.api.generateAutoPbcList(token, clientId));
      await this.reloadData(token);
      this.state.selectedPbcListId.set(generated.id);
      this.state.successMessage.set(`Auto PBC generated with ${generated.parsedItemCount ?? 0} item(s). It remains hidden from the client until you approve it.`);
    } catch (err) {
      this.state.error.set(err instanceof Error ? err.message : 'Could not generate auto PBC list from trial balance.');
    }
  }

  async deletePbcList(listId: string): Promise<void> {
    const token = this.auth.token();
    if (!token) return;
    const confirmed = await this.confirmDialog.confirm({
      title: 'Delete PBC list',
      message: 'Delete this uploaded PBC list? This will also remove all its parsed items.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      danger: true,
    });
    if (!confirmed) return;
    this.state.error.set('');
    try {
      await firstValueFrom(this.api.deletePbcList(token, listId));
      await this.reloadData(token);
      if (this.state.selectedPbcListId() === listId) {
        this.state.selectedPbcListId.set('');
        this.state.pbcEditorRows.set([]);
      }
      this.state.successMessage.set('Detailed PBC list deleted successfully.');
    } catch (err) {
      this.state.error.set(err instanceof Error ? err.message : 'Could not delete PBC list.');
    }
  }

  async approvePbcList(listId: string): Promise<void> {
    const token = this.auth.token();
    if (!token) return;
    this.state.error.set('');
    try {
      const approved = await firstValueFrom(this.api.approvePbcList(token, listId));
      this.state.pbcLists.update((lists) => lists.map((l) => (l.id === approved.id ? approved : l)));
      this.state.successMessage.set('Auto PBC approved for client access.');
    } catch (err) {
      this.state.error.set(err instanceof Error ? err.message : 'Could not approve this PBC list for the client.');
    }
  }

  async openPbcEditor(listId: string): Promise<void> {
    const token = this.auth.token();
    if (!token) return;
    this.state.selectedPbcListId.set(listId);
    this.state.error.set('');
    try {
      const rows = await firstValueFrom(this.api.fetchPbcItems(token, listId));
      this.state.pbcEditorRows.set(rows);
      this.router.navigate(['/auditor/pbc-editor']);
    } catch (err) {
      this.state.error.set(err instanceof Error ? err.message : 'Could not load PBC editor data.');
    }
  }

  backToClients(): void {
    this.router.navigate(['/auditor/clients']);
  }

  private async reloadData(token: string): Promise<void> {
    const [pbcData, pbcItemsData] = await Promise.all([
      firstValueFrom(this.api.fetchPbcLists(token)),
      firstValueFrom(this.api.fetchPbcItems(token)),
    ]);
    this.state.pbcLists.set(pbcData);
    this.state.pbcAllItems.set(pbcItemsData);
  }
}
