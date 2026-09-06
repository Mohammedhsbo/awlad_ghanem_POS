import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CreditCard, DollarSign, Banknote, Wallet } from 'lucide-react';
import { payments, invoices, type PaymentMethod, type Invoice } from '../api';
import { useToast } from './Toast';

type Lang = 'en' | 'ar';

const T = {
  en: {
    title: 'Payment',
    selectMethod: 'Select Payment Method',
    cash: 'Cash',
    card: 'Card',
    bankTransfer: 'Bank Transfer',
    cheque: 'Cheque',
    amountDue: 'Amount Due',
    amountReceived: 'Amount Received',
    change: 'Change',
    enterAmount: 'Enter amount received...',
    reference: 'Reference (Optional)',
    referencePlaceholder: 'Transaction ID or reference...',
    processing: 'Processing Payment...',
    completePayment: 'Complete Payment',
    cancel: 'Cancel',
    paymentSuccess: 'Payment Completed Successfully!',
    paymentError: 'Payment Failed',
    invalidAmount: 'Invalid amount',
    insufficientAmount: 'Amount received must be greater than or equal to amount due',
    loadingInvoice: 'Loading invoice...',
    invoiceNotFound: 'Invoice not found for this order',
    quickAmounts: 'Quick Amounts',
    exact: 'Exact',
  },
  ar: {
    title: 'الدفع',
    selectMethod: 'اختر طريقة الدفع',
    cash: 'نقدي',
    card: 'بطاقة',
    bankTransfer: 'تحويل بنكي',
    cheque: 'شيك',
    amountDue: 'المبلغ المستحق',
    amountReceived: 'المبلغ المستلم',
    change: 'الباقي',
    enterAmount: 'أدخل المبلغ المستلم...',
    reference: 'المرجع (اختياري)',
    referencePlaceholder: 'رقم المعاملة أو المرجع...',
    processing: 'جاري معالجة الدفع...',
    completePayment: 'إتمام الدفع',
    cancel: 'إلغاء',
    paymentSuccess: 'تم الدفع بنجاح!',
    paymentError: 'فشل الدفع',
    invalidAmount: 'المبلغ غير صالح',
    insufficientAmount: 'المبلغ المستلم يجب أن يكون أكبر من أو يساوي المبلغ المستحق',
    loadingInvoice: 'جاري تحميل الفاتورة...',
    invoiceNotFound: 'الفاتورة غير موجودة لهذا الطلب',
    quickAmounts: 'مبالغ سريعة',
    exact: 'بالضبط',
  },
};

interface Props {
  orderId: string;
  orderAmount: number;
  lang: Lang;
  onSuccess: (paymentId: string) => void;
  onCancel: () => void;
}

export default function PaymentPOS({ orderId, orderAmount, lang, onSuccess, onCancel }: Props) {
  const t = T[lang];
  const isRtl = lang === 'ar';

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const { showToast } = useToast();

  const paymentAttemptKey = `pos_payment_${orderId}`;
  const [idempotencyKey] = useState(() =>
    localStorage.getItem(paymentAttemptKey) || `pos_payment_${orderId}_${crypto.randomUUID()}`,
  );

  useEffect(() => {
    localStorage.setItem(paymentAttemptKey, idempotencyKey);
  }, [idempotencyKey, paymentAttemptKey]);

  // Load invoice for the order
  useEffect(() => {
    invoices
      .getByOrder(orderId)
      .then((inv) => {
        if (inv) {
          setInvoice(inv);
          // Auto-fill amount with remaining amount
          if (inv.remainingAmount > 0) {
            setCashReceived(inv.remainingAmount.toString());
          }
        } else {
          setError(t.invoiceNotFound);
        }
      })
      .catch((err) => {
        const message = err instanceof Error && err.message ? err.message : t.invoiceNotFound;
        setError(t.invoiceNotFound);
        showToast(message, 'error');
      })
      .finally(() => setLoadingInvoice(false));
  }, [orderId]);

  const createPaymentMutation = useMutation({
    mutationFn: (data: any) => payments.create(data),
    onSuccess: (payment) => {
      localStorage.removeItem(paymentAttemptKey);
      onSuccess(payment.id);
    },
    onError: (err: any) => {
      setError(err.message || t.paymentError);
    },
  });

  const amountDue = invoice?.remainingAmount ?? orderAmount;
  const receivedAmount = method === 'cash' ? Number(cashReceived) || 0 : amountDue;
  const changeAmount = method === 'cash' ? Math.max(0, receivedAmount - amountDue) : 0;

  const formatCurrency = (amount: number) =>
    amount.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-EG', {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 0,
    });

  const handleQuickAmount = (amount: number) => {
    if (method === 'cash') {
      setCashReceived(amount.toString());
    }
  };

  const quickAmounts = [
    amountDue,
    Math.ceil(amountDue / 50) * 50, // Round to nearest 50
    Math.ceil(amountDue / 100) * 100, // Round to nearest 100
    Math.ceil(amountDue / 500) * 500, // Round to nearest 500
  ].filter((v, i, a) => a.indexOf(v) === i && v >= amountDue); // Unique values >= amountDue

  const validate = (): boolean => {
    setError('');

    if (!invoice) {
      setError(t.invoiceNotFound);
      return false;
    }

    if (method === 'cash') {
      if (!cashReceived || isNaN(Number(cashReceived)) || Number(cashReceived) <= 0) {
        setError(t.invalidAmount);
        return false;
      }
      if (Number(cashReceived) < amountDue) {
        setError(t.insufficientAmount);
        return false;
      }
    }

    return true;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    const paymentData: any = {
      idempotencyKey,
      invoiceId: invoice!.id,
      amount: amountDue,
      method,
      reference: reference || undefined,
    };

    if (method === 'cash') {
      paymentData.cashDetails = {
        amountReceived: Number(cashReceived),
        change: changeAmount,
      };
    }

    createPaymentMutation.mutate(paymentData);
  };

  if (loadingInvoice) {
    return (
      <div
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: 'var(--text-muted)',
        }}
      >
        <div className="spinner" style={{ margin: '0 auto 1rem' }} />
        {t.loadingInvoice}
      </div>
    );
  }

  if (!invoice) {
    return (
      <div
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: 'var(--error)',
        }}
      >
        {t.invoiceNotFound}
        <button onClick={onCancel} className="btn btn-outline" style={{ marginTop: '1rem' }}>
          {t.cancel}
        </button>
      </div>
    );
  }

  return (
    <div style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      <h2
        style={{
          marginBottom: '1.5rem',
          fontSize: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        <CreditCard size={24} /> {t.title}
      </h2>

      {/* Amount Due */}
      <div
        style={{
          padding: '1.5rem',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '1.5rem',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
          {t.amountDue}
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
          {formatCurrency(amountDue)}
        </div>
      </div>

      {/* Payment Method Selection */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '0.75rem',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          {t.selectMethod}
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
          <button
            onClick={() => setMethod('cash')}
            className="btn"
            style={{
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
              background: method === 'cash' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
              color: method === 'cash' ? 'white' : 'var(--text-primary)',
              border: `2px solid ${method === 'cash' ? 'transparent' : 'var(--border)'}`,
            }}
          >
            <Banknote size={24} />
            {t.cash}
          </button>
          <button
            onClick={() => setMethod('card')}
            className="btn"
            style={{
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
              background: method === 'card' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
              color: method === 'card' ? 'white' : 'var(--text-primary)',
              border: `2px solid ${method === 'card' ? 'transparent' : 'var(--border)'}`,
            }}
          >
            <CreditCard size={24} />
            {t.card}
          </button>
          <button
            onClick={() => setMethod('bank_transfer')}
            className="btn"
            style={{
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.85rem',
              background: method === 'bank_transfer' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
              color: method === 'bank_transfer' ? 'white' : 'var(--text-primary)',
              border: `2px solid ${method === 'bank_transfer' ? 'transparent' : 'var(--border)'}`,
            }}
          >
            <DollarSign size={24} />
            {t.bankTransfer}
          </button>
          <button
            onClick={() => setMethod('cheque')}
            className="btn"
            style={{
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
              background: method === 'cheque' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
              color: method === 'cheque' ? 'white' : 'var(--text-primary)',
              border: `2px solid ${method === 'cheque' ? 'transparent' : 'var(--border)'}`,
            }}
          >
            <Wallet size={24} />
            {t.cheque}
          </button>
        </div>
      </div>

      {/* Cash Details */}
      {method === 'cash' && (
        <>
          {/* Quick Amounts */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              {t.quickAmounts}
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
              {quickAmounts.slice(0, 4).map((amount, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuickAmount(amount)}
                  className="btn btn-outline"
                  style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                >
                  {idx === 0 ? t.exact : formatCurrency(amount)}
                </button>
              ))}
            </div>
          </div>

          {/* Amount Received */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              {t.amountReceived}
            </label>
            <input
              type="number"
              step="0.01"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
              placeholder={t.enterAmount}
              style={{
                width: '100%',
                padding: '0.875rem',
                borderRadius: 'var(--radius-md)',
                border: '2px solid var(--border)',
                background: 'var(--bg-secondary)',
                fontSize: '1.1rem',
                fontWeight: 600,
                textAlign: 'center',
              }}
            />
          </div>

          {/* Change Display */}
          {cashReceived && Number(cashReceived) >= amountDue && (
            <div
              style={{
                padding: '1rem',
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.05))',
                borderRadius: 'var(--radius-md)',
                marginBottom: '1rem',
                border: '2px solid var(--success)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{t.change}:</span>
                <span
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: 'var(--success)',
                  }}
                >
                  {formatCurrency(changeAmount)}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Reference (for non-cash) */}
      {method !== 'cash' && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            {t.reference}
          </label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={t.referencePlaceholder}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              fontSize: '0.875rem',
            }}
          />
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div
          style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--error)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--error)',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          onClick={onCancel}
          className="btn btn-outline"
          style={{ flex: 1 }}
          disabled={createPaymentMutation.isPending}
        >
          {t.cancel}
        </button>
        <button
          onClick={handleSubmit}
          className="btn btn-primary"
          style={{ flex: 2 }}
          disabled={createPaymentMutation.isPending}
        >
          {createPaymentMutation.isPending ? t.processing : t.completePayment}
        </button>
      </div>
    </div>
  );
}
