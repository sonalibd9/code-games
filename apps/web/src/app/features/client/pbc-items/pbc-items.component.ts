import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@core/services/auth.service';
import { PortalStateService } from '@core/services/portal-state.service';
import { ApiService } from '@core/services/api.service';
import { PbcItem, PbcList } from '@core/models/types';
import { FormatDatePipe } from '@shared/pipes/format-date.pipe';

@Component({
  selector: 'app-pbc-items',
  standalone: true,
  imports: [FormatDatePipe],
  templateUrl: './pbc-items.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PbcItemsComponent {
  protected auth = inject(AuthService);
  protected state = inject(PortalStateService);
  private api = inject(ApiService);
  private router = inject(Router);

  get visiblePbcLists(): PbcList[] {
    const session = this.auth.session();
    if (!session) return [];
    return this.state.pbcLists().filter(
      (l) => l.clientId === session.user.clientId && (l.source !== 'auto-generated' || l.approvedForClient),
    );
  }

  getItemsForList(listId: string): PbcItem[] {
    return this.state.pbcAllItems().filter((i) => i.pbcListId === listId);
  }

  async openItemDetail(item: PbcItem): Promise<void> {
    const token = this.auth.token();
    if (!token) return;
    this.state.activePbcItem.set(item);
    this.state.error.set('');
    try {
      const files = await firstValueFrom(this.api.fetchPbcItemFiles(token, item.id));
      this.state.pbcItemFiles.set(files);
    } catch {
      this.state.pbcItemFiles.set([]);
    }
    this.router.navigate(['/client/pbc-item-detail']);
  }

  back(): void {
    this.router.navigate(['/client/portal']);
  }
}
