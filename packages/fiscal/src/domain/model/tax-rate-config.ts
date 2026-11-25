import { ok, err, type Result } from '@corebiz/shared-kernel';

export interface TaxRateConfigProps {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly rateBp: number;
  readonly jurisdiction: 'VE' | 'US';
  readonly isDefault: boolean;
  readonly isActive: boolean;
}

export interface TaxRateConfigError {
  readonly kind: 'InvalidTaxCode' | 'InvalidTaxName' | 'InvalidTaxRate';
}

export class TaxRateConfig {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly rateBp: number;
  readonly jurisdiction: 'VE' | 'US';
  readonly isDefault: boolean;
  readonly isActive: boolean;

  private constructor(props: TaxRateConfigProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.code = props.code;
    this.name = props.name;
    this.rateBp = props.rateBp;
    this.jurisdiction = props.jurisdiction;
    this.isDefault = props.isDefault;
    this.isActive = props.isActive;
  }

  static create(props: TaxRateConfigProps): Result<TaxRateConfig, TaxRateConfigError> {
    const code = props.code.trim().toUpperCase();
    if (code.length === 0) {
      return err({ kind: 'InvalidTaxCode' });
    }
    const name = props.name.trim();
    if (name.length < 2) {
      return err({ kind: 'InvalidTaxName' });
    }
    if (!Number.isInteger(props.rateBp) || props.rateBp < 0 || props.rateBp > 10_000) {
      return err({ kind: 'InvalidTaxRate' });
    }
    return ok(
      new TaxRateConfig({
        ...props,
        code,
        name,
      }),
    );
  }

  withDefault(isDefault: boolean): TaxRateConfig {
    return new TaxRateConfig({ ...this, isDefault });
  }
}
