type BadgeVariant = 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled' | 'initiated' | 'in_transit' | 'active' | 'inactive' | 'confirmed' | 'processing' | 'awaiting_delivery' | 'completed' | 'refunded' | 'expired' | 'converted' | 'issued' | 'partially_paid' | 'paid' | 'overpaid' | 'pending' | 'failed' | 'partially_refunded' | 'defaulted' | 'upcoming' | 'due' | 'overdue';

const labelMap: Record<BadgeVariant, { en: string; ar: string }> = {
  draft: { en: 'Draft', ar: 'مسودة' },
  ordered: { en: 'Ordered', ar: 'مطلوب' },
  partially_received: { en: 'Partial', ar: 'جزئي' },
  received: { en: 'Received', ar: 'مستلم' },
  cancelled: { en: 'Cancelled', ar: 'ملغي' },
  initiated: { en: 'Initiated', ar: 'مبدأي' },
  in_transit: { en: 'In Transit', ar: 'قيد النقل' },
  active: { en: 'Active', ar: 'نشط' },
  inactive: { en: 'Inactive', ar: 'غير نشط' },
  confirmed: { en: 'Confirmed', ar: 'مؤكد' },
  processing: { en: 'Processing', ar: 'قيد المعالجة' },
  awaiting_delivery: { en: 'Awaiting Delivery', ar: 'في انتظار التسليم' },
  completed: { en: 'Completed', ar: 'مكتمل' },
  refunded: { en: 'Refunded', ar: 'مسترد' },
  expired: { en: 'Expired', ar: 'منتهي' },
  converted: { en: 'Converted', ar: 'محول' },
  issued: { en: 'Issued', ar: 'صادرة' },
  partially_paid: { en: 'Partially Paid', ar: 'مدفوعة جزئيًا' },
  paid: { en: 'Paid', ar: 'مدفوعة' },
  overpaid: { en: 'Overpaid', ar: 'مدفوعة زيادة' },
  pending: { en: 'Pending', ar: 'معلقة' },
  failed: { en: 'Failed', ar: 'فشلت' },
  partially_refunded: { en: 'Partial Refund', ar: 'استرداد جزئي' },
  defaulted: { en: 'Defaulted', ar: 'متعثر' },
  upcoming: { en: 'Upcoming', ar: 'قادم' },
  due: { en: 'Due', ar: 'مستحق' },
  overdue: { en: 'Overdue', ar: 'متأخر' },
};

interface BadgeProps {
  status: BadgeVariant;
  lang?: 'en' | 'ar';
  label?: string;
}

export default function Badge({ status, lang = 'en', label: customLabel }: BadgeProps) {
  const label = customLabel ?? labelMap[status]?.[lang] ?? status;
  return (
    <span className={`badge badge-${status}`}>{label}</span>
  );
}
