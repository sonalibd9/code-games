import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter } from '@angular/core';
import { FAQ_ITEMS } from '@core/models/constants';

@Component({
  selector: 'app-faq-panel',
  standalone: true,
  template: `
    @if (isOpen) {
      <aside class="faq-panel" role="dialog" aria-label="Frequently asked questions">
        <div class="faq-panel-header">
          <div>
            <span class="faq-eyebrow">F&amp;Q</span>
            <h3>Quick answers</h3>
          </div>
          <button type="button" class="faq-close" aria-label="Close F&Q" (click)="closed.emit()">X</button>
        </div>
        <div class="faq-intro">
          <strong>Find the right path faster.</strong>
          <p>Short answers for sign-in, client access, uploads, Auri, and role visibility.</p>
        </div>
        <div class="faq-list">
          @for (item of faqItems; track item.question) {
            <article class="faq-item">
              <h4>{{ item.question }}</h4>
              <p>{{ item.answer }}</p>
            </article>
          }
        </div>
      </aside>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FaqPanelComponent {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();
  readonly faqItems = FAQ_ITEMS;
}
