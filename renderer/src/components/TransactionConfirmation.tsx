interface TransactionConfirmationProps {
  lang: 'en' | 'ar';
  type: 'order' | 'reservation';
  transactionNumber: string;
  customer: any;
  motorcycle: any;
  totalAmount: number;
  discount: number;
  netAmount: number;
  depositAmount?: number;
  onViewReceipt: () => void;
  onNewTransaction: () => void;
}

export default function TransactionConfirmation({
  lang,
  type,
  transactionNumber,
  customer,
  motorcycle,
  totalAmount,
  discount,
  netAmount,
  depositAmount,
  onViewReceipt,
  onNewTransaction,
}: TransactionConfirmationProps) {
  const isRtl = lang === 'ar';

  return (
    <div className="space-y-6">
      {/* Success Message */}
      <div className="bg-green-50 border-2 border-green-500 rounded-lg p-6 text-center">
        <div className="text-green-600 text-5xl mb-3">✓</div>
        <h2 className="text-2xl font-bold text-green-700 mb-2">
          {isRtl ? 'تمت العملية بنجاح!' : 'Transaction Successful!'}
        </h2>
        <div className="text-lg text-gray-700">
          {type === 'order'
            ? isRtl
              ? `رقم الطلب: ${transactionNumber}`
              : `Order Number: ${transactionNumber}`
            : isRtl
            ? `رقم الحجز: ${transactionNumber}`
            : `Reservation Number: ${transactionNumber}`}
        </div>
      </div>

      {/* Transaction Summary */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <h3 className="font-bold text-lg border-b pb-2">
          {isRtl ? 'ملخص العملية' : 'Transaction Summary'}
        </h3>

        <div className="space-y-3">
          <div>
            <div className="text-sm text-gray-600">
              {isRtl ? 'العميل' : 'Customer'}
            </div>
            <div className="font-bold">{customer.name}</div>
            <div className="text-sm text-gray-500">{customer.phone}</div>
          </div>

          <div>
            <div className="text-sm text-gray-600">
              {isRtl ? 'الدراجة النارية' : 'Motorcycle'}
            </div>
            <div className="font-bold">{motorcycle.model}</div>
            <div className="text-sm text-gray-500">
              {isRtl ? 'الهيكل' : 'VIN'}: {motorcycle.vin}
            </div>
          </div>

          <div className="border-t pt-3 space-y-2">
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
            <div className="flex justify-between text-xl font-bold border-t pt-2">
              <span>{isRtl ? 'الصافي' : 'Net Amount'}:</span>
              <span className="text-blue-600">
                {netAmount.toLocaleString()} {isRtl ? 'ريال' : 'EGP'}
              </span>
            </div>
            {type === 'reservation' && depositAmount && (
              <>
                <div className="flex justify-between">
                  <span>{isRtl ? 'المدفوع' : 'Paid'}:</span>
                  <span>
                    {depositAmount.toLocaleString()} {isRtl ? 'ريال' : 'EGP'}
                  </span>
                </div>
                <div className="flex justify-between text-orange-600 font-bold">
                  <span>{isRtl ? 'المتبقي' : 'Remaining'}:</span>
                  <span>
                    {(netAmount - depositAmount).toLocaleString()}{' '}
                    {isRtl ? 'ريال' : 'EGP'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={onViewReceipt}
          className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
        >
          {isRtl ? 'عرض الإيصال' : 'View Receipt'}
        </button>
        <button
          onClick={onNewTransaction}
          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold"
        >
          {isRtl ? 'عملية جديدة' : 'New Transaction'}
        </button>
      </div>
    </div>
  );
}
