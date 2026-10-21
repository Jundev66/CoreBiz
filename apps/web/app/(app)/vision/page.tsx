import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { can } from '@corebiz/domain';
import { assistantStatus } from '@/api/ai';
import { apiForRequest } from '@/api/session';
import { Screen } from '@/ui/shell';
import { Card } from '@/ui/primitives';
import { NoAccess } from '@/ui/no-access';
import { VisionScan } from '@/ui/vision';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('vision.title') };
}

/**
 * La pantalla de lectura de documentos.
 *
 * Sube una foto o archivo de un documento de recepción y muestra la extracción validada.
 * Si la empresa tiene un proveedor de IA configurado (OpenAI, Anthropic, Gemini, Ollama),
 * se procesa en tiempo real con el modelo de la empresa.
 * Si no está configurado, la API responde en modo demostración para exhibir la capacidad.
 */
export default async function VisionPage() {
  const t = await getTranslations();
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'assistant:use')) {
    return (
      <Screen title={t('vision.title')}>
        <NoAccess />
      </Screen>
    );
  }

  const aiStatus = await assistantStatus().catch(() => null);

  return (
    <Screen title={t('vision.title')} subtitle={t('vision.subtitle')}>
      <section aria-labelledby="vision-heading" className="max-w-3xl">
        <h2 id="vision-heading" className="text-base font-semibold text-ink">
          {t('vision.heading')}
        </h2>
        <p className="mt-1 mb-5 text-sm text-muted">{t('vision.description')}</p>

        <Card className="p-5 sm:p-6">
          <VisionScan title={t('vision.scanTitle')} aiStatus={aiStatus} />
        </Card>
      </section>
    </Screen>
  );
}
