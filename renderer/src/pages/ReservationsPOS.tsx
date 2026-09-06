import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bookmark, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { pos, type ReservationListItem, type ReservationStatus } from '../api';
import { DataTableState } from '../components/DataTable';

type Lang = 'en' | 'ar';

const T = {
  en: {
    title: 'Reservations',
    all: 'All',
    active: 'Active',
    expired: 'Expired',
    cancelled: 'Cancelled',
    converted: 'Converted',
    noReservations: 'No reservations found',
    loading: 'Loading...',
    customer: 'Customer',
    motorcycle: 'Motorcycle',
    deposit: 'Deposit',
    remaining: 'Remaining',
    expires: 'Expires',
    expired_status: 'Expired',
    expiresIn: 'Expires in',
    days: 'days',
    day: 'day',
    hours: 'hours',
    hour: 'hour',
  },
  ar: {
    title: 'الحجوزات',
    all: 'الكل',
    active: 'نشط',
    expired: 'منتهي',
    cancelled: 'ملغي',
    converted: 'محول',
    noReservations: 'لا توجد حجوزات',
    loading: 'جاري التحميل...',
    customer: 'العميل',
    motorcycle: 'الدراجة',
    deposit: 'العربون',
    remaining: 'المتبقي',
    expires: 'تنتهي',
    expired_status: 'منتهي',
    expiresIn: 'تنتهي خلال',
    days: 'أيام',
    day: 'يوم',
    hours: 'ساعات',
    hour: 'ساعة',
  },
};

const statusLabels: Record<ReservationStatus | 'all', { en: string; ar: string }> = {
  all: { en: 'All', ar: 'الكل' },
  active: { en: 'Active', ar: 'نشط' },
  expired: { en: 'Expired', ar: 'منتهي' },
  cancelled: { en: 'Cancelled', ar: 'ملغي' },
  converted: { en: 'Converted', ar: 'محول' },
};

interface Props {
  lang: Lang;
}

export default function ReservationsPOS({ lang }: Props) {
  const t = T[lang];
  const isRtl = lang === 'ar';
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState<ReservationStatus | 'all'>('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['desktop-reservations', statusFilter, page],
    queryFn: () =>
      pos.listReservations({
        status: statusFilter === 'all' ? undefined : statusFilter,
        page,
        limit: 25,
      }),
  });

  const reservationsList = data?.items ?? [];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-EG', {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-EG', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getExpirationDisplay = (expiresAt?: string) => {
    if (!expiresAt) return null;
    const now = new Date();
    const expires = new Date(expiresAt);
    const diffMs = expires.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMs < 0) {
      return { text: t.expired_status, color: 'var(--red-light)', urgent: true };
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
    return {
      text: formatDate(expiresAt),
      color: 'var(--text-2)',
      urgent: false,
    };
  };

  const handleReservationClick = (reservationId: string) => {
    navigate(`/reservations/${reservationId}`);
  };

  return (
    <div className="pos-body reservations-page" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      {/* Left panel - reservation list */}
      <div className="pos-list-panel reservations-directory">
        {/* Panel header */}
        <div className="panel-header reservations-panel-header">
          <Bookmark size={18} style={{ color: 'var(--blue-light)' }} />
          <span className="panel-title">{t.title}</span>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '0.75rem',
              color: 'var(--text-3)',
            }}
          >
            {reservationsList.length}
          </span>
        </div>

        {/* Status filters */}
        <div className="reservations-filters">
          {(['all', 'active', 'expired', 'cancelled', 'converted'] as const).map((status) => (
            <button
              key={status}
              onClick={() => { setStatusFilter(status); setPage(1); }}
              className="badge"
              style={{
                cursor: 'pointer',
                opacity: statusFilter === status ? 1 : 0.5,
                transform: statusFilter === status ? 'scale(1.05)' : 'scale(1)',
                transition: 'var(--transition)',
              }}
            >
              {statusLabels[status][lang]}
            </button>
          ))}
        </div>
        {!isLoading && reservationsList.length > 0 && (
          <div className="panel-heading" style={{ padding: '0.75rem 1rem' }}>
            <span>{data?.total ?? 0}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button className="icon-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} title="Previous"><ChevronLeft size={16} /></button>
              <span>{page} / {data?.totalPages || 1}</span>
              <button className="icon-button" disabled={page >= (data?.totalPages || 1)} onClick={() => setPage((value) => value + 1)} title="Next"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}

        {/* Reservation list */}
        <div className="pos-list reservations-grid">
          {isLoading && <DataTableState kind="loading" lang={lang} />}
          {!isLoading && reservationsList.length === 0 && <DataTableState kind="empty" lang={lang} />}
          {reservationsList.map((reservation) => {
            const expirationDisplay = getExpirationDisplay(reservation.expiresAt);
            return (
              <div
                key={reservation.id}
                className="pos-list-item reservation-grid-card"
                onClick={() => handleReservationClick(reservation.id)}
              >
                {/* Reservation number & status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      color: 'var(--blue-light)',
                      fontSize: '0.875rem',
                    }}
                  >
                    {reservation.reservationNumber}
                  </div>
                  <span className={`badge badge-${reservation.status}`}>
                    {statusLabels[reservation.status][lang]}
                  </span>
                </div>

                {/* Customer */}
                <div style={{ marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{reservation.customer.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontFamily: 'monospace' }}>
                    {reservation.customer.phone}
                  </div>
                </div>

                {/* Motorcycle */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-2)' }}>
                    {lang === 'ar' ? reservation.motorcycle.brand.nameAr : reservation.motorcycle.brand.nameEn}{' '}
                    {reservation.motorcycle.model}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontFamily: 'monospace' }}>
                    {reservation.motorcycle.vin}
                  </div>
                </div>

                {/* Payment info */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.5rem',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-3)', marginBottom: '0.125rem' }}>
                      {t.deposit}
                    </div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--green-light)' }}>
                      {formatCurrency(reservation.depositAmount)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-3)', marginBottom: '0.125rem' }}>
                      {t.remaining}
                    </div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--blue-light)' }}>
                      {formatCurrency(reservation.remainingAmount)}
                    </div>
                  </div>
                </div>

                {/* Expiration */}
                {expirationDisplay && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      fontSize: '0.75rem',
                      color: expirationDisplay.color,
                      fontWeight: expirationDisplay.urgent ? 600 : 400,
                    }}
                  >
                    {expirationDisplay.urgent && <Clock size={12} />}
                    {expirationDisplay.text}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
