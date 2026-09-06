import { ShoppingBag, X } from 'lucide-react';
import type { MotorcycleSearchResult, CustomerSearchResult } from '../api';

type Lang = 'en' | 'ar';

const T = {
  en: {
    title: 'Order Review',
    customer: 'Customer',
    phone: 'Phone',
    email: 'Email',
    selectedItems: 'Selected Motorcycles',
    vin: 'VIN',
    model: 'Model',
    year: 'Year',
    price: 'Price',
    remove: 'Remove',
    subtotal: 'Subtotal',
    discount: 'Discount',
    total: 'Total',
    notes: 'Notes',
    notesPlaceholder: 'Order notes (optional)...',
    saveAsDraft: 'Save as Draft',
    confirmOrder: 'Confirm Order',
    cancel: 'Cancel',
    noItems: 'No motorcycles selected',
  },
  ar: {
    title: 'مراجعة الطلب',
    customer: 'العميل',
    phone: 'الهاتف',
    email: 'البريد',
    selectedItems: 'الدراجات المختارة',
    vin: 'رقم الهيكل',
    model: 'الموديل',
    year: 'السنة',
    price: 'السعر',
    remove: 'إزالة',
    subtotal: 'المجموع الفرعي',
    discount: 'الخصم',
    total: 'الإجمالي',
    notes: 'ملاحظات',
    notesPlaceholder: 'ملاحظات الطلب (اختياري)...',
    saveAsDraft: 'حفظ كمسودة',
    confirmOrder: 'تأكيد الطلب',
    cancel: 'إلغاء',
    noItems: 'لم يتم اختيار دراجات',
  },
};

interface Props {
  lang: Lang;
  customer: CustomerSearchResult;
  motorcycles: MotorcycleSearchResult[];
  discount: number;
  notes: string;
  onDiscountChange: (discount: number) => void;
  onNotesChange: (notes: string) => void;
  onRemoveMotorcycle: (id: string) => void;
  onSaveDraft: () => void;
  onConfirm: () => void;
  onClose: () => void;
  isLoading?: boolean;
}

export default function OrderReview({
  lang,
  customer,
  motorcycles,
  discount,
  notes,
  onDiscountChange,
  onNotesChange,
  onRemoveMotorcycle,
  onSaveDraft,
  onConfirm,
  onClose,
  isLoading = false,
}: Props) {
  const t = T[lang];
  const isRtl = lang === 'ar';

  const subtotal = motorcycles.reduce((sum, m) => sum + m.price, 0);
  const total = Math.max(0, subtotal - discount);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-EG', {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div
      className="pos-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && !isLoading && onClose()}
      style={{ direction: isRtl ? 'rtl' : 'ltr' }}
    >
      <div
        className="pos-modal"
        style={{
          maxWidth: 700,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem',
            borderBottom: '1px solid var(--pos-border)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <ShoppingBag size={20} style={{ color: 'var(--blue-light)' }} />
          <h2 style={{ flex: 1, margin: 0, fontSize: '1rem', fontWeight: 700 }}>
            {t.title}
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="btn btn-ghost"
            style={{ padding: '0.3rem' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {/* Customer info */}
          <div
            className="pos-card"
            style={{ padding: '1rem', marginBottom: '1.5rem' }}
          >
            <div
              style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                fontWeight: 700,
                color: 'var(--text-3)',
                marginBottom: '0.5rem',
              }}
            >
              {t.customer}
            </div>
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
              {customer.name}
            </div>
            <div
              style={{
                fontSize: '0.875rem',
                color: 'var(--text-2)',
                fontFamily: 'monospace',
              }}
            >
              {t.phone}: {customer.phone}
            </div>
            {customer.email && (
              <div style={{ fontSize: '0.875rem', color: 'var(--text-2)' }}>
                {t.email}: {customer.email}
              </div>
            )}
          </div>

          {/* Selected motorcycles */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div
              style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                fontWeight: 700,
                color: 'var(--text-3)',
                marginBottom: '0.75rem',
              }}
            >
              {t.selectedItems} ({motorcycles.length})
            </div>
            {motorcycles.length === 0 ? (
              <div
                className="pos-card"
                style={{
                  padding: '2rem',
                  textAlign: 'center',
                  color: 'var(--text-3)',
                  fontSize: '0.875rem',
                }}
              >
                {t.noItems}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {motorcycles.map((moto) => (
                  <div
                    key={moto.id}
                    className="pos-card"
                    style={{
                      padding: '0.875rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '0.9rem',
                          marginBottom: '0.25rem',
                        }}
                      >
                        {lang === 'ar' ? moto.brand.nameAr : moto.brand.nameEn}{' '}
                        {moto.model}
                      </div>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-2)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {t.vin}: {moto.vin} • {t.year}: {moto.year}
                        {moto.color && ` • ${moto.color}`}
                      </div>
                    </div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '1rem',
                        color: 'var(--blue-light)',
                      }}
                    >
                      {formatCurrency(moto.price)}
                    </div>
                    <button
                      onClick={() => onRemoveMotorcycle(moto.id)}
                      disabled={isLoading}
                      className="btn btn-ghost"
                      style={{ padding: '0.375rem', color: 'var(--red-light)' }}
                      title={t.remove}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Order summary */}
          <div className="pos-card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '0.75rem',
                fontSize: '0.875rem',
              }}
            >
              <span style={{ color: 'var(--text-2)' }}>{t.subtotal}</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                {formatCurrency(subtotal)}
              </span>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  color: 'var(--text-2)',
                  marginBottom: '0.375rem',
                }}
              >
                {t.discount}
              </label>
              <input
                type="number"
                value={discount}
                onChange={(e) =>
                  onDiscountChange(Math.max(0, Math.min(subtotal, Number(e.target.value))))
                }
                disabled={isLoading}
                min={0}
                max={subtotal}
                step={100}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  background: 'var(--pos-bg)',
                  border: '1px solid var(--pos-border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-1)',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace',
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--pos-border)',
                fontWeight: 700,
                fontSize: '1.125rem',
              }}
            >
              <span>{t.total}</span>
              <span
                style={{ fontFamily: 'monospace', color: 'var(--green-light)' }}
              >
                {formatCurrency(total)}
              </span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                fontWeight: 700,
                color: 'var(--text-3)',
                marginBottom: '0.5rem',
              }}
            >
              {t.notes}
            </label>
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              disabled={isLoading}
              placeholder={t.notesPlaceholder}
              rows={3}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: 'var(--pos-card)',
                border: '1px solid var(--pos-border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-1)',
                fontSize: '0.875rem',
                resize: 'vertical',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem',
            borderTop: '1px solid var(--pos-border)',
            display: 'flex',
            gap: '0.75rem',
            background: 'var(--pos-surface)',
          }}
        >
          <button
            onClick={onClose}
            disabled={isLoading}
            className="btn btn-ghost"
            style={{ flex: '0 0 auto' }}
          >
            {t.cancel}
          </button>
          <button
            onClick={onSaveDraft}
            disabled={isLoading || motorcycles.length === 0}
            className="btn"
            style={{
              flex: 1,
              background: 'var(--pos-border)',
              color: 'var(--text-1)',
            }}
          >
            {t.saveAsDraft}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading || motorcycles.length === 0}
            className="btn btn-primary"
            style={{ flex: 1 }}
          >
            {t.confirmOrder}
          </button>
        </div>
      </div>
    </div>
  );
}
