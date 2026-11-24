import { type TreasurySwap, type TreasurySwapRepository } from '../../domain/index';

export class ListTreasurySwapsQueryHandler {
  constructor(private readonly treasurySwapRepository: TreasurySwapRepository) {}

  async execute(tenantId: string): Promise<readonly TreasurySwap[]> {
    return this.treasurySwapRepository.listByTenant(tenantId);
  }
}
