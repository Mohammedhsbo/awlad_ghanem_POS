// SPEC-014: Integration & API Management Types

export enum ProviderCategory {
  PAYMENT = 'payment',
  EMAIL = 'email',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  STORAGE = 'storage',
  ANALYTICS = 'analytics',
  OTHER = 'other',
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
}

export enum WebhookEventStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  DEAD_LETTER = 'dead_letter',
}

export enum IntegrationErrorCode {
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  PROVIDER_TIMEOUT = 'PROVIDER_TIMEOUT',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  DUPLICATE_REQUEST = 'DUPLICATE_REQUEST',
  INVALID_WEBHOOK_EVENT = 'INVALID_WEBHOOK_EVENT',
  CONFIGURATION_MISSING = 'CONFIGURATION_MISSING',
  UNSUPPORTED_OPERATION = 'UNSUPPORTED_OPERATION',
  NETWORK_FAILURE = 'NETWORK_FAILURE',
}

export enum ErrorCategory {
  TRANSIENT = 'transient',
  PERMANENT = 'permanent',
  BUSINESS = 'business',
  SYSTEM = 'system',
  CONFIGURATION = 'configuration',
  SECURITY = 'security',
}

export interface StandardAPIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: IntegrationError;
  meta?: {
    correlationId: string;
    timestamp: string;
    version: string;
    requestId?: string;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface IntegrationError {
  code: IntegrationErrorCode | string;
  message: string;
  category: ErrorCategory;
  retryable: boolean;
  retryAfter?: number;
  provider?: string;
  operation?: string;
  correlationId?: string;
  timestamp: string;
  details?: Record<string, any>;
}

export interface ProviderConfig {
  apiKey?: string;
  apiSecret?: string;
  webhookSecret?: string;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  [key: string]: any;
}

export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
  retryableErrors: string[];
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  burstCapacity?: number;
}

export interface HealthCheckResult {
  status: HealthStatus;
  responseTime: number;
  lastCheck: Date;
  lastError?: string;
  consecutiveFailures: number;
  uptime?: number;
  metrics?: {
    successRate: number;
    errorRate: number;
    avgResponseTime: number;
  };
}

export interface WebhookPayload {
  eventId: string;
  eventType: string;
  timestamp: string;
  data: Record<string, any>;
  signature?: string;
}

export interface APIKeyScope {
  resources: string[];
  actions: string[];
  branches?: string[];
}

export interface IdempotencyRequest {
  key: string;
  scope: string;
  expiresIn: number;
}

export interface ProviderMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  successRate: number;
  uptime: number;
  lastHour: {
    requests: number;
    errors: number;
    avgResponseTime: number;
  };
}
