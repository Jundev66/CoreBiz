import type { z } from 'zod';
import { forgetFailure } from '@/api/last-error';

/**
 * Per-field shape errors, carrying a translation key the screen knows how to render.
 *
 * WHY `issue.message` IS NOT PASSED THROUGH, as the business forms used to do: `Field`
 * renders `t('errors.' + message)`, so the zod message IS the translation key. That works
 * while every validation carries a hand-written message, and silently breaks as soon as
 * one does not: a `.max(24)` without a message yields the library's default text, and the
 * field shows `errors.Too big: expected string to have <=24 characters`.
 *
 * It actually happened with `Importe invalido`: typing `1.500,00` into a credit limit —
 * the natural way to write it in Venezuela — rendered `errors.Importe invalido` raw.
 *
 * There is a second reason that makes this mandatory rather than tidy: zod issue codes
 * change between major versions (`invalid_string` in v3, `invalid_format` in v4). If the
 * library's text reaches the UI, a dependency upgrade leaves untranslated keys on screen
 * without failing any test. `fieldErrorsOf` in `auth.ts` has mapped by code from the start;
 * this extends it to the other forms, except that here the message IS kept when it is one
 * of the catalogue keys, because `Required` or `InvalidAmount` say more than "too short".
 */
const CATALOGUE = new Set([
  'Required',
  'TooLong',
  'TooShort',
  'InvalidFormat',
  'InvalidAmount',
  'OutOfRange',
]);

export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const byField: Record<string, string> = {};

  for (const issue of error.issues) {
    // First level only: `lines[1].unitPrice` has no input to attach to, and that error
    // reaches the user another way — the form-level notice — with its own text.
    const field = issue.path[0];
    if (typeof field !== 'string' || field in byField) continue;

    byField[field] = CATALOGUE.has(issue.message) ? issue.message : keyFor(issue);
  }

  return byField;
}

/**
 * The key for an issue that carried no message of its own.
 *
 * `origin` tells "the text is short" apart from "the number is small"; without it a
 * percentage below the minimum would say "the field is too short", which is not the
 * problem.
 */
function keyFor(issue: z.core.$ZodIssue): string {
  if (issue.code === 'too_small') return issue.origin === 'string' ? 'TooShort' : 'OutOfRange';
  if (issue.code === 'too_big') return issue.origin === 'string' ? 'TooLong' : 'OutOfRange';

  // Everything else — wrong type, format, union, unknown key — is a shape problem, which
  // is exactly what `InvalidFormat` says. An exhaustive `switch` over zod codes would need
  // editing on every library release only to return the same thing.
  return 'InvalidFormat';
}

/**
 * A SHAPE rejection, with the two things that must always happen when one occurs.
 *
 * 1. Forget the previous explanation. Field errors are deliberately not explained in the
 *    help panel — the message sits under the field that caused it, with the field name in
 *    it, and a card saying "check the field" next to a field already in red only gets in
 *    the way (`FIELD_SHAPE_KINDS` in `@corebiz/contracts`). The actual defect was what was
 *    left in its place: if something else had failed earlier, the panel kept explaining
 *    THAT error, already solved, for five minutes while the screen pointed at a different
 *    problem. Idle, the panel tells the truth; explaining the old error, it does not.
 *
 * 2. Never return an empty `fieldErrors`. Forms render the general notice only when there
 *    are NO field errors, and an empty object is still truthy: an issue whose path does not
 *    start with a field name — a check on the whole object — left the screen with no notice
 *    at all. A form that does nothing on "Save" and says nothing is the worst outcome.
 *
 * Returns a slice of the state rather than the whole state to avoid importing
 * `ActionState`, which lives in `customers.ts` and is imported by half the module: that
 * would be a cycle.
 */
export async function formRejection(
  error?: z.ZodError,
): Promise<{ readonly fieldErrors?: Readonly<Record<string, string>> }> {
  await forgetFailure();

  if (error === undefined) return {};

  const fieldErrors = fieldErrorsOf(error);
  return Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {};
}
