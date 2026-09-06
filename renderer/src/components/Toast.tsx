import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

interface ToastEventDetail {
  message: string;
  type?: ToastType;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function emitToast(message: string, type: ToastType = 'error') {
  window.dispatchEvent(new CustomEvent<ToastEventDetail>('desktop-toast', { detail: { message, type } }));
}

function ToastMessage({ toast, onClose, lang }: { toast: ToastItem; onClose: () => void; lang: 'en' | 'ar' }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 5000);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'warning' ? TriangleAlert : toast.type === 'info' ? Info : TriangleAlert;
  return (
    <div className={`desktop-toast desktop-toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
      <Icon size={19} aria-hidden="true" />
      <span>{toast.message}</span>
      <button type="button" className="desktop-toast-close" onClick={onClose} aria-label={lang === 'ar' ? 'إغلاق الإشعار' : 'Close notification'} title={lang === 'ar' ? 'إغلاق الإشعار' : 'Close notification'}>
        <X size={16} />
      </button>
    </div>
  );
}

export function ToastProvider({ children, lang }: { children: ReactNode; lang: 'en' | 'ar' }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastEventDetail>).detail;
      if (detail?.message) setToasts(current => [...current, { id: Date.now() + Math.random(), message: detail.message, type: detail.type ?? 'error' }]);
    };
    window.addEventListener('desktop-toast', handleToast);
    return () => window.removeEventListener('desktop-toast', handleToast);
  }, []);

  const showToast = (message: string, type: ToastType = 'error') => {
    setToasts(current => [...current, { id: Date.now() + Math.random(), message, type }]);
  };
  const dismissToast = (id: number) => setToasts(current => current.filter(toast => toast.id !== id));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="desktop-toast-region" aria-live="polite">
        {toasts.map(toast => <ToastMessage key={toast.id} toast={toast} lang={lang} onClose={() => dismissToast(toast.id)} />)}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
