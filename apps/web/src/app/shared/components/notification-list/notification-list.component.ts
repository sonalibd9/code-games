import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { formatDateLabel } from '@core/utils/pbc-utils';

export interface NotificationFeedItem {
  id: string;
  title: string;
  categoryLabel: string;
  summary: string;
  dateTime: string;
  primaryMeta: string;
  secondaryMeta: string;
  actionLabel: string;
  onOpen: () => void;
}

@Component({
  selector: 'app-notification-list',
  standalone: true,
  template: `
    @if (items.length === 0) {
      <p class="muted">No notifications yet.</p>
    } @else {
      <ul [class]="'notification-list notification-list-' + variant">
        @for (item of items; track item.id) {
          <li class="notification-item">
            <div class="notification-item-main">
              <div class="notification-item-content">
                <div class="notification-item-top">
                  <div class="notification-title-block">
                    <div class="notification-title-row">
                      <strong class="notification-file-name">{{ item.title }}</strong>
                      <span class="notification-type">{{ item.categoryLabel }}</span>
                    </div>
                    <p class="notification-item-message">{{ item.summary }}</p>
                  </div>
                  <time class="notification-item-time" [attr.dateTime]="item.dateTime">
                    {{ formatTime(item.dateTime) }}
                  </time>
                </div>
                <div class="notification-item-bottom">
                  <div class="notification-item-meta" aria-label="Notification details">
                    <span>{{ item.primaryMeta }}</span>
                    <span>{{ item.secondaryMeta }}</span>
                  </div>
                  <button type="button" class="notification-link" (click)="item.onOpen()">
                    {{ item.actionLabel }}
                  </button>
                </div>
              </div>
            </div>
          </li>
        }
      </ul>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationListComponent {
  @Input() items: NotificationFeedItem[] = [];
  @Input() variant: 'panel' | 'menu' = 'panel';

  formatTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
}
