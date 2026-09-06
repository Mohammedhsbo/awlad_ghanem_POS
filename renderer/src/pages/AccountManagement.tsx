import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Power, RefreshCw, Trash2, UserPlus, X } from 'lucide-react';
import { branches, roles, users, type BranchSummary, type UpdateUserInput, type UserListItem } from '../api';

export default function AccountManagement({ lang }: { lang: 'en' | 'ar' }) {
  const isRtl = lang === 'ar';
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', whatsappSenderNumber: '', roleId: '', branchId: '' });
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<UserListItem | null>(null);
  const [editForm, setEditForm] = useState<UpdateUserInput>({});
  const userQuery = useQuery({ queryKey: ['account-users'], queryFn: users.list });
  const branchQuery = useQuery<{ items: BranchSummary[]; total: number }>({
    queryKey: ['active-branches'],
    queryFn: () => branches.list(true),
  });
  const roleQuery = useQuery({ queryKey: ['assignable-roles'], queryFn: roles.list });
  const selectedRole = roleQuery.data?.find((role) => role.id === form.roleId);
  const createUser = useMutation({
    mutationFn: () => users.create({
      name: form.name,
      email: form.email,
      password: form.password,
      whatsappSenderNumber: form.whatsappSenderNumber || undefined,
      roleId: form.roleId,
      ...(selectedRole?.name === 'super_admin' ? {} : { branchId: form.branchId }),
    }),
    onSuccess: () => {
      setForm({ name: '', email: '', password: '', whatsappSenderNumber: '', roleId: '', branchId: '' });
      setShowCreate(false);
      setError('');
      void queryClient.invalidateQueries({ queryKey: ['account-users'] });
    },
    onError: (reason: Error & { code?: string }) => setError(reason.message || reason.code || 'Request failed'),
  });
  const updateUser = useMutation({
    mutationFn: () => users.update(editing!.id, editForm),
    onSuccess: () => { setEditing(null); setError(''); void queryClient.invalidateQueries({ queryKey: ['account-users'] }); },
    onError: (reason: Error & { code?: string }) => setError(reason.message || reason.code || 'Request failed'),
  });
  const deleteUser = useMutation({
    mutationFn: (id: string) => users.remove(id),
    onSuccess: () => { setError(''); void queryClient.invalidateQueries({ queryKey: ['account-users'] }); },
    onError: (reason: Error & { code?: string }) => setError(reason.code === 'USER_HAS_RECORDS' ? (isRtl ? 'لا يمكن حذف الحساب لوجود سجلات مرتبطة. استخدم التعطيل بدلاً من ذلك.' : 'This account has associated records and cannot be deleted. Deactivate it instead.') : reason.message || 'Request failed'),
  });
  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => users.update(id, { isActive }),
    onSuccess: () => { setError(''); void queryClient.invalidateQueries({ queryKey: ['account-users'] }); },
    onError: (reason: Error) => setError(reason.message || 'Request failed'),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!form.roleId || (selectedRole?.name !== 'super_admin' && !form.branchId)) {
      setError(isRtl ? 'اختر الدور والفرع المطلوبين.' : 'Select a role and required branch.');
      return;
    }
    createUser.mutate();
  };

  const branchName = (branch: { nameAr: string; nameEn: string }) => isRtl ? branch.nameAr : branch.nameEn;
  const startEdit = (user: UserListItem) => { setEditing(user); setError(''); setEditForm({ name: user.name, email: user.email, phone: user.phone ?? '', whatsappSenderNumber: user.whatsappSenderNumber ?? '', roleId: user.role.id, branchId: user.branch?.id ?? null, lang: user.lang ?? lang, isActive: user.isActive }); };
  const editRole = roleQuery.data?.find((role) => role.id === editForm.roleId);

  return <section className="desktop-page accounts-page" dir={isRtl ? 'rtl' : 'ltr'}>
    <div className="page-heading accounts-heading"><div><span className="eyebrow">{isRtl ? 'إدارة الوصول' : 'Access management'}</span><h1>{isRtl ? 'إدارة الحسابات' : 'Account management'}</h1><p>{isRtl ? 'حسابات الموظفين والأدوار والفروع.' : 'Staff accounts, roles, and branch assignments.'}</p></div><div className="accounts-heading-actions"><button className="secondary-action" onClick={() => void userQuery.refetch()}><RefreshCw size={16} /> {isRtl ? 'تحديث' : 'Refresh'}</button><button className="primary-action" onClick={() => { setShowCreate(value => !value); setError(''); }}><UserPlus size={16} /> {showCreate ? (isRtl ? 'إغلاق' : 'Close') : (isRtl ? 'إنشاء حساب' : 'Create account')}</button></div></div>
    <div className={`account-layout ${showCreate ? 'has-create-form' : 'directory-only'}`}>
      {showCreate && <form className="surface-panel account-form account-create-panel" onSubmit={submit}>
        <div className="panel-heading"><div><span className="eyebrow">{isRtl ? 'حساب جديد' : 'New account'}</span><h2>{isRtl ? 'إنشاء حساب' : 'Create account'}</h2></div><UserPlus size={20} /></div>
        <label className="input-label">{isRtl ? 'الاسم' : 'Name'}<input className="pos-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
        <label className="input-label">{isRtl ? 'البريد الإلكتروني' : 'Email'}<input className="pos-input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
        <label className="input-label">{isRtl ? 'كلمة المرور' : 'Password'}<input className="pos-input" type="password" minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label>
        <label className="input-label">{isRtl ? 'رقم واتساب الإرسال' : 'WhatsApp sender number'}<input className="pos-input" value={form.whatsappSenderNumber} onChange={(event) => setForm({ ...form, whatsappSenderNumber: event.target.value })} /></label>
        <label className="input-label">{isRtl ? 'الدور' : 'Role'}<select className="pos-input" value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value, branchId: '' })} required><option value="">{isRtl ? 'اختر الدور' : 'Select role'}</option>{roleQuery.data?.filter((role) => role.name !== 'customer').map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
        {selectedRole?.name !== 'super_admin' && <label className="input-label">{isRtl ? 'الفرع' : 'Branch'}<select className="pos-input" value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })} required><option value="">{isRtl ? 'اختر الفرع' : 'Select branch'}</option>{branchQuery.data?.items.map((branch) => <option key={branch.id} value={branch.id}>{branchName(branch)}</option>)}</select></label>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="primary-action" type="submit" disabled={createUser.isPending}>{createUser.isPending ? (isRtl ? 'جاري الإنشاء...' : 'Creating...') : (isRtl ? 'إنشاء الحساب' : 'Create account')}</button>
      </form>}
      <div className="surface-panel accounts-directory-panel"><div className="panel-heading"><div><span className="eyebrow">{isRtl ? 'الموظفون' : 'Staff directory'}</span><h2>{isRtl ? 'الحسابات الحالية' : 'Existing accounts'}</h2></div><span className="result-count">{userQuery.data?.total ?? 0}</span></div>{userQuery.isLoading && <div className="state-panel">{isRtl ? 'جاري التحميل...' : 'Loading...'}</div>}{userQuery.isError && <div className="state-panel" role="alert">{isRtl ? 'تعذر تحميل الحسابات.' : 'Could not load accounts.'}</div>}{!userQuery.isLoading && !userQuery.isError && <div className="customer-list accounts-grid">{userQuery.data?.items.map((user) => <article className="customer-row account-grid-card" key={user.id}><div className="customer-avatar"><UserPlus size={18} /></div><div className="customer-main"><strong>{user.name}</strong><span>{user.email}</span></div><div className="customer-stats"><span>{user.role.name}</span><span>{user.branch ? branchName(user.branch) : (isRtl ? 'كل الفروع' : 'All branches')}</span><span>{user.isActive ? (isRtl ? 'نشط' : 'Active') : (isRtl ? 'غير نشط' : 'Inactive')}</span></div><div className="row-actions"><button className="icon-button" title={isRtl ? 'تعديل' : 'Edit'} onClick={() => startEdit(user)}><Edit3 size={15} /></button><button className="icon-button" title={user.isActive ? (isRtl ? 'تعطيل' : 'Deactivate') : (isRtl ? 'تفعيل' : 'Reactivate')} onClick={() => toggleActive.mutate({ id: user.id, isActive: !user.isActive })}><Power size={15} /></button><button className="icon-button" title={isRtl ? 'حذف' : 'Delete'} onClick={() => { if (window.confirm(isRtl ? 'حذف هذا الحساب؟' : 'Delete this account?')) deleteUser.mutate(user.id); }}><Trash2 size={15} /></button></div></article>)}</div>}</div>
    </div>
    {editing && <div className="modal-backdrop"><form className="payment-modal" onSubmit={(event) => { event.preventDefault(); updateUser.mutate(); }}><div className="panel-heading"><h2>{isRtl ? 'تعديل الحساب' : 'Edit account'}</h2><button type="button" className="drawer-close" onClick={() => setEditing(null)}><X size={17} /></button></div><label className="input-label">{isRtl ? 'الاسم' : 'Name'}<input className="pos-input" required value={editForm.name ?? ''} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></label><label className="input-label">{isRtl ? 'البريد الإلكتروني' : 'Email'}<input className="pos-input" type="email" required value={editForm.email ?? ''} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} /></label><label className="input-label">{isRtl ? 'الهاتف' : 'Phone'}<input className="pos-input" value={editForm.phone ?? ''} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} /></label><label className="input-label">WhatsApp<input className="pos-input" value={editForm.whatsappSenderNumber ?? ''} onChange={(event) => setEditForm({ ...editForm, whatsappSenderNumber: event.target.value })} /></label><label className="input-label">{isRtl ? 'الدور' : 'Role'}<select className="pos-input" value={editForm.roleId ?? ''} onChange={(event) => setEditForm({ ...editForm, roleId: event.target.value, branchId: '' })}>{roleQuery.data?.filter((role) => role.name !== 'customer').map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>{editRole?.name !== 'super_admin' && <label className="input-label">{isRtl ? 'الفرع' : 'Branch'}<select className="pos-input" value={editForm.branchId ?? ''} onChange={(event) => setEditForm({ ...editForm, branchId: event.target.value })} required><option value="">{isRtl ? 'اختر الفرع' : 'Select branch'}</option>{branchQuery.data?.items.map((branch) => <option key={branch.id} value={branch.id}>{branchName(branch)}</option>)}</select></label>}<label className="input-label">{isRtl ? 'اللغة' : 'Language'}<select className="pos-input" value={editForm.lang ?? lang} onChange={(event) => setEditForm({ ...editForm, lang: event.target.value as 'ar' | 'en' })}><option value="en">English</option><option value="ar">العربية</option></select></label>{error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-action" onClick={() => setEditing(null)}>{isRtl ? 'إلغاء' : 'Cancel'}</button><button className="primary-action" disabled={updateUser.isPending}>{isRtl ? 'حفظ' : 'Save'}</button></div></form></div>}
  </section>;
}
