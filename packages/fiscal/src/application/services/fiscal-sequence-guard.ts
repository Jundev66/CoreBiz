import { ok, err, type Result } from '@corebiz/shared-kernel';
import type {
  FiscalSequenceDocumentType,
  FiscalSequenceError,
  FiscalSequenceRangeRepository,
} from '../../domain/index';

export interface SequenceAdvanceResult {
  readonly assignedNumber?: bigint;
  readonly formattedNumber?: string;
  readonly remainingNumbers?: bigint;
  readonly isNearExhaustion?: boolean;
  readonly isNearExpiration?: boolean;
}

export type FiscalSequenceGuardError =
  | FiscalSequenceError
  | { readonly kind: 'NoActiveFiscalSequenceRange'; readonly documentType: string };

export class FiscalSequenceGuard {
  constructor(private readonly sequenceRepo: FiscalSequenceRangeRepository) {}

  async advance(
    tenantId: string,
    jurisdiction: string,
    documentType: FiscalSequenceDocumentType,
    prefix?: string,
    now: Date = new Date(),
  ): Promise<Result<SequenceAdvanceResult, FiscalSequenceGuardError>> {
    if (jurisdiction === 'US') {
      return ok({});
    }

    const range = await this.sequenceRepo.findActiveRange(tenantId, documentType, prefix);
    if (!range) {
      return err({ kind: 'NoActiveFiscalSequenceRange', documentType });
    }

    const nextRes = range.nextSequence(now);
    if (!nextRes.ok) {
      return err(nextRes.error);
    }

    const { range: updatedRange, assignedNumber, formattedNumber } = nextRes.value;
    await this.sequenceRepo.save(updatedRange);

    return ok({
      assignedNumber,
      formattedNumber,
      remainingNumbers: updatedRange.remainingNumbers,
      isNearExhaustion: updatedRange.isNearExhaustion,
      isNearExpiration: updatedRange.isNearExpiration(now),
    });
  }
}
