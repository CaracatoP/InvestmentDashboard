import { Edit2, Plus, Search, Trash2, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";

interface ToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  filter?: string;
  onFilterChange?: (value: string) => void;
  filterOptions?: string[];
  onCreate: () => void;
}

export function ManagementToolbar({ search, onSearchChange, filter = "Todos", onFilterChange, filterOptions = [], onCreate }: ToolbarProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row">
      <label className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-10 w-full rounded-lg border border-line bg-elevated pl-9 pr-3 text-sm text-ink outline-none transition focus:border-accent"
          placeholder="Pesquisar"
        />
      </label>
      {filterOptions.length > 0 ? (
        <select
          value={filter}
          onChange={(event) => onFilterChange?.(event.target.value)}
          className="h-10 rounded-lg border border-line bg-elevated px-3 text-sm text-ink outline-none transition focus:border-accent"
        >
          {filterOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90"
      >
        <Plus size={16} />
        Novo
      </button>
    </div>
  );
}

interface TableProps<T> {
  columns: string[];
  rows: T[];
  getKey: (row: T) => string;
  renderRow: (row: T) => ReactNode;
}

export function ManagementTable<T>({ columns, rows, getKey, renderRow }: TableProps<T>) {
  return (
    <section className="rounded-lg border border-line bg-panel p-4 shadow-soft">
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.14em] text-muted">
            <tr className="border-b border-line">
              {columns.map((column) => (
                <th key={column} className="py-3 font-medium">
                  {column}
                </th>
              ))}
              <th className="py-3 text-right font-medium">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getKey(row)} className="border-b border-line/70 text-muted">
                {renderRow(row)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <td className="py-3">
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-elevated text-muted transition hover:border-accent/50 hover:text-ink"
          title="Editar"
        >
          <Edit2 size={15} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-elevated text-muted transition hover:border-rose/50 hover:text-rose"
          title="Excluir"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </td>
  );
}

interface ModalProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  submitLabel?: string;
}

export function ManagementModal({ title, isOpen, onClose, onSubmit, children, submitLabel = "Salvar" }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm">
      <form onSubmit={onSubmit} className="w-full max-w-2xl rounded-lg border border-line bg-panel p-4 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-elevated text-muted hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <div className="mt-4 grid gap-3">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-line bg-elevated px-4 text-sm text-muted transition hover:text-ink">
            Cancelar
          </button>
          <button type="submit" className="h-10 rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90">
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ConfirmDelete({
  isOpen,
  title,
  onCancel,
  onConfirm
}: {
  isOpen: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-line bg-panel p-4 shadow-soft">
        <h2 className="text-base font-semibold text-ink">Confirmar exclusao</h2>
        <p className="mt-2 text-sm text-muted">{title}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-10 rounded-lg border border-line bg-elevated px-4 text-sm text-muted transition hover:text-ink">
            Cancelar
          </button>
          <button type="button" onClick={onConfirm} className="h-10 rounded-lg bg-rose px-4 text-sm font-medium text-black transition hover:bg-rose/90">
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}

export const fieldClass = "h-10 rounded-lg border border-line bg-elevated px-3 text-sm text-ink outline-none focus:border-accent";
export const areaClass = "min-h-24 rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-ink outline-none focus:border-accent";
