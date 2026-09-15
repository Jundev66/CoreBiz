import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getTranslations, getFormatter } from 'next-intl/server';
import { MailOpen } from 'lucide-react';
import { accessTokenOrRedirect } from '@/api/client';
import { acceptInvitationViaApi, previewInvitationViaApi } from '@/api/onboarding';
import { currentUser, supabaseIsConfigured, ACTIVE_TENANT_COOKIE } from '@/auth/supabase';
import { buttonClasses } from '@/ui/button';
import { Logo } from '@/ui/logo';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('invitation.title'), robots: { index: false, follow: false } };
}

/**
 * Aceptar una invitacion.
 *
 * Tres situaciones y cada una con su salida:
 *
 *   1. Sin sesion → se manda a acceder o a registrarse, conservando el token en
 *      la URL de vuelta. Quien recibe una invitacion casi nunca tiene cuenta
 *      todavia, asi que perder el token en ese salto seria perder la invitacion.
 *   2. Con sesion y token valido → se muestra a que empresa y con que papel, y
 *      se pide confirmacion. Aceptar sin ensenar que se acepta es pedir un clic
 *      a ciegas.
 *   3. Token invalido, caducado, revocado o de otra direccion → el mismo mensaje
 *      para los cuatro. Distinguirlos convertiria esta pantalla en un
 *      comprobador de invitaciones ajenas.
 *
 * La aceptacion va por POST, nunca por el simple hecho de abrir el enlace. Un
 * GET que cambia el estado lo dispara cualquier previsualizacion de enlace de un
 * chat o un antivirus de correo — y la invitacion quedaria consumida antes de
 * que la persona la viese.
 */
export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = await getTranslations();
  const format = await getFormatter();

  const { token } = await searchParams;

  if (token === undefined || token === '') return <Invalid />;

  // Sin Supabase configurado no hay sesiones que crear, asi que no hay invitacion
  // que aceptar. Se dice en lugar de fallar con un error de conexion.
  if (!supabaseIsConfigured()) {
    return (
      <Card title={t('invitation.title')}>
        <p className="text-sm text-muted">{t('invitation.needsDatabase')}</p>
      </Card>
    );
  }

  const user = await currentUser();
  if (user === null) {
    // El token viaja de vuelta para no perderlo al ir a crear la cuenta.
    const next = `/invitations/accept?token=${encodeURIComponent(token)}`;
    return (
      <Card title={t('invitation.title')}>
        <p className="text-sm text-ink-soft">{t('invitation.signInFirst')}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/signup?next=${encodeURIComponent(next)}`}
            className={buttonClasses({ className: 'sm:flex-1' })}
          >
            {t('auth.signup.submit')}
          </Link>
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className={buttonClasses({ variant: 'secondary', className: 'sm:flex-1' })}
          >
            {t('auth.login.submit')}
          </Link>
        </div>
      </Card>
    );
  }

  const preview = await previewInvitationViaApi(await accessTokenOrRedirect(), token);

  if (preview === null) return <Invalid />;

  async function accept(formData: FormData): Promise<void> {
    'use server';

    const raw = formData.get('token');
    if (typeof raw !== 'string') redirect('/');

    const result = await acceptInvitationViaApi(await accessTokenOrRedirect(), raw);
    if (!result.ok) redirect('/invitations/accept');

    // Se entra directamente a la empresa recien aceptada, sin obligar a buscarla
    // en el selector. Es lo que la persona acaba de pedir.
    (await cookies()).set(ACTIVE_TENANT_COOKIE, result.tenantId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });

    redirect('/');
  }

  return (
    <Card title={t('invitation.title')}>
      <div className="flex items-start gap-3 rounded-control bg-brand-soft px-4 py-3">
        <MailOpen
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-brand"
          strokeWidth={2}
        />
        <p className="text-sm text-ink">
          {t('invitation.invitedTo', {
            business: preview.tenantName,
            role: t(`roles.${preview.role}`),
          })}
        </p>
      </div>
      <p className="mt-3 text-sm text-muted">
        {t('invitation.expires', {
          date: format.dateTime(preview.expiresAt, { dateStyle: 'medium' }),
        })}
      </p>

      <form action={accept} className="mt-6">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className={buttonClasses({ size: 'lg', block: true })}>
          {t('invitation.accept')}
        </button>
      </form>
    </Card>
  );
}

async function Invalid() {
  const t = await getTranslations();
  return (
    <Card title={t('invitation.invalidTitle')}>
      <p className="text-sm text-muted">{t('invitation.invalidBody')}</p>
      <Link
        href="/"
        className={buttonClasses({ variant: 'secondary', block: true, className: 'mt-6' })}
      >
        {t('common.back')}
      </Link>
    </Card>
  );
}

/** The account-screen frame: the same wash, logo and centred card as `(auth)/layout`. */
async function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const t = await getTranslations();
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-linear-to-b from-brand-soft to-transparent"
      />

      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo name={t('app.name')} size="lg" />
        </Link>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-md sm:p-8">
          <h1 className="mb-4 text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {children}
        </div>
      </main>

      <footer className="relative mx-auto w-full max-w-md px-6 pb-8">
        <p className="text-center text-xs text-muted">{t('legal.notice')}</p>
      </footer>
    </div>
  );
}
