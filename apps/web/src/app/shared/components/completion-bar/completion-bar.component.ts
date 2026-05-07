import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-completion-bar',
  standalone: true,
  template: `
    <div class="completion-bar" [attr.aria-label]="percentage + '% complete'">
      <span class="completion-bar-fill" [style.width]="percentage + '%'"></span>
      <span class="completion-bar-label">{{ percentage }}% complete</span>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompletionBarComponent {
  @Input() completed = 0;
  @Input() total = 0;

  get percentage(): number {
    return this.total > 0 ? Math.round((this.completed / this.total) * 100) : 0;
  }
}
