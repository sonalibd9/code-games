import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@core/services/auth.service';
import { PortalStateService } from '@core/services/portal-state.service';
import { ApiService } from '@core/services/api.service';
import { PbcItem } from '@core/models/types';
import { inferPriorityFromRiskAssertion, downloadBlob, validateItemAgainstFiles } from '@core/utils/pbc-utils';
import { FormatDatePipe } from '@shared/pipes/format-date.pipe';

@Component({
  selector: 'app-pbc-editor',
  standalone: true,
  imports: [FormsModule, FormatDatePipe],
  templateUrl: './pbc-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PbcEditorComponent {
  protected auth = inject(AuthService);
  protected state = inject(PortalStateService);
  private api = inject(ApiService);
  private router = inject(Router);

  get selectedList() {
    return this.state.pbcLists().find((l) => l.id === this.state.selectedPbcListId()) ?? null;
  }

  updateRow(index: number, field: keyof Pick<PbcItem, 'requestId' | 'description' | 'priority' | 'riskAssertion' | 'owner' | 'requestedDate' | 'dueDate' | 'status' | 'remarks'>, value: string): void {
    const rows = [...this.state.pbcEditorRows()];
    const row = rows[index];
    if (!row) return;
    let updated = { ...row, [field]: value };
    if (field === 'riskAssertion') {
      updated.priority = inferPriorityFromRiskAssertion(value) || row.priority;
    }
    rows[index] = updated;
    this.state.pbcEditorRows.set(rows);
    const editedId = row.id;
    if (editedId) {
      this.state.updatedPbcItemIds.update((ids) => ids.includes(editedId) ? ids : [...ids, editedId]);
    }
  }

  async savePbcEdits(): Promise<void> {
    const token = this.auth.token();
    const rows = this.state.pbcEditorRows();
    if (!token || rows.length === 0) return;
    this.state.error.set('');
    this.state.successMessage.set('');
    try {
      const result = await firstValueFrom(this.api.savePbcItems(token, rows.map((r) => ({
        id: r.id, requestId: r.requestId, description: r.description,
        priority: r.priority, riskAssertion: r.riskAssertion, owner: r.owner,
        requestedDate: r.requestedDate, dueDate: r.dueDate, status: r.status, remarks: r.remarks,
      }))));
      const updatedAll = await firstValueFrom(this.api.fetchPbcItems(token));
      this.state.pbcAllItems.set(updatedAll);
      this.state.successMessage.set(`Saved ${result.updatedCount} PBC item updates.`);
    } catch (err) {
      this.state.error.set(err instanceof Error ? err.message : 'Could not save PBC edits.');
    }
  }

  async downloadAll(): Promise<void> {
    const token = this.auth.token();
    const listId = this.state.selectedPbcListId();
    const rows = this.state.pbcEditorRows();
    if (!token || !listId || rows.length === 0) return;
    this.state.error.set('');
    try {
      const blob = await firstValueFrom(this.api.downloadUpdatedPbcItemsExcel(token, { pbcListId: listId, itemIds: rows.map((r) => r.id) }));
      downloadBlob(blob, `pbc-items-all-${new Date().toISOString().slice(0, 10)}.xlsx`);
      this.state.successMessage.set(`Downloaded all ${rows.length} PBC item(s) as Excel.`);
    } catch (err) {
      this.state.error.set(err instanceof Error ? err.message : 'Could not download all PBC items.');
    }
  }

  async downloadUpdated(): Promise<void> {
    const token = this.auth.token();
    const listId = this.state.selectedPbcListId();
    const updatedIds = this.state.updatedPbcItemIds();
    const rows = this.state.pbcEditorRows().filter((r) => updatedIds.includes(r.id));
    if (!token || !listId || rows.length === 0) {
      this.state.error.set('No updated PBC items available for download.');
      return;
    }
    this.state.error.set('');
    try {
      const blob = await firstValueFrom(this.api.downloadUpdatedPbcItemsExcel(token, { pbcListId: listId, itemIds: rows.map((r) => r.id) }));
      downloadBlob(blob, `pbc-items-updated-${new Date().toISOString().slice(0, 10)}.xlsx`);
      this.state.successMessage.set(`Downloaded ${rows.length} updated PBC item(s) as Excel.`);
    } catch (err) {
      this.state.error.set(err instanceof Error ? err.message : 'Could not download updated PBC items.');
    }
  }

  backToPbcWorkspace(): void {
    this.router.navigate(['/auditor/pbc']);
  }
}
