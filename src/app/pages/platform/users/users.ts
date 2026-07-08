import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { User } from '@core/interfaces/user.interface';
import { createEntityStore, WithId } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { num } from '@core/utils/format';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';

type SortField = keyof User;

const FIELDS: CrudField[] = [
  { key: 'name', label: 'Nome', type: 'text', required: true },
  { key: 'email', label: 'E-mail', type: 'text', required: true },
  { key: 'password', label: 'Senha', type: 'text', required: true },
];

@Component({
  selector: 'app-users',
  imports: [FormsModule, CrudFormModal, ConfirmModal, FilterByPipe],
  templateUrl: './users.html',
  styleUrl: './users.scss',
})
export class Users {
  protected readonly num = num;
  protected readonly fields = FIELDS;

  private readonly store = createEntityStore<User>(IDB_STORES.users, []);

  protected readonly search = signal('');
  protected readonly searchKeys: SortField[] = ['name', 'email'];
  protected readonly sortField = signal<SortField | ''>('');
  protected readonly sortDir = signal<1 | -1>(1);

  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Novo usuário');
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  protected readonly deleteTarget = signal<WithId<User> | null>(null);

  protected readonly totalUsuarios = computed(() => this.store.items().length);

  protected readonly rows = computed<WithId<User>[]>(() => {
    let list: WithId<User>[] = this.store.items();

    const field = this.sortField();
    const dir = this.sortDir();
    if (field) {
      list = [...list].sort((a, b) => String(a[field]).localeCompare(String(b[field])) * dir);
    }
    return list;
  });

  protected sortBy(field: SortField): void {
    if (this.sortField() === field) {
      this.sortDir.update((d) => (d === 1 ? -1 : 1));
    } else {
      this.sortField.set(field);
      this.sortDir.set(1);
    }
  }

  protected openNew(): void {
    this.editingId = null;
    this.formTitle.set('Novo usuário');
    this.draft = { name: '', email: '', password: '' };
    this.formOpen.set(true);
  }

  protected openEdit(u: WithId<User>): void {
    this.editingId = u.id;
    this.formTitle.set('Editar usuário');
    this.draft = { name: u.name, email: u.email, password: u.password };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const record: User = {
      name: String(d['name'] ?? '').trim(),
      email: String(d['email'] ?? '').trim(),
      password: String(d['password'] ?? ''),
    };

    if (this.editingId) {
      await this.store.update(this.editingId, record);
    } else {
      await this.store.add(record);
    }
    this.formOpen.set(false);
  }

  protected askDelete(u: WithId<User>): void {
    this.deleteTarget.set(u);
  }

  protected cancelDelete(): void {
    this.deleteTarget.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;
    await this.store.remove(target.id);
    this.deleteTarget.set(null);
  }
}
