'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { destroyDemoAction } from '@/actions/demo';

export function DestroyDemoButton() {
  const t = useTranslations('demo');
  const [pending, startTransition] = useTransition();

  const handleDestroy = () => {
    if (window.confirm(t('destroyConfirm'))) {
      startTransition(async () => {
        await destroyDemoAction();
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handleDestroy}
      disabled={pending}
      title={t('destroyHint')}
      className="inline-flex items-center gap-1.5 rounded-pill border border-danger-line bg-surface px-2.5 py-1 text-xs font-semibold text-danger-ink shadow-xs transition hover:bg-danger-soft disabled:opacity-50"
    >
      <Trash2 aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
      <span>{pending ? t('starting') : t('destroyTitle')}</span>
    </button>
  );
}
