import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Pencil, Trash2, RefreshCw, X, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { financingCompanies, type FinancingCompanyRecord, type FinancingCompanyInput } from '../api';

type Lang = 'en' | 'ar';

const T = {
  en: {
    title: 'Financing Companies',
    subtitle: 'Manage installment and financing partners',
    eyebrow: 'Installment partners',
    add: 'Add company',
    refresh: 'Refresh',
    name: 'Company name',
    whatsappNumber: 'WhatsApp number',
    sortOrder: 'Sort order',
    active: 'Active',
    inactive: 'Inactive',
    noData: 'No financing companies yet.',
    saving: 'Saving…',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    confirmDelete: 'Delete this company?',
    deleteWarning: 'This cannot be undone. Companies in use by active requests cannot be deleted.',
    confirm: 'Confirm',
    createdAt: 'Created',
    addTitle: 'New Financing Company',
    editTitle: 'Edit Financing Company',
    required: 'Name is required',
    requiredWhatsApp: 'WhatsApp number is required',
    invalidWhatsApp: 'WhatsApp number must be a valid phone number',
  },
  ar: {
    title: 'شركات التمويل',
    subtitle: 'إدارة شركاء التقسيط والتمويل',
    eyebrow: 'شركاء التقسيط',
    add: 'إضافة شركة',
    refresh: 'تحديث',
    name: 'اسم الشركة',
    whatsappNumber: 'رقم واتساب',
    sortOrder: 'الترتيب',
    active: 'نشطة',
    inactive: 'غير نشطة',
    noData: 'لا توجد شركات تمويل حتى الآن.',
    saving: 'جاري الحفظ…',
    save: 'حفظ',
    cancel: 'إلغاء',
    edit: 'تعديل',
    delete: 'حذف',
    confirmDelete: 'حذف هذه الشركة؟',
    deleteWarning: 'لا يمكن التراجع. الشركات المرتبطة بطلبات نشطة لا يمكن حذفها.',
    confirm: 'تأكيد',
    createdAt: 'أُضيفت',
    addTitle: 'شركة تمويل جديدة',
    editTitle: 'تعديل شركة التمويل',
    required: 'الاسم مطلوب',
    requiredWhatsApp: 'رقم واتساب مطلوب',
    invalidWhatsApp: 'رقم واتساب غير صحيح',
  },
};

interface FormState {
  name: string;
  whatsappNumber: string;
  isActive: boolean;
  sortOrder: number;
}

const emptyForm: FormState = { name: '', whatsappNumber: '', isActive: true, sortOrder: 0 };
const whatsappPattern = /^\+?[0-9\s-]{8,20}$/;


export default function FinancingCompanies({ lang }: { lang: Lang }) {
  const t = T[lang];
  const isRtl = lang === 'ar';
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<FinancingCompanyRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FinancingCompanyRecord | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['desktop-financing-companies'],
    queryFn: financingCompanies.listAll,
  });

  const companies = data ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['desktop-financing-companies'] });
  };

  const createMut = useMutation({
    mutationFn: (input: FinancingCompanyInput) => financingCompanies.create(input),
    onSuccess: () => { invalidate(); closeForm(); },
    onError: (err: Error) => setFormError(err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<FinancingCompanyInput> }) =>
      financingCompanies.update(id, input),
    onSuccess: () => { invalidate(); closeForm(); },
    onError: (err: Error) => setFormError(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => financingCompanies.remove(id),
    onSuccess: () => { invalidate(); setDeleteTarget(null); },
    onError: (err: Error) => setFormError(err.message),
  });

  const openAdd = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (company: FinancingCompanyRecord) => {
    setEditTarget(company);
    setForm({ name: company.name, whatsappNumber: company.whatsappNumber ?? '', isActive: company.isActive, sortOrder: company.sortOrder });
    setFormError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditTarget(null);
    setFormError('');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError(t.required); return; }
    if (!form.whatsappNumber.trim()) { setFormError(t.requiredWhatsApp); return; }
    if (!whatsappPattern.test(form.whatsappNumber.trim())) { setFormError(t.invalidWhatsApp); return; }
    const payload: FinancingCompanyInput = {
      name: form.name.trim(),
      whatsappNumber: form.whatsappNumber.trim(),
      isActive: form.isActive,
      sortOrder: form.sortOrder,
    };
    if (editTarget) {
      updateMut.mutate({ id: editTarget.id, input: payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString(isRtl ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Page header */}
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t.eyebrow}</span>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <div className="report-controls">
          <button className="secondary-action" onClick={() => refetch()}>
            <RefreshCw size={16} /> {t.refresh}
          </button>
          <button className="primary-action" onClick={openAdd}>
            <Plus size={16} /> {t.add}
          </button>
        </div>
      </div>

      {/* States */}
      {isLoading && (
        <div className="inventory-grid">
          {[1, 2, 3].map(n => <div className="metric-card skeleton" key={n} style={{ height: 90 }} />)}
        </div>
      )}
      {isError && (
        <div className="state-panel">
          <p>{isRtl ? 'تعذر تحميل البيانات.' : 'Could not load data.'}</p>
          <button className="secondary-action" onClick={() => refetch()}>
            {isRtl ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      )}
      {!isLoading && !isError && companies.length === 0 && (
        <div className="state-panel">
          <Building2 size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
          <p>{t.noData}</p>
          <button className="primary-action" onClick={openAdd}><Plus size={16} /> {t.add}</button>
        </div>
      )}

      {/* Companies table */}
      {!isLoading && !isError && companies.length > 0 && (
        <div className="surface-panel" style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{
                background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                color: '#fff',
              }}>
                <th style={{ padding: '0.75rem 1rem', textAlign: isRtl ? 'right' : 'left', fontWeight: 600 }}>#</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: isRtl ? 'right' : 'left', fontWeight: 600 }}>{t.name}</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: isRtl ? 'right' : 'left', fontWeight: 600 }}>{t.whatsappNumber}</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600 }}>{isRtl ? 'الحالة' : 'Status'}</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600 }}>{t.sortOrder}</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: isRtl ? 'right' : 'left', fontWeight: 600 }}>{t.createdAt}</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600 }}>{isRtl ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c, idx) => (
                <tr
                  key={c.id}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: idx % 2 === 0 ? 'transparent' : 'var(--bg-2)',
                    transition: 'background 0.15s',
                  }}
                >
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-3)', fontFamily: 'monospace' }}>
                    {c.sortOrder || idx + 1}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: c.isActive ? 'var(--green-light, #22c55e)' : 'var(--text-3)',
                        flexShrink: 0,
                      }} />
                      {c.name}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    <span className={`status-pill ${c.isActive ? 'status-available' : 'status-sold'}`}>
                      {c.isActive ? t.active : t.inactive}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: 'var(--text-3)' }}>
                    {c.sortOrder}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-3)', fontSize: '0.8125rem' }}>
                    {formatDate(c.createdAt)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                      <button
                        className="secondary-action"
                        style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
                        onClick={() => openEdit(c)}
                        title={t.edit}
                      >
                        <Pencil size={14} /> {t.edit}
                      </button>
                      <button
                        style={{
                          padding: '0.375rem 0.75rem', fontSize: '0.8125rem',
                          background: 'var(--red-light, #ef4444)', color: '#fff',
                          border: 'none', borderRadius: '0.5rem', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '0.375rem',
                        }}
                        onClick={() => setDeleteTarget(c)}
                        title={t.delete}
                      >
                        <Trash2 size={14} /> {t.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit modal */}
      {showForm && (
        <div className="modal-backdrop" style={{ display: 'flex', position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, alignItems: 'center', justifyContent: 'center' }}>
          <div className="payment-modal" style={{ width: 'min(480px, 95%)', position: 'relative' }}>
            <button type="button" className="drawer-close" onClick={closeForm}><X size={18} /></button>
            <h2 style={{ marginBottom: '1.5rem' }}>{editTarget ? t.editTitle : t.addTitle}</h2>
            <form onSubmit={handleSubmit} className="transfer-form">
              {formError && <div className="inline-error">{formError}</div>}
              <label>
                <span>{t.name} *</span>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={isRtl ? 'مثال: شركة الأهلي للتمويل' : 'e.g. Al-Ahli Financing Co.'}
                  required
                  autoFocus
                />
              </label>
              <label>
                <span>{t.whatsappNumber} *</span>
                <input
                  value={form.whatsappNumber}
                  onChange={e => setForm(f => ({ ...f, whatsappNumber: e.target.value }))}
                  placeholder={isRtl ? '+966...' : '+966...'}
                  required
                />
              </label>
              <label>
                <span>{t.sortOrder}</span>
                <input
                  type="number"
                  min={0}
                  value={form.sortOrder}
                  onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: form.isActive ? 'var(--blue)' : 'var(--text-3)', display: 'flex' }}
                >
                  {form.isActive ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                </button>
                <span style={{ fontWeight: 500 }}>{form.isActive ? t.active : t.inactive}</span>
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="secondary-action" onClick={closeForm} style={{ flex: 1 }}>
                  <X size={15} /> {t.cancel}
                </button>
                <button type="submit" className="primary-action" disabled={isPending} style={{ flex: 1 }}>
                  <Save size={15} /> {isPending ? t.saving : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="modal-backdrop" style={{ display: 'flex', position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, alignItems: 'center', justifyContent: 'center' }}>
          <div className="payment-modal" style={{ width: 'min(400px, 95%)' }}>
            <h2 style={{ marginBottom: '0.75rem', fontSize: '1.125rem' }}>{t.confirmDelete}</h2>
            <p style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--text-2)' }}>
              <strong>{deleteTarget.name}</strong><br />{t.deleteWarning}
            </p>
            {formError && <div className="inline-error">{formError}</div>}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="secondary-action" style={{ flex: 1 }} onClick={() => { setDeleteTarget(null); setFormError(''); }}>
                <X size={15} /> {t.cancel}
              </button>
              <button
                style={{ flex: 1, background: 'var(--red-light, #ef4444)', color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.625rem 1rem', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                disabled={deleteMut.isPending}
                onClick={() => { setFormError(''); deleteMut.mutate(deleteTarget.id); }}
              >
                <Trash2 size={15} /> {deleteMut.isPending ? '…' : t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
