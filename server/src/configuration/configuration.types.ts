// SPEC-013: System Administration & Configuration Types

export enum ConfigScope {
  SYSTEM = 'system',
  COMPANY = 'company',
  BRANCH = 'branch',
  USER = 'user',
}

export enum ConfigDataType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  JSON = 'json',
  DATE = 'date',
}

export enum FeatureFlagScope {
  SYSTEM = 'system',
  BRANCH = 'branch',
  USER = 'user',
}

export enum NumberingResetPolicy {
  NEVER = 'never',
  YEARLY = 'yearly',
  MONTHLY = 'monthly',
}

export enum HolidayScope {
  SYSTEM = 'system',
  BRANCH = 'branch',
}

export interface ConfigValue<T = any> {
  value: T;
  source: ConfigScope;
  version?: number;
  lastModified: Date;
  modifiedBy?: string;
}

export interface ConfigurationMetadata {
  key: string;
  dataType: ConfigDataType;
  category: string;
  description?: string;
  isRequired: boolean;
  defaultValue?: any;
  validationRules?: Record<string, any>;
}

export type ConfigMap = Record<string, any>;

// Configuration Categories
export const CONFIG_CATEGORIES = {
  SYSTEM_IDENTITY: 'system_identity',
  BRANDING: 'branding',
  LOCALIZATION: 'localization',
  CURRENCY: 'currency',
  TAX: 'tax',
  TIMEZONE: 'timezone',
  BUSINESS_HOURS: 'business_hours',
  DOCUMENT_NUMBERING: 'document_numbering',
  RESERVATION: 'reservation',
  INSTALLMENT: 'installment',
  PAYMENT: 'payment',
  POS: 'pos',
  INVOICE: 'invoice',
  DOCUMENT: 'document',
  NOTIFICATION: 'notification',
  FEATURE_FLAGS: 'feature_flags',
} as const;

// Configuration Keys (matching SPEC-013)
export const CONFIG_KEYS = {
  // System Identity & Branding
  APPLICATION_NAME: 'system.application_name',
  COMPANY_NAME: 'system.company_name',
  COMPANY_LEGAL_NAME: 'system.company_legal_name',
  LOGO_URL: 'system.logo_url',
  FAVICON_URL: 'system.favicon_url',
  PRIMARY_COLOR: 'system.primary_color',
  SECONDARY_COLOR: 'system.secondary_color',
  
  // Contact Information
  ADDRESS_LINE1: 'company.address_line1',
  ADDRESS_LINE2: 'company.address_line2',
  CITY: 'company.city',
  POSTAL_CODE: 'company.postal_code',
  PHONE: 'company.phone',
  EMAIL: 'company.email',
  WEBSITE: 'company.website',
  
  // Localization
  DEFAULT_LANGUAGE: 'system.default_language',
  SUPPORTED_LANGUAGES: 'system.supported_languages',
  RTL_ENABLED: 'system.rtl_enabled',
  DATE_FORMAT: 'system.date_format',
  TIME_FORMAT: 'system.time_format',
  NUMBER_FORMAT: 'system.number_format',
  
  // Currency & Financial
  DEFAULT_CURRENCY: 'system.default_currency',
  CURRENCY_SYMBOL: 'system.currency_symbol',
  CURRENCY_DECIMAL_PLACES: 'system.currency_decimal_places',
  CURRENCY_DISPLAY_FORMAT: 'system.currency_display_format',
  TAX_ENABLED: 'system.tax_enabled',
  TAX_NAME: 'system.tax_name',
  TAX_RATE: 'system.tax_rate',
  TAX_REGISTRATION_NUMBER: 'system.tax_registration_number',
  
  // Timezone & Working Hours
  DEFAULT_TIMEZONE: 'system.default_timezone',
  BUSINESS_HOURS_START: 'system.business_hours_start',
  BUSINESS_HOURS_END: 'system.business_hours_end',
  WEEKEND_DAYS: 'system.weekend_days',
  
  // Document Numbering
  NUMBERING_INVOICE_PREFIX: 'numbering.invoice.prefix',
  NUMBERING_ORDER_PREFIX: 'numbering.order.prefix',
  NUMBERING_RESERVATION_PREFIX: 'numbering.reservation.prefix',
  NUMBERING_PAYMENT_PREFIX: 'numbering.payment.prefix',
  NUMBERING_FINANCING_PREFIX: 'numbering.financing.prefix',
  NUMBERING_LETTER_PREFIX: 'numbering.letter.prefix',
  NUMBERING_INCLUDE_BRANCH_CODE: 'numbering.include_branch_code',
  NUMBERING_INCLUDE_YEAR: 'numbering.include_year',
  NUMBERING_SEQUENCE_PADDING: 'numbering.sequence_padding',
  NUMBERING_RESET_POLICY: 'numbering.reset_policy',
  
  // Reservation Settings
  RESERVATION_DEFAULT_DURATION_DAYS: 'reservation.default_duration_days',
  RESERVATION_MINIMUM_DEPOSIT_AMOUNT: 'reservation.minimum_deposit_amount',
  RESERVATION_MINIMUM_DEPOSIT_PERCENTAGE: 'reservation.minimum_deposit_percentage',
  RESERVATION_MAXIMUM_DURATION_DAYS: 'reservation.maximum_duration_days',
  RESERVATION_EXPIRATION_WARNING_DAYS: 'reservation.expiration_warning_days',
  RESERVATION_AUTO_CONVERSION_ENABLED: 'reservation.auto_conversion_enabled',
  
  // Installment Settings
  INSTALLMENT_MINIMUM_DOWN_PAYMENT_PERCENTAGE: 'installment.minimum_down_payment_percentage',
  INSTALLMENT_MAXIMUM_INSTALLMENTS: 'installment.maximum_installments',
  INSTALLMENT_ALLOWED_FREQUENCIES: 'installment.allowed_frequencies',
  INSTALLMENT_DEFAULT_FREQUENCY: 'installment.default_frequency',
  INSTALLMENT_OVERDUE_GRACE_PERIOD_DAYS: 'installment.overdue_grace_period_days',
  INSTALLMENT_DEFAULT_INTEREST_RATE: 'installment.default_interest_rate',
  
  // Payment Settings
  PAYMENT_ENABLED_METHODS: 'payment.enabled_methods',
  PAYMENT_DEFAULT_METHOD: 'payment.default_method',
  PAYMENT_CASH_LIMIT_AMOUNT: 'payment.cash_limit_amount',
  PAYMENT_REQUIRE_RECEIPT_CONFIRMATION: 'payment.require_receipt_confirmation',
  PAYMENT_AUTO_ALLOCATION_ENABLED: 'payment.auto_allocation_enabled',
  
  // POS Configuration
  POS_DEFAULT_BRANCH: 'pos.default_branch',
  POS_AUTO_PRINT_RECEIPTS: 'pos.auto_print_receipts',
  POS_CASH_DRAWER_ENABLED: 'pos.cash_drawer_enabled',
  POS_BARCODE_SCANNER_ENABLED: 'pos.barcode_scanner_enabled',
  POS_OFFLINE_MODE_ENABLED: 'pos.offline_mode_enabled',
  POS_SESSION_TIMEOUT_MINUTES: 'pos.session_timeout_minutes',
  
  // Receipt Configuration
  POS_RECEIPT_HEADER_TEXT: 'pos.receipt_header_text',
  POS_RECEIPT_FOOTER_TEXT: 'pos.receipt_footer_text',
  POS_RECEIPT_LOGO_ENABLED: 'pos.receipt_logo_enabled',
  POS_RECEIPT_PAPER_SIZE: 'pos.receipt_paper_size',
  POS_RECEIPT_COPY_COUNT: 'pos.receipt_copy_count',
  POS_RECEIPT_LANGUAGE: 'pos.receipt_language',
  
  // Invoice Settings
  INVOICE_TEMPLATE_STYLE: 'invoice.template_style',
  INVOICE_LOGO_POSITION: 'invoice.logo_position',
  INVOICE_INCLUDE_TAX_BREAKDOWN: 'invoice.include_tax_breakdown',
  INVOICE_PAYMENT_TERMS_TEXT: 'invoice.payment_terms_text',
  INVOICE_FOOTER_TEXT: 'invoice.footer_text',
  INVOICE_DUE_DATE_DAYS: 'invoice.due_date_days',
  
  // Document Settings
  DOCUMENT_LETTERHEAD_ENABLED: 'document.letterhead_enabled',
  DOCUMENT_SIGNATURE_LINE_ENABLED: 'document.signature_line_enabled',
  DOCUMENT_TERMS_CONDITIONS_TEXT: 'document.terms_conditions_text',
  DOCUMENT_PRIVACY_NOTICE_TEXT: 'document.privacy_notice_text',
  DOCUMENT_DEFAULT_PAPER_SIZE: 'document.default_paper_size',
  DOCUMENT_PRINT_MARGIN_SIZE: 'document.print_margin_size',
  
  // Notification Configuration
  NOTIFICATION_DEFAULT_CHANNELS: 'notification.default_channels',
  NOTIFICATION_DEFAULT_LANGUAGE: 'notification.default_language',
  NOTIFICATION_BUSINESS_HOURS_ONLY: 'notification.business_hours_only',
  NOTIFICATION_REMINDER_ADVANCE_DAYS: 'notification.reminder_advance_days',
  NOTIFICATION_MAX_RETRY_ATTEMPTS: 'notification.max_retry_attempts',
  NOTIFICATION_RATE_LIMIT_PER_RECIPIENT: 'notification.rate_limit_per_recipient',
  NOTIFICATION_SMS_ENABLED: 'notification.sms_enabled',
  NOTIFICATION_EMAIL_ENABLED: 'notification.email_enabled',
  NOTIFICATION_WHATSAPP_ENABLED: 'notification.whatsapp_enabled',
  NOTIFICATION_PUSH_ENABLED: 'notification.push_enabled',
} as const;

export type ConfigKey = typeof CONFIG_KEYS[keyof typeof CONFIG_KEYS];
