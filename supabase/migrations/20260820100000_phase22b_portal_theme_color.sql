-- Phase 22b: widen the CRM accent color to the whole client portal.
--
-- crm_theme_color turned out to be misnamed: it now drives every page under
-- client/[clientId] (banner, tabs, header, CRM), not just the CRM screens,
-- via a data-portal-theme wrapper on the portal layout. Rename to match.
alter table clients
  rename column crm_theme_color to portal_theme_color;
