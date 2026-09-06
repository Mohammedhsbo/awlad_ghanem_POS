export interface ReceiptData {
  type: 'order' | 'reservation';
  number: string;
  date: string;
  customer: {
    name: string;
    phone: string;
    email?: string;
  };
  motorcycle: {
    model: string;
    vin: string;
    year: number;
    brand: {
      nameEn: string;
      nameAr: string;
    };
    color?: string;
  };
  branch: {
    nameEn: string;
    nameAr: string;
  };
  user: {
    name: string;
  };
  pricing: {
    basePrice: number;
    discount: number;
    totalPrice: number;
    depositAmount?: number;
    remainingAmount?: number;
  };
  notes?: string;
}

export interface InstallmentRequestPrintData {
  id: string;
  createdAt: string;
  status: string;
  buyer: { name: string; phone: string; email?: string | null; address?: string | null; occupation?: string | null };
  guarantor: { name: string; phone: string; address?: string | null };
  motorcycle: { brand: string; model: string; vin?: string | null; year?: number | null; color?: string | null; price?: number | null };
  financing: { company: string; downPayment?: number | null; installmentAmount?: number | null; monthlyInstallment?: number | null; durationMonths?: number | null };
  documentType?: string | null;
  documents: Array<{ label: string; url: string }>;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '-').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

export function formatInstallmentRequestHTML(data: InstallmentRequestPrintData, lang: 'en' | 'ar'): string {
  const isRtl = lang === 'ar';
  const label = (en: string, ar: string) => isRtl ? ar : en;
  const amount = (value?: number | null) => value == null ? '-' : `${value.toLocaleString()} ${isRtl ? 'ج.م' : 'EGP'}`;
  const row = (name: string, value: unknown) => `<div class="row"><span>${escapeHtml(name)}</span><strong>${escapeHtml(value)}</strong></div>`;
  const documents = data.documents.length
    ? data.documents.map(document => `<div class="document"><img src="${escapeHtml(document.url)}" alt="${escapeHtml(document.label)}" /><div>${escapeHtml(document.label)}</div></div>`).join('')
    : `<p class="muted">${label('No documents attached', 'لا توجد مستندات مرفقة')}</p>`;

  return `<!doctype html><html lang="${lang}" dir="${isRtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${escapeHtml(data.id)}</title><style>
    *{box-sizing:border-box}body{font-family:Arial,"Segoe UI",sans-serif;color:#26364d;margin:0;padding:12mm 15mm;font-size:11px}body:before{content:"";display:block;height:3px;background:#2849ad;margin-bottom:12px}.header{text-align:center;border-bottom:2px solid #2849ad;padding-bottom:10px;margin-bottom:12px}.header img{width:145px;max-height:55px;object-fit:contain}.header p{margin:5px 0 0;color:#777;font-size:10px}.meta{display:flex;justify-content:space-between;color:#555;font-size:10px;margin-bottom:12px}.section{margin-bottom:12px;break-inside:avoid}.title{background:#2849ad;color:white;padding:7px 9px;font-size:12px;font-weight:bold}.row{display:grid;grid-template-columns:38% 62%;min-height:26px;align-items:center;padding:5px 9px;border-bottom:1px solid #dce3ec}.row:nth-child(odd){background:#f7f9fc}.row strong{font-weight:600}.documents{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;padding-top:9px}.document{border:1px solid #cbd5e1;break-inside:avoid}.document img{display:block;width:100%;height:145px;object-fit:contain;background:#f8fafc}.document div{padding:5px;text-align:center;font-size:9px;background:#eff6ff}.muted{color:#777}.signature{width:155px;margin-top:45px;margin-left:0;margin-right:auto;border-top:1px solid #222;padding-top:7px;text-align:center;color:#777;font-size:10px}.footer{text-align:center;color:#999;border-top:1px solid #dce3ec;margin-top:22px;padding-top:8px;font-size:9px}@media print{body{padding:8mm 12mm}.no-print{display:none}}
  </style></head><body><div class="header"><img src="./logo.png" alt="${escapeHtml(label('Company logo', 'شعار المؤسسة'))}"><p>${label('Installment Request Details', 'تفاصيل طلب التقسيط')}</p></div><div class="meta"><span>${label('Request ID', 'رقم الطلب')}: <strong>${escapeHtml(data.id)}</strong></span><span>${label('Date', 'التاريخ')}: ${escapeHtml(new Date(data.createdAt).toLocaleString(isRtl ? 'ar-EG' : 'en-EG'))}</span></div>
  <div class="section"><div class="title">${label('Buyer Information', 'بيانات المشتري')}</div>${row(label('Name', 'الاسم'), data.buyer.name)}${row(label('Phone', 'الهاتف'), data.buyer.phone)}${row(label('Email', 'البريد الإلكتروني'), data.buyer.email)}${row(label('Address', 'العنوان'), data.buyer.address)}${row(label('Occupation', 'المهنة'), data.buyer.occupation)}</div>
  <div class="section"><div class="title">${label('Motorcycle Details', 'بيانات الدراجة')}</div>${row(label('Brand', 'الماركة'), data.motorcycle.brand)}${row(label('Model', 'الموديل'), data.motorcycle.model)}${row('VIN', data.motorcycle.vin)}${row(label('Year', 'السنة'), data.motorcycle.year)}${row(label('Color', 'اللون'), data.motorcycle.color)}${row(label('Motorcycle Price', 'سعر الدراجة'), amount(data.motorcycle.price))}</div>
  <div class="section"><div class="title">${label('Financing Details', 'تفاصيل التقسيط')}</div>${row(label('Document Type', 'نوع المستند'), data.documentType === 'EMPLOYEE' ? label('Employee', 'موظف') : data.documentType === 'PENSION' ? label('Pension', 'معاش') : data.documentType === 'COMMERCIAL_REGISTRY' ? label('Commercial registry', 'سجل تجاري') : data.documentType === 'NEITHER' ? label('Guarantors / no supporting document', 'ضامنين / بدون مستند داعم') : '-')} ${row(label('Financing Company', 'شركة التمويل'), data.financing.company)}${row(label('Down Payment', 'الدفعة المقدمة'), amount(data.financing.downPayment))}${row(label('Installment Amount', 'مبلغ التقسيط'), amount(data.financing.installmentAmount ?? data.financing.monthlyInstallment))}${row(label('Duration', 'مدة التقسيط'), data.financing.durationMonths == null ? '-' : `${data.financing.durationMonths} ${label('months', 'شهر')}`)}${row(label('Status', 'الحالة'), data.status)}</div>
  <div class="section"><div class="title">${label('Guarantor Information', 'بيانات الضامن')}</div>${row(label('Name', 'الاسم'), data.guarantor.name)}${row(label('Phone', 'الهاتف'), data.guarantor.phone)}${row(label('Address', 'العنوان'), data.guarantor.address)}</div>
  <div class="section"><div class="title">${label('Documents', 'المستندات')}</div><div class="documents">${documents}</div></div><div class="signature">${label('Customer Signature', 'توقيع العميل')}</div><div class="footer">${label('Thank you for your business', 'شكراً لتعاملكم معنا')}</div><div class="no-print"><button onclick="window.print()">${label('Print', 'طباعة')}</button></div></body></html>`;
}

export function formatReceiptForPrint(data: ReceiptData, lang: 'en' | 'ar'): string {
  const isRtl = lang === 'ar';
  const lines: string[] = [];

  // Header
  lines.push('='.repeat(48));
  lines.push(isRtl ? 'معرض الدراجات النارية' : 'MOTORCYCLE DEALERSHIP');
  lines.push('='.repeat(48));
  lines.push('');

  // Type & Number
  const typeLabel = data.type === 'order' 
    ? (isRtl ? 'فاتورة بيع' : 'SALES ORDER')
    : (isRtl ? 'إيصال حجز' : 'RESERVATION RECEIPT');
  lines.push(typeLabel);
  lines.push(`${isRtl ? 'رقم' : 'No'}: ${data.number}`);
  lines.push(`${isRtl ? 'التاريخ' : 'Date'}: ${new Date(data.date).toLocaleString(isRtl ? 'ar-EG' : 'en-EG')}`);
  lines.push('');

  // Branch & User
  lines.push(`${isRtl ? 'الفرع' : 'Branch'}: ${isRtl ? data.branch.nameAr : data.branch.nameEn}`);
  lines.push(`${isRtl ? 'البائع' : 'Salesperson'}: ${data.user.name}`);
  lines.push('-'.repeat(48));

  // Customer
  lines.push(isRtl ? 'بيانات العميل:' : 'Customer Information:');
  lines.push(`  ${isRtl ? 'الاسم' : 'Name'}: ${data.customer.name}`);
  lines.push(`  ${isRtl ? 'الهاتف' : 'Phone'}: ${data.customer.phone}`);
  if (data.customer.email) {
    lines.push(`  ${isRtl ? 'البريد' : 'Email'}: ${data.customer.email}`);
  }
  lines.push('-'.repeat(48));

  // Motorcycle
  lines.push(isRtl ? 'بيانات الدراجة النارية:' : 'Motorcycle Details:');
  lines.push(`  ${isRtl ? 'الموديل' : 'Model'}: ${data.motorcycle.model}`);
  lines.push(`  ${isRtl ? 'رقم الهيكل' : 'VIN'}: ${data.motorcycle.vin}`);
  lines.push(`  ${isRtl ? 'السنة' : 'Year'}: ${data.motorcycle.year}`);
  if (data.motorcycle.color) {
    lines.push(`  ${isRtl ? 'اللون' : 'Color'}: ${data.motorcycle.color}`);
  }
  lines.push('-'.repeat(48));

  // Pricing
  lines.push(isRtl ? 'التفاصيل المالية:' : 'Financial Details:');
  lines.push(`  ${isRtl ? 'السعر الأساسي' : 'Base Price'}:    ${formatMoney(data.pricing.basePrice, isRtl)}`);
  
  if (data.pricing.discount > 0) {
    lines.push(`  ${isRtl ? 'الخصم' : 'Discount'}:        ${formatMoney(-data.pricing.discount, isRtl)}`);
  }
  
  lines.push(`  ${isRtl ? 'الإجمالي' : 'Total'}:          ${formatMoney(data.pricing.totalPrice, isRtl)}`);

  if (data.type === 'reservation' && data.pricing.depositAmount) {
    lines.push('');
    lines.push(`  ${isRtl ? 'المدفوع (عربون)' : 'Paid (Deposit)'}:  ${formatMoney(data.pricing.depositAmount, isRtl)}`);
    lines.push(`  ${isRtl ? 'المتبقي' : 'Remaining'}:       ${formatMoney(data.pricing.remainingAmount || 0, isRtl)}`);
  }

  lines.push('='.repeat(48));

  // Notes
  if (data.notes) {
    lines.push('');
    lines.push(isRtl ? 'ملاحظات:' : 'Notes:');
    lines.push(data.notes);
    lines.push('');
  }

  // Footer
  lines.push('');
  lines.push(isRtl ? 'شكراً لتعاملكم معنا' : 'Thank you for your business');
  lines.push('='.repeat(48));

  return lines.join('\n');
}

function formatMoney(amount: number, isRtl: boolean): string {
  const formatted = Math.abs(amount).toLocaleString();
  const currency = isRtl ? 'ريال' : 'EGP';
  const sign = amount < 0 ? '-' : '';
  return `${sign}${formatted} ${currency}`;
}

export function formatReceiptHTML(data: ReceiptData, lang: 'en' | 'ar'): string {
  const isRtl = lang === 'ar';
  
  return `
<!DOCTYPE html>
<html dir="${isRtl ? 'rtl' : 'ltr'}" lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${isRtl ? 'Arial, sans-serif' : 'Segoe UI, Arial, sans-serif'};
      padding: 14mm 18mm;
      max-width: 900px;
      margin: 0 auto;
      color: #26364d;
      font-size: 12px;
      direction: ${isRtl ? 'rtl' : 'ltr'};
    }
    .receipt { padding: 4px 0; }
    .header { text-align: center; border-bottom: 3px solid #2849ad; padding: 0 0 12px; margin-bottom: 12px; }
    .header img { display: block; width: 150px; height: auto; max-height: 58px; object-fit: contain; margin: 0 auto 6px; }
    .header div { color: #777; font-size: 10px; }
    .meta { display: flex; justify-content: space-between; color: #555; font-size: 10px; margin-bottom: 12px; }
    .section { margin-bottom: 12px; }
    .section-title { color: #fff; background: #2849ad; padding: 7px 10px; font-weight: bold; font-size: 12px; }
    .row { display: grid; grid-template-columns: 38% 62%; min-height: 28px; align-items: center; padding: 0 10px; border-bottom: 1px solid #dce3ec; }
    .row:nth-child(even) { background: #f7f9fc; }
    .label { color: #34445b; }
    .value { color: #26364d; }
    .total { color: #2849ad; font-weight: bold; border-top: 2px solid #2849ad; }
    .signature { width: 150px; margin-top: 72px; margin-left: 0; margin-right: auto; padding-top: 8px; border-top: 1px solid #222; text-align: center; color: #777; font-size: 10px; }
    .footer { text-align: center; color: #999; border-top: 1px solid #dce3ec; padding-top: 9px; margin-top: 24px; font-size: 10px; }
    @media print {
      body { padding: 10mm 14mm; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <img src="./logo.png" alt="${isRtl ? 'شعار المؤسسة' : 'Company logo'}" />
      <div>${data.type === 'order' ? (isRtl ? 'فاتورة مبيعات رسمية' : 'OFFICIAL SALES INVOICE') : (isRtl ? 'فاتورة حجز' : 'RESERVATION INVOICE')}</div>
    </div>

    <div class="meta"><span>${isRtl ? 'رقم الفاتورة: ' : 'Invoice No: '}<strong>${data.number}</strong></span><span>${isRtl ? 'التاريخ: ' : 'Date: '}${new Date(data.date).toLocaleString(isRtl ? 'ar-EG' : 'en-EG')}</span></div>

    <div class="section">
      <div class="section-title">${isRtl ? 'بيانات العميل' : 'Customer Information'}</div>
      <div class="row"><span class="label">${isRtl ? 'الاسم' : 'Name'}</span><span class="value">${data.customer.name}</span></div>
      <div class="row"><span class="label">${isRtl ? 'الهاتف' : 'Phone'}</span><span class="value">${data.customer.phone}</span></div>
      ${data.customer.email ? `<div class="row"><span class="label">${isRtl ? 'البريد' : 'Email'}</span><span class="value">${data.customer.email}</span></div>` : ''}
    </div>

    <div class="section">
      <div class="section-title">${isRtl ? 'بيانات الدراجة' : 'Motorcycle Details'}</div>
      <div class="row"><span class="label">${isRtl ? 'الماركة' : 'Brand'}</span><span class="value">${isRtl ? data.motorcycle.brand.nameAr : data.motorcycle.brand.nameEn}</span></div>
      <div class="row"><span class="label">${isRtl ? 'الموديل' : 'Model'}</span><span class="value">${data.motorcycle.model}</span></div>
      <div class="row"><span class="label">${isRtl ? 'رقم الهيكل (VIN)' : 'VIN'}</span><span class="value">${data.motorcycle.vin}</span></div>
      <div class="row"><span class="label">${isRtl ? 'السنة' : 'Year'}</span><span class="value">${data.motorcycle.year}</span></div>
      ${data.motorcycle.color ? `<div class="row"><span class="label">${isRtl ? 'اللون' : 'Color'}</span><span class="value">${data.motorcycle.color}</span></div>` : ''}
    </div>

    <div class="section">
      <div class="section-title">${isRtl ? 'تفاصيل العملية' : 'Transaction Details'}</div>
      <div class="row"><span class="label">${isRtl ? 'الفرع' : 'Branch'}</span><span class="value">${isRtl ? data.branch.nameAr : data.branch.nameEn}</span></div>
      <div class="row"><span class="label">${isRtl ? 'البائع' : 'Salesperson'}</span><span class="value">${data.user.name}</span></div>
      <div class="row"><span class="label">${isRtl ? 'السعر الأساسي' : 'Base Price'}</span><span class="value">${formatMoney(data.pricing.basePrice, isRtl)}</span></div>
      ${data.pricing.discount > 0 ? `<div class="row"><span class="label">${isRtl ? 'الخصم' : 'Discount'}</span><span class="value">-${formatMoney(data.pricing.discount, isRtl)}</span></div>` : ''}
      <div class="row total"><span>${isRtl ? 'السعر الإجمالي' : 'Total Price'}</span><span>${formatMoney(data.pricing.totalPrice, isRtl)}</span></div>
      ${data.type === 'reservation' && data.pricing.depositAmount ? `
        <div class="row"><span>${isRtl ? 'المدفوع (عربون)' : 'Paid (Deposit)'}</span><span>${formatMoney(data.pricing.depositAmount, isRtl)}</span></div>
        <div class="row"><span>${isRtl ? 'المتبقي' : 'Remaining'}</span><span>${formatMoney(data.pricing.remainingAmount || 0, isRtl)}</span></div>
      ` : ''}
    </div>

    ${data.notes ? `<div class="section"><div class="section-title">${isRtl ? 'ملاحظات' : 'Notes'}</div><div class="row"><span class="value">${data.notes}</span></div></div>` : ''}

    <div class="signature">${isRtl ? 'توقيع العميل' : 'Customer Signature'}</div>

    <div class="footer">
      ${isRtl ? 'شكراً لتعاملكم معنا' : 'Thank you for your business'}
    </div>
  </div>

  <div class="no-print" style="text-align: center; margin-top: 20px;">
    <button onclick="window.print()" style="padding: 10px 20px; font-size: 16px; cursor: pointer;">
      ${isRtl ? 'طباعة' : 'Print'}
    </button>
  </div>
</body>
</html>
  `.trim();
}
