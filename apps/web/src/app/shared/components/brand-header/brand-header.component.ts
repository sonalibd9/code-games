import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { PortalStateService } from '@core/services/portal-state.service';
import { ConfirmDialogService } from '@core/services/confirm-dialog.service';
import { InsightsPanelComponent } from '../insights-panel/insights-panel.component';
import { FaqPanelComponent } from '../faq-panel/faq-panel.component';
import { QuestionsPanelComponent } from '../questions-panel/questions-panel.component';
import { SupportChatComponent } from '../support-chat/support-chat.component';
import { NotificationListComponent, NotificationFeedItem } from '../notification-list/notification-list.component';
import { AuditDeskPanelComponent } from '../audit-desk-panel/audit-desk-panel.component';

@Component({
  selector: 'app-brand-header',
  standalone: true,
  imports: [
    InsightsPanelComponent,
    FaqPanelComponent,
    QuestionsPanelComponent,
    SupportChatComponent,
    NotificationListComponent,
    AuditDeskPanelComponent,
  ],
  templateUrl: './brand-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandHeaderComponent {
  protected auth = inject(AuthService);
  protected state = inject(PortalStateService);
  private router = inject(Router);
  private confirmDialog = inject(ConfirmDialogService);

  get notificationFeedItems(): NotificationFeedItem[] {
    // Notification feed items are computed in the parent pages and passed via state
    // For the header we only show auditor notifications
    const session = this.auth.session();
    if (!session || session.user.role !== 'auditor') return [];
    return this.state.auditorNotifications().map((n) => ({
      id: n.id,
      title: n.fileName,
      categoryLabel: n.target.page === 'trial-balance' ? 'Trial balance' : n.target.page === 'pbc-item-detail' ? 'PBC item' : 'Requirement',
      summary: n.message,
      dateTime: n.uploadedAt,
      primaryMeta: n.clientId,
      secondaryMeta: n.uploadedByEmail,
      actionLabel: 'Open',
      onOpen: () => this.navigateToNotification(n),
    }));
  }

  get notificationCount(): number {
    return this.notificationFeedItems.length;
  }

  get notificationMenuTitle(): string {
    return this.auth.isAuditor() ? 'Client Upload Notifications' : 'Notifications';
  }

  private navigateToNotification(n: { target: { page: string; pbcListId?: string; pbcItemId?: string }; clientId: string }): void {
    this.state.isNotificationMenuOpen.set(false);
    this.state.activeAuditorClientId.set(n.clientId);
    if (n.target.page === 'trial-balance') {
      this.router.navigate(['/auditor/trial-balance']);
    } else if (n.target.page === 'pbc-item-detail') {
      this.router.navigate(['/client/pbc-item-detail']);
    } else {
      this.router.navigate(['/auditor/clients']);
    }
  }

  toggleNotificationMenu(): void {
    const current = this.state.isNotificationMenuOpen();
    this.closeAllPanels();
    this.state.isNotificationMenuOpen.set(!current);
  }

  toggleAuditDesk(): void {
    const current = this.state.isAuditDeskOpen();
    this.closeAllPanels();
    this.state.isAuditDeskOpen.set(!current);
  }

  toggleInsights(): void {
    const current = this.state.isInsightsOpen();
    this.closeAllPanels();
    this.state.isInsightsOpen.set(!current);
  }

  toggleFaq(): void {
    const current = this.state.isFaqOpen();
    this.closeAllPanels();
    this.state.isFaqOpen.set(!current);
  }

  toggleQuestions(): void {
    const current = this.state.isQuestionsOpen();
    this.closeAllPanels();
    this.state.isQuestionsOpen.set(!current);
  }

  toggleSupportChat(): void {
    const current = this.state.isSupportChatOpen();
    this.closeAllPanels();
    this.state.isSupportChatOpen.set(!current);
  }

  closeAllPanels(): void {
    this.state.isAuditDeskOpen.set(false);
    this.state.isInsightsOpen.set(false);
    this.state.isFaqOpen.set(false);
    this.state.isQuestionsOpen.set(false);
    this.state.isSupportChatOpen.set(false);
    this.state.isNotificationMenuOpen.set(false);
  }

  async handleLogout(): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'Log out',
      message: 'Are you sure you want to log out?',
      confirmLabel: 'Log out',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    this.auth.clearSession();
    this.state.resetPortalData();
    this.router.navigate(['/login']);
  }

  navigateWorkspace(): void {
    this.closeAllPanels();
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    if (this.auth.isAuditor()) {
      if (this.state.activeAuditorClientId()) {
        this.router.navigate(['/auditor/pbc']);
      } else {
        this.router.navigate(['/auditor/clients']);
      }
    } else {
      this.router.navigate(['/client/portal']);
    }
  }
}
