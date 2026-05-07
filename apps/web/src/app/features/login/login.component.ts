import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '@core/services/api.service';
import { AuthService } from '@core/services/auth.service';
import { PortalStateService } from '@core/services/portal-state.service';
import { NotificationStreamService } from '@core/services/notification-stream.service';
import { DEMO_CREDENTIALS } from '@core/models/constants';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private state = inject(PortalStateService);
  private stream = inject(NotificationStreamService);
  private router = inject(Router);

  email = '';
  password = '';
  error = '';
  passwordResetNotice = '';

  readonly demoCredentials = DEMO_CREDENTIALS;
  readonly auditorCredentials = DEMO_CREDENTIALS.filter((c) => c.variant === 'auditor');
  readonly clientCredentials = DEMO_CREDENTIALS.filter((c) => c.variant === 'client');

  fillDemo(cred: { email: string; password: string }): void {
    this.email = cred.email;
    this.password = cred.password;
    this.error = '';
    this.passwordResetNotice = '';
  }

  async handleLogin(): Promise<void> {
    this.error = '';
    this.passwordResetNotice = '';
    const trimmedEmail = this.email.trim();
    if (!trimmedEmail || !this.password) {
      this.error = 'Please enter your email and password.';
      return;
    }
    try {
      const loginData = await firstValueFrom(this.api.login(trimmedEmail, this.password));
      this.auth.setSession(loginData);
      await this.loadPortalData(loginData.token, loginData.user.role);
      if (loginData.user.role === 'auditor') {
        this.stream.connect(loginData.token);
        this.router.navigate(['/auditor/clients']);
      } else {
        this.router.navigate(['/client/portal']);
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Login failed.';
    }
  }

  handleForgotPassword(): void {
    this.error = '';
    const trimmedEmail = this.email.trim();
    if (!trimmedEmail) {
      this.passwordResetNotice = 'Enter your registered email first, then request a password reset.';
      return;
    }
    const demo = DEMO_CREDENTIALS.find((c) => c.email.toLowerCase() === trimmedEmail.toLowerCase());
    if (demo) {
      this.email = demo.email;
      this.password = demo.password;
      this.passwordResetNotice = `Password reset to the demo default for ${demo.label}. You can sign in now.`;
      return;
    }
    this.passwordResetNotice = `Reset request prepared for ${trimmedEmail}. Please ask your portal administrator to issue a secure reset link.`;
  }

  private async loadPortalData(token: string, role: string): Promise<void> {
    const [reqs, pbcData, pbcItemsData, submissionList] = await Promise.all([
      firstValueFrom(this.api.fetchRequirements(token)),
      firstValueFrom(this.api.fetchPbcLists(token)),
      firstValueFrom(this.api.fetchPbcItems(token)),
      firstValueFrom(this.api.fetchSubmissions(token)),
    ]);
    this.state.requirements.set(reqs);
    if (role === 'client' && reqs.length > 0) {
      this.state.selectedRequirementId.set(reqs[0].id);
    }
    this.state.pbcLists.set(pbcData);
    this.state.pbcAllItems.set(pbcItemsData);
    this.state.submissions.set(submissionList);
    if (pbcData.length > 0) {
      this.state.selectedPbcListId.set(pbcData[pbcData.length - 1].id);
    }
    if (role === 'auditor') {
      const [clientList, notificationList] = await Promise.all([
        firstValueFrom(this.api.fetchClients(token)),
        firstValueFrom(this.api.fetchNotifications(token)),
      ]);
      this.state.clients.set(clientList);
      this.state.auditorNotifications.set(notificationList);
      if (clientList.length > 0) {
        this.state.activeAuditorClientId.set(clientList[0].id);
        this.state.pbcClientId.set(clientList[0].id);
      }
    }
  }
}
