'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { VisionExtractResponse } from '@synapse-vision/core';
import type { AssistantStatusView } from '@/api/ai';
import { VisionScan } from '@/ui/vision';
import { Card } from '@/ui/primitives';

export const SCANNED_NOTE_STORAGE_KEY = 'corebiz_scanned_delivery_note';

export function ScanDeliveryNote({
  aiStatus,
}: {
  readonly aiStatus?: AssistantStatusView | null | undefined;
}) {
  const t = useTranslations('deliveryNotes');
  const tVision = useTranslations('vision');
  const router = useRouter();

  const handleApplyExtraction = useCallback(
    (res: VisionExtractResponse): void => {
      try {
        sessionStorage.setItem(SCANNED_NOTE_STORAGE_KEY, JSON.stringify(res));
      } catch (err) {
        console.error('Failed to store scanned note in sessionStorage', err);
      }
      router.push('/delivery-notes/new');
    },
    [router],
  );

  return (
    <Card className="mx-auto max-w-3xl p-4 sm:p-6 shadow-xs">
      <VisionScan
        title={tVision('scanTitle')}
        aiStatus={aiStatus}
        onApplyExtraction={handleApplyExtraction}
        applyButtonLabel={t('applyExtraction')}
      />
    </Card>
  );
}
