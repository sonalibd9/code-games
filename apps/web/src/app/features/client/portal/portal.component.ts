import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@core/services/auth.service';
import { PortalStateService } from '@core/services/portal-state.service';
import { ApiService } from '@core/services/api.service';
import { ConfirmDialogService } from '@core/services/confirm-dialog.service';
import { Requirement, Submission } from '@core/models/types';
import { calcPendingDays, formatDateLabel, normalizeDateForInput, getFinancialYearLabel } from '@core/utils/pbc-utils';
import { FormatDatePipe } from '@shared/pipes/format-date.pipe';
import { MetricCardComponent } from '@shared/components/metric-card/metric-card.component';

function getFinancialYearKey(req?: Requirement | null): string {
  return getFinancialYearLabel(req).toLowerCase().replace(/\s+/g, ' ').trim();
}

@Component({
  selector: 'app-portal',
  standalone: true,
  imports: [FormatDatePipe, MetricCardComponent],
  templateUrl: './portal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalComponent {
  protected auth = inject(AuthService);
  protected state = inject(PortalStateService);
  private api = inject(ApiService);
  private router = inject(Router);
  private confirmDialog = inject(ConfirmDialogService);

  uploadFile: File | null = null;
  formatDateLabel = formatDateLabel;
  normalizeDateForInput = normalizeDateForInput;

  get visibleRequirements(): Requirement[] {
    const session = this.auth.session();
    if (!session) return [];
    if (session.user.role === 'auditor') return this.state.requirements();
    return this.state.requirements().filter((r) => r.clientId === session.user.clientId);
  }

  get requirementSummary() {
    const open = this.visibleRequirements.filter((r) => r.status === 'open').length;
    const submitted = this.visibleRequirements.filter((r) => r.status === 'submitted').length;
    const overdue = this.visibleRequirements.filter((r) => {
      if (r.status === 'submitted') return false;
      const days = calcPendingDays(r.dueDate ?? '');
      return days !== null && days < 0;
    }).length;
    return { open, submitted, overdue, total: this.visibleRequirements.length };
  }

  get selectedRequirement(): Requirement | null {
    return this.visibleRequirements.find((r) => r.id === this.state.selectedRequirementId()) ?? null;
  }

  get clientTrialBalanceSubmissions(): Submission[] {
    const session = this.auth.session();
    if (!session || session.user.role !== 'client') return [];
    return this.state.submissions()
      .filter((s) => {
        const req = this.visibleRequirements.find((r) => r.id === s.requirementId);
        return req?.title.toLowerCase().includes('trial balance') ?? false;
      })
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.uploadFile = input.files?.[0] ?? null;
  }

  selectRequirement(id: string): void {
    this.state.selectedRequirementId.set(id);
  }

  async handleUpload(): Promise<void> {
    const token = this.auth.token();
    const reqId = this.state.selectedRequirementId();
    if (!token || !reqId || !this.uploadFile) {
      this.state.error.set('Please select a requirement and file.');
      return;
    }
    this.state.error.set('');
    this.state.successMessage.set('');

    const req = this.selectedRequirement;
    const isTrialBalance = req?.title.toLowerCase().includes('trial balance') ?? false;
    let replaceExisting = false;

    if (isTrialBalance) {
      const fyKey = getFinancialYearKey(req);
      const fyLabel = getFinancialYearLabel(req);
      const existingFy = this.clientTrialBalanceSubmissions.find((s) => {
        const sr = this.visibleRequirements.find((r) => r.id === s.requirementId);
        return sr ? getFinancialYearKey(sr) === fyKey : s.requirementId === reqId;
      });
      if (existingFy) {
        const shouldReplace = await this.confirmDialog.confirm({
          title: 'Replace trial balance',
          message: `A trial balance for ${fyLabel} is already uploaded as "${existingFy.originalName}". Do you want to replace it with "${this.uploadFile.name}"?`,
          confirmLabel: 'Replace',
          cancelLabel: 'Keep existing',
          danger: true,
        });
        if (!shouldReplace) {
          this.state.error.set(`Upload cancelled because a trial balance for ${fyLabel} already exists.`);
          return;
        }
        replaceExisting = true;
      }
    }

    try {
      await firstValueFrom(this.api.uploadRequirementFile(token, reqId, this.uploadFile, { replaceExistingTrialBalance: replaceExisting }));
      const updated = await firstValueFrom(this.api.fetchSubmissions(token));
      this.state.submissions.set(updated);
      this.uploadFile = null;
      this.state.successMessage.set(replaceExisting ? `Trial balance replaced successfully.` : 'Client data uploaded successfully.');
    } catch (err) {
      this.state.error.set(err instanceof Error ? err.message : 'Upload failed.');
    }
  }

  openPbcItems(): void {
    this.router.navigate(['/client/pbc-items']);
  }
}
