import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BrandHeaderComponent } from '@shared/components/brand-header/brand-header.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, BrandHeaderComponent],
  template: `
    <main class="page brand-shell">
      <app-brand-header />
      <router-outlet />
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
