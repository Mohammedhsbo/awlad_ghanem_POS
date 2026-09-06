import { useState } from 'react';

interface Conflict {
  id: string;
  type: 'customer_update';
  localData: any;
  serverData: any;
  timestamp: string;
}

interface ConflictResolutionProps {
  lang: 'en' | 'ar';
  conflicts: Conflict[];
  onResolve: (conflictId: string, resolution: 'server' | 'local' | 'merge') => void;
  onDismiss: () => void;
}

export default function ConflictResolution({
  lang,
  conflicts,
  onResolve,
  onDismiss,
}: ConflictResolutionProps) {
  const [selectedResolutions, setSelectedResolutions] = useState<
    Record<string, 'server' | 'local' | 'merge'>
  >({});
  const isRtl = lang === 'ar';

  if (conflicts.length === 0) {
    return null;
  }

  const handleResolveAll = () => {
    conflicts.forEach((conflict) => {
      const resolution = selectedResolutions[conflict.id] || 'server';
      onResolve(conflict.id, resolution);
    });
    onDismiss();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto">
        <div className="bg-orange-600 text-white p-4">
          <h2 className="text-xl font-bold">
            {isRtl ? '⚠️ تعارضات المزامنة' : '⚠️ Sync Conflicts'}
          </h2>
          <p className="text-sm mt-1">
            {isRtl
              ? `تم العثور على ${conflicts.length} تعارض يحتاج إلى حل`
              : `${conflicts.length} conflict(s) detected that need resolution`}
          </p>
        </div>

        <div className="p-6 space-y-4">
          {conflicts.map((conflict) => (
            <div
              key={conflict.id}
              className="border-2 border-orange-300 rounded-lg p-4"
            >
              <div className="font-bold mb-2">
                {isRtl ? 'تحديث عميل' : 'Customer Update'}
              </div>
              <div className="text-sm text-gray-600 mb-3">
                {isRtl ? 'التاريخ:' : 'Date:'}{' '}
                {new Date(conflict.timestamp).toLocaleString(
                  isRtl ? 'ar-EG' : 'en-EG'
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-3">
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-xs font-bold text-gray-600 mb-2">
                    {isRtl ? 'التغييرات المحلية' : 'Local Changes'}
                  </div>
                  <pre className="text-xs overflow-auto">
                    {JSON.stringify(conflict.localData, null, 2)}
                  </pre>
                </div>
                <div className="bg-blue-50 p-3 rounded">
                  <div className="text-xs font-bold text-blue-600 mb-2">
                    {isRtl ? 'البيانات على الخادم' : 'Server Data'}
                  </div>
                  <pre className="text-xs overflow-auto">
                    {JSON.stringify(conflict.serverData, null, 2)}
                  </pre>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  {isRtl ? 'اختر الحل:' : 'Choose resolution:'}
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setSelectedResolutions((prev) => ({
                        ...prev,
                        [conflict.id]: 'server',
                      }))
                    }
                    className={`flex-1 py-2 px-3 text-sm rounded border-2 ${
                      selectedResolutions[conflict.id] === 'server' ||
                      !selectedResolutions[conflict.id]
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300'
                    }`}
                  >
                    {isRtl ? 'الخادم' : 'Server'}
                  </button>
                  <button
                    onClick={() =>
                      setSelectedResolutions((prev) => ({
                        ...prev,
                        [conflict.id]: 'local',
                      }))
                    }
                    className={`flex-1 py-2 px-3 text-sm rounded border-2 ${
                      selectedResolutions[conflict.id] === 'local'
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-gray-300'
                    }`}
                  >
                    {isRtl ? 'المحلي' : 'Local'}
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div className="bg-blue-50 border border-blue-300 rounded p-3 text-sm">
            <strong>{isRtl ? 'توصية:' : 'Recommendation:'}</strong>{' '}
            {isRtl
              ? 'عادة ما تكون بيانات الخادم هي الأحدث. اختر "الخادم" إذا لم تكن متأكداً.'
              : 'Server data is usually the most up-to-date. Choose "Server" if unsure.'}
          </div>
        </div>

        <div className="border-t p-4 flex gap-3">
          <button
            onClick={onDismiss}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            {isRtl ? 'لاحقاً' : 'Later'}
          </button>
          <button
            onClick={handleResolveAll}
            className="flex-1 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            {isRtl ? 'حل جميع التعارضات' : 'Resolve All Conflicts'}
          </button>
        </div>
      </div>
    </div>
  );
}
