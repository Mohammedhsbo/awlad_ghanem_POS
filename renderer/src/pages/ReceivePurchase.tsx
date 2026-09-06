import { useState, useRef, useCallback, type KeyboardEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PackageCheck, Barcode, RefreshCw, CheckCircle2,
  AlertTriangle, Info, Loader2, Inbox, ChevronRight
} from 'lucide-react';
import { purchases, type Purchase, type PurchaseItem, type ReceiveItemInput } from '../api';

type Lang = 'en' | 'ar';

const T = {
  en: {
    pending: 'Pending Receivals', noPending: 'No pending purchases.',
    refreshing: 'Refreshing…', loadError: 'Failed to load purchases.',
    retry: 'Retry', items: 'items', partial: 'Partial', ordered: 'Ordered',
    supplier: 'Supplier', branch: 'Branch', poDate: 'PO Date',
    totalItems: 'Total Items', pendingItems: 'Pending', total: 'Total',
    receiveItems: 'Receive Items',
    hint: 'Tick items, scan/type VIN, press Enter or click Receive.',
    selectAll: 'Select All', deselectAll: 'Deselect All',
    vinPlaceholder: 'Scan or type VIN…', alreadyReceived: 'Already received',
    model: 'Model', qty: 'Qty',
    receiveSelected: 'Receive Selected', receiving: 'Receiving…',
    selected: 'selected', readyToReceive: 'ready to receive',
    vinRequired: 'All selected items must have a VIN.',
    selectAtLeast: 'Select at least one item.',
    dupVin: 'Duplicate VIN detected within this batch: ',
    successMsg: (n: number) => `✓ ${n} motorcycle${n === 1 ? '' : 's'} received successfully!`,
    allDone: 'All items received!',
    allDoneSub: 'This purchase is fully received.',
    newPurchase: 'Select another purchase',
    receivedVin: 'VIN',
    step: (i: number, t: number) => `Item ${i} of ${t}`,
  },
  ar: {
    pending: 'المشتريات المعلقة', noPending: 'لا يوجد مشتريات معلقة.',
    refreshing: 'جاري التحديث…', loadError: 'فشل تحميل المشتريات.',
    retry: 'إعادة المحاولة', items: 'أصناف', partial: 'جزئي', ordered: 'مطلوب',
    supplier: 'المورد', branch: 'الفرع', poDate: 'تاريخ الطلب',
    totalItems: 'إجمالي الأصناف', pendingItems: 'معلق', total: 'الإجمالي',
    receiveItems: 'استلام الأصناف',
    hint: 'اختر الأصناف، امسح أو أدخل رقم الهيكل، ثم اضغط Enter أو انقر استلام.',
    selectAll: 'تحديد الكل', deselectAll: 'إلغاء الكل',
    vinPlaceholder: 'امسح أو أدخل رقم الهيكل…', alreadyReceived: 'تم الاستلام',
    model: 'الموديل', qty: 'الكمية',
    receiveSelected: 'استلام المحدد', receiving: 'جاري الاستلام…',
    selected: 'محدد', readyToReceive: 'جاهز للاستلام',
    vinRequired: 'يجب إدخال رقم الهيكل لجميع الأصناف المحددة.',
    selectAtLeast: 'يرجى تحديد صنف واحد على الأقل.',
    dupVin: 'رقم هيكل مكرر: ',
    successMsg: (n: number) => `✓ تم استلام ${n} دراجة نارية بنجاح!`,
    allDone: 'تم استلام جميع الأصناف!',
    allDoneSub: 'هذه الطلبية مستلمة بالكامل.',
    newPurchase: 'اختر طلبية أخرى',
    receivedVin: 'رقم الهيكل',
    step: (i: number, t: number) => `الصنف ${i} من ${t}`,
  },
};

// ─────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────

function PurchaseBadge({ status, lang }: { status: string; lang: Lang }) {
  if (status === 'partially_received')
    return <span className="badge badge-partially">{T[lang].partial}</span>;
  return <span className="badge badge-ordered">{T[lang].ordered}</span>;
}

function PendingList({
  purchases: list, selected, onSelect, lang, isLoading, isError, onRefresh,
}: {
  purchases: Purchase[];
  selected: string | null;
  onSelect: (id: string) => void;
  lang: Lang;
  isLoading: boolean;
  isError: boolean;
  onRefresh: () => void;
}) {
  const t = T[lang];
  return (
    <div className="pos-list-panel">
      <div className="panel-header">
        <span className="panel-title" style={{ flex: 1 }}>{t.pending}</span>
        <button className="btn btn-ghost" style={{ padding: '0.3rem' }} onClick={onRefresh} title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="po-list">
        {isLoading && (
          <div className="loading-center" style={{ minHeight: 120 }}>
            <div className="spinner" style={{ width: 20, height: 20 }} />
            <span style={{ fontSize: '0.8rem' }}>{t.refreshing}</span>
          </div>
        )}

        {isError && (
          <div className="loading-center" style={{ minHeight: 120, color: '#ef4444' }}>
            <AlertTriangle size={24} />
            <span style={{ fontSize: '0.8rem' }}>{t.loadError}</span>
            <button className="btn btn-ghost" onClick={onRefresh} style={{ fontSize: '0.75rem' }}>{t.retry}</button>
          </div>
        )}

        {!isLoading && !isError && list.length === 0 && (
          <div className="loading-center" style={{ minHeight: 140 }}>
            <Inbox size={32} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: '0.8rem' }}>{t.noPending}</span>
          </div>
        )}

        {!isLoading && !isError && list.map(p => {
          const pending = (p.items ?? []).filter(i => !i.motorcycleId).length;
          return (
            <div
              key={p.id}
              className={`po-card ${selected === p.id ? 'selected' : ''}`}
              onClick={() => onSelect(p.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onSelect(p.id)}
            >
              <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="po-number">{p.purchaseNumber}</div>
                <PurchaseBadge status={p.status} lang={lang} />
              </div>
              <div className="po-supplier">{p.supplier?.name ?? '—'}</div>
              <div className="po-meta">
                <span className="po-items-count">{pending} {t.items} {t.pendingItems}</span>
                <ChevronRight size={14} style={{ color: 'var(--text-3)' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── VIN Input Row ─────────────────────────────────────────
interface ItemRowProps {
  item: PurchaseItem;
  index: number;
  total: number;
  checked: boolean;
  vin: string;
  onCheck: (checked: boolean) => void;
  onVinChange: (vin: string) => void;
  onVinCommit: () => void;
  nextRef: React.RefObject<HTMLInputElement | null> | null;
  lang: Lang;
}

function ItemRow({ item, index, total, checked, vin, onCheck, onVinChange, onVinCommit, nextRef, lang }: ItemRowProps) {
  const t = T[lang];
  const inputRef = useRef<HTMLInputElement>(null);
  const vinOk = vin.trim().length >= 5;

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onVinCommit();
      if (nextRef?.current) nextRef.current.focus();
    }
  }

  return (
    <div className={`item-row pending`}>
      {/* Checkbox */}
      <div className="item-check">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => {
            onCheck(e.target.checked);
            if (e.target.checked) setTimeout(() => inputRef.current?.focus(), 50);
          }}
        />
      </div>

      {/* Model info */}
      <div>
        <div className="item-model">{item.model}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.15rem' }}>
          {t.step(index + 1, total)} · {t.qty}: {item.quantity}
        </div>
      </div>

      {/* VIN input */}
      <div className="vin-wrap">
        <input
          ref={inputRef}
          className={`vin-input ${checked && vinOk ? 'vin-ok' : ''}`}
          placeholder={checked ? t.vinPlaceholder : '—'}
          value={vin}
          disabled={!checked}
          onChange={e => onVinChange(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          maxLength={50}
          autoComplete="off"
          spellCheck={false}
        />
        {checked && <Barcode size={14} className="vin-scan-icon" />}
      </div>

      {/* VIN validation indicator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {checked && vinOk && <CheckCircle2 size={18} style={{ color: 'var(--green-light)' }} />}
        {checked && !vinOk && vin.length > 0 && <AlertTriangle size={16} style={{ color: 'var(--amber-light)' }} />}
      </div>
    </div>
  );
}

// ─── Received item (done) ──────────────────────────────────
function ReceivedRow({ item, lang }: { item: PurchaseItem; lang: Lang }) {
  const t = T[lang];
  return (
    <div className="item-row done">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PackageCheck size={18} style={{ color: 'var(--green-light)' }} />
      </div>
      <div>
        <div className="item-model">{item.model}</div>
        <div className="item-vin-done">{t.receivedVin}: {item.vin ?? '—'}</div>
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-3)', gridColumn: 'span 2' }}>
        <span className="badge badge-received">{t.alreadyReceived}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Main Detail Panel
// ─────────────────────────────────────────────────────────
function ReceiveDetail({ purchaseId, lang }: { purchaseId: string; lang: Lang }) {
  const t = T[lang];
  const qc = useQueryClient();

  const { data: purchase, isLoading, isError, refetch } = useQuery({
    queryKey: ['pos-purchase', purchaseId],
    queryFn: () => purchases.get(purchaseId),
    staleTime: 0,
  });

  // State per pending item
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [vins, setVins] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const [sessionReceived, setSessionReceived] = useState(0);

  // refs for keyboard navigation between VIN inputs
  const inputRefs = useRef<Record<string, React.RefObject<HTMLInputElement | null>>>({});

  const pendingItems = (purchase?.items ?? []).filter(i => !i.motorcycleId);
  const doneItems = (purchase?.items ?? []).filter(i => i.motorcycleId);

  const selectedIds = Object.entries(checked).filter(([, v]) => v).map(([k]) => k);
  const readyCount = selectedIds.filter(id => (vins[id] ?? '').trim().length >= 5).length;

  function selectAll() {
    const map: Record<string, boolean> = {};
    pendingItems.forEach(i => { map[i.id] = true; });
    setChecked(map);
    // focus first input
    const firstId = pendingItems[0]?.id;
    if (firstId) setTimeout(() => inputRefs.current[firstId]?.current?.focus(), 60);
  }
  function deselectAll() { setChecked({}); }
  const allSelected = pendingItems.length > 0 && pendingItems.every(i => checked[i.id]);

  const receiveMut = useMutation({
    mutationFn: (items: ReceiveItemInput[]) => purchases.receive(purchaseId, items),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['pos-purchase', purchaseId] });
      qc.invalidateQueries({ queryKey: ['pending-purchases'] });
      const count = selectedIds.length;
      setSessionReceived(s => s + count);
      setBanner({ type: 'success', msg: t.successMsg(count) });
      setChecked({});
      setVins({});
    },
    onError: (e: Error) => {
      setBanner({ type: 'error', msg: e.message });
    },
  });

  function handleReceive() {
    setBanner(null);
    if (selectedIds.length === 0) { setBanner({ type: 'info', msg: t.selectAtLeast }); return; }
    const missing = selectedIds.find(id => !(vins[id] ?? '').trim());
    if (missing) { setBanner({ type: 'info', msg: t.vinRequired }); return; }
    // Check dup VIN within batch
    const vinList = selectedIds.map(id => (vins[id] ?? '').trim().toUpperCase());
    const seen = new Set<string>();
    for (const v of vinList) {
      if (seen.has(v)) { setBanner({ type: 'error', msg: t.dupVin + v }); return; }
      seen.add(v);
    }
    const payload: ReceiveItemInput[] = selectedIds.map(id => ({
      purchaseItemId: id,
      vin: (vins[id] ?? '').trim().toUpperCase(),
    }));
    receiveMut.mutate(payload);
  }

  if (isLoading) return (
    <div className="loading-center">
      <div className="spinner" />
      <span style={{ fontSize: '0.875rem' }}>{t.refreshing}</span>
    </div>
  );

  if (isError || !purchase) return (
    <div className="loading-center" style={{ color: 'var(--red-light)' }}>
      <AlertTriangle size={32} />
      <span>{t.loadError}</span>
      <button className="btn btn-ghost" onClick={() => refetch()}>{t.retry}</button>
    </div>
  );

  const total = Number(purchase.totalAmount);
  const isFullyReceived = purchase.status === 'received' || pendingItems.length === 0;

  if (isFullyReceived && sessionReceived === 0 && doneItems.length === purchase.items.length) {
    return (
      <div className="done-overlay">
        <div className="done-icon">✅</div>
        <h2 style={{ color: 'var(--green-light)', fontSize: '1.375rem', fontWeight: 800 }}>{t.allDone}</h2>
        <p style={{ color: 'var(--text-2)', fontSize: '0.875rem' }}>{t.allDoneSub}</p>
        <p style={{ fontFamily: 'monospace', color: 'var(--blue-light)', fontWeight: 700 }}>{purchase.purchaseNumber}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="detail-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <span className="detail-po-number">{purchase.purchaseNumber}</span>
            <PurchaseBadge status={purchase.status} lang={lang} />
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
            {new Date(purchase.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-EG', { dateStyle: 'medium' })}
          </span>
        </div>
        {sessionReceived > 0 && (
          <div className="banner banner-success" style={{ margin: 0 }}>
            <PackageCheck size={16} />
            {t.successMsg(sessionReceived)}
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="info-grid">
        <div className="info-card">
          <div className="info-label">{t.supplier}</div>
          <div className="info-value">{purchase.supplier?.name ?? '—'}</div>
          {purchase.supplier?.phone && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.2rem' }}>{purchase.supplier.phone}</div>
          )}
        </div>
        <div className="info-card">
          <div className="info-label">{t.totalItems}</div>
          <div className="info-value">{purchase.items.length}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--amber-light)', marginTop: '0.2rem' }}>
            {pendingItems.length} {t.pendingItems}
          </div>
        </div>
        <div className="info-card">
          <div className="info-label">{t.total}</div>
          <div className="info-value" style={{ color: 'var(--blue-light)' }}>
            {total.toLocaleString('en', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {/* Banners */}
      {banner && (
        <div className={`banner banner-${banner.type}`}>
          {banner.type === 'success' && <PackageCheck size={16} />}
          {banner.type === 'error' && <AlertTriangle size={16} />}
          {banner.type === 'info' && <Info size={16} />}
          {banner.msg}
        </div>
      )}

      {/* Receive section */}
      {pendingItems.length > 0 && (
        <div className="receive-section" style={{ marginBottom: '1rem' }}>
          <div className="receive-section-header">
            <span className="receive-section-title">
              <Barcode size={16} style={{ color: 'var(--blue-light)' }} />
              {t.receiveItems}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                {selectedIds.length} {t.selected} · {readyCount} {t.readyToReceive}
              </span>
              <button className="select-all-btn" onClick={allSelected ? deselectAll : selectAll}>
                {allSelected ? t.deselectAll : t.selectAll}
              </button>
            </div>
          </div>

          {/* Hint */}
          <div style={{ padding: '0.5rem 1.25rem', borderBottom: '1px solid var(--pos-border)', background: 'rgba(37,99,235,0.04)' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>💡 {t.hint}</p>
          </div>

          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '44px 1fr 200px 100px',
            gap: '0.75rem', padding: '0.5rem 1.25rem',
            borderBottom: '1px solid var(--pos-border)',
            fontSize: '0.7rem', color: 'var(--text-3)',
            textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700,
          }}>
            <span></span>
            <span>{t.model}</span>
            <span>{t.vinPlaceholder.split(' ')[0]}</span>
            <span></span>
          </div>

          {pendingItems.map((item, idx) => {
            if (!inputRefs.current[item.id]) {
              inputRefs.current[item.id] = { current: null };
            }
            const nextItem = pendingItems[idx + 1];
            const nextRef = nextItem ? inputRefs.current[nextItem.id] ?? null : null;

            return (
              <ItemRow
                key={item.id}
                item={item}
                index={idx}
                total={pendingItems.length}
                checked={!!checked[item.id]}
                vin={vins[item.id] ?? ''}
                onCheck={(v) => {
                  setChecked(c => ({ ...c, [item.id]: v }));
                  if (!v) setVins(vs => ({ ...vs, [item.id]: '' }));
                }}
                onVinChange={(v) => setVins(vs => ({ ...vs, [item.id]: v }))}
                onVinCommit={() => {}}
                nextRef={nextRef as React.RefObject<HTMLInputElement | null>}
                lang={lang}
              />
            );
          })}
        </div>
      )}

      {/* Already received */}
      {doneItems.length > 0 && (
        <div className="receive-section" style={{ marginBottom: '1rem', opacity: 0.7 }}>
          <div className="receive-section-header">
            <span className="receive-section-title">
              <CheckCircle2 size={16} style={{ color: 'var(--green-light)' }} />
              {T[lang].alreadyReceived} ({doneItems.length})
            </span>
          </div>
          {doneItems.map(item => <ReceivedRow key={item.id} item={item} lang={lang} />)}
        </div>
      )}

      {/* Action bar */}
      {pendingItems.length > 0 && (
        <div className="action-bar">
          <div className="action-summary">
            <strong>{selectedIds.length}</strong> {t.selected} &nbsp;·&nbsp;
            <strong>{readyCount}</strong> {t.readyToReceive}
          </div>
          <button
            className="btn btn-success btn-lg"
            onClick={handleReceive}
            disabled={receiveMut.isPending || selectedIds.length === 0}
          >
            {receiveMut.isPending
              ? <><Loader2 size={18} style={{ animation: 'spin 0.7s linear infinite' }} /> {t.receiving}</>
              : <><PackageCheck size={18} /> {t.receiveSelected}</>
            }
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Main exported page
// ─────────────────────────────────────────────────────────
export default function ReceivePurchase({ lang }: { lang: Lang }) {
  const t = T[lang];
  const isRtl = lang === 'ar';
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['pending-purchases'],
    queryFn: () => purchases.listPending(),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const list = data?.items ?? [];

  return (
    <div className="pos-body" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      <PendingList
        purchases={list}
        selected={selectedId}
        onSelect={setSelectedId}
        lang={lang}
        isLoading={isLoading}
        isError={isError}
        onRefresh={() => refetch()}
      />

      <div className="pos-detail-panel">
        {!selectedId ? (
          <div className="detail-empty">
            <span style={{ fontSize: '4rem', opacity: 0.2 }}>📦</span>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-2)' }}>
              {isRtl ? 'اختر طلبية من القائمة' : 'Select a purchase order to receive'}
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', maxWidth: 300 }}>
              {t.hint}
            </p>
          </div>
        ) : (
          <ReceiveDetail purchaseId={selectedId} lang={lang} />
        )}
      </div>
    </div>
  );
}
