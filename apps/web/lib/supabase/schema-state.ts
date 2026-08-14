/**
 * Recognises "this table/column doesn't exist yet" as distinct from a real
 * query failure.
 *
 * Migrations in this repo are routinely written and reviewed before they are
 * applied (the Supabase CLI needs an interactive login, so a push often lands
 * a session later). In that window a page whose table is missing should show
 * its own empty/setup state — the one it will show anyway until data arrives
 * — rather than a 500 that reads like a code bug.
 *
 * Deliberately narrow: only the four codes that mean "not in the schema".
 * Anything else still throws, because swallowing real errors here would hide
 * exactly the failures worth seeing.
 */
export function isMissingSchemaError(error: { code?: string } | null | undefined): boolean {
  if (!error?.code) return false;
  return (
    error.code === "42P01" || // undefined_table
    error.code === "42703" || // undefined_column
    error.code === "PGRST205" || // table absent from PostgREST's schema cache
    error.code === "PGRST204" // column absent from PostgREST's schema cache
  );
}
