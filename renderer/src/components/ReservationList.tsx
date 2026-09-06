import { useQuery } from '@tanstack/react-query';
import { pos } from '../api';

interface ReservationListProps {
  lang: 'en' | 'ar';
  branchId?: string;
  customerId?: string;
  onSelect: (reservation: any) => void;
}

export default function ReservationList({
  lang,
  branchId,
  customerId,
  onSelect,
}: ReservationListProps) {
  const isRtl = lang === 'ar';

  const { data: reservations, isLoading } = useQuery({
    queryKey: ['active-reservations', branchId, customerId],
    queryFn: () => pos.getActiveReservations(branchId, customerId),
  });

  if (isLoading) {
    return (
      <div className="text-center py-8 text-gray-500">
        {isRtl ? 'جارٍ التحميل...' : 'Loading...'}
      </div>
    );
  }

  if (!reservations || reservations.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {isRtl ? 'لا توجد حجوزات نشطة' : 'No active reservations'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reservations.map((reservation: any) => {
        const daysUntilExpiry = reservation.daysUntilExpiry || 0;
        const isExpiringSoon = daysUntilExpiry <= 2;

        return (
          <button
            key={reservation.id}
            onClick={() => onSelect(reservation)}
            className="w-full text-left p-4 border-2 border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="font-bold text-lg">
                  {reservation.reservationNumber}
                </div>
                <div className="text-sm text-gray-600">
                  {reservation.customer.name}
                </div>
              </div>
              {isExpiringSoon && (
                <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded">
                  {isRtl
                    ? `ينتهي خلال ${daysUntilExpiry} يوم`
                    : `Expires in ${daysUntilExpiry} days`}
                </span>
              )}
            </div>

            <div className="space-y-1 text-sm">
              <div>
                <span className="text-gray-600">
                  {isRtl ? 'الدراجة:' : 'Motorcycle:'}
                </span>{' '}
                {reservation.motorcycle.model}
              </div>
              <div>
                <span className="text-gray-600">
                  {isRtl ? 'المدفوع:' : 'Paid:'}
                </span>{' '}
                <span className="font-bold">
                  {reservation.depositAmount.toLocaleString()}{' '}
                  {isRtl ? 'ريال' : 'EGP'}
                </span>
              </div>
              <div>
                <span className="text-gray-600">
                  {isRtl ? 'المتبقي:' : 'Remaining:'}
                </span>{' '}
                <span className="font-bold text-orange-600">
                  {reservation.remainingAmount.toLocaleString()}{' '}
                  {isRtl ? 'ريال' : 'EGP'}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
