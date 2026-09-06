import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Power, RefreshCw, Search, UserRound } from 'lucide-react';
import { customers, pos } from '../api';
import CustomerFormPOS from '../components/CustomerFormPOS';
import { DataList, DataTableState } from '../components/DataTable';
import type { CustomerDetail } from '../api';

type Lang = 'en' | 'ar';

export default function Customers({ lang }: { lang: Lang }) {
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const isRtl = lang === 'ar';
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const { data = { items: [], total: 0, page: 1, limit: 10, totalPages: 0 }, isLoading, isError, refetch } = useQuery({
    queryKey: ['desktop-customers', query, page, includeInactive],
    queryFn: async () => includeInactive ? customers.list({ search: query, page, limit: 10 }) : pos.searchCustomers(query, 10, page),
  });
  const rows = data.items;
  const isActiveCustomer = (customer: unknown) => typeof customer === 'object' && customer !== null && 'isActive' in customer ? customer.isActive !== false : true;
  const detail = useQuery({ queryKey: ['desktop-customer', selectedId], queryFn: () => customers.get(selectedId!), enabled: Boolean(selectedId) });
  const toggleActive = useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => active ? customers.reactivate(id) : customers.deactivate(id), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['desktop-customers'] }); void queryClient.invalidateQueries({ queryKey: ['desktop-customer', selectedId] }); } });

  return <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
    <div className="page-heading"><div><span className="eyebrow">{isRtl ? 'دليل العملاء' : 'Customer directory'}</span><h1>{isRtl ? 'العملاء' : 'Customers'}</h1><p>{isRtl ? 'ابحث عن العميل قبل بدء البيع أو الحجز.' : 'Find a customer before starting a sale or reservation.'}</p></div><div className="report-controls"><button className="secondary-action" onClick={() => refetch()}><RefreshCw size={16} /> {isRtl ? 'تحديث' : 'Refresh'}</button><button className="primary-action" onClick={() => setShowCreate(true)}>{isRtl ? 'عميل جديد' : 'New customer'}</button></div></div>
    <div className="toolbar"><div className="search-box"><Search size={17} /><input autoFocus value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder={isRtl ? 'الاسم أو الهاتف...' : 'Name or phone...'} /></div><label className="input-label"><input type="checkbox" checked={includeInactive} onChange={event => { setIncludeInactive(event.target.checked); setPage(1); }} /> {isRtl ? 'تضمين غير النشطين' : 'Include inactive'}</label></div>
    {isLoading && <DataTableState kind="loading" lang={lang} />}
    {isError && <DataTableState kind="error" lang={lang} onRetry={() => refetch()} />}
    {!isLoading && !isError && rows.length === 0 && <DataTableState kind="empty" lang={lang} />}
    {!isLoading && !isError && rows.length > 0 && <DataList className="customer-list">{rows.map((customer: any) => <article className="customer-row" key={customer.id}><div className="customer-avatar"><UserRound size={18} /></div><div className="customer-main"><strong>{customer.name}</strong><span>{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</span></div><div className="customer-stats"><span>{customer.recentOrderCount ?? 0} {isRtl ? 'طلبات حديثة' : 'recent orders'}</span><span>{customer.activeReservationCount ?? 0} {isRtl ? 'حجوزات نشطة' : 'active reservations'}</span></div><div className="row-actions"><button className="icon-button" title={isRtl ? 'تعديل' : 'Edit'} onClick={() => setSelectedId(customer.id)}><Edit3 size={15} /></button>{includeInactive && <button className="icon-button" title={!isActiveCustomer(customer) ? (isRtl ? 'تفعيل' : 'Reactivate') : (isRtl ? 'تعطيل' : 'Deactivate')} onClick={() => toggleActive.mutate({ id: customer.id, active: !isActiveCustomer(customer) })}><Power size={15} /></button>}{!includeInactive && <button className="icon-button" title={isRtl ? 'تعطيل' : 'Deactivate'} onClick={() => toggleActive.mutate({ id: customer.id, active: false })}><Power size={15} /></button>}</div></article>)}</DataList>}
    {!isLoading && !isError && data.totalPages > 1 && <div className="report-controls"><button className="secondary-action" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {data.totalPages} ({data.total})</span><button className="secondary-action" disabled={page === data.totalPages} onClick={() => setPage(value => value + 1)}>Next</button></div>}
    {showCreate && <CustomerFormPOS lang={lang} onClose={() => setShowCreate(false)} onSuccess={(_customer: CustomerDetail) => { setShowCreate(false); void refetch(); }} />}
    {detail.data && <CustomerFormPOS lang={lang} customer={detail.data} onClose={() => setSelectedId(null)} onSuccess={() => { setSelectedId(null); void refetch(); }} />}
  </section>;
}
