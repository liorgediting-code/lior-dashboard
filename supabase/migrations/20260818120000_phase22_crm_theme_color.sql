-- Phase 22: per-client CRM color theme.
--
-- Lets the agency or the client swap the CRM's accent color (buttons, input
-- focus rings) away from the default blue. A text column rather than a new
-- table for the same reason as crm_column_layout: one small value, read on
-- every CRM page load, never queried by key. Null means "no customization —
-- use the default blue". Allowed values are validated in application code
-- against the CRM_THEME_COLORS list in packages/shared, not via a check
-- constraint, so the palette can grow without a migration.
alter table clients
  add column crm_theme_color text;
