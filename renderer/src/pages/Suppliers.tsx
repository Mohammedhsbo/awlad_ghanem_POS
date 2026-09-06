import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Edit3, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { suppliers, type SupplierInput, type SupplierRecord } from '../api';

type Lang = 'en' | 'ar';
const emptyForm: SupplierInput = { name: '', contactPerson: '', phone: '', email: '', address: '', notes: '' };

export default function Suppliers({ lang }: { lang: Lang }) {
  const isRtl = lang === 'ar';
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<SupplierInput>(emptyForm);
  const [editing, setEditing] = useState<SupplierRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const list = useQuery({
    queryKey: ['desktop-suppliers', search],
    queryFn: async () => {
      const result = await suppliers.list({ search, limit: 100, isActive: true });
      return Array.isArray(result) ? result : result.items || [];
    },
  });
  const save = useMutation({
    mutationFn: () => editing ? suppliers.update(editing.id, form) : suppliers.create(form),
    onSuccess: () => {
      setForm(emptyForm);
      setEditing(null);
      setShowForm(false);
      setError('');
      void qc.invalidateQueries({ queryKey: ['desktop-suppliers'] });
    },
    onError: (err: Error) => setError(err.message || (isRtl ? 'تعذر حفظ المورد' : 'Could not save supplier')),
  });
  const remove = useMutation({
    mutationFn: (id: string) => suppliers.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['desktop-suppliers'] }),
    onError: (err: Error) => setError(err.message || (isRtl ? 'تعذر حذف المورد' : 'Could not delete supplier')),
  });
  const setField = (key: keyof SupplierInput, value: string) => setForm(current => ({ ...current, [key]: value }));
  const openCreate = () => { setEditing(null); setForm(emptyForm); setError(''); setShowForm(true); };
  const openEdit = (supplier: SupplierRecord) => {
    setEditing(supplier);
    setForm({ name: supplier.name, contactPerson: supplier.contactPerson || '', phone: supplier.phone || '', email: supplier.email || '', address: supplier.address || '', notes: supplier.notes || '' });
    setError('');
    setShowForm(true);
  };
  const rows = list.data || [];

  return <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
    <div className="page-heading">
      <div><span className="eyebrow">{isRtl ? 'المشتريات' : 'Procurement'}</span><h1>{isRtl ? 'الموردون' : 'Suppliers'}</h1><p>{isRtl ? 'إدارة جهات التوريد المرتبطة بالمشتريات.' : 'Manage suppliers connected to purchase orders.'}</p></div>
      <div className="report-controls"><button className="secondary-action" onClick={() => list.refetch()}><RefreshCw size={16} /></button><button className="primary-action" onClick={openCreate}><Plus size={16} /> {isRtl ? 'مورد جديد' : 'New supplier'}</button></div>
    </div>
    <div className="toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder={isRtl ? 'ابحث بالاسم أو الهاتف...' : 'Search name or phone...'} /></div></div>
    {list.isLoading && <div className="state-panel">{isRtl ? 'جاري تحميل الموردين...' : 'Loading suppliers...'}</div>}
    {list.isError && <div className="state-panel">{isRtl ? 'تعذر تحميل الموردين.' : 'Could not load suppliers.'}</div>}
    {!list.isLoading && !list.isError && rows.length === 0 && <div className="state-panel">{isRtl ? 'لا توجد نتائج.' : 'No suppliers found.'}</div>}
    {!list.isLoading && !list.isError && rows.length > 0 && <div className="supplier-list">{rows.map(supplier => <article className="supplier-row" key={supplier.id}><div className="customer-avatar"><Building2 size={18} /></div><div className="customer-main"><strong>{supplier.name}</strong><span>{supplier.contactPerson || supplier.phone || supplier.email || (isRtl ? 'لا توجد بيانات اتصال' : 'No contact details')}</span></div><span className={supplier.isActive ? 'status-pill' : 'status-text'}>{supplier.isActive ? (isRtl ? 'نشط' : 'Active') : (isRtl ? 'غير نشط' : 'Inactive')}</span><div className="row-actions"><button className="icon-button" title={isRtl ? 'تعديل' : 'Edit'} onClick={() => openEdit(supplier)}><Edit3 size={15} /></button><button className="icon-button" title={isRtl ? 'حذف' : 'Delete'} onClick={() => { if (window.confirm(isRtl ? 'حذف هذا المورد؟' : 'Delete this supplier?')) remove.mutate(supplier.id); }}><Trash2 size={15} /></button></div></article>)}</div>}
    {showForm && <div className="modal-backdrop"><form className="payment-modal supplier-form" onSubmit={event => { event.preventDefault(); save.mutate(); }}><button type="button" className="drawer-close" onClick={() => setShowForm(false)}><X size={18} /></button><h2><Building2 size={20} /> {editing ? (isRtl ? 'تعديل المورد' : 'Edit supplier') : (isRtl ? 'إنشاء مورد' : 'Create supplier')}</h2>{error && <div className="inline-error">{error}</div>}<label>{isRtl ? 'اسم المورد' : 'Supplier name'}<input value={form.name} onChange={event => setField('name', event.target.value)} required /></label><label>{isRtl ? 'جهة الاتصال' : 'Contact person'}<input value={form.contactPerson} onChange={event => setField('contactPerson', event.target.value)} /></label><label>{isRtl ? 'الهاتف' : 'Phone'}<input value={form.phone} onChange={event => setField('phone', event.target.value)} /></label><label>{isRtl ? 'البريد الإلكتروني' : 'Email'}<input type="email" value={form.email} onChange={event => setField('email', event.target.value)} /></label><label>{isRtl ? 'العنوان' : 'Address'}<input value={form.address} onChange={event => setField('address', event.target.value)} /></label><label>{isRtl ? 'ملاحظات' : 'Notes'}<input value={form.notes} onChange={event => setField('notes', event.target.value)} /></label><div className="modal-actions"><button type="button" className="secondary-action" onClick={() => setShowForm(false)}>{isRtl ? 'إلغاء' : 'Cancel'}</button><button className="primary-action" disabled={save.isPending || !form.name.trim()}>{save.isPending ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'حفظ المورد' : 'Save supplier')}</button></div></form></div>}
  </section>;
}
