import { ok, err, type Result } from '../../shared/result';

export type RifType = 'V' | 'E' | 'J' | 'G' | 'C';

export interface RifError {
  readonly kind: 'InvalidRifFormat' | 'InvalidRifCheckDigit';
  readonly raw: string;
}

const TYPE_WEIGHTS: Readonly<Record<RifType, number>> = {
  V: 1,
  E: 2,
  J: 3,
  G: 4,
  C: 5,
};

const MULTIPLIERS = [3, 2, 7, 6, 5, 4, 3, 2] as const;

export class Rif {
  private constructor(
    readonly type: RifType,
    readonly number: string,
    readonly checkDigit: number,
  ) {}

  static create(raw: string): Result<Rif, RifError> {
    const sanitized = raw
      .trim()
      .toUpperCase()
      .replace(/[\s.-]/g, '');
    const match = sanitized.match(/^([VEJGC])(\d{8})(\d)$/);

    if (!match) {
      return err({ kind: 'InvalidRifFormat', raw });
    }

    const typeStr = match[1];
    const bodyDigits = match[2];
    const checkDigitStr = match[3];

    if (!typeStr || !bodyDigits || !checkDigitStr) {
      return err({ kind: 'InvalidRifFormat', raw });
    }

    const type = typeStr as RifType;
    const checkDigit = Number.parseInt(checkDigitStr, 10);

    const calculatedCheckDigit = Rif.calculateCheckDigit(type, bodyDigits);
    if (calculatedCheckDigit !== checkDigit) {
      return err({ kind: 'InvalidRifCheckDigit', raw });
    }

    return ok(new Rif(type, bodyDigits, checkDigit));
  }

  static calculateCheckDigit(type: RifType, bodyDigits: string): number {
    let sum = TYPE_WEIGHTS[type] * 4;

    for (let i = 0; i < 8; i += 1) {
      const char = bodyDigits[i];
      const multiplier = MULTIPLIERS[i];
      if (char !== undefined && multiplier !== undefined) {
        sum += Number.parseInt(char, 10) * multiplier;
      }
    }

    const remainder = sum % 11;
    if (remainder <= 1) {
      return 0;
    }
    return 11 - remainder;
  }

  value(): string {
    return `${this.type}-${this.number}-${this.checkDigit}`;
  }

  compact(): string {
    return `${this.type}${this.number}${this.checkDigit}`;
  }
}
