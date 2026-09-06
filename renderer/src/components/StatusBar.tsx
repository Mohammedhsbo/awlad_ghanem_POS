import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { pos } from '../api';
import { useConnectionStatus } from '../hooks/useConnectionStatus';

interface StatusBarProps {
  lang: 'en' | 'ar';
}

export default function StatusBar({ lang }: StatusBarProps) {
  const isRtl = lang === 'ar';
  const [currentTime, setCurrentTime] = useState(new Date());
  const { isOnline } = useConnectionStatus();

  const { data: syncStatus } = useQuery({
    queryKey: ['pos-sync-status'],
    queryFn: pos.getSyncStatus,
    refetchInterval: 10000, // Check every 10 seconds
    enabled: isOnline,
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = currentTime.toLocaleTimeString(isRtl ? 'ar-EG' : 'en-EG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const queuedCount = syncStatus?.queuedOperations || 0;

  return (
    <footer className="bg-gray-800 text-white px-4 py-2 text-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          {/* Connection Status */}
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-green-400' : 'bg-red-400'
              }`}
            />
            <span>
              {isOnline
                ? isRtl
                  ? 'متصل'
                  : 'Online'
                : isRtl
                ? 'غير متصل'
                : 'Offline'}
            </span>
          </div>

          {/* Queue Status */}
          {queuedCount > 0 && (
            <div className="flex items-center gap-2 text-yellow-300">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>
                {queuedCount} {isRtl ? 'عملية معلقة' : 'queued'}
              </span>
            </div>
          )}
        </div>

        {/* Time */}
        <div className="text-gray-400">
          {timeStr}
        </div>
      </div>
    </footer>
  );
}
