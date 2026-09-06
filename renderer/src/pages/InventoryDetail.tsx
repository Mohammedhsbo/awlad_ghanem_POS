import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bike, Pencil, Trash2 } from 'lucide-react';
import { getUser, motorcycles } from '../api';

type Lang = 'en' | 'ar';

export default function InventoryDetail({ lang }: { lang: Lang }) {
  const { id } = useParams();
  const isRtl = lang === 'ar';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = getUser()?.role.name === 'super_admin';

  const detail = useQuery({ 
    queryKey: ['desktop-motorcycle', id], 
    queryFn: () => motorcycles.get(id!) 
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      try {
        await motorcycles.remove(id!);
      } catch (reason) {
        const error = reason as Error & { code?: string };
        if (error.code !== 'MOTORCYCLE_HAS_RESERVATIONS') throw reason;
        await motorcycles.updateStatus(id!, 'maintenance', 'Removed from inventory; reservation history retained');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['desktop-inventory'] });
      navigate('/inventory');
    },
  });

  const data = detail.data;
  const money = (value: number) => `${value.toLocaleString(isRtl ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 0 })} ${isRtl ? 'ج.م' : 'EGP'}`;

  return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="page-heading">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button type="button" className="secondary-action" onClick={() => navigate('/inventory')}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <span className="eyebrow">{isRtl ? 'تفاصيل الوحدة' : 'Unit Details'}</span>
            <h1>{data ? data.model : (isRtl ? 'جاري التحميل...' : 'Loading...')}</h1>
          </div>
        </div>
        {data && canManage && (
          <div className="report-controls">
            <button type="button" className="secondary-action" onClick={() => navigate(`/inventory/${data.id}/edit`)}>
              <Pencil size={16} /> {isRtl ? 'تعديل' : 'Edit'}
            </button>
            <button type="button" className="secondary-action" onClick={() => {
              if (window.confirm(isRtl ? 'هل أنت متأكد من حذف هذه الماكينة؟' : 'Are you sure you want to delete this motorcycle?')) deleteMut.mutate();
            }} disabled={deleteMut.isPending}>
              <Trash2 size={16} /> {deleteMut.isPending ? (isRtl ? 'جارٍ الحذف...' : 'Deleting...') : (isRtl ? 'حذف' : 'Delete')}
            </button>
          </div>
        )}
      </div>

      {detail.isLoading && (
        <div className="surface-panel skeleton" style={{ minHeight: '400px' }} />
      )}

      {detail.isError && (
        <div className="state-panel">{isRtl ? 'تعذر تحميل التفاصيل.' : 'Could not load details.'}</div>
      )}

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
          <div className="surface-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="inventory-image" style={{ height: '300px', borderRadius: '12px' }}>
              {data.images?.[0] ? (
                <img src={data.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }} />
              ) : (
                <Bike size={64} style={{ opacity: 0.5 }} />
              )}
            </div>
            <div style={{ textAlign: 'center' }}>
              <span className="status-pill" style={{ display: 'inline-block', fontSize: '0.85rem', padding: '0.4rem 1rem' }}>
                {data.status}
              </span>
            </div>
          </div>

          <div className="surface-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h2>{isRtl ? 'المعلومات الأساسية' : 'Basic Information'}</h2>
            
            <div className="detail-summary" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <span>
                {isRtl ? 'العلامة التجارية' : 'Brand'}
                <strong>{isRtl ? data.brand?.nameAr || data.brand?.nameEn : data.brand?.nameEn || data.brand?.nameAr}</strong>
              </span>
              <span>
                {isRtl ? 'الموديل' : 'Model'}
                <strong>{data.model}</strong>
              </span>
              <span>
                {isRtl ? 'رقم الماتور (VIN)' : 'Motor Number (VIN)'}
                <strong style={{ color: 'var(--blue)' }}>{data.vin}</strong>
              </span>
              <span>
                {isRtl ? 'سنة الصنع' : 'Year'}
                <strong>{data.year}</strong>
              </span>
              <span>
                {isRtl ? 'اللون' : 'Color'}
                <strong>{data.color || (isRtl ? 'بدون لون' : 'No color')}</strong>
              </span>
              <span>
                {isRtl ? 'سعر البيع' : 'Selling Price'}
                <strong>{money(data.price)}</strong>
              </span>
              <span>
                {isRtl ? 'سعر التكلفة' : 'Cost Price'}
                <strong>{data.costPrice ? money(data.costPrice) : (isRtl ? 'غير متوفر' : 'N/A')}</strong>
              </span>
              <span>
                {isRtl ? 'الفرع المتواجد به' : 'Current Branch'}
                <strong>{isRtl ? data.branch?.nameAr || data.branch?.nameEn : data.branch?.nameEn || data.branch?.nameAr}</strong>
              </span>
              <span>
                {isRtl ? 'الفئة' : 'Category'}
                <strong>{data.category ? (isRtl ? data.category.nameAr || data.category.nameEn : data.category.nameEn || data.category.nameAr) : (isRtl ? 'غير محدد' : 'Not specified')}</strong>
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
