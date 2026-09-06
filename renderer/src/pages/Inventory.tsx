import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bike, Plus, RefreshCw, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getUser, pos } from '../api';

type Lang = 'en' | 'ar';

export default function Inventory({ lang, branchId }: { lang: Lang; branchId?: string }) {
  const isRtl = lang === 'ar';
  const navigate = useNavigate();
  const canManage = getUser()?.role.name === 'super_admin';
  const [query, setQuery] = useState('');
  
  const list = useQuery({ 
    queryKey: ['desktop-inventory', query, branchId], 
    queryFn: () => pos.searchMotorcycles(query, branchId, 50), 
    enabled: query.length === 0 || query.length >= 2 
  });
  
  const data = list.data || [];
  const money = (value: number) => `${value.toLocaleString(isRtl ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 0 })} ${isRtl ? 'ج.م' : 'EGP'}`;
  
  return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{isRtl ? 'المخزون الحي' : 'Live inventory'}</span>
          <h1>{isRtl ? 'المخزون' : 'Inventory'}</h1>
          <p>{isRtl ? 'الوحدات المتاحة في نطاق الفرع الحالي.' : 'Available units within the current branch scope.'}</p>
        </div>
        <div className="report-controls">
          <button className="secondary-action" onClick={() => list.refetch()}>
            <RefreshCw size={16} /> {isRtl ? 'تحديث' : 'Refresh'}
          </button>
          {canManage && (
            <button className="primary-action" onClick={() => navigate('/inventory/new')}>
              <Plus size={16} /> {isRtl ? 'إضافة وحدات' : 'Add units'}
            </button>
          )}
        </div>
      </div>
      
      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder={isRtl ? 'ابحث بالموديل أو رقم الماتور...' : 'Search model or motor number...'} />
        </div>
        <span className="result-count">{data.length} {isRtl ? 'وحدة' : 'units'}</span>
      </div>
      
      {list.isLoading && (
        <div className="inventory-grid">
          {[1, 2, 3, 4].map(item => <div className="inventory-card skeleton" key={item} />)}
        </div>
      )}
      
      {list.isError && (
        <div className="state-panel">{isRtl ? 'تعذر تحميل المخزون.' : 'Could not load inventory.'}</div>
      )}
      
      {!list.isLoading && !list.isError && data.length === 0 && (
        <div className="state-panel">{isRtl ? 'لا توجد وحدات متاحة.' : 'No available units found.'}</div>
      )}
      
      {!list.isLoading && !list.isError && (
        <div className="inventory-grid">
          {data.map(item => (
            <button 
              className="inventory-card" 
              key={item.id}
              onClick={() => navigate(`/inventory/${item.id}`)}
              style={{ textAlign: 'start', cursor: 'pointer', padding: 0, width: '100%' }}
            >
              <div className="inventory-image">
                {item.images?.[0] ? <img src={item.images[0]} alt="" /> : <Bike size={38} />}
              </div>
              <div className="inventory-info">
                <span className="inventory-brand">{isRtl ? item.brand?.nameAr ?? '' : item.brand?.nameEn ?? ''}</span>
                <h2>{item.model}</h2>
                <p>{item.year} · {item.color || (isRtl ? 'بدون لون' : 'No color')}</p>
                <code title={item.vin} style={{ color: 'var(--blue)' }}>{item.vin}</code>
                <div className="inventory-footer">
                  <strong>{money(item.price)}</strong>
                  <span className="status-pill">{item.status}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

    </section>
  );
}
