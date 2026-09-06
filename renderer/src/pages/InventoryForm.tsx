import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { brands, branches, categories, motorcycles, type BrandSummary, type CategorySummary, type MotorcycleInput } from '../api';
import ImageUpload from '../components/ImageUpload';

type Lang = 'en' | 'ar';

const emptyForm = (branchId?: string): MotorcycleInput => ({
  vin: '',
  engineNumber: '',
  model: '',
  year: new Date().getFullYear(),
  color: '',
  price: 0,
  costPrice: 0,
  brandId: '',
  categoryId: '',
  branchId: branchId ?? '',
  images: [],
});

export default function InventoryForm({ lang, branchId }: { lang: Lang; branchId?: string }) {
  const isRtl = lang === 'ar';
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const editing = Boolean(id);

  const [form, setForm] = useState<MotorcycleInput>(() => emptyForm(branchId));
  const [error, setError] = useState<string | null>(null);

  const brandQuery = useQuery({ queryKey: ['desktop-brands'], queryFn: () => brands.list({ isActive: true }) });
  const categoryQuery = useQuery({ queryKey: ['desktop-categories'], queryFn: () => categories.list({ isActive: true, flat: true }) });
  const branchQuery = useQuery<{ items: { id: string; nameAr: string; nameEn: string }[]; total: number }>({ queryKey: ['desktop-branches'], queryFn: () => branches.list(true) });
  const detail = useQuery({ queryKey: ['desktop-motorcycle', id], queryFn: () => motorcycles.get(id!), enabled: editing });

  useEffect(() => {
    if (!detail.data) return;
    setForm({
      vin: detail.data.vin,
      engineNumber: detail.data.engineNumber ?? '',
      model: detail.data.model,
      year: detail.data.year,
      color: detail.data.color ?? '',
      price: detail.data.price,
      costPrice: detail.data.costPrice ?? 0,
      brandId: detail.data.brand?.id ?? '',
      categoryId: detail.data.category?.id ?? '',
      branchId: detail.data.branch?.id ?? '',
      images: detail.data.images ?? [],
    });
  }, [detail.data]);

  useEffect(() => {
    if (!editing && branchId) {
      setForm(current => ({ ...current, branchId }));
    }
  }, [branchId, editing]);

  const createMut = useMutation({
    mutationFn: (data: MotorcycleInput) => motorcycles.create({
      vin: String(data.vin ?? '').trim(),
      engineNumber: String(data.engineNumber ?? '').trim() || undefined,
      model: String(data.model ?? '').trim(),
      year: Number(data.year || new Date().getFullYear()),
      price: Number(data.price ?? 0),
      costPrice: Number(data.costPrice ?? 0),
      brandId: String(data.brandId ?? '').trim(),
      categoryId: String(data.categoryId ?? '').trim(),
      branchId: String(data.branchId ?? '').trim(),
      images: data.images ?? [],
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['desktop-inventory'] });
      navigate('/inventory');
    },
    onError: (reason: Error) => setError(reason.message),
  });

  const updateMut = useMutation({
    mutationFn: (data: MotorcycleInput) => motorcycles.update(id!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['desktop-inventory'] });
      navigate('/inventory');
    },
    onError: (reason: Error) => setError(reason.message),
  });

  const displayBrandName = (brand: BrandSummary) => isRtl ? brand.nameAr || brand.nameEn : brand.nameEn || brand.nameAr;
  const displayCategoryName = (category: CategorySummary) => isRtl ? category.nameAr || category.nameEn : category.nameEn || category.nameAr;
  const displayBranchName = (branch: { id: string; nameAr: string; nameEn: string }) => isRtl ? branch.nameAr || branch.nameEn : branch.nameEn || branch.nameAr;

  const title = editing ? (isRtl ? 'تعديل دراجة' : 'Edit motorcycle') : (isRtl ? 'إضافة دراجة جديدة' : 'Add motorcycle');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const vin = String(form.vin ?? '').trim();
    const model = String(form.model ?? '').trim();
    const price = Number(form.price ?? 0);
    const costPrice = Number(form.costPrice ?? 0);

    if (!vin || !model || !form.brandId || !form.categoryId || !form.branchId || price <= 0 || costPrice < 0) {
      setError(isRtl ? 'يرجى إكمال جميع الحقول المطلوبة.' : 'Please complete all required fields.');
      return;
    }

    const payload: MotorcycleInput = { ...form, vin, model, price, costPrice, brandId: form.brandId, categoryId: form.categoryId, branchId: form.branchId, images: form.images ?? [] };

    if (editing) {
      const { branchId: _branchId, ...updatePayload } = payload;
      void _branchId;
      updateMut.mutate(updatePayload);
    } else {
      createMut.mutate(payload);
    }
  };

  const formDisabled = createMut.isPending || updateMut.isPending;

  const branchOptions = useMemo(() => branchQuery.data?.items ?? [], [branchQuery.data]);
  const brandOptions = useMemo(() => brandQuery.data ?? [], [brandQuery.data]);
  const categoryOptions = useMemo(() => categoryQuery.data ?? [], [categoryQuery.data]);

  return (
    <section className="desktop-page inventory-form-page" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="page-heading inventory-form-heading">
        <div className="inventory-form-title">
          <button type="button" className="secondary-action inventory-back-button" onClick={() => navigate('/inventory')}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <span className="eyebrow">{isRtl ? 'المخزون' : 'Inventory'}</span>
            <h1>{title}</h1>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="surface-panel inventory-form-panel" style={{ maxWidth: 980, margin: '0 auto' }}>
        <div className="inventory-form-panel-heading">
          <div><span className="eyebrow">{isRtl ? 'بيانات المركبة' : 'Vehicle profile'}</span><h2>{isRtl ? 'مواصفات الدراجة' : 'Motorcycle specifications'}</h2><p>{isRtl ? 'أدخل بيانات دقيقة لتسهيل البيع والمخزون.' : 'Add precise details so the motorcycle is ready for sales and inventory.'}</p></div>
          <span className="inventory-form-status">{editing ? (isRtl ? 'تعديل' : 'Editing') : (isRtl ? 'جديد' : 'New')}</span>
        </div>
        {error && <div className="inline-error inventory-form-error">{error}</div>}

        <div className="inventory-fields">
          <label className="field-label">
            <span>VIN *</span>
            <input className="text-input" value={form.vin ?? ''} onChange={event => setForm(current => ({ ...current, vin: event.target.value.toUpperCase() }))} required />
          </label>

          <label className="field-label">
            <span>{isRtl ? 'رقم المحرك' : 'Engine number'}</span>
            <input className="text-input" value={form.engineNumber ?? ''} onChange={event => setForm(current => ({ ...current, engineNumber: event.target.value.toUpperCase() }))} />
          </label>

          <label className="field-label">
            <span>{isRtl ? 'الموديل *' : 'Model *'}</span>
            <input className="text-input" value={form.model ?? ''} onChange={event => setForm(current => ({ ...current, model: event.target.value }))} required />
          </label>

          <label className="field-label">
            <span>{isRtl ? 'السنة' : 'Year'}</span>
            <input className="text-input" type="number" value={form.year ?? new Date().getFullYear()} onChange={event => setForm(current => ({ ...current, year: Number(event.target.value || new Date().getFullYear()) }))} />
          </label>

          <label className="field-label">
            <span>{isRtl ? 'اللون' : 'Color'}</span>
            <input className="text-input" value={form.color ?? ''} onChange={event => setForm(current => ({ ...current, color: event.target.value }))} />
          </label>

          <label className="field-label">
            <span>{isRtl ? 'العلامة التجارية *' : 'Brand *'}</span>
            <select className="text-input" value={form.brandId ?? ''} onChange={event => setForm(current => ({ ...current, brandId: event.target.value }))} required>
              <option value="">{isRtl ? 'اختر العلامة التجارية' : 'Select brand'}</option>
              {brandOptions.map((brand) => (
                <option key={brand.id} value={brand.id}>{displayBrandName(brand)}</option>
              ))}
            </select>
          </label>

          <label className="field-label">
            <span>{isRtl ? 'الفئة *' : 'Category *'}</span>
            <select className="text-input" value={form.categoryId ?? ''} onChange={event => setForm(current => ({ ...current, categoryId: event.target.value }))} required>
              <option value="">{isRtl ? 'اختر الفئة' : 'Select category'}</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>{displayCategoryName(category)}</option>
              ))}
            </select>
          </label>

          <label className="field-label">
            <span>{isRtl ? 'الفرع *' : 'Branch *'}</span>
            <select className="text-input" value={form.branchId ?? ''} onChange={event => setForm(current => ({ ...current, branchId: event.target.value }))} required>
              <option value="">{isRtl ? 'اختر الفرع' : 'Select branch'}</option>
              {branchOptions.map((branch) => (
                <option key={branch.id} value={branch.id}>{displayBranchName(branch)}</option>
              ))}
            </select>
          </label>

          <label className="field-label">
            <span>{isRtl ? 'سعر البيع *' : 'Selling price *'}</span>
            <input className="text-input" type="number" min="0" step="0.01" value={form.price ?? 0} onChange={event => setForm(current => ({ ...current, price: Number(event.target.value || 0) }))} required />
          </label>

          <label className="field-label">
            <span>{isRtl ? 'سعر التكلفة' : 'Cost price'}</span>
            <input className="text-input" type="number" min="0" step="0.01" value={form.costPrice ?? 0} onChange={event => setForm(current => ({ ...current, costPrice: Number(event.target.value || 0) }))} />
          </label>

          <ImageUpload
            lang={lang}
            value={form.images?.[0]}
            onUploaded={url => setForm(current => ({ ...current, images: [url] }))}
            onClear={() => setForm(current => ({ ...current, images: [] }))}
          />
        </div>

        <div className="inventory-form-actions">
          <button type="button" className="secondary-action" onClick={() => navigate('/inventory')}>
            {isRtl ? 'إلغاء' : 'Cancel'}
          </button>
          <button type="submit" className="primary-action" disabled={formDisabled}>
            <Save size={16} /> {formDisabled ? (isRtl ? 'جارٍ الحفظ...' : 'Saving...') : (isRtl ? 'حفظ' : 'Save')}
          </button>
        </div>
      </form>
    </section>
  );
}