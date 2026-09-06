import { useState, useEffect } from 'react';

interface DepositInputProps {
  lang: 'en' | 'ar';
  netAmount: number;
  minDepositPercent?: number;
  value: number;
  onChange: (amount: number) => void;
  disabled?: boolean;
}

export default function DepositInput({
  lang,
  netAmount,
  minDepositPercent = 20,
  value,
  onChange,
  disabled,
}: DepositInputProps) {
  const [amount, setAmount] = useState(value);
  const isRtl = lang === 'ar';

  const minDeposit = (netAmount * minDepositPercent) / 100;
  const depositPercent = netAmount > 0 ? (amount / netAmount) * 100 : 0;
  const remaining = netAmount - amount;

  useEffect(() => {
    setAmount(value);
  }, [value]);

  const handleChange = (newAmount: number) => {
    const clamped = Math.max(minDeposit, Math.min(newAmount, netAmount));
    setAmount(clamped);
    onChange(clamped);
  };

  const setQuickAmount = (percent: number) => {
    const calculatedAmount = (netAmount * percent) / 100;
    handleChange(calculatedAmount);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {isRtl ? 'مبلغ العربون (ريال)' : 'Deposit Amount (EGP)'}
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => handleChange(Number(e.target.value))}
          min={minDeposit}
          max={netAmount}
          step="100"
          disabled={disabled}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        />
        <div className="mt-1 text-xs text-gray-500">
          {isRtl
            ? `الحد الأدنى: ${minDeposit.toLocaleString()} ريال (${minDepositPercent}%)`
            : `Minimum: ${minDeposit.toLocaleString()} EGP (${minDepositPercent}%)`}
        </div>
      </div>

      {/* Quick Amount Buttons */}
      <div className="flex gap-2">
        {[25, 50, 75, 100].map((percent) => (
          <button
            key={percent}
            onClick={() => setQuickAmount(percent)}
            disabled={disabled}
            className={`flex-1 py-2 px-3 text-sm rounded border ${
              Math.abs(depositPercent - percent) < 1
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-300 hover:bg-gray-50'
            } disabled:opacity-50`}
          >
            {percent}%
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">
            {isRtl ? 'النسبة المئوية:' : 'Percentage:'}
          </span>
          <span className="font-bold">{depositPercent.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between border-t pt-2">
          <span className="text-gray-600">
            {isRtl ? 'المبلغ المتبقي:' : 'Remaining:'}
          </span>
          <span className="font-bold text-orange-600">
            {remaining.toLocaleString()} {isRtl ? 'ريال' : 'EGP'}
          </span>
        </div>
      </div>
    </div>
  );
}
