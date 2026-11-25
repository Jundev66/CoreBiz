'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  GitBranch,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { createAccountAction, type AccountActionState } from '@/actions/accounting';
import type { AccountApiItem } from '@/api/accounting';
import { buttonClasses } from '@/ui/button';
import { Alert, Badge } from '@/ui/feedback';
import { CONTROL_CLASSES, LABEL_CLASSES } from '@/ui/field';
import { Card } from '@/ui/primitives';
import { toast } from '@/ui/toast';

type AccountCategoryKey = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'COGS' | 'EXPENSE';

const CATEGORY_META: Record<
  AccountCategoryKey,
  {
    readonly label: string;
    readonly prefix: string;
    readonly accent: string;
    readonly badgeTone: 'brand' | 'warn' | 'success' | 'neutral' | 'danger';
  }
> = {
  ASSET: {
    label: 'Activos',
    prefix: '1',
    accent: 'border-l-emerald-500',
    badgeTone: 'success',
  },
  LIABILITY: {
    label: 'Pasivos',
    prefix: '2',
    accent: 'border-l-amber-500',
    badgeTone: 'warn',
  },
  EQUITY: {
    label: 'Patrimonio',
    prefix: '3',
    accent: 'border-l-violet-500',
    badgeTone: 'brand',
  },
  REVENUE: {
    label: 'Ingresos',
    prefix: '4',
    accent: 'border-l-sky-500',
    badgeTone: 'brand',
  },
  COGS: {
    label: 'Costos de Venta',
    prefix: '5',
    accent: 'border-l-orange-500',
    badgeTone: 'warn',
  },
  EXPENSE: {
    label: 'Gastos Operativos',
    prefix: '6',
    accent: 'border-l-rose-500',
    badgeTone: 'danger',
  },
};

const CATEGORY_ORDER: readonly AccountCategoryKey[] = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'COGS',
  'EXPENSE',
];

interface TreeNode {
  readonly account: AccountApiItem;
  readonly children: readonly TreeNode[];
  readonly depth: number;
}

function buildCategoryTree(items: readonly AccountApiItem[]): readonly TreeNode[] {
  const sorted = [...items].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true }),
  );
  const byId = new Map(sorted.map((a) => [a.id, a]));
  const childrenByParent = new Map<string, AccountApiItem[]>();
  const roots: AccountApiItem[] = [];

  for (const acc of sorted) {
    let resolvedParentId: string | null =
      acc.parentId && byId.has(acc.parentId) ? acc.parentId : null;

    if (!resolvedParentId && acc.code.includes('.')) {
      const parts = acc.code.split('.');
      for (let len = parts.length - 1; len >= 1; len--) {
        const prefix = parts.slice(0, len).join('.');
        const candidate = sorted.find((p) => p.code === prefix && p.id !== acc.id);
        if (candidate) {
          resolvedParentId = candidate.id;
          break;
        }
      }
    }

    if (resolvedParentId) {
      const list = childrenByParent.get(resolvedParentId) ?? [];
      list.push(acc);
      childrenByParent.set(resolvedParentId, list);
    } else {
      roots.push(acc);
    }
  }

  const toNode = (account: AccountApiItem, depth: number): TreeNode => {
    const kids = childrenByParent.get(account.id) ?? [];
    return {
      account,
      depth,
      children: kids.map((k) => toNode(k, depth + 1)),
    };
  };

  return roots.map((r) => toNode(r, 0));
}

function suggestNextChildCode(
  parentId: string,
  category: AccountCategoryKey,
  accounts: readonly AccountApiItem[],
): string {
  const existingCodes = new Set(accounts.map((a) => a.code));
  if (!parentId) {
    const prefix = CATEGORY_META[category].prefix;
    let idx = accounts.filter((a) => a.category === category).length + 1;
    let candidate = `${prefix}.1.${String(idx).padStart(2, '0')}`;
    while (existingCodes.has(candidate)) {
      idx += 1;
      candidate = `${prefix}.1.${String(idx).padStart(2, '0')}`;
    }
    return candidate;
  }
  const parent = accounts.find((a) => a.id === parentId);
  if (!parent) return '';
  let subIdx =
    accounts.filter((a) => a.parentId === parentId || a.code.startsWith(`${parent.code}.`)).length +
    1;
  let candidate = `${parent.code}.${String(subIdx).padStart(2, '0')}`;
  while (existingCodes.has(candidate)) {
    subIdx += 1;
    candidate = `${parent.code}.${String(subIdx).padStart(2, '0')}`;
  }
  return candidate;
}

const INITIAL: AccountActionState = { status: 'idle' };

export function ChartOfAccountsView({
  accounts,
  canWrite,
}: {
  readonly accounts: readonly AccountApiItem[];
  readonly canWrite: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createAccountAction, INITIAL);
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | AccountCategoryKey>('ALL');
  const [search, setSearch] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [showCreate, setShowCreate] = useState(false);

  const [draftCategory, setDraftCategory] = useState<AccountCategoryKey>('ASSET');
  const [draftParentId, setDraftParentId] = useState<string>('');
  const [draftCode, setDraftCode] = useState<string>(suggestNextChildCode('', 'ASSET', accounts));
  const [draftName, setDraftName] = useState<string>('');

  useEffect(() => {
    if (state.status === 'success' && state.createdCode) {
      setShowCreate(false);
      setDraftName('');
      toast.success(`Cuenta ${state.createdCode} creada en el árbol contable.`);
      router.refresh();
    } else if (state.status === 'error' && state.errorKind) {
      toast.error(`No se pudo crear la cuenta (${state.errorKind}).`);
    }
  }, [state, router]);

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((acc) => {
      if (selectedCategory !== 'ALL' && acc.category !== selectedCategory) return false;
      if (!q) return true;
      return acc.code.toLowerCase().includes(q) || acc.name.toLowerCase().includes(q);
    });
  }, [accounts, selectedCategory, search]);

  const countsByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const acc of accounts) {
      counts[acc.category] = (counts[acc.category] ?? 0) + 1;
    }
    return counts;
  }, [accounts]);

  const parentCandidates = useMemo(
    () =>
      accounts
        .filter((a) => a.category === draftCategory)
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    [accounts, draftCategory],
  );

  const openCreateModal = (cat: AccountCategoryKey, parentId = '') => {
    setDraftCategory(cat);
    setDraftParentId(parentId);
    setDraftCode(suggestNextChildCode(parentId, cat, accounts));
    setDraftName('');
    setShowCreate(true);
  };

  const handleCategoryChange = (cat: AccountCategoryKey) => {
    setDraftCategory(cat);
    setDraftParentId('');
    setDraftCode(suggestNextChildCode('', cat, accounts));
  };

  const handleParentChange = (parentId: string) => {
    setDraftParentId(parentId);
    setDraftCode(suggestNextChildCode(parentId, draftCategory, accounts));
  };

  const renderNode = (node: TreeNode): React.ReactNode => {
    const { account, children, depth } = node;
    const isParent = children.length > 0;

    return (
      <div key={account.id}>
        <div
          className={`group flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-3 transition-colors hover:bg-subtle/40 ${
            depth > 0 ? 'bg-canvas/50' : ''
          }`}
          style={{ paddingLeft: `${1 + depth * 1.75}rem` }}
        >
          <div className="flex min-w-0 items-center gap-3">
            {depth > 0 && (
              <span className="text-muted/60 select-none font-mono text-xs" aria-hidden="true">
                └─
              </span>
            )}
            <span className="rounded-control bg-brand-soft px-2 py-0.5 font-mono text-xs font-semibold text-brand">
              {account.code}
            </span>
            <div className="min-w-0">
              <p
                className={`truncate text-sm ${isParent ? 'font-semibold text-ink' : 'font-medium text-ink'}`}
              >
                {account.name}
              </p>
              {isParent && (
                <p className="text-[11px] text-muted">
                  {children.length} {children.length === 1 ? 'subcuenta' : 'subcuentas'}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Badge tone={account.normalSide === 'DEBIT' ? 'neutral' : 'brand'}>
              {account.normalSide === 'DEBIT' ? 'Deudora' : 'Acreedora'}
            </Badge>
            {account.isReconcilable && <Badge tone="success">Conciliable</Badge>}
            {canWrite && (
              <button
                type="button"
                onClick={() => openCreateModal(account.category as AccountCategoryKey, account.id)}
                className="inline-flex items-center gap-1 rounded-control border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink opacity-90 transition hover:border-brand hover:text-brand group-hover:opacity-100"
              >
                <GitBranch className="size-3" />
                <span>+ Subcuenta</span>
              </button>
            )}
          </div>
        </div>
        {children.map((child) => renderNode(child))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <button
          type="button"
          onClick={() => setSelectedCategory('ALL')}
          className={`flex flex-col items-start rounded-card border p-3 text-left transition ${
            selectedCategory === 'ALL'
              ? 'border-brand bg-brand-soft/60 shadow-xs'
              : 'border-line bg-surface hover:bg-subtle/40'
          }`}
        >
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Todas</span>
          <span className="mt-1 text-lg font-bold text-ink tabular-nums">{accounts.length}</span>
        </button>

        {CATEGORY_ORDER.map((cat) => {
          const meta = CATEGORY_META[cat];
          const active = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`flex flex-col items-start rounded-card border border-l-4 p-3 text-left transition ${
                meta.accent
              } ${
                active
                  ? 'border-brand bg-brand-soft/60 shadow-xs'
                  : 'border-line bg-surface hover:bg-subtle/40'
              }`}
            >
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
                {meta.prefix}. {meta.label}
              </span>
              <span className="mt-1 text-lg font-bold text-ink tabular-nums">
                {countsByCategory[cat] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código o nombre de cuenta..."
            className={`${CONTROL_CLASSES} pl-9`}
          />
        </div>

        {canWrite && (
          <button
            type="button"
            onClick={() =>
              openCreateModal(selectedCategory === 'ALL' ? 'ASSET' : selectedCategory, '')
            }
            className={buttonClasses({ size: 'sm' })}
          >
            <Plus className="size-3.5" />
            <span>Nueva Cuenta</span>
          </button>
        )}
      </div>

      {state.status === 'success' && state.createdCode && (
        <Alert tone="success" role="status">
          Cuenta <span className="font-mono font-semibold">{state.createdCode}</span> creada en el
          árbol contable.
        </Alert>
      )}
      {state.status === 'error' && (
        <Alert tone="danger" role="alert">
          No se pudo crear la cuenta ({state.errorKind}). Verificá que el código sea único y el tipo
          coincida con la cuenta padre.
        </Alert>
      )}

      {showCreate && canWrite && (
        <Card className="border-brand/40 bg-brand-soft/15 p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-brand" />
              <h2 className="text-base font-semibold text-ink">
                Nueva Cuenta Contable (Ramificada por Tipo)
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-control p-1 text-muted hover:bg-subtle hover:text-ink"
              aria-label="Cerrar formulario"
            >
              <X className="size-4" />
            </button>
          </div>

          <form action={formAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="acc-category" className={LABEL_CLASSES}>
                Tipo / Categoría
              </label>
              <select
                id="acc-category"
                name="category"
                value={draftCategory}
                onChange={(e) => handleCategoryChange(e.target.value as AccountCategoryKey)}
                className={`mt-1.5 ${CONTROL_CLASSES}`}
              >
                {CATEGORY_ORDER.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_META[cat].prefix}. {CATEGORY_META[cat].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="acc-parent" className={LABEL_CLASSES}>
                Cuenta Padre (Rama {CATEGORY_META[draftCategory].label})
              </label>
              <select
                id="acc-parent"
                name="parentId"
                value={draftParentId}
                onChange={(e) => handleParentChange(e.target.value)}
                className={`mt-1.5 ${CONTROL_CLASSES}`}
              >
                <option value="">
                  Cuenta Principal (Raíz de {CATEGORY_META[draftCategory].label})
                </option>
                {parentCandidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="acc-code" className={LABEL_CLASSES}>
                Código Contable
              </label>
              <input
                id="acc-code"
                name="code"
                required
                value={draftCode}
                onChange={(e) => setDraftCode(e.target.value)}
                placeholder="1.1.01.01"
                className={`mt-1.5 font-mono ${CONTROL_CLASSES}`}
              />
            </div>

            <div>
              <label htmlFor="acc-name" className={LABEL_CLASSES}>
                Nombre de la Cuenta
              </label>
              <input
                id="acc-name"
                name="name"
                required
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Ej: Banco Mercantil VES"
                className={`mt-1.5 ${CONTROL_CLASSES}`}
              />
            </div>

            <div className="flex items-center justify-between sm:col-span-2 lg:col-span-4 border-t border-line pt-4">
              <label className="inline-flex items-center gap-2 text-sm text-ink cursor-pointer">
                <input
                  type="checkbox"
                  name="isReconcilable"
                  className="size-4 rounded border-line text-brand focus:ring-brand"
                />
                <span>Cuenta conciliable (Bancos, CxC, CxP)</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                >
                  Cancelar
                </button>
                <button type="submit" disabled={pending} className={buttonClasses({ size: 'sm' })}>
                  {pending ? 'Guardando...' : 'Crear Cuenta'}
                </button>
              </div>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-4">
        {CATEGORY_ORDER.filter((cat) => selectedCategory === 'ALL' || selectedCategory === cat).map(
          (cat) => {
            const items = filteredAccounts.filter((a) => a.category === cat);
            if (items.length === 0) return null;
            const meta = CATEGORY_META[cat];
            const tree = buildCategoryTree(items);
            const collapsed = Boolean(collapsedCategories[cat]);

            return (
              <Card key={cat} className={`overflow-hidden border-l-4 ${meta.accent}`}>
                <button
                  type="button"
                  onClick={() => setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }))}
                  className="flex w-full items-center justify-between bg-surface-raised/40 px-4 py-3 text-left transition hover:bg-surface-raised/70"
                >
                  <div className="flex items-center gap-2.5">
                    {collapsed ? (
                      <ChevronRight className="size-4 text-muted" />
                    ) : (
                      <ChevronDown className="size-4 text-muted" />
                    )}
                    <FolderTree className="size-4 text-brand" />
                    <span className="text-sm font-semibold text-ink">
                      {meta.prefix}. {meta.label}
                    </span>
                    <Badge tone={meta.badgeTone}>{items.length} cuentas</Badge>
                  </div>
                  <span className="text-xs text-muted">
                    {cat === 'ASSET' || cat === 'COGS' || cat === 'EXPENSE'
                      ? 'Naturaleza Deudora'
                      : 'Naturaleza Acreedora'}
                  </span>
                </button>

                {!collapsed && <div>{tree.map((node) => renderNode(node))}</div>}
              </Card>
            );
          },
        )}
      </div>
    </div>
  );
}
