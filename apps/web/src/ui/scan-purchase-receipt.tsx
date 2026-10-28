'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { VisionExtractResponse } from '@synapse-vision/core';
import type { AssistantStatusView } from '@/api/ai';
import { VisionScan, type DirectActionResult } from '@/ui/vision';
import { Card } from '@/ui/primitives';
import { generateGoodsReceiptFromVisionAction } from '@/actions/vision';

export const SCANNED_PURCHASE_RECEIPT_KEY = 'corebiz_scanned_purchase_receipt';

export function ScanPurchaseReceipt({
  aiStatus,
}: {
  readonly aiStatus?: AssistantStatusView | null | undefined;
}) {
  const t = useTranslations('purchases');
  const tVision = useTranslations('vision');
  const router = useRouter();

  const handleApplyExtraction = useCallback(
    (res: VisionExtractResponse): void => {
      try {
        sessionStorage.setItem(SCANNED_PURCHASE_RECEIPT_KEY, JSON.stringify(res));
      } catch (err) {
        console.error('Failed to store scanned purchase receipt in sessionStorage', err);
      }
      router.push('/purchases/new');
    },
    [router],
  );

  const handleDirectAction = useCallback(
    async (res: VisionExtractResponse): Promise<DirectActionResult> => {
      const result = await generateGoodsReceiptFromVisionAction(res.extraction, res.matches);
      return {
        ok: result.ok,
        error: result.error,
        number: result.receiptNumber,
        id: result.receiptId,
        entityName: result.supplierName,
        viewHref: result.receiptId ? `/purchases/${result.receiptId}` : undefined,
        successTitle: result.receiptNumber
          ? t('directRegisterSuccess', { number: result.receiptNumber })
          : undefined,
        successSubtitle: result.supplierName
          ? t('directRegisterSupplier', { supplier: result.supplierName })
          : undefined,
      };
    },
    [t],
  );

  return (
    <Card className="mx-auto max-w-3xl p-4 sm:p-6 shadow-xs">
      <VisionScan
        title={tVision('scanTitle')}
        aiStatus={aiStatus}
        onApplyExtraction={handleApplyExtraction}
        applyButtonLabel={t('applyExtraction')}
        onDirectAction={handleDirectAction}
        directActionLabel={t('registerReceiptDirectly')}
        directActionTitle="Registrar entrada de compras en inventario"
        directActionDescription="Podés registrar la recepción directamente afectando inventario de manera transaccional, o abrir los datos en el formulario para editarlos antes de guardar."
      />
    </Card>
  );
}
