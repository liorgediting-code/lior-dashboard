-- Phase 21b: configurable CRM table column order + visibility.
--
-- Previously only the custom columns (lead_columns.sort_order) were
-- reorderable, and only custom columns could be removed from the table —
-- the seven built-in fields (name/phone/email/status/source/deal_value/
-- follow_up) were a fixed block always rendered first, in a fixed order.
-- This lets the agency interleave built-ins with custom columns and hide
-- ones a given client doesn't need, without touching the underlying data.
--
-- One jsonb array on clients rather than a new table: it's small
-- (at most ~7 built-ins + however many custom columns exist), read on
-- every CRM page load, and never queried by key — a table would only add
-- join overhead for no benefit. Shape: [{"key": "name" | "phone" | ... |
-- <lead_columns.id>, "hidden": boolean}, ...]. Null means "no customization
-- yet — use the default order, nothing hidden".
alter table clients
  add column crm_column_layout jsonb;
