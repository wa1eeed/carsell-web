# Design deviations

Screens or components built **without design markup**, and places where the
build departs from the markup on purpose. Each entry states what was built, on
what basis, and what the designer still has to review.

## BodyTypeStrip — built without Wa markup · 2026-08-02

**Status: awaiting design review.**

`BodyTypeStrip` is listed among Wa's components in §10 but has **no markup in
Wa**. The owner confirmed it was dropped by mistake when the web version was
built from the app, and that it is genuinely designed — in screen **13a** of
`CarSell Redesign.dc.html` ("ابحث حسب الفئة").

### What it was built from

Screen 13a, adapted to the web:

| From 13a | On the web |
|---|---|
| Horizontal scrolling row, 126px cards | Same row, `w-32` cards |
| Silhouette image, Arabic name, count | Same three |
| Section head with an "all" link | Standard `SectionHead` |

### Placement — the owner's ruling on my objection

I argued the strip would crowd brands, since make is what a Saudi buyer searches
first. Partly upheld: **makes stay on top, body type follows immediately, and
finance drops one place.**

### Rules that came with it

- 6–8 cards in a **scrolling row, not a grid**. A grid forces a height that
  crowds what follows on a small screen.
- **No image → the name alone.** Not an initial letter: a body type is a *shape*,
  not a name, and "S" in a box tells nobody "sedan".
- **Empty types are hidden, not disabled** — the opposite of the payment bands.
  There the ladder itself is information ("nothing under 1,000 riyals" is an
  answer); here "no vans listed" is not something anyone is looking for.
- Clicking opens Wb filtered by `bodyType`.

### Admin (A12)

`BodyTypeDisplay` is a **display table, not an entity table**. Its primary key is
the `BodyType` enum itself, so there is no second reference that can drift from
the enum and no vehicle can point at a type with no name.

Consequently the admin API exposes **`PATCH` only** — no create, no delete.
Adding a type means a schema migration; deleting one would orphan vehicles. The
admin edits both names, the image, sort order and visibility.

Hiding a type removes it from the home row and touches neither the search filter
nor any listing.

### Still to review

- The silhouette artwork itself (none uploaded yet; cards render name-only).
- Whether the row should also appear on Wb as a filter entry point.

## Body diagram — schematic, not a car outline · 2026-08-02

**Status: RESOLVED 2026-08-02.** The artwork arrived as
`public/diagrams/car-body-top.svg` and is now rendered; the schematic remains
only as the fallback when the file is absent. Everything below is kept as the
record of what was built in the interim.

Wd's markup draws the paint map as an `<svg>` car outline. What was built is a
grid of labelled rectangles carrying the same panel keys, the same three states,
the same legend and the same tooltips.

**Why:** the outline is artwork, not layout — it needs a drawn asset, and
approximating one by hand produces a shape that reads as a mistake rather than a
car. The schematic is honest about being a schematic.

**What is identical:** panel keys, states (`original` / `repainted` / `replaced` /
`unknown`), the legend, per-panel tooltips, and the summary paragraph.

**To supply:** a single SVG car outline with `id` per panel; the component then
swaps `<rect>` for `<path>` and nothing else changes.

---

## A7 ordering — arrows, not drag handles · 2026-08-03

A7's markup shows a `⠿` drag handle in every row and a footer reading "drag to
reorder how they appear in the services directory".

**What was built:** a `ترتيب العرض` toggle — the button the design already has in
the header — which reveals `↑` / `↓` in each row. Off by default.

**Why:** drag needs a pointer. Arrows work from the keyboard, announce themselves
to a screen reader, and each press is one auditable move rather than a gesture
that has to be interpreted. Two arrows in every row of a table nobody is
reordering is noise, hence the mode.

**What is identical:** the ordering itself (`Service.sort`), where it takes
effect, and the header button that starts it.

**To change it back:** `moveService` already swaps two neighbours; a drag
implementation would call the same function with the same arguments.

---

## A7 editing — a drawer, not inline fields · 2026-08-03

A7's row action is a single `تحرير` button. The first build put a price input in
every row instead.

**Why the design is right:** a table is scanned, not filled in. Every row being
one stray keystroke from a price change is the wrong default for the screen that
sets what customers pay — and the inline inputs also rendered Latin digits in a
column of Arabic-Indic ones, which is what made the deviation visible.

**What was added beyond the design's row action:** the drawer edits names,
descriptions, price, SLA and placements, and carries the publish/hide action.
The design lists further per-service settings the schema cannot yet hold — see
`docs/OPEN-QUESTIONS.md` §12.

---

## A3 — no charts, and figures that need a provider · 2026-08-03

A3's markup has a 12-month GMV/revenue chart, a revenue-mix donut, and a monthly
expense card.

**What was built:** the numbers those visuals summarise, as cards with their
breakdowns — GMV by source, revenue by stream, escrow by state, subscriptions by
plan — plus the composite indicators and the commission simulator.

**Why:** no charting approach has been chosen anywhere in the admin yet, and
picking one inside a single screen makes it that screen's choice rather than the
console's. The expense card renders `FinanceInput` values that the inputs table
already lists row by row.

**To add them:** every figure the charts need is already returned by
`financeSummary` and `indicators`; only rendering is missing.

---

## A8 — delivery rates and test send omitted · 2026-08-03

A8's markup shows email delivery 98.4%, SMS delivery 96.1%, and buttons for
"test send" and "delivery log".

**What was built:** sent count (from `Notification`), estimated SMS segments and
cost — the last two explicitly labelled estimates.

**Why:** delivery rate is a fact only a provider knows, and no provider is
contracted. Showing a computed-looking percentage with nothing behind it is
worse than showing nothing. Same for a test send with nowhere to send to.

**Also omitted:** "+ new notification". A template is keyed to the code that
emits it, so a template with no emitter is a text nobody will ever send.

---

## A1 — two cards omitted, not approximated · 2026-08-03

A1's markup has eight cards. Six are built; `المستخدم النشط` and `مصدر التسجيل`
are not.

**Why:** neither has a source. Active-user counts need an activity log; the
registration source needs a column on `User` written at signup. The screen says
so in a line at the bottom.

**Why not a placeholder:** the acceptance criterion for this screen is that every
number comes from the database. A card showing an estimate is exactly the shape
a hard-coded number takes in practice — it never arrives as a literal, it
arrives as "temporary until the data exists".

**Also omitted:** the 12-month growth chart, the customer pie, and the
registration-source chart, for the same reason as A3's charts.

---

## A11 — one environment, arrows of governance instead of a toggle · 2026-08-03

A11's markup shows a `بيئة الاختبار` / `إنتاج` switch with separate keys per
environment, per-integration health percentages, and a monthly cost figure.

**What was built:** one configuration per integration, the failure behaviour of
each shown in its own row, and the full key-governance flow — encrypted storage,
hint-only display, and two-member rotation.

**Why:** two environments is a schema decision (two rows or a second column) that
changes how every integration is read at runtime. Health percentages and cost
need a provider reporting real numbers, and there is no provider yet — the same
rule as A8's delivery rates.

**What is identical:** the grouping by category, the status vocabulary
(تعمل / تحذير / غير مفعّلة), the declared failure path per integration, and every
line of the key-governance panel — each of which is now enforced in code rather
than described in a paragraph.

---

## A9 — the rules engine before the composer · 2026-08-03

A9's markup shows a visual segment builder (conditions joined with «و», a
`+ شرط` button, live counts) and a campaign composer with A/B split and
send-time optimisation.

**What was built:** the rules engine underneath it — the closed field list, the
`NOT` handling, the three-number live resolution, the cooldown and monthly cap,
and the send path that recomputes at send time. The screen reads segments and
campaigns; it does not yet compose them.

**Why:** the visual builder is the certain part — it can be built any time
against a settled engine. The engine is the part with the acceptance criterion
attached, and building the editor first would have meant designing the rule shape
around the UI rather than around what a marketing send must not get wrong.

**What is identical:** the three counts and their labels, the five guard rules
in the panel, and the separation of marketing from transactional.

---

## A10 — a table that reads, because the rule is not the admin's to change · 2026-08-03

A10's markup shows per-channel toggles for sound, badge, open and delivery rates.

**What was built:** the six channels with their critical flag, the default state,
and how many users muted each. No toggle for `userControllable`.

**Why:** turning a critical channel into a mutable one is a product decision. A
switch for it in the console makes it happen by button-press. The flag is a
migration away when someone decides to change it — which is the correct amount of
friction.

**Also omitted:** delivery, open and opt-out rates, for the same reason as A8 —
they come from a provider that does not exist yet.

---

## A29 — the plan editor, without a plan creator · 2026-08-04

A29's markup has an `أنشئ باقة` button next to `سجل التغييرات`.

**What was built:** the three plans of the markup (الأساسية · معرض · معرض
احترافي, all free, commission zero), the entitlement matrix, per-plan editing of
price, visibility and every entitlement value, and the commission simulator —
which returns the markup's own figure (145,000 at 1.5% → 2,175).

**Why no creator:** a plan is only its entitlement values, and every key is a
door the code opens by name. A new plan is therefore a new *row*, not a new
capability — and the one operation that would matter, adding a key, is a code
change by definition. The editor covers everything a new plan could express;
creating one is a `Plan.create` away when a fourth tier is actually decided.

**What is identical:** both tables and every column, the four cards, the
simulator's inputs and output, and the closing two rules.

**One correction to the markup's data:** `max_active_listings` seeded as `10`
while nothing in the product enforces a cap. A screen that says the ceiling is
ten while the product accepts a hundred is a broken promise, and the markup
itself says "بلا حد" for all three plans — so the default is now `-1`.

**Commission is shown here and edited in Finance.** Two screens writing one money
rule diverge at the first change; A29 simulates and displays, A20 writes.

---

## A30 · A31 — one screen, and it says no ad is served yet · 2026-08-04

Two screens in the markup — slots and their pricing (A30), sponsored campaigns
(A31) — built as one page, because whoever disables a slot must see the campaigns
they are about to stop.

**What was built:** the seven slots with the markup's own sizes, placements,
pricing models and prices; enable/disable with an audit entry; the campaign table
with live state derived from its two dates; and both rule panels.

**What is stated instead of claimed:** **nothing in the product serves an ad.**
`AdSlot` and `AdCampaign` have no reader outside this screen. So the page says so
in a line at the top, the session-cap card reads "قاعدة — ولا مسار عرضٍ بعد"
rather than "يُفرَض في الخادم", and the occupancy and revenue cards of the markup
are not shown at all — they would describe a market that never opened.

**The session cap is one constant, not a sum.** Summing `maxPerSession` gave 9
where the markup says 4; a per-slot ceiling is not a per-session one. It now
lives in `src/lib/domain/ad-rules.ts` with the other four ad rules, so the serving
path — when built — reads the number the screen displays. `ADS_SERVED` flips in
that same commit, and a test fails until the screen's wording follows.

**Schema:** `AdSlot.sizeLabel` and `AdSlot.placement` were added. `width×height`
renders a 16:6 ratio as "16×6 pixels", and a slot sold to an advertiser without a
written placement is sold without a description.

---

## A24 — not built, on purpose · 2026-08-04

Design decision 14 is explicit: financing stays display-and-calculator only in
phase one, and **"طلبات التمويل" in the admin console stays disabled with a
"قريبًا" badge**. There is no `FinanceRequest` model and there should not be one
yet. The nav item is left `href: null`, which is the designed state — not an
unfinished screen. Recorded here so nobody "completes" it later.

---

## A28 — the provider screen, and SLA breach measured instead of noticed · 2026-08-04

**What was built:** all of A28's columns from `ServiceProvider` — type,
commission, SLA, cities, active — plus per-provider open load, enable/disable
with an audit entry, and both rule panels.

**Added beyond the markup:** the breached requests **by reference and hours
late**. The markup shows "٣ طلبات تجاوزت الالتزام" as a figure; a figure nobody
can act on. `ServiceRequest.dueAt` was written on every request and nothing ever
compared it to the clock, so lateness passed without a trace.

**Breach is derived from `dueAt` and the clock together**, never from a flag — a
request still `IN_PROGRESS` whose deadline passed yesterday is late even though
nothing has touched it. A finished request past its deadline is not: nobody is
waiting.

**Disabling does not touch running requests**, exactly as the markup states, and
the toast tells the admin how many the provider will still finish.

**Not built:** `أضف مزوّدًا` and `تصدير`. Onboarding a provider is a contract with
commission and SLA terms; a form that creates one from the console makes a
commercial agreement a button press.

---

## A36 — six real reports instead of twelve labels · 2026-08-04

**What was built:** six named read queries that actually download as CSV —
sales/commissions, ledger, inventory aging, auction performance, service requests
and SLA, and customers. Each carries its own permission, and the route enforces
it (OPS gets 403 on the customer export, verified).

**Six, not the markup's twelve:** the rest need data we do not collect. The
investor report wants CAC, LTV and burn; a report that downloads with empty
columns is worse than one that does not exist.

**CSV, not XLSX + PDF.** CSV opens in every tool and adds no dependency to the
bundle. Two things the markup does not mention are enforced: a UTF-8 BOM, without
which Excel on Windows renders Arabic as mojibake and the recipient assumes the
export is corrupt; and formula-injection escaping — a cell starting with `=`, `+`,
`-` or `@` executes in Excel, so a user-supplied name becomes a command on the
recipient's machine.

**Personal-data exports are audited, aggregate ones are not.** Auditing every
export drowns the log; the customer export records who, when, and **how many
rows** — "exported one customer" and "exported four hundred" are different acts.

**Scheduling is declared, not running.** No job generates or delivers a report,
so the page says so above the table rather than letting someone rely on a Sunday
file that never arrives.

**Route path:** `/api/v1/admin/exports/{key}`, not under `reports/`, because
`reports/[ref]` is the report-queue segment and Next refuses two different slug
names at one level — it drops *all* dynamic routes with an error that names no
file.

---

## Admin "حسابي" — password change, and no TOTP to re-enrol · 2026-08-04

Task 35 asked for a change-password screen **and TOTP re-enrolment**. TOTP was
removed from admin sign-in earlier this session by the owner's instruction, so
only the password half remains; the screen shows the account, its live sessions,
and the permissions the role actually holds.

**No permission is required.** Changing your own password is not something a role
grants — everyone who signed in has it. Gating it would leave the weakest role
unable to close a door that had been opened.

**The current password is required** even though the session is valid: an
unattended machine is enough to change a password and lock the owner out.

**The change ends every session, including the current one.** The first version
kept the current session alive and revoked the others — a *second* rule
contradicting the one already in `resolveAdminSession`, which refuses any session
created before `passwordChangedAt`. The guard would have killed that session at
the next request anyway, logging the user out with no explanation. Now the screen
says so before the button, the cookie is cleared by the route, and the login page
reads `?changed=1` and says why.

**A wrong current password answers 422, not 401.** 401 carries "يلزم تسجيل
الدخول" — shown to someone who *is* signed in — and any generic interceptor
would treat a mistyped character as an expired session.

---

## Measured audit of the admin console · 2026-08-05

Not a claim of fidelity — a measurement. Values were extracted from
`design/Admin.dc.html` by parsing the inline styles, and compared against the
computed styles read from the running app.

### The stat card — the most repeated element in the console

| | Design | Was | Now |
|---|---|---|---|
| radius | 11px | 12px | 11px |
| padding | 16px 18px | 20px | 16px 18px |
| background | `#efe4cf` (surface) | **transparent** | surface |
| grid gap | 14px | 16px | 14px |

The background was the visible one: our cards sat transparent on the page with
only a border holding them, while every card in the markup is filled. It showed
on every admin screen at once.

**It was also written four times** — in `MonitorCards` and as a byte-identical
local `Card` inside the listing-review, reports and identity queues. A fourth
copy produces no difference on the day it is made; it produces one at the first
edit, which lands in one file and misses three. Now one `StatCard` and one
`StatGrid` in `components/admin/`, and every screen builds on them.

### What deliberately does *not* match

**Type sizes.** The markup's raw values are 10px labels, 22px figures, 9.5px
notes. The scale was raised earlier by the owner's explicit instruction — the
fonts read smaller than global practice. Returning to 10px here would undo that
decision in the element that is read most. Geometry follows the markup; type
follows our scale.

**Panel fills.** Seven section panels (auction settings, the commission
simulator, commission rules, identity) were transparent and are now `surface`,
matching the markup — same reason as the cards.

### Method, so it can be repeated

```
python3 - <<'PY'   # counts every inline declaration in the markup
import re, pathlib, collections
s = pathlib.Path('design/Admin.dc.html').read_text(encoding='utf-8')
...
PY
```

then `javascript_tool` on the running page for `getComputedStyle`. Both numbers
in one place is what makes it an audit rather than an impression.

### Second pass — tables, buttons, section heads

| Element | Design | Was | Now |
|---|---|---|---|
| table wrapper radius | 14px | 12px | 14px |
| table background | `#efe4cf` | **transparent body** | surface |
| header cell padding | 12px 20px | 12px 22px | 12px 20px |
| header tracking | .06em | .1em | .06em |
| body cell padding | 13px 20px | 14px 22px | 13px 20px |
| button radius | 9px | 11px | 9px (`--radius-btn`) |
| button padding | 10px 18px | 8px 14px | 10px 18px |
| section head margin-top | 26px | 36px | 26px |

The table body was transparent for the same reason the cards were, and it is the
same fix. The button radius needed a token — the scale had 8px and 11px but not
the 9px the markup uses everywhere, and a hardcoded `rounded-[9px]` is exactly
what this repo forbids inside a component.

`SectionHead` was written twice (operational and financial dashboards) and is now
one component, like `StatCard`.

**Not comparable:** the markup contains no `<table>`, `<input>`, `<select>` or
`<textarea>` — it is a static mock built entirely from `div`s. Table semantics
and form controls therefore have no design values to match; ours are real
elements, which is the accessible choice and a deliberate departure.

### Third pass — the frame

The sidebar already matched exactly: 238px wide, 10px/14px item padding, 8px
radius, 10px gap, weight 600. The page header matched too (18px vs 17px vertical
padding is one pixel, and 18px is on our spacing grid).

**What was missing was the header subtitle.** Every screen in the markup carries a
small grey line under its title saying what the screen does; ours showed the
title alone in a wide bar. Added as an optional `subtitle` on `AdminShell` and
populated on 20 screens. The title also dropped from `text-xl` to `text-lg` so
the pair reads as a unit rather than two competing lines.

### What remains unmeasured

- **Badge radius** is 8px against the markup's 5–6px. Left alone: two pixels on a
  small pill, and a third radius token for it is not worth the scale it adds.
- **The public site** (`Front-end Web.dc.html`) has not been through this
  treatment — only the admin console has. It is the larger surface and deserves
  its own pass.

---

## The public site, measured · 2026-08-05

Same method as the admin console. The result is different: **the public site had
not drifted.**

| Element | Design | Ours |
|---|---|---|
| car card | 14px · surface · 1px border · overflow hidden | identical |
| section heading | 22px / 700 | identical |
| primary button | 9px · 10px 18px · accent | identical |
| site header | 15px 40px · surface · gap 26px | 16px 40px · surface · gap 24px |
| filter chip | 11px 18px · weight 600 | 10px 16px · weight 600 |

Everything is within one or two pixels, and the two that differ sit on our
spacing scale. The unfilled panels I first took for a deviation are unfilled in
the markup too — the 14px cards that carry `#efe4cf` are the car cards, and the
buy column has no background in either. Panel padding in the markup ranges from
18/20 to 26/28 with no single value, so there is no rule to match.

**The admin console had drifted; the public site had not.** That is the finding.

### One real defect, and it was ours

At 375px the homepage was **870px wide — 495px of horizontal scroll**, on the
screen most visitors use. The site header was one non-wrapping row: logo, a
five-item nav, and the account entry, with no treatment for narrow.

Task 29 measured "no horizontal scroll at 375px" and it was green then. It
drifted when the type scale was raised and the account entry moved into the
header — **neither of which announced it**, because that measurement was taken by
hand and never became a command.

The first fix let the nav shrink (`min-w-0 flex-1`). The overflow went and **the
nav went with it** — logo and account took the width, leaving nothing. A phone
visitor with no overflow and no links is worse off than before. The nav now takes
its own row on small screens and scrolls inside it; one row from `sm` up, as the
markup shows.

**No gate for it.** A real check needs a headless browser at a fixed width, which
is a heavy dependency for one assertion; the lesson is recorded in `CLAUDE.md`
instead — re-measure at 375px after touching type, the header, or grids.


## لوحة القيادة كانت ثلاث شاشات، والتصميم يريدها ثلاثة تابز

**أُصلح.** A1 «نمو وأعداد» وA2 «تشغيلية» وA3 «مالية» تابزٌ داخل لوحة
القيادة في `design/Admin.dc.html`، والشريط الجانبي فيه «لوحة القيادة»
وحدها. وكان المبنيّ يفرّقها ثلاثةَ بنودٍ في الشريط — فمن أراد أن يقارن
نموًّا بتشغيلٍ خرج من الشاشة وعاد إليها.

`/admin/ops` و`/admin/finance` بقيا محوِّلَين إلى `?tab=` — الروابط
منسوخةٌ في محادثاتٍ وإشاراتٍ مرجعية، وحذفُها يجعلها ٤٠٤ بلا سبب.

**والتاب الذي لا يملكه الأدمن لا يُعرض**: «المالية» تحتاج `finance.view`
و`OPS` لا يملكها. وعرضُها معطّلةً يقول لمن لا يملكها إن هناك ما يُخفى
عنه؛ وإخفاؤها يقول إن هذه ليست شاشته.

### وما يبقى من التصميم غير مطابق

قِيس على `design/Admin.dc.html` ولم يُنفَّذ بعد:

| الشاشة | الناقص |
|---|---|
| A1 نمو | بطاقتا «المستخدم النشط» و«مصدر التسجيل» بلا مصدر في المخطّط · شريط تجزئة أفقيّ داخل كل بطاقة · حلقة (donut) للتوزيع · رسم ١٢ شهرًا |
| A1–A3 | أزرار الترويسة: مدى التاريخ · مقارنة بالفترة السابقة · تصدير |
| A4 الطلبات | **تابز بالمراحل** بعدّاداتها (الكل · الطلب · موافقة البائع · الفحص · الدفع · نقل الملكية · الإنهاء · مكتملة · ملغاة · متعثّرة · نزاع) · بحث · فلاتر · تصدير CSV · تذييل بالترقيم ومتوسّط البقاء · ثلاث بطاقات شارحة |
| A5 العملاء | **تابز بالشرائح** بعدّاداتها · أربع بطاقات مؤشّر · أعمدة الجدول كما في التصميم · الثلاث الشارحة |

**والنمط واحدٌ عبر شاشات القوائم**: تابز بعدّادات ← بطاقات مؤشّر ←
جدول ← تذييل ← ثلاث بطاقات («ما يفعله الأدمن هنا» · «لا يملك الأدمن» ·
«تنبيهات آلية»). فيُبنى مكوّنًا مشتركًا مرّة، لا ينسخ في كل شاشة.
