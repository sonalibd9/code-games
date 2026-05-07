import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

type MetricTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

@Component({
  selector: 'app-metric-card',
  standalone: true,
  template: `
    <div [class]="'metric-card metric-card-' + tone">
      <span class="metric-label">{{ label }}</span>
      <strong class="metric-value">{{ value }}</strong>
      @if (detail) {
        <span class="metric-detail">{{ detail }}</span>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetricCardComponent {
  @Input() label = '';
  @Input() value: string | number = '';
  @Input() detail?: string;
  @Input() tone: MetricTone = 'neutral';
}
