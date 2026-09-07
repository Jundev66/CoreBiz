import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getTranslations, getFormatter } from 'next-intl/server';
import { acceptInvitation, previewInvitation } from '@corebiz/infrastructure';
import { currentUser, supabaseIsConfigured, ACTIVE_TENANT_COOKIE } from '@/auth/supabase';
import { activeDriver } from '@/composition/container';

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

  // En modo memoria no hay invitaciones que aceptar: no hay sesiones ni base de
  // datos. Se dice en lugar de fallar con un error de conexion.
  if (activeDriver() === 'memory' || !supabaseIsConfigured()) {
    return (
      <Card title={t('invitation.title')}>
        <p className="text-sm text-[var(--color-muted)]">{t('invitation.needsDatabase')}</p>
      </Card>
    );
  }

  const user = await currentUser();
  if (user === null) {
    // El token viaja de vuelta para no perderlo al ir a crear la cuenta.
    const next = `/invitations/accept?token=${encodeURIComponent(token)}`;
    return (
      <Card title={t('invitation.title')}>
        <p className="text-sm">{t('invitation.signInFirst')}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/signup?next=${encodeURIComponent(next)}`}
            className="rounded-md bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-[var(--color-brand-ink)]"
          >
            {t('auth.signup.submit')}
          </Link>
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="rounded-md border border-[var(--color-line)] px-4 py-2 text-sm font-medium"
          >
            {t('auth.login.submit')}
          </Link>
        </div>
      </Card>
    );
  }

  const url = process.env.DATABASE_URL ?? '';
  const preview = await previewInvitation(url, user.id, token);

  if (preview === null) return <Invalid />;

  async function accept(formData: FormData): Promise<void> {
    'use server';

    const raw = formData.get('token');
    if (typeof raw !== 'string') redirect('/');

    const session = await currentUser();
    if (session === null) redirect('/login');

    const result = await acceptInvitation(process.env.DATABASE_URL ?? '', session.id, raw);
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
      <p className="text-sm">
        {t('invitation.invitedTo', {
          business: preview.tenantName,
          role: t(`roles.${preview.role}`),
        })}
      </p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        {t('invitation.expires', {
          date: format.dateTime(preview.expiresAt, { dateStyle: 'medium' }),
        })}
      </p>

      <form action={accept} className="mt-6">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="w-full rounded-md bg-[var(--color-brand)] px-5 py-3 text-sm font-medium text-[var(--color-brand-ink)]"
        >
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
      <p className="text-sm text-[var(--color-muted)]">{t('invitation.invalidBody')}</p>
      <Link href="/" className="mt-6 inline-block text-sm underline underline-offset-4">
        {t('common.back')}
      </Link>
    </Card>
  );
}

async function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const t = await getTranslations();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <Link href="/" className="mb-8 block text-center text-2xl font-semibold tracking-tight">
        {t('app.name')}
      </Link>
      <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6 sm:p-8">
        <h1 className="mb-4 text-2xl font-semibold tracking-tight">{title}</h1>
        {children}
      </div>
    </div>
  );
}
