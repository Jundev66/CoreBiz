export type BalanceSide = 'DEBIT' | 'CREDIT';

export type AccountCategory = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'COGS' | 'EXPENSE';

export function resolveNormalBalanceSide(category: AccountCategory): BalanceSide {
  switch (category) {
    case 'ASSET':
    case 'COGS':
    case 'EXPENSE':
      return 'DEBIT';
    case 'LIABILITY':
    case 'EQUITY':
    case 'REVENUE':
      return 'CREDIT';
  }
}
