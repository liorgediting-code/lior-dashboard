-- Phase 21: client-initiated "forgot password" requests.
--
-- A client who forgets their portal password can't reset it themselves —
-- crm_password_hash is a one-way hash, so there is nothing to recover, and
-- self-service reset would mean anyone who could reach a client's login URL
-- could take over their portal. Instead the client marks a request; the
-- agency reviews it on the client's edit page and regenerates the password
-- there (an already-existing, already-audited action) once satisfied it's
-- really them.
--
-- A single nullable timestamp is enough: a client can only ever have one
-- open request at a time (a second click just refreshes when it was asked),
-- and regenerating the password already clears it.
alter table clients
  add column password_reset_requested_at timestamptz;
