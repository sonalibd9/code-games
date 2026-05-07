import { Pipe, PipeTransform } from '@angular/core';
import { formatDateLabel } from '@core/utils/pbc-utils';

@Pipe({
  name: 'formatDate',
  standalone: true,
})
export class FormatDatePipe implements PipeTransform {
  transform(value?: string): string {
    return formatDateLabel(value);
  }
}
