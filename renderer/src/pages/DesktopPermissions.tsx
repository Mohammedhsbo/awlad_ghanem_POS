import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Save, RotateCcw, Shield, ChevronDown, ChevronUp } from 'lucide-react';
import { users, desktopPermissions, type DesktopPagePermission, type UserListItem } from '../api';

type Lang = 'en' | 'ar';

/** Human-readable labels for every controllable page key */
const PAGE_LABELS: Record<string, { en: string; ar: string }> = {
  pos:                  { en: 'Point of Sale (POS)', ar: 'نقطة البيع' },
  dashboard:            { en: 'Dashboard', ar: 'لوحة التحكم' },
  sales:                { en: 'Sales', ar: 'المبيعات' },
  'pos-installments':   { en: 'POS Installments', ar: 'أقساط المبيعات' },
  orders:               { en: 'Orders', ar: 'الطلبات' },
  reservations:         { en: 'Reservations / Bookings', ar: 'الحجوزات' },
  'offline-sync':       { en: 'Offline Sync', ar: 'المزامنة' },
  history:              { en: 'Transaction History', ar: 'سجل المعاملات' },
  inventory:            { en: 'Inventory', ar: 'المخزون' },
  transfers:            { en: 'Transfers', ar: 'التحويلات' },
  customers:            { en: 'Customers', ar: 'العملاء' },
  inquiries:            { en: 'Inquiries', ar: 'الاستعلامات' },
  installments:         { en: 'Installments', ar: 'الأقساط' },
  reports:              { en: 'Reports', ar: 'التقارير' },
  notifications:        { en: 'Notifications', ar: 'الإشعارات' },
  suppliers:            { en: 'Suppliers', ar: 'الموردون' },
  'financing-companies':{ en: 'Financing Companies', ar: 'شركات التمويل' },
  printers:             { en: 'Printers', ar: 'الطابعات' },
};

function PermissionRow({
  perm,
  isRtl,
  onChange,
}: {
  perm: DesktopPagePermission;
  isRtl: boolean;
  onChange: (updated: DesktopPagePermission) => void;
}) {
  const label = PAGE_LABELS[perm.pageKey];
  return (
    <div className="perm-row">
      <span className="perm-page-label">{isRtl ? label?.ar : label?.en}</span>
      <div className="perm-toggles">
        <label className="perm-toggle-label">
          <span>{isRtl ? 'عرض' : 'View'}</span>
          <input
            type="checkbox"
            className="perm-toggle-input"
            checked={perm.canView}
            onChange={(e) => onChange({ ...perm, canView: e.target.checked, canEdit: e.target.checked ? perm.canEdit : false })}
          />
          <span className="perm-toggle-track" />
        </label>
        <label className="perm-toggle-label">
          <span>{isRtl ? 'تعديل' : 'Edit'}</span>
          <input
            type="checkbox"
            className="perm-toggle-input"
            checked={perm.canEdit}
            disabled={!perm.canView}
            onChange={(e) => onChange({ ...perm, canEdit: e.target.checked })}
          />
          <span className="perm-toggle-track" />
        </label>
      </div>
    </div>
  );
}

function UserPermissionPanel({
  user,
  lang,
  isRtl,
}: {
  user: UserListItem;
  lang: Lang;
  isRtl: boolean;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [localPerms, setLocalPerms] = useState<DesktopPagePermission[] | null>(null);
  const [saved, setSaved] = useState(false);

  const permQuery = useQuery<DesktopPagePermission[]>({
    queryKey: ['desktop-perms', user.id],
    queryFn: () => desktopPermissions.getForUser(user.id),
    enabled: expanded,
  });

  useEffect(() => {
    if (expanded && permQuery.data && localPerms === null) {
      setLocalPerms(permQuery.data);
    }
  }, [expanded, permQuery.data, localPerms]);

  const saveMut = useMutation({
    mutationFn: () => desktopPermissions.setForUser(user.id, localPerms!),
    onSuccess: (data) => {
      setLocalPerms(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      void queryClient.invalidateQueries({ queryKey: ['desktop-perms', user.id] });
    },
  });

  const resetMut = useMutation({
    mutationFn: () => desktopPermissions.resetForUser(user.id),
    onSuccess: () => {
      setLocalPerms(null);
      void queryClient.invalidateQueries({ queryKey: ['desktop-perms', user.id] });
    },
  });

  const perms: DesktopPagePermission[] = Array.isArray(localPerms)
    ? localPerms
    : Array.isArray(permQuery.data)
      ? permQuery.data
      : [];

  const handleChange = (updated: DesktopPagePermission) => {
  setLocalPerms((prev) => (Array.isArray(prev) ? prev.map((p) => (p.pageKey === updated.pageKey ? updated : p)) : []));
  setSaved(false);
};

  return (
    <div className={`perm-user-panel ${expanded ? 'is-expanded' : ''}`}>
      <button
        className="perm-user-header"
        onClick={() => { setExpanded((v) => !v); if (!localPerms && !expanded) setLocalPerms(null); }}
        aria-expanded={expanded}
      >
        <div className="perm-user-info">
          <strong>{user.name}</strong>
          <span>{user.email}</span>
          <span className="role-pill">{user.role.name}</span>
          {user.branch && (
            <span className="eyebrow">{isRtl ? user.branch.nameAr : user.branch.nameEn}</span>
          )}
        </div>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {expanded && (
        <div className="perm-panel-body">
          {permQuery.isLoading && <div className="state-panel">{isRtl ? 'جاري التحميل...' : 'Loading...'}</div>}
          {permQuery.isError && <div className="state-panel" role="alert">{isRtl ? 'تعذر تحميل الصلاحيات.' : 'Could not load permissions.'}</div>}
          {perms.length > 0 && (
            <>
              <div className="perm-rows">
                {perms.map((p) => (
                  <PermissionRow key={p.pageKey} perm={p} isRtl={isRtl} onChange={handleChange} />
                ))}
              </div>
              <div className="perm-actions">
                <button
                  className="secondary-action"
                  onClick={() => resetMut.mutate()}
                  disabled={resetMut.isPending}
                  title={isRtl ? 'إعادة تعيين الصلاحيات للوضع الافتراضي' : 'Reset all permissions to defaults'}
                >
                  <RotateCcw size={15} />
                  {isRtl ? 'إعادة التعيين' : 'Reset'}
                </button>
                <button
                  className="primary-action"
                  onClick={() => saveMut.mutate()}
                  disabled={saveMut.isPending || !localPerms}
                >
                  <Save size={15} />
                  {saved ? (isRtl ? 'تم الحفظ ✓' : 'Saved ✓') : saveMut.isPending ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'حفظ الصلاحيات' : 'Save permissions')}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function DesktopPermissions({ lang }: { lang: Lang }) {
  const isRtl = lang === 'ar';
  const [search, setSearch] = useState('');

  const userQuery = useQuery({
    queryKey: ['account-users'],
    queryFn: users.list,
  });

  const filteredUsers = (userQuery.data?.items ?? []).filter((u) => {
    if (u.role.name === 'super_admin') return false; // super_admin always has full access
    if (!search) return true;
    const s = search.toLowerCase();
    return u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s);
  });

  return (
    <section className="desktop-page permissions-page" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="page-heading permissions-heading">
        <div>
          <span className="eyebrow permissions-eyebrow"><Shield size={14} /> {isRtl ? 'ضبط الوصول' : 'Access control'}</span>
          <h1>{isRtl ? 'صلاحيات التطبيق' : 'Desktop Permissions'}</h1>
          <p>
            {isRtl
              ? 'حدد الصفحات والميزات التي يمكن لكل موظف الوصول إليها أو تعديلها.'
              : 'Set which pages and features each employee can view or edit in this desktop app.'}
          </p>
        </div>
        <button className="secondary-action permissions-refresh" onClick={() => void userQuery.refetch()}>
          <RefreshCw size={16} /> {isRtl ? 'تحديث' : 'Refresh'}
        </button>
      </div>

      <div className="permissions-toolbar">
        <div className="permissions-search-icon"><Shield size={18} /></div>
        <input
          className="pos-input permissions-search"
          placeholder={isRtl ? 'بحث باسم الموظف أو البريد...' : 'Search by name or email...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="result-count permissions-result-count">{filteredUsers.length}</span>
      </div>

      {userQuery.isLoading && <div className="state-panel">{isRtl ? 'جاري تحميل الموظفين...' : 'Loading employees...'}</div>}
      {userQuery.isError && <div className="state-panel" role="alert">{isRtl ? 'تعذر تحميل قائمة الموظفين.' : 'Could not load employees.'}</div>}

      {!userQuery.isLoading && filteredUsers.length === 0 && !userQuery.isError && (
        <div className="state-panel">{isRtl ? 'لا يوجد موظفون.' : 'No employees found.'}</div>
      )}

      <div className="permissions-directory">
        {filteredUsers.map((user) => (
          <UserPermissionPanel key={user.id} user={user} lang={lang} isRtl={isRtl} />
        ))}
      </div>
    </section>
  );
}
