// Single extension point for Auth (deferred this round). Every server
// action/route handler that needs to know "who is acting" calls this
// instead of reading a session directly. When Supabase Auth ships, replace
// only this function's body — no call sites need to change.
export function getCurrentActor(): string {
  return "agency_owner";
}
