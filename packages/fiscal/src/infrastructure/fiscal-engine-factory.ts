import type { FiscalJurisdictionPort, JurisdictionCode } from '../domain/index';
import { VenezuelaFiscalEngine } from './venezuela-fiscal-engine';
import { UnitedStatesFiscalEngine } from './united-states-fiscal-engine';

export interface FiscalEngineFactoryOptions {
  readonly usSalesTaxRatePercentage?: number;
}

export type FiscalEngineFactoryFn = (options?: unknown) => FiscalJurisdictionPort;

export class FiscalEngineRegistry {
  private static readonly registry = new Map<string, FiscalEngineFactoryFn>();

  static {
    FiscalEngineRegistry.register('VE', () => new VenezuelaFiscalEngine());
    FiscalEngineRegistry.register('US', (opts) => {
      const options = opts as FiscalEngineFactoryOptions | undefined;
      return new UnitedStatesFiscalEngine(options?.usSalesTaxRatePercentage);
    });
  }

  static register(jurisdiction: string, factory: FiscalEngineFactoryFn): void {
    FiscalEngineRegistry.registry.set(jurisdiction.toUpperCase(), factory);
  }

  static resolve(jurisdiction: string, options?: unknown): FiscalJurisdictionPort {
    const factory = FiscalEngineRegistry.registry.get(jurisdiction.toUpperCase());
    if (!factory) {
      throw new Error(`Unsupported fiscal jurisdiction: ${jurisdiction}`);
    }
    return factory(options);
  }

  static has(jurisdiction: string): boolean {
    return FiscalEngineRegistry.registry.has(jurisdiction.toUpperCase());
  }
}

export function createFiscalEngine(
  jurisdiction: JurisdictionCode,
  options?: FiscalEngineFactoryOptions,
): FiscalJurisdictionPort {
  return FiscalEngineRegistry.resolve(jurisdiction, options);
}
