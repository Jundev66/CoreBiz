'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { THEME_COOKIE, isTheme } from '@/ui/theme';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Switches between the light and the dark theme.
 *
 * A form and not a client toggle: it works with no JavaScript, like switching company. No
 * redirect either — whoever changes the theme stays on the screen they were looking at.
 */
export async function setThemeAction(formData: FormData): Promise<void> {
  const theme = formData.get('theme');
  if (!isTheme(theme)) return;

  (await cookies()).set(THEME_COOKIE, theme, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  });

  // The theme is written by the root layout, which a navigation keeps: refresh it.
  revalidatePath('/', 'layout');
}
