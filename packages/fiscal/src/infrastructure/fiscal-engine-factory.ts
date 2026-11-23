import type { FiscalJurisdictionPort, JurisdictionCode } from '../domain/index';
import { VenezuelaFiscalEngine } from './venezuela-fiscal-engine';
import { UnitedStatesFiscalEngine } from './united-states-fiscal-engine';

export interface FiscalEngineFactoryOptions {
  readonly usSalesTaxRatePercentage?: number;
}

export function createFiscalEngine(
  jurisdiction: JurisdictionCode,
  options?: FiscalEngineFactoryOptions,
): FiscalJurisdictionPort {
  switch (jurisdiction) {
    case 'VE':
      return new VenezuelaFiscalEngine();
    case 'US':
      return new UnitedStatesFiscalEngine(options?.usSalesTaxRatePercentage);
  }
}
