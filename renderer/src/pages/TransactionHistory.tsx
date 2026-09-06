import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, RefreshCw, ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { pos, type OrderListItem, type OrderStatus, type ReservationListItem } from '../api';
import { DataList, DataTableState, DateRangeFilter } from '../components/DataTable';
import { formatReceiptHTML, type ReceiptData } from '../utils/receiptFormatter';

type HistoryItem =
  | { kind: 'order'; item: OrderListItem }
  | { kind: 'reservation'; item: ReservationListItem };

export default function TransactionHistory({ lang }: { lang: 'en' | 'ar' }) {
  const isRtl = lang === 'ar';
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['desktop-transactions', search, status, startDate, endDate, page],
    queryFn: async () => {
      const [orders, reservations] = await Promise.all([
        pos.listOrders({ search: search || undefined, status: status || undefined, page, limit: 25 }),
        pos.listReservations({ status: status === 'cancelled' ? 'cancelled' : undefined, page, limit: 25 }),
      ]);
      const items: HistoryItem[] = [
        ...orders.items.map(item => ({ kind: 'order' as const, item })),
        ...reservations.items.map(item => ({ kind: 'reservation' as const, item })),
      ].sort((left, right) => new Date(right.item.createdAt).getTime() - new Date(left.item.createdAt).getTime());
      return { items, total: orders.total + reservations.total, limit: 25, totalPages: Math.max(1, Math.ceil((orders.total + reservations.total) / 25)) };
    },
  });
  const result = query.data;
  const totalPages = result?.totalPages ?? (result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1);

  async function printItem(historyItem: HistoryItem) {
    setPrintingId(historyItem.item.id);
    try {
      let receipt: ReceiptData;
      if (historyItem.kind === 'order') {
        const detail = await pos.getOrder(historyItem.item.id);
        const motorcycle = detail.items[0]?.motorcycle;
        if (!motorcycle) throw new Error(isRtl ? 'لا توجد تفاصيل للدراجة.' : 'Motorcycle details are unavailable.');
        receipt = { type: 'order', number: detail.orderNumber, date: detail.createdAt, customer: detail.customer, motorcycle, branch: detail.branch, user: detail.user, pricing: { basePrice: detail.totalAmount, discount: detail.discount, totalPrice: detail.netAmount }, notes: detail.notes };
      } else {
        const item = historyItem.item;
        receipt = { type: 'reservation', number: item.reservationNumber, date: item.createdAt, customer: item.customer, motorcycle: item.motorcycle, branch: item.branch, user: { name: isRtl ? 'موظف المبيعات' : 'Sales staff' }, pricing: { basePrice: item.totalPrice, discount: 0, totalPrice: item.totalPrice, depositAmount: item.depositAmount, remainingAmount: item.remainingAmount } };
      }
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;
      printWindow.document.write(formatReceiptHTML(receipt, lang));
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    } finally {
      setPrintingId(null);
    }
  }

  function renderHistoryItem(historyItem: HistoryItem) {
    if (historyItem.kind === 'order') {
      const item = historyItem.item;
      return <div className="customer-row record-card history-grid-card" key={`order-${item.id}`} onClick={() => navigate(`/transactions/${item.id}`)} role="button" tabIndex={0}>
        <div className="customer-main"><strong>{item.orderNumber}</strong><span>{item.customer.name} · {item.customer.phone}</span><span>{item.itemCount} {isRtl ? 'عناصر' : 'items'} · {new Date(item.createdAt).toLocaleString(isRtl ? 'ar-EG' : 'en-EG')}</span></div>
        <div className="customer-stats"><span className={`status-pill status-${item.status}`}>{item.status}</span><strong>{item.netAmount.toLocaleString()} {isRtl ? 'ج.م' : 'EGP'}</strong><button className="icon-button" onClick={(event) => { event.stopPropagation(); void printItem(historyItem); }} disabled={printingId === item.id} title={isRtl ? 'طباعة الفاتورة' : 'Print invoice'} aria-label={isRtl ? 'طباعة الفاتورة' : 'Print invoice'}><Printer size={16} /></button></div>
      </div>;
    }
    const item = historyItem.item;
    return <div className="customer-row record-card history-grid-card" key={`reservation-${item.id}`} onClick={() => navigate(`/reservations/${item.id}`)} role="button" tabIndex={0}>
      <div className="customer-main"><strong>{item.reservationNumber}</strong><span>{item.customer.name} · {item.customer.phone}</span><span>{isRtl ? 'حجز' : 'Reservation'} · {new Date(item.createdAt).toLocaleString(isRtl ? 'ar-EG' : 'en-EG')}</span></div>
      <div className="customer-stats"><span className={`status-pill status-${item.status}`}>{item.status}</span><strong>{item.totalPrice.toLocaleString()} {isRtl ? 'ج.م' : 'EGP'}</strong><button className="icon-button" onClick={(event) => { event.stopPropagation(); void printItem(historyItem); }} disabled={printingId === item.id} title={isRtl ? 'طباعة الفاتورة' : 'Print invoice'} aria-label={isRtl ? 'طباعة الفاتورة' : 'Print invoice'}><Printer size={16} /></button></div>
    </div>;
  }

  function renderPagination() {
    if (!result) return null;
    return <div className="panel-heading history-pagination">
      <span>{result.total} {isRtl ? 'معاملة' : 'transactions'}</span>
      <div>
        <button className="icon-button" disabled={page <= 1} onClick={() => setPage(value => value - 1)} title="Previous">{isRtl ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}</button>
        <span>{page} / {totalPages}</span>
        <button className="icon-button" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)} title="Next">{isRtl ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}</button>
      </div>
    </div>;
  }

  return (
    <div className="space-y-4 history-page">
      <div className="page-heading history-heading"><div><span className="eyebrow">{isRtl ? 'السجل الكامل' : 'Full history'}</span><h1>{isRtl ? 'سجل المعاملات' : 'Transaction history'}</h1><p>{isRtl ? 'بحث في طلبات الفرع الحالي.' : 'Search orders in the signed-in user branch.'}</p></div><button className="secondary-action" onClick={() => query.refetch()}><RefreshCw size={16} /> {isRtl ? 'تحديث' : 'Refresh'}</button></div>

      {/* Filters */}
      <div className="history-filters bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div>
          <div className="search-box"><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={isRtl ? 'رقم الطلب أو العميل أو الهيكل...' : 'Order, customer, or VIN...'} /></div>
        </div>

        <div className="history-filter-row"><select className="pos-input" value={status} onChange={(event) => { setStatus(event.target.value as OrderStatus | ''); setPage(1); }}><option value="">{isRtl ? 'كل الحالات' : 'All statuses'}</option>{(['draft', 'confirmed', 'processing', 'awaiting_delivery', 'completed', 'cancelled', 'refunded'] as OrderStatus[]).map((value) => <option key={value} value={value}>{value}</option>)}</select><DateRangeFilter startLabel={isRtl ? 'من' : 'From'} endLabel={isRtl ? 'إلى' : 'To'} startValue={startDate} endValue={endDate} onStartChange={(value) => { setStartDate(value); setPage(1); }} onEndChange={(value) => { setEndDate(value); setPage(1); }} /></div>
      </div>

      {query.isLoading && <DataTableState kind="loading" lang={lang} />}
      {query.isError && <DataTableState kind="error" lang={lang} onRetry={() => query.refetch()} />}
      {!query.isLoading && !query.isError && result?.items.length === 0 && <DataTableState kind="empty" lang={lang} />}
      {!query.isLoading && !query.isError && result && result.items.length > 0 && <div>
        <DataList className="customer-list history-records history-grid">{result.items.map(renderHistoryItem)}</DataList>
        {renderPagination()}
      </div>}
    </div>
  );
}
