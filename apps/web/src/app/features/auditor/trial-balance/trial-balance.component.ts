import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@core/services/auth.service';
import { PortalStateService } from '@core/services/portal-state.service';
import { ApiService } from '@core/services/api.service';
import { Submission } from '@core/models/types';
import { formatDateLabel } from '@core/utils/pbc-utils';
import { FormatDatePipe } from '@shared/pipes/format-date.pipe';

@Component({
  selector: 'app-trial-balance',
  standalone: true,
  imports: [FormatDatePipe],
  templateUrl: './trial-balance.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrialBalanceComponent {
  protected auth = inject(AuthService);
  protected state = inject(PortalStateService);
  private api = inject(ApiService);
  private router = inject(Router);

  formatDateLabel = formatDateLabel;

  get activeClientName(): string {
    return this.state.clients().find((c) => c.id === this.state.activeAuditorClientId())?.name ?? '';
  }

  get clientSubmissions(): Submission[] {
    const clientId = this.state.activeAuditorClientId();
    return this.state.submissions()
      .filter((s) => {
        const req = this.state.requirements().find((r) => r.id === s.requirementId);
        return req?.clientId === clientId && req.title.toLowerCase().includes('trial balance');
      })
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }

  async deleteSubmission(submission: Submission): Promise<void> {
    const token = this.auth.token();
    if (!token) return;
    if (!window.confirm(`Delete uploaded trial balance "${submission.originalName}"?`)) return;
    this.state.error.set('');
    try {
      await firstValueFrom(this.api.deleteSubmission(token, submission.id));
      const updated = await firstValueFrom(this.api.fetchSubmissions(token));
      this.state.submissions.set(updated);
      this.state.successMessage.set('Trial balance upload deleted successfully. You can upload the corrected file now.');
    } catch (err) {
      this.state.error.set(err instanceof Error ? err.message : 'Could not delete the trial balance upload.');
    }
  }

  back(): void {
    this.router.navigate(['/auditor/clients']);
  }
}
