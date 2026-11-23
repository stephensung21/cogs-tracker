-- Recurring bills. A bill row is still one period; periods of one recurring bill share series_id.
--   frequency              NULL = one-off bill, else weekly / fortnightly / monthly / quarterly
--   approximate            1 = the amount is an estimate (series setting, copied to new periods)
--   amount_confirmed       1 = admin set this period's real amount, so it's no longer shown as an estimate
--   series_id              id of the first period of the chain (NULL for one-off bills)
--   period_start           first day of this period (YYYY-MM-DD); the period ends on due_date
--   usual_amount           amount (cents) copied into the next period when it's created
--   shortfall_dismissed_at admin dismissed this period's "not fully paid" warning
ALTER TABLE bills ADD COLUMN frequency TEXT;
ALTER TABLE bills ADD COLUMN approximate INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bills ADD COLUMN amount_confirmed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bills ADD COLUMN series_id INTEGER;
ALTER TABLE bills ADD COLUMN period_start TEXT;
ALTER TABLE bills ADD COLUMN usual_amount INTEGER;
ALTER TABLE bills ADD COLUMN shortfall_dismissed_at TEXT;
CREATE INDEX bills_series ON bills(series_id);
