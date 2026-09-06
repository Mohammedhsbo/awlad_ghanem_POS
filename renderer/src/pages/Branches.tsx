import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Building2, Pencil, Trash2, X, AlertTriangle } from 'lucide-react';
import { branches, type BranchSummary } from '../api';
import { useToast } from '../components/Toast';

type Lang = 'en' | 'ar';

export default function Branches({ lang }: { lang: Lang }) {
  const isRtl = lang === 'ar';
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchSummary | null>(null);
  
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch branches (pass true to get all branches, including inactive ones if the API supports it)
  const branchesQuery = useQuery({
    queryKey: ['admin-branches'],
    queryFn: () => branches.list(true),
  });

  const resetForm = () => {
    setEditingBranch(null);
    setNameEn('');
    setNameAr('');
    setAddress('');
    setPhone('');
    setIsActive(true);
    setErrorMsg('');
  };

  const openAddModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (b: BranchSummary) => {
    setEditingBranch(b);
    setNameEn(b.nameEn);
    setNameAr(b.nameAr);
    setAddress(b.address ?? '');
    setPhone(b.phone ?? '');
    setIsActive(b.isActive ?? true);
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        nameEn,
        nameAr,
        address: address || null,
        phone: phone || null,
        isActive,
      };
      if (editingBranch) {
        return branches.update(editingBranch.id, payload);
      }
      return branches.create(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-branches'] });
      void queryClient.invalidateQueries({ queryKey: ['active-branches'] });
      setIsModalOpen(false);
      resetForm();
      showToast(isRtl ? 'تم حفظ الفرع.' : 'Branch saved.', 'success');
    },
    onError: (err: any) => {
      setErrorMsg(err.message || (isRtl ? 'حدث خطأ أثناء الحفظ' : 'Error saving branch'));
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => branches.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-branches'] });
      void queryClient.invalidateQueries({ queryKey: ['active-branches'] });
    },
    onError: (err: any) => {
      showToast(err.message || (isRtl ? 'لا يمكن حذف الفرع لوجود سجلات مرتبطة به' : 'Cannot delete branch because it has related records.'), 'error');
    },
  });

  const handleDelete = (b: BranchSummary) => {
    if (confirm(isRtl ? `هل أنت متأكد من حذف الفرع "${b.nameAr}"؟` : `Are you sure you want to delete branch "${b.nameEn}"?`)) {
      deleteMut.mutate(b.id);
    }
  };

  return (
    <section className="desktop-page branches-page" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="page-heading branches-heading">
        <div>
          <span className="eyebrow">{isRtl ? 'الإدارة' : 'Administration'}</span>
          <h1>{isRtl ? 'الفروع' : 'Branches'}</h1>
          <p>
            {isRtl
              ? 'إدارة فروع الشركة وعناوينها.'
              : 'Manage company branches and locations.'}
          </p>
        </div>
        <button className="primary-action branches-add-button" onClick={openAddModal}>
          <Plus size={16} /> {isRtl ? 'إضافة فرع' : 'Add branch'}
        </button>
      </div>

      <div className="surface-panel branches-table-panel">
        {branchesQuery.isLoading ? (
          <div className="state-panel">{isRtl ? 'جاري التحميل...' : 'Loading...'}</div>
        ) : branchesQuery.isError ? (
          <div className="state-panel" role="alert">
            <AlertTriangle size={24} style={{ color: 'var(--red-light)', marginBottom: '0.5rem' }} />
            {isRtl ? 'حدث خطأ أثناء جلب الفروع.' : 'Failed to load branches.'}
          </div>
        ) : (
          <div className="table-responsive branches-table-wrap">
            <table className="attendance-table branches-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>{isRtl ? 'الاسم (عربي)' : 'Name (Arabic)'}</th>
                  <th>{isRtl ? 'الاسم (إنجليزي)' : 'Name (English)'}</th>
                  <th>{isRtl ? 'الهاتف' : 'Phone'}</th>
                  <th>{isRtl ? 'العنوان' : 'Address'}</th>
                  <th>{isRtl ? 'الحالة' : 'Status'}</th>
                  <th style={{ width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {(branchesQuery.data?.items ?? []).map((b) => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 600 }}>{b.nameAr}</td>
                    <td>{b.nameEn}</td>
                    <td>{b.phone || '—'}</td>
                    <td>{b.address || '—'}</td>
                    <td>
                      <span className={`status-badge ${b.isActive ? 'active' : 'inactive'}`}>
                        {b.isActive ? (isRtl ? 'نشط' : 'Active') : (isRtl ? 'غير نشط' : 'Inactive')}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button
                          className="icon-btn"
                          onClick={() => openEditModal(b)}
                          title={isRtl ? 'تعديل' : 'Edit'}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={() => handleDelete(b)}
                          title={isRtl ? 'حذف' : 'Delete'}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(branchesQuery.data?.items?.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)' }}>
                      {isRtl ? 'لا توجد فروع.' : 'No branches found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content branches-modal" style={{ maxWidth: 500 }}>
            <div className="modal-header branches-modal-header">
              <h2>
                <Building2 size={20} />
                {editingBranch
                  ? (isRtl ? 'تعديل الفرع' : 'Edit Branch')
                  : (isRtl ? 'إضافة فرع جديد' : 'Add New Branch')}
              </h2>
              <button className="icon-btn" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-body branches-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {errorMsg && <div className="form-error" role="alert">{errorMsg}</div>}
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <label className="input-label">
                  {isRtl ? 'الاسم (عربي) *' : 'Name (Arabic) *'}
                  <input
                    className="pos-input"
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    dir="rtl"
                  />
                </label>
                <label className="input-label">
                  {isRtl ? 'الاسم (إنجليزي) *' : 'Name (English) *'}
                  <input
                    className="pos-input"
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    dir="ltr"
                  />
                </label>
              </div>

              <label className="input-label">
                {isRtl ? 'الهاتف' : 'Phone'}
                <input
                  className="pos-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                />
              </label>

              <label className="input-label">
                {isRtl ? 'العنوان' : 'Address'}
                <input
                  className="pos-input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>

              <label className="perm-toggle-label" style={{ marginTop: '0.5rem' }}>
                <span style={{ fontWeight: 600 }}>{isRtl ? 'فرع نشط' : 'Active branch'}</span>
                <input
                  type="checkbox"
                  className="perm-toggle-input"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <span className="perm-toggle-track" />
              </label>
            </div>

            <div className="modal-footer">
              <button
                className="secondary-action"
                onClick={() => setIsModalOpen(false)}
                disabled={saveMut.isPending}
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                className="primary-action"
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending || !nameAr.trim() || !nameEn.trim()}
              >
                {saveMut.isPending
                  ? (isRtl ? 'جاري الحفظ...' : 'Saving...')
                  : (isRtl ? 'حفظ الفرع' : 'Save Branch')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
