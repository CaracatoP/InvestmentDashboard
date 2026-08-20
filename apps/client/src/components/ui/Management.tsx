import { Edit2, Plus, Search, Trash2, X } from "lucide-react";
import type { FormEvent, HTMLAttributes, MouseEvent, ReactNode } from "react";

interface ToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  filter?: string;
  onFilterChange?: (value: string) => void;
  filterOptions?: string[];
  onCreate: () => void;
  searchPlaceholder?: string;
  searchLabel?: string;
  filterLabel?: string;
  createLabel?: string;
}

export function ManagementToolbar({
  search,
  onSearchChange,
  filter = "Todos",
  onFilterChange,
  filterOptions = [],
  onCreate,
  searchPlaceholder = "Pesquise pelo nome, descricao ou identificador",
  searchLabel = "Pesquisar registros",
  filterLabel = "Filtrar registros",
  createLabel = "Novo"
}: ToolbarProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row md:flex-wrap">
      <label className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-11 w-full rounded-lg border border-line bg-elevated pl-9 pr-3 text-base text-ink outline-none transition focus:border-accent sm:text-sm"
          placeholder={searchPlaceholder}
          aria-label={searchLabel}
        />
      </label>
      {filterOptions.length > 0 ? (
        <select
          value={filter}
          onChange={(event) => onFilterChange?.(event.target.value)}
          className="h-11 w-full rounded-lg border border-line bg-elevated px-3 text-base text-ink outline-none transition focus:border-accent sm:text-sm md:w-auto"
          aria-label={filterLabel}
        >
          {filterOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90 sm:w-auto"
      >
        <Plus size={16} />
        {createLabel}
      </button>
    </div>
  );
}

interface TableProps<T> {
  columns: string[];
  rows: T[];
  getKey: (row: T) => string;
  renderRow: (row: T) => ReactNode;
  renderMobileCard?: (row: T) => ReactNode;
  getRowProps?: (row: T) => HTMLAttributes<HTMLTableRowElement>;
}

export function ManagementTable<T>({ columns, rows, getKey, renderRow, renderMobileCard, getRowProps }: TableProps<T>) {
  if (rows.length === 0) {
    return (
      <section className="min-w-0 rounded-lg border border-line bg-panel p-3 shadow-soft sm:p-4">
        <div className="rounded-lg border border-line bg-elevated p-6 text-sm text-muted">Nenhum registro encontrado.</div>
      </section>
    );
  }

  return (
    <section className="min-w-0 rounded-lg border border-line bg-panel p-3 shadow-soft sm:p-4">
      {renderMobileCard ? (
        <div className="space-y-3 md:hidden">
          {rows.map((row) => (
            <div key={getKey(row)}>{renderMobileCard(row)}</div>
          ))}
        </div>
      ) : null}
      <div className={`scrollbar-thin overflow-x-auto ${renderMobileCard ? "hidden md:block" : ""}`}>
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
            {rows.map((row) => {
              const rowProps = getRowProps?.(row);

              return (
                <tr {...rowProps} key={getKey(row)} className={["border-b border-line/70 text-muted", rowProps?.className].filter(Boolean).join(" ")}>
                  {renderRow(row)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function stopRowNavigation(event: MouseEvent<HTMLButtonElement>, action: () => void) {
  event.stopPropagation();
  action();
}

export function RowActions({
  onView,
  onEdit,
  onDelete,
  viewLabel = "Ver detalhes",
  editLabel = "Editar",
  deleteLabel = "Excluir",
  viewIcon
}: {
  onView?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  viewLabel?: string;
  editLabel?: string;
  deleteLabel?: string;
  viewIcon?: ReactNode;
}) {
  return (
    <td className="py-3">
      <div className="flex justify-end gap-2">
        {onView ? (
          <button
            type="button"
            onClick={(event) => stopRowNavigation(event, onView)}
            className="grid h-11 w-11 place-items-center rounded-lg border border-line bg-elevated text-muted transition hover:border-accent/50 hover:text-ink focus-visible:border-accent focus-visible:outline-none"
            title={viewLabel}
            aria-label={viewLabel}
          >
            {viewIcon ?? <Search size={15} />}
          </button>
        ) : null}
        <button
          type="button"
          onClick={(event) => stopRowNavigation(event, onEdit)}
          className="grid h-11 w-11 place-items-center rounded-lg border border-line bg-elevated text-muted transition hover:border-accent/50 hover:text-ink focus-visible:border-accent focus-visible:outline-none"
          title={editLabel}
          aria-label={editLabel}
        >
          <Edit2 size={15} />
        </button>
        <button
          type="button"
          onClick={(event) => stopRowNavigation(event, onDelete)}
          className="grid h-11 w-11 place-items-center rounded-lg border border-line bg-elevated text-muted transition hover:border-rose/50 hover:text-rose focus-visible:border-rose focus-visible:outline-none"
          title={deleteLabel}
          aria-label={deleteLabel}
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
  submitDisabled?: boolean;
  description?: string;
}

export function ManagementModal({ title, isOpen, onClose, onSubmit, children, submitLabel = "Salvar", submitDisabled = false, description }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 px-3 py-4 backdrop-blur-sm sm:px-4" role="presentation">
      <form
        onSubmit={onSubmit}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col rounded-lg border border-line bg-panel shadow-soft"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <div className="min-w-0">
            <h2 className="min-w-0 break-words text-base font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line bg-elevated text-muted hover:text-ink" aria-label="Fechar modal">
            <X size={16} />
          </button>
        </div>
        <div className="grid gap-3 overflow-y-auto px-4 py-4">{children}</div>
        <div className="flex flex-col-reverse gap-2 border-t border-line px-4 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="h-11 rounded-lg border border-line bg-elevated px-4 text-sm text-muted transition hover:text-ink">
            Cancelar
          </button>
          <button type="submit" disabled={submitDisabled} className="h-11 rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60">
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ManagementField({
  label,
  children,
  helperText,
  required = false,
  optional = false
}: {
  label: string;
  children: ReactNode;
  helperText?: ReactNode;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm text-muted">
      <span className="font-medium text-ink">
        {label}
        {required ? " *" : optional ? " (opcional)" : ""}
      </span>
      {children}
      {helperText ? <span className="text-xs text-muted">{helperText}</span> : null}
    </label>
  );
}

export function ConfirmDelete({
  isOpen,
  title,
  description,
  details,
  confirmLabel = "Excluir",
  cancelLabel = "Cancelar",
  onCancel,
  onConfirm
}: {
  isOpen: boolean;
  title: string;
  description?: ReactNode;
  details?: Array<ReactNode>;
  confirmLabel?: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 px-3 py-4 backdrop-blur-sm sm:px-4" role="presentation">
      <div className="w-full max-w-md rounded-lg border border-line bg-panel p-4 shadow-soft" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="break-words text-base font-semibold text-ink">{title}</h2>
        {description ? <div className="mt-2 text-sm text-muted">{description}</div> : null}
        {details && details.length > 0 ? (
          <div className="mt-4 space-y-2 rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
            {details.map((detail, index) => (
              <p key={index} className="break-words">{detail}</p>
            ))}
          </div>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="h-11 rounded-lg border border-line bg-elevated px-4 text-sm text-muted transition hover:text-ink">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className="h-11 rounded-lg bg-rose px-4 text-sm font-medium text-black transition hover:bg-rose/90">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export const fieldClass = "min-h-11 w-full rounded-lg border border-line bg-elevated px-3 text-base text-ink outline-none transition placeholder:text-muted/60 focus:border-accent disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm";
export const areaClass = "min-h-24 w-full rounded-lg border border-line bg-elevated px-3 py-2 text-base text-ink outline-none transition placeholder:text-muted/60 focus:border-accent disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm";
