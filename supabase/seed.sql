-- Demo data so every phase of the dashboard is click-through-able without
-- any real Meta/Green API/Anthropic credentials. Loaded automatically by
-- `supabase db reset` (or manually: `psql ... -f supabase/seed.sql`).

-- ---------------------------------------------------------------------
-- Client 1: dental clinic — real close-rate data (analyzer route A),
-- demonstrates WINNER + SUSPECT + KILL ads in one ad set.
-- ---------------------------------------------------------------------
insert into clients (id, name, business_type, contact_info, deal_price_avg, close_rate_pct, profit_ratio, sop_stage, drive_links, max_cpl)
values (
  '11111111-1111-1111-1111-111111111111', 'מרפאת שיניים חיוך', 'clinic_medical',
  '{"phone": "050-1234567", "email": "office@hiyuch-clinic.co.il"}',
  3000, 25, 5, 8,
  '[{"label": "תיקיית קריאייטיב", "url": "https://drive.google.com/drive/folders/demo1"}]',
  150
);

insert into baseline_snapshots (client_id, leads_per_month, avg_cost_per_lead, revenue, close_rate_pct, product_price)
values ('11111111-1111-1111-1111-111111111111', 12, 210, 36000, 14, 3000);

insert into campaigns (id, client_id, meta_id, name, funnel_stage, status)
values ('11111111-2222-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'demo_camp_1', 'שתלים - TOFU', 'TOFU', 'ACTIVE');

insert into adsets (id, campaign_id, meta_id, name, funnel_stage, status)
values ('11111111-3333-1111-1111-111111111111', '11111111-2222-1111-1111-111111111111', 'demo_adset_1', 'קהל רחב 25-55', 'TOFU', 'ACTIVE');

insert into ads (id, adset_id, meta_id, name, funnel_stage, status) values
  ('11111111-4444-1111-1111-111111111111', '11111111-3333-1111-1111-111111111111', 'demo_ad_1a', 'וידאו לפני-אחרי', 'TOFU', 'ACTIVE'),
  ('11111111-4444-1111-1111-111111111112', '11111111-3333-1111-1111-111111111111', 'demo_ad_1b', 'קרוסלה מחירון', 'TOFU', 'ACTIVE'),
  ('11111111-4444-1111-1111-111111111113', '11111111-3333-1111-1111-111111111111', 'demo_ad_1c', 'תמונה סטטית עדות', 'TOFU', 'ACTIVE');

-- WINNER: cpl 50 <= max_cpl 150
insert into ad_metrics_daily (ad_id, date, spend, leads, impressions, clicks) values
  ('11111111-4444-1111-1111-111111111111', current_date - 2, 250, 5, 8000, 200),
  ('11111111-4444-1111-1111-111111111111', current_date - 1, 250, 5, 8200, 210);
-- KILL: spend 350 >= 150, cpl 350 > 2*150=300
insert into ad_metrics_daily (ad_id, date, spend, leads, impressions, clicks) values
  ('11111111-4444-1111-1111-111111111112', current_date - 2, 175, 0, 6000, 90),
  ('11111111-4444-1111-1111-111111111112', current_date - 1, 175, 1, 6100, 95);
-- SUSPECT: 150 < cpl 200 <= 300
insert into ad_metrics_daily (ad_id, date, spend, leads, impressions, clicks) values
  ('11111111-4444-1111-1111-111111111113', current_date - 2, 100, 1, 4000, 60),
  ('11111111-4444-1111-1111-111111111113', current_date - 1, 100, 0, 3900, 55);

insert into leads (client_id, name, phone, source_ad_id, stage, created_at, closed_at, deal_value) values
  ('11111111-1111-1111-1111-111111111111', 'דנה כהן', '052-1112222', '11111111-4444-1111-1111-111111111111', 'won', now() - interval '10 days', now() - interval '3 days', 3200),
  ('11111111-1111-1111-1111-111111111111', 'יוסי לוי', '052-3334444', '11111111-4444-1111-1111-111111111111', 'qualified', now() - interval '2 days', null, null),
  ('11111111-1111-1111-1111-111111111111', 'מיכל אזולאי', '052-5556666', '11111111-4444-1111-1111-111111111112', 'lost', now() - interval '15 days', now() - interval '12 days', null);

insert into missions (client_id, title, description, due_date, priority, status) values
  ('11111111-1111-1111-1111-111111111111', 'לאשר תסריטים לגל קריאייטיב חדש', 'לשלוח ללקוח 3 תסריטים לאישור Gate 2', current_date + 2, 'high', 'open'),
  ('11111111-1111-1111-1111-111111111111', 'לעדכן דוח שבועי', null, current_date + 5, 'medium', 'open');

insert into sop_gates (client_id, gate_number, status, approved_at, approved_by) values
  ('11111111-1111-1111-1111-111111111111', 1, 'approved', now() - interval '40 days', 'client_magic_link'),
  ('11111111-1111-1111-1111-111111111111', 2, 'approved', now() - interval '35 days', 'client_magic_link'),
  ('11111111-1111-1111-1111-111111111111', 3, 'approved', now() - interval '30 days', 'agency_owner'),
  ('11111111-1111-1111-1111-111111111111', 4, 'approved', now() - interval '5 days', 'agency_owner');

-- ---------------------------------------------------------------------
-- Client 2: fitness studio — no per-deal data, uses revenue/deals route B,
-- currently stuck mid-SOP to populate the bottleneck widget.
-- ---------------------------------------------------------------------
insert into clients (id, name, business_type, contact_info, monthly_revenue, deals_per_month, profit_ratio, sop_stage, sop_stage_updated_at, drive_links)
values (
  '22222222-1111-1111-1111-111111111111', 'סטודיו כושר פיט', 'local_service',
  '{"phone": "050-7654321"}', 40000, 20, 5, 4, now() - interval '6 days',
  '[]'
);

insert into baseline_snapshots (client_id, leads_per_month, avg_cost_per_lead, revenue, close_rate_pct, product_price)
values ('22222222-1111-1111-1111-111111111111', 8, 180, 32000, 18, 1200);

insert into sop_gates (client_id, gate_number, status) values
  ('22222222-1111-1111-1111-111111111111', 1, 'approved'),
  ('22222222-1111-1111-1111-111111111111', 2, 'pending');

insert into missions (client_id, title, due_date, priority, status) values
  ('22222222-1111-1111-1111-111111111111', 'לתאם שיחת אסטרטגיה', current_date + 1, 'high', 'open');

-- ---------------------------------------------------------------------
-- Client 3: new e-commerce brand — no data at all yet (route C / conservative),
-- fresh onboarding, demonstrates the questionnaire/48h stage.
-- ---------------------------------------------------------------------
insert into clients (id, name, business_type, contact_info, price_range_low, price_range_high, profit_ratio, sop_stage, sop_stage_updated_at, drive_links)
values (
  '33333333-1111-1111-1111-111111111111', 'חנות אונליין טרנד', 'ecommerce',
  '{"phone": "050-9998888"}', 100, 300, 5, 0, now() - interval '1 day',
  '[]'
);

insert into baseline_snapshots (client_id) values ('33333333-1111-1111-1111-111111111111');
