import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pos } from '../api';
import { useKeyboardNav } from '../hooks/useKeyboardNav';
import { useViewingBranch } from '../contexts/ViewingBranchContext';

interface MotorcycleSearchPOSProps {
  lang: 'en' | 'ar';
  customer?: any;
  onSelect: (motorcycle: any) => void;
  onBack?: () => void;
  branchId?: string;
  selectedMotorcycleId?: string;
}

export default function MotorcycleSearchPOS({
  lang,
  customer,
  onSelect,
  onBack,
}: MotorcycleSearchPOSProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isRtl = lang === 'ar';
  const { viewingBranchId, isSuperAdmin } = useViewingBranch();
  const branchId = isSuperAdmin ? viewingBranchId ?? undefined : undefined;

  const { data: motorcycles, isLoading, isError, refetch } = useQuery({
    queryKey: ['pos-motorcycles', query, branchId],
    queryFn: () => pos.searchMotorcycles(query, branchId),
    enabled: query.length >= 2 || query.length === 0,
  });

  const results = motorcycles || [];

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useKeyboardNav({
    onEscape: onBack || (() => {}),
    onEnter: () => {
      if (results[selectedIndex]) {
        onSelect(results[selectedIndex]);
      }
    },
    onTab: () => {
      setSelectedIndex((prev) => (prev + 1) % Math.max(results.length, 1));
    },
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    }
  };

  return (
    <div className="space-y-4">
      {/* Customer Info */}
      {customer && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm text-blue-600 font-semibold">
            {isRtl ? 'العميل المحدد' : 'Selected Customer'}
          </div>
          <div className="mt-1 font-bold">{customer.name}</div>
          <div className="text-sm text-gray-600">{customer.phone}</div>
        </div>
      )}

      {/* Search Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {isRtl
            ? 'البحث عن دراجة نارية (رقم الهيكل، الموديل، العلامة التجارية)'
            : 'Search Motorcycle (VIN, Model, Brand)'}
        </label>
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isRtl
              ? 'ابحث بالرقم التسلسلي أو الموديل...'
              : 'Search by VIN or model...'
          }
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <div className="mt-1 text-xs text-gray-500">
          {isRtl
            ? 'استخدم الأسهم للتنقل، Enter للاختيار، Esc للعودة'
            : 'Use arrows to navigate, Enter to select, Esc to go back'}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-8 text-gray-500">
          {isRtl ? 'جارٍ التحميل...' : 'Loading...'}
        </div>
      )}

      {isError && (
        <div className="state-panel" role="alert">
          <p>{isRtl ? 'تعذر تحميل المخزون.' : 'Could not load motorcycles.'}</p>
          <button className="secondary-action" onClick={() => refetch()}>{isRtl ? 'إعادة المحاولة' : 'Retry'}</button>
        </div>
      )}

      {/* Results */}
      {!isLoading && !isError && results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((moto: any, index: number) => (
            <button
              key={moto.id}
              onClick={() => onSelect(moto)}
              className={`text-left p-4 border-2 rounded-lg transition-colors ${
                index === selectedIndex
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* Image placeholder */}
              <div className="w-full h-32 bg-gray-200 rounded-lg mb-3 flex items-center justify-center">
                {moto.images && moto.images.length > 0 ? (
                  <img
                    src={moto.images[0]}
                    alt={moto.model}
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <svg
                    className="w-12 h-12 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                )}
              </div>

              <div className="space-y-1">
                <div className="font-bold text-lg">{moto.model}</div>
                <div className="text-sm text-gray-600">
                  {isRtl ? moto.brand.nameAr : moto.brand.nameEn}
                </div>
                <div className="text-xs text-gray-500">
                  {isRtl ? 'الهيكل' : 'VIN'}: {moto.vin}
                </div>
                <div className="text-xs text-gray-500">
                  {moto.year} • {moto.color}
                </div>
                <div className="mt-2 text-lg font-bold text-blue-600">
                  {moto.price.toLocaleString()} {isRtl ? 'ريال' : 'EGP'}
                </div>
                <div
                  className={`inline-block px-2 py-1 text-xs rounded ${
                    moto.status === 'available'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {moto.status === 'available'
                    ? isRtl
                      ? 'متاح'
                      : 'Available'
                    : moto.status}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No Results */}
      {!isLoading && !isError && query.length >= 2 && results.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          {isRtl ? 'لا توجد نتائج' : 'No results found'}
        </div>
      )}

      {/* Initial State */}
      {!isLoading && !isError && query.length < 2 && results.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          {isRtl
            ? 'ابدأ بكتابة حرفين على الأقل للبحث'
            : 'Start typing at least 2 characters to search'}
        </div>
      )}

      {/* Back Button */}
      <div className="flex justify-start">
        <button
          onClick={onBack}
          className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          {isRtl ? 'رجوع' : 'Back'}
        </button>
      </div>
    </div>
  );
}
