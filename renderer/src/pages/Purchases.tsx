import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search, Trash2 } from 'lucide-react';
import { purchases, type Purchase, type PurchaseStatus } from '../api';

type Lang = 'en' | 'ar';

const T = {
  en: {
    title: 'Purchases', subtitle: 'Purchase orders', add: 'New purchase', search: 'Search purchase number or supplier',
    purchaseNumber: 'PO Number', supplier: 'Supplier', branch: 'Branch', totalAmount: 'Total', status: 'Status',
    actions: 'Actions', draft: 'Draft', ordered: 'Ordered', partially_received: 'Partially received', received: 'Received', cancelled: 'Cancelled',
    noData: 'No purchases found.', loading: 'Loading purchases...', error: 'Could not load purchases.', delete: 'Delete', confirmDelete: 'Delete this purchase?',
  },
  ar: {
    title: 'المشتريات', subtitle: 'طلبات الشراء', add: 'طلب جديد', search: 'ابحث برقم الطلب أو المورد',
    purchaseNumber: 'رقم الطلب', supplier: 'المورد', branch: 'الفرع', totalAmount: 'الإجمالي', status: 'الحالة',
    actions: 'الإجراءات', draft: 'مسودة', ordered: 'مطلوب', partially_received: 'جزئي', received: 'مستلم', cancelled: 'ملغي',
    noData: 'لا توجد طلبات شراء.', loading: 'جاري تحميل المشتريات...', error: 'تعذر تحميل المشتريات.', delete: 'حذف', confirmDelete: 'حذف هذا الطلب؟',
  },
} as const;

export default function Purchases({ lang }: { lang: Lang }) {
  const t = T[lang];
  const isRtl = lang === 'ar';
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PurchaseStatus | 'all'>('all');
  const [deleteTarget, setDeleteTarget] = useState<Purchase | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['purchases', status, search],
    queryFn: () => purchases.list({ status: status === 'all' ? undefined : status, search, limit: 50 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => purchases.remove(id),
    onSuccess: () => {
      setDeleteTarget(null);
      void qc.invalidateQueries({ queryKey: ['purchases'] });
    },
  });

  const rows = data?.items ?? [];

  return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{lang === 'ar' ? 'المشتريات' : 'Procurement'}</span>
          <h1>{t.title}</h1>
        </div>
        <Link to="/purchases/new" className="primary-action"><Plus size={16} /> {t.add}</Link>
      </div>

      <div className="toolbar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-box" style={{ flex: 1, minWidth: 220 }}>
          <Search size={17} />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder={t.search} />
        </div>

        <select value={status} onChange={event => setStatus(event.target.value as PurchaseStatus | 'all')} className="text-input" style={{ maxWidth: 190 }}>
          <option value="all">{lang === 'ar' ? 'الكل' : 'All'}</option>
          <option value="draft">{t.draft}</option>
          <option value="ordered">{t.ordered}</option>
          <option value="partially_received">{t.partially_received}</option>
          <option value="received">{t.received}</option>
          <option value="cancelled">{t.cancelled}</option>
        </select>
      </div>

      {isLoading && <div className="state-panel">{t.loading}</div>}
      {isError && <div className="state-panel error">{t.error}</div>}
      {!isLoading && !isError && rows.length === 0 && <div className="state-panel">{t.noData}</div>}

      {!isLoading && !isError && rows.length > 0 && (
        <div className="surface-panel">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>{t.purchaseNumber}</th>
                <th style={{ textAlign: 'left' }}>{t.supplier}</th>
                <th style={{ textAlign: 'left' }}>{t.branch}</th>
                <th style={{ textAlign: 'left' }}>{t.totalAmount}</th>
                <th style={{ textAlign: 'left' }}>{t.status}</th>
                <th style={{ textAlign: 'left' }}>{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((purchase) => (
                <tr key={purchase.id} className="list-row" style={{ borderBottom: '1px solid var(--border)' }}>
                  <td><Link to={`/purchases/${purchase.id}`} className="link-primary">{purchase.purchaseNumber}</Link></td>
                  <td>{purchase.supplier?.name ?? '—'}</td>
                  <td>{purchase.branch?.nameEn ?? '—'}</td>
                  <td>{Number(purchase.totalAmount).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 })}</td>
                  <td><span className={`status-pill ${purchase.status}`}>{t[purchase.status] ?? purchase.status}</span></td>
                  <td>
                    <button type="button" className="icon-button danger" onClick={() => setDeleteTarget(purchase)} title={t.delete}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>{t.confirmDelete}</h3>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" className="secondary-action" onClick={() => setDeleteTarget(null)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
              <button type="button" className="primary-action danger" onClick={() => { deleteMutation.mutate(deleteTarget.id); }} disabled={deleteMutation.isPending}>
                {t.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
