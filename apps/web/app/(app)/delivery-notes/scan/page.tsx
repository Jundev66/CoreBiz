import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AlertTriangle } from 'lucide-react';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { assistantStatus } from '@/api/ai';
import { Screen } from '@/ui/shell';
import { Card } from '@/ui/primitives';
import { buttonClasses } from '@/ui/button';
import { ScanDeliveryNote } from '@/ui/scan-delivery-note';

export default async function ScanDeliveryNotePage() {
  const t = await getTranslations();
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'delivery_note:issue')) notFound();

  const aiStatus = can(ctx.actor, 'assistant:use')
    ? await assistantStatus().catch(() => null)
    : null;

  const sinTasa = ctx.settings.exchangeRateScaled === null || ctx.settings.exchangeRateAt === null;

  return (
    <Screen
      title={t('deliveryNotes.scanPageTitle')}
      subtitle={t('deliveryNotes.scanPageSubtitle')}
      back={{ href: '/delivery-notes', label: t('deliveryNotes.title') }}
    >
      {sinTasa ? (
        <Card className="flex max-w-2xl flex-col items-center px-6 py-12 text-center sm:px-10">
          <span className="grid size-11 place-items-center rounded-pill bg-warn-soft text-warn-ink">
            <AlertTriangle aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </span>
          <p className="mt-4 text-lg font-semibold text-ink">{t('deliveryNotes.needsRateTitle')}</p>
          <p className="mt-2 max-w-md text-sm text-muted">{t('deliveryNotes.needsRateDetail')}</p>
          <Link href="/settings" className={buttonClasses({ className: 'mt-6' })}>
            {t('deliveryNotes.needsRateAction')}
          </Link>
        </Card>
      ) : (
        <ScanDeliveryNote aiStatus={aiStatus} />
      )}
    </Screen>
  );
}
