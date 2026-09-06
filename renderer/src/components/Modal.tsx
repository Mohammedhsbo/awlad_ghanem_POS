import { type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  isOpen?: boolean;
  footer?: ReactNode;
  wide?: boolean;
  lang?: 'en' | 'ar';
}

export default function Modal({ title, onClose, children, isOpen = true, footer, wide, lang = 'en' }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: wide ? 720 : 500 }}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: '1.125rem' }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'ar' ? 'إغلاق النافذة' : 'Close dialog'}
            title={lang === 'ar' ? 'إغلاق النافذة' : 'Close dialog'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: '0.25rem',
              borderRadius: 'var(--radius-sm)', transition: 'var(--transition)',
            }}
          >
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
