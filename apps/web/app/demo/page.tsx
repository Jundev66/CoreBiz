import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { RATE_LIMITS } from '@corebiz/application';
import { demoSandboxIsAlive, provisionDemoSandbox } from '@corebiz/infrastructure';
import { activeDriver, DEMO_TENANT_ID } from '@/composition/container';
import { clientFingerprint, rateLimiter } from '@/auth/request-identity';
import { demoConfig, readSandboxCookie, writeSandboxCookie } from '@/demo/sandbox';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('demo.title') };
}

/**
 * La puerta de la demostracion.
 *
 * Crear el sandbox va por POST y NUNCA por el simple hecho de abrir la pagina.
 * Es la decision que mas protege el presupuesto: un GET que provisiona lo
 * dispara cualquier rastreador, cualquier previsualizacion de enlace de un chat
 * y cualquier antivirus de correo. Publicar el enlace en una red social crearia
 * decenas de sandboxes antes de que lo abriese una persona.
 *
 * Si ya hay un sandbox vivo en la cookie, se entra directamente: reutilizar es
 * lo que evita que recargar la pagina cueste una copia entera de la base.
 */
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const t = await getTranslations();
  const { motivo } = await searchParams;

  if (!demoConfig.enabled()) redirect('/login');

  // En modo memoria no hay nada que clonar y la aplicacion ya es la demo.
  if (activeDriver() === 'memory') redirect('/customers');

  const existing = await readSandboxCookie();
  if (existing !== null && (await demoSandboxIsAlive(databaseUrl(), existing))) {
    redirect('/customers');
  }

  async function start(): Promise<void> {
    'use server';

    const fingerprint = await clientFingerprint();

    // Un sandbox por origen y hora. El limite no es por avaricia: cada sandbox
    // es una copia entera de la base de demostracion.
    const decision = await rateLimiter().hit(
      `demoSandbox:${fingerprint}`,
      demoConfig.maxPerHour(),
      RATE_LIMITS.demoSandbox.windowSeconds,
    );
    if (!decision.allowed) redirect('/demo?motivo=limite');

    const result = await provisionDemoSandbox(databaseUrl(), {
      templateTenantId: DEMO_TENANT_ID,
      ipHash: fingerprint,
      ttlHours: demoConfig.ttlHours(),
      maxConcurrent: demoConfig.maxConcurrent(),
    });

    if (!result.ok) {
      // Modo degradado: se sirve la plantilla compartida en solo lectura. El
      // visitante ve el sistema funcionando, que es lo unico que importa — un
      // error de cuota en el enlace del CV es el peor resultado posible.
      redirect('/customers');
    }

    await writeSandboxCookie(result.tenantId);
    redirect('/customers');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{t('demo.title')}</h1>
      <p className="mt-3 text-[var(--color-muted)]">{t('demo.intro')}</p>

      {/*
        Se explica el bloqueo en lugar de dejar la pantalla igual tras pulsar. Un
        boton que no hace nada visible es peor que un "no": la persona lo pulsa
        otras tres veces antes de irse.
      */}
      {motivo === 'limite' && (
        <p
          role="status"
          className="mt-6 rounded-md border border-[var(--color-warn)] bg-[var(--color-warn)]/10 px-4 py-3 text-sm"
        >
          {t('demo.rateLimited')}
        </p>
      )}

      <ul className="mt-6 space-y-2 text-sm text-[var(--color-muted)]">
        <li>· {t('demo.pointOwnCopy')}</li>
        <li>· {t('demo.pointNoSignup')}</li>
        <li>· {t('demo.pointExpires')}</li>
      </ul>

      <form action={start} className="mt-8">
        <button
          type="submit"
          className="w-full rounded-md bg-[var(--color-brand)] px-5 py-3 text-base font-medium text-[var(--color-brand-ink)]"
        >
          {t('demo.start')}
        </button>
      </form>

      <p className="mt-6 text-sm text-[var(--color-muted)]">
        {t('demo.orSignUp')}{' '}
        <Link href="/signup" className="underline underline-offset-4">
          {t('auth.signup.submit')}
        </Link>
      </p>

      <p className="mt-10 text-xs text-[var(--color-muted)]">{t('legal.notice')}</p>
    </main>
  );
}

function databaseUrl(): string {
  return process.env.DATABASE_URL ?? '';
}
