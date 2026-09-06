import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle, Edit3, ExternalLink, MessageCircle, Save, Trash2, User, Bike, FileImage, Printer } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { customerFinancing, type InstallmentRequest } from '../api';
import { formatInstallmentRequestHTML } from '../utils/receiptFormatter';

function buildWhatsAppUrl(phone: string, message: string) {
  const cleanPhone = phone.replace(/\D/g, '');
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

const statusStyles: Record<string, { bg: string; color: string; border: string; label: string }> = {
  pending:  { bg: '#fffbeb', color: '#b45309', border: '#fde68a', label: '' },
  approved: { bg: '#ecfdf5', color: '#047857', border: '#6ee7b7', label: '' },
  rejected: { bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5', label: '' },
};

export default function InstallmentRequestDetail({ lang }: { lang: 'en' | 'ar' }) {
  const isRtl = lang === 'ar';
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ buyerName: '', buyerPhone: '', financingCompanyId: '', downPayment: '' });

  const query = useQuery<InstallmentRequest>({
    queryKey: ['installment-request', id],
    queryFn: () => customerFinancing.getRequest(id!),
    enabled: Boolean(id),
  });
  const request = query.data;
  const edit = useMutation({
    mutationFn: () => customerFinancing.updateRequest(id!, { buyerName: form.buyerName, buyerPhone: form.buyerPhone, financingCompanyId: form.financingCompanyId, downPayment: Number(form.downPayment) }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['installment-request', id] }); setEditing(false); }
  });
  const approve = useMutation({ mutationFn: () => customerFinancing.reviewRequest(id!, { status: 'approved' }), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['installment-request', id] }); } });
  const remove = useMutation({ mutationFn: () => customerFinancing.deleteRequest(id!), onSuccess: () => navigate('/installment-requests') });
  const whatsapp = useMutation({ mutationFn: () => customerFinancing.getWhatsAppMessage(id!), onSuccess: ({ phone, message }) => window.open(buildWhatsAppUrl(phone, message), '_blank') });

  if (query.isLoading) return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="premium-glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: '0.75rem' }}>
        <div className="spinner" /><span style={{ color: 'var(--blue)' }}>{isRtl ? 'جاري التحميل...' : 'Loading...'}</span>
      </div>
    </section>
  );

  if (query.isError || !request) return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      <button className="premium-action-btn outline" style={{ marginBottom: '1.5rem' }} onClick={() => navigate('/installment-requests')}><ArrowLeft size={16} /> {isRtl ? 'العودة' : 'Back'}</button>
      <div className="premium-glass-panel" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{isRtl ? 'فشل تحميل الطلب' : 'Failed to load request.'}</div>
    </section>
  );

  const imageItems: Array<[string, string | null | undefined]> = [
    [isRtl ? 'بطاقة العميل - أمامي' : 'Buyer ID front', request.buyerNationalIdImage],
    [isRtl ? 'بطاقة العميل - خلفي' : 'Buyer ID back', request.buyerNationalIdBackImage],
    [isRtl ? 'المستند الداعم' : 'Supporting document', request.salarySlipImage],
    [isRtl ? 'بطاقة الضامن - أمامي' : 'Guarantor ID front', request.guarantorNationalIdImage],
    [isRtl ? 'بطاقة الضامن - خلفي' : 'Guarantor ID back', request.guarantorNationalIdBackImage],
    [isRtl ? 'توقيع الضامن' : 'Guarantor signature', request.guarantorSignatureImage],
  ];
  const startEdit = () => { setForm({ buyerName: request.buyerName, buyerPhone: request.buyerPhone, financingCompanyId: request.financingCompanyId, downPayment: String(request.downPayment) }); setEditing(true); };
  const buyerAddress = request.buyerAddress || request.inquiry?.address || '-';
  const buyerOccupation = request.buyerOccupation || request.inquiry?.occupation || '-';
  const sStyle = statusStyles[request.status] ?? statusStyles.pending;
  const printRequest = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const motorcycle = request.motorcycle;
    const html = formatInstallmentRequestHTML({
      id: request.id,
      createdAt: request.createdAt,
      status: request.status,
      buyer: { name: request.buyerName, phone: request.buyerPhone, email: request.buyerEmail, address: request.buyerAddress || request.inquiry?.address, occupation: request.buyerOccupation || request.inquiry?.occupation },
      guarantor: { name: request.guarantorName, phone: request.guarantorPhone, address: request.guarantorAddress },
      motorcycle: { brand: motorcycle?.brand?.nameAr ?? motorcycle?.brand?.nameEn ?? '-', model: motorcycle?.model ?? '-', vin: motorcycle?.vin, year: motorcycle?.year, color: motorcycle?.color, price: request.motorcyclePrice },
      financing: { company: request.financingCompany?.name ?? '-', downPayment: request.downPayment, installmentAmount: request.installmentAmount, monthlyInstallment: request.monthlyInstallment, durationMonths: request.durationMonths ?? request.duration?.months },
      documentType: request.inquiry?.documentType,
      documents: imageItems.flatMap(([label, url]) => url ? [{ label, url }] : []),
    }, lang);
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="premium-page-header" style={{ marginBottom: '2rem' }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <button
            onClick={() => navigate('/installment-requests')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '10px', padding: '0.45rem 0.9rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', marginBottom: '1rem', transition: 'all 0.2s ease' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.22)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
          >
            <ArrowLeft size={15} /> {isRtl ? 'العودة لطلبات التقسيط' : 'Back to requests'}
          </button>
          <h1 style={{ margin: 0, fontSize: '1.9rem' }}>{isRtl ? 'تفاصيل طلب التقسيط' : 'Installment Request Detail'}</h1>
          <p style={{ marginTop: '0.35rem', fontFamily: 'monospace', fontSize: '0.78rem', opacity: 0.75 }}>{request.id}</p>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0.5rem 1.1rem', borderRadius: '99px', fontWeight: 700, fontSize: '0.85rem', background: sStyle.bg, color: sStyle.color, border: `1px solid ${sStyle.border}`, position: 'relative', zIndex: 1 }}>
          {request.status === 'pending' ? (isRtl ? 'معلق' : 'Pending') : request.status === 'approved' ? (isRtl ? 'موافق عليه' : 'Approved') : (isRtl ? 'مرفوض' : 'Rejected')}
        </span>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <button className="premium-action-btn solid" onClick={() => whatsapp.mutate()} disabled={whatsapp.isPending}>
          <MessageCircle size={17} /> {isRtl ? ' إرسال عبر واتساب الى شركه التمويل ' : 'Send via WhatsApp to financing company'}
        </button>
        <button className="premium-action-btn outline" onClick={printRequest}>
          <Printer size={17} /> {isRtl ? 'طباعة الطلب' : 'Print request'}
        </button>
        {request.status !== 'approved' && (
          <button className="premium-action-btn success-outline" onClick={() => approve.mutate()} disabled={approve.isPending}>
            <CheckCircle size={17} /> {isRtl ? 'موافقة' : 'Approve'}
          </button>
        )}
        <button className="premium-action-btn outline" onClick={startEdit}>
          <Edit3 size={17} /> {isRtl ? 'تعديل' : 'Edit'}
        </button>
        <button className="premium-action-btn danger-outline" onClick={() => { if (window.confirm(isRtl ? 'حذف الطلب؟' : 'Delete this request?')) remove.mutate(); }} disabled={remove.isPending}>
          <Trash2 size={17} /> {isRtl ? 'حذف' : 'Delete'}
        </button>
      </div>

      {/* Edit Form */}
      {editing && (
        <div className="premium-glass-panel" style={{ marginBottom: '2rem' }}>
          <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.05rem', color: 'var(--blue-dark)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Edit3 size={18} /> {isRtl ? 'تعديل البيانات' : 'Edit Details'}
          </h2>
          <form onSubmit={e => { e.preventDefault(); edit.mutate(); }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
              {[
                { label: isRtl ? 'اسم العميل' : 'Customer name', key: 'buyerName', value: form.buyerName },
                { label: isRtl ? 'الهاتف' : 'Phone', key: 'buyerPhone', value: form.buyerPhone },
                { label: isRtl ? 'معرف شركة التمويل' : 'Financing company ID', key: 'financingCompanyId', value: form.financingCompanyId },
                { label: isRtl ? 'الدفعة المقدمة' : 'Down payment', key: 'downPayment', value: form.downPayment, type: 'number' },
              ].map(field => (
                <label key={field.key} style={{ display: 'grid', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {field.label}
                  <input
                    className="pos-input"
                    type={field.type || 'text'}
                    value={field.value}
                    onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                    style={{ minHeight: 42, borderRadius: 10, border: '1px solid #bfdbfe', padding: '0 0.75rem' }}
                  />
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="premium-action-btn solid" type="submit" disabled={edit.isPending}>
                <Save size={16} /> {isRtl ? 'حفظ التعديل' : 'Save changes'}
              </button>
              <button className="premium-action-btn outline" type="button" onClick={() => setEditing(false)}>{isRtl ? 'إلغاء' : 'Cancel'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Info Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.25rem', marginBottom: '1.25rem' }}>
        <div className="premium-stat-card">
          <h3><User size={18} /> {isRtl ? 'بيانات العميل' : 'Customer Info'}</h3>
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {[
              [isRtl ? 'الاسم' : 'Name', request.buyerName],
              [isRtl ? 'الهاتف' : 'Phone', request.buyerPhone],
              [isRtl ? 'البريد' : 'Email', request.buyerEmail || '-'],
              [isRtl ? 'العنوان' : 'Address', buyerAddress],
              [isRtl ? 'المهنة' : 'Occupation', buyerOccupation],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{label}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{val}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="premium-stat-card">
          <h3><Bike size={18} /> {isRtl ? 'بيانات الطلب' : 'Request Info'}</h3>
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {[
              [isRtl ? 'الدراجة' : 'Motorcycle', `${request.motorcycle?.brand?.nameEn || ''} ${request.motorcycle?.model || '-'}`.trim()],
              [isRtl ? 'شركة التمويل' : 'Financing company', request.financingCompany?.name || '-'],
              [isRtl ? 'الدفعة المقدمة' : 'Down payment', request.downPayment != null ? `${request.downPayment.toLocaleString()} EGP` : '-'],
              [isRtl ? 'القسط الشهري' : 'Monthly installment', request.monthlyInstallment != null ? `${request.monthlyInstallment.toLocaleString()} EGP` : '-'],
              [isRtl ? 'مدة التقسيط' : 'Duration', request.duration?.months ? `${request.duration.months} ${isRtl ? 'شهر' : 'months'}` : '-'],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{label}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Documents */}
      {imageItems.some(([, img]) => img) && (
        <div className="premium-stat-card">
          <h3><FileImage size={18} /> {isRtl ? 'المستندات' : 'Documents'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
            {imageItems.map(([label, image]) => image && (
              <a key={label} href={image} target="_blank" rel="noreferrer"
                style={{ display: 'block', textDecoration: 'none', borderRadius: '12px', overflow: 'hidden', border: '1px solid #bfdbfe', transition: 'all 0.2s ease' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 20px rgba(37,99,235,0.15)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}
              >
                <img src={image} alt={label} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
                <div style={{ padding: '0.5rem 0.65rem', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--blue-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                  <ExternalLink size={12} style={{ flexShrink: 0, color: 'var(--blue)' }} />
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
