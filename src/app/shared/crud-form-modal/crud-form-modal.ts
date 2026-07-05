import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

export type CrudFieldType = 'text' | 'number' | 'date' | 'checkbox' | 'select';

export interface CrudField {
  key: string;
  label: string;
  type: CrudFieldType;
  options?: { value: string; label: string }[];
  step?: number;
  required?: boolean;
}

/**
 * Modal de formulário genérico, orientado por config (`fields`), reusado por
 * todas as telas CRUD do app. O `model` é um objeto de rascunho mantido pela
 * tela-mãe; o modal só lê/escreve nele via ngModel (mutação direta), a tela
 * decide o que fazer no submit (add ou update no entity-store).
 */
@Component({
  selector: 'app-crud-form-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './crud-form-modal.html',
  styleUrl: './crud-form-modal.scss',
})
export class CrudFormModal {
  @Input() open = false;
  @Input() title = '';
  @Input() fields: CrudField[] = [];
  @Input() model: Record<string, unknown> = {};

  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  protected submit(): void {
    this.saved.emit();
  }

  protected cancel(): void {
    this.cancelled.emit();
  }
}
