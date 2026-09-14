import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { get } from '@/api/client';
import { activeDriver } from '@/api/session';
import { currentUser, supabaseIsConfigured } from '@/auth/supabase';
import { demoConfig, signupConfig } from '@/demo/sandbox';
import { DemoStart, type DemoSessionState } from '@/ui/demo-start';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('demo.title') };
}

/** Demo accounts are created with this domain (see `provisionDemoSandbox`). */
const DEMO_EMAIL_DOMAIN = '@corebiz.demo';

/**
 * Where a visitor who already has a session stands.
 *
 * `expired`: a demo account whose sandbox is gone but whose user the purge has not deleted
 * yet. Offering "Enter" there led to "your account does not belong to any company" — a dead
 * end on the one page that must never have one. A regular account without a company is not a
 * demo, so it keeps the plain "enter" path to onboarding.
 */
async function sessionState(): Promise<DemoSessionState> {
  if (!supabaseIsConfigured()) return 'none';
  const user = await currentUser();
  if (user === null) return 'none';

  if (!(user.email ?? '').endsWith(DEMO_EMAIL_DOMAIN)) return 'active';
  const session = await get<{ tenant: unknown }>('/v1/session');
  return session.tenant === null ? 'expired' : 'active';
}

/**
 * La pagina que hay detras del enlace del curriculum.
 *
 * Solo PINTA. Crear el visitante ocurre en `startDemoAction`, por POST, y esa
 * separacion es la que impide que un rastreador o la previsualizacion de un
 * enlace en un chat cree una cuenta y una copia de la base cada vez que alguien
 * comparte la direccion.
 */
export default async function DemoPage() {
  const t = await getTranslations();

  if (!demoConfig.enabled()) redirect('/login');

  // En modo memoria no hay nada que clonar ni sesion que crear: la aplicacion
  // entera YA es la demostracion.
  if (activeDriver() === 'memory') redirect('/customers');

  // Quien ya entro no vuelve a ver el boton: ofrecerle crear un segundo visitante a quien
  // ya tiene uno vivo gastaria la cuota de su red sin motivo.
  //
  // Se pasa como dato a `DemoStart` y NO se redirige aqui. Redirigir parece mas
  // limpio y rompe la pantalla: tras una Server Action, Next vuelve a renderizar
  // la ruta actual, y para entonces la accion YA ha iniciado la sesion. El
  // redirect se dispararia en ese segundo render y se llevaria por delante las
  // credenciales antes de que nadie pudiera leerlas.
  const session = await sessionState();

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{t('demo.title')}</h1>
      <p className="mt-3 text-[var(--color-muted)]">{t('demo.intro')}</p>

      {session === 'none' && (
        <ul className="mt-6 list-disc space-y-2 pl-5 text-sm text-[var(--color-muted)] marker:text-[var(--color-line-strong)]">
          <li>{t('demo.pointOwnCopy')}</li>
          <li>{t('demo.pointCredentials')}</li>
          <li>{t('demo.pointExpires')}</li>
        </ul>
      )}

      <DemoStart session={session} />

      {signupConfig.enabled() && (
        <p className="mt-6 text-sm text-[var(--color-muted)]">
          {t('demo.orSignUp')}{' '}
          <Link href="/signup" className="underline underline-offset-4">
            {t('auth.signup.submit')}
          </Link>
        </p>
      )}

      <p className="mt-10 text-xs text-[var(--color-muted)]">{t('legal.notice')}</p>
    </main>
  );
}
