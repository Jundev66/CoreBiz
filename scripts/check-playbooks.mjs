/**
 * Checks the support catalogue. Invoked by `scripts/check-playbooks.sh`.
 *
 * It reads the contract with text searches instead of importing it: the contract is
 * TypeScript, and this guardian runs before any compilation. That is why the lists in
 * `packages/contracts/src/support.ts` are plain literals — so this is possible without
 * pulling a compiler into a verification script.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CONTRACT = 'packages/contracts/src/support.ts';
const src = readFileSync(CONTRACT, 'utf8');
const es = JSON.parse(readFileSync('apps/web/messages/es.json', 'utf8'));
const en = JSON.parse(readFileSync('apps/web/messages/en.json', 'utf8'));

/** The quoted keys of a `X = [...] as const` list. */
function list(name) {
  const from = src.indexOf(name + ' = [');
  const to = src.indexOf('] as const', from);
  if (from === -1 || to === -1) {
    console.error(`ERROR: ${name} is missing from the contract, or changed shape.`);
    process.exit(1);
  }
  return (src.slice(from, to).match(/'[A-Z]\w+'/g) ?? []).map((s) => s.slice(1, -1));
}

const routesFrom = src.indexOf('PLAYBOOK_ROUTES');
const routesTo = src.indexOf('\n};', routesFrom);
if (routesFrom === -1 || routesTo === -1) {
  console.error('ERROR: PLAYBOOK_ROUTES is missing from the contract, or changed shape.');
  process.exit(1);
}
const routesBlock = src.slice(routesFrom, routesTo);

/** key -> screen it sends people to, or null if there is none. */
const targets = new Map(
  (routesBlock.match(/^ {2}[A-Z]\w+: .+,$/gm) ?? []).map((line) => {
    const key = line.slice(2, line.indexOf(':'));
    const value = line.slice(line.indexOf(':') + 2, -1).trim();
    return [key, value === 'null' ? null : value.slice(1, -1)];
  }),
);
const withCard = [...targets.keys()];

const declared = new Set([
  ...withCard,
  ...list('ESCALATE_ONLY_KINDS'),
  ...list('FIELD_SHAPE_KINDS'),
  ...list('NO_PANEL_KINDS'),
  ...list('INTERNAL_KINDS'),
]);

/** The four namespaces where the UI looks up an error's text. */
const namespaces = { es: namespacesOf(es), en: namespacesOf(en) };
function namespacesOf(msgs) {
  return [msgs.errors, msgs.settings.errors, msgs.purchases.errors, msgs.auth.errors];
}

/** The text of a dotted key, or undefined if it does not resolve to a string. */
function text(msgs, key) {
  const value = key.split('.').reduce((node, part) => node?.[part], msgs);
  return typeof value === 'string' ? value : undefined;
}

/**
 * Whether a URL path has a page, the way the App Router resolves it.
 *
 * A folder in parentheses is a route GROUP: it organises files and adds nothing to the URL.
 * The screens moved under `(app)` so they share one layout, and a check that only knew about
 * `(auth)` reported every link to them as leading nowhere. Every group at the root of `app`
 * is tried, whatever it is called.
 */
const APP_ROOT = 'apps/web/app';
const ROUTE_GROUPS = readdirSync(APP_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^\(.+\)$/.test(entry.name))
  .map((entry) => entry.name);

function screenExists(route) {
  const parts = route.split('/').filter(Boolean).join('/');
  return ['', ...ROUTE_GROUPS].some((group) =>
    existsSync(join(APP_ROOT, group, parts, 'page.tsx')),
  );
}

const failures = [];

// ── Pass 1: every key with a card has it COMPLETE and in both languages ──────────
for (const key of withCard) {
  for (const [lang, msgs] of [
    ['es', es],
    ['en', en],
  ]) {
    const card = msgs.assistant?.playbooks?.[key];
    if (card === undefined) {
      failures.push(`${lang}.json: missing card assistant.playbooks.${key}`);
      continue;
    }
    for (const field of ['what', 'do']) {
      if (typeof card[field] !== 'string' || card[field].trim() === '') {
        failures.push(`${lang}.json: assistant.playbooks.${key}.${field} is empty`);
      }
    }
  }
}

// ── Pass 1b: a key with a card MUST be translatable ──────────────────────────────
//
// If a key reaches the screen and is in none of the four namespaces, next-intl renders the
// raw key: the user reads "GoodsReceiptNotFound" inside a red box. Nothing breaks, nothing
// is logged, and only whoever hits that error sees it — which in an ERP may be in three
// months.
for (const key of withCard) {
  for (const [lang, nss] of Object.entries(namespaces)) {
    if (!nss.some((ns) => key in ns)) {
      failures.push(`${lang}.json: ${key} has a card but no translation in any namespace`);
    }
  }
}

// ── Pass 1c: a link that leads nowhere is worse than no link ─────────────────────
for (const [key, route] of targets) {
  if (route === null) continue;
  if (!screenExists(route)) failures.push(`${key}: the link "${route}" leads to no screen`);
}

// ── Pass 2: no key in the code is left undeclared ────────────────────────────────
const inCode = readFileSync(process.env.KINDS, 'utf8').split('\n').filter(Boolean);
for (const key of inCode.filter((k) => !declared.has(k))) {
  failures.push(`${key}: appears in the code and is in no catalogue list`);
}

// ── Pass 3: the keys the web asks the assistant for exist ────────────────────────
//
// Cards are checked above; the panel FRAME — labels, idle text, the breakdown — was not.
// That is how `assistant.reference` slipped through: the panel used it, it existed in
// neither language, and the raw key was rendered under the label that should have said
// "Reference". Parity checks miss it — they compare one language with the other, and it
// was missing from both — and the tests looked for `assistant.playbooks`.
//
// Only LITERAL keys are checked. Keys composed at runtime
// (`assistant.playbooks.${kind}.what`) are already covered by passes 1 and 2.
const requested = new Set();
for (const root of ['apps/web/src', 'apps/web/app']) {
  for (const relative of readdirSync(root, { recursive: true })) {
    if (!/\.(ts|tsx)$/.test(relative)) continue;
    const code = readFileSync(join(root, relative), 'utf8');
    for (const [, key] of code.matchAll(/\bt\(\s*'(assistant\.[A-Za-z0-9_.]+)'/g)) {
      requested.add(key);
    }
  }
}
for (const key of requested) {
  for (const [lang, msgs] of [
    ['es', es],
    ['en', en],
  ]) {
    if (text(msgs, key) === undefined) {
      failures.push(`${lang}.json: the web requests ${key} and it does not exist`);
    }
  }
}

if (failures.length === 0) {
  console.log(
    `OK: ${withCard.length} complete cards in both languages; ` +
      `${declared.size} declared keys cover the ${inCode.length} found in code; ` +
      `all ${requested.size} literal assistant keys exist.`,
  );
  process.exit(0);
}

console.error(`ERROR: ${failures.length} problem(s) in the support catalogue:`);
for (const f of failures) console.error(`  ${f}`);
console.error('-------------------------------------------------------------------');
console.error(`A new error key goes into ONE of the five lists in ${CONTRACT}:`);
console.error('  PLAYBOOK_ROUTES      if it can be explained with something to do');
console.error('  ESCALATE_ONLY_KINDS  if there is nothing to explain and support must know');
console.error('  FIELD_SHAPE_KINDS    if it is always rendered next to its field');
console.error(
  '  NO_PANEL_KINDS       if it only happens on a screen that does not mount the frame',
);
console.error('  INTERNAL_KINDS       if a use case translates it and it never leaves the API');
console.error('-------------------------------------------------------------------');
process.exit(1);
