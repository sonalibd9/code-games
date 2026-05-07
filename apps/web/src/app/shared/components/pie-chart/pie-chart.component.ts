import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';

interface PieSlice {
  len: number;
  offset: number;
  color: string;
  label: string;
}

@Component({
  selector: 'app-pie-chart',
  standalone: true,
  template: `
    <div class="pie-chart-wrap">
      <div class="pie-chart-ring">
        <svg width="120" height="120" viewBox="0 0 120 120" style="transform:rotate(-90deg);display:block">
          <circle [attr.cx]="cx" [attr.cy]="cy" [attr.r]="r" fill="none" stroke="#e5e7eb" stroke-width="16" />
          @if (total === 0) {
            <circle [attr.cx]="cx" [attr.cy]="cy" [attr.r]="r" fill="none" stroke="#d1d5db" stroke-width="16"
              [attr.stroke-dasharray]="circumference + ' 0'" />
          } @else {
            @for (s of slices; track s.label) {
              @if (s.len > 0) {
                <circle [attr.cx]="cx" [attr.cy]="cy" [attr.r]="r" fill="none"
                  [attr.stroke]="s.color" stroke-width="16"
                  [attr.stroke-dasharray]="s.len + ' ' + (circumference - s.len)"
                  [attr.stroke-dashoffset]="s.offset" />
              }
            }
          }
        </svg>
        <div class="pie-chart-center">
          <span class="pie-chart-total">{{ total }}</span>
          <span class="pie-chart-label">items</span>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PieChartComponent implements OnChanges {
  @Input() completed = 0;
  @Input() inProgress = 0;
  @Input() pending = 0;

  readonly r = 40;
  readonly cx = 60;
  readonly cy = 60;
  get circumference(): number { return 2 * Math.PI * this.r; }
  total = 0;
  slices: PieSlice[] = [];

  ngOnChanges(): void {
    this.total = this.completed + this.inProgress + this.pending;
    const C = this.circumference;
    this.slices = [
      { len: this.total > 0 ? (this.completed / this.total) * C : 0, offset: C, color: '#69be28', label: 'Completed' },
      { len: this.total > 0 ? (this.inProgress / this.total) * C : 0, offset: this.total > 0 ? C - (this.completed / this.total) * C : C, color: '#f59e0b', label: 'In progress' },
      { len: this.total > 0 ? (this.pending / this.total) * C : 0, offset: this.total > 0 ? C - ((this.completed + this.inProgress) / this.total) * C : C, color: '#dc2626', label: 'Pending' },
    ];
  }
}
