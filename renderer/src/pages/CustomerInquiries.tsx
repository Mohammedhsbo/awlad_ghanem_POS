import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { FileImage, Plus, PenTool, CheckCircle2 } from 'lucide-react';
import { inquiries, financingCompanies, installmentDurations, type InquiryInput, type InquiryDocumentType, pos, getUser } from '../api';
import { DataList, DataTableState } from '../components/DataTable';
import MotorcycleSearchPOS from '../components/MotorcycleSearchPOS';
import { useViewingBranch } from '../contexts/ViewingBranchContext';

type Lang = 'en' | 'ar';

export default function CustomerInquiries({ lang }: { lang: Lang }) {
  const isRtl = lang === 'ar';
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { viewingBranchId } = useViewingBranch();
  const user = getUser();
  
  const location = useLocation();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{
    customerName: string;
    customerPhone: string;
    address: string;
    occupation: string;
    documentType: InquiryDocumentType;
    downPayment: string;
    motorcycleId: string;
    financingCompanyId: string;
    installmentDurationId: string;
  }>({
    customerName: '',
    customerPhone: '',
    address: '',
    occupation: '',
    documentType: 'EMPLOYEE',
    downPayment: '',
    motorcycleId: '',
    financingCompanyId: '',
    installmentDurationId: '',
  });

  const [documentImage, setDocumentImage] = useState<File | null>(null);
  const [idCardFrontImage, setIdCardFrontImage] = useState<File | null>(null);
  const [idCardBackImage, setIdCardBackImage] = useState<File | null>(null);
  const [guarantorIdFrontImage, setGuarantorIdFrontImage] = useState<File | null>(null);
  const [guarantorIdBackImage, setGuarantorIdBackImage] = useState<File | null>(null);
  const [guarantorSignatureImage, setGuarantorSignatureImage] = useState<File | null>(null);

  const [guarantor1IdFrontImage, setGuarantor1IdFrontImage] = useState<File | null>(null);
  const [guarantor1IdBackImage, setGuarantor1IdBackImage] = useState<File | null>(null);
  const [guarantor2IdFrontImage, setGuarantor2IdFrontImage] = useState<File | null>(null);
  const [guarantor2IdBackImage, setGuarantor2IdBackImage] = useState<File | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [savedInquiryId, setSavedInquiryId] = useState<string | null>(null);
  const inquiriesQuery = useQuery({ queryKey: ['inquiries'], queryFn: inquiries.list });
  const financingCompaniesQuery = useQuery({ queryKey: ['financing-companies'], queryFn: financingCompanies.list });
  const installmentDurationsQuery = useQuery({ queryKey: ['installment-durations'], queryFn: installmentDurations.list });

  useEffect(() => {
    const state = (location.state as { selectedMotorcycle?: { id: string; model: string; brand?: { nameAr?: string; nameEn?: string } } } | null) ?? null;
    const selectedMotorcycle = state?.selectedMotorcycle;
    if (selectedMotorcycle?.id) {
      setForm((current) => ({ ...current, motorcycleId: selectedMotorcycle.id }));
      setShowForm(true);
      setError(null);
      return;
    }
    setShowForm(false);
  }, [location.state]);

  const create = useMutation({
    mutationFn: (input: InquiryInput) => inquiries.create(input),
    onSuccess: (data) => {
      setSavedInquiryId(data.id);
      setShowForm(false);
      void queryClient.invalidateQueries({ queryKey: ['inquiries'] }); 
    },
    onError: (err: Error) => setError(err.message),
  });

  function resetForm() {
    setSavedInquiryId(null);
    setForm({ customerName: '', customerPhone: '', address: '', occupation: '', documentType: 'EMPLOYEE', downPayment: '', motorcycleId: '', financingCompanyId: '', installmentDurationId: '' });
    setDocumentImage(null);
    setIdCardFrontImage(null);
    setIdCardBackImage(null);
    setGuarantorIdFrontImage(null);
    setGuarantorIdBackImage(null);
    setGuarantorSignatureImage(null);
    setGuarantor1IdFrontImage(null);
    setGuarantor1IdBackImage(null);
    setGuarantor2IdFrontImage(null);
    setGuarantor2IdBackImage(null);
  }

  const hasSupportingDocument = form.documentType !== 'NEITHER';

  async function submit(event: FormEvent) {
    event.preventDefault(); 
    setError(null);

    if (!form.motorcycleId) {
      setError(isRtl ? 'يجب اختيار الدراجة أولاً.' : 'Please select the motorcycle first.');
      return;
    }

    if (!form.financingCompanyId) {
      setError(isRtl ? 'يجب اختيار شركة التمويل.' : 'Please select a financing company.');
      return;
    }

    if (!form.installmentDurationId) {
      setError(isRtl ? 'يجب اختيار مدة التقسيط.' : 'Please select an installment duration.');
      return;
    }

    if ((form.documentType === 'EMPLOYEE' || form.documentType === 'PENSION') && (!form.address.trim() || !form.occupation.trim())) {
      setError(isRtl ? 'العنوان والمهنة مطلوبان للموظف أو صاحب المعاش.' : 'Address and occupation are required for employees and pensioners.');
      return;
    }

    if (form.documentType === 'EMPLOYEE') {
      if (!documentImage || !idCardFrontImage || !idCardBackImage) {
        setError(isRtl ? 'يجب إرفاق صورة مفردات المرتب وصورة البطاقة (وجه/ظهر).' : 'Salary slip and ID card images (front/back) are required.');
        return;
      }
    } else if (form.documentType === 'PENSION' || form.documentType === 'COMMERCIAL_REGISTRY') {
      if (!documentImage || !idCardFrontImage || !idCardBackImage) {
        setError(isRtl ? 'يجب إرفاق المستند الداعم وصورة البطاقة (وجه/ظهر).' : 'Supporting document and ID images (front/back) are required.');
        return;
      }
    } else if (form.documentType === 'NEITHER') {
      if (!idCardFrontImage || !idCardBackImage || !guarantor1IdFrontImage || !guarantor1IdBackImage || !guarantor2IdFrontImage || !guarantor2IdBackImage) {
        setError(isRtl ? 'يجب إرفاق بطاقات المشتري والضامنين الأول والثاني (وجه/ظهر).' : 'Buyer and guarantor ID images (front/back) are required.');
        return;
      }
    }

    const selectedCompany = financingCompaniesQuery.data?.find(company => company.id === form.financingCompanyId);
    if (!selectedCompany) {
      setError(isRtl ? 'شركة التمويل المحددة غير موجودة.' : 'Selected financing company is not available.');
      return;
    }

    try {
      const data = await create.mutateAsync({ 
        ...form, 
        downPayment: form.downPayment ? parseFloat(form.downPayment) : undefined,
        documentImage: hasSupportingDocument ? (documentImage || undefined) : undefined,
        idCardFrontImage: idCardFrontImage || undefined, 
        idCardBackImage: idCardBackImage || undefined,
        guarantorIdFrontImage: guarantor1IdFrontImage || guarantorIdFrontImage || undefined,
        guarantorIdBackImage: guarantor1IdBackImage || guarantorIdBackImage || undefined,
        guarantorSignatureImage: guarantorSignatureImage || undefined,
      });

      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : (isRtl ? 'حدث خطأ أثناء إرسال الطلب.' : 'An error occurred while sending the request.'));
    }
  }

  const docTypeLabels: Record<InquiryDocumentType, string> = {
    EMPLOYEE: isRtl ? 'موظف' : 'Employee',
    PENSION: isRtl ? 'بيان معاش' : 'Pension statement',
    COMMERCIAL_REGISTRY: isRtl ? 'سجل تجاري' : 'Commercial registry',
    NEITHER: isRtl ? 'غير ذلك' : 'Other',
  };

  return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="premium-page-header">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span style={{ color: '#bfdbfe', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{isRtl ? 'استعلامات التقسيط' : 'Installment Inquiries'}</span>
          <h1 style={{ margin: '0.3rem 0 0.5rem', color: 'white' }}>{isRtl ? 'الاستعلامات' : 'Inquiries'}</h1>
          <p>{isRtl ? 'سجل بيانات استعلام التقسيط وأرسلها للمراجعة.' : 'Capture installment inquiry details.'}</p>
        </div>
        <button className="premium-action-btn" style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', backdropFilter: 'blur(10px)', position: 'relative', zIndex: 1 }} onClick={() => { setShowForm(true); resetForm(); }}>
          <Plus size={17} /> {isRtl ? 'استعلام جديد' : 'New inquiry'}
        </button>
      </div>

      {showForm && (
        <form className="inquiry-create-form" onSubmit={submit}>
          <div className="inquiry-form-heading">
            <div>
              <span className="eyebrow">{isRtl ? 'طلب جديد' : 'New request'}</span>
              <h2>{isRtl ? 'بيانات الاستعلام' : 'Inquiry details'}</h2>
              <p>{isRtl ? 'أكمل البيانات والمستندات لإرسال الطلب للمراجعة.' : 'Complete the customer and document details before sending for review.'}</p>
            </div>
            <button type="button" className="secondary-action" onClick={() => setShowForm(false)}>
              {isRtl ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
          
          {error && <div className="inquiry-form-error" role="alert">{error}</div>}
          
          <div className="inquiry-form-section">
            <div className="inquiry-section-heading">
              <span className="inquiry-section-number">01</span>
              <div><h3>{isRtl ? 'بيانات العميل' : 'Customer profile'}</h3><p>{isRtl ? 'من سيتلقى عرض التقسيط؟' : 'Who is receiving the installment offer?'}</p></div>
            </div>
          <div className="form-grid inquiry-customer-fields">
            <label>
              <span>{isRtl ? 'اسم العميل' : 'Customer Name'} *</span>
              <input required value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} />
            </label>
            <label>
              <span>{isRtl ? 'رقم الهاتف' : 'Phone Number'} *</span>
              <input required value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} />
            </label>
            {(form.documentType === 'EMPLOYEE' || form.documentType === 'PENSION') && <>
              <label>
                <span>{isRtl ? 'العنوان' : 'Address'} *</span>
                <input required value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
              </label>
              <label>
                <span>{isRtl ? 'المهنة' : 'Occupation'} *</span>
                <input required value={form.occupation} onChange={e => setForm({ ...form, occupation: e.target.value })} />
              </label>
            </>}
            
            <label>
              <span>{isRtl ? 'الدفعة المقدمة (اختياري)' : 'Down Payment (Optional)'}</span>
              <input type="number" min={0} value={form.downPayment} onChange={e => setForm({ ...form, downPayment: e.target.value })} />
            </label>

            <label>
              <span>{isRtl ? 'شركة التمويل *' : 'Financing Company *'}</span>
              <select value={form.financingCompanyId} onChange={e => setForm({ ...form, financingCompanyId: e.target.value })} required>
                <option value="">{isRtl ? '-- اختر --' : '-- Select --'}</option>
                {financingCompaniesQuery.data?.map(company => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{isRtl ? 'مدة التقسيط *' : 'Installment Duration *'}</span>
              <select value={form.installmentDurationId} onChange={e => setForm({ ...form, installmentDurationId: e.target.value })} required>
                <option value="">{isRtl ? '-- اختر المدة --' : '-- Select duration --'}</option>
                {installmentDurationsQuery.data?.map(duration => (
                  <option key={duration.id} value={duration.id}>{duration.months} {isRtl ? 'شهر' : 'months'}</option>
                ))}
              </select>
            </label>
          </div>
          </div>

          <div className="inquiry-form-section inquiry-document-section">
            <div className="inquiry-section-heading">
              <span className="inquiry-section-number">02</span>
              <div><h3>{isRtl ? 'نوع المستند' : 'Document route'}</h3><p>{isRtl ? 'اختر المستند المتوفر للعميل.' : 'Choose the document route available for this customer.'}</p></div>
            </div>
            <div className="inquiry-document-options">
              {(['EMPLOYEE', 'PENSION', 'COMMERCIAL_REGISTRY', 'NEITHER'] as const).map(type => (
                <label key={type} className={`inquiry-document-option ${form.documentType === type ? 'is-selected' : ''}`}>
                  <input 
                    type="radio" 
                    name="documentType"
                    checked={form.documentType === type}
                    onChange={() => {
                      const nextType = type;
                      setForm({ ...form, documentType: nextType });
                      if (nextType === 'NEITHER') {
                        setDocumentImage(null);
                      }
                    }}
                  />
                  <span><strong>{docTypeLabels[type]}</strong><small>{form.documentType === type ? (isRtl ? 'محدد' : 'Selected') : (isRtl ? 'اضغط للاختيار' : 'Select route')}</small></span>
                </label>
              ))}
            </div>
          </div>

          <div className="inquiry-form-section inquiry-upload-section">
            <div className="inquiry-section-heading">
              <span className="inquiry-section-number">03</span>
              <div><h3>{isRtl ? 'رفع المستندات' : 'Upload documents'}</h3><p>{isRtl ? 'صور واضحة بصيغة JPG أو PNG أو WEBP.' : 'Use clear JPG, PNG, or WEBP images.'}</p></div>
            </div>
          <div className="inquiry-upload-panel">
            <div className="form-grid inquiry-upload-grid">
              {form.documentType === 'EMPLOYEE' && (
                <>
                  <label>
                    <FileImage size={16} /> {isRtl ? 'صورة مفردات المرتب' : 'Salary slip'} *
                    <input
                      required
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={event => setDocumentImage(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <label>
                    <FileImage size={16} /> {isRtl ? 'صورة بطاقة صاحب مفردات المرتب - وش' : 'ID of salary slip owner - front'} *
                    <input
                      required
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={event => setIdCardFrontImage(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <label>
                    <FileImage size={16} /> {isRtl ? 'صورة بطاقة صاحب مفردات المرتب - ضهر' : 'ID of salary slip owner - back'} *
                    <input
                      required
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={event => setIdCardBackImage(event.target.files?.[0] ?? null)}
                    />
                  </label>
                </>
              )}

              {(form.documentType === 'PENSION' || form.documentType === 'COMMERCIAL_REGISTRY') && (
                <>
                  <label>
                    <FileImage size={16} /> {form.documentType === 'PENSION' ? (isRtl ? 'صورة بيان المعاش' : 'Pension statement') : (isRtl ? 'صورة السجل التجاري' : 'Commercial registry')} *
                    <input
                      required
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={event => setDocumentImage(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <label>
                    <FileImage size={16} /> {form.documentType === 'PENSION' ? (isRtl ? 'صورة بطاقة صاحب بيان المعاش - وش' : 'Pension owner ID - front') : (isRtl ? 'صورة بطاقة صاحب السجل التجاري - وش' : 'Registry owner ID - front')} *
                    <input
                      required
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={event => setIdCardFrontImage(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <label>
                    <FileImage size={16} /> {form.documentType === 'PENSION' ? (isRtl ? 'صورة بطاقة صاحب بيان المعاش - ظهر' : 'Pension owner ID - back') : (isRtl ? 'صورة بطاقة صاحب السجل التجاري - ظهر' : 'Registry owner ID - back')} *
                    <input
                      required
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={event => setIdCardBackImage(event.target.files?.[0] ?? null)}
                    />
                  </label>
                </>
              )}

              {form.documentType === 'NEITHER' && (
                <>
                  <label>
                    <FileImage size={16} /> {isRtl ? 'صورة بطاقة المشتري - وش' : 'Buyer ID - front'} *
                    <input
                      required
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={event => setIdCardFrontImage(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <label>
                    <FileImage size={16} /> {isRtl ? 'صورة بطاقة المشتري - ظهر' : 'Buyer ID - back'} *
                    <input
                      required
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={event => setIdCardBackImage(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <label>
                    <FileImage size={16} /> {isRtl ? 'صورة بطاقة الضامن الأول - وش' : 'Guarantor 1 ID - front'} *
                    <input
                      required
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={event => {
                        const file = event.target.files?.[0] ?? null;
                        setGuarantor1IdFrontImage(file);
                        setGuarantorIdFrontImage(file);
                      }}
                    />
                  </label>
                  <label>
                    <FileImage size={16} /> {isRtl ? 'صورة بطاقة الضامن الأول - ظهر' : 'Guarantor 1 ID - back'} *
                    <input
                      required
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={event => {
                        const file = event.target.files?.[0] ?? null;
                        setGuarantor1IdBackImage(file);
                        setGuarantorIdBackImage(file);
                      }}
                    />
                  </label>
                  <label>
                    <FileImage size={16} /> {isRtl ? 'صورة بطاقة الضامن الثاني - وش' : 'Guarantor 2 ID - front'} *
                    <input
                      required
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={event => setGuarantor2IdFrontImage(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <label>
                    <FileImage size={16} /> {isRtl ? 'صورة بطاقة الضامن الثاني - ظهر' : 'Guarantor 2 ID - back'} *
                    <input
                      required
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={event => setGuarantor2IdBackImage(event.target.files?.[0] ?? null)}
                    />
                  </label>
                </>
              )}
            </div>
          </div>
          </div>

          <div className="inquiry-form-section inquiry-motorcycle-section">
            <div className="inquiry-section-heading">
              <span className="inquiry-section-number">04</span>
              <div><h3>{isRtl ? 'الدراجة المطلوبة' : 'Requested motorcycle'}</h3><p>{isRtl ? 'اختياري: اربط الاستعلام بدراجة محددة.' : 'Optional: link the inquiry to a specific motorcycle.'}</p></div>
            </div>
            <MotorcycleSearchPOS 
              lang={lang} 
              branchId={viewingBranchId ?? undefined} 
              onSelect={(mc) => setForm({ ...form, motorcycleId: mc.id })}
              selectedMotorcycleId={form.motorcycleId}
            />
          </div>

          <div className="inquiry-form-actions">
            <span>{isRtl ? 'سيتم إرسال الطلب للمراجعة' : 'The request will be sent for review'}</span>
            <button className="primary-action inquiry-submit" disabled={create.isPending}>
              <CheckCircle2 size={18} />
              {create.isPending ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'إرسال للمراجعة' : 'Send for Review')}
            </button>
          </div>
        </form>
      )}

      {savedInquiryId && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', padding: '1.25rem 1.5rem', borderRadius: '16px', background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', border: '1px solid #6ee7b7', marginBottom: '1.5rem' }}>
          <span style={{ color: '#047857', fontWeight: 600, fontSize: '0.9rem' }}>{isRtl ? 'تم حفظ الاستعلام. أرسله للمراجعة عند اكتمال البيانات.' : 'Inquiry saved. Send it for review when the data is complete.'}</span>
          <button className="premium-action-btn" style={{ background: 'linear-gradient(135deg, #047857, #059669)', color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(5,150,105,0.25)' }} onClick={async () => { try { await inquiries.sendForReview(savedInquiryId); navigate('/installment-requests'); } catch (err) { setError(err instanceof Error ? err.message : 'Failed to send for review'); } }}>
            <CheckCircle2 size={18} /> {isRtl ? 'إرسال للمراجعة' : 'Send for Review'}
          </button>
        </div>
      )}

      {inquiriesQuery.isLoading && <DataTableState kind="loading" lang={lang} />}
      {!inquiriesQuery.isLoading && inquiriesQuery.data?.length === 0 && <DataTableState kind="empty" lang={lang} />}
      
      {!inquiriesQuery.isLoading && inquiriesQuery.data && inquiriesQuery.data.length > 0 && (
        <DataList className="inquiry-list">
          {inquiriesQuery.data.map(inquiry => (
            <article
              key={inquiry.id}
              style={{
                marginBottom: '1rem',
                background: 'white',
                borderRadius: '18px',
                border: '1px solid #e2e8f0',
                padding: '1.25rem 1.5rem',
                boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#bfdbfe'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(37,99,235,0.08)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(15,23,42,0.04)'; (e.currentTarget as HTMLElement).style.transform = ''; }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                  <div style={{ width: 42, height: 42, borderRadius: '12px', background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)', display: 'grid', placeItems: 'center', color: 'var(--blue)', flexShrink: 0 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.98rem', color: 'var(--text-primary)', fontWeight: 700 }}>{inquiry.customerName}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.1rem', display: 'block' }}>{inquiry.customerPhone}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ padding: '0.3rem 0.75rem', borderRadius: '99px', fontSize: '0.72rem', fontWeight: 700, background: '#eff6ff', color: 'var(--blue-dark)', border: '1px solid #bfdbfe' }}>
                    {docTypeLabels[inquiry.documentType]}
                  </span>
                  <small style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>
                    {new Date(inquiry.createdAt).toLocaleString(isRtl ? 'ar-EG' : 'en-GB')}
                  </small>
                </div>
              </div>
              {(inquiry.motorcycle || inquiry.downPayment != null) && (
                <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid #f1f5f9', fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                  {inquiry.motorcycle && (
                    <div><strong style={{ color: 'var(--blue-dark)', marginInlineEnd: '0.3rem' }}>{isRtl ? 'الدراجة:' : 'Motorcycle:'}</strong>{isRtl ? inquiry.motorcycle.brand.nameAr : inquiry.motorcycle.brand.nameEn} {inquiry.motorcycle.model}</div>
                  )}
                  {inquiry.downPayment != null && (
                    <div><strong style={{ color: 'var(--blue-dark)', marginInlineEnd: '0.3rem' }}>{isRtl ? 'الدفعة المقدمة:' : 'Down payment:'}</strong>{inquiry.downPayment.toLocaleString()} EGP</div>
                  )}
                </div>
              )}
            </article>
          ))}
        </DataList>
      )}
    </section>
  );
}