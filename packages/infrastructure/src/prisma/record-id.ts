/**
 * Can this text be the key of a row?
 *
 * On Postgres ids are `uuid`, and not just as a column type: the driver SENDS the value as
 * a uuid. Text that is not one (`abc`, a half-copied id, the tail of an old URL) does not
 * return zero rows — it fails in the database with `22P02 invalid input syntax for type
 * uuid`, surfaces as an exception and reaches the user as a server error with an incident
 * reference. A 500 for a typo in the address bar.
 *
 * It was also a difference between adapters: the in-memory double compares strings, so
 * `/customers/abc` answered 404 there and the default suite could not see the failure.
 * Both halves close the same way — if the text cannot be a key, THERE IS NO ROW, and that
 * is answered without touching the database.
 *
 * Why here and not by validating uuid at the HTTP edge: `recordIdSchema`
 * (`packages/contracts/src/common.ts`) accepts any string on purpose, because the
 * in-memory adapter uses readable ids that are not valid uuids. Requiring uuid in the
 * controller would break the memory driver and the whole BDD suite. This adapter is the
 * only place that knows its keys are uuids.
 *
 * This is not a security control. Asking for a well-formed foreign id still yields 404
 * through the `tenant_id` filter and RLS, not through this function.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isRowKey(id: string): boolean {
  return UUID.test(id);
}

/** The ids that can be keys, for a list query: the rest do not exist. */
export function onlyRowKeys<T extends string>(ids: readonly T[]): T[] {
  return ids.filter(isRowKey);
}
