import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3, Pencil, Plus, RefreshCw, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { installmentDurations, type InstallmentDurationRecord } from '../api';

type Lang = 'en' | 'ar';

export default function InstallmentDurations({ lang }: { lang: Lang }) {
  const isRtl = lang === 'ar';
  const queryClient = useQueryClient();
  const [months, setMonths] = useState('12');
  const [editing, setEditing] = useState<InstallmentDurationRecord | null>(null);
  const query = useQuery({ queryKey: ['desktop-installment-durations'], queryFn: installmentDurations.listAll });
  const save = useMutation({
    mutationFn: () => editing
      ? installmentDurations.update(editing.id, { months: Number(months) })
      : installmentDurations.create({ months: Number(months), isActive: true, sortOrder: 0 }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['desktop-installment-durations'] }); setEditing(null); setMonths('12'); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => installmentDurations.remove(id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['desktop-installment-durations'] }); },
  });
  const toggle = useMutation({
    mutationFn: (duration: InstallmentDurationRecord) => installmentDurations.update(duration.id, { isActive: !duration.isActive }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['desktop-installment-durations'] }); },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (Number(months) > 0) save.mutate();
  };

  return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Premium Header */}
      <div className="premium-page-header" style={{ marginBottom: '2rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span style={{ color: '#bfdbfe', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{isRtl ? 'إعدادات التقسيط' : 'Installment settings'}</span>
          <h1 style={{ margin: '0.3rem 0 0.5rem', color: 'white' }}>{isRtl ? 'مدد التقسيط' : 'Installment Durations'}</h1>
          <p>{isRtl ? 'إدارة المدد التي تظهر في نموذج الاستعلام.' : 'Manage durations available in the inquiry form.'}</p>
        </div>
        <Clock3 size={80} style={{ opacity: 0.1, position: 'absolute', insetInlineEnd: '2.5rem', top: '50%', transform: 'translateY(-50%)', zIndex: 0 }} />
      </div>

      {/* Add / Edit Form */}
      <div className="premium-glass-panel" style={{ marginBottom: '2rem' }}>
        <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.05rem', color: 'var(--blue-dark)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {editing ? <Pencil size={18} /> : <Plus size={18} />}
          {editing ? (isRtl ? 'تعديل المدة' : 'Edit Duration') : (isRtl ? 'إضافة مدة جديدة' : 'Add New Duration')}
        </h2>
        <form onSubmit={submit} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', minWidth: 200 }}>
            {isRtl ? 'المدة بالأشهر' : 'Duration in months'}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 0.75rem', border: '1px solid #bfdbfe', borderRadius: '10px', background: 'white', minHeight: 44 }}>
              <Clock3 size={16} style={{ color: 'var(--blue)', flexShrink: 0 }} />
              <input
                type="number" min="1" max="120" required value={months}
                onChange={event => setMonths(event.target.value)}
                style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, fontSize: '0.95rem', color: 'var(--text-primary)' }}
              />
            </div>
          </label>
          <button className="premium-action-btn solid" type="submit" disabled={save.isPending}>
            {editing ? <Pencil size={16} /> : <Plus size={16} />}
            {editing ? (isRtl ? 'تحديث' : 'Update') : (isRtl ? 'إضافة' : 'Add')}
          </button>
          {editing && (
            <button className="premium-action-btn outline" type="button" onClick={() => { setEditing(null); setMonths('12'); }}>
              {isRtl ? 'إلغاء' : 'Cancel'}
            </button>
          )}
        </form>
      </div>

      {/* Durations List */}
      <div className="premium-glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)', fontWeight: 700 }}>{isRtl ? 'المدد المتاحة' : 'Available Durations'}</h2>
          <button className="premium-action-btn outline" onClick={() => query.refetch()} title={isRtl ? 'تحديث' : 'Refresh'} style={{ padding: '0.45rem' }}>
            <RefreshCw size={16} />
          </button>
        </div>

        {query.isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120, gap: '0.75rem', color: 'var(--blue)' }}>
            <div className="spinner" />{isRtl ? 'جاري التحميل...' : 'Loading...'}
          </div>
        )}

        {!query.isLoading && (query.data ?? []).length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
            <Clock3 size={48} style={{ opacity: 0.25, marginBottom: '0.75rem', color: 'var(--blue)' }} />
            <p style={{ margin: 0 }}>{isRtl ? 'لا توجد مدد بعد.' : 'No durations yet.'}</p>
          </div>
        )}

        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {!query.isLoading && (query.data ?? []).map(duration => (
            <div
              key={duration.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem 1.25rem',
                borderRadius: '14px',
                border: `1px solid ${duration.isActive ? '#bfdbfe' : '#e2e8f0'}`,
                background: duration.isActive ? 'linear-gradient(135deg, #f8fbff, #eff6ff)' : '#f8fafc',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 16px rgba(37,99,235,0.1)'; (e.currentTarget as HTMLElement).style.transform = 'translateX(2px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = ''; (e.currentTarget as HTMLElement).style.transform = ''; }}
            >
              <div style={{ width: 44, height: 44, borderRadius: '12px', background: duration.isActive ? 'linear-gradient(135deg, #1d4ed8, #3b82f6)' : '#e2e8f0', display: 'grid', placeItems: 'center', color: duration.isActive ? 'white' : 'var(--text-tertiary)', flexShrink: 0, boxShadow: duration.isActive ? '0 4px 12px rgba(37,99,235,0.25)' : 'none' }}>
                <Clock3 size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <strong style={{ display: 'block', fontSize: '1.05rem', fontWeight: 800, color: duration.isActive ? 'var(--blue-dark)' : 'var(--text-secondary)' }}>
                  {duration.months} {isRtl ? 'شهر' : 'months'}
                </strong>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem', fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '99px', background: duration.isActive ? '#dcfce7' : '#f1f5f9', color: duration.isActive ? '#15803d' : '#64748b' }}>
                  {duration.isActive ? <CheckCircle size={11} /> : <XCircle size={11} />}
                  {duration.isActive ? (isRtl ? 'مفعلة' : 'Active') : (isRtl ? 'معطلة' : 'Inactive')}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button className="premium-action-btn outline" style={{ padding: '0.45rem' }} onClick={() => { setEditing(duration); setMonths(String(duration.months)); }} title={isRtl ? 'تعديل' : 'Edit'}>
                  <Pencil size={15} />
                </button>
                <button
                  className="premium-action-btn outline"
                  style={duration.isActive ? { borderColor: '#fca5a5', color: '#dc2626' } : { borderColor: '#6ee7b7', color: '#059669' }}
                  onClick={() => toggle.mutate(duration)}
                >
                  {duration.isActive ? (isRtl ? 'تعطيل' : 'Disable') : (isRtl ? 'تفعيل' : 'Enable')}
                </button>
                <button className="premium-action-btn danger-outline" style={{ padding: '0.45rem' }} onClick={() => { if (window.confirm(isRtl ? 'حذف هذه المدة؟' : 'Delete this duration?')) remove.mutate(duration.id); }} title={isRtl ? 'حذف' : 'Delete'}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

