import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoices, pos } from '../api';
import { useTransaction } from '../hooks/useTransaction';
import DiscountInput from './DiscountInput';
import DepositInput from './DepositInput';
import TransactionConfirmation from './TransactionConfirmation';
import PaymentPOS from './PaymentPOS';
import type { CustomerSearchResult, MotorcycleSearchResult } from '../api';
import { POSTransactionType, type CreatePOSTransactionDto, type ValidatePOSTransactionDto } from '../../../packages/shared-types/src/pos';

interface TransactionReviewProps {
  lang: 'en' | 'ar';
  customer: CustomerSearchResult;
  motorcycle: MotorcycleSearchResult;
  onComplete: () => void;
  onBack: () => void;
}

export default function TransactionReview({
  lang,
  customer,
  motorcycle,
  onComplete,
  onBack,
}: TransactionReviewProps) {
  const [transactionType, setTransactionType] = useState<'order' | 'reservation'>('order');
  const [discount, setDiscount] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [depositAmount, setDepositAmount] = useState(0);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [completedTransaction, setCompletedTransaction] = useState<Awaited<ReturnType<typeof create>>['data']>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const isRtl = lang === 'ar';

  const { data: dashboard } = useQuery({
    queryKey: ['pos-dashboard'],
    queryFn: pos.getDashboard,
  });

  const { validate, create, isCreating } = useTransaction();

  const permissions = dashboard?.currentUser?.permissions;
  const maxDiscountAmount = permissions?.maxDiscountAmount || 0;
  const maxDiscountPercent = permissions?.maxDiscountPercent || 0;

  const totalAmount = motorcycle.price;
  const netAmount = totalAmount - discount;
  const remainingAmount = transactionType === 'reservation' ? netAmount - depositAmount : 0;

  const handleSubmit = async () => {
    setError(null);
    const data: Omit<CreatePOSTransactionDto, 'idempotencyKey'> = {
      type: transactionType === 'order' ? POSTransactionType.ORDER : POSTransactionType.RESERVATION,
      customerId: customer.id,
      motorcycleId: motorcycle.id,
    };

    if (discount > 0) {
      data.discount = { amount: discount, reason: discountReason || 'POS discount' };
    }

    if (transactionType === 'reservation') {
      data.reservationData = {
        depositAmount,
        expirationDays: 7,
      };
    }

    const validationData: ValidatePOSTransactionDto = {
      customerId: data.customerId,
      motorcycleId: data.motorcycleId,
      type: data.type,
      discount: discount > 0 ? discount : undefined,
      depositAmount: transactionType === 'reservation' ? depositAmount : undefined,
    };
    const validation = await validate(validationData);
    if (!validation.valid) {
      setError(validation.error || (isRtl ? 'تعذر التحقق من العملية' : 'Transaction validation failed'));
      return;
    }

    const result = await create(data);
    
    if (result.success && result.data) {
      const transaction = result.data as any;
      setCompletedTransaction(transaction);
      if (transactionType === 'order') {
        try {
          const invoice = await invoices.create({
            customerId: customer.id,
            orderId: transaction.id,
            totalAmount: transaction.netAmount,
            items: [{
              motorcycleId: motorcycle.id,
              description: `${motorcycle.model} - ${motorcycle.vin}`,
              quantity: 1,
              unitPrice: totalAmount,
              discount,
            }],
          });
          await invoices.issue(invoice.id);
          setShowPayment(true);
        } catch (error: any) {
          setError(error instanceof Error ? error.message : (isRtl ? 'تم البيع ولكن تعذر إنشاء الفاتورة' : 'Sale created, but invoice creation failed'));
          setShowConfirmation(true);
        }
      } else {
        setShowConfirmation(true);
      }
    } else {
      setError(result.error || (isRtl ? 'فشلت العملية' : 'Transaction failed'));
    }
  };

  const handleNewTransaction = () => {
    setShowConfirmation(false);
    setShowPayment(false);
    setCompletedTransaction(null);
    onComplete();
  };

  if (showPayment && completedTransaction) {
    return (
      <PaymentPOS
        orderId={completedTransaction.id}
        orderAmount={netAmount}
        lang={lang}
        onSuccess={() => {
          setShowPayment(false);
          setShowConfirmation(true);
        }}
        onCancel={() => {
          setShowPayment(false);
          setShowConfirmation(true);
        }}
      />
    );
  }

  if (showConfirmation && completedTransaction) {
    return (
      <TransactionConfirmation
        lang={lang}
        type={transactionType}
        transactionNumber={completedTransaction.number}
        customer={customer}
        motorcycle={motorcycle}
        totalAmount={totalAmount}
        discount={discount}
        netAmount={netAmount}
        depositAmount={transactionType === 'reservation' ? depositAmount : undefined}
        onViewReceipt={() => {/* TODO: Show receipt */}}
        onNewTransaction={handleNewTransaction}
      />
    );
  }

  return (
    <div className="space-y-6">
      {error && <div className="state-panel" role="alert">{error}</div>}
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-bold">
          {isRtl ? 'مراجعة العملية' : 'Transaction Review'}
        </h2>

        {/* Customer */}
        <div>
          <div className="text-sm text-gray-600">
            {isRtl ? 'العميل' : 'Customer'}
          </div>
          <div className="font-bold">{customer.name}</div>
          <div className="text-sm text-gray-500">{customer.phone}</div>
        </div>

        {/* Motorcycle */}
        <div>
          <div className="text-sm text-gray-600">
            {isRtl ? 'الدراجة النارية' : 'Motorcycle'}
          </div>
          <div className="font-bold">{motorcycle.model}</div>
          <div className="text-sm text-gray-500">
            {isRtl ? 'الهيكل' : 'VIN'}: {motorcycle.vin}
          </div>
        </div>

        {/* Transaction Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {isRtl ? 'نوع العملية' : 'Transaction Type'}
          </label>
          <div className="flex gap-4">
            <button
              onClick={() => setTransactionType('order')}
              className={`flex-1 py-2 px-4 rounded-lg border-2 ${
                transactionType === 'order'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300'
              }`}
            >
              {isRtl ? 'بيع مباشر' : 'Direct Sale'}
            </button>
            <button
              onClick={() => setTransactionType('reservation')}
              className={`flex-1 py-2 px-4 rounded-lg border-2 ${
                transactionType === 'reservation'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300'
              }`}
            >
              {isRtl ? 'حجز' : 'Reservation'}
            </button>
          </div>
        </div>

        {/* Discount */}
        {permissions?.canApplyDiscount && (
          <DiscountInput
            lang={lang}
            totalAmount={totalAmount}
            maxDiscountAmount={maxDiscountAmount}
            maxDiscountPercent={maxDiscountPercent}
            value={discount}
            onChange={(amount, reason) => {
              setDiscount(amount);
              setDiscountReason(reason);
            }}
            disabled={isCreating}
          />
        )}

        {/* Deposit for Reservation */}
        {transactionType === 'reservation' && (
          <DepositInput
            lang={lang}
            netAmount={netAmount}
            minDepositPercent={20}
            value={depositAmount}
            onChange={setDepositAmount}
            disabled={isCreating}
          />
        )}

        {/* Totals */}
        <div className="border-t pt-4 space-y-2">
          <div className="flex justify-between">
            <span>{isRtl ? 'المجموع' : 'Total'}:</span>
            <span className="font-bold">
              {totalAmount.toLocaleString()} {isRtl ? 'ريال' : 'EGP'}
            </span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-red-600">
              <span>{isRtl ? 'الخصم' : 'Discount'}:</span>
              <span>
                -{discount.toLocaleString()} {isRtl ? 'ريال' : 'EGP'}
              </span>
            </div>
          )}
          <div className="flex justify-between text-xl font-bold">
            <span>{isRtl ? 'الصافي' : 'Net Amount'}:</span>
            <span className="text-blue-600">
              {netAmount.toLocaleString()} {isRtl ? 'ريال' : 'EGP'}
            </span>
          </div>
          {transactionType === 'reservation' && (
            <>
              <div className="flex justify-between">
                <span>{isRtl ? 'المدفوع' : 'Paid'}:</span>
                <span>
                  {depositAmount.toLocaleString()} {isRtl ? 'ريال' : 'EGP'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{isRtl ? 'المتبقي' : 'Remaining'}:</span>
                <span>
                  {remainingAmount.toLocaleString()} {isRtl ? 'ريال' : 'EGP'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          disabled={isCreating}
        >
          {isRtl ? 'رجوع' : 'Back'}
        </button>
        <button
          onClick={handleSubmit}
          disabled={isCreating || (transactionType === 'reservation' && depositAmount === 0)}
          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-bold"
        >
          {isCreating
            ? isRtl
              ? 'جارٍ المعالجة...'
              : 'Processing...'
            : transactionType === 'order'
            ? isRtl
              ? 'تأكيد البيع'
              : 'Confirm Sale'
            : isRtl
            ? 'تأكيد الحجز'
            : 'Confirm Reservation'}
        </button>
      </div>
    </div>
  );
}
