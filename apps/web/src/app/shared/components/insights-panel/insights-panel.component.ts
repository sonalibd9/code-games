import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter } from '@angular/core';
import { AUDITOR_INSIGHTS } from '@core/models/constants';

@Component({
  selector: 'app-insights-panel',
  standalone: true,
  template: `
    @if (isOpen) {
      <aside class="insights-panel" role="dialog" aria-label="Auditor insights">
        <div class="insights-panel-header">
          <div>
            <span class="insights-eyebrow">Auditor Insights</span>
            <h3>Practical audit reminders</h3>
          </div>
          <button type="button" class="insights-close" aria-label="Close auditor insights" (click)="closed.emit()">X</button>
        </div>
        <div class="insights-spotlight">
          <span>Auditor Tip</span>
          <strong>Start with items that can block the close.</strong>
          <p>Overdue, high-risk, rejected, and pending-review items deserve the first pass each morning.</p>
        </div>
        <div class="insights-grid" aria-label="Basic auditor knowledge">
          @for (insight of insights; track insight.title) {
            <article class="insight-card">
              <h4>{{ insight.title }}</h4>
              <p>{{ insight.body }}</p>
            </article>
          }
        </div>
      </aside>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InsightsPanelComponent {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();
  readonly insights = AUDITOR_INSIGHTS;
}
