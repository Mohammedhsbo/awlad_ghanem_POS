import { useQuery } from '@tanstack/react-query';
import { pos } from '../api';

interface POSHeaderProps {
  lang: 'en' | 'ar';
  title: string;
  onBack?: () => void;
}

export default function POSHeader({ lang, title, onBack }: POSHeaderProps) {
  const isRtl = lang === 'ar';

  const { data: dashboard } = useQuery({
    queryKey: ['pos-dashboard'],
    queryFn: pos.getDashboard,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const user = dashboard?.currentUser;
  const branch = user?.branch;

  return (
    <header className="pos-header-bar bg-blue-600 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {onBack && (
              <button
                onClick={onBack}
                className="px-3 py-1 bg-blue-700 hover:bg-blue-800 rounded text-sm"
                title={isRtl ? 'رجوع' : 'Back'}
              >
                {isRtl ? '→' : '←'}
              </button>
            )}
            <h1 className="pos-header-title text-xl font-bold">{title}</h1>
          </div>

          <div className="flex items-center gap-6">
            {user && (
              <>
                <div className="text-sm">
                  <div className="font-semibold">{user.name}</div>
                  <div className="pos-header-muted text-blue-200 text-xs">
                    {user.role}
                  </div>
                </div>

                {branch && (
                  <div className="text-sm border-l border-blue-500 pl-4">
                    <div className="pos-header-muted text-blue-200 text-xs">
                      {isRtl ? 'الفرع' : 'Branch'}
                    </div>
                    <div className="font-semibold">
                      {isRtl ? branch.nameAr : branch.nameEn}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
