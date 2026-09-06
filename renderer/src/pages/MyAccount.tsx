import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { users } from '../api';

export default function MyAccount({ lang }: { lang: 'en' | 'ar' }) {
  const isRtl = lang === 'ar';
  const profile = useQuery({ queryKey: ['my-account'], queryFn: users.me });
  const [form, setForm] = useState({ name: '', phone: '', whatsappSenderNumber: '', currentPassword: '', newPassword: '', confirmPassword: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile.data) return;
    setForm((current) => ({ ...current, name: profile.data.name, phone: profile.data.phone ?? '', whatsappSenderNumber: profile.data.whatsappSenderNumber ?? '' }));
  }, [profile.data]);

  const update = useMutation({
    mutationFn: () => users.updateMe({
      name: form.name,
      phone: form.phone || undefined,
      whatsappSenderNumber: form.whatsappSenderNumber || undefined,
      ...(form.newPassword ? { currentPassword: form.currentPassword, newPassword: form.newPassword } : {}),
    }),
    onSuccess: () => {
      setMessage(isRtl ? 'تم حفظ التغييرات.' : 'Changes saved.');
      setError('');
      setForm((current) => ({ ...current, currentPassword: '', newPassword: '', confirmPassword: '' }));
      void profile.refetch();
    },
    onError: (reason: Error & { code?: string }) => {
      setError(reason.message || reason.code || (isRtl ? 'تعذر حفظ التغييرات.' : 'Could not save changes.'));
      setMessage('');
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (form.newPassword && form.newPassword !== form.confirmPassword) {
      setError(isRtl ? 'كلمتا المرور الجديدتان غير متطابقتين.' : 'New passwords do not match.');
      return;
    }
    if (form.newPassword && !form.currentPassword) {
      setError(isRtl ? 'أدخل كلمة المرور الحالية.' : 'Enter your current password.');
      return;
    }
    update.mutate();
  };

  return <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
    <div className="page-heading"><div><span className="eyebrow">{isRtl ? 'الملف الشخصي' : 'Profile'}</span><h1>{isRtl ? 'حسابي' : 'My account'}</h1><p>{isRtl ? 'حدّث بياناتك وكلمة المرور.' : 'Update your details and password.'}</p></div></div>
    {profile.isLoading && <div className="state-panel">{isRtl ? 'جاري التحميل...' : 'Loading...'}</div>}
    {profile.isError && <div className="state-panel" role="alert">{isRtl ? 'تعذر تحميل الحساب.' : 'Could not load account.'}</div>}
    {profile.data && <form className="surface-panel account-form my-account-form" onSubmit={submit}>
      <label className="input-label">{isRtl ? 'الاسم' : 'Name'}<input className="pos-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
      <label className="input-label">{isRtl ? 'البريد الإلكتروني' : 'Email'}<input className="pos-input" value={profile.data.email} disabled /></label>
      <label className="input-label">{isRtl ? 'رقم الهاتف' : 'Phone'}<input className="pos-input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
      <label className="input-label">{isRtl ? 'رقم واتساب الإرسال' : 'WhatsApp sender number'}<input className="pos-input" value={form.whatsappSenderNumber} onChange={(event) => setForm({ ...form, whatsappSenderNumber: event.target.value })} /></label>
      <div className="account-section"><h2>{isRtl ? 'تغيير كلمة المرور' : 'Change password'}</h2><label className="input-label">{isRtl ? 'كلمة المرور الحالية' : 'Current password'}<input className="pos-input" type="password" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} /></label><label className="input-label">{isRtl ? 'كلمة المرور الجديدة' : 'New password'}<input className="pos-input" type="password" minLength={8} value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} /></label><label className="input-label">{isRtl ? 'تأكيد كلمة المرور' : 'Confirm password'}<input className="pos-input" type="password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} /></label></div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {message && <div className="form-success" role="status">{message}</div>}
      <button className="primary-action" type="submit" disabled={update.isPending}><Save size={16} />{update.isPending ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'حفظ التغييرات' : 'Save changes')}</button>
    </form>}
  </section>;
}
