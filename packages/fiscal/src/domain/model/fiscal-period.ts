import { ok, err, type Result } from '@corebiz/shared-kernel';

export interface FiscalPeriodProps {
  readonly startDate: Date;
  readonly endDate: Date;
  readonly fiscalCountry: string;
}

export type FiscalPeriodError = { readonly kind: 'InvalidDateRange' };

export class FiscalPeriod {
  readonly startDate: Date;
  readonly endDate: Date;
  readonly fiscalCountry: string;

  private constructor(props: FiscalPeriodProps) {
    this.startDate = props.startDate;
    this.endDate = props.endDate;
    this.fiscalCountry = props.fiscalCountry;
  }

  static create(props: FiscalPeriodProps): Result<FiscalPeriod, FiscalPeriodError> {
    if (props.startDate.getTime() > props.endDate.getTime()) {
      return err({ kind: 'InvalidDateRange' });
    }
    return ok(new FiscalPeriod(props));
  }
}
