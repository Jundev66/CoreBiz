import { ok, err, type Result } from '@corebiz/shared-kernel';

export interface EinError {
  readonly kind: 'InvalidEinFormat';
  readonly raw: string;
}

const EIN_REGEX = /^(\d{2})-?(\d{7})$/;

export class Ein {
  private constructor(
    readonly prefix: string,
    readonly serial: string,
  ) {}

  static create(raw: string): Result<Ein, EinError> {
    const sanitized = raw.trim();
    const match = sanitized.match(EIN_REGEX);

    if (!match) {
      return err({ kind: 'InvalidEinFormat', raw });
    }

    const prefix = match[1];
    const serial = match[2];
    if (!prefix || !serial) {
      return err({ kind: 'InvalidEinFormat', raw });
    }

    return ok(new Ein(prefix, serial));
  }

  value(): string {
    return `${this.prefix}-${this.serial}`;
  }

  compact(): string {
    return `${this.prefix}${this.serial}`;
  }
}
