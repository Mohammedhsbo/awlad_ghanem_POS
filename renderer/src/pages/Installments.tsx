import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CreditCard, RefreshCw, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { reports } from '../api';
import { financing, installments, type FinancingContractRecord, type InstallmentRecord, type PaymentMethod } from '../api';
import { DataTable, DataTableState } from '../components/DataTable';

type Lang = 'en' | 'ar';
const methods: PaymentMethod[] = ['cash', 'card', 'bank_transfer', 'cheque'];

export default function Installments({ lang }: { lang: Lang }) {
  const isRtl = lang === 'ar';
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<FinancingContractRecord | null>(null);
  const [paymentInstallment, setPaymentInstallment] = useState<InstallmentRecord | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [error, setError] = useState('');
  const { data: contracts = [], isLoading, isError, refetch } = useQuery({ queryKey: ['desktop-financing'], queryFn: async () => (await financing.list({ limit: 100 })).items });
  const portfolio = useQuery({ queryKey: ['desktop-installment-portfolio'], queryFn: () => reports.installments({ preset: 'this_month' }) });
  const detail = useQuery({ queryKey: ['desktop-financing-detail', selected?.id], queryFn: () => financing.get(selected!.id), enabled: Boolean(selected?.id) });
  const pay = useMutation({ mutationFn: () => installments.pay(paymentInstallment!.id, { amount: Number(amount), method, idempotencyKey: `pos-installment-${paymentInstallment!.id}-${Date.now()}` }), onSuccess: () => { setPaymentInstallment(null); setAmount(''); setError(''); qc.invalidateQueries({ queryKey: ['desktop-financing'] }); qc.invalidateQueries({ queryKey: ['desktop-financing-detail', selected?.id] }); }, onError: (err: any) => setError(err.message || (isRtl ? 'فشل تسجيل الدفع' : 'Payment failed')) });
  const money = (value: number) => `${Number(value || 0).toLocaleString(isRtl ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 2 })} ${isRtl ? 'ج.م' : 'EGP'}`;
  const date = (value?: string) => value ? new Date(value).toLocaleDateString(isRtl ? 'ar-EG' : 'en-GB') : '-';
  const contractInstallments = detail.data?.installments || selected?.installments || [];
  const outstanding = Number(portfolio.data?.outstandingAmount || 0);
  const overdueAmount = Number(portfolio.data?.overdueAmount || 0);

  return <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
    <div className="page-heading"><div><span className="eyebrow">{isRtl ? 'التمويل والتحصيل' : 'Finance & collections'}</span><h1>{isRtl ? 'إدارة الأقساط' : 'Installments'}</h1><p>{isRtl ? 'تابع العقود وسجل التحصيلات من الخادم.' : 'Review contracts and record confirmed payments from the backend.'}</p></div><button className="secondary-action" onClick={() => refetch()}><RefreshCw size={16} /> {isRtl ? 'تحديث' : 'Refresh'}</button></div>
    <div className="dashboard-grid finance-kpis"><div className="metric-card metric-orange"><span>{isRtl ? 'العقود النشطة' : 'Active contracts'}</span><strong>{portfolio.data?.activeContracts ?? contracts.length}</strong></div><div className="metric-card metric-blue"><span>{isRtl ? 'الممول' : 'Financed'}</span><strong>{money(Number(portfolio.data?.totalFinanced || 0))}</strong></div><div className="metric-card metric-green"><span>{isRtl ? 'المتبقي' : 'Outstanding'}</span><strong>{money(outstanding)}</strong></div><div className="metric-card metric-purple"><span>{isRtl ? 'المتأخر' : 'Overdue'}</span><strong>{money(overdueAmount)}</strong></div></div>
    {isLoading && <DataTableState kind="loading" lang={lang} />}
    {isError && <DataTableState kind="error" lang={lang} onRetry={() => refetch()} />}
    {!isLoading && !isError && contracts.length === 0 && <DataTableState kind="empty" lang={lang} />}
    {!isLoading && !isError && contracts.length > 0 && <DataTable className="contract-table"><div className="contract-header"><span>{isRtl ? 'العقد' : 'Contract'}</span><span>{isRtl ? 'العميل' : 'Customer'}</span><span>{isRtl ? 'المبلغ' : 'Amount'}</span><span>{isRtl ? 'الحالة' : 'Status'}</span></div>{contracts.map(contract => <button className="contract-row" key={contract.id} onClick={() => navigate(`/installments/${contract.id}`)}><span><strong>{contract.contractNumber}</strong><small>{contract.numberOfInstallments} {isRtl ? 'قسط' : 'installments'}</small></span><span>{contract.customer?.name || contract.customerId}</span><span>{money(contract.totalAmount)}</span><span className={`status-text status-${contract.status}`}>{contract.status}</span></button>)}</DataTable>}
    {selected && <div className="drawer-backdrop" onClick={() => setSelected(null)}><aside className="detail-drawer" onClick={event => event.stopPropagation()}><button className="drawer-close" onClick={() => setSelected(null)}><X size={18} /></button><span className="eyebrow">{selected.contractNumber}</span><h2>{isRtl ? 'تفاصيل العقد' : 'Contract details'}</h2><div className="detail-summary"><span>{isRtl ? 'العميل' : 'Customer'}<strong>{selected.customer?.name || selected.customerId}</strong></span><span>{isRtl ? 'المبلغ الممول' : 'Financed'}<strong>{money(selected.financingAmount)}</strong></span><span>{isRtl ? 'الدفعة المقدمة' : 'Down payment'}<strong>{money(selected.downPayment)}</strong></span><span>{isRtl ? 'الفائدة' : 'Interest'}<strong>{selected.interestRate}%</strong></span></div><div className="schedule-heading"><h3>{isRtl ? 'جدول السداد' : 'Payment schedule'}</h3><CalendarClock size={18} /></div>{detail.isLoading ? <p className="text-muted">{isRtl ? 'جاري التحميل...' : 'Loading...'}</p> : <div className="schedule-list">{contractInstallments.map(item => <div className="schedule-row" key={item.id}><div><strong>#{item.installmentNumber}</strong><small>{date(item.dueDate)}</small></div><span>{money(item.amount)}<small>{item.status}</small></span><button className="pay-link" disabled={item.status === 'paid'} onClick={() => { setPaymentInstallment(item); setAmount(String(Number(item.remainingAmount ?? item.amount - item.paidAmount))); }}>{item.status === 'paid' ? (isRtl ? 'مدفوع' : 'Paid') : (isRtl ? 'تحصيل' : 'Collect')}</button></div>)}</div>}</aside></div>}
    {paymentInstallment && <div className="modal-backdrop"><div className="payment-modal"><h2><CreditCard size={20} /> {isRtl ? 'تحصيل قسط' : 'Record installment payment'}</h2><p>{isRtl ? 'القسط' : 'Installment'} #{paymentInstallment.installmentNumber} · {money(paymentInstallment.remainingAmount ?? paymentInstallment.amount - paymentInstallment.paidAmount)}</p>{error && <div className="inline-error">{error}</div>}<label>{isRtl ? 'المبلغ' : 'Amount'}<input type="number" min="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></label><label>{isRtl ? 'طريقة الدفع' : 'Method'}<select value={method} onChange={event => setMethod(event.target.value as PaymentMethod)}>{methods.map(item => <option key={item} value={item}>{item}</option>)}</select></label><div className="modal-actions"><button className="secondary-action" onClick={() => setPaymentInstallment(null)}>{isRtl ? 'إلغاء' : 'Cancel'}</button><button className="primary-action" disabled={pay.isPending || Number(amount) <= 0} onClick={() => pay.mutate()}>{pay.isPending ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'تأكيد التحصيل' : 'Confirm payment')}</button></div></div></div>}
  </section>;
}
