import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Modal de confirmação genérico (ex.: excluir registro), estilo custom — nunca `confirm()` nativo. */
@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  templateUrl: './confirm-modal.html',
})
export class ConfirmModal {
  @Input() open = false;
  @Input() title = 'Confirmar exclusão';
  @Input() text = 'Tem certeza que deseja excluir este registro? Essa ação não pode ser desfeita.';
  @Input() confirmLabel = 'Excluir';

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  protected confirm(): void {
    this.confirmed.emit();
  }

  protected cancel(): void {
    this.cancelled.emit();
  }
}
