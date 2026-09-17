import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSISTANT_SCREENS } from '@corebiz/application';

/**
 * Every screen the AI assistant may send someone to has to exist.
 *
 * The list lives in the application layer, next to the prompt, and the routes in apps/web.
 * Renaming a folder would leave the model confidently pointing people at a 404, and nothing
 * else would notice.
 */
const APP = join(__dirname, '../../web/app');
const GROUPS = readdirSync(APP, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^\(.+\)$/.test(entry.name))
  .map((entry) => entry.name);

describe('assistant screens', () => {
  it.each(ASSISTANT_SCREENS.map((screen) => [screen.path]))('%s has a page', (path) => {
    const segments = path.split('/').filter(Boolean);
    const found = ['', ...GROUPS].some((group) =>
      existsSync(join(APP, group, ...segments, 'page.tsx')),
    );
    expect(found).toBe(true);
  });
});
