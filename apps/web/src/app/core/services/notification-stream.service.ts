import { Injectable, OnDestroy, signal } from '@angular/core';
import { ApiService } from '@core/services/api.service';
import { Notification } from '@core/models/types';
import { PortalStateService } from '@core/services/portal-state.service';

@Injectable({ providedIn: 'root' })
export class NotificationStreamService implements OnDestroy {
  private eventSource: EventSource | null = null;

  constructor(
    private api: ApiService,
    private state: PortalStateService,
  ) {}

  connect(token: string): void {
    this.disconnect();
    const url = this.api.getNotificationStreamUrl(token);
    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener('snapshot', (event: Event) => {
      const messageEvent = event as MessageEvent<string>;
      try {
        const payload = JSON.parse(messageEvent.data) as Notification[];
        this.state.auditorNotifications.set(payload);
      } catch {
        // ignore malformed SSE payloads
      }
    });

    this.eventSource.addEventListener('notification', (event: Event) => {
      const messageEvent = event as MessageEvent<string>;
      try {
        const payload = JSON.parse(messageEvent.data) as Notification;
        this.state.auditorNotifications.update((current) => [
          payload,
          ...current.filter((n) => n.id !== payload.id),
        ]);
      } catch {
        // ignore malformed SSE payloads
      }
    });
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
