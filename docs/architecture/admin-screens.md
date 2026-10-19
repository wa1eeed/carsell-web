# Admin screens

_Last updated: 2026-10-19_

Generated from `src/components/admin/nav.ts`. Nothing listed the panel's screens
before 2026-10-19: 45 folders under `src/app/admin` against 39 sidebar entries,
and no document counted either. A hand-written index would describe the tree the
day it was written and then be read for a year while it lied, so this one is
derived and `npm run docs:check` refuses it when it drifts.

What the generator cannot derive is kept across regenerations: the «why here»
of a job's position, and how a screen with no sidebar entry is reached. Those
are written here by hand, and a new row with an empty reason fails the check.

<!-- generated:begin -->
**45** entries in the sidebar, across 8 groups, against
**46** folders under `src/app/admin`.

### المتابعة

| Screen | Path | Permission | What it is for |
| --- | --- | --- | --- |
| لوحة القيادة | `/admin` | `dashboard.view` |  |
| التقارير والتصدير | `/admin/exports` | — |  |
| مجرى النشاط | `/admin/activity` | `audit.view` |  |
| دفتر الحسابات | `/admin/ledger` | `finance.view` |  |
| سجل العمليات | `/admin/audit` | `audit.view` |  |

### الإعلانات

| Screen | Path | Permission | What it is for |
| --- | --- | --- | --- |
| إعلانات تنتظر المراجعة | `/admin/listings` | `listings.review` |  |
| كل الإعلانات | `/admin/all-listings` | `listings.review` |  |
| المزادات | `/admin/auctions` | `orders.view` |  |
| العروض والمساومات | `/admin/offers` | `orders.view` |  |

### الطلبات والمبيعات

| Screen | Path | Permission | What it is for |
| --- | --- | --- | --- |
| الطلبات | `/admin/orders` | `orders.view` |  |
| المدفوعات والضمان | `/admin/settlements` | `finance.view` |  |
| تحويل مستحقات البائعين | `/admin/payouts` | `finance.view` |  |
| صرف مستحقات المزودين | `/admin/provider-payouts` | `finance.view` |  |
| الخلافات | `/admin/disputes` | `orders.view` |  |
| الشكاوى | `/admin/reports` | `reports.handle` |  |
| طلبات الخدمات | `/admin/service-requests` | `serviceRequests.handle` |  |
| طلبات التمويل | — قريبا | — |  |

### العملاء

| Screen | Path | Permission | What it is for |
| --- | --- | --- | --- |
| العملاء | `/admin/users` | `users.view` |  |
| المعارض والتجار | `/admin/dealers` | `users.view` |  |
| طلبات توثيق الهوية | `/admin/identity` | `identity.review` |  |

### التسويق والإعلان

| Screen | Path | Permission | What it is for |
| --- | --- | --- | --- |
| الإعلانات الممولة | `/admin/ads` | `finance.view` |  |
| الحملات التسويقية | `/admin/campaigns` | — |  |

### الإعدادات — المال

| Screen | Path | Permission | What it is for |
| --- | --- | --- | --- |
| الرسوم والضرائب | `/admin/tax` | `finance.view` | نسب الضريبة وقواعد الإصدار ومن يصدر الفاتورة. |
| الباقات والعمولة | `/admin/plans` | `finance.view` | باقات البائعين ونسب العمولة على كل بيعة. |
| طرق الدفع | `/admin/payments` | `finance.view` | أي بوابة تستقبل كل غرض، ورسوم المعالجة. |
| ردود بوابة الدفع | `/admin/webhooks` | `finance.view` | ما قالته البوابة وما ترتب عليه عندنا. |
| التمويل والقسط | `/admin/financing` | `finance.view` | الدفعة الأولى والمدة ونسبة الربح وأقل سعر يظهر له قسط. |
| المدد والمهل | `/admin/deadlines` | `finance.view` | مهلة الدفع ونافذة النقل وقرار البائع وغيرها. |

### الإعدادات — المحتوى

| Screen | Path | Permission | What it is for |
| --- | --- | --- | --- |
| الخدمات وأسعارها | `/admin/services` | `services.manage` | الخدمات المعروضة وأسعارها ومهلة تنفيذها. |
| مزودو الخدمات | `/admin/providers` | `services.manage` | من ينفذ الخدمات، وتغطيته، وعمولتنا منه. |
| قالب الفحص | `/admin/inspection-template` | `services.manage` | أقسام الفحص وبنوده وأوزانها — يحررها المشغل بلا نشر. |
| الماركات والموديلات | `/admin/catalog/brands` | `catalog.manage` | الماركات والموديلات والفئات التي تبنى منها الإعلانات. |
| أنواع الهياكل | `/admin/catalog/body-types` | `catalog.manage` | أنواع الهياكل وصورها وترتيب عرضها. |
| المميزات | `/admin/catalog/features` | `catalog.manage` | المميزات التي يختارها البائع ويرشح بها المشتري. |
| قواعد المزادات | `/admin/auction-settings` | `finance.view` | الحد الأدنى للمزايدة والتمديد التلقائي والعربون. |
| الأسئلة الشائعة | `/admin/faq` | `notifications.manage` | الأسئلة الشائعة ومواضع ظهورها. |
| قنوات الدعم | `/admin/contact` | `notifications.manage` | الهاتف والواتساب والبريد الظاهرة في «تواصل معنا». |
| الصفحات القانونية | `/admin/legal` | `notifications.manage` | الشروط والخصوصية ونسخها المنشورة. |
| علامات الموثوقية | `/admin/trust-marks` | `notifications.manage` | شعارات الجهات في التذييل وأرقام تسجيلها. |
| نصوص صفحات البحث | `/admin/seo` | `notifications.manage` | عنوان صفحات الهبوط ووصفها وفقراتها. |

### الإعدادات — النظام

| Screen | Path | Permission | What it is for |
| --- | --- | --- | --- |
| الإشعارات والقوالب | `/admin/notifications` | `notifications.manage` | قوالب الرسائل ومتى ترسل. |
| إشعارات الجوال | `/admin/push` | — | قنوات إشعارات الجوال وما يفتح منها افتراضا. |
| الربط بالخدمات الخارجية | `/admin/integrations` | `integrations.view` | مفاتيح الربط وبيئاتها وحال كل تكامل. |
| مفاتيح الواجهة العامة | `/admin/api-keys` | `integrations.view` | من يقرأ كتالوجنا من خارج الموقع وبأي حد. |
| الفريق والصلاحيات | `/admin/team` | `team.manage` | من في الفريق وبأي دور، ومصفوفة الصلاحيات. |

### Folders with no sidebar entry

A screen with no door is the class this repository has closed eleven times,
so the ones that are reached another way are listed rather than assumed.

| Folder | How it is reached |
| --- | --- |
| `/admin/account` | Linked from the shell header, beside the signed-in admin's name — it is that admin's own page, not a section of the panel. |
| `/admin/catalog` | A parent path. The sidebar links its children (`/admin/catalog/brands`, `/admin/catalog/features`); the folder itself holds no screen of its own. |
| `/admin/finance` | **A redirect, not a screen.** An old URL that lands on the dashboard's finance tab, kept so links already shared keep working. |
| `/admin/login` | Reached by redirect from every guarded page when there is no session. It is the only screen the panel reaches without a session. |
| `/admin/ops` | **A redirect, not a screen** — the dashboard's operations tab, same reason as `/admin/finance`. |
| `/admin/settings` | In the sidebar as «كل الإعدادات», but its href is built from the `SETTINGS_HOME` constant rather than a literal, so the generator reads it as unlinked. It is reachable; the tool simply cannot see a variable. |
<!-- generated:end -->
