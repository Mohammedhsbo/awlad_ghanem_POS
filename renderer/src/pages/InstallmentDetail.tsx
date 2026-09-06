import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, CreditCard, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { financing, installments, type InstallmentRecord, type PaymentMethod } from '../api';

const methods: PaymentMethod[] = ['cash', 'card', 'bank_transfer', 'cheque'];

type Lang = 'en' | 'ar';

export default function InstallmentDetail({ lang }: { lang: Lang }) {
  const isRtl = lang === 'ar';
  const navigate = useNavigate();
  const { id } = useParams();
  const qc = useQueryClient();
  const [paymentInstallment, setPaymentInstallment] = useState<InstallmentRecord | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [error, setError] = useState('');

  const contractQuery = useQuery({
    queryKey: ['desktop-financing-detail', id],
    queryFn: () => financing.get(id!),
    enabled: !!id,
  });

  const contract = contractQuery.data;

  const pay = useMutation({
    mutationFn: () => installments.pay(paymentInstallment!.id, {
      amount: Number(amount),
      method,
      idempotencyKey: `pos-installment-${paymentInstallment!.id}-${Date.now()}`,
    }),
    onSuccess: () => {
      setPaymentInstallment(null);
      setAmount('');
      setError('');
      void qc.invalidateQueries({ queryKey: ['desktop-financing'] });
      void qc.invalidateQueries({ queryKey: ['desktop-financing-detail', id] });
    },
    onError: (err: any) => setError(err.message || (isRtl ? 'فشل تسجيل الدفع' : 'Payment failed')),
  });

  const installmentsList = useMemo(() => contract?.installments ?? [], [contract]);

  const money = (value: number) =>
    `${Number(value || 0).toLocaleString(isRtl ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 2 })} ${isRtl ? 'ج.م' : 'EGP'}`;

  const date = (value?: string) => (value ? new Date(value).toLocaleDateString(isRtl ? 'ar-EG' : 'en-GB') : '-');

  return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="page-heading">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button type="button" className="secondary-action" onClick={() => navigate('/installments')}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <span className="eyebrow">{isRtl ? 'تفاصيل العقد' : 'Contract details'}</span>
            <h1>{contract?.contractNumber ?? (isRtl ? 'جاري التحميل...' : 'Loading...')}</h1>
          </div>
        </div>
      </div>

      {contractQuery.isLoading && <div className="surface-panel skeleton" style={{ minHeight: '420px' }} />}
      {contractQuery.isError && <div className="state-panel">{isRtl ? 'تعذر تحميل تفاصيل العقد.' : 'Could not load contract details.'}</div>}

      {contract && (
        <>
          <div className="dashboard-grid finance-kpis">
            <div className="metric-card metric-orange">
              <span>{isRtl ? 'العميل' : 'Customer'}</span>
              <strong>{contract.customer?.name || contract.customerId}</strong>
            </div>
            <div className="metric-card metric-blue">
              <span>{isRtl ? 'المبلغ الممول' : 'Financed'}</span>
              <strong>{money(contract.financingAmount)}</strong>
            </div>
            <div className="metric-card metric-green">
              <span>{isRtl ? 'الدفعة المقدمة' : 'Down payment'}</span>
              <strong>{money(contract.downPayment)}</strong>
            </div>
            <div className="metric-card metric-purple">
              <span>{isRtl ? 'الفائدة' : 'Interest'}</span>
              <strong>{contract.interestRate}%</strong>
            </div>
          </div>

          <div className="surface-panel" style={{ marginTop: '1.25rem' }}>
            <div className="panel-heading" style={{ marginBottom: '0.75rem' }}>
              <div>
                <span className="eyebrow">{isRtl ? 'الجدول' : 'Schedule'}</span>
                <h2>{isRtl ? 'جدول السداد' : 'Payment schedule'}</h2>
              </div>
              <CalendarClock size={18} />
            </div>

            {installmentsList.length === 0 ? (
              <div className="empty-state">{isRtl ? 'لا توجد أقساط في هذا العقد.' : 'No installments in this contract.'}</div>
            ) : (
              <div className="pos-plan-schedule-table-wrap">
                <table className="pos-plan-schedule-table" style={{ minWidth: 760 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{isRtl ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
                      <th>{isRtl ? 'المبلغ' : 'Amount'}</th>
                      <th>{isRtl ? 'المدفوع' : 'Paid'}</th>
                      <th>{isRtl ? 'الحالة' : 'Status'}</th>
                      <th>{isRtl ? 'إجراء' : 'Action'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {installmentsList.map((item, index) => (
                      <tr key={item.id} className={item.status === 'overdue' || item.status === 'due' ? 'pos-plan-overdue' : ''}>
                        <td>{index + 1}</td>
                        <td>
                          {date(item.dueDate)}
                          {(item.status === 'overdue' || item.status === 'due') && (
                            <span className="pos-plan-overdue-label">{isRtl ? 'مستحق' : 'due'}</span>
                          )}
                        </td>
                        <td>{money(item.amount)}</td>
                        <td>{money(item.paidAmount)}</td>
                        <td>{item.status}</td>
                        <td>
                          <button
                            className="secondary-action"
                            type="button"
                            disabled={item.status === 'paid'}
                            onClick={() => {
                              setPaymentInstallment(item);
                              setAmount(String(Number(item.remainingAmount ?? item.amount - item.paidAmount)));
                            }}
                          >
                            {item.status === 'paid' ? (isRtl ? 'مدفوع' : 'Paid') : (isRtl ? 'تحصيل' : 'Collect')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {paymentInstallment && (
        <div className="modal-backdrop" onClick={() => setPaymentInstallment(null)}>
          <div className="payment-modal" onClick={(event) => event.stopPropagation()}>
            <h2><CreditCard size={20} /> {isRtl ? 'تحصيل قسط' : 'Record installment payment'}</h2>
            <p>{isRtl ? 'القسط' : 'Installment'} #{paymentInstallment.installmentNumber} · {money(paymentInstallment.remainingAmount ?? paymentInstallment.amount - paymentInstallment.paidAmount)}</p>
            {error && <div className="inline-error">{error}</div>}
            <label>
              {isRtl ? 'المبلغ' : 'Amount'}
              <input type="number" min="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </label>
            <label>
              {isRtl ? 'طريقة الدفع' : 'Method'}
              <select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
                {methods.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={() => setPaymentInstallment(null)}>{isRtl ? 'إلغاء' : 'Cancel'}</button>
              <button className="primary-action" type="button" disabled={pay.isPending || Number(amount) <= 0} onClick={() => pay.mutate()}>
                {pay.isPending ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'تأكيد التحصيل' : 'Confirm payment')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
