import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Filter, MoreHorizontal, X } from 'lucide-react';

type Lang = 'en' | 'ar';

type BulkAction = { label: string; onClick: (ids: string[]) => void; icon?: ReactNode; tone?: 'default' | 'danger' };
interface SelectionContextValue {
  selected: Set<string>;
  toggle: (id: string) => void;
  clear: () => void;
  selectAll: (ids: string[]) => void;
  bulkActions: BulkAction[];
}
const SelectionContext = createContext<SelectionContextValue | null>(null);

export function DataTable({ children, className = '', bulkActions = [], onSelectionChange }: { children: ReactNode; className?: string; bulkActions?: BulkAction[]; onSelectionChange?: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const value = useMemo<SelectionContextValue>(() => ({
    selected,
    toggle: (id) => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); onSelectionChange?.([...next]); return next; }),
    clear: () => { setSelected(new Set()); onSelectionChange?.([]); },
    selectAll: (ids) => { const next = new Set(ids); setSelected(next); onSelectionChange?.([...next]); },
    bulkActions,
  }), [bulkActions, onSelectionChange, selected]);
  return <SelectionContext.Provider value={value}><div className={`data-table-shell ${className}`}>{children}</div>{selected.size > 0 && <BulkActionBar />}</SelectionContext.Provider>;
}

function useSelection() {
  const context = useContext(SelectionContext);
  if (!context) throw new Error('DataTable selection components must be used inside DataTable');
  return context;
}

export function DataTableHeader({ children, rowIds = [], primarySort, onSort }: { children: ReactNode; rowIds?: string[]; primarySort?: 'asc' | 'desc'; onSort?: () => void }) {
  const { selected, selectAll } = useSelection();
  const allSelected = rowIds.length > 0 && rowIds.every(id => selected.has(id));
  return <div className="data-table-header"><label className="data-table-checkbox"><input type="checkbox" checked={allSelected} onChange={() => selectAll(allSelected ? [] : rowIds)} aria-label="Select all rows" /><span /></label>{children}{primarySort && <button type="button" className="data-table-sort" onClick={onSort} aria-label="Sort primary column">{primarySort === 'asc' ? '↑' : '↓'}</button>}</div>;
}

export function DataTableRow({ id, children, menu, onClick }: { id: string; children: ReactNode; menu?: ReactNode; onClick?: () => void }) {
  const { selected, toggle } = useSelection();
  const isSelected = selected.has(id);
  return <div className={`data-table-row ${isSelected ? 'is-selected' : ''}`} onClick={onClick}>{<label className="data-table-checkbox" onClick={event => event.stopPropagation()}><input type="checkbox" checked={isSelected} onChange={() => toggle(id)} aria-label={`Select row ${id}`} /><span /></label>}{children}{menu ?? <button type="button" className="data-table-menu" onClick={event => event.stopPropagation()} aria-label="Row actions"><MoreHorizontal size={18} /></button>}</div>;
}

export function StatusPill({ status, label = status }: { status: string; label?: string }) {
  return <span className={`data-status-pill status-${status}`}><i aria-hidden="true" />{label}</span>;
}

export function DataTableToolbar({ tabs, search, onSearch, action, children }: { tabs?: Array<{ label: string; count?: number; active?: boolean; onClick: () => void }>; search?: string; onSearch?: (value: string) => void; action?: ReactNode; children?: ReactNode }) {
  return <div className="data-table-toolbar">{tabs && <div className="data-table-tabs">{tabs.map(tab => <button type="button" key={tab.label} className={tab.active ? 'active' : ''} onClick={tab.onClick}>{tab.label}{tab.count !== undefined && <b>{tab.count}</b>}</button>)}</div>}{(onSearch || children || action) && <div className="data-table-toolbar-controls">{onSearch && <label className="data-table-search"><input value={search ?? ''} onChange={event => onSearch(event.target.value)} placeholder="Search" /><button type="button" aria-label="Filter"><Filter size={16} /></button></label>}{children}{action}</div>}</div>;
}

function BulkActionBar() {
  const { selected, bulkActions, clear } = useSelection();
  return <div className="data-table-bulk-bar"><strong>{selected.size} selected</strong>{bulkActions.map(action => <button type="button" key={action.label} className={action.tone === 'danger' ? 'danger' : ''} onClick={() => action.onClick([...selected])}>{action.icon}{action.label}</button>)}<button type="button" className="data-table-bulk-close" onClick={clear} aria-label="Clear selection"><X size={17} /></button></div>;
}

export function DataTableState({ kind, lang, onRetry }: { kind: 'loading' | 'error' | 'empty'; lang: Lang; onRetry?: () => void }) {
  const labels = {
    loading: lang === 'ar' ? 'جاري التحميل...' : 'Loading...',
    error: lang === 'ar' ? 'تعذر تحميل البيانات.' : 'Could not load data.',
    empty: lang === 'ar' ? 'لا توجد بيانات.' : 'No data found.',
  };
  return <div className={`data-table-state data-table-state-${kind}`} role={kind === 'error' ? 'alert' : undefined}>
    {kind === 'loading' && <span className="data-table-spinner" aria-hidden="true" />}
    <span>{labels[kind]}</span>
    {kind === 'error' && onRetry && <button className="secondary-action" onClick={onRetry}>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</button>}
  </div>;
}

export function DataList({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`data-list-shell ${className}`}>{children}</div>;
}

export function DateRangeFilter({
  startLabel,
  endLabel,
  startValue,
  endValue,
  onStartChange,
  onEndChange,
}: {
  startLabel: string;
  endLabel: string;
  startValue: string;
  endValue: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}) {
  return <div className="date-range-filter">
    <label><span>{startLabel}</span><input type="date" value={startValue} onChange={(event) => onStartChange(event.target.value)} /></label>
    <label><span>{endLabel}</span><input type="date" value={endValue} onChange={(event) => onEndChange(event.target.value)} /></label>
  </div>;
}