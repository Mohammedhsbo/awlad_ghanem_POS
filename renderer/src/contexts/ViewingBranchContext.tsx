import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { DesktopUser, BranchSummary } from '../api';

interface ViewingBranchContextValue {
  viewingBranchId: string | null;
  setViewingBranchId: (branchId: string | null) => void;
  isSuperAdmin: boolean;
}

const ViewingBranchContext = createContext<ViewingBranchContextValue | null>(null);

export function ViewingBranchProvider({ user, children }: { user: DesktopUser; children: ReactNode }) {
  const isSuperAdmin = user.role.name === 'super_admin';
  const storageKey = `pos_viewing_branch_${user.id}`;
  const [viewingBranchId, setViewingBranchIdState] = useState<string | null>(() => {
    if (!isSuperAdmin) return user.branchId ?? null;
    return sessionStorage.getItem(storageKey) || null;
  });

  useEffect(() => {
    const stored = isSuperAdmin ? sessionStorage.getItem(storageKey) : null;
    setViewingBranchIdState(isSuperAdmin ? stored : user.branchId ?? null);
  }, [isSuperAdmin, storageKey, user.branchId]);

  const setViewingBranchId = (branchId: string | null) => {
    if (!isSuperAdmin) return;
    setViewingBranchIdState(branchId);
    if (branchId) sessionStorage.setItem(storageKey, branchId);
    else sessionStorage.removeItem(storageKey);
  };

  return <ViewingBranchContext.Provider value={{ viewingBranchId, setViewingBranchId, isSuperAdmin }}>{children}</ViewingBranchContext.Provider>;
}

export function useViewingBranch() {
  const context = useContext(ViewingBranchContext);
  if (!context) throw new Error('useViewingBranch must be used inside ViewingBranchProvider');
  return context;
}

export type { BranchSummary };
