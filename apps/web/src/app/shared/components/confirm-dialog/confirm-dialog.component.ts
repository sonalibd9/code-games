import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConfirmDialogService } from '@core/services/confirm-dialog.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (svc.active(); as dialog) {
      <div class="confirm-overlay" (click)="svc.respond(false)" role="dialog" aria-modal="true"
           [attr.aria-labelledby]="'confirm-title'" [attr.aria-describedby]="'confirm-message'">
        <div class="confirm-card" (click)="$event.stopPropagation()">
          <h2 id="confirm-title" class="confirm-title">{{ dialog.title }}</h2>
          <p id="confirm-message" class="confirm-message">{{ dialog.message }}</p>
          <div class="confirm-actions">
            <button type="button" class="confirm-btn-cancel" (click)="svc.respond(false)">
              {{ dialog.cancelLabel ?? 'Cancel' }}
            </button>
            <button type="button"
              [class]="dialog.danger ? 'confirm-btn-danger' : 'confirm-btn-confirm'"
              (click)="svc.respond(true)">
              {{ dialog.confirmLabel ?? 'Confirm' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .confirm-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      padding: 1rem;
    }
    .confirm-card {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 8px 40px rgba(0, 0, 0, 0.22);
      padding: 2rem 2.25rem;
      max-width: 420px;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      animation: confirm-in 0.18s ease;
    }
    @keyframes confirm-in {
      from { transform: scale(0.93); opacity: 0; }
      to   { transform: scale(1);    opacity: 1; }
    }
    .confirm-title {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
      color: #1a2332;
    }
    .confirm-message {
      margin: 0;
      font-size: 0.95rem;
      color: #4a5568;
      line-height: 1.5;
    }
    .confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      margin-top: 0.5rem;
    }
    .confirm-btn-cancel {
      padding: 0.5rem 1.25rem;
      border-radius: 7px;
      border: 1.5px solid #d1d5db;
      background: #fff;
      color: #374151;
      font-size: 0.9rem;
      cursor: pointer;
      transition: background 0.15s;
    }
    .confirm-btn-cancel:hover { background: #f3f4f6; }
    .confirm-btn-confirm {
      padding: 0.5rem 1.25rem;
      border-radius: 7px;
      border: none;
      background: #2563eb;
      color: #fff;
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    }
    .confirm-btn-confirm:hover { background: #1d4ed8; }
    .confirm-btn-danger {
      padding: 0.5rem 1.25rem;
      border-radius: 7px;
      border: none;
      background: #dc2626;
      color: #fff;
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    }
    .confirm-btn-danger:hover { background: #b91c1c; }
  `],
})
export class ConfirmDialogComponent {
  protected svc = inject(ConfirmDialogService);
}
