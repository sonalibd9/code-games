import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BrandHeaderComponent } from '@shared/components/brand-header/brand-header.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, BrandHeaderComponent, ConfirmDialogComponent],
  template: `
    <main class="page brand-shell">
      <app-brand-header />
      <router-outlet />
      <app-confirm-dialog />
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
