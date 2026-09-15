import type { Metadata } from 'next';
import { getTranslations, getFormatter } from 'next-intl/server';
import { MailOpen } from 'lucide-react';
import { withSession } from '@/api/session';
import { Screen, TableFrame, Empty } from '@/ui/shell';
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
 *
 * Both tables keep ONE set of rows for every width. Below `sm` each row reflows into a
 * card (`grid` on the `tr`, header hidden); from `sm` up it is a plain table row again. A
 * separate phone list would have duplicated the member forms and their element ids.
 */
export default async function TeamPage() {
  const t = await getTranslations();
  const format = await getFormatter();
  const { ctx, data } = await withSession((queries) =>
    Promise.all([queries.admin.team(), queries.admin.pendingInvitations()]),
  );

  /*
   * Without `user:read` there is no team to show: the list of colleagues is exactly what the
   * API denies with a 403, which arrives as `null` instead of taking the screen down. Three of
   * the five roles got here from the settings tab; the tab is no longer rendered for them.
   */
  if (!can(ctx.actor, 'user:read') || data === null) {
    return (
      <Screen title={t('settings.title')}>
        <SettingsNav current="team" actor={ctx.actor} />
        <NoAccess />
      </Screen>
    );
  }

  const [team, invitations] = data;
  const canManage = ctx.actor.role === 'owner' || ctx.actor.role === 'admin';

  return (
    <Screen title={t('settings.title')} subtitle={t('settings.subtitle')}>
      <SettingsNav current="team" actor={ctx.actor} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="team-heading">
            <h2 id="team-heading" className="mb-3 text-base font-semibold text-ink">
              {t('settings.team.heading')}
            </h2>

            <TableFrame>
              <thead className="hidden sm:table-header-group">
                <tr className="border-b border-line bg-subtle/60">
                  <th scope="col" className={TH}>
                    {t('settings.team.person')}
                  </th>
                  <th scope="col" className={TH}>
                    {t('settings.team.role')}
                  </th>
                  <th scope="col" className={TH}>
                    {t('settings.team.since')}
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
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
            <h2 id="invitations-heading" className="mb-3 text-base font-semibold text-ink">
              {t('settings.team.pendingHeading')}
            </h2>

            {invitations.length === 0 ? (
              <Empty icon={MailOpen}>{t('settings.team.noPending')}</Empty>
            ) : (
              <TableFrame>
                <thead className="hidden sm:table-header-group">
                  <tr className="border-b border-line bg-subtle/60">
                    <th scope="col" className={TH}>
                      {t('auth.email')}
                    </th>
                    <th scope="col" className={TH}>
                      {t('settings.team.role')}
                    </th>
                    <th scope="col" className={TH}>
                      {t('settings.team.expires')}
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      <span className="sr-only">{t('settings.team.actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((invitation) => (
                    <tr
                      key={invitation.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 transition-colors last:border-0 hover:bg-subtle/40 sm:table-row sm:p-0"
                    >
                      <td className="order-1 col-span-2 font-medium break-all text-ink sm:px-4 sm:py-3 sm:break-normal">
                        {invitation.email}
                      </td>
                      <td className="order-3 text-ink-soft sm:px-4 sm:py-3">
                        {t(`roles.${invitation.role}`)}
                      </td>
                      <td className="order-2 col-span-2 text-xs text-muted sm:px-4 sm:py-3 sm:text-sm sm:whitespace-nowrap">
                        <span className="sm:hidden">{t('settings.team.expires')}: </span>
                        {format.dateTime(invitation.expiresAt, { dateStyle: 'medium' })}
                      </td>
                      <td className="order-4 text-right sm:px-4 sm:py-3">
                        {canManage && (
                          <form action={revokeInvitationAction}>
                            <input type="hidden" name="invitationId" value={invitation.id} />
                            <button
                              type="submit"
                              className="text-sm font-medium text-danger-ink underline-offset-4 hover:underline"
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

        <aside
          aria-labelledby="invite-heading"
          className="rounded-card border border-line bg-surface p-5 shadow-xs lg:sticky lg:top-6"
        >
          <h2 id="invite-heading" className="text-base font-semibold text-ink">
            {t('settings.team.inviteHeading')}
          </h2>
          <p className="mt-1 mb-5 text-sm text-muted">{t('settings.team.inviteDescription')}</p>

          {canManage ? (
            <InviteForm />
          ) : (
            <p className="text-sm text-muted">{t('settings.readOnlyNotice')}</p>
          )}
        </aside>
      </div>
    </Screen>
  );
}

const TH = 'px-4 py-2.5 text-xs font-medium tracking-wide text-muted uppercase';
