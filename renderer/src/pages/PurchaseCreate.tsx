import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { branches, purchases, suppliers, type BranchSummary, type PurchaseCreateInput } from '../api';

type Lang = 'en' | 'ar';

const T = {
  en: {
    title: 'New Purchase', back: 'Back', supplier: 'Supplier', branch: 'Branch', items: 'Items',
    model: 'Model', quantity: 'Qty', unitCost: 'Unit cost', addItem: 'Add line', remove: 'Remove',
    total: 'Total', save: 'Create purchase', selectSupplier: 'Select supplier', selectBranch: 'Select branch',
    notes: 'Notes', cancel: 'Cancel', loadingSuppliers: 'Loading suppliers...', loadingBranches: 'Loading branches...',
    itemError: 'Each line requires a model, quantity and valid unit cost.', supplierError: 'Please select a supplier.', branchError: 'Please select a branch.',
  },
  ar: {
    title: 'طلب شراء جديد', back: 'رجوع', supplier: 'المورد', branch: 'الفرع', items: 'الأصناف',
    model: 'الموديل', quantity: 'الكمية', unitCost: 'سعر الوحدة', addItem: 'إضافة سطر', remove: 'حذف',
    total: 'الإجمالي', save: 'إنشاء الطلب', selectSupplier: 'اختر المورد', selectBranch: 'اختر الفرع',
    notes: 'ملاحظات', cancel: 'إلغاء', loadingSuppliers: 'جاري تحميل الموردين...', loadingBranches: 'جاري تحميل الفروع...',
    itemError: 'يجب أن يحتوي كل سطر على موديل وكمية وسعر وحدة صحيح.', supplierError: 'يرجى اختيار المورد.', branchError: 'يرجى اختيار الفرع.',
  },
} as const;

interface LineItem {
  model: string;
  quantity: number;
  unitCost: number;
  vin?: string;
}

const emptyLine = (): LineItem => ({ model: '', quantity: 1, unitCost: 0 });

export default function PurchaseCreate({ lang }: { lang: Lang }) {
  const t = T[lang];
  const isRtl = lang === 'ar';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  const supplierQuery = useQuery({
    queryKey: ['desktop-suppliers-active'],
    queryFn: () => suppliers.list({ limit: 100, isActive: true }),
  });

  const branchQuery = useQuery<{ items: BranchSummary[]; total: number }>({
    queryKey: ['desktop-branches'],
    queryFn: () => branches.list(true),
  });

  const createMut = useMutation({
    mutationFn: (data: PurchaseCreateInput) => purchases.create(data),
    onSuccess: (purchase) => {
      void qc.invalidateQueries({ queryKey: ['purchases'] });
      navigate(`/purchases/${purchase.id}`);
    },
    onError: (err: Error) => setError(err.message || (lang === 'ar' ? 'تعذر إنشاء الطلب' : 'Could not create purchase')),
  });

  const total = items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitCost || 0)), 0);

  const updateItem = (index: number, updates: Partial<LineItem>) => {
    setItems(current => current.map((item, idx) => idx === index ? { ...item, ...updates } : item));
  };

  const addItem = () => setItems(current => [...current, emptyLine()]);
  const removeItem = (index: number) => {
    setItems(current => current.length === 1 ? current : current.filter((_, idx) => idx !== index));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!supplierId) {
      setError(t.supplierError);
      return;
    }
    if (!branchId) {
      setError(t.branchError);
      return;
    }

    const invalidItem = items.find(item => !item.model.trim() || item.quantity < 1 || item.unitCost < 0);
    if (invalidItem) {
      setError(t.itemError);
      return;
    }

    createMut.mutate({
      supplierId,
      branchId,
      notes,
      items: items.map(item => ({
        model: item.model.trim(),
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost),
        vin: item.vin?.trim() || undefined,
      })),
    });
  };

  return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="page-heading">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button type="button" className="secondary-action" onClick={() => navigate('/purchases')}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <span className="eyebrow">{lang === 'ar' ? 'المشتريات' : 'Procurement'}</span>
            <h1>{t.title}</h1>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="surface-panel" style={{ maxWidth: 900, margin: '0 auto' }}>
        {error && <div className="inline-error" style={{ marginBottom: 16 }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}>
          <label className="field-label">
            <span>{t.supplier}</span>
            <select value={supplierId} onChange={event => setSupplierId(event.target.value)} disabled={supplierQuery.isLoading}>
              <option value="">{t.selectSupplier}</option>
              {(supplierQuery.data?.items ?? []).map(supplier => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </label>

          <label className="field-label">
            <span>{t.branch}</span>
            <select value={branchId} onChange={event => setBranchId(event.target.value)} disabled={branchQuery.isLoading}>
              <option value="">{t.selectBranch}</option>
              {(branchQuery.data?.items ?? []).map(branch => (
                <option key={branch.id} value={branch.id}>{lang === 'ar' ? branch.nameAr : branch.nameEn}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="card-section" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong>{t.items}</strong>
            <button type="button" className="secondary-action" onClick={addItem}><Plus size={15} /> {t.addItem}</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((item, index) => (
              <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) 100px 140px 42px', gap: 10, alignItems: 'center' }}>
                <input
                  value={item.model}
                  onChange={event => updateItem(index, { model: event.target.value })}
                  placeholder={t.model}
                  className="text-input"
                />
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={event => updateItem(index, { quantity: Number(event.target.value || 1) })}
                  placeholder={t.quantity}
                  className="text-input"
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={item.unitCost}
                  onChange={event => updateItem(index, { unitCost: Number(event.target.value || 0) })}
                  placeholder={t.unitCost}
                  className="text-input"
                />
                <button type="button" className="icon-button danger" onClick={() => removeItem(index)} title={t.remove} disabled={items.length === 1}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <label className="field-label" style={{ marginBottom: 16 }}>
          <span>{t.notes}</span>
          <textarea value={notes} onChange={event => setNotes(event.target.value)} rows={3} className="text-input" />
        </label>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span className="eyebrow">{t.total}</span>
          <strong style={{ fontSize: 22 }}>{total.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 })}</strong>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" className="secondary-action" onClick={() => navigate('/purchases')}>
            {t.cancel}
          </button>
          <button type="submit" className="primary-action" disabled={createMut.isPending}>
            {createMut.isPending ? (lang === 'ar' ? 'جارٍ الإنشاء...' : 'Creating...') : t.save}
          </button>
        </div>
      </form>
    </section>
  );
}
