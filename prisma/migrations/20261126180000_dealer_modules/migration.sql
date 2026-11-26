-- ═══ Dealer panel modules as entitlement keys ═══
--
-- Owner's decision 2026-11-26: the panel's sections become modules the super
-- admin grants per plan. The engine for that already exists — defaults, plan
-- grants, per-user overrides — so a module is a key the screen reads by name,
-- never a check on a role or a plan's name.
--
-- Reference data reaches a live database by migration, not by seed: the seeder
-- runs once on an empty database, and a row added to `prisma/reference.ts`
-- would reach a fresh environment and never reach a running one. The key would
-- then be missing in production while the code asks for it — and a missing key
-- resolves to "allowed" by design, so the gap would be silent.
--
-- Defaults state today's reality: true for what is built and in use, so no
-- showroom loses something it already relies on; false for what is not built,
-- so no key promises a screen that does not exist.
INSERT INTO "Entitlement" ("key", "type", "defaultValue", "description")
VALUES
  ('dealer_branches',     'bool', 'true',  'موديول الفروع'),
  ('dealer_customers',    'bool', 'true',  'موديول عملاء المعرض'),
  ('dealer_expenses',     'bool', 'true',  'موديول المصروفات ونتيجة المعرض'),
  ('dealer_pos',          'bool', 'false', 'موديول نقطة البيع — عملاء الصالة'),
  ('dealer_installments', 'bool', 'false', 'موديول التقسيط وإدارة الأقساط'),
  ('dealer_landing',      'bool', 'false', 'موديول الصفحة الرسمية بهوية المعرض')
ON CONFLICT ("key") DO NOTHING;
