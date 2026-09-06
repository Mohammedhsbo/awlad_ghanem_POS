import { CheckCircle, Printer } from 'lucide-react';

type Lang = 'en' | 'ar';

const T = {
  en: {
    title: 'Payment Successful!',
    subtitle: 'Your payment has been processed successfully',
    paymentRef: 'Payment Reference',
    amount: 'Amount Paid',
    method: 'Payment Method',
    change: 'Change Given',
    date: 'Date',
    printReceipt: 'Print Receipt',
    done: 'Done',
    cash: 'Cash',
    card: 'Card',
    bank_transfer: 'Bank Transfer',
    cheque: 'Cheque',
  },
  ar: {
    title: 'تم الدفع بنجاح!',
    subtitle: 'تم معالجة دفعتك بنجاح',
    paymentRef: 'رقم الدفعة',
    amount: 'المبلغ المدفوع',
    method: 'طريقة الدفع',
    change: 'الباقي المُسلم',
    date: 'التاريخ',
    printReceipt: 'طباعة الإيصال',
    done: 'تم',
    cash: 'نقدي',
    card: 'بطاقة',
    bank_transfer: 'تحويل بنكي',
    cheque: 'شيك',
  },
};

interface Props {
  payment: {
    id: string;
    paymentReference: string;
    amount: number;
    method: 'cash' | 'card' | 'bank_transfer' | 'cheque';
    cashChange?: number;
    createdAt: string;
  };
  lang: Lang;
  onDone: () => void;
  onPrint?: () => void;
}

export default function PaymentSuccessPOS({ payment, lang, onDone, onPrint }: Props) {
  const t = T[lang];
  const isRtl = lang === 'ar';

  const formatCurrency = (amount: number) =>
    amount.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-EG', {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 0,
    });

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const getMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      cash: t.cash,
      card: t.card,
      bank_transfer: t.bank_transfer,
      cheque: t.cheque,
    };
    return labels[method] || method;
  };

  return (
    <div
      style={{
        direction: isRtl ? 'rtl' : 'ltr',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      {/* Success Icon */}
      <div
        style={{
          width: '80px',
          height: '80px',
          background: 'linear-gradient(135deg, var(--success), #10b981)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.5rem',
          animation: 'pulse 2s ease-in-out infinite',
        }}
      >
        <CheckCircle size={48} color="white" />
      </div>

      {/* Title */}
      <h2
        style={{
          fontSize: '1.75rem',
          fontWeight: 700,
          marginBottom: '0.5rem',
          color: 'var(--success)',
        }}
      >
        {t.title}
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>{t.subtitle}</p>

      {/* Payment Details Card */}
      <div
        style={{
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.5rem',
          marginBottom: '2rem',
          textAlign: isRtl ? 'right' : 'left',
        }}
      >
        <div style={{ display: 'grid', gap: '1rem', fontSize: '0.95rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>{t.paymentRef}:</span>
            <span
              style={{
                fontFamily: 'monospace',
                fontWeight: 600,
                fontSize: '1rem',
                color: 'var(--accent-primary)',
              }}
            >
              {payment.paymentReference}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '1rem',
              borderTop: '1px solid var(--border)',
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>{t.amount}:</span>
            <span style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--success)' }}>
              {formatCurrency(payment.amount)}
            </span>
          </div>

          {payment.method === 'cash' && payment.cashChange !== undefined && payment.cashChange > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem',
                background: 'rgba(34, 197, 94, 0.1)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--success)',
              }}
            >
              <span style={{ fontWeight: 600, color: 'var(--success)' }}>{t.change}:</span>
              <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--success)' }}>
                {formatCurrency(payment.cashChange)}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>{t.method}:</span>
            <span style={{ fontWeight: 600 }}>{getMethodLabel(payment.method)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>{t.date}:</span>
            <span style={{ fontSize: '0.875rem' }}>{formatDate(payment.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        {onPrint && (
          <button
            onClick={onPrint}
            className="btn btn-outline"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            <Printer size={18} /> {t.printReceipt}
          </button>
        )}
        <button
          onClick={onDone}
          className="btn btn-primary"
          style={{ flex: 2 }}
        >
          {t.done}
        </button>
      </div>

      <style>
        {`
          @keyframes pulse {
            0%, 100% {
              transform: scale(1);
              opacity: 1;
            }
            50% {
              transform: scale(1.05);
              opacity: 0.9;
            }
          }
        `}
      </style>
    </div>
  );
}
