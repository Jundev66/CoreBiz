import { ok, err, type Result } from '@corebiz/shared-kernel';
import {
  FiscalSequenceRange,
  type FiscalSequenceDocumentType,
  type FiscalSequenceError,
  type FiscalSequenceRangeRepository,
} from '../../domain/index';

export interface CreateFiscalSequenceRangeCommand {
  readonly id: string;
  readonly tenantId: string;
  readonly jurisdiction: string;
  readonly documentType: FiscalSequenceDocumentType;
  readonly prefix: string;
  readonly fromNumber: bigint;
  readonly toNumber: bigint;
  readonly resolutionNumber?: string | undefined;
  readonly resolutionDate?: Date | undefined;
  readonly expiresAt?: Date | undefined;
  readonly warningThreshold?: number | undefined;
}

export class CreateFiscalSequenceRangeCommandHandler {
  constructor(private readonly sequenceRepo: FiscalSequenceRangeRepository) {}

  async execute(
    command: CreateFiscalSequenceRangeCommand,
    now: Date = new Date(),
  ): Promise<Result<{ rangeId: string; status: string }, FiscalSequenceError>> {
    const rangeResult = FiscalSequenceRange.create(
      {
        id: command.id,
        tenantId: command.tenantId,
        jurisdiction: command.jurisdiction,
        documentType: command.documentType,
        prefix: command.prefix,
        fromNumber: command.fromNumber,
        toNumber: command.toNumber,
        resolutionNumber: command.resolutionNumber,
        resolutionDate: command.resolutionDate,
        expiresAt: command.expiresAt,
        warningThreshold: command.warningThreshold,
      },
      now,
    );

    if (!rangeResult.ok) {
      return err(rangeResult.error);
    }

    const range = rangeResult.value;
    await this.sequenceRepo.save(range);

    return ok({
      rangeId: range.id,
      status: range.status,
    });
  }
}
