import { useState, useRef, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bike, CheckCircle2, FileImage, Printer, Search } from 'lucide-react';
import { pos, salesRequests, financingCompanies, getUser, type MotorcycleSearchResult, type SalePaymentMethod, type SaleRecord } from '../api';
import { DataTableState } from '../components/DataTable';
import { useViewingBranch } from '../contexts/ViewingBranchContext';
import { buildWhatsAppUrl } from '../../../packages/shared-types/src/whatsapp';

type Lang = 'en' | 'ar';
type Step = 'list' | 'method' | 'cash-details' | 'installment-details' | 'reserve-details' | 'confirm' | 'done' | 'done-installment' | 'done-reserve';

export default function Sales({ lang }: { lang: Lang }) {
  const isRtl = lang === 'ar';
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { viewingBranchId } = useViewingBranch();
  const user = getUser();

  /* ── state machine ─────────────────────────────── */
  const [step, setStep] = useState<Step>('list');
  const [selectedMc, setSelectedMc] = useState<MotorcycleSearchResult | null>(null);
  const [query, setQuery] = useState('');

  // customer details
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerIdFile, setCustomerIdFile] = useState<File | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>('CASH');
  
  // installment & reservation details
  const [financingCompanyId, setFinancingCompanyId] = useState('');
  const [requestedAmount, setRequestedAmount] = useState('');
  const [holdAmount, setHoldAmount] = useState('');
  const [reservationIdFile, setReservationIdFile] = useState<File | null>(null);

  const [error, setError] = useState<string | null>(null);

  // finished sale
  const [doneSale, setDoneSale] = useState<SaleRecord | null>(null);
  const [doneReservation, setDoneReservation] = useState<{ id: string; number: string; createdAt: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── queries ───────────────────────────────────── */
  const list = useQuery({
    queryKey: ['desktop-inventory', query, viewingBranchId],
    queryFn: () => pos.searchMotorcycles(query, viewingBranchId ?? undefined, 50),
    enabled: query.length === 0 || query.length >= 2,
  });

  const companiesQuery = useQuery({
    queryKey: ['financing-companies'],
    queryFn: financingCompanies.list,
  });

  const createSale = useMutation({
    mutationFn: () => pos.createCashSale({
      motorcycleId: selectedMc!.id,
      customerName,
      customerPhone,
      salePrice: selectedMc!.price,
      paymentMethod,
      customerIdImage: customerIdFile ?? undefined,
    }),
    onSuccess: (data) => {
      setDoneSale(data);
      setStep('done');
      void qc.invalidateQueries({ queryKey: ['desktop-inventory'] });
      void qc.invalidateQueries({ queryKey: ['desktop-transactions'] });
      void qc.invalidateQueries({ queryKey: ['pos-dashboard'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const createInstallment = useMutation({
    mutationFn: () => salesRequests.create({
      motorcycleId: selectedMc!.id,
      customerName,
      customerPhone,
      financingCompanyId,
      requestedAmount: Number(requestedAmount),
    }),
    onSuccess: (data) => {
      setStep('done-installment');
      const waNumber = user?.whatsappSenderNumber || data.customerPhone;
      const mcName = isRtl ? selectedMc?.brand?.nameAr : selectedMc?.brand?.nameEn;
      const msg = isRtl 
        ? `*طلب تقسيط جديد*\n\nالعميل: ${data.customerName}\nالهاتف: ${data.customerPhone}\nالدراجة: ${mcName} ${selectedMc?.model}\nالمبلغ المطلوب: ${data.requestedAmount}` 
        : `*New Installment Request*\n\nCustomer: ${data.customerName}\nPhone: ${data.customerPhone}\nMotorcycle: ${mcName} ${selectedMc?.model}\nRequested Amount: ${data.requestedAmount}`;
      window.open(buildWhatsAppUrl(waNumber, msg), '_blank');
    },
    onError: (err: Error) => setError(err.message),
  });

  const createReservation = useMutation({
    mutationFn: () => pos.createReservation({
      motorcycleId: selectedMc!.id,
      customerName,
      customerPhone,
      holdAmount: Number(holdAmount),
      customerIdImage: reservationIdFile ?? undefined,
    }),
    onSuccess: (data) => {
      setDoneReservation({ id: data.id, number: data.number, createdAt: data.createdAt });
      setStep('done-reserve');
      void qc.invalidateQueries({ queryKey: ['desktop-inventory'] });
      void qc.invalidateQueries({ queryKey: ['desktop-reservations'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  /* ── helpers ───────────────────────────────────── */
  const money = (v: number) =>
    `${v.toLocaleString(isRtl ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 0 })} ${isRtl ? 'ج.م' : 'EGP'}`;

  function reset() {
    setStep('list');
    setSelectedMc(null);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerIdFile(null);
    setReservationIdFile(null);
    setPaymentMethod('CASH');
    setFinancingCompanyId('');
    setRequestedAmount('');
    setHoldAmount('');
    setError(null);
    setDoneSale(null);
    setDoneReservation(null);
  }

  function printReservationInvoice() {
    if (!doneReservation || !selectedMc) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const brand = isRtl ? selectedMc.brand.nameAr : selectedMc.brand.nameEn;
    const date = new Date(doneReservation.createdAt).toLocaleString(isRtl ? 'ar-EG' : 'en-GB');
    printWindow.document.write(`<!doctype html><html lang="${isRtl ? 'ar' : 'en'}" dir="${isRtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${isRtl ? 'فاتورة حجز' : 'Reservation Invoice'}</title><style>body{font-family:Arial,sans-serif;color:#17243a;padding:32px}h1{color:#1e40af;border-bottom:3px solid #1e40af;padding-bottom:12px}table{width:100%;border-collapse:collapse;margin-top:24px}td{padding:12px;border-bottom:1px solid #dbe3ef}td:first-child{font-weight:bold;width:38%}</style></head><body><h1>${isRtl ? 'فاتورة حجز' : 'Reservation Invoice'}</h1><p>${isRtl ? 'رقم الحجز' : 'Reservation No.'}: ${doneReservation.number}</p><p>${isRtl ? 'التاريخ' : 'Date'}: ${date}</p><table><tr><td>${isRtl ? 'اسم العميل' : 'Customer'}</td><td>${customerName}</td></tr><tr><td>${isRtl ? 'الهاتف' : 'Phone'}</td><td>${customerPhone}</td></tr><tr><td>${isRtl ? 'الدراجة' : 'Motorcycle'}</td><td>${brand} ${selectedMc.model}</td></tr><tr><td>VIN</td><td>${selectedMc.vin}</td></tr><tr><td>${isRtl ? 'العربون' : 'Deposit'}</td><td>${money(Number(holdAmount))}</td></tr><tr><td>${isRtl ? 'السعر الإجمالي' : 'Total price'}</td><td>${money(selectedMc.price)}</td></tr></table></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function printInvoice() {
    if (!doneSale) return;
    const mc = doneSale.motorcycle;
    const brandName = isRtl ? mc?.brand?.nameAr : mc?.brand?.nameEn;
    const payLabel = doneSale.paymentMethod === 'CASH'
      ? (isRtl ? 'نقدي' : 'Cash')
      : (isRtl ? 'فيزا' : 'Visa');
    const dateStr = new Date(doneSale.createdAt).toLocaleString(isRtl ? 'ar-EG' : 'en-GB');

    const html = `<!DOCTYPE html>
<html lang="${isRtl ? 'ar' : 'en'}" dir="${isRtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="UTF-8"/>
<title>${isRtl ? 'فاتورة مبيعات' : 'Sales Invoice'}</title>
<style>
  @page { size: A4; margin: 24mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; font-size: 14px; }
  .header { text-align: center; border-bottom: 3px solid #1e40af; padding-bottom: 14px; margin-bottom: 24px; }
  .header h1 { font-size: 24px; color: #1e40af; margin: 0 0 4px; }
  .header p { margin: 0; color: #555; font-size: 12px; }
  .invoice-meta { display: flex; justify-content: space-between; margin-bottom: 24px; font-size: 12px; color: #555; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #1e40af; color: white; padding: 10px; text-align: ${isRtl ? 'right' : 'left'}; }
  td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) td { background: #f8fafc; }
  .total-row td { font-weight: 700; font-size: 16px; color: #1e40af; border-top: 2px solid #1e40af; }
  .signature { margin-top: 48px; display: flex; justify-content: flex-end; }
  .sig-box { text-align: center; width: 200px; }
  .sig-line { border-top: 1px solid #1a1a1a; margin-top: 50px; padding-top: 6px; font-size: 12px; color: #555; }
  .footer { text-align: center; font-size: 11px; color: #999; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 12px; }
</style>
</head>
<body>
<div class="header">
  <h1>${isRtl ? 'مؤسسة أولاد غانم' : "Mo'assasat Awlad Ghanem"}</h1>
  <p>${isRtl ? 'فاتورة مبيعات رسمية' : 'Official Sales Invoice'}</p>
</div>
<div class="invoice-meta">
  <span>${isRtl ? 'التاريخ: ' : 'Date: '}${dateStr}</span>
  <span>${isRtl ? 'رقم الفاتورة: ' : 'Invoice No: '}${doneSale.id.substring(0, 8).toUpperCase()}</span>
</div>
<table>
  <thead>
    <tr><th colspan="2">${isRtl ? 'بيانات العميل' : 'Customer Information'}</th></tr>
  </thead>
  <tbody>
    <tr><td>${isRtl ? 'الاسم' : 'Name'}</td><td>${doneSale.customerName}</td></tr>
    <tr><td>${isRtl ? 'الهاتف' : 'Phone'}</td><td>${doneSale.customerPhone}</td></tr>
  </tbody>
</table>
<table>
  <thead>
    <tr><th colspan="2">${isRtl ? 'بيانات الدراجة' : 'Motorcycle Details'}</th></tr>
  </thead>
  <tbody>
    <tr><td>${isRtl ? 'الماركة' : 'Brand'}</td><td>${brandName ?? '-'}</td></tr>
    <tr><td>${isRtl ? 'الموديل' : 'Model'}</td><td>${mc?.model ?? '-'}</td></tr>
    <tr><td>${isRtl ? 'رقم الهيكل (VIN)' : 'Chassis Number (VIN)'}</td><td>${mc?.vin ?? '-'}</td></tr>
    <tr><td>${isRtl ? 'رقم المحرك' : 'Engine Number'}</td><td>${mc?.engineNumber ?? '-'}</td></tr>
    <tr><td>${isRtl ? 'الحالة' : 'Status'}</td><td>${mc?.status ?? '-'}</td></tr>
    <tr class="total-row"><td>${isRtl ? 'السعر الإجمالي' : 'Total Price'}</td><td>${money(Number(doneSale.salePrice))}</td></tr>
  </tbody>
</table>
<table>
  <thead>
    <tr><th colspan="2">${isRtl ? 'بيانات الدفع' : 'Payment Details'}</th></tr>
  </thead>
  <tbody>
    <tr><td>${isRtl ? 'طريقة الدفع' : 'Payment Method'}</td><td>${payLabel}</td></tr>
  </tbody>
</table>
<div class="signature">
  <div class="sig-box">
    <div class="sig-line">${isRtl ? 'توقيع العميل' : 'Customer Signature'}</div>
  </div>
</div>
<div class="footer">${isRtl ? 'مؤسسة أولاد غانم — شكراً لتعاملكم معنا' : "Mo'assasat Awlad Ghanem — Thank you for your business"}</div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  /* ── submit confirm ────────────────────────────── */
  function submitSale(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedMc) return;
    if (!customerName.trim() || !customerPhone.trim()) {
      setError(isRtl ? 'اسم العميل ورقم هاتفه مطلوبان.' : 'Customer name and phone are required.');
      return;
    }
    if (!customerIdFile) {
      setError(isRtl ? 'صورة الهوية مطلوبة.' : 'Customer ID image is required.');
      return;
    }
    createSale.mutate();
  }

  function submitInstallment(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedMc) return;
    if (!customerName.trim() || !customerPhone.trim() || !financingCompanyId || !requestedAmount) {
      setError(isRtl ? 'جميع الحقول مطلوبة.' : 'All fields are required.');
      return;
    }
    createInstallment.mutate();
  }

  function submitReservation(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedMc) return;
    if (!customerName.trim() || !customerPhone.trim() || !holdAmount) {
      setError(isRtl ? 'جميع الحقول مطلوبة.' : 'All fields are required.');
      return;
    }
    createReservation.mutate();
  }

  const data = list.data ?? [];
  const bikes = data.filter(mc => mc.status !== 'sold');

  /* ── render ────────────────────────────────────── */
  return (
    <section className="desktop-page sales-flow-page" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Heading */}
      <div className="page-heading">
        <div>
          <span className="eyebrow">{isRtl ? 'إدارة البيع' : 'Sale management'}</span>
          <h1>{isRtl ? 'المبيعات' : 'Sales'}</h1>
          <p>{isRtl ? 'اختر دراجة لبدء عملية البيع.' : 'Select a motorcycle to begin a sale.'}</p>
        </div>
        {step !== 'list' && (
          <button className="secondary-action" onClick={reset}>
            {isRtl ? 'إلغاء / عودة' : 'Cancel / Back'}
          </button>
        )}
      </div>

      {/* ── STEP 1: List ──────────────────────────────── */}
      {step === 'list' && (
        <>
          <div className="toolbar">
            <div className="search-box">
              <Search size={17} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={isRtl ? 'ابحث بالموديل أو رقم الماتور...' : 'Search model or motor #...'}
              />
            </div>
            <span className="result-count">{bikes.length} {isRtl ? 'وحدة' : 'units'}</span>
          </div>
          {list.isLoading && (
            <div className="inventory-grid">
              {[1, 2, 3, 4].map(i => <div className="inventory-card skeleton" key={i} />)}
            </div>
          )}
          {!list.isLoading && bikes.length === 0 && <DataTableState kind="empty" lang={lang} />}
          {!list.isLoading && bikes.length > 0 && (
            <div className="inventory-grid">
              {bikes.map(mc => {
                const brand = isRtl ? mc.brand.nameAr : mc.brand.nameEn;
                const statusKey = mc.status?.toLowerCase() ?? 'available';
                const statusLabel = mc.status === 'available'
                  ? (isRtl ? 'متاح' : 'Available')
                  : mc.status === 'reserved'
                  ? (isRtl ? 'محجوز' : 'Reserved')
                  : mc.status === 'sold'
                  ? (isRtl ? 'مباع' : 'Sold')
                  : mc.status;
                return (
                  <button
                    key={mc.id}
                    className="mc-card"
                    onClick={() => { setSelectedMc(mc); setStep('method'); }}
                    dir={isRtl ? 'rtl' : 'ltr'}
                  >
                    {/* Card header — gradient image area */}
                    <div className="mc-card-header">
                      <span className={`mc-card-status status-${statusKey}`}>{statusLabel}</span>
                      <Bike size={52} />
                    </div>

                    {/* Card body — text details */}
                    <div className="mc-card-body">
                      <span className="mc-card-brand">{brand}</span>
                      <span className="mc-card-model">{mc.model}</span>
                      <span className="mc-card-vin">{mc.vin}</span>
                    </div>

                    {/* Card footer — price + hover CTA */}
                    <div className="mc-card-footer">
                      <span className="mc-card-price">
                        {mc.price.toLocaleString()} {isRtl ? 'ج.م' : 'EGP'}
                      </span>
                      <span className="mc-card-cta">
                        {isRtl ? 'بيع ←' : 'Sell →'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── STEP 2: Choose method ─────────────────────── */}
      {step === 'method' && selectedMc && (
        <div className="surface-panel sales-step-panel sale-method-panel" style={{ maxWidth: 480, margin: '0 auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>
            {isRtl ? 'طريقة البيع' : 'Sale Method'} — {isRtl ? selectedMc.brand.nameAr : selectedMc.brand.nameEn} {selectedMc.model}
          </h2>
          <p style={{ color: 'var(--text-2)', margin: 0 }}>
            {isRtl ? 'السعر: ' : 'Price: '}<strong>{selectedMc.price.toLocaleString()} {isRtl ? 'ج.م' : 'EGP'}</strong>
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <button
              className="primary-action sale-method-option sale-method-cash"
              style={{ padding: '1.25rem', fontSize: '1.1rem', flexDirection: 'column', gap: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setStep('cash-details')}
            >
              <h3>{isRtl ? 'نقدي (كاش)' : 'Cash Sale'}</h3>
              <p style={{ margin: 0, fontSize: '0.875rem' }}>{isRtl ? 'الدفع نقداً أو بالفيزا' : 'Pay via cash or card'}</p>
            </button>
            <button
              className="inventory-card clickable sale-method-option sale-method-installment"
              style={{ textAlign: 'center', borderColor: 'var(--accent-primary)', padding: '2rem' }}
              onClick={() => {
                navigate('/inquiries', { state: { selectedMotorcycle: selectedMc } });
              }}
            >
              <h3>{isRtl ? 'تقسيط' : 'Installment'}</h3>
              <p style={{ margin: 0, fontSize: '0.875rem' }}>{isRtl ? 'طلب تقسيط عبر شركة تمويل' : 'Request via financing company'}</p>
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', marginTop: '1rem' }}>
            <button
              className="inventory-card clickable sale-method-option sale-method-reserve"
              style={{ textAlign: 'center', borderColor: 'var(--text-3)', padding: '1rem' }}
              onClick={() => setStep('reserve-details')}
            >
              <h3 style={{ margin: 0, fontSize: '1rem' }}>{isRtl ? 'حجز هذه الدراجة' : 'Reserve this motorcycle'}</h3>
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Cash Details ─────────────────────── */}
      {step === 'cash-details' && selectedMc && (
        <form className="surface-panel sales-step-panel sales-cash-panel" onSubmit={e => { e.preventDefault(); if (!customerIdFile) { setError(isRtl ? 'يجب رفع صورة الهوية أولاً.' : 'Please upload the ID photo first.'); return; } setStep('confirm'); setError(null); }} style={{ maxWidth: 540, margin: '0 auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>{isRtl ? 'بيانات العميل' : 'Customer Details'}</h2>
          {error && <div className="state-panel" role="alert" style={{ color: 'var(--red-light)' }}>{error}</div>}
          <label className="sales-upload-field">
            {isRtl ? 'اسم العميل *' : 'Customer Name *'}
            <input required value={customerName} onChange={e => setCustomerName(e.target.value)} />
          </label>
          <label>
            {isRtl ? 'رقم الهاتف *' : 'Phone Number *'}
            <input required value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
          </label>
          <label>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FileImage size={16} /> {isRtl ? 'صورة هوية العميل *' : 'Customer ID Photo *'}
            </span>
            <input
              ref={fileInputRef}
              required
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={e => setCustomerIdFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {customerIdFile && (
            <p style={{ color: 'var(--green)', fontSize: '0.875rem', margin: 0 }}>
              ✔ {customerIdFile.name}
            </p>
          )}
          <button className="primary-action" type="submit" style={{ padding: '0.9rem' }}>
            {isRtl ? 'متابعة →' : 'Continue →'}
          </button>
        </form>
      )}

      {/* ── STEP 3: Installment Details ──────────────────── */}
      {step === 'installment-details' && selectedMc && (
        <form className="surface-panel sales-step-panel sales-request-panel" onSubmit={submitInstallment} style={{ maxWidth: 540, margin: '0 auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>{isRtl ? 'طلب تقسيط' : 'Installment Request'}</h2>
          {error && <div className="state-panel" role="alert" style={{ color: 'var(--red-light)' }}>{error}</div>}
          
          <label>
            {isRtl ? 'شركة التمويل *' : 'Financing Company *'}
            <select required value={financingCompanyId} onChange={e => setFinancingCompanyId(e.target.value)}>
              <option value="">{isRtl ? '-- اختر --' : '-- Select --'}</option>
              {companiesQuery.data?.map(c => (
                <option key={c.id} value={c.id}>{isRtl ? (c.nameAr ?? c.name) : (c.nameEn ?? c.name)}</option>
              ))}
            </select>
          </label>
          
          <label>
            {isRtl ? 'اسم العميل *' : 'Customer Name *'}
            <input required value={customerName} onChange={e => setCustomerName(e.target.value)} />
          </label>
          <label>
            {isRtl ? 'رقم الهاتف *' : 'Phone Number *'}
            <input required value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
          </label>
          
          <label>
            {isRtl ? 'المبلغ المطلوب تمويله *' : 'Requested Amount *'}
            <input required type="number" min="0" value={requestedAmount} onChange={e => setRequestedAmount(e.target.value)} />
          </label>

          <button className="primary-action" type="submit" style={{ padding: '0.9rem' }} disabled={createInstallment.isPending}>
            {createInstallment.isPending ? (isRtl ? 'جاري الإرسال...' : 'Sending...') : (isRtl ? 'إرسال الطلب' : 'Submit Request')}
          </button>
        </form>
      )}

      {/* ── STEP 3: Reservation Details ──────────────────── */}
      {step === 'reserve-details' && selectedMc && (
        <form className="surface-panel sales-step-panel sales-reservation-panel" onSubmit={submitReservation} style={{ maxWidth: 540, margin: '0 auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>{isRtl ? 'حجز دراجة' : 'Reserve Motorcycle'}</h2>
          {error && <div className="state-panel" role="alert" style={{ color: 'var(--red-light)' }}>{error}</div>}
          
          <div style={{ background: 'var(--bg-2)', borderRadius: '0.5rem', padding: '1rem' }}>
            <p style={{ margin: '0 0 4px', fontWeight: 700 }}>{isRtl ? selectedMc.brand.nameAr : selectedMc.brand.nameEn} {selectedMc.model}</p>
            <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '0.875rem' }}>{selectedMc.vin}</p>
          </div>

          <label>
            {isRtl ? 'اسم العميل *' : 'Customer Name *'}
            <input required value={customerName} onChange={e => setCustomerName(e.target.value)} />
          </label>
          <label>
            {isRtl ? 'رقم الهاتف *' : 'Phone Number *'}
            <input required value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
          </label>
          
          <label>
            {isRtl ? 'مبلغ الحجز (العربون) *' : 'Hold Amount *'}
            <input required type="number" min="0" value={holdAmount} onChange={e => setHoldAmount(e.target.value)} />
          </label>

          <label>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><FileImage size={16} /> {isRtl ? 'صورة بطاقة المشتري *' : 'Buyer ID Photo *'}</span>
            <input required type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setReservationIdFile(e.target.files?.[0] ?? null)} />
          </label>
          {reservationIdFile && <p style={{ color: 'var(--green)', fontSize: '0.875rem', margin: 0 }}>✔ {reservationIdFile.name}</p>}

          <button className="primary-action" type="submit" style={{ padding: '0.9rem' }} disabled={createReservation.isPending}>
            {createReservation.isPending ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'تأكيد الحجز' : 'Confirm Reservation')}
          </button>
        </form>
      )}

      {/* ── STEP 4: Confirm & choose cash/visa ───────── */}
      {step === 'confirm' && selectedMc && (
        <form className="surface-panel sales-step-panel sales-confirm-panel" onSubmit={submitSale} style={{ maxWidth: 540, margin: '0 auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>{isRtl ? 'تأكيد البيع' : 'Confirm Sale'}</h2>
          {error && <div className="state-panel" role="alert" style={{ color: 'var(--red-light)' }}>{error}</div>}

          {/* Motorcycle summary */}
          <div style={{ background: 'var(--bg-2)', borderRadius: '0.5rem', padding: '1rem' }}>
            <p style={{ margin: '0 0 4px', fontWeight: 700 }}>{isRtl ? selectedMc.brand.nameAr : selectedMc.brand.nameEn} {selectedMc.model}</p>
            <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '0.875rem' }}>{selectedMc.vin}</p>
            <p style={{ margin: '8px 0 0', fontWeight: 700, color: 'var(--accent-primary)', fontSize: '1.1rem' }}>
              {money(selectedMc.price)}
            </p>
          </div>

          {/* Customer summary */}
          <div style={{ background: 'var(--bg-2)', borderRadius: '0.5rem', padding: '1rem' }}>
            <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{customerName}</p>
            <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '0.875rem' }}>{customerPhone}</p>
            {customerIdFile && <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-3)' }}>🪪 {customerIdFile.name}</p>}
          </div>

          {/* Payment method */}
          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
              {isRtl ? 'طريقة الدفع' : 'Payment Method'}
            </label>
            <div style={{ display: 'flex', gap: '1rem' }}>
              {(['CASH', 'VISA'] as const).map(m => (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.75rem 1.25rem', border: `2px solid ${paymentMethod === m ? 'var(--accent-primary)' : 'var(--border)'}`, borderRadius: '0.5rem', flex: 1, justifyContent: 'center', fontWeight: paymentMethod === m ? 700 : 400 }}>
                  <input type="radio" name="pm" checked={paymentMethod === m} onChange={() => setPaymentMethod(m)} style={{ display: 'none' }} />
                  {m === 'CASH' ? (isRtl ? '💵 نقدي' : '💵 Cash') : (isRtl ? '💳 فيزا' : '💳 Visa')}
                </label>
              ))}
            </div>
          </div>

          <button className="primary-action" type="submit" disabled={createSale.isPending} style={{ padding: '1rem', fontSize: '1rem' }}>
            <CheckCircle2 size={18} />
            {createSale.isPending
              ? (isRtl ? 'جاري الحفظ...' : 'Saving...')
              : (isRtl ? 'إتمام البيع' : 'Complete Sale')}
          </button>
        </form>
      )}

      {/* ── STEP 5: Done ─────────────────────────────── */}
      {step === 'done' && doneSale && (
        <div className="surface-panel sales-step-panel sales-success-panel" style={{ maxWidth: 540, margin: '0 auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'center' }}>
          <CheckCircle2 size={56} style={{ color: 'var(--green)', margin: '0 auto' }} />
          <h2 style={{ margin: 0, color: 'var(--green)' }}>{isRtl ? 'تم إتمام البيع بنجاح!' : 'Sale completed!'}</h2>
          <p style={{ color: 'var(--text-2)', margin: 0 }}>
            {doneSale.customerName} — {isRtl ? doneSale.motorcycle?.brand?.nameAr : doneSale.motorcycle?.brand?.nameEn} {doneSale.motorcycle?.model}
          </p>
          <p style={{ fontWeight: 700, color: 'var(--accent-primary)', fontSize: '1.2rem', margin: 0 }}>
            {money(Number(doneSale.salePrice))} — {doneSale.paymentMethod === 'CASH' ? (isRtl ? 'نقدي' : 'Cash') : 'Visa'}
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="primary-action" onClick={printInvoice} style={{ padding: '0.9rem 1.5rem' }}>
              <Printer size={18} /> {isRtl ? 'طباعة الفاتورة' : 'Print Invoice'}
            </button>
            <button className="secondary-action" onClick={reset} style={{ padding: '0.9rem 1.5rem' }}>
              {isRtl ? 'بيع جديد' : 'New Sale'}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 5: Done Installment ────────────────────── */}
      {step === 'done-installment' && (
        <div className="surface-panel sales-step-panel sales-success-panel" style={{ maxWidth: 480, margin: '2rem auto', textAlign: 'center', padding: '3rem 2rem' }}>
          <CheckCircle2 size={64} style={{ color: 'var(--green)', margin: '0 auto 1.5rem' }} />
          <h2 style={{ margin: '0 0 1rem' }}>
            {isRtl ? 'تم إرسال الطلب بنجاح' : 'Request sent successfully'}
          </h2>
          <p style={{ color: 'var(--text-2)', marginBottom: '2rem' }}>
            {isRtl ? 'تم إرسال طلب التقسيط لشركة التمويل عبر الواتساب.' : 'The installment request has been sent via WhatsApp.'}
          </p>
          <button className="primary-action" onClick={reset}>
            {isRtl ? 'بيع جديد' : 'New Sale'}
          </button>
        </div>
      )}

      {step === 'done-reserve' && doneReservation && selectedMc && (
        <div className="surface-panel sales-step-panel sales-success-panel" style={{ maxWidth: 540, margin: '0 auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'center' }}>
          <CheckCircle2 size={56} style={{ color: 'var(--green)', margin: '0 auto' }} />
          <h2 style={{ margin: 0, color: 'var(--green)' }}>{isRtl ? 'تم إنشاء الحجز بنجاح' : 'Reservation created successfully'}</h2>
          <p style={{ margin: 0, color: 'var(--text-2)' }}>{isRtl ? 'رقم الحجز' : 'Reservation No.'}: <strong>{doneReservation.number}</strong></p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="primary-action" onClick={printReservationInvoice}><Printer size={18} /> {isRtl ? 'طباعة الفاتورة' : 'Print Invoice'}</button>
            <button className="secondary-action" onClick={() => navigate(`/reservations/${doneReservation.id}`)}>{isRtl ? 'عرض الحجز' : 'View Reservation'}</button>
            <button className="secondary-action" onClick={reset}>{isRtl ? 'حجز جديد' : 'New Reservation'}</button>
          </div>
        </div>
      )}

      {/* ── STEP 5: Done Reservation ────────────────────── */}
      {step === 'done-reserve' && (
        <div className="surface-panel sales-step-panel sales-success-panel" style={{ maxWidth: 480, margin: '2rem auto', textAlign: 'center', padding: '3rem 2rem' }}>
          <CheckCircle2 size={64} style={{ color: 'var(--green)', margin: '0 auto 1.5rem' }} />
          <h2 style={{ margin: '0 0 1rem' }}>
            {isRtl ? 'تم الحجز بنجاح' : 'Reservation successful'}
          </h2>
          <p style={{ color: 'var(--text-2)', marginBottom: '2rem' }}>
            {isRtl ? 'تم حفظ الحجز وتحديث حالة الدراجة.' : 'The reservation was saved and the motorcycle status updated.'}
          </p>
          <button className="primary-action" onClick={reset}>
            {isRtl ? 'إنهاء' : 'Finish'}
          </button>
        </div>
      )}
    </section>
  );
}
