import { useState, useEffect } from 'react';

interface DiscountInputProps {
  lang: 'en' | 'ar';
  totalAmount: number;
  maxDiscountAmount: number;
  maxDiscountPercent: number;
  value: number;
  onChange: (amount: number, reason: string) => void;
  disabled?: boolean;
}

export default function DiscountInput({
  lang,
  totalAmount,
  maxDiscountAmount,
  maxDiscountPercent,
  value,
  onChange,
  disabled,
}: DiscountInputProps) {
  const [amount, setAmount] = useState(value);
  const [reason, setReason] = useState('');
  const isRtl = lang === 'ar';

  const maxByPercent = (totalAmount * maxDiscountPercent) / 100;
  const effectiveMax = Math.min(maxDiscountAmount, maxByPercent, totalAmount);
  const discountPercent = totalAmount > 0 ? (amount / totalAmount) * 100 : 0;

  useEffect(() => {
    setAmount(value);
  }, [value]);

  const handleAmountChange = (newAmount: number) => {
    const clamped = Math.max(0, Math.min(newAmount, effectiveMax));
    setAmount(clamped);
    onChange(clamped, reason);
  };

  const handleReasonChange = (newReason: string) => {
    setReason(newReason);
    onChange(amount, newReason);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {isRtl ? 'الخصم (ريال)' : 'Discount (EGP)'}
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => handleAmountChange(Number(e.target.value))}
          min="0"
          max={effectiveMax}
          step="100"
          disabled={disabled}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        />
        <div className="mt-1 text-xs text-gray-500">
          {isRtl
            ? `الحد الأقصى: ${effectiveMax.toLocaleString()} ريال (${maxDiscountPercent}%)`
            : `Maximum: ${effectiveMax.toLocaleString()} EGP (${maxDiscountPercent}%)`}
        </div>
      </div>

      {amount > 0 && (
        <>
          <div className="text-sm">
            <span className="text-gray-600">
              {isRtl ? 'النسبة المئوية:' : 'Percentage:'}
            </span>{' '}
            <span className="font-bold text-orange-600">
              {discountPercent.toFixed(1)}%
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {isRtl ? 'سبب الخصم' : 'Discount Reason'}
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => handleReasonChange(e.target.value)}
              placeholder={isRtl ? 'اختياري' : 'Optional'}
              disabled={disabled}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>
        </>
      )}
    </div>
  );
}
