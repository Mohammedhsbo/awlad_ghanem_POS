import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle, History, Package, ShoppingBag, User, XCircle } from 'lucide-react';
import { pos, type OrderStatus } from '../api';

type Lang = 'en' | 'ar';

const T = {
  en: {
    back: 'Back to Orders',
    loading: 'Loading...',
    error: 'Failed to load order',
    orderDetails: 'Order Details',
    orderNumber: 'Order Number',
    customer: 'Customer',
    phone: 'Phone',
    email: 'Email',
    address: 'Delivery Address',
    branch: 'Branch',
    createdBy: 'Created By',
    placedOn: 'Placed On',
    status: 'Status',
    orderItems: 'Order Items',
    vin: 'VIN',
    model: 'Model',
    year: 'Year',
    color: 'Color',
    brand: 'Brand',
    currentStatus: 'Current Status',
    price: 'Price',
    subtotal: 'Subtotal',
    discount: 'Discount',
    total: 'Total',
    notes: 'Notes',
    noNotes: 'No notes',
    customerOrders: 'Customer Order History',
    loadingHistory: 'Loading order history...',
    noHistory: 'No other orders',
    viewOrder: 'View',
  },
  ar: {
    back: 'العودة للطلبات',
    loading: 'جاري التحميل...',
    error: 'فشل تحميل الطلب',
    orderDetails: 'تفاصيل الطلب',
    orderNumber: 'رقم الطلب',
    customer: 'العميل',
    phone: 'الهاتف',
    email: 'البريد',
    address: 'عنوان التسليم',
    branch: 'الفرع',
    createdBy: 'أنشأه',
    placedOn: 'تم الطلب في',
    status: 'الحالة',
    orderItems: 'عناصر الطلب',
    vin: 'رقم الهيكل',
    model: 'الموديل',
    year: 'السنة',
    color: 'اللون',
    brand: 'العلامة التجارية',
    currentStatus: 'الحالة الحالية',
    price: 'السعر',
    subtotal: 'المجموع الفرعي',
    discount: 'الخصم',
    total: 'الإجمالي',
    notes: 'ملاحظات',
    noNotes: 'لا توجد ملاحظات',
    customerOrders: 'طلبات العميل السابقة',
    loadingHistory: 'جاري تحميل السجل...',
    noHistory: 'لا توجد طلبات أخرى',
    viewOrder: 'عرض',
  },
};

const statusLabels: Record<OrderStatus, { en: string; ar: string }> = {
  draft: { en: 'Draft', ar: 'مسودة' },
  confirmed: { en: 'Confirmed', ar: 'مؤكد' },
  processing: { en: 'Processing', ar: 'قيد المعالجة' },
  awaiting_delivery: { en: 'Awaiting Delivery', ar: 'في انتظار التسليم' },
  completed: { en: 'Completed', ar: 'مكتمل' },
  cancelled: { en: 'Cancelled', ar: 'ملغي' },
  refunded: { en: 'Refunded', ar: 'مسترد' },
};

interface Props {
  lang: Lang;
}

export default function OrderDetailPOS({ lang }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const listPath = location.pathname.startsWith('/transactions/') ? '/history' : '/installment-orders';
  const queryClient = useQueryClient();
  const t = T[lang];
  const isRtl = lang === 'ar';

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['order', id],
    queryFn: () => pos.getOrder(id!),
    enabled: !!id,
  });

  const { data: customerOrdersData } = useQuery({
    queryKey: ['customerOrders', order?.customer.id],
    queryFn: () => pos.listOrders({ search: order!.customer.phone, limit: 10 }),
    enabled: !!order?.customer.id,
  });
  const action = useMutation({
    mutationFn: ({ kind, status }: { kind: 'confirm' | 'status' | 'cancel'; status?: OrderStatus }) => kind === 'cancel' ? pos.cancelOrder(id!) : pos.updateOrderStatus(id!, status!),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['order', id] }); void queryClient.invalidateQueries({ queryKey: listPath === '/history' ? ['desktop-transactions'] : ['installment-orders'] }); },
  });

  const customerOrders = customerOrdersData?.items.filter((o) => o.id !== id) ?? [];

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

  if (isLoading) {
    return (
      <div className="pos-detail-panel order-detail-page" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
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

  if (isError || !order) {
    return (
      <div className="pos-detail-panel order-detail-page" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
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
          <button onClick={() => navigate(listPath)} className="btn btn-ghost">
            {t.back}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pos-detail-panel order-detail-page" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      {/* Back button */}
      <button
        onClick={() => navigate(listPath)}
        className="btn btn-ghost order-detail-back"
        style={{ marginBottom: '1.5rem' }}
      >
        <ArrowLeft size={16} />
        {t.back}
      </button>

      {/* Order header */}
      <div className="pos-card order-detail-hero" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
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
              {t.orderNumber}
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--blue-light)',
                marginBottom: '0.5rem',
              }}
            >
              {order.orderNumber}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-2)' }}>
              {t.placedOn} {formatDate(order.createdAt)}
            </div>
          </div>
          <span className={`badge badge-${order.status}`}>
            {statusLabels[order.status][lang]}
          </span>
        </div>
        <div className="row-actions" style={{ marginTop: '1rem' }}>
          {order.status === 'draft' && <button className="secondary-action" disabled={action.isPending} onClick={() => action.mutate({ kind: 'confirm' })}><CheckCircle size={15} /> {lang === 'ar' ? 'تأكيد' : 'Confirm'}</button>}
          {!['completed', 'cancelled', 'refunded'].includes(order.status) && <select className="pos-input" value={order.status} disabled={action.isPending} onChange={event => action.mutate({ kind: 'status', status: event.target.value as OrderStatus })}>{Object.keys(statusLabels).filter(status => !['draft', 'cancelled', 'refunded'].includes(status)).map(status => <option key={status} value={status}>{statusLabels[status as OrderStatus][lang]}</option>)}</select>}
          {!['completed', 'cancelled', 'refunded'].includes(order.status) && <button className="icon-button" title={lang === 'ar' ? 'إلغاء' : 'Cancel'} disabled={action.isPending} onClick={() => { if (window.confirm(lang === 'ar' ? 'إلغاء الطلب؟' : 'Cancel this order?')) action.mutate({ kind: 'cancel' }); }}><XCircle size={16} /></button>}
        </div>
        {action.isError && <div className="state-panel" role="alert">{(action.error as Error).message}</div>}
      </div>

      {/* Customer & Branch info */}
      <div className="order-info-grid">
        <div className="pos-card order-info-card" style={{ padding: '1rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.75rem',
            }}
          >
            <User size={16} style={{ color: 'var(--blue-light)' }} />
            <span
              style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                fontWeight: 700,
                color: 'var(--text-3)',
              }}
            >
              {t.customer}
            </span>
          </div>
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{order.customer?.name ?? '—'}</div>
          <div
            style={{
              fontSize: '0.875rem',
              color: 'var(--text-2)',
              fontFamily: 'monospace',
              marginBottom: '0.25rem',
            }}
          >
            {order.customer?.phone ?? '—'}
          </div>
          {order.customer?.email && (
            <div style={{ fontSize: '0.875rem', color: 'var(--text-2)' }}>
              {order.customer.email}
            </div>
          )}
          {order.customer?.defaultAddress && (
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-3)',
                marginTop: '0.5rem',
                paddingTop: '0.5rem',
                borderTop: '1px solid var(--pos-border)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{t.address}</div>
              <div>{order.customer.defaultAddress.addressLine}</div>
              {order.customer.defaultAddress.city && (
                <div>{order.customer.defaultAddress.city}</div>
              )}
            </div>
          )}
          {order.customerIdImage && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: '0.5rem', textTransform: 'uppercase', fontWeight: 700 }}>
                {lang === 'ar' ? 'صورة بطاقة العميل' : 'Customer ID image'}
              </div>
              <a href={order.customerIdImage} target="_blank" rel="noreferrer">
                <img src={order.customerIdImage} alt={lang === 'ar' ? 'صورة بطاقة العميل' : 'Customer ID image'} style={{ width: '100%', maxWidth: 220, height: 150, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--border)', display: 'block' }} />
              </a>
            </div>
          )}
        </div>

        <div className="pos-card order-info-card" style={{ padding: '1rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.75rem',
            }}
          >
            <Package size={16} style={{ color: 'var(--blue-light)' }} />
            <span
              style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                fontWeight: 700,
                color: 'var(--text-3)',
              }}
            >
              {t.branch}
            </span>
          </div>
          <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>
            {lang === 'ar' ? (order.branch?.nameAr ?? '—') : (order.branch?.nameEn ?? '—')}
          </div>
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-3)',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--pos-border)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{t.createdBy}</div>
            <div>{order.user?.name ?? '—'}</div>
          </div>
        </div>
      </div>

      {/* Order items */}
      <div className="pos-card order-items-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1rem',
          }}
        >
          <ShoppingBag size={18} style={{ color: 'var(--blue-light)' }} />
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>{t.orderItems}</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {order.items.map((item) => (
            <div
              key={item.id}
              style={{
                padding: '0.875rem',
                background: 'var(--pos-surface)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--pos-border)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'start',
                  marginBottom: '0.5rem',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '0.95rem',
                      marginBottom: '0.25rem',
                    }}
                  >
                    {lang === 'ar'
                      ? (item.motorcycle?.brand?.nameAr ?? '—')
                      : (item.motorcycle?.brand?.nameEn ?? '—')}{' '}
                    {item.motorcycle?.model ?? ''}
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-2)',
                      fontFamily: 'monospace',
                    }}
                  >
                    {t.vin}: {item.motorcycle.vin} • {t.year}: {item.motorcycle.year}
                    {item.motorcycle.color && ` • ${item.motorcycle.color}`}
                  </div>
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: '1rem',
                    color: 'var(--blue-light)',
                  }}
                >
                  {formatCurrency(item.unitPrice)}
                </div>
              </div>
              <div
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--text-3)',
                }}
              >
                {t.currentStatus}:{' '}
                <span className={`badge badge-${item.motorcycle.currentStatus}`}>
                  {item.motorcycle.currentStatus}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="order-bottom-grid">
        {/* Customer order history */}
        <div className="pos-card order-history-panel" style={{ padding: '1.25rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1rem',
            }}
          >
            <History size={18} style={{ color: 'var(--blue-light)' }} />
            <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
              {t.customerOrders}
            </h2>
          </div>
          {customerOrders.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '2rem',
                color: 'var(--text-3)',
                fontSize: '0.875rem',
              }}
            >
              {t.noHistory}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {customerOrders.map((o) => (
                <div
                  key={o.id}
                  style={{
                    padding: '0.75rem',
                    background: 'var(--pos-surface)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--pos-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        marginBottom: '0.25rem',
                        color: 'var(--blue-light)',
                      }}
                    >
                      {o.orderNumber}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                      {formatDateShort(o.createdAt)} • {formatCurrency(o.netAmount)}
                    </div>
                  </div>
                  <span className={`badge badge-${o.status}`}>
                    {statusLabels[o.status][lang]}
                  </span>
                  <button
                    onClick={() => navigate(`/installment-orders/${o.id}`)}
                    className="btn btn-ghost"
                    style={{ padding: '0.375rem 0.625rem', fontSize: '0.8rem' }}
                  >
                    {t.viewOrder}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Order summary */}
        <div>
          <div className="pos-card order-summary-panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
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
                {formatCurrency(order.totalAmount)}
              </span>
            </div>
            {order.discount > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '0.75rem',
                  fontSize: '0.875rem',
                }}
              >
                <span style={{ color: 'var(--text-2)' }}>{t.discount}</span>
                <span
                  style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--red-light)' }}
                >
                  -{formatCurrency(order.discount)}
                </span>
              </div>
            )}
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
              <span style={{ fontFamily: 'monospace', color: 'var(--green-light)' }}>
                {formatCurrency(order.netAmount)}
              </span>
            </div>
          </div>

          {order.notes && (
            <div className="pos-card" style={{ padding: '1rem' }}>
              <div
                style={{
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  color: 'var(--text-3)',
                  marginBottom: '0.5rem',
                }}
              >
                {t.notes}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>
                {order.notes}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
