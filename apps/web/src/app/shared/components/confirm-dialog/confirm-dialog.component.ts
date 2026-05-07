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

          <div class="confirm-header" [class.confirm-header-danger]="dialog.danger">
            <div class="confirm-icon-wrap" [class.confirm-icon-wrap-danger]="dialog.danger">
              @if (dialog.danger) {
                <svg class="confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              } @else {
                <svg class="confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              }
            </div>
            <button type="button" class="confirm-close" aria-label="Dismiss" (click)="svc.respond(false)">&#x2715;</button>
          </div>

          <div class="confirm-body">
            <h2 id="confirm-title" class="confirm-title">{{ dialog.title }}</h2>
            <p id="confirm-message" class="confirm-message">{{ dialog.message }}</p>
          </div>

          <div class="confirm-footer">
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
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      padding: 1rem;
      animation: confirm-overlay-in 0.2s ease;
    }
    @keyframes confirm-overlay-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    .confirm-card {
      background: #ffffff;
      border-radius: 16px;
      box-shadow:
        0 32px 64px rgba(15, 23, 42, 0.28),
        0 0 0 1px rgba(203, 213, 225, 0.5);
      max-width: 440px;
      width: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: confirm-card-in 0.24s cubic-bezier(0.34, 1.45, 0.64, 1);
    }
    @keyframes confirm-card-in {
      from { transform: scale(0.88) translateY(20px); opacity: 0; }
      to   { transform: scale(1)    translateY(0);    opacity: 1; }
    }

    /* ── Header ── */
    .confirm-header {
      position: relative;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 20px 20px 16px;
      background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%);
      border-bottom: 1px solid #e2e8f0;
    }
    .confirm-header::before {
      content: "";
      position: absolute;
      inset: 0 0 auto;
      height: 3px;
      background: linear-gradient(90deg, #1d4ed8, #38bdf8 55%, #0ea5e9);
      border-radius: 16px 16px 0 0;
      pointer-events: none;
    }
    .confirm-header-danger {
      background: linear-gradient(135deg, #fff7f7 0%, #fff1f2 100%);
      border-bottom-color: #fee2e2;
    }
    .confirm-header-danger::before {
      background: linear-gradient(90deg, #dc2626, #f97316 55%, #ef4444);
    }

    /* ── Icon ── */
    .confirm-icon-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      flex-shrink: 0;
      border-radius: 12px;
      background: linear-gradient(135deg, #dbeafe, #bfdbfe);
      border: 1px solid #93c5fd;
      color: #1d4ed8;
    }
    .confirm-icon-wrap-danger {
      background: linear-gradient(135deg, #fee2e2, #fecaca);
      border-color: #fca5a5;
      color: #dc2626;
    }
    .confirm-icon {
      width: 22px;
      height: 22px;
    }

    /* ── Close button ── */
    .confirm-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      flex-shrink: 0;
      padding: 0;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #ffffff;
      color: #94a3b8;
      font-size: 13px;
      line-height: 1;
      cursor: pointer;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .confirm-close:hover { background: #f1f5f9; color: #334155; border-color: #cbd5e1; }

    /* ── Body ── */
    .confirm-body {
      padding: 20px 24px 4px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .confirm-title {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.01em;
    }
    .confirm-message {
      margin: 0;
      font-size: 0.875rem;
      color: #475569;
      line-height: 1.65;
    }

    /* ── Footer ── */
    .confirm-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 16px 24px 20px;
      background: #f8fafc;
      border-top: 1px solid #f1f5f9;
      margin-top: 12px;
    }
    .confirm-btn-cancel {
      padding: 0.5rem 1.2rem;
      border-radius: 8px;
      border: 1px solid #d1d5db;
      background: #ffffff;
      color: #374151;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      line-height: 1.4;
      transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
    }
    .confirm-btn-cancel:hover { background: #f9fafb; border-color: #9ca3af; box-shadow: 0 2px 6px rgba(0,0,0,0.06); }
    .confirm-btn-confirm {
      padding: 0.5rem 1.2rem;
      border-radius: 8px;
      border: none;
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #ffffff;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      line-height: 1.4;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.32);
      transition: box-shadow 0.15s, transform 0.12s, background 0.15s;
    }
    .confirm-btn-confirm:hover { background: linear-gradient(135deg, #1d4ed8, #1e40af); box-shadow: 0 6px 18px rgba(37, 99, 235, 0.44); transform: translateY(-1px); }
    .confirm-btn-danger {
      padding: 0.5rem 1.2rem;
      border-radius: 8px;
      border: none;
      background: linear-gradient(135deg, #dc2626, #b91c1c);
      color: #ffffff;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      line-height: 1.4;
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.32);
      transition: box-shadow 0.15s, transform 0.12s, background 0.15s;
    }
    .confirm-btn-danger:hover { background: linear-gradient(135deg, #b91c1c, #991b1b); box-shadow: 0 6px 18px rgba(220, 38, 38, 0.44); transform: translateY(-1px); }
  `],
})
export class ConfirmDialogComponent {
  protected svc = inject(ConfirmDialogService);
}
