import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Save } from 'lucide-react';
import { brands, categories, motorcycles, suppliers, branches, getUser, type BranchSummary } from '../api';
import ImageUpload from '../components/ImageUpload';

type Lang = 'en' | 'ar';

export default function InventoryAddModal({ lang, branchId, onClose }: { lang: Lang; branchId?: string; onClose: () => void }) {
  const isRtl = lang === 'ar';
  const qc = useQueryClient();

  const [quantity, setQuantity] = useState(1);
  const [motorNumbers, setMotorNumbers] = useState<string[]>(['']);
  const [engineNumbers, setEngineNumbers] = useState<string[]>(['']);
  const [price, setPrice] = useState(0);
  const [costPrice, setCostPrice] = useState(0);
  const [model, setModel] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [color, setColor] = useState('');
  const [brandIdState, setBrandId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState(branchId || '');
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const isSuperAdmin = getUser()?.role.name === 'super_admin';
  const branchQuery = useQuery<{ items: BranchSummary[]; total: number }>({
    queryKey: ['desktop-branches'],
    queryFn: () => branches.list(true),
    enabled: isSuperAdmin,
  });
  
  const brandQuery = useQuery({ queryKey: ['desktop-brands'], queryFn: () => brands.list({ isActive: true }) });
  const categoryQuery = useQuery({ queryKey: ['desktop-categories'], queryFn: () => categories.list({ isActive: true, flat: true }) });
  const supplierQuery = useQuery({ queryKey: ['desktop-suppliers'], queryFn: () => suppliers.list({ limit: 200 }) });

  const brandOptions = useMemo(() => brandQuery.data ?? [], [brandQuery.data]);
  const categoryOptions = useMemo(() => categoryQuery.data ?? [], [categoryQuery.data]);
  const supplierOptions = useMemo(() => supplierQuery.data?.items ?? [], [supplierQuery.data]);
  const branchOptions = useMemo(() => branchQuery.data?.items ?? [], [branchQuery.data]);

  const displayBrandName = (brand: any) => isRtl ? brand.nameAr || brand.nameEn : brand.nameEn || brand.nameAr;
  const displayCategoryName = (cat: any) => isRtl ? cat.nameAr || cat.nameEn : cat.nameEn || cat.nameAr;
  const displayBranchName = (b: any) => isRtl ? b.nameAr || b.nameEn : b.nameEn || b.nameAr;

  const handleQuantityChange = (val: number) => {
    const q = Math.max(1, Math.min(50, val));
    setQuantity(q);
    setMotorNumbers(current => {
      const next = [...current];
      while (next.length < q) next.push('');
      return next.slice(0, q);
    });
    setEngineNumbers(current => {
      const next = [...current];
      while (next.length < q) next.push('');
      return next.slice(0, q);
    });
  };

  const updateMotorNumber = (index: number, val: string) => {
    setMotorNumbers(current => {
      const next = [...current];
      next[index] = val.toUpperCase();
      return next;
    });
  };

  const updateEngineNumber = (index: number, val: string) => {
    setEngineNumbers(current => {
      const next = [...current];
      next[index] = val.toUpperCase();
      return next;
    });
  };

  const createMut = useMutation({
    mutationFn: async () => {
      // Create sequentially to handle unique errors gracefully
      for (let i = 0; i < quantity; i++) {
        const vin = motorNumbers[i].trim();
        if (!vin) throw new Error(isRtl ? 'يجب إدخال جميع أرقام الماتور' : 'All motor numbers are required');
        
        try {
          await motorcycles.create({
            vin,
            engineNumber: (engineNumbers[i] ?? '').trim() || undefined,
            model: model.trim(),
            year,
            price,
            costPrice,
            brandId: brandIdState,
            categoryId,
            branchId: selectedBranchId,
            images,
            // Supplier is currently not part of the MotorcycleInput on backend, we could add it to notes if it existed, or just keep it simple for now
          });
        } catch (err: any) {
          if (err.code === 'DUPLICATE_VIN' || err.message?.toLowerCase().includes('duplicate') || err.message?.toLowerCase().includes('unique') || err.message?.toLowerCase().includes('already exists')) {
            throw new Error(isRtl ? `رقم الماتور ${vin} مسجل مسبقاً` : `Motor number ${vin} is already registered`);
          }
          throw err;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['desktop-inventory'] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedBranchId) {
      setError(isRtl ? 'يجب تحديد الفرع' : 'Branch is required');
      return;
    }
    if (!model.trim() || !brandIdState || !categoryId || price <= 0) {
      setError(isRtl ? 'يرجى إكمال جميع الحقول المطلوبة' : 'Please complete all required fields');
      return;
    }
    const uniqueVins = new Set(motorNumbers.map(v => v.trim()).filter(Boolean));
    if (uniqueVins.size !== motorNumbers.length) {
      setError(isRtl ? 'أرقام الماتور يجب أن تكون فريدة' : 'Motor numbers must be unique');
      return;
    }
    createMut.mutate();
  };

  return (
    <div className="modal-backdrop inventory-add-modal" style={{ display: 'flex', position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100 }}>
      <div className="payment-modal inventory-add-dialog" style={{ width: 'min(600px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
        <button type="button" className="drawer-close inventory-modal-close" onClick={onClose}><X size={18} /></button>
        <div className="inventory-modal-heading">
          <span className="eyebrow">{isRtl ? 'إدارة المخزون' : 'Inventory management'}</span>
          <h2>{isRtl ? 'إضافة مخزون جديد' : 'Add New Inventory'}</h2>
          <p>{isRtl ? 'أدخل بيانات الدراجات الجديدة بدقة.' : 'Register new motorcycles with precise stock details.'}</p>
        </div>
        
        <form onSubmit={submit} className="transfer-form inventory-add-form" style={{ marginTop: '1.5rem' }}>
          {error && <div className="inline-error">{error}</div>}
          
          <div className="form-grid inventory-modal-fields">
            <label>
              <span>{isRtl ? 'الموديل *' : 'Model *'}</span>
              <input value={model} onChange={e => setModel(e.target.value)} required />
            </label>
            <label>
              <span>{isRtl ? 'العلامة التجارية *' : 'Brand *'}</span>
              <select value={brandIdState} onChange={e => setBrandId(e.target.value)} required>
                <option value="">{isRtl ? 'اختر...' : 'Select...'}</option>
                {brandOptions.map((b: any) => <option key={b.id} value={b.id}>{displayBrandName(b)}</option>)}
              </select>
            </label>
            <label>
              <span>{isRtl ? 'الفئة *' : 'Category *'}</span>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)} required>
                <option value="">{isRtl ? 'اختر...' : 'Select...'}</option>
                {categoryOptions.map((c: any) => <option key={c.id} value={c.id}>{displayCategoryName(c)}</option>)}
              </select>
            </label>
            <label>
              <span>{isRtl ? 'سنة الصنع' : 'Year'}</span>
              <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} />
            </label>
            <label>
              <span>{isRtl ? 'سعر البيع *' : 'Price *'}</span>
              <input type="number" min="0" step="0.01" value={price || ''} onChange={e => setPrice(Number(e.target.value))} required />
            </label>
            <label>
              <span>{isRtl ? 'سعر التكلفة' : 'Cost Price'}</span>
              <input type="number" min="0" step="0.01" value={costPrice || ''} onChange={e => setCostPrice(Number(e.target.value))} />
            </label>
            <label>
              <span>{isRtl ? 'اللون' : 'Color'}</span>
              <input value={color} onChange={e => setColor(e.target.value)} />
            </label>
            {isSuperAdmin && (
              <label>
                <span>{isRtl ? 'الفرع *' : 'Branch *'}</span>
                <select value={selectedBranchId} onChange={e => setSelectedBranchId(e.target.value)} required>
                  <option value="">{isRtl ? 'اختر...' : 'Select...'}</option>
                  {branchOptions.map((b: any) => <option key={b.id} value={b.id}>{displayBranchName(b)}</option>)}
                </select>
              </label>
            )}
            <label>
              <span>{isRtl ? 'المورد' : 'Supplier'}</span>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                <option value="">{isRtl ? 'بدون مورد' : 'No supplier'}</option>
                {supplierOptions.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <ImageUpload
              lang={lang}
              value={images[0]}
              onUploaded={url => setImages([url])}
              onClear={() => setImages([])}
            />
          </div>

          <div className="inventory-batch-section" style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--pos-border)' }}>
            <label className="inventory-quantity-field" style={{ display: 'grid', gap: '0.4rem', color: 'var(--text-2)', fontSize: '0.72rem', fontWeight: 600 }}>
              <span>{isRtl ? 'الكمية (عدد الموتوسيكلات)' : 'Quantity'}</span>
              <input 
                type="number" 
                min="1" max="50" 
                value={quantity} 
                onChange={e => handleQuantityChange(Number(e.target.value))} 
                style={{ minHeight: '40px', padding: '0 0.7rem', border: '1px solid var(--pos-border)', borderRadius: '8px', background: 'var(--pos-card)', color: 'var(--text-1)' }}
              />
            </label>

            <div className="inventory-motor-numbers" style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem' }}>
              {motorNumbers.map((num, i) => (
                <div key={i} style={{ display: 'grid', gap: '0.75rem' }}>
                  <label className="inventory-motor-number-field" style={{ display: 'grid', gap: '0.4rem', color: 'var(--text-2)', fontSize: '0.72rem', fontWeight: 600 }}>
                    <span>{isRtl ? `رقم الماتور #${i + 1} *` : `Motor Number #${i + 1} *`}</span>
                    <input 
                      value={num} 
                      onChange={e => updateMotorNumber(i, e.target.value)} 
                      placeholder={isRtl ? 'أدخل رقم الماتور الفريد...' : 'Enter unique motor number...'}
                      required 
                      style={{ minHeight: '40px', padding: '0 0.7rem', border: '1px solid var(--pos-border)', borderRadius: '8px', background: 'var(--pos-card)', color: 'var(--text-1)' }}
                    />
                  </label>
                  <label className="inventory-motor-number-field" style={{ display: 'grid', gap: '0.4rem', color: 'var(--text-2)', fontSize: '0.72rem', fontWeight: 600 }}>
                    <span>{isRtl ? `رقم المحرك #${i + 1}` : `Engine Number #${i + 1}`}</span>
                    <input 
                      value={engineNumbers[i] ?? ''} 
                      onChange={e => updateEngineNumber(i, e.target.value)} 
                      placeholder={isRtl ? 'أدخل رقم المحرك...' : 'Enter engine number...'}
                      style={{ minHeight: '40px', padding: '0 0.7rem', border: '1px solid var(--pos-border)', borderRadius: '8px', background: 'var(--pos-card)', color: 'var(--text-1)' }}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="modal-actions inventory-modal-actions">
            <button type="button" className="secondary-action" onClick={onClose} disabled={createMut.isPending}>
              {isRtl ? 'إلغاء' : 'Cancel'}
            </button>
            <button type="submit" className="primary-action" disabled={createMut.isPending}>
              <Save size={16} /> {createMut.isPending ? (isRtl ? 'جارٍ الإضافة...' : 'Adding...') : (isRtl ? 'إضافة للمخزون' : 'Add to Inventory')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
