import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, LogIn, LogOut, RefreshCw, Calendar, User } from 'lucide-react';
import { attendance, users, type AttendanceRecord, type DesktopUser } from '../api';

type Lang = 'en' | 'ar';

function formatDate(iso: string, isRtl: boolean) {
  return new Date(iso).toLocaleDateString(isRtl ? 'ar-EG' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatTime(iso: string, isRtl: boolean) {
  return new Date(iso).toLocaleTimeString(isRtl ? 'ar-EG' : 'en-GB', {
    hour: '2-digit', minute: '2-digit',
  });
}

function duration(checkIn: string, checkOut: string | null): string {
  if (!checkOut) return '—';
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

function AttendanceTable({ records, isRtl }: { records: AttendanceRecord[]; isRtl: boolean }) {
  if (records.length === 0) {
    return <div className="empty-state">{isRtl ? 'لا توجد سجلات حضور.' : 'No attendance records found.'}</div>;
  }

  return (
    <div className="audit-table-shell">
      <table className="audit-table">
        <thead>
          <tr>
            <th>{isRtl ? 'الموظف' : 'Employee'}</th>
            <th>{isRtl ? 'التاريخ' : 'Date'}</th>
            <th>{isRtl ? 'تسجيل دخول' : 'Check-in'}</th>
            <th>{isRtl ? 'تسجيل خروج' : 'Check-out'}</th>
            <th>{isRtl ? 'المدة' : 'Duration'}</th>
            <th>{isRtl ? 'الفرع' : 'Branch'}</th>
            <th>{isRtl ? 'الحالة' : 'Status'}</th>
            <th>{isRtl ? 'ملاحظات' : 'Notes'}</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className={!r.checkOut ? 'audit-row-open' : ''}>
              <td>
                <div className="audit-user-meta">
                  <span className="audit-avatar">{r.userName?.charAt(0)?.toUpperCase() ?? 'U'}</span>
                  <div>
                    <strong>{r.userName}</strong>
                    <span>{r.userEmail}</span>
                  </div>
                </div>
              </td>
              <td>{formatDate(r.checkIn, isRtl)}</td>
              <td>
                <span className="audit-time audit-time-in">{formatTime(r.checkIn, isRtl)}</span>
              </td>
              <td>
                {r.checkOut
                  ? <span className="audit-time audit-time-out">{formatTime(r.checkOut, isRtl)}</span>
                  : <span className="audit-pill audit-pill-open">{isRtl ? 'حاضر' : 'Active'}</span>}
              </td>
              <td>{duration(r.checkIn, r.checkOut)}</td>
              <td>{isRtl ? (r.branchNameAr ?? '—') : (r.branchNameEn ?? '—')}</td>
              <td>
                <span className={`audit-pill ${r.checkOut ? 'audit-pill-closed' : 'audit-pill-open'}`}>
                  {r.checkOut ? (isRtl ? 'منتهي' : 'Closed') : (isRtl ? 'قيد التشغيل' : 'Open')}
                </span>
              </td>
              <td><span className="audit-notes">{r.notes ?? '—'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Attendance({ lang, user }: { lang: Lang; user: DesktopUser }) {
  const isRtl = lang === 'ar';
  const isSuperAdmin = user.role.name === 'super_admin';
  const queryClient = useQueryClient();

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  // ── Own attendance ────────────────────────────────────────
  const myQuery = useQuery({
    queryKey: ['my-attendance', startDate, endDate],
    queryFn: () => attendance.getMe({ startDate: startDate || undefined, endDate: endDate || undefined, limit: 50 }),
    enabled: !isSuperAdmin,
  });

  // ── Admin: all attendance ────────────────────────────────
  const adminQuery = useQuery({
    queryKey: ['all-attendance', selectedUserId, startDate, endDate],
    queryFn: () => attendance.listAll({ userId: selectedUserId || undefined, startDate: startDate || undefined, endDate: endDate || undefined, limit: 100 }),
    enabled: isSuperAdmin,
  });

  // ── Check current open record ─────────────────────────────
  const openRecordQuery = useQuery({
    queryKey: ['my-open-attendance'],
    queryFn: () => attendance.getMe({ limit: 1 }),
  });
  const openRecord = openRecordQuery.data?.items.find((r) => !r.checkOut) ?? null;

  // ── User list for admin selector ─────────────────────────
  const usersQuery = useQuery({
    queryKey: ['account-users'],
    queryFn: users.list,
    enabled: isSuperAdmin,
  });

  // ── Mutations ────────────────────────────────────────────
  const checkInMut = useMutation({
    mutationFn: () => attendance.checkIn(notes || undefined),
    onSuccess: () => {
      setError('');
      setNotes('');
      void queryClient.invalidateQueries({ queryKey: ['my-attendance'] });
      void queryClient.invalidateQueries({ queryKey: ['my-open-attendance'] });
      void queryClient.invalidateQueries({ queryKey: ['all-attendance'] });
    },
    onError: (err: Error & { code?: string }) =>
      setError(err.message || err.code || (isRtl ? 'حدث خطأ.' : 'An error occurred.')),
  });

  const checkOutMut = useMutation({
    mutationFn: () => attendance.checkOut(notes || undefined),
    onSuccess: () => {
      setError('');
      setNotes('');
      void queryClient.invalidateQueries({ queryKey: ['my-attendance'] });
      void queryClient.invalidateQueries({ queryKey: ['my-open-attendance'] });
      void queryClient.invalidateQueries({ queryKey: ['all-attendance'] });
    },
    onError: (err: Error & { code?: string }) =>
      setError(err.message || err.code || (isRtl ? 'حدث خطأ.' : 'An error occurred.')),
  });

  const records = isSuperAdmin
    ? (adminQuery.data?.items ?? [])
    : (myQuery.data?.items ?? []);

  const isLoading = isSuperAdmin ? adminQuery.isLoading : myQuery.isLoading;
  const isQueryError = isSuperAdmin ? adminQuery.isError : myQuery.isError;

  return (
    <section className="desktop-page audit-shell" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="page-heading audit-header">
        <div>
          <span className="eyebrow">{isRtl ? 'متابعة الحضور' : 'Time tracking'}</span>
          <h1>{isRtl ? 'الحضور والانصراف' : 'Attendance'}</h1>
          <p>
            {isRtl
              ? 'سجّل حضورك وانصرافك واستعرض تقارير الحضور.'
              : 'Record your check-in and check-out, and view attendance reports.'}
          </p>
        </div>
        <button
          className="secondary-action"
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ['my-attendance'] });
            void queryClient.invalidateQueries({ queryKey: ['all-attendance'] });
            void queryClient.invalidateQueries({ queryKey: ['my-open-attendance'] });
          }}
        >
          <RefreshCw size={16} /> {isRtl ? 'تحديث' : 'Refresh'}
        </button>
      </div>

      <div className="surface-panel audit-card audit-clock-card">
        <div className="panel-heading audit-panel-heading">
          <div>
            <span className="eyebrow">{isRtl ? 'الوقت الحالي' : 'Clock'}</span>
            <h2>
              <Clock size={18} />
              {new Date().toLocaleTimeString(isRtl ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
            </h2>
          </div>
          {openRecord && (
            <div className="attendance-open-info">
              <span className="audit-pill audit-pill-open audit-pill-large">
                {isRtl ? 'حاضر منذ' : 'Clocked in since'} {formatTime(openRecord.checkIn, isRtl)}
              </span>
            </div>
          )}
        </div>

        <div className="audit-toolbar-grid">
          <label className="input-label audit-input-label">
            {isRtl ? 'ملاحظة (اختياري)' : 'Note (optional)'}
            <input
              className="pos-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isRtl ? 'أضف ملاحظة...' : 'Add a note...'}
            />
          </label>
          <button
            id="btn-check-in"
            className="primary-action audit-primary-action audit-primary-action-success"
            disabled={!!openRecord || checkInMut.isPending}
            onClick={() => checkInMut.mutate()}
          >
            <LogIn size={17} />
            {checkInMut.isPending ? (isRtl ? 'جاري...' : 'Clocking in...') : (isRtl ? 'تسجيل دخول' : 'Check In')}
          </button>
          <button
            id="btn-check-out"
            className="primary-action audit-primary-action audit-primary-action-danger"
            disabled={!openRecord || checkOutMut.isPending}
            onClick={() => checkOutMut.mutate()}
          >
            <LogOut size={17} />
            {checkOutMut.isPending ? (isRtl ? 'جاري...' : 'Clocking out...') : (isRtl ? 'تسجيل خروج' : 'Check Out')}
          </button>
        </div>

        {error && <div className="form-error" role="alert" style={{ marginTop: '0.75rem' }}>{error}</div>}
      </div>

      <div className="surface-panel audit-filters">
        {isSuperAdmin && (
          <label className="input-label audit-input-label audit-input-flex">
            <span><User size={14} />{isRtl ? 'الموظف' : 'Employee'}</span>
            <select
              className="pos-input"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">{isRtl ? 'كل الموظفين' : 'All employees'}</option>
              {(usersQuery.data?.items ?? []).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="input-label audit-input-label audit-input-flex">
          <span><Calendar size={14} />{isRtl ? 'من' : 'From'}</span>
          <input type="date" className="pos-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="input-label audit-input-label audit-input-flex">
          <span><Calendar size={14} />{isRtl ? 'إلى' : 'To'}</span>
          <input type="date" className="pos-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <button
          className="secondary-action"
          onClick={() => { setStartDate(''); setEndDate(''); setSelectedUserId(''); }}
        >
          {isRtl ? 'مسح الفلاتر' : 'Clear filters'}
        </button>
      </div>

      <div className="panel-heading audit-table-heading">
        <div>
          <span className="eyebrow">{isRtl ? 'التقرير' : 'Report'}</span>
          <h2>{isRtl ? 'سجل الحضور' : 'Attendance log'}</h2>
        </div>
        <span className="result-count">{records.length}</span>
      </div>

      {isLoading && <div className="state-panel">{isRtl ? 'جاري التحميل...' : 'Loading...'}</div>}
      {isQueryError && <div className="state-panel" role="alert">{isRtl ? 'تعذر تحميل البيانات.' : 'Could not load records.'}</div>}
      {!isLoading && !isQueryError && <AttendanceTable records={records} isRtl={isRtl} />}
    </section>
  );
}
