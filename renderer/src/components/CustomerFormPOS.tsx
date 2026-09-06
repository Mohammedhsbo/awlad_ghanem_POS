import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Save, AlertTriangle } from 'lucide-react';
import { customers, type CustomerInput, type CustomerDetail } from '../api';

type Lang = 'en' | 'ar';

const T = {
  en: {
    createTitle: 'Create Customer',
    editTitle: 'Edit Customer',
    name: 'Name',
    namePlaceholder: 'Customer full name',
    phone: 'Phone',
    phonePlaceholder: '+966 50 123 4567',
    email: 'Email (optional)',
    emailPlaceholder: 'customer@example.com',
    nationalId: 'National ID (optional)',
    nationalIdPlaceholder: '1234567890',
    notes: 'Notes (optional)',
    notesPlaceholder: 'Internal notes…',
    required: 'Required',
    cancel: 'Cancel',
    save: 'Save',
    creating: 'Creating…',
    updating: 'Updating…',
    duplicateWarning: 'A customer with this phone/email may already exist.',
    searchFirst: 'Search first to avoid duplicates.',
  },
  ar: {
    createTitle: 'إنشاء عميل',
    editTitle: 'تعديل العميل',
    name: 'الاسم',
    namePlaceholder: 'اسم العميل الكامل',
    phone: 'رقم الهاتف',
    phonePlaceholder: '٩٦٦٥٠١٢٣٤٥٦٧+',
    email: 'البريد الإلكتروني (اختياري)',
    emailPlaceholder: 'customer@example.com',
    nationalId: 'رقم الهوية (اختياري)',
    nationalIdPlaceholder: '١٢٣٤٥٦٧٨٩٠',
    notes: 'ملاحظات (اختياري)',
    notesPlaceholder: 'ملاحظات داخلية…',
    required: 'مطلوب',
    cancel: 'إلغاء',
    save: 'حفظ',
    creating: 'جاري الإنشاء…',
    updating: 'جاري التحديث…',
    duplicateWarning: 'قد يكون هناك عميل بهذا الهاتف/البريد.',
    searchFirst: 'ابحث أولاً لتجنب التكرار.',
  },
};

interface Props {
  lang: Lang;
  customer?: CustomerDetail;
  onSuccess: (customer: CustomerDetail) => void;
  onClose: () => void;
}

export default function CustomerFormPOS({ lang, customer, onSuccess, onClose }: Props) {
  const t = T[lang];
  const isRtl = lang === 'ar';
  const isEditMode = !!customer;

  const [form, setForm] = useState<CustomerInput>({
    name: customer?.name || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    nationalId: customer?.nationalId || '',
    notes: customer?.notes || '',
  });

  const [formError, setFormError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: (data: CustomerInput) => customers.create(data),
    onSuccess: (data) => onSuccess(data),
    onError: (e: Error) => setFormError(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (data: CustomerInput) => customers.update(customer!.id, data),
    onSuccess: (data) => onSuccess(data),
    onError: (e: Error) => setFormError(e.message),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.name.trim()) {
      setFormError('Name is required');
      return;
    }
    if (!form.phone.trim()) {
      setFormError('Phone is required');
      return;
    }

    const payload: CustomerInput = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email?.trim() || undefined,
      nationalId: form.nationalId?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
    };

    if (isEditMode) {
      updateMut.mutate(payload);
    } else {
      createMut.mutate(payload);
    }
  }

  const isBusy = createMut.isPending || updateMut.isPending;

  return (
    <div
      className="pos-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && !isBusy && onClose()}
      style={{ direction: isRtl ? 'rtl' : 'ltr' }}
    >
      <div className="pos-modal" style={{ maxWidth: 500, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--pos-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: '1rem', fontWeight: 700 }}>
            {isEditMode ? t.editTitle : t.createTitle}
          </h2>
          <button
            onClick={onClose}
            disabled={isBusy}
            className="btn btn-ghost"
            style={{ padding: '0.3rem' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Duplicate warning (only for create) */}
          {!isEditMode && (
            <div
              style={{
                padding: '0.75rem',
                background: 'rgba(217,119,6,0.1)',
                border: '1px solid rgba(217,119,6,0.3)',
                borderRadius: 'var(--radius)',
                display: 'flex',
                gap: '0.5rem',
                fontSize: '0.8rem',
                color: 'var(--amber-light)',
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
              <div>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{t.duplicateWarning}</div>
                <div style={{ opacity: 0.9 }}>{t.searchFirst}</div>
              </div>
            </div>
          )}

          {/* Error message */}
          {formError && (
            <div
              style={{
                padding: '0.75rem',
                background: 'rgba(220,38,38,0.1)',
                border: '1px solid rgba(220,38,38,0.3)',
                borderRadius: 'var(--radius)',
                fontSize: '0.85rem',
                color: 'var(--red-light)',
              }}
            >
              {formError}
            </div>
          )}

          {/* Name */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-2)' }}>
              {t.name} <span style={{ color: 'var(--red-light)' }}>*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t.namePlaceholder}
              required
              autoFocus
              className="pos-input"
            />
          </div>

          {/* Phone */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-2)' }}>
              {t.phone} <span style={{ color: 'var(--red-light)' }}>*</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder={t.phonePlaceholder}
              required
              className="pos-input"
            />
          </div>

          {/* Email */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-2)' }}>
              {t.email}
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder={t.emailPlaceholder}
              className="pos-input"
            />
          </div>

          {/* National ID */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-2)' }}>
              {t.nationalId}
            </label>
            <input
              type="text"
              value={form.nationalId}
              onChange={(e) => setForm((f) => ({ ...f, nationalId: e.target.value }))}
              placeholder={t.nationalIdPlaceholder}
              className="pos-input"
            />
          </div>

          {/* Notes */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-2)' }}>
              {t.notes}
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder={t.notesPlaceholder}
              rows={3}
              className="pos-input"
              style={{ resize: 'vertical', minHeight: 60 }}
            />
          </div>
        </form>

        {/* Footer */}
        <div style={{ padding: '1rem', borderTop: '1px solid var(--pos-border)', display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="btn btn-ghost"
            style={{ flex: 1 }}
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isBusy}
            className="btn btn-primary"
            style={{ flex: 1 }}
          >
            {isBusy ? (
              <>
                <div className="spinner" style={{ width: 14, height: 14 }} />
                {isEditMode ? t.updating : t.creating}
              </>
            ) : (
              <>
                <Save size={16} />
                {t.save}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
