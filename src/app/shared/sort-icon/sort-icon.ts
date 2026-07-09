import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-sort-icon',
  standalone: true,
  template: `<span class="tbl__arrow" [class.tbl__arrow--muted]="!active()">{{
    active() ? (dir() === 1 ? '↑' : '↓') : '↑↓'
  }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SortIcon {
  readonly active = input.required<boolean>();
  readonly dir = input<1 | -1>(1);
}
