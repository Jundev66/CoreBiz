import { Rif, type RifType } from '../../src/domain/value-objects/rif';

export class RifMother {
  static create(type: RifType, digits: string): Rif {
    const checkDigit = Rif.calculateCheckDigit(type, digits);
    const result = Rif.create(`${type}-${digits}-${checkDigit}`);
    if (!result.ok) {
      throw new Error(`Failed to create Rif: ${JSON.stringify(result.error)}`);
    }
    return result.value;
  }

  static corporate(digits = '12345678'): Rif {
    return RifMother.create('J', digits);
  }

  static individual(digits = '18234567'): Rif {
    return RifMother.create('V', digits);
  }

  static government(digits = '20000001'): Rif {
    return RifMother.create('G', digits);
  }
}
