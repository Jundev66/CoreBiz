import { getTranslations } from 'next-intl/server';
import { Moon, Sun } from 'lucide-react';
import { setThemeAction } from '@/actions/theme';
import { buttonClasses } from '@/ui/button';
import { readTheme } from '@/ui/theme';

/** The light/dark switch: a one-button form that asks for the other theme. */
export async function ThemeToggle() {
  const [t, theme] = await Promise.all([getTranslations(), readTheme()]);
  const next = theme === 'dark' ? 'light' : 'dark';
  const Icon = next === 'dark' ? Moon : Sun;

  return (
    <form action={setThemeAction}>
      <input type="hidden" name="theme" value={next} />
      <button
        type="submit"
        className={buttonClasses({ variant: 'secondary', size: 'sm', block: true })}
      >
        <Icon aria-hidden="true" className="size-4" strokeWidth={2} />
        {next === 'dark' ? t('theme.toDark') : t('theme.toLight')}
      </button>
    </form>
  );
}
