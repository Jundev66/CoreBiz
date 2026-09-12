import type { Metadata } from 'next';
import { getTranslations, getFormatter } from 'next-intl/server';
import { apiForRequest } from '@/api/session';
import { Shell, TableFrame, Empty } from '@/ui/shell';
import { SettingsNav } from '@/ui/settings-nav';
import { InviteForm } from '@/ui/invite-form';
import { MemberRow } from '@/ui/member-row';
import { revokeInvitationAction } from '@/actions/administration';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('settings.tabs.team') };
}

/**
 * El equipo: quien esta dentro y quien esta invitado.
 *
 * La cuota de usuarios se muestra arriba y no escondida al fondo, porque es la
 * informacion que decide si tiene sentido rellenar el formulario de invitacion.
 * Enterarse del limite despues de escribir el correo es la peor forma de
 * descubrirlo.
 *
 * Una invitacion pendiente OCUPA plaza. Se dice en pantalla en lugar de
 * dejarlo como una sorpresa aritmetica: con dos plazas y una invitacion viva, el
 * contador marca 2 de 2 aunque solo haya una persona dentro.
 */
export default async function TeamPage() {
  const t = await getTranslations();
  const format = await getFormatter();
  const { ctx, session, queries } = await apiForRequest();

  /*
   * Without `user:read` the team is not requested: the list of colleagues is exactly what
   * the API denies with a 403, and that 403 took the screen down. Three of the five roles
   * got here from the settings tab; the tab is no longer rendered for them.
   */
  if (!can(ctx.actor, 'user:read')) {
    return (
      <Shell ctx={ctx} session={session} title={t('settings.title')}>
        <SettingsNav current="team" actor={ctx.actor} />
        <NoAccess />
      </Shell>
    );
  }

  const [team, invitations] = await Promise.all([
    queries.admin.team(),
    queries.admin.pendingInvitations(),
  ]);
  const canManage = ctx.actor.role === 'owner' || ctx.actor.role === 'admin';

  return (
    <Shell
      ctx={ctx}
      session={session}
      title={t('settings.title')}
      subtitle={t('settings.subtitle')}
    >
      <SettingsNav current="team" actor={ctx.actor} />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-10">
          <section aria-labelledby="team-heading">
            <h2 id="team-heading" className="mb-4 text-lg font-medium">
              {t('settings.team.heading')}
            </h2>

            <TableFrame>
              <thead>
                <tr className="border-b border-[var(--color-line)] text-[var(--color-muted)]">
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('settings.team.person')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('settings.team.role')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('settings.team.since')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">{t('settings.team.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {team.map((member) => (
                  <MemberRow
                    key={member.userId}
                    member={{
                      userId: member.userId,
                      email: member.email,
                      role: member.role,
                      isYou: member.isYou,
                      since: format.dateTime(member.joinedAt, { dateStyle: 'medium' }),
                    }}
                    canManage={canManage}
                  />
                ))}
              </tbody>
            </TableFrame>
          </section>

          <section aria-labelledby="invitations-heading">
            <h2 id="invitations-heading" className="mb-4 text-lg font-medium">
              {t('settings.team.pendingHeading')}
            </h2>

            {invitations.length === 0 ? (
              <Empty>{t('settings.team.noPending')}</Empty>
            ) : (
              <TableFrame>
                <thead>
                  <tr className="border-b border-[var(--color-line)] text-[var(--color-muted)]">
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t('auth.email')}
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t('settings.team.role')}
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t('settings.team.expires')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      <span className="sr-only">{t('settings.team.actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((invitation) => (
                    <tr
                      key={invitation.id}
                      className="border-b border-[var(--color-line)] last:border-0"
                    >
                      <td className="px-4 py-3">{invitation.email}</td>
                      <td className="px-4 py-3">{t(`roles.${invitation.role}`)}</td>
                      <td className="px-4 py-3 text-[var(--color-muted)]">
                        {format.dateTime(invitation.expiresAt, { dateStyle: 'medium' })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canManage && (
                          <form action={revokeInvitationAction}>
                            <input type="hidden" name="invitationId" value={invitation.id} />
                            <button
                              type="submit"
                              className="text-sm text-[var(--color-danger-ink)] underline underline-offset-4"
                            >
                              {t('settings.team.revoke')}
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableFrame>
            )}
          </section>
        </div>

        <aside aria-labelledby="invite-heading">
          <h2 id="invite-heading" className="mb-1 text-lg font-medium">
            {t('settings.team.inviteHeading')}
          </h2>
          <p className="mb-6 text-sm text-[var(--color-muted)]">
            {t('settings.team.inviteDescription')}
          </p>

          {canManage ? (
            <InviteForm />
          ) : (
            <p className="text-sm text-[var(--color-muted)]">{t('settings.readOnlyNotice')}</p>
          )}
        </aside>
      </div>
    </Shell>
  );
}
