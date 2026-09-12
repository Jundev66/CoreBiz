/**
 * The catalogue of what can go wrong, and what to do about it.
 *
 * This file exists because the system ALREADY describes itself: `errorKind` is not text,
 * it is a key, and `Result` versus `throw` already separates "a rule said no" from
 * "something broke". The assistant infers none of that — it reads it from here.
 *
 * There is no text in this file on purpose: text lives in `apps/web/messages/*.json`
 * because the UI speaks two languages. What lives here is what is NOT translated: which
 * keys exist, which are explained, which are escalated, and which screen someone who is
 * stuck gets sent to.
 */

/**
 * What is NEVER explained.
 *
 * A 500 has no explanation to give to whoever suffers it: the real message contains table
 * names and sometimes the failing value, and that stays in the log. And a server that does
 * not answer does not get better because someone reads a paragraph about it.
 *
 * The practical consequence is what matters: for these, the assistant does not offer a
 * card, it offers to report the case. That is the line between user support and technical
 * support, and the assistant does not draw it — it was already drawn in
 * `packages/domain/src/shared/result.ts`.
 */
export const ESCALATE_ONLY_KINDS = [
  'Unexpected',
  'UnexpectedWithIncident',
  'ApiUnavailable',
  'AuthUnavailable',
] as const;

export type EscalateOnlyKind = (typeof ESCALATE_ONLY_KINDS)[number];

/**
 * Keys that are ALWAYS rendered next to their field, never as a general notice.
 *
 * They have no card, and that is not an oversight: `<Field>` already shows them under the
 * input that caused them, with the field name in the text. A card saying "check the field"
 * next to a field already marked in red adds nothing and gets in the way.
 *
 * They are declared — instead of simply absent — so the guardian can require every key in
 * the system to be in ONE of the lists. A new key missing from all of them turns the build
 * red; one silently omitted would not.
 */
export const FIELD_SHAPE_KINDS = [
  'Required',
  'TooShort',
  'TooLong',
  'InvalidFormat',
  'OutOfRange',
] as const;

/**
 * Keys that occur on screens WITHOUT the panel.
 *
 * They have no card for a structural reason: the panel is mounted inside `Shell`, and
 * neither `app/(auth)/layout.tsx`, `/demo` nor `/waking-up` mounts it — they are centred
 * cards without navigation. Writing cards for them would be writing text nobody can read.
 *
 * If one of those screens ever mounts `Shell`, these keys must move to `PLAYBOOK_ROUTES`.
 */
export const NO_PANEL_KINDS = [
  'InvalidCredentials',
  'EmailAlreadyRegistered',
  'SignUpFailed',
  'SignUpClosed',
  'ResetLinkExpired',
  // The demo does not start. Lives on /demo, a card without the app frame.
  'Unavailable',
] as const;

/**
 * Keys that NEVER leave the application.
 *
 * They are the internal vocabulary of the value objects — `Money`, `Quantity`,
 * `ExchangeRate` — and of `Plan.parse`. A use case receives them and TRANSLATES them before
 * returning: `create-product` turns any `Money.of` failure into `InvalidPrice` or
 * `InvalidCost`, which is what a person can understand and fix.
 *
 * Verified: no use case error union includes them, directly or by carrying a whole
 * `MoneyError`. If one ever did, it would leave the API as a 422 with the raw key on screen
 * — this list would no longer be true and the key would have to move to `PLAYBOOK_ROUTES`.
 *
 * `InvalidAmount` is ALSO the message of `decimalStringSchema`, but that one is a field
 * error rendered by `<Field>`, not a key that crosses the API.
 */
export const INTERNAL_KINDS = [
  'InvalidAmount',
  'NegativeAmount',
  'AmountTooLarge',
  'TooManyDecimals',
  'CurrencyMismatch',
  'NonPositiveQuantity',
  'NonPositiveRate',
  'UnconvertiblePair',
  'UnknownPlan',
] as const;

/**
 * Where someone who is stuck gets sent.
 *
 * `null` means "there is nowhere to go", and that is a legitimate answer: for `Forbidden`
 * no screen fixes anything, and offering a random link only walks the person around. A card
 * without a link still explains.
 */
export const PLAYBOOK_ROUTES: Readonly<Record<string, string | null>> = {
  // Permissions and plan. No screen solves these: if you cannot, you cannot.
  Forbidden: null,
  QuotaExceeded: null,
  FeatureNotAvailable: null,

  // The team.
  OnlyOwnerGrantsOwnership: '/settings/team',
  OnlyOwnerManagesOwners: '/settings/team',
  LastOwner: '/settings/team',
  CannotRemoveSelf: '/settings/team',
  CannotInviteOwner: '/settings/team',
  AlreadyMember: '/settings/team',
  AlreadyInvited: '/settings/team',
  UnknownRole: '/settings/team',
  MemberNotFound: '/settings/team',
  InvitationNotFound: '/settings/team',

  // Does not exist, or is not yours — indistinguishable from outside, on purpose.
  CustomerNotFound: '/customers',
  ProductNotFound: '/products',
  DeliveryNoteNotFound: '/delivery-notes',
  SupplierNotFound: '/purchases/suppliers',
  NotFound: null,

  // Business rules.
  InsufficientStock: '/products',
  StockNotTracked: '/products',
  DuplicateSku: '/products',
  DuplicateProduct: null,
  CreditLimitExceeded: '/customers',
  CreditLimitBelowBalance: '/customers',
  InvalidCreditLimit: '/customers',
  NoExchangeRate: '/settings',
  NoLines: null,
  InvalidTransition: '/delivery-notes',
  AlreadyVoided: null,
  GoodsReceiptNotFound: '/purchases',
  InvalidUnitPrice: null,
  DiscountOutOfRange: null,

  // Values the domain rejects as a general notice rather than next to a field.
  InvalidQuantity: null,
  InvalidPrice: null,
  InvalidCost: null,
  InvalidStock: null,
  InvalidEmail: null,
  InvalidTaxRate: '/settings',
  InvalidCurrency: '/settings',
  InvalidExchangeRate: '/settings',

  // Session and account.
  Unauthenticated: '/login',
  NoActiveTenant: '/onboarding',
  TooManyAttempts: null,
  InvalidRequest: null,
  PayloadTooLarge: null,
};

/**
 * The keys that DO have a card, derived from the routes.
 *
 * Derived rather than written twice: a separate list would forget to grow the day someone
 * adds a route, and the mismatch would not error — it would produce a card without a link
 * or a link without a card.
 */
export const SUPPORT_ERROR_KINDS = Object.keys(PLAYBOOK_ROUTES) as readonly string[];

/** Whether this key is escalated instead of explained. */
export function isEscalateOnly(kind: string): boolean {
  return (ESCALATE_ONLY_KINDS as readonly string[]).includes(kind);
}

/**
 * The screen where it gets fixed, if there is one.
 *
 * `Object.hasOwn` rather than direct access: `PLAYBOOK_ROUTES` is an object literal and
 * inherits from `Object.prototype`, so `PLAYBOOK_ROUTES['constructor']` returns the
 * `Object` function, which passed `?? null` and ended up as a link `href`. The key comes
 * from a cookie: it must be able to be anything without meaning anything.
 */
export function playbookRoute(kind: string): string | null {
  return Object.hasOwn(PLAYBOOK_ROUTES, kind) ? (PLAYBOOK_ROUTES[kind] ?? null) : null;
}

/** Whether this key has a written card. Same reason as above for not using `in`. */
export function hasPlaybook(kind: string): boolean {
  return Object.hasOwn(PLAYBOOK_ROUTES, kind);
}

/**
 * The exact shape of an incident reference: `INC-` and eight hex digits.
 *
 * It lives here and not in the API filter because BOTH ends use it: the filter produces it
 * and the web reads it back from a cookie, which is user input. With two definitions, the
 * web's would end up accepting what the API would never emit.
 */
export const INCIDENT_ID_PATTERN = /^INC-[0-9A-F]{8}$/;

/** The last failure, as the web remembers it from one screen to the next. */
export interface LastFailure {
  readonly kind: string;
  readonly incidentId: string | null;
}

/** An error key as the domain produces it: PascalCase, nothing else. */
const KIND_PATTERN = /^[A-Z][A-Za-z]{1,63}$/;

/**
 * Reads the last-error cookie without trusting it.
 *
 * The cookie is `httpOnly`, but that only stops JavaScript from READING it: the browser's
 * user can write it from the developer tools, and an injected script can CREATE it if it
 * does not exist yet. What arrives here is user input:
 *
 *  - An `incidentId` without the exact shape is dropped. Without this, an object in that
 *    field crashed the panel render — which lives in the frame, so every screen went down
 *    at once for five minutes — and any sentence was rendered under the "Reference" label,
 *    looking like official data.
 *  - A `kind` that is not a key drops the whole cookie: with no key there is nothing to
 *    explain, and an idle panel is still useful.
 *
 * Never throws. An exception here would take every screen down at once.
 */
export function parseLastFailure(raw: string): LastFailure | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const { kind, incidentId } = parsed as Record<string, unknown>;
  if (typeof kind !== 'string' || !KIND_PATTERN.test(kind)) return null;

  return {
    kind,
    incidentId:
      typeof incidentId === 'string' && INCIDENT_ID_PATTERN.test(incidentId) ? incidentId : null,
  };
}
