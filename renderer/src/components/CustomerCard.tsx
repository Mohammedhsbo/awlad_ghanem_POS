import { User, Phone, Mail, MapPin } from 'lucide-react';
import type { CustomerSearchResult } from '../api';

type Lang = 'en' | 'ar';

const T = {
  en: {
    customer: 'Customer',
    noCustomer: 'No customer selected',
    selectPrompt: 'Search and select a customer for this sale',
  },
  ar: {
    customer: 'العميل',
    noCustomer: 'لم يتم اختيار عميل',
    selectPrompt: 'ابحث واختر عميلاً لهذه العملية',
  },
};

interface Props {
  customer: CustomerSearchResult | null;
  lang: Lang;
  compact?: boolean;
}

export default function CustomerCard({ customer, lang, compact }: Props) {
  const t = T[lang];

  if (!customer) {
    return (
      <div
        className="pos-card"
        style={{
          padding: '1rem',
          textAlign: 'center',
          border: '1px dashed var(--pos-border)',
        }}
      >
        <User size={28} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
          {t.noCustomer}
        </div>
        {!compact && (
          <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>
            {t.selectPrompt}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="pos-card"
      style={{
        padding: compact ? '0.75rem' : '1rem',
        border: '1px solid var(--pos-border-active)',
        background: 'rgba(37,99,235,0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div
          style={{
            width: compact ? 32 : 40,
            height: compact ? 32 : 40,
            borderRadius: '50%',
            background: 'var(--blue-glow)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <User size={compact ? 16 : 20} style={{ color: 'var(--blue-light)' }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: compact ? '0.85rem' : '0.95rem', marginBottom: '0.25rem' }}>
            {customer.name}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: '0.2rem' }}>
            <Phone size={12} style={{ flexShrink: 0 }} />
            <span style={{ fontFamily: 'monospace' }}>{customer.phone}</span>
          </div>

          {customer.email && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: '0.2rem' }}>
              <Mail size={12} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {customer.email}
              </span>
            </div>
          )}

          {customer.defaultAddress && !compact && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.7rem', color: 'var(--text-3)', marginTop: '0.4rem' }}>
              <MapPin size={12} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
              <span style={{ lineHeight: 1.3 }}>
                {customer.defaultAddress.addressLine}
                {customer.defaultAddress.city && `, ${customer.defaultAddress.city}`}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
