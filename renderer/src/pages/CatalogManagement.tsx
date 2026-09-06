import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Plus, RefreshCw, Tags, Trash2, X } from 'lucide-react';
import { brands, categories, type BrandSummary, type CategorySummary } from '../api';

type Lang = 'en' | 'ar';
type CatalogItem = (BrandSummary | CategorySummary) & { kind: 'brand' | 'category' };

export default function CatalogManagement({ lang }: { lang: Lang }) {
  const isRtl = lang === 'ar';
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'brands' | 'categories'>('brands');
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nameAr: '', nameEn: '', parentId: '', sortOrder: '0' });
  const [error, setError] = useState('');
  const brandQuery = useQuery({ queryKey: ['catalog-brands'], queryFn: () => brands.list({}) });
  const categoryQuery = useQuery({ queryKey: ['catalog-categories'], queryFn: () => categories.list({ flat: true }) });
  const refresh = () => {
    void brandQuery.refetch();
    void categoryQuery.refetch();
  };
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['catalog-brands'] });
    void queryClient.invalidateQueries({ queryKey: ['catalog-categories'] });
  };
  const save = useMutation({
    mutationFn: () => {
      const sortOrder = Number(form.sortOrder) || 0;
      if (tab === 'brands') {
        return editing?.kind === 'brand'
          ? brands.update(editing.id, { nameAr: form.nameAr, nameEn: form.nameEn, sortOrder })
          : brands.create({ nameAr: form.nameAr, nameEn: form.nameEn, sortOrder });
      }
      return editing?.kind === 'category'
        ? categories.update(editing.id, { nameAr: form.nameAr, nameEn: form.nameEn, parentId: form.parentId || null, sortOrder })
        : categories.create({ nameAr: form.nameAr, nameEn: form.nameEn, parentId: form.parentId || undefined, sortOrder });
    },
    onSuccess: () => { setEditing(null); setShowForm(false); setError(''); invalidate(); },
    onError: (reason: Error) => setError(reason.message || (isRtl ? 'تعذر حفظ البيانات.' : 'Could not save the record.')),
  });
  const remove = useMutation({
    mutationFn: (item: CatalogItem) => item.kind === 'brand' ? brands.remove(item.id) : categories.remove(item.id),
    onSuccess: invalidate,
    onError: (reason: Error) => setError(reason.message || (isRtl ? 'تعذر حذف البيانات.' : 'Could not delete the record.')),
  });
  const openCreate = () => { setEditing(null); setShowForm(true); setForm({ nameAr: '', nameEn: '', parentId: '', sortOrder: '0' }); setError(''); };
  const openEdit = (item: CatalogItem) => { setEditing(item); setShowForm(true); setForm({ nameAr: item.nameAr, nameEn: item.nameEn, parentId: 'parentId' in item ? item.parentId ?? '' : '', sortOrder: String(item.sortOrder ?? 0) }); setError(''); };
  const submit = (event: FormEvent) => { event.preventDefault(); setError(''); save.mutate(); };
  const activeItems: CatalogItem[] = tab === 'brands'
    ? (brandQuery.data ?? []).map((item) => ({ ...item, kind: 'brand' as const }))
    : (categoryQuery.data ?? []).map((item) => ({ ...item, kind: 'category' as const }));
  const loading = brandQuery.isLoading || categoryQuery.isLoading;
  const categoryOptions = categoryQuery.data ?? [];
  const label = (item: { nameAr: string; nameEn: string }) => isRtl ? item.nameAr : item.nameEn;

  return <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
    <div className="page-heading">
      <div><span className="eyebrow">{isRtl ? 'بيانات المنتجات' : 'Product data'}</span><h1>{isRtl ? 'العلامات والفئات' : 'Brands & categories'}</h1><p>{isRtl ? 'أدر البيانات المستخدمة في المخزون ونقطة البيع.' : 'Manage the catalog data used by inventory and point of sale.'}</p></div>
      <div className="report-controls"><button className="secondary-action" onClick={refresh}><RefreshCw size={16} /> {isRtl ? 'تحديث' : 'Refresh'}</button><button className="primary-action" onClick={openCreate}><Plus size={16} /> {isRtl ? 'إضافة' : 'Add'} {tab === 'brands' ? (isRtl ? 'علامة' : 'brand') : (isRtl ? 'فئة' : 'category')}</button></div>
    </div>
    <div className="data-table-tabs"><button className={tab === 'brands' ? 'active' : ''} onClick={() => { setTab('brands'); setEditing(null); setShowForm(false); }}>{isRtl ? 'العلامات التجارية' : 'Brands'} <b>{brandQuery.data?.length ?? 0}</b></button><button className={tab === 'categories' ? 'active' : ''} onClick={() => { setTab('categories'); setEditing(null); setShowForm(false); }}>{isRtl ? 'الفئات' : 'Categories'} <b>{categoryQuery.data?.length ?? 0}</b></button></div>
    {error && <div className="form-error" role="alert">{error}</div>}
    {loading && <div className="state-panel">{isRtl ? 'جاري التحميل...' : 'Loading...'}</div>}
    {!loading && activeItems.length === 0 && <div className="state-panel"><Tags size={20} /> {isRtl ? 'لا توجد بيانات.' : 'No records yet.'}</div>}
    {!loading && activeItems.length > 0 && <div className="surface-panel data-list-shell"><div className="data-table-header"><span>{isRtl ? 'الاسم' : 'Name'}</span><span>{isRtl ? 'الحالة' : 'Status'}</span><span>{isRtl ? 'الوحدات' : 'Units'}</span><span /></div>{activeItems.map((item) => <div className="data-table-row" key={item.id}><div className="catalog-name"><strong>{label(item)}</strong><small>{isRtl ? item.nameEn : item.nameAr}{item.kind === 'category' && item.path ? ` · ${item.path}` : ''}</small></div><span className={`status-pill ${item.isActive === false ? 'inactive' : ''}`}>{item.isActive === false ? (isRtl ? 'غير نشط' : 'Inactive') : (isRtl ? 'نشط' : 'Active')}</span><span>{item._count?.motorcycles ?? 0}</span><div className="row-actions"><button className="icon-button" title={isRtl ? 'تعديل' : 'Edit'} onClick={() => openEdit(item)}><Edit3 size={15} /></button><button className="icon-button" title={isRtl ? 'حذف' : 'Delete'} onClick={() => { if (window.confirm(isRtl ? 'حذف هذا السجل؟' : 'Delete this record?')) remove.mutate(item); }}><Trash2 size={15} /></button></div></div>)}</div>}
    {showForm && <div className="modal-backdrop"><form className="payment-modal catalog-modal" onSubmit={submit}><div className="panel-heading"><h2>{editing ? (isRtl ? 'تعديل' : 'Edit') : (isRtl ? 'إضافة' : 'Add')} {tab === 'brands' ? (isRtl ? 'علامة' : 'brand') : (isRtl ? 'فئة' : 'category')}</h2><button type="button" className="drawer-close" onClick={() => { setEditing(null); setShowForm(false); }}><X size={17} /></button></div><label className="input-label">{isRtl ? 'الاسم بالعربية' : 'Arabic name'}<input className="pos-input" value={form.nameAr} onChange={(event) => setForm({ ...form, nameAr: event.target.value })} required /></label><label className="input-label">{isRtl ? 'الاسم بالإنجليزية' : 'English name'}<input className="pos-input" value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} required /></label>{tab === 'categories' && <label className="input-label">{isRtl ? 'الفئة الرئيسية' : 'Parent category'}<select className="pos-input" value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })}><option value="">{isRtl ? 'بدون فئة رئيسية' : 'No parent'}</option>{categoryOptions.filter((item) => item.id !== editing?.id).map((item) => <option key={item.id} value={item.id}>{label(item)}</option>)}</select></label>}<label className="input-label">{isRtl ? 'الترتيب' : 'Sort order'}<input className="pos-input" type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} /></label>{error && <div className="form-error" role="alert">{error}</div>}<button className="primary-action" type="submit" disabled={save.isPending}>{save.isPending ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'حفظ' : 'Save')}</button></form></div>}
  </section>;
}