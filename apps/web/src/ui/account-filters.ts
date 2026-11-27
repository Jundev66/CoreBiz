export interface AccountFilterItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly category: string;
  readonly isActive?: boolean;
  readonly isReconcilable?: boolean;
}

const NON_LIQUID_ASSET_CODES = ['1.1.02', '1.1.03', '1100', '1200', '1400'];
const NON_LIQUID_ASSET_KEYWORDS = ['cobrar', 'receivable', 'inventario', 'inventory', 'mercanc'];
const LIQUID_ASSET_CODES = ['1.1.01', '1.1.04', '1010', '1020', '1030', '1040'];
const LIQUID_ASSET_KEYWORDS = [
  'caja',
  'banco',
  'cash',
  'bank',
  'checking',
  'usdt',
  'crypto',
  'divisa',
  'tesorer',
];

export function filterLiquidAssetAccounts<T extends AccountFilterItem>(
  accounts: readonly T[],
): readonly T[] {
  const activeAssets = accounts.filter((a) => a.category === 'ASSET' && a.isActive !== false);
  const liquid = activeAssets.filter((a) => {
    const code = a.code.trim();
    const name = a.name.toLowerCase();
    if (NON_LIQUID_ASSET_CODES.some((prefix) => code.startsWith(prefix))) return false;
    if (NON_LIQUID_ASSET_KEYWORDS.some((kw) => name.includes(kw))) return false;
    return (
      a.isReconcilable === true ||
      LIQUID_ASSET_CODES.some((prefix) => code.startsWith(prefix)) ||
      LIQUID_ASSET_KEYWORDS.some((kw) => name.includes(kw))
    );
  });
  return liquid.length > 0 ? liquid : activeAssets;
}

export function filterReceivableAccounts<T extends AccountFilterItem>(
  accounts: readonly T[],
): readonly T[] {
  const activeAssets = accounts.filter((a) => a.category === 'ASSET' && a.isActive !== false);
  const receivables = activeAssets.filter((a) => {
    const code = a.code.trim();
    const name = a.name.toLowerCase();
    return (
      code.startsWith('1.1.02') ||
      code.startsWith('1100') ||
      name.includes('cobrar') ||
      name.includes('receivable')
    );
  });
  return receivables.length > 0 ? receivables : activeAssets;
}

export function filterInventoryAccounts<T extends AccountFilterItem>(
  accounts: readonly T[],
): readonly T[] {
  const activeAssets = accounts.filter((a) => a.category === 'ASSET' && a.isActive !== false);
  const inventory = activeAssets.filter((a) => {
    const code = a.code.trim();
    const name = a.name.toLowerCase();
    return (
      code.startsWith('1.1.03') ||
      code.startsWith('1200') ||
      code.startsWith('1400') ||
      name.includes('inventario') ||
      name.includes('inventory') ||
      name.includes('mercanc')
    );
  });
  return inventory.length > 0 ? inventory : activeAssets;
}
