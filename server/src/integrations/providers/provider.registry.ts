// SPEC-014 TASK-003: Provider Registry

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IProvider, IPaymentProvider, IEmailProvider, ISMSProvider, IWhatsAppProvider, IStorageProvider } from './interfaces/provider.interface.js';
import { ProviderCategory } from '../types/integration.types.js';

@Injectable()
export class ProviderRegistry {
  private readonly logger = new Logger(ProviderRegistry.name);
  private readonly providers = new Map<string, IProvider>();

  registerProvider(provider: IProvider): void {
    this.providers.set(provider.providerKey, provider);
    this.logger.log(`Registered provider: ${provider.providerKey}`);
  }

  getProvider<T extends IProvider = IProvider>(providerKey: string): T {
    const provider = this.providers.get(providerKey);
    if (!provider) {
      throw new NotFoundException(`Provider ${providerKey} not found`);
    }
    return provider as T;
  }

  getPaymentProvider(providerKey: string): IPaymentProvider {
    return this.getProvider<IPaymentProvider>(providerKey);
  }

  getEmailProvider(providerKey: string): IEmailProvider {
    return this.getProvider<IEmailProvider>(providerKey);
  }

  getSMSProvider(providerKey: string): ISMSProvider {
    return this.getProvider<ISMSProvider>(providerKey);
  }

  getWhatsAppProvider(providerKey: string): IWhatsAppProvider {
    return this.getProvider<IWhatsAppProvider>(providerKey);
  }

  getStorageProvider(providerKey: string): IStorageProvider {
    return this.getProvider<IStorageProvider>(providerKey);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  hasProvider(providerKey: string): boolean {
    return this.providers.has(providerKey);
  }
}
