import { useQuery } from '@tanstack/react-query';
import { pos } from '../api';
import { useConnectionStatus } from '../hooks/useConnectionStatus';

interface SyncStatusProps {
  lang: 'en' | 'ar';
}

export default function SyncStatus({ lang }: SyncStatusProps) {
  const { isOnline } = useConnectionStatus();
  const isRtl = lang === 'ar';

  const { data: syncStatus, isLoading } = useQuery({
    queryKey: ['pos-sync-status'],
    queryFn: pos.getSyncStatus,
    refetchInterval: 5000,
    enabled: isOnline,
  });

  if (!isOnline) {
    return (
      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-yellow-600 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div className="flex-1">
            <div className="font-medium text-yellow-900">
              {isRtl ? 'غير متصل بالإنترنت' : 'Offline'}
            </div>
            <div className="text-sm text-yellow-700 mt-1">
              {isRtl
                ? 'لا يمكن إجراء عمليات البيع أو الحجز في وضع غير متصل'
                : 'Sales and reservations cannot be processed offline'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || !syncStatus) {
    return (
      <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="animate-spin w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full" />
          <span className="text-gray-600">
            {isRtl ? 'جارٍ التحقق من حالة المزامنة...' : 'Checking sync status...'}
          </span>
        </div>
      </div>
    );
  }

  const hasQueue = syncStatus.queuedOperations > 0;

  return (
    <div
      className={`border rounded-lg p-4 ${
        hasQueue
          ? 'bg-blue-50 border-blue-300'
          : 'bg-green-50 border-green-300'
      }`}
    >
      <div className="flex items-start gap-3">
        <svg
          className={`w-5 h-5 mt-0.5 ${
            hasQueue ? 'text-blue-600' : 'text-green-600'
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {hasQueue ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          )}
        </svg>
        <div className="flex-1">
          {hasQueue ? (
            <>
              <div className="font-medium text-blue-900">
                {isRtl ? 'عمليات معلقة' : 'Pending Operations'}
              </div>
              <div className="text-sm text-blue-700 mt-1">
                {syncStatus.queuedOperations}{' '}
                {isRtl
                  ? 'عملية في قائمة الانتظار'
                  : 'operations queued for sync'}
              </div>
            </>
          ) : (
            <>
              <div className="font-medium text-green-900">
                {isRtl ? 'متصل ومتزامن' : 'Online & Synced'}
              </div>
              <div className="text-sm text-green-700 mt-1">
                {isRtl
                  ? 'جميع العمليات متزامنة'
                  : 'All operations are synced'}
              </div>
            </>
          )}
        </div>
      </div>

      {syncStatus.lastSyncAt && (
        <div className="mt-2 text-xs text-gray-600">
          {isRtl ? 'آخر مزامنة:' : 'Last sync:'}{' '}
          {new Date(syncStatus.lastSyncAt).toLocaleString(
            isRtl ? 'ar-EG' : 'en-EG'
          )}
        </div>
      )}
    </div>
  );
}
