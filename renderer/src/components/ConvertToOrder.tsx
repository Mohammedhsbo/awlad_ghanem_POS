import { useState } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import type { ReservationDetail } from '../api';

type Lang = 'en' | 'ar';

const T = {
  en: {
    convertToOrder: 'Convert Reservation to Order',
    warning: 'This will create a sales order and mark the motorcycle as sold.',
    paymentReminder: 'Make sure payment has been received before converting.',
    depositPaid: 'Deposit Paid',
    remainingAmount: 'Remaining Amount',
    totalPrice: 'Total Price',
    notes: 'Notes',
    optionalNotes: 'Optional notes for the order...',
    cancel: 'Cancel',
    confirm: 'Convert to Order',
    converting: 'Converting...',
  },
  ar: {
    convertToOrder: 'تحويل الحجز إلى طلب',
    warning: 'سيتم إنشاء طلب بيع وتحديد حالة الدراجة كمباعة.',
    paymentReminder: 'تأكد من استلام الدفعة قبل التحويل.',
    depositPaid: 'العربون المدفوع',
    remainingAmount: 'المبلغ المتبقي',
    totalPrice: 'السعر الإجمالي',
    notes: 'ملاحظات',
    optionalNotes: 'ملاحظات اختيارية للطلب...',
    cancel: 'إلغاء',
    confirm: 'تحويل إلى طلب',
    converting: 'جاري التحويل...',
  },
};

interface Props {
  lang: Lang;
  reservation: ReservationDetail;
  onConfirm: (notes?: string) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function ConvertToOrder({
  lang,
  reservation,
  onConfirm,
  onCancel,
  isSubmitting,
}: Props) {
  const t = T[lang];
  const isRtl = lang === 'ar';
  const [notes, setNotes] = useState('');

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
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onCancel();
        }
      }}
    >
      <div className="pos-modal" style={{ maxWidth: 500, direction: isRtl ? 'rtl' : 'ltr' }}>
        <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>{t.convertToOrder}</h2>

        {/* Warning message */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            backgroundColor: 'rgba(251, 191, 36, 0.1)',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
          }}
        >
          <AlertCircle size={20} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '0.125rem' }} />
          <div>
            <div style={{ fontSize: '0.875rem', color: '#92400e', marginBottom: '0.25rem' }}>
              {t.warning}
            </div>
            <div style={{ fontSize: '0.8125rem', color: '#78350f', fontWeight: 600 }}>
              {t.paymentReminder}
            </div>
          </div>
        </div>

        {/* Payment summary */}
        <div
          style={{
            padding: '1rem',
            backgroundColor: 'var(--bg-2)',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-2)' }}>{t.totalPrice}</span>
            <span style={{ fontWeight: 600 }}>{formatCurrency(reservation.totalPrice)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-2)' }}>{t.depositPaid}</span>
            <span style={{ fontWeight: 600, color: 'var(--green-light)' }}>
              {formatCurrency(reservation.depositAmount)}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: '0.5rem',
              borderTop: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{t.remainingAmount}</span>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--blue-light)' }}>
              {formatCurrency(reservation.remainingAmount)}
            </span>
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>
            {t.notes}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t.optionalNotes}
            rows={3}
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '0.875rem',
              border: '1px solid var(--border)',
              borderRadius: '0.5rem',
              backgroundColor: 'var(--bg-2)',
              color: 'var(--text-1)',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="btn btn-ghost"
            style={{ fontSize: '0.875rem' }}
          >
            {t.cancel}
          </button>
          <button
            onClick={() => onConfirm(notes || undefined)}
            disabled={isSubmitting}
            className="btn"
            style={{
              fontSize: '0.875rem',
              backgroundColor: 'var(--green-light)',
              color: '#fff',
            }}
          >
            {isSubmitting ? t.converting : t.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
