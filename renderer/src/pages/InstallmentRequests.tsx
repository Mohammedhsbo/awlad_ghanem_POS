import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Search, RefreshCw, FileText, Eye, CalendarDays, CircleDollarSign } from 'lucide-react';
import { customerFinancing, type InstallmentRequest } from '../api';
import Modal from '../components/Modal';
import Badge from '../components/Badge';

interface Props { lang: 'en' | 'ar' }

const t = {
  en: {
    title: 'Installment Requests', subtitle: 'Review and process customer installment applications',
    search: 'Search by customer name...',
    status: 'Status', date: 'Date', customer: 'Customer', motorcycle: 'Motorcycle',
    downPayment: 'Down Payment', amount: 'Installment Amount', duration: 'Duration (months)',
    actions: 'Actions', all: 'All Statuses', pending: 'Pending', approved: 'Approved',
    rejected: 'Rejected', review: 'Review Request', approve: 'Approve', reject: 'Reject',
    rejectionReason: 'Rejection Reason (optional)', submit: 'Submit', cancel: 'Cancel',
    noData: 'No installment requests found.', loading: 'Loading...', error: 'Failed to load requests.',
    viewDetails: 'View Details', buyerInfo: 'Buyer Information', guarantorInfo: 'Guarantor Information',
    documents: 'Documents', financeInfo: 'Financing Details', buyerName: 'Name', buyerPhone: 'Phone',
    buyerEmail: 'Email', buyerAddress: 'Address', buyerOccupation: 'Occupation',
    docBuyerId: 'Buyer National ID', docSalary: 'Salary Slip', docApartment: 'Apartment Contract',
    docGuarantorId: 'Guarantor National ID', retry: 'Retry', company: 'Company', monthsUnit: 'Months',
    confirmApprove: 'Are you sure you want to approve this installment request?',
    confirmReject: 'Are you sure you want to reject this installment request?'
  },
  ar: {
    title: 'طلبات التقسيط', subtitle: 'مراجعة ومعالجة طلبات تقسيط العملاء',
    search: 'بحث باسم العميل...',
    status: 'الحالة', date: 'التاريخ', customer: 'العميل', motorcycle: 'الدراجة',
    downPayment: 'الدفعة الأولى', amount: 'مبلغ القسط', duration: 'المدة (أشهر)',
    actions: 'الإجراءات', all: 'كل الحالات', pending: 'قيد المراجعة', approved: 'مقبول',
    rejected: 'مرفوض', review: 'مراجعة الطلب', approve: 'قبول', reject: 'رفض',
    rejectionReason: 'سبب الرفض (اختياري)', submit: 'تأكيد', cancel: 'إلغاء',
    noData: 'لا توجد طلبات تقسيط.', loading: 'جاري التحميل...', error: 'فشل تحميل الطلبات.',
    viewDetails: 'عرض التفاصيل', buyerInfo: 'بيانات المشتري', guarantorInfo: 'بيانات الضامن',
    documents: 'المستندات', financeInfo: 'تفاصيل التمويل', buyerName: 'الاسم', buyerPhone: 'رقم الهاتف',
    buyerEmail: 'البريد الإلكتروني', buyerAddress: 'العنوان', buyerOccupation: 'الوظيفة',
    docBuyerId: 'صورة بطاقة المشتري', docSalary: 'صورة مرتب/معاش', docApartment: 'عقد الإقامة',
    docGuarantorId: 'صورة بطاقة الضامن', retry: 'إعادة المحاولة', company: 'شركة التمويل', monthsUnit: 'أشهر',
    confirmApprove: 'هل أنت متأكد من قبول طلب التقسيط؟',
    confirmReject: 'هل أنت متأكد من رفض طلب التقسيط؟'
  },
};

export default function InstallmentRequests({ lang }: Props) {
  const i18n = t[lang];
  const isRtl = lang === 'ar';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<InstallmentRequest | null>(null);
  const [modalMode, setModalMode] = useState<'approve' | 'reject' | 'view' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['installment-requests', statusFilter],
    queryFn: () => customerFinancing.listRequests(statusFilter || undefined),
  });
  
  const reviewMut = useMutation({
    mutationFn: ({ id, status, reason }: { id: string, status: 'approved' | 'rejected', reason?: string }) => 
      customerFinancing.reviewRequest(id, { status, rejectionReason: reason }),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['installment-requests'] }); 
      closeModal(); 
    },
    onError: (error: Error) => setFormError(error.message)
  });

  useEffect(() => { if (query.error) setFormError(query.error.message); }, [query.error]);
  
  function openReview(req: InstallmentRequest, mode: 'approve' | 'reject') { 
    setSelected(req); 
    setModalMode(mode); 
    setRejectionReason('');
    setFormError(null); 
  }

  function openView(req: InstallmentRequest) {
    setSelected(req);
    setModalMode('view');
    setFormError(null);
  }
  
  function closeModal() { 
    setModalMode(null); 
    setSelected(null); 
    setFormError(null); 
  }
  
  function submit(event: FormEvent) { 
    event.preventDefault(); 
    if (!selected || !modalMode) return;
    setFormError(null); 
    reviewMut.mutate({ id: selected.id, status: modalMode === 'approve' ? 'approved' : 'rejected', reason: rejectionReason });
  }

  const rows = (query.data ?? [])
    .filter(req => {
      if (!search) return true;
      const term = search.toLowerCase();
      const cName = (req.customer?.name || req.buyerName || '').toLowerCase();
      const mName = req.motorcycle ? req.motorcycle.model.toLowerCase() : '';
      return cName.includes(term) || mName.includes(term);
    });
    
  const isBusy = reviewMut.isPending;
  const formatAmount = (amount?: number | null) => amount == null ? '-' : `${amount.toLocaleString()} EGP`;

  return (
  <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
    <div className="premium-page-header">
      <div>
        <h1>{i18n.title}</h1>
        <p>{i18n.subtitle}</p>
      </div>
    </div>
    
    <div className="premium-glass-panel mb-6" style={{ padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
      <div className="flex items-center gap-3">
        <Search size={18} style={{ color: 'var(--blue)' }} />
        <input className="input-field" style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '0.95rem' }} placeholder={i18n.search} value={search} onChange={event => setSearch(event.target.value)} />
        <select className="input-field" style={{ border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.4rem 0.8rem', background: '#eff6ff', color: 'var(--blue-dark)', outline: 'none' }} value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
          <option value="">{i18n.all}</option>
          <option value="pending">{i18n.pending}</option>
          <option value="approved">{i18n.approved}</option>
          <option value="rejected">{i18n.rejected}</option>
        </select>
        <button onClick={() => query.refetch()} className="premium-action-btn outline" title="Refresh"><RefreshCw size={16} /></button>
      </div>
    </div>
    
    <div className="table-container installment-requests-table" style={{ background: 'white', borderRadius: '24px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(15,23,42,0.03)' }}>
      {query.isLoading ? <div className="center-content"><div className="spinner" /><span>{i18n.loading}</span></div> 
      : query.isError ? <div className="center-content" style={{ color: 'var(--error)' }}><span>{i18n.error}</span><button className="premium-action-btn outline mt-4" onClick={() => query.refetch()}>{i18n.retry}</button></div> 
      : rows.length === 0 ? <div className="center-content"><FileText size={40} style={{ opacity: 0.3, marginBottom: '0.75rem', color: 'var(--blue)' }} /><span>{i18n.noData}</span></div> 
      : <table className="premium-data-table">
          <thead>
            <tr>
              <th>{i18n.date}</th>
              <th>{i18n.customer}</th>
              <th>{i18n.motorcycle}</th>
              <th>{i18n.downPayment}</th>
              <th><span className="table-heading-with-icon"><CircleDollarSign size={14} /> {i18n.amount}</span></th>
              <th><span className="table-heading-with-icon"><CalendarDays size={14} /> {i18n.duration}</span></th>
              <th>{i18n.status}</th>
              <th>{i18n.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(req => (
              <tr key={req.id} onClick={() => navigate(`/installment-requests/${req.id}`)} style={{ cursor: 'pointer' }}>
                <td>{new Date(req.createdAt).toLocaleDateString(isRtl ? 'ar-SA' : 'en-US')}</td>
                <td>{req.customer?.name || req.buyerName || '-'}</td>
                <td>{req.motorcycle ? req.motorcycle.model : '-'}</td>
                <td><span className="money-cell">{formatAmount(req.downPayment)}</span></td>
                <td><span className="money-cell money-cell-primary">{formatAmount(req.installmentAmount ?? req.monthlyInstallment)}</span></td>
                <td><span className="duration-cell"><strong>{req.durationMonths ?? req.duration?.months ?? '-'}</strong> <small>{i18n.monthsUnit}</small></span></td>
                <td>
                  <Badge 
                    status={req.status === 'pending' ? 'inactive' : req.status === 'approved' ? 'active' : 'failed'} 
                    label={req.status === 'pending' ? i18n.pending : req.status === 'approved' ? i18n.approved : i18n.rejected} 
                    lang={lang} 
                  />
                </td>
                <td>
                  <div className="flex gap-2">
                    <button className="premium-action-btn outline" style={{ padding: '0.4rem' }} onClick={(event) => { event.stopPropagation(); navigate(`/installment-requests/${req.id}`); }} title={i18n.viewDetails}>
                      <Eye size={16} />
                    </button>
                    {req.status === 'pending' && (
                      <>
                        <button className="premium-action-btn success-outline" style={{ padding: '0.4rem' }} onClick={(event) => { event.stopPropagation(); openReview(req, 'approve'); }} title={i18n.approve}>
                          <CheckCircle size={16} />
                        </button>
                        <button className="premium-action-btn danger-outline" style={{ padding: '0.4rem' }} onClick={(event) => { event.stopPropagation(); openReview(req, 'reject'); }} title={i18n.reject}>
                          <XCircle size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>}
    </div>
    
    {modalMode && selected && (
      <Modal 
        title={modalMode === 'view' ? i18n.viewDetails : modalMode === 'approve' ? i18n.approve : i18n.reject} 
        onClose={closeModal} 
        footer={
          modalMode === 'view' ? (
            <div className="flex gap-2 justify-end w-full">
              <button className="btn btn-outline" onClick={closeModal}>{i18n.cancel}</button>
              {selected.status === 'pending' && (
                <>
                  <button className="btn btn-outline" style={{ borderColor: 'var(--success)', color: 'var(--success)' }} onClick={() => setModalMode('approve')}>{i18n.approve}</button>
                  <button className="btn" style={{ background: 'var(--error-bg)', color: 'var(--error)' }} onClick={() => setModalMode('reject')}>{i18n.reject}</button>
                </>
              )}
            </div>
          ) : (
            <>
              <button className="btn btn-outline" onClick={() => setModalMode('view')} disabled={isBusy}>{i18n.cancel}</button>
              <button className="btn" style={{ background: modalMode === 'approve' ? 'var(--success)' : 'var(--error)', color: 'white' }} onClick={submit as any} disabled={isBusy}>
                {isBusy && <span className="spinner" style={{ width: 16, height: 16 }} />}
                {i18n.submit}
              </button>
            </>
          )
        }
      >
        {modalMode === 'view' ? (
          <div className="grid gap-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="card" style={{ padding: '1rem', border: '1px solid var(--border-color)', boxShadow: 'none' }}>
                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}><FileText size={18} /> {i18n.buyerInfo}</h3>
                <div className="grid gap-3 text-sm">
                  <div className="flex justify-between border-b pb-2" style={{ borderColor: 'var(--border-color)' }}><span className="text-muted">{i18n.buyerName}:</span> <span className="font-medium">{selected.buyerName}</span></div>
                  <div className="flex justify-between border-b pb-2" style={{ borderColor: 'var(--border-color)' }}><span className="text-muted">{i18n.buyerPhone}:</span> <span className="font-medium" dir="ltr">{selected.buyerPhone}</span></div>
                  <div className="flex justify-between border-b pb-2" style={{ borderColor: 'var(--border-color)' }}><span className="text-muted">{i18n.buyerEmail}:</span> <span className="font-medium">{selected.buyerEmail || '-'}</span></div>
                  <div className="flex justify-between border-b pb-2" style={{ borderColor: 'var(--border-color)' }}><span className="text-muted">{i18n.buyerAddress}:</span> <span className="font-medium">{selected.buyerAddress || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-muted">{i18n.buyerOccupation}:</span> <span className="font-medium">{selected.buyerOccupation || '-'}</span></div>
                </div>
              </div>
              <div className="card" style={{ padding: '1rem', border: '1px solid var(--border-color)', boxShadow: 'none' }}>
                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}><FileText size={18} /> {i18n.guarantorInfo}</h3>
                <div className="grid gap-3 text-sm">
                  <div className="flex justify-between border-b pb-2" style={{ borderColor: 'var(--border-color)' }}><span className="text-muted">{i18n.buyerName}:</span> <span className="font-medium">{selected.guarantorName}</span></div>
                  <div className="flex justify-between border-b pb-2" style={{ borderColor: 'var(--border-color)' }}><span className="text-muted">{i18n.buyerPhone}:</span> <span className="font-medium" dir="ltr">{selected.guarantorPhone}</span></div>
                  <div className="flex justify-between"><span className="text-muted">{i18n.buyerAddress}:</span> <span className="font-medium">{selected.guarantorAddress || '-'}</span></div>
                </div>
              </div>
            </div>
            
            <div className="card" style={{ padding: '1rem', border: '1px solid var(--border-color)', boxShadow: 'none' }}>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}><FileText size={18} /> {i18n.financeInfo}</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between border-b pb-2" style={{ borderColor: 'var(--border-color)' }}><span className="text-muted">{i18n.company}:</span> <span className="font-medium">{selected.financingCompany?.name || '-'}</span></div>
                <div className="flex justify-between border-b pb-2" style={{ borderColor: 'var(--border-color)' }}><span className="text-muted">{i18n.duration}:</span> <span className="font-medium">{selected.durationMonths ?? selected.duration?.months ?? '-'} {i18n.monthsUnit}</span></div>
                <div className="flex justify-between border-b pb-2 md:border-b-0 md:pb-0" style={{ borderColor: 'var(--border-color)' }}><span className="text-muted">{i18n.downPayment}:</span> <span className="font-medium">{selected.downPayment != null ? selected.downPayment.toLocaleString() : '-'} EGP</span></div>
                <div className="flex justify-between"><span className="text-muted">{i18n.amount}:</span> <span className="font-medium">{selected.installmentAmount != null ? selected.installmentAmount.toLocaleString() : selected.monthlyInstallment != null ? selected.monthlyInstallment.toLocaleString() : '-'} EGP</span></div>
              </div>
            </div>

            <div className="card" style={{ padding: '1rem', border: '1px solid var(--border-color)', boxShadow: 'none' }}>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}><FileText size={18} /> {i18n.documents}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {selected.buyerNationalIdImage && (
                  <div>
                    <span className="text-xs text-muted block mb-2">{i18n.docBuyerId}</span>
                    <a href={selected.buyerNationalIdImage} target="_blank" rel="noreferrer" className="block transition-transform hover:scale-105">
                      <img src={selected.buyerNationalIdImage} alt="Buyer ID" style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }} />
                    </a>
                  </div>
                )}
                {selected.buyerNationalIdBackImage && (
                  <div>
                    <span className="text-xs text-muted block mb-2">Buyer ID Back</span>
                    <a href={selected.buyerNationalIdBackImage} target="_blank" rel="noreferrer" className="block transition-transform hover:scale-105">
                      <img src={selected.buyerNationalIdBackImage} alt="Buyer ID Back" style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }} />
                    </a>
                  </div>
                )}
                {selected.salarySlipImage && (
                  <div>
                    <span className="text-xs text-muted block mb-2">{i18n.docSalary}</span>
                    <a href={selected.salarySlipImage} target="_blank" rel="noreferrer" className="block transition-transform hover:scale-105">
                      <img src={selected.salarySlipImage} alt="Salary Slip" style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }} />
                    </a>
                  </div>
                )}
                {selected.apartmentContractImage && (
                  <div>
                    <span className="text-xs text-muted block mb-2">{i18n.docApartment}</span>
                    <a href={selected.apartmentContractImage} target="_blank" rel="noreferrer" className="block transition-transform hover:scale-105">
                      <img src={selected.apartmentContractImage} alt="Apartment Contract" style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }} />
                    </a>
                  </div>
                )}
                {selected.guarantorNationalIdImage && (
                  <div>
                    <span className="text-xs text-muted block mb-2">{i18n.docGuarantorId}</span>
                    <a href={selected.guarantorNationalIdImage} target="_blank" rel="noreferrer" className="block transition-transform hover:scale-105">
                      <img src={selected.guarantorNationalIdImage} alt="Guarantor ID" style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }} />
                    </a>
                  </div>
                )}
                {selected.guarantorNationalIdBackImage && (
                  <div>
                    <span className="text-xs text-muted block mb-2">Guarantor ID Back</span>
                    <a href={selected.guarantorNationalIdBackImage} target="_blank" rel="noreferrer" className="block transition-transform hover:scale-105">
                      <img src={selected.guarantorNationalIdBackImage} alt="Guarantor ID Back" style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }} />
                    </a>
                  </div>
                )}
                {selected.guarantorSignatureImage && (
                  <div>
                    <span className="text-xs text-muted block mb-2">Guarantor Signature</span>
                    <a href={selected.guarantorSignatureImage} target="_blank" rel="noreferrer" className="block transition-transform hover:scale-105">
                      <img src={selected.guarantorSignatureImage} alt="Guarantor Signature" style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }} />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            {formError && <div className="login-error" style={{ marginBottom: '1rem' }}>{formError}</div>}
            <p style={{ marginBottom: '1rem' }}>
              {modalMode === 'approve' ? i18n.confirmApprove : i18n.confirmReject}
            </p>
            
            {modalMode === 'reject' && (
              <div className="input-group">
                <label className="input-label">{i18n.rejectionReason}</label>
                <textarea className="input-field" rows={3} value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} />
              </div>
            )}
          </form>
        )}
      </Modal>
    )}
  </section>
  );
}