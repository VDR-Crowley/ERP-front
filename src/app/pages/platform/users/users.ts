import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { UserAccount } from '@core/interfaces/user-account.interface';
import { WithId } from '@core/api/entity-store';
import { createUsersStore } from '@core/api/adapters/users.adapter';
import { AuthSession } from '@core/services/auth-session.service';
import { num } from '@core/utils/format';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

type SortField = keyof UserAccount;

const FIELDS: CrudField[] = [
  { key: 'name', label: 'Nome', type: 'text', required: true },
  { key: 'email', label: 'E-mail', type: 'text', required: true },
  { key: 'password', label: 'Senha', type: 'text' },
  { key: 'passwordConfirmation', label: 'Confirmar senha', type: 'text' },
];

/**
 * Administração de usuários (`/api/users`) — diferente do cadastro público
 * (`/register`). "Excluir" desativa no backend (`is_active=false`), não
 * apaga de verdade; a lista mostra ativos e inativos (badge de status),
 * com ação de reativar pra quem foi desativado. Autodesativação é
 * bloqueada (backend + botão desabilitado aqui).
 */
@Component({
  selector: 'app-users',
  imports: [FormsModule, CrudFormModal, ConfirmModal, FilterByPipe, SortIcon],
  templateUrl: './users.html',
  styleUrl: './users.scss',
})
export class Users {
  protected readonly num = num;
  protected readonly fields = FIELDS;

  private readonly store = createUsersStore();
  private readonly session = inject(AuthSession);

  protected readonly search = signal('');
  protected readonly searchKeys: SortField[] = ['name', 'email'];
  private readonly sortState = createSortState<SortField>('name', 1);
  protected readonly sortField = this.sortState.sortField;
  protected readonly sortDir = this.sortState.sortDir;
  protected readonly sortBy = this.sortState.sortBy;

  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Novo usuário');
  protected readonly formErrors = signal<string[]>([]);
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  private editingTarget: WithId<UserAccount> | null = null;
  protected readonly deleteTarget = signal<WithId<UserAccount> | null>(null);
  protected readonly deleteError = signal('');

  protected readonly totalUsuarios = computed(
    () => this.store.items().filter((u) => u.isActive).length,
  );

  protected readonly rows = computed<WithId<UserAccount>[]>(() =>
    sortRows(this.store.items(), this.sortField(), this.sortDir()),
  );

  protected isSelf(u: WithId<UserAccount>): boolean {
    return String(this.session.userId()) === u.id;
  }

  protected openNew(): void {
    this.editingId = null;
    this.editingTarget = null;
    this.formTitle.set('Novo usuário');
    this.formErrors.set([]);
    this.draft = { name: '', email: '', password: '', passwordConfirmation: '' };
    this.formOpen.set(true);
  }

  protected openEdit(u: WithId<UserAccount>): void {
    this.editingId = u.id;
    this.editingTarget = u;
    this.formTitle.set('Editar usuário');
    this.formErrors.set([]);
    // Senha nunca vem pré-preenchida — em branco significa "não trocar" (ver UserAccount).
    this.draft = { name: u.name, email: u.email, password: '', passwordConfirmation: '' };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const password = String(d['password'] ?? '');
    const record: UserAccount = {
      name: String(d['name'] ?? '').trim(),
      email: String(d['email'] ?? '').trim(),
      // Edição preserva o status atual (não reativa por engano ao editar
      // nome/e-mail de um usuário desativado) — criação sempre entra ativo.
      isActive: this.editingTarget?.isActive ?? true,
      ...(password
        ? { password, passwordConfirmation: String(d['passwordConfirmation'] ?? '') }
        : {}),
    };

    this.formErrors.set([]);
    try {
      if (this.editingId) {
        await this.store.update(this.editingId, record);
      } else {
        await this.store.add(record);
      }
      this.formOpen.set(false);
    } catch (err) {
      this.formErrors.set(this.validationErrors(err));
    }
  }

  protected askDelete(u: WithId<UserAccount>): void {
    if (this.isSelf(u)) return;
    this.deleteError.set('');
    this.deleteTarget.set(u);
  }

  protected cancelDelete(): void {
    this.deleteTarget.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;
    try {
      // DELETE desativa no backend (is_active=false), não apaga — a store
      // genérica remove o item da lista local, então recarrega pra ele
      // voltar a aparecer (agora inativo, com badge + botão de reativar).
      await this.store.remove(target.id);
      this.store.reload();
      this.deleteTarget.set(null);
    } catch (err) {
      this.deleteTarget.set(null);
      this.deleteError.set(this.validationErrors(err)[0] ?? 'Não foi possível desativar o usuário.');
    }
  }

  protected async reactivate(u: WithId<UserAccount>): Promise<void> {
    this.deleteError.set('');
    try {
      await this.store.update(u.id, { name: u.name, email: u.email, isActive: true });
    } catch {
      this.deleteError.set('Não foi possível reativar o usuário.');
    }
  }

  private validationErrors(err: unknown): string[] {
    if (err instanceof HttpErrorResponse && err.status === 422) {
      const errors = err.error?.errors as Record<string, string[]> | undefined;
      if (errors) return Object.values(errors).flat();
      if (err.error?.message) return [err.error.message];
    }
    return ['Não foi possível salvar. Tente novamente.'];
  }
}
