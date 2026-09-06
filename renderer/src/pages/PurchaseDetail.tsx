import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ClipboardCheck, PackageCheck, Plus, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { purchases, type Purchase, type PurchaseItem } from '../api';

type Lang = 'en' | 'ar';

const T = {
  en: {
    title: 'Purchase details', back: 'Purchases', loading: 'Loading purchase...', 
    error: 'Could not load this purchase.', order: 'Mark ordered', cancel: 'Cancel purchase',
    receive: 'Receive selected', delete: 'Delete', confirmDelete: 'Delete this purchase?',
    supplier: 'Supplier', branch: 'Branch', total: 'Total', status: 'Status', items: 'Items',
    qty: 'Qty', unitCost: 'Unit cost', subtotal: 'Subtotal', noItems: 'No items.',
    markReceived: 'Mark as received', received: 'Received', pending: 'Pending', note: 'Items with a VIN are created as motorcycles on receipt.',
  },
  ar: {
    title: 'تفاصيل الطلب', back: 'المشتريات', loading: 'جاري تحميل الطلب...',
    error: 'تعذر تحميل هذا الطلب.', order: 'تحديد كطلب', cancel: 'إلغاء الطلب',
    receive: 'استلام المحدد', delete: 'حذف', confirmDelete: 'حذف هذا الطلب؟',
    supplier: 'المورد', branch: 'الفرع', total: 'الإجمالي', status: 'الحالة', items: 'الأصناف',
    qty: 'الكمية', unitCost: 'سعر الوحدة', subtotal: 'الإجمالي الفرعي', noItems: 'لا توجد أصناف.',
    markReceived: 'تحديد كمستلم', received: 'مستلم', pending: 'قيد الاستلام', note: 'عند الاستلام، يتم إنشاء دراجة جديدة لكل صنف مع رقم هيكل.',
  },
} as const;

export default function PurchaseDetail({ lang }: { lang: Lang }) {
  const t = T[lang];
  const isRtl = lang === 'ar';
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [vinMap, setVinMap] = useState<Record<string, string>>({});

  const { data: purchase, isLoading, isError, refetch } = useQuery({
    queryKey: ['desktop-purchase', id],
    queryFn: () => purchases.get(id!),
    enabled: !!id,
  });

  const orderMutation = useMutation({
    mutationFn: () => purchases.order(id!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['desktop-purchase', id] });
      void qc.invalidateQueries({ queryKey: ['purchases'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: () => purchases.cancel(id!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['desktop-purchase', id] });
      void qc.invalidateQueries({ queryKey: ['purchases'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => purchases.remove(id!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['purchases'] });
      navigate('/purchases');
    },
    onError: (err: Error) => setError(err.message),
  });

  const receiveMutation = useMutation({
    mutationFn: () => {
      const items = Object.entries(selected)
        .filter(([, value]) => value)
        .map(([purchaseItemId]) => ({ purchaseItemId, vin: (vinMap[purchaseItemId] ?? '').trim() }));

      if (items.length === 0) {
        throw new Error(lang === 'ar' ? 'اختر صنفاً واحداً على الأقل.' : 'Select at least one item.');
      }

      const missingVin = items.some(item => !item.vin);
      if (missingVin) {
        throw new Error(lang === 'ar' ? 'كل صنف محدد يحتاج إلى رقم هيكل.' : 'All selected items need a VIN.');
      }

      return purchases.receive(id!, items);
    },
    onSuccess: () => {
      setSelected({});
      setVinMap({});
      void qc.invalidateQueries({ queryKey: ['desktop-purchase', id] });
      void qc.invalidateQueries({ queryKey: ['purchases'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const pendingItems = (purchase?.items ?? []).filter(item => !item.motorcycleId);

  if (isLoading) {
    return <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}><div className="state-panel">{t.loading}</div></section>;
  }

  if (isError || !purchase) {
    return <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}><div className="state-panel error">{t.error}</div></section>;
  }

  const canOrder = purchase.status === 'draft';
  const canCancel = purchase.status === 'draft';
  const canDelete = purchase.status === 'draft';
  const canReceive = purchase.status === 'ordered' || purchase.status === 'partially_received';

  return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="page-heading">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/purchases" className="secondary-action"><ArrowLeft size={16} /></Link>
          <div>
            <span className="eyebrow">{t.back}</span>
            <h1>{purchase.purchaseNumber}</h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canOrder && <button className="primary-action" onClick={() => orderMutation.mutate()} disabled={orderMutation.isPending}>{t.order}</button>}
          {canCancel && <button className="secondary-action danger" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>{t.cancel}</button>}
          {canDelete && <button className="secondary-action danger" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>{t.delete}</button>}
        </div>
      </div>

      {error && <div className="inline-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="stat-card">
          <span>{t.supplier}</span>
          <strong>{purchase.supplier?.name ?? '—'}</strong>
        </div>
        <div className="stat-card">
          <span>{t.branch}</span>
          <strong>{purchase.branch?.nameEn ?? '—'}</strong>
        </div>
        <div className="stat-card">
          <span>{t.total}</span>
          <strong>{Number(purchase.totalAmount).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 })}</strong>
        </div>
      </div>

      <div className="surface-panel" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong>{t.items}</strong>
          <span className="status-pill">{purchase.status}</span>
        </div>

        {purchase.items.length === 0 ? <div className="state-panel">{t.noItems}</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {purchase.items.map((item: PurchaseItem) => {
              const subtotal = Number(item.quantity) * Number(item.unitCost || 0);
              const isReceived = !!item.motorcycleId;
              return (
                <div key={item.id} className="list-row" style={{ opacity: isReceived ? 0.8 : 1 }}>
                  <div>
                    <strong>{item.model}</strong>
                    <div className="subtle">{t.qty}: {item.quantity}</div>
                  </div>
                  <div className="subtle">{t.unitCost}: {Number(item.unitCost).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 })}</div>
                  <div className="subtle">{t.subtotal}: {subtotal.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 })}</div>
                  <span className={isReceived ? 'status-pill success' : 'status-pill muted'}>{isReceived ? t.received : t.pending}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {canReceive && (
        <div className="surface-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong>{lang === 'ar' ? 'استلام الأصناف' : 'Receive items'}</strong>
            <PackageCheck size={18} />
          </div>
          <div style={{ marginBottom: 10 }} className="subtle">{t.note}</div>
          {pendingItems.length === 0 ? <div className="state-panel success">{lang === 'ar' ? 'تم استلام كل الأصناف.' : 'All items are already received.'}</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pendingItems.map((item) => (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 2fr) minmax(180px, 1fr)', gap: 12, alignItems: 'center', padding: 10, border: '1px solid var(--border)', borderRadius: 12 }}>
                  <input type="checkbox" checked={!!selected[item.id]} onChange={(event) => setSelected(current => ({ ...current, [item.id]: event.target.checked }))} />
                  <div>
                    <strong>{item.model}</strong>
                    <div className="subtle">{t.qty}: {item.quantity}</div>
                  </div>
                  <input
                    className="text-input"
                    value={vinMap[item.id] ?? ''}
                    onChange={(event) => setVinMap(current => ({ ...current, [item.id]: event.target.value.toUpperCase() }))}
                    placeholder={lang === 'ar' ? 'رقم الهيكل' : 'VIN'}
                    disabled={!selected[item.id]}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="primary-action" onClick={() => receiveMutation.mutate()} disabled={receiveMutation.isPending || Object.values(selected).every(v => !v)}>
                  <ClipboardCheck size={15} /> {t.receive}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
