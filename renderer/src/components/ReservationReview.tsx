import { User, Bike, Receipt, Clock } from 'lucide-react';
import type { CustomerSearchResult, MotorcycleSearchResult } from '../api';

type Lang = 'en' | 'ar';

const T = {
  en: {
    reviewReservation: 'Review Reservation',
    customer: 'Customer',
    motorcycle: 'Motorcycle',
    pricingDetails: 'Pricing Details',
    paymentDetails: 'Payment Details',
    name: 'Name',
    phone: 'Phone',
    email: 'Email',
    address: 'Address',
    brand: 'Brand',
    model: 'Model',
    year: 'Year',
    vin: 'VIN',
    color: 'Color',
    price: 'Price',
    depositAmount: 'Deposit Amount',
    remainingAmount: 'Remaining Amount',
    totalPrice: 'Total Price',
    notes: 'Notes',
    optionalNotes: 'Optional notes about this reservation...',
    cancel: 'Cancel',
    createReservation: 'Create Reservation',
    expirationNote: 'Reservation will expire in 7 days',
  },
  ar: {
    reviewReservation: 'مراجعة الحجز',
    customer: 'العميل',
    motorcycle: 'الدراجة',
    pricingDetails: 'تفاصيل التسعير',
    paymentDetails: 'تفاصيل الدفع',
    name: 'الاسم',
    phone: 'الهاتف',
    email: 'البريد الإلكتروني',
    address: 'العنوان',
    brand: 'العلامة التجارية',
    model: 'الموديل',
    year: 'السنة',
    vin: 'رقم الهيكل',
    color: 'اللون',
    price: 'السعر',
    depositAmount: 'مبلغ العربون',
    remainingAmount: 'المبلغ المتبقي',
    totalPrice: 'السعر الإجمالي',
    notes: 'ملاحظات',
    optionalNotes: 'ملاحظات اختيارية حول هذا الحجز...',
    cancel: 'إلغاء',
    createReservation: 'إنشاء الحجز',
    expirationNote: 'سينتهي الحجز خلال 7 أيام',
  },
};

interface Props {
  lang: Lang;
  customer: CustomerSearchResult;
  motorcycle: MotorcycleSearchResult;
  depositAmount: number;
  notes: string;
  address?: string;
  onAddressChange: (address: string) => void;
  onNotesChange: (notes: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
}

export default function ReservationReview({
  lang,
  customer,
  motorcycle,
  depositAmount,
  notes,
  address,
  onAddressChange,
  onNotesChange,
  onCancel,
  onConfirm,
  isSubmitting,
}: Props) {
  const t = T[lang];
  const isRtl = lang === 'ar';

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-EG', {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const remainingAmount = motorcycle.price - depositAmount;

  return (
    <div className="pos-detail-panel" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{t.reviewReservation}</h1>
        
        {/* Expiration notice */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            backgroundColor: 'rgba(251, 191, 36, 0.1)',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            borderRadius: '0.5rem',
            marginBottom: '1.5rem',
          }}
        >
          <Clock size={20} style={{ color: '#f59e0b' }} />
          <span style={{ fontSize: '0.875rem', color: '#92400e' }}>{t.expirationNote}</span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '1.5rem',
            marginBottom: '2rem',
          }}
        >
          {/* Customer card */}
          <div className="pos-card">
            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>{t.address}</span>
              <input className="pos-input" value={address ?? ''} onChange={(event) => onAddressChange(event.target.value)} />
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <User size={18} style={{ color: 'var(--blue-light)' }} />
              <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>{t.customer}</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: '0.25rem' }}>
                  {t.name}
                </div>
                <div style={{ fontWeight: 500 }}>{customer.name}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: '0.25rem' }}>
                  {t.phone}
                </div>
                <div style={{ fontFamily: 'monospace' }}>{customer.phone}</div>
              </div>
              {customer.email && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: '0.25rem' }}>
                    {t.email}
                  </div>
                  <div style={{ fontSize: '0.875rem' }}>{customer.email}</div>
                </div>
              )}
              {customer.defaultAddress && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: '0.25rem' }}>
                    {t.address}
                  </div>
                  <div style={{ fontSize: '0.875rem' }}>
                    {customer.defaultAddress.addressLine}
                    {customer.defaultAddress.city && `, ${customer.defaultAddress.city}`}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Motorcycle card */}
          <div className="pos-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Bike size={18} style={{ color: 'var(--blue-light)' }} />
              <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>{t.motorcycle}</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: '0.25rem' }}>
                  {t.brand}
                </div>
                <div style={{ fontWeight: 500 }}>
                  {lang === 'ar' ? motorcycle.brand.nameAr : motorcycle.brand.nameEn}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: '0.25rem' }}>
                    {t.model}
                  </div>
                  <div>{motorcycle.model}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: '0.25rem' }}>
                    {t.year}
                  </div>
                  <div>{motorcycle.year}</div>
                </div>
              </div>
              {motorcycle.color && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: '0.25rem' }}>
                    {t.color}
                  </div>
                  <div>{motorcycle.color}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: '0.25rem' }}>
                  {t.vin}
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{motorcycle.vin}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Payment summary */}
        <div className="pos-card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Receipt size={18} style={{ color: 'var(--blue-light)' }} />
            <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>{t.paymentDetails}</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingBottom: '0.75rem',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span style={{ fontSize: '0.875rem', color: 'var(--text-2)' }}>{t.totalPrice}</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(motorcycle.price)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-2)' }}>{t.depositAmount}</span>
              <span style={{ fontWeight: 600, color: 'var(--green-light)' }}>
                {formatCurrency(depositAmount)}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--border)',
              }}
            >
              <span style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{t.remainingAmount}</span>
              <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--blue-light)' }}>
                {formatCurrency(remainingAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="pos-card" style={{ marginBottom: '2rem' }}>
          <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>
            {t.notes}
          </div>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder={t.optionalNotes}
            rows={3}
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
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="btn btn-ghost"
            style={{ fontSize: '0.875rem' }}
          >
            {t.cancel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="btn btn-primary"
            style={{ fontSize: '0.875rem', padding: '0.75rem 2rem' }}
          >
            {isSubmitting ? (lang === 'ar' ? 'جاري الإنشاء...' : 'Creating...') : t.createReservation}
          </button>
        </div>
      </div>
    </div>
  );
}
