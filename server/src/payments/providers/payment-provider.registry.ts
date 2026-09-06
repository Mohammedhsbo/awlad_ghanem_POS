import { Injectable, NotFoundException } from "@nestjs/common";
import {
  IPaymentProvider,
  PaymentProviderConfig,
  ProviderError,
} from "./payment-provider.interface.js";
import { PaymentMethod } from "@motorcycle-system/shared-types";

/**
 * TASK-011: Payment Provider Registry
 * 
 * Manages registration and retrieval of payment provider implementations.
 * Providers are registered at application startup.
 */
@Injectable()
export class PaymentProviderRegistry {
  private providers = new Map<string, IPaymentProvider>();
  private configs = new Map<string, PaymentProviderConfig>();

  /**
   * Register a payment provider
   */
  register(provider: IPaymentProvider, config: PaymentProviderConfig): void {
    if (this.providers.has(provider.providerId)) {
      throw new ProviderError(
        `Provider ${provider.providerId} is already registered`,
        "PROVIDER_ALREADY_REGISTERED"
      );
    }

    this.providers.set(provider.providerId, provider);
    this.configs.set(provider.providerId, config);

    // Initialize provider
    provider.initialize(config).catch((error) => {
      console.error(
        `Failed to initialize provider ${provider.providerId}:`,
        error
      );
    });
  }

  /**
   * Get a provider by ID
   */
  getProvider(providerId: string): IPaymentProvider {
    const provider = this.providers.get(providerId);

    if (!provider) {
      throw new NotFoundException({
        code: "PROVIDER_NOT_FOUND",
        message: `Payment provider ${providerId} not found`,
      });
    }

    const config = this.configs.get(providerId);

    if (!config?.enabled) {
      throw new ProviderError(
        `Provider ${providerId} is not enabled`,
        "PROVIDER_DISABLED"
      );
    }

    return provider;
  }

  /**
   * Get provider configuration
   */
  getConfig(providerId: string): PaymentProviderConfig | undefined {
    return this.configs.get(providerId);
  }

  /**
   * Find a provider that supports a specific payment method
   */
  findProviderForMethod(method: PaymentMethod): IPaymentProvider | null {
    for (const [providerId, provider] of this.providers.entries()) {
      const config = this.configs.get(providerId);

      if (config?.enabled && provider.supportsMethod(method)) {
        return provider;
      }
    }

    return null;
  }

  /**
   * List all registered providers
   */
  listProviders(): Array<{
    providerId: string;
    name: string;
    enabled: boolean;
    supportedMethods: PaymentMethod[];
  }> {
    const result: Array<{
      providerId: string;
      name: string;
      enabled: boolean;
      supportedMethods: PaymentMethod[];
    }> = [];

    for (const [providerId, provider] of this.providers.entries()) {
      const config = this.configs.get(providerId);

      if (config) {
        result.push({
          providerId,
          name: provider.name,
          enabled: config.enabled,
          supportedMethods: config.supportedMethods,
        });
      }
    }

    return result;
  }

  /**
   * Check if a provider is registered and enabled
   */
  isProviderAvailable(providerId: string): boolean {
    const config = this.configs.get(providerId);
    return config?.enabled ?? false;
  }
}
