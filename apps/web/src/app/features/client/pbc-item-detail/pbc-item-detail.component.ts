import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@core/services/auth.service';
import { PortalStateService } from '@core/services/portal-state.service';
import { ApiService } from '@core/services/api.service';
import { PbcItemFile } from '@core/models/types';
import { FormatDatePipe } from '@shared/pipes/format-date.pipe';

@Component({
  selector: 'app-pbc-item-detail',
  standalone: true,
  imports: [FormatDatePipe],
  templateUrl: './pbc-item-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PbcItemDetailComponent {
  protected auth = inject(AuthService);
  protected state = inject(PortalStateService);
  private api = inject(ApiService);
  private router = inject(Router);

  itemFileInput: File | null = null;

  get item() { return this.state.activePbcItem(); }
  get files() { return this.state.pbcItemFiles(); }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.itemFileInput = input.files?.[0] ?? null;
  }

  async uploadFile(): Promise<void> {
    const token = this.auth.token();
    const item = this.item;
    if (!token || !item || !this.itemFileInput) {
      this.state.error.set('Please select a file.');
      return;
    }
    this.state.error.set('');
    this.state.successMessage.set('');
    try {
      await firstValueFrom(this.api.uploadPbcItemFile(token, item.id, this.itemFileInput));
      const files = await firstValueFrom(this.api.fetchPbcItemFiles(token, item.id));
      this.state.pbcItemFiles.set(files);
      this.itemFileInput = null;
      this.state.successMessage.set('File uploaded successfully.');
    } catch (err) {
      this.state.error.set(err instanceof Error ? err.message : 'Upload failed.');
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    const token = this.auth.token();
    const item = this.item;
    if (!token || !item) return;
    if (!window.confirm('Delete this file?')) return;
    this.state.error.set('');
    try {
      await firstValueFrom(this.api.deletePbcItemFile(token, fileId));
      const files = await firstValueFrom(this.api.fetchPbcItemFiles(token, item.id));
      this.state.pbcItemFiles.set(files);
    } catch (err) {
      this.state.error.set(err instanceof Error ? err.message : 'Could not delete file.');
    }
  }

  async reviewFile(fileId: string, decision: 'accepted' | 'rejected'): Promise<void> {
    const token = this.auth.token();
    const item = this.item;
    if (!token || !item || !this.auth.isAuditor()) return;
    this.state.error.set('');
    this.state.successMessage.set('');
    try {
      await firstValueFrom(this.api.reviewPbcItemFile(token, fileId, decision));
      const files = await firstValueFrom(this.api.fetchPbcItemFiles(token, item.id));
      this.state.pbcItemFiles.set(files);
      this.state.successMessage.set(decision === 'accepted' ? 'Document accepted successfully.' : 'Document rejected. Item status set to Pending.');
    } catch (err) {
      this.state.error.set(err instanceof Error ? err.message : 'Could not review document.');
    }
  }

  async updateStatus(status: string): Promise<void> {
    const token = this.auth.token();
    const item = this.item;
    if (!token || !item) return;
    this.state.error.set('');
    try {
      const updated = await firstValueFrom(this.api.updatePbcItemStatus(token, item.id, status));
      this.state.activePbcItem.set(updated);
      this.state.pbcEditorRows.update((rows) => rows.map((r) => (r.id === updated.id ? updated : r)));
      this.state.pbcAllItems.update((rows) => rows.map((r) => (r.id === updated.id ? updated : r)));
      this.state.successMessage.set('Item status updated successfully.');
    } catch (err) {
      this.state.error.set(err instanceof Error ? err.message : 'Could not update item status.');
    }
  }

  back(): void {
    if (this.auth.isClient()) {
      this.router.navigate(['/client/pbc-items']);
    } else {
      this.router.navigate(['/auditor/pbc-editor']);
    }
  }
}
