import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Bike, Receipt, AlertCircle, Clock, XCircle, CheckCircle, Edit3, MessageCircle } from 'lucide-react';
import { pos, financing, type ReservationStatus } from '../api';
import ConvertToOrder from '../components/ConvertToOrder';
import { buildWhatsAppUrl } from '../../../packages/shared-types/src/whatsapp';
import { useToast } from '../components/Toast';

type Lang = 'en' | 'ar';

const T = {
  en: {
    back: 'Back to Reservations',
    loading: 'Loading...',
    error: 'Failed to load reservation',
    reservationDetails: 'Reservation Details',
    reservationNumber: 'Reservation Number',
    customer: 'Customer',
    phone: 'Phone',
    email: 'Email',
    address: 'Address',
    motorcycle: 'Motorcycle',
    brand: 'Brand',
    model: 'Model',
    year: 'Year',
    vin: 'VIN',
    color: 'Color',
    branch: 'Branch',
    source: 'Source',
    ecommerce: 'E-commerce',
    pos: 'POS',
    createdBy: 'Created By',
    createdOn: 'Created On',
    status: 'Status',
    paymentSummary: 'Payment Summary',
    totalPrice: 'Total Price',
    depositPaid: 'Deposit Paid',
    remainingAmount: 'Remaining Amount',
    expiration: 'Expiration',
    expiresAt: 'Expires At',
    expired: 'Expired',
    expiresIn: 'Expires in',
    days: 'days',
    day: 'day',
    hours: 'hours',
    hour: 'hour',
    notes: 'Notes',
    noNotes: 'No notes',
    cancelReason: 'Cancellation Reason',
    convertedOrder: 'Converted to Order',
    orderNumber: 'Order Number',
    viewOrder: 'View Order',
    actions: 'Actions',
    convertToOrder: 'Convert to Order',
    cancelReservation: 'Cancel Reservation',
    customerReservations: 'Customer Reservations',
    loadingHistory: 'Loading...',
    noHistory: 'No other reservations',
    viewReservation: 'View',
    confirmCancel: 'Confirm Cancellation',
    cancelWarning: 'Are you sure you want to cancel this reservation? The motorcycle will become available again.',
    enterReason: 'Enter cancellation reason',
    cancel: 'Cancel',
    confirm: 'Confirm',
    cancelling: 'Cancelling...',
    installmentPlan: 'Installment Plan',
    contractNumber: 'Contract Number',
    financingAmount: 'Financing Amount',
    months: 'Months',
    status_active: 'Active',
    status_completed: 'Completed',
    status_defaulted: 'Defaulted',
    status_cancelled: 'Cancelled',
  },
  ar: {
    back: 'العودة للحجوزات',
    loading: 'جاري التحميل...',
    error: 'فشل تحميل الحجز',
    reservationDetails: 'تفاصيل الحجز',
    reservationNumber: 'رقم الحجز',
    customer: 'العميل',
    phone: 'الهاتف',
    email: 'البريد',
    address: 'العنوان',
    motorcycle: 'الدراجة',
    brand: 'العلامة التجارية',
    model: 'الموديل',
    year: 'السنة',
    vin: 'رقم الهيكل',
    color: 'اللون',
    branch: 'الفرع',
    source: 'المصدر',
    ecommerce: 'التجارة الإلكترونية',
    pos: 'نقطة البيع',
    createdBy: 'أنشأه',
    createdOn: 'تم الإنشاء في',
    status: 'الحالة',
    paymentSummary: 'ملخص الدفع',
    totalPrice: 'السعر الإجمالي',
    depositPaid: 'العربون المدفوع',
    remainingAmount: 'المبلغ المتبقي',
    expiration: 'انتهاء الصلاحية',
    expiresAt: 'تنتهي في',
    expired: 'منتهي',
    expiresIn: 'تنتهي خلال',
    days: 'أيام',
    day: 'يوم',
    hours: 'ساعات',
    hour: 'ساعة',
    notes: 'ملاحظات',
    noNotes: 'لا توجد ملاحظات',
    cancelReason: 'سبب الإلغاء',
    convertedOrder: 'تم التحويل إلى طلب',
    orderNumber: 'رقم الطلب',
    viewOrder: 'عرض الطلب',
    actions: 'الإجراءات',
    convertToOrder: 'تحويل إلى طلب',
    cancelReservation: 'إلغاء الحجز',
    customerReservations: 'حجوزات العميل',
    loadingHistory: 'جاري التحميل...',
    noHistory: 'لا توجد حجوزات أخرى',
    viewReservation: 'عرض',
    confirmCancel: 'تأكيد الإلغاء',
    cancelWarning: 'هل أنت متأكد من إلغاء هذا الحجز؟ ستصبح الدراجة متاحة مرة أخرى.',
    enterReason: 'أدخل سبب الإلغاء',
    cancel: 'إلغاء',
    confirm: 'تأكيد',
    cancelling: 'جاري الإلغاء...',
    installmentPlan: 'خطة التقسيط',
    contractNumber: 'رقم العقد',
    financingAmount: 'مبلغ التقسيط',
    months: 'أشهر',
    status_active: 'نشط',
    status_completed: 'مكتمل',
    status_defaulted: 'متعثر',
    status_cancelled: 'ملغي',
  },
};

const statusLabels: Record<ReservationStatus, { en: string; ar: string }> = {
  active: { en: 'Active', ar: 'نشط' },
  expired: { en: 'Expired', ar: 'منتهي' },
  cancelled: { en: 'Cancelled', ar: 'ملغي' },
  converted: { en: 'Converted', ar: 'محول' },
};

interface Props {
  lang: Lang;
}

export default function ReservationDetailPOS({ lang }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const t = T[lang];
  const isRtl = lang === 'ar';
  const { showToast } = useToast();

  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [conversionKey] = useState(() => id ? `pos-reservation-conversion-${id}` : '');

  const { data: reservation, isLoading, isError } = useQuery({
    queryKey: ['reservation', id],
    queryFn: () => pos.getReservation(id!),
    enabled: !!id,
  });

  const { data: customerReservationsData } = useQuery({
    queryKey: ['customerReservations', reservation?.customer.id],
    queryFn: () => pos.listReservations({ limit: 10 }),
    enabled: !!reservation?.customer.id,
  });

  const { data: financingData } = useQuery({
    queryKey: ['customerFinancing', reservation?.customer.id],
    queryFn: () => financing.list({ customerId: reservation!.customer.id, limit: 100 }),
    enabled: !!reservation?.customer.id && !!reservation?.convertedOrder?.id,
  });

  const tiedFinancingContract = financingData?.items?.find(f => f.orderId === reservation?.convertedOrder?.id);

  const customerReservations = customerReservationsData?.items.filter((r) => r.id !== id) ?? [];

  const convertMutation = useMutation({
    mutationFn: (notes?: string) => pos.convertReservation(id!, notes, conversionKey),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['reservation', id] });
      queryClient.invalidateQueries({ queryKey: ['desktop-reservations'] });
      queryClient.invalidateQueries({ queryKey: ['installment-orders'] });
      setShowConvertModal(false);
      navigate(`/installment-orders/${result.id}`);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => pos.cancelReservation(id!, cancelReason.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservation', id] });
      queryClient.invalidateQueries({ queryKey: ['desktop-reservations'] });
      setShowCancelModal(false);
      setCancelReason('');
      showToast(isRtl ? 'تم إلغاء الحجز.' : 'Reservation cancelled.', 'success');
    },
  });
  const updateMutation = useMutation({
    mutationFn: () => pos.updateReservation(id!, { expiresAt: editExpiresAt ? new Date(editExpiresAt).toISOString() : undefined, notes: editNotes }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['reservation', id] }); void queryClient.invalidateQueries({ queryKey: ['desktop-reservations'] }); setShowEdit(false); },
  });
  const extendMutation = useMutation({
    mutationFn: () => pos.updateReservation(id!, { expiresAt: new Date(editExpiresAt).toISOString() }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['reservation', id] }); void queryClient.invalidateQueries({ queryKey: ['desktop-reservations'] }); setShowEdit(false); },
  });
  const sendWhatsApp = useMutation({
    mutationFn: async (): Promise<{ phone: string; message: string }> => {
      if (!reservation) throw new Error('Reservation not loaded');
      return {
        phone: reservation.customer.phone,
        message: `Reservation ${reservation.reservationNumber} for ${reservation.motorcycle.model}`,
      };
    },
    onSuccess: ({ phone, message }) => window.open(buildWhatsAppUrl(phone, message), '_blank'),
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-EG', {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateShort = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-EG', {
      month: 'short',
      day: 'numeric',
    });
  };

  const getExpirationDisplay = () => {
    if (!reservation?.expiresAt) return null;
    const now = new Date();
    const expires = new Date(reservation.expiresAt);
    const diffMs = expires.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMs < 0) {
      return { text: t.expired, color: 'var(--red-light)', urgent: true };
    }
    if (diffHours < 48) {
      const hours = Math.floor(diffHours);
      return {
        text: `${t.expiresIn} ${hours} ${hours === 1 ? t.hour : t.hours}`,
        color: 'var(--red-light)',
        urgent: true,
      };
    }
    if (diffDays <= 7) {
      return {
        text: `${t.expiresIn} ${diffDays} ${diffDays === 1 ? t.day : t.days}`,
        color: '#f59e0b',
        urgent: true,
      };
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="pos-detail-panel reservation-detail-page" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-2)',
          }}
        >
          {t.loading}
        </div>
      </div>
    );
  }

  if (isError || !reservation) {
    return (
      <div className="pos-detail-panel reservation-detail-page" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: '1rem',
            color: 'var(--red-light)',
          }}
        >
          <AlertCircle size={40} />
          <div>{t.error}</div>
          <button onClick={() => navigate('/reservations')} className="btn btn-ghost">
            {t.back}
          </button>
        </div>
      </div>
    );
  }

  const expirationDisplay = getExpirationDisplay();
  const canConvert =
    reservation.status === 'active' &&
    (!reservation.expiresAt || new Date(reservation.expiresAt) > new Date());
  const canCancel = reservation.status === 'active';

  return (
    <div className="pos-detail-panel reservation-detail-page" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      {/* Back button */}
      <button
        onClick={() => navigate('/reservations')}
        className="btn btn-ghost reservation-detail-back"
        style={{ marginBottom: '1.5rem' }}
      >
        <ArrowLeft size={16} />
        {t.back}
      </button>

      {/* Reservation header */}
      <div className="pos-card reservation-detail-hero" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                color: 'var(--text-3)',
                marginBottom: '0.25rem',
              }}
            >
              {t.reservationNumber}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '1.125rem', fontWeight: 600, color: 'var(--blue-light)' }}>
              {reservation.reservationNumber}
            </div>
          </div>
          <span className={`badge badge-${reservation.status}`}>
            {statusLabels[reservation.status][lang]}
          </span>
        </div>
      </div>

      {/* Expiration alert */}
      {expirationDisplay && (
        <div className="reservation-expiration"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem',
            backgroundColor: 'rgba(251, 191, 36, 0.1)',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            borderRadius: '0.5rem',
            marginBottom: '1.5rem',
          }}
        >
          <Clock size={20} style={{ color: expirationDisplay.color }} />
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: expirationDisplay.color }}>
              {expirationDisplay.text}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '0.125rem' }}>
              {formatDate(reservation.expiresAt!)}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {(
        <div className="pos-card reservation-actions" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            {t.actions}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn" disabled={sendWhatsApp.isPending} onClick={() => sendWhatsApp.mutate()}><MessageCircle size={16} />{isRtl ? 'إرسال واتساب' : 'Send WhatsApp'}</button>
            {canCancel && <button className="btn" onClick={() => { setEditExpiresAt(reservation.expiresAt ? new Date(reservation.expiresAt).toISOString().slice(0, 16) : ''); setEditNotes(reservation.notes || ''); setShowEdit(true); }}><Edit3 size={16} />{isRtl ? 'تعديل وتمديد' : 'Edit / extend'}</button>}
            {canConvert && (
              <button
                onClick={() => setShowConvertModal(true)}
                className="btn"
                style={{
                  fontSize: '0.875rem',
                  backgroundColor: 'var(--green-light)',
                  color: '#fff',
                }}
              >
                <CheckCircle size={16} />
                {t.convertToOrder}
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="btn"
                style={{
                  fontSize: '0.875rem',
                  backgroundColor: 'var(--red-light)',
                  color: '#fff',
                }}
              >
                <XCircle size={16} />
                {t.cancelReservation}
              </button>
            )}
          </div>
        </div>
      )}

      {showEdit && <div className="modal-backdrop"><div className="payment-modal"><button className="drawer-close" onClick={() => setShowEdit(false)}><XCircle size={18} /></button><h2>{isRtl ? 'تعديل الحجز' : 'Edit reservation'}</h2><label>{isRtl ? 'تاريخ الانتهاء' : 'Expires at'}<input type="datetime-local" value={editExpiresAt} onChange={event => setEditExpiresAt(event.target.value)} /></label><label>{isRtl ? 'ملاحظات' : 'Notes'}<textarea value={editNotes} onChange={event => setEditNotes(event.target.value)} /></label>{(updateMutation.isError || extendMutation.isError) && <div className="inline-error">{((updateMutation.error || extendMutation.error) as Error).message}</div>}<div className="modal-actions"><button className="secondary-action" onClick={() => setShowEdit(false)}>{isRtl ? 'إلغاء' : 'Cancel'}</button><button className="secondary-action" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()}>{isRtl ? 'حفظ التعديل' : 'Save changes'}</button><button className="primary-action" disabled={!editExpiresAt || extendMutation.isPending} onClick={() => extendMutation.mutate()}>{isRtl ? 'تمديد' : 'Extend'}</button></div></div></div>}

      {/* Customer info */}
      <div className="pos-card reservation-info-card reservation-customer-card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <User size={16} style={{ color: 'var(--blue-light)' }} />
          <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600 }}>{t.customer}</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{t.customer}</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{reservation.customer?.name ?? '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{t.phone}</div>
            <div style={{ fontSize: '0.875rem', fontFamily: 'monospace' }}>{reservation.customer?.phone ?? '—'}</div>
          </div>
          {reservation.customer?.email && (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{t.email}</div>
              <div style={{ fontSize: '0.875rem' }}>{reservation.customer.email}</div>
            </div>
          )}
          {reservation.customer?.defaultAddress && (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{t.address}</div>
              <div style={{ fontSize: '0.875rem' }}>
                {reservation.customer.defaultAddress.addressLine}
                {reservation.customer.defaultAddress.city && `, ${reservation.customer.defaultAddress.city}`}
              </div>
            </div>
          )}
          {reservation.customerIdImage && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: '0.5rem', textTransform: 'uppercase', fontWeight: 700 }}>
                {isRtl ? 'صورة بطاقة العميل' : 'Customer ID image'}
              </div>
              <a href={reservation.customerIdImage} target="_blank" rel="noreferrer">
                <img src={reservation.customerIdImage} alt={isRtl ? 'صورة بطاقة العميل' : 'Customer ID image'} style={{ width: '100%', maxWidth: 220, height: 150, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--border)', display: 'block' }} />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Motorcycle info */}
      <div className="pos-card reservation-info-card reservation-motorcycle-card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Bike size={16} style={{ color: 'var(--blue-light)' }} />
          <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600 }}>{t.motorcycle}</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{t.brand}</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>
              {lang === 'ar' ? (reservation.motorcycle?.brand?.nameAr ?? '—') : (reservation.motorcycle?.brand?.nameEn ?? '—')}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{t.model}</div>
              <div style={{ fontSize: '0.875rem' }}>{reservation.motorcycle.model}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{t.year}</div>
              <div style={{ fontSize: '0.875rem' }}>{reservation.motorcycle.year}</div>
            </div>
          </div>
          {reservation.motorcycle.color && (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{t.color}</div>
              <div style={{ fontSize: '0.875rem' }}>{reservation.motorcycle.color}</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{t.vin}</div>
            <div style={{ fontSize: '0.875rem', fontFamily: 'monospace' }}>{reservation.motorcycle.vin}</div>
          </div>
        </div>
      </div>

      {/* Payment summary */}
      <div className="pos-card reservation-info-card reservation-payment-card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Receipt size={16} style={{ color: 'var(--blue-light)' }} />
          <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600 }}>{t.paymentSummary}</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingBottom: '0.5rem',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-2)' }}>{t.totalPrice}</span>
            <span style={{ fontWeight: 600 }}>{formatCurrency(reservation.totalPrice)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
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
      </div>

      {/* Details */}
      <div className="pos-card reservation-meta-card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{t.branch}</div>
              <div style={{ fontSize: '0.875rem' }}>
                {lang === 'ar' ? (reservation.branch?.nameAr ?? '—') : (reservation.branch?.nameEn ?? '—')}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{t.source}</div>
              <div style={{ fontSize: '0.875rem' }}>
                {reservation.source === 'ecommerce' ? t.ecommerce : t.pos}
              </div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{t.createdBy}</div>
            <div style={{ fontSize: '0.875rem' }}>{reservation.user?.name ?? '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{t.createdOn}</div>
            <div style={{ fontSize: '0.875rem' }}>{formatDate(reservation.createdAt)}</div>
          </div>
        </div>
      </div>

      {/* Converted order */}
      {reservation.convertedOrder && (
        <div className="pos-card reservation-converted-card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ marginBottom: '0.75rem', fontSize: '0.875rem', fontWeight: 600 }}>
            {t.convertedOrder}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{t.orderNumber}</div>
              <div style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--blue-light)' }}>
                {reservation.convertedOrder.orderNumber}
              </div>
            </div>
            <button
              onClick={() => navigate(`/installment-orders/${reservation.convertedOrder!.id}`)}
              className="btn btn-primary"
              style={{ fontSize: '0.875rem' }}
            >
              {t.viewOrder}
            </button>
          </div>
        </div>
      )}

      {/* Notes */}
      {(reservation.notes || reservation.cancelReason) && (
        <div className="pos-card reservation-notes-card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>
            {reservation.cancelReason ? t.cancelReason : t.notes}
          </div>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>
            {reservation.cancelReason || reservation.notes}
          </p>
        </div>
      )}

      {/* Installment Plan */}
      {tiedFinancingContract && (
        <div className="pos-card reservation-installment-card" style={{ padding: '1rem', marginBottom: '1.5rem', borderLeft: '3px solid var(--blue-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Receipt size={16} style={{ color: 'var(--blue-light)' }} />
            <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{t.installmentPlan}</div>
            <span className={`badge badge-${tiedFinancingContract.status}`} style={{ marginInlineStart: 'auto' }}>
              {(t as any)[`status_${tiedFinancingContract.status}`] || tiedFinancingContract.status}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{t.contractNumber}</div>
              <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.875rem', color: 'var(--blue-light)' }}>
                {tiedFinancingContract.contractNumber}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{t.financingAmount}</div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                  {formatCurrency(tiedFinancingContract.financingAmount)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{t.months}</div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                  {tiedFinancingContract.numberOfInstallments}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer reservations */}
      {customerReservations.length > 0 && (
        <div className="pos-card reservation-history-card" style={{ padding: '1rem' }}>
          <div style={{ marginBottom: '0.75rem', fontSize: '0.875rem', fontWeight: 600 }}>
            {t.customerReservations}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {customerReservations.map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.5rem',
                  backgroundColor: 'var(--bg-2)',
                  borderRadius: '0.375rem',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.8125rem', fontFamily: 'monospace', fontWeight: 600 }}>
                    {r.reservationNumber}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                    {formatDateShort(r.createdAt)} • <span className={`badge badge-${r.status}`}>{statusLabels[r.status][lang]}</span>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/reservations/${r.id}`)}
                  className="btn btn-ghost"
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                >
                  {t.viewReservation}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Convert modal */}
      {showConvertModal && (
        <ConvertToOrder
          lang={lang}
          reservation={reservation}
          onConfirm={(notes) => convertMutation.mutate(notes)}
          onCancel={() => setShowConvertModal(false)}
          isSubmitting={convertMutation.isPending}
        />
      )}

      {/* Cancel modal */}
      {showCancelModal && (
        <div
          className="pos-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !cancelMutation.isPending) {
              setShowCancelModal(false);
            }
          }}
        >
          <div className="pos-modal" style={{ maxWidth: 450, direction: isRtl ? 'rtl' : 'ltr' }}>
            <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>{t.confirmCancel}</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', marginBottom: '1rem' }}>
              {t.cancelWarning}
            </p>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>
                {t.enterReason}
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t.enterReason}
                rows={3}
                disabled={cancelMutation.isPending}
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
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCancelModal(false)}
                disabled={cancelMutation.isPending}
                className="btn btn-ghost"
                style={{ fontSize: '0.875rem' }}
              >
                {t.cancel}
              </button>
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="btn"
                style={{
                  fontSize: '0.875rem',
                  backgroundColor: 'var(--red-light)',
                  color: '#fff',
                }}
              >
                {cancelMutation.isPending ? t.cancelling : t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
