import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Clock, KeyRound, ShieldCheck } from 'lucide-react';
import { get } from '@/api/client';
import { activeDriver } from '@/api/session';
import { currentUser, supabaseIsConfigured } from '@/auth/supabase';
import { demoConfig, signupConfig } from '@/demo/sandbox';
import { DemoStart, type DemoSessionState } from '@/ui/demo-start';
import { Logo } from '@/ui/logo';

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

  const points = [
    { Icon: ShieldCheck, text: t('demo.pointOwnCopy') },
    { Icon: KeyRound, text: t('demo.pointCredentials') },
    { Icon: Clock, text: t('demo.pointExpires') },
  ];

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-linear-to-b from-brand-soft via-canvas to-canvas"
      />

      <header className="relative mx-auto flex h-16 w-full max-w-5xl items-center px-4 sm:px-6">
        <Link href="/" className="rounded-control">
          <Logo name={t('app.name')} />
        </Link>
      </header>

      <main className="relative mx-auto grid w-full max-w-5xl flex-1 content-center items-center gap-8 px-4 pt-4 pb-12 sm:px-6 lg:grid-cols-[1fr_26rem] lg:gap-16">
        <div>
          <p className="inline-flex items-center gap-2 rounded-pill border border-brand-line bg-surface px-3 py-1 text-xs font-medium text-brand shadow-xs">
            <span aria-hidden="true" className="size-1.5 rounded-pill bg-success" />
            {t('home.heroBadge')}
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-balance text-ink sm:text-4xl">
            {t('demo.title')}
          </h1>
          <p className="mt-3 max-w-lg text-lg text-pretty text-ink-soft">{t('demo.intro')}</p>

          {session === 'none' && (
            <ul className="mt-8 space-y-4">
              {points.map(({ Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-control bg-surface text-brand shadow-xs ring-1 ring-line">
                    <Icon aria-hidden="true" className="size-4" strokeWidth={2} />
                  </span>
                  <span className="pt-1.5 text-sm text-ink-soft">{text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-line bg-surface p-5 shadow-lg sm:p-7">
          <DemoStart session={session} />

          {signupConfig.enabled() && (
            <p className="mt-5 text-center text-sm text-muted">
              {t('demo.orSignUp')}{' '}
              <Link
                href="/signup"
                className="font-medium text-brand underline-offset-4 hover:underline"
              >
                {t('auth.signup.submit')}
              </Link>
            </p>
          )}
        </div>
      </main>

      <footer className="relative mx-auto w-full max-w-5xl px-4 pb-8 sm:px-6">
        <p className="text-xs text-muted">{t('legal.notice')}</p>
      </footer>
    </div>
  );
}
