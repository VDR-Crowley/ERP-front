import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';

export type CrudFieldType = 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'autocomplete';

export interface CrudField {
  key: string;
  label: string;
  type: CrudFieldType;
  options?: { value: string; label: string }[];
  step?: number;
  required?: boolean;
  /**
   * Opcional: deriva o valor do campo a partir de outros campos do model
   * (ex.: valor total = quantidade × valor unitário). Enquanto retornar um
   * número, o campo fica somente leitura e o resultado é gravado no model;
   * se retornar `undefined` (dependências não preenchidas), o campo volta a
   * ser editável normalmente, preservando compatibilidade com registros que
   * não usam esse cálculo.
   */
  compute?: (model: Record<string, unknown>) => number | undefined;
  /**
   * Só para type 'autocomplete': disparado quando o valor digitado bate
   * exatamente com uma das `options` (ex.: usuário escolheu um produto
   * cadastrado). Permite preencher outros campos do model (ex.: preço
   * unitário) a partir da opção escolhida. Texto que não bate com nenhuma
   * opção é mantido como está (fallback livre) e o callback não dispara.
   */
  onSelect?: (option: { value: string; label: string }, model: Record<string, unknown>) => void;
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
export class CrudFormModal implements OnChanges {
  @Input() open = false;
  @Input() title = '';
  @Input() fields: CrudField[] = [];
  @Input() model: Record<string, unknown> = {};
  /** Nota fixa exibida abaixo dos campos (ex.: explicar pra onde o dado vai depois de salvar). */
  @Input() note = '';

  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['open'] && this.open) || changes['model']) {
      this.recomputeAll();
    }
  }

  protected isReadonly(field: CrudField): boolean {
    return !!field.compute && field.compute(this.model) !== undefined;
  }

  protected onFieldChange(field: CrudField, value: unknown): void {
    this.model[field.key] = value;
    if (field.type === 'autocomplete' && field.onSelect) {
      const match = field.options?.find((opt) => opt.label === value);
      if (match) {
        field.onSelect(match, this.model);
      }
    }
    this.recomputeAll();
  }

  private recomputeAll(): void {
    for (const field of this.fields) {
      if (!field.compute) continue;
      const computed = field.compute(this.model);
      if (computed !== undefined) {
        this.model[field.key] = computed;
      }
    }
  }

  protected submit(): void {
    this.saved.emit();
  }

  protected cancel(): void {
    this.cancelled.emit();
  }
}
