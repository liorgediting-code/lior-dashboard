-- Phase 13: follow-up date on leads, for the client-portal "what needs
-- attention" dashboard (overdue follow-ups on still-open leads).
alter table leads add column follow_up_at date;
