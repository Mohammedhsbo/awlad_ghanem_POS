import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pos, type CustomerSearchResult } from '../api';
import { Search } from 'lucide-react';
import CustomerCard from './CustomerCard';
import { DataList, DataTableState } from './DataTable';
import { useKeyboardNav } from '../hooks/useKeyboardNav';

interface CustomerSearchPOSProps {
  lang: 'en' | 'ar';
  onSelect: (customer: CustomerSearchResult) => void;
  onCreateNew?: () => void;
  onClose?: () => void;
}

export default function CustomerSearchPOS({ lang, onSelect, onCreateNew, onClose }: CustomerSearchPOSProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isRtl = lang === 'ar';

  const { data: customers, isLoading, isError, refetch } = useQuery({
    queryKey: ['pos-customers', query],
    queryFn: () => pos.searchCustomers(query),
    enabled: query.length >= 2,
  });

  const results = customers?.items || [];

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useKeyboardNav({
    onF1: onCreateNew,
    onEscape: () => onClose && onClose(),
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
    <div className="customer-search-page space-y-4">
      <div className="customer-search-hero">
        <div className="customer-search-kicker">{isRtl ? 'ابدأ عملية جديدة' : 'Start a new transaction'}</div>
        <h2>{isRtl ? 'ابحث عن العميل' : 'Find a customer'}</h2>
        <label className="customer-search-label block text-sm font-medium text-gray-700 mb-2">
          {isRtl
            ? 'البحث عن عميل (الاسم، الهاتف، البريد الإلكتروني)'
            : 'Search Customer (Name, Phone, Email)'}
        </label>
        <div className="customer-search-field">
          <Search size={19} aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isRtl ? 'ابحث بالاسم أو رقم الهاتف...' : 'Search by name or phone...'
            }
          />
        </div>
        <div className="customer-search-hint mt-1 text-xs text-gray-500">
          {isRtl
            ? 'استخدم الأسهم للتنقل، Enter للاختيار، F1 لإنشاء عميل جديد'
            : 'Use arrows to navigate, Enter to select, F1 to create new customer'}
        </div>
      </div>

      {/* Create New Button */}
      <div className="customer-search-action">
        <button
          onClick={onCreateNew}
          className="primary-action w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
        >
          {isRtl ? '+ إنشاء عميل جديد (F1)' : '+ Create New Customer (F1)'}
        </button>
      </div>

      {/* Loading */}
      {isLoading && <DataTableState kind="loading" lang={lang} />}

      {isError && (
        <DataTableState kind="error" lang={lang} onRetry={() => refetch()} />
      )}

      {/* Results */}
      {!isLoading && !isError && results.length > 0 && (
        <DataList className="customer-search-results">
          {results.map((customer: any, index: number) => (
            <button
              key={customer.id}
              onClick={() => onSelect(customer)}
              className={`customer-search-result w-full text-left p-4 border-2 rounded-lg transition-colors ${
                index === selectedIndex
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <CustomerCard customer={customer} lang={lang} />
            </button>
          ))}
        </DataList>
      )}

      {/* No Results */}
      {!isLoading && !isError && query.length >= 2 && results.length === 0 && (
        <div className="data-table-state customer-search-empty">
          <p>{isRtl ? 'لا توجد نتائج' : 'No results found'}</p>
          <button
            onClick={onCreateNew}
            className="secondary-action"
          >
            {isRtl ? 'إنشاء عميل جديد' : 'Create New Customer'}
          </button>
        </div>
      )}

      {/* Initial State */}
      {!isLoading && !isError && query.length < 2 && (
        <div className="data-table-state customer-search-empty">
          {isRtl
            ? 'ابدأ بكتابة حرفين على الأقل للبحث'
            : 'Start typing at least 2 characters to search'}
        </div>
      )}
    </div>
  );
}
