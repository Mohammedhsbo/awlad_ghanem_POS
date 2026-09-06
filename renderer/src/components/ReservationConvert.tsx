import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { pos } from '../api';
import type { ReservationDetail } from '../api';

interface ReservationConvertProps {
  lang: 'en' | 'ar';
  reservation: ReservationDetail;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ReservationConvert({
  lang,
  reservation,
  onSuccess,
  onCancel,
}: ReservationConvertProps) {
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => `pos-reservation-conversion-${reservation.id}`);
  const isRtl = lang === 'ar';

  const convertMutation = useMutation({
    mutationFn: () => pos.convertReservation(reservation.id, notes, idempotencyKey),
    onSuccess: () => {
      setError(null);
      onSuccess();
    },
    onError: (error: any) => {
      setError(error.message || (isRtl ? 'فشل التحويل' : 'Conversion failed'));
    },
  });

  return (
    <div className="space-y-6">
      {error && <div className="state-panel" role="alert">{error}</div>}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-bold text-lg mb-2">
          {isRtl ? 'تحويل حجز إلى طلب' : 'Convert Reservation to Order'}
        </h3>
        <div className="text-sm text-gray-700">
          {isRtl
            ? 'سيتم إنشاء طلب جديد وإلغاء الحجز الحالي'
            : 'A new order will be created and the reservation will be cancelled'}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <div>
          <div className="text-sm text-gray-600">
            {isRtl ? 'رقم الحجز' : 'Reservation Number'}
          </div>
          <div className="font-bold text-lg">
            {reservation.reservationNumber}
          </div>
        </div>

        <div>
          <div className="text-sm text-gray-600">
            {isRtl ? 'العميل' : 'Customer'}
          </div>
          <div className="font-bold">{reservation.customer.name}</div>
          <div className="text-sm text-gray-500">
            {reservation.customer.phone}
          </div>
        </div>

        <div>
          <div className="text-sm text-gray-600">
            {isRtl ? 'الدراجة النارية' : 'Motorcycle'}
          </div>
          <div className="font-bold">{reservation.motorcycle.model}</div>
          <div className="text-sm text-gray-500">
            {isRtl ? 'الهيكل' : 'VIN'}: {reservation.motorcycle.vin}
          </div>
        </div>

        <div className="border-t pt-4 space-y-2">
          <div className="flex justify-between">
            <span>{isRtl ? 'الإجمالي' : 'Total'}:</span>
            <span className="font-bold">
              {reservation.totalPrice.toLocaleString()}{' '}
              {isRtl ? 'ريال' : 'EGP'}
            </span>
          </div>
          <div className="flex justify-between text-green-600">
            <span>{isRtl ? 'المدفوع' : 'Paid'}:</span>
            <span className="font-bold">
              {reservation.depositAmount.toLocaleString()}{' '}
              {isRtl ? 'ريال' : 'EGP'}
            </span>
          </div>
          <div className="flex justify-between text-orange-600 text-lg font-bold border-t pt-2">
            <span>{isRtl ? 'المتبقي' : 'Remaining'}:</span>
            <span>
              {reservation.remainingAmount.toLocaleString()}{' '}
              {isRtl ? 'ريال' : 'EGP'}
            </span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {isRtl ? 'ملاحظات (اختياري)' : 'Notes (Optional)'}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder={
              isRtl
                ? 'أضف أي ملاحظات للطلب...'
                : 'Add any notes for the order...'
            }
          />
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={onCancel}
          disabled={convertMutation.isPending}
          className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          {isRtl ? 'إلغاء' : 'Cancel'}
        </button>
        <button
          onClick={() => convertMutation.mutate()}
          disabled={convertMutation.isPending}
          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-bold"
        >
          {convertMutation.isPending
            ? isRtl
              ? 'جارٍ التحويل...'
              : 'Converting...'
            : isRtl
            ? 'تأكيد التحويل'
            : 'Confirm Conversion'}
        </button>
      </div>
    </div>
  );
}
