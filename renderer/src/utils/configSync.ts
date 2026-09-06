// SPEC-013 TASK-015: Desktop POS Configuration Synchronization
import { configuration } from '../api';

const CONFIG_CACHE_KEY = 'pos_config_cache';
const CONFIG_TIMESTAMP_KEY = 'pos_config_timestamp';
const CACHE_VALIDITY_MS = 30 * 60 * 1000; // 30 minutes

interface CachedConfig {
  data: Record<string, any>;
  timestamp: number;
  branchId?: string;
}

/**
 * Configuration sync manager for Desktop POS
 * Handles online/offline configuration with local caching
 */
export class ConfigSyncManager {
  private static instance: ConfigSyncManager;
  private config: Record<string, any> = {};
  private lastSync: number = 0;
  private syncInProgress = false;

  private constructor() {
    this.loadFromCache();
  }

  static getInstance(): ConfigSyncManager {
    if (!ConfigSyncManager.instance) {
      ConfigSyncManager.instance = new ConfigSyncManager();
    }
    return ConfigSyncManager.instance;
  }

  /**
   * Get configuration value with offline fallback
   */
  async getValue<T = any>(key: string, defaultValue?: T): Promise<T> {
    // Try from memory cache first
    if (this.config[key] !== undefined) {
      return this.config[key] as T;
    }

    // Try to sync if online and cache is stale
    if (navigator.onLine && this.isCacheStale()) {
      try {
        await this.sync();
        if (this.config[key] !== undefined) {
          return this.config[key] as T;
        }
      } catch (error) {
        console.warn('Failed to sync configuration, using cached value:', error);
      }
    }

    // Fallback to default
    return defaultValue as T;
  }

  /**
   * Get all cached configuration
   */
  getAll(): Record<string, any> {
    return { ...this.config };
  }

  /**
   * Check if feature flag is enabled (with offline fallback)
   */
  async isFeatureEnabled(flagKey: string): Promise<boolean> {
    const cachedValue = this.config[`feature:${flagKey}`];
    if (cachedValue !== undefined) {
      return cachedValue === true;
    }

    if (navigator.onLine) {
      try {
        const result = await configuration.checkFeature(flagKey);
        this.config[`feature:${flagKey}`] = result.isEnabled;
        this.saveToCache();
        return result.isEnabled;
      } catch (error) {
        console.warn('Failed to check feature flag, defaulting to false:', error);
      }
    }

    return false;
  }

  /**
   * Sync configuration from server
   */
  async sync(force = false): Promise<void> {
    if (this.syncInProgress) {
      console.log('Sync already in progress');
      return;
    }

    if (!force && !this.isCacheStale()) {
      console.log('Cache is still valid, skipping sync');
      return;
    }

    if (!navigator.onLine) {
      console.log('Offline - skipping sync');
      return;
    }

    this.syncInProgress = true;
    try {
      console.log('Syncing configuration from server...');
      
      // Get critical POS configuration keys
      const criticalKeys = [
        'pos.auto_print_receipts',
        'pos.cash_drawer_enabled',
        'pos.session_timeout_minutes',
        'pos.offline_mode_enabled',
        'pos.receipt_header_text',
        'pos.receipt_footer_text',
        'pos.receipt_paper_size',
        'payment.enabled_methods',
        'payment.cash_limit_amount',
        'reservation.default_duration_days',
        'reservation.minimum_deposit_percentage',
      ];

      const configData = await configuration.getResolvedConfig(criticalKeys);
      
      this.config = configData;
      this.lastSync = Date.now();
      this.saveToCache();
      
      console.log('Configuration synced successfully');
    } catch (error) {
      console.error('Failed to sync configuration:', error);
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Check if cache is stale
   */
  private isCacheStale(): boolean {
    return Date.now() - this.lastSync > CACHE_VALIDITY_MS;
  }

  /**
   * Load configuration from localStorage
   */
  private loadFromCache(): void {
    try {
      const cached = localStorage.getItem(CONFIG_CACHE_KEY);
      const timestamp = localStorage.getItem(CONFIG_TIMESTAMP_KEY);
      
      if (cached && timestamp) {
        const cachedData: CachedConfig = JSON.parse(cached);
        this.config = cachedData.data || {};
        this.lastSync = parseInt(timestamp, 10);
        console.log('Configuration loaded from cache');
      }
    } catch (error) {
      console.error('Failed to load configuration from cache:', error);
    }
  }

  /**
   * Save configuration to localStorage
   */
  private saveToCache(): void {
    try {
      const cacheData: CachedConfig = {
        data: this.config,
        timestamp: this.lastSync,
      };
      localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(cacheData));
      localStorage.setItem(CONFIG_TIMESTAMP_KEY, this.lastSync.toString());
    } catch (error) {
      console.error('Failed to save configuration to cache:', error);
    }
  }

  /**
   * Clear cached configuration
   */
  clearCache(): void {
    this.config = {};
    this.lastSync = 0;
    localStorage.removeItem(CONFIG_CACHE_KEY);
    localStorage.removeItem(CONFIG_TIMESTAMP_KEY);
    console.log('Configuration cache cleared');
  }

  /**
   * Get cache status
   */
  getCacheStatus() {
    return {
      lastSync: new Date(this.lastSync).toISOString(),
      isStale: this.isCacheStale(),
      itemCount: Object.keys(this.config).length,
      isOnline: navigator.onLine,
    };
  }
}

// Export singleton instance
export const configSync = ConfigSyncManager.getInstance();

// Auto-sync on app start (with delay)
if (typeof window !== 'undefined') {
  setTimeout(() => {
    configSync.sync().catch(console.error);
  }, 2000);

  // Sync on reconnect
  window.addEventListener('online', () => {
    console.log('Network reconnected - syncing configuration');
    configSync.sync(true).catch(console.error);
  });
}
