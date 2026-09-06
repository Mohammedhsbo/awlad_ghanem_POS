import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, ChevronDown, ChevronUp, CheckCircle2, Clock, AlertCircle, Search, Plus } from 'lucide-react';
import {
  posInstallments,
  salesRequests,
  type PosInstallmentPlanRecord,
  type PosInstallment,
} from '../api';
import { useViewingBranch } from '../contexts/ViewingBranchContext';
import { DataTableState } from '../components/DataTable';

type Lang = 'en' | 'ar';

function statusColor(s: PosInstallment['status']) {
  if (s === 'PAID') return 'var(--green)';
  if (s === 'PARTIAL') return '#f59e0b';
  return 'var(--text-3)';
}

function InstallmentStatusIcon({ status }: { status: PosInstallment['status'] }) {
  if (status === 'PAID') return <CheckCircle2 size={15} />;
  if (status === 'PARTIAL') return <AlertCircle size={15} />;
  return <Clock size={15} />;
}

export default function PosInstallments({ lang }: { lang: Lang }) {
  const isRtl = lang === 'ar';
  const qc = useQueryClient();
  const { viewingBranchId } = useViewingBranch();

  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Generate Plan modal state
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [months, setMonths] = useState('12');
  const [interestRate, setInterestRate] = useState('0');
  const [genError, setGenError] = useState<string | null>(null);

  const plansQuery = useQuery({
    queryKey: ['pos-installments', viewingBranchId, search],
    queryFn: () => posInstallments.list(viewingBranchId ?? undefined, search || undefined),
  });

  const requestsQuery = useQuery({
    queryKey: ['sales-requests', viewingBranchId],
    queryFn: () => salesRequests.list(viewingBranchId ?? undefined),
    enabled: showGenerate,
  });

  const generate = useMutation({
    mutationFn: () =>
      posInstallments.generate({
        saleRequestId: selectedRequestId,
        months: Number(months),
        interestRate: Number(interestRate),
      }),
    onSuccess: () => {
      setShowGenerate(false);
      setSelectedRequestId('');
      setMonths('12');
      setInterestRate('0');
      setGenError(null);
      void qc.invalidateQueries({ queryKey: ['pos-installments'] });
    },
    onError: (err: Error) => setGenError(err.message),
  });

  const money = (v: number) =>
    `${Number(v).toLocaleString(isRtl ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 0 })} ${isRtl ? 'ج.م' : 'EGP'}`;

  const plans: PosInstallmentPlanRecord[] = plansQuery.data ?? [];
  const pendingRequests = requestsQuery.data?.filter((r) => r.status === 'PENDING') ?? [];

  const activePlans = plans.filter((plan) => plan.status === 'ACTIVE').length;
  const totalOutstanding = plans.reduce((sum, plan) => sum + plan.remainingBalance, 0);
  const totalCollected = plans.reduce((sum, plan) => sum + plan.paidAmount, 0);
  const overdueCount = plans.reduce(
    (sum, plan) => sum + plan.installments.filter((inst) => inst.status !== 'PAID' && new Date(inst.dueDate) < new Date()).length,
    0,
  );

  return (
    <section className="desktop-page pos-installments-shell" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="page-heading pos-installments-header">
        <div>
          <span className="eyebrow">{isRtl ? 'إدارة التقسيط' : 'Installment management'}</span>
          <h1>{isRtl ? 'خطط التقسيط' : 'Installment Plans'}</h1>
          <p>{isRtl ? 'عرض ومتابعة خطط التقسيط النشطة.' : 'View and track active installment plans.'}</p>
        </div>
        <button className="primary-action pos-installment-primary" onClick={() => setShowGenerate(true)}>
          <Plus size={16} />
          {isRtl ? 'إنشاء خطة من طلب' : 'Generate from Request'}
        </button>
      </div>

      <div className="pos-installment-summary-grid">
        <div className="surface-panel pos-summary-card">
          <span className="eyebrow">{isRtl ? 'الخطط النشطة' : 'Active plans'}</span>
          <strong>{activePlans}</strong>
          <small>{isRtl ? 'خطة قيد التنفيذ' : 'plans in progress'}</small>
        </div>
        <div className="surface-panel pos-summary-card accent-card">
          <span className="eyebrow">{isRtl ? 'المجموع المدفوع' : 'Collected'}</span>
          <strong>{money(totalCollected)}</strong>
          <small>{isRtl ? 'من إجمالي المبيعات' : 'across all plans'}</small>
        </div>
        <div className="surface-panel pos-summary-card danger-card">
          <span className="eyebrow">{isRtl ? 'المتبقي' : 'Outstanding'}</span>
          <strong>{money(totalOutstanding)}</strong>
          <small>{overdueCount} {isRtl ? 'متأخر' : 'overdue'}</small>
        </div>
      </div>

      {showGenerate && (
        <div
          className="pos-plan-modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setShowGenerate(false); }}
        >
          <form
            className="surface-panel pos-plan-modal"
            onSubmit={(e) => { e.preventDefault(); setGenError(null); generate.mutate(); }}
          >
            <div className="pos-plan-modal-header">
              <div>
                <span className="eyebrow">{isRtl ? 'إدارة التقسيط' : 'Installments'}</span>
                <h2>{isRtl ? 'إنشاء خطة تقسيط' : 'Generate Installment Plan'}</h2>
              </div>
              <button type="button" className="icon-btn ghost" onClick={() => setShowGenerate(false)} aria-label="Close">
                ×
              </button>
            </div>

            {genError && <div className="inline-error" role="alert">{genError}</div>}

            <label className="pos-plan-form-label">
              <span>{isRtl ? 'طلب التقسيط *' : 'Installment Request *'}</span>
              <select
                required
                value={selectedRequestId}
                onChange={(e) => setSelectedRequestId(e.target.value)}
              >
                <option value="">{isRtl ? '-- اختر طلباً --' : '-- Select a request --'}</option>
                {pendingRequests.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.customerName} — {r.customerPhone} ({money(r.requestedAmount)})
                  </option>
                ))}
              </select>
            </label>

            <div className="pos-plan-form-grid">
              <label className="pos-plan-form-label">
                <span>{isRtl ? 'عدد الأشهر *' : 'Number of Months *'}</span>
                <input
                  required
                  type="number"
                  min="1"
                  max="120"
                  value={months}
                  onChange={(e) => setMonths(e.target.value)}
                />
              </label>

              <label className="pos-plan-form-label">
                <span>{isRtl ? 'الفائدة (%)' : 'Interest Rate (%)'}</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                />
              </label>
            </div>

            <div className="pos-plan-modal-actions">
              <button className="secondary-action" type="button" onClick={() => setShowGenerate(false)}>
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button className="primary-action" type="submit" disabled={generate.isPending}>
                {generate.isPending
                  ? (isRtl ? 'جاري الإنشاء...' : 'Generating...')
                  : (isRtl ? 'إنشاء الخطة' : 'Create Plan')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="surface-panel pos-installments-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isRtl ? 'ابحث بالاسم أو رقم الهاتف...' : 'Search by name or phone...'}
          />
        </div>
        <span className="result-count">{plans.length} {isRtl ? 'خطة' : 'plans'}</span>
      </div>

      {plansQuery.isLoading && <DataTableState kind="loading" lang={lang} />}
      {!plansQuery.isLoading && plans.length === 0 && <DataTableState kind="empty" lang={lang} />}

      {!plansQuery.isLoading && plans.length > 0 && (
        <div className="pos-plan-list">
          {plans.map((plan) => {
            const isExpanded = expandedId === plan.id;
            const mcBrand = isRtl
              ? plan.motorcycle?.brand?.nameAr
              : plan.motorcycle?.brand?.nameEn;
            const paidPct = plan.totalAmount
              ? Math.round((plan.paidAmount / plan.totalAmount) * 100)
              : 0;
            const overdue = plan.installments.filter((inst) => inst.status !== 'PAID' && new Date(inst.dueDate) < new Date()).length;

            return (
              <article key={plan.id} className="surface-panel pos-plan-card">
                <div className="pos-plan-card-header" onClick={() => setExpandedId(isExpanded ? null : plan.id)}>
                  <div className="pos-plan-main">
                    <div className="pos-plan-client-row">
                      <h2>{plan.customerName}</h2>
                      <span className={`pos-plan-status pos-plan-status-${plan.status.toLowerCase()}`}>
                        {plan.status}
                      </span>
                    </div>

                    <div className="pos-plan-meta">
                      <span>📞 {plan.customerPhone}</span>
                      {plan.motorcycle && (
                        <span>
                          <Calendar size={13} />
                          {' '}{mcBrand} {plan.motorcycle.model}
                        </span>
                      )}
                    </div>
                  </div>

                  <button type="button" className="icon-btn ghost" aria-label={isExpanded ? 'Collapse' : 'Expand'}>
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                </div>

                <div className="pos-plan-metrics">
                  <div>
                    <small>{isRtl ? 'إجمالي' : 'Total'}</small>
                    <strong>{money(plan.totalAmount)}</strong>
                  </div>
                  <div>
                    <small>{isRtl ? 'مدفوع' : 'Paid'}</small>
                    <strong className="positive">{money(plan.paidAmount)}</strong>
                  </div>
                  <div>
                    <small>{isRtl ? 'متبقي' : 'Remaining'}</small>
                    <strong className="danger">{money(plan.remainingBalance)}</strong>
                  </div>
                </div>

                <div className="pos-plan-progress">
                  <div className="pos-plan-progress-track">
                    <span style={{ width: `${paidPct}%` }} />
                  </div>
                  <small>{paidPct}% {isRtl ? 'مسدد' : 'paid'}</small>
                </div>

                {isExpanded && (
                  <div className="pos-plan-schedule-wrap">
                    {plan.installments.length === 0 ? (
                      <p className="pos-plan-empty">{isRtl ? 'لا توجد أقساط.' : 'No installments.'}</p>
                    ) : (
                      <div className="pos-plan-schedule-table-wrap">
                        <table className="pos-plan-schedule-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>{isRtl ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
                              <th>{isRtl ? 'المبلغ' : 'Amount'}</th>
                              <th>{isRtl ? 'المدفوع' : 'Paid'}</th>
                              <th>{isRtl ? 'الحالة' : 'Status'}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {plan.installments.map((inst, idx) => {
                              const overdue = inst.status !== 'PAID' && new Date(inst.dueDate) < new Date();
                              return (
                                <tr key={inst.id} className={overdue ? 'pos-plan-overdue' : ''}>
                                  <td>{idx + 1}</td>
                                  <td>
                                    {new Date(inst.dueDate).toLocaleDateString(isRtl ? 'ar-EG' : 'en-GB')}
                                    {overdue && <span className="pos-plan-overdue-label">{isRtl ? 'متأخر' : 'overdue'}</span>}
                                  </td>
                                  <td>{money(inst.amount)}</td>
                                  <td className="positive">{money(inst.paidAmount)}</td>
                                  <td>
                                    <span className="pos-installment-status" style={{ color: statusColor(inst.status) }}>
                                      <InstallmentStatusIcon status={inst.status} />
                                      {inst.status}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {overdue > 0 && (
                      <div className="pos-plan-warning">
                        <AlertCircle size={14} />
                        {isRtl ? `${overdue} أقساط مستحقة الآن.` : `${overdue} installments are due now.`}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
