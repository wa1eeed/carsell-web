# Dealer modules and the entitlement engine

_Last updated: 2026-11-27_

The owner's requests of 2026-11-26, recorded before code:

> «الاقسام مثل التقسيط و العملاء الخاصين بالمعرض و كذلك نظام ال POS و
> نظام الفروع و نظام الصلاحيات و امكانيه اضافة فريقه... كلها تكون على شكل
> موديولز يمكن للسوبر ادمن اضافتها حسب باقات المعارض اللي يشتركون فيها»
>
> «لابد تكون البنيه تراعي ال entitlement engine للمميزات بحيث يسهل اضافة
> المميزات لاحقاً و تخصيصها حسب الباقات»
>
> «راح نوفر لصاحب المعرض حسب باقته امكانية تخصيص لاندنق بيج كموقع رسمي
> له يعرض سياراته فقط … بهويته … و يمكن تركيب شعاره و دومينه»
>
> «نظام التقسيط و ادارة الاقساط … اللوحه يجب ان تغني اصحاب المعارض عن اي
> نظام آخر»
>
> «نظرة خبير UI UX … مع توفير POS بحيث يقدر يتعامل مع العملاء اللي
> يحضرون لمعرضه الواقعي و ال POS يستعرض نفس السيارات المضافه في مخزونه»
>
> «الاضافه الجماعيه تخص المخزون لذلك اعتقد لو تكون زر او قسم فرعي داخل
> المخزون»

---

## 1 · The engine we already have, and the hole in it

`resolveEntitlements` (HANDOFF §14) reads three layers, last wins:

1. `Entitlement.defaultValue` — the platform-wide default
2. `PlanEntitlement` through the **active subscription**
3. `EntitlementOverride` for one user, until it expires

Its golden rule is already written in the file: code asks
`entitlement("can_auction")`, never "is he a dealer?" nor "what plan is he on?".
That is exactly the shape the owner asked for, so modules do not need a new
mechanism — they need this one applied.

**Measured hole (2026-11-26).** `Subscription` carries **both** `userId` and
`dealerId`, with an index on each. `resolveEntitlements` queries `userId` only.
So a dealership's own subscription is **never read by the engine**, and every
member of a paying showroom resolves to platform defaults. Worse, the one place
that reads entitlements for selling — `sellingAllowance(sellerId)` — is called
with *the member who publishes*, so a showroom whose plan allows auctions is
refused the moment a salesperson, rather than the owner, presses publish.

This is the same defect class this repository has recorded repeatedly: a column
with a writer and no reader. It must be fixed before any module is bound to a
plan, or every module will be "enabled" for nobody.

## 2 · What becomes a module

Each is an entitlement key, a nav group gated by it, and a plan row the super
admin can grant. Nothing asks for a role name or a plan name.

| Module | Key | State today |
|---|---|---|
| Stock and publishing | — | **Always on.** It is the reason the panel exists; gating it would gate the marketplace itself. |
| Branches | `dealer_branches` | Built (`D9`), currently role-gated only. |
| Team and permissions | `dealer_team` | Built (`D9`), role-gated only. |
| The showroom's own customers | `dealer_customers` | Built (`D10`), role-gated only. |
| Expenses and the showroom's result | `dealer_expenses` | Built today (`D13`). |
| **POS — the walk-in counter** | `dealer_pos` | **Not built.** Sells from the same stock to a customer standing in the showroom. |
| **Installments** | `dealer_installments` | **Not built.** The largest gap against every competitor. |
| **Branded landing page** | `dealer_landing` | **Not built.** Its own domain and logo, showing only its cars. |
| Auctions | `can_auction` | Key exists and is already read by `sellingAllowance`. |

## 3 · Order of work, and why

1. **Close the engine hole** — dealership subscriptions must resolve for every
   member. Everything below is decoration until this is true.
2. **Super admin grants modules per plan.** `PlanEntitlement` is seeded today
   and `docs/architecture/editability.md` records it as a real gap. A module
   nobody can grant is a module nobody has.
3. **Information architecture and the UX pass.** Bulk import belongs inside
   stock, not beside it; the sidebar is fifteen flat items and should read as a
   showroom's day. This comes before new screens, so new screens land in a
   structure instead of extending a flat list.
4. **POS**, because it is the counter a showroom stands at every day and it
   reuses stock, customers and invoicing that already exist.
5. **Installments**, the heaviest piece: a schedule, due dates, receipts
   against a schedule, arrears, and a buyer who is not a marketplace buyer.
6. **The branded landing page**, which needs a domain story (custom hostname,
   verification, certificate) and is the only item whose cost is mostly outside
   the application.

## 4 · What installments actually require

From the four sources, stated so the build is not a guess:

- A **schedule**: down payment, instalment count, amount, due dates. Optivize
  sells "إدارة التمويل والأقساط" and "حساب الدفعة الأولى"; Plugin-soft sells
  "استلام دفعة الحجز أو الأقساط" and "تخصيص دفعات الحجز و الأقساط على فاتورة
  السيارة". Qoyod says plainly it is **not** an instalment system.
- **Receipts allocated to a specific instalment**, showing paid and remaining —
  the single most repeated feature across all four.
- **Arrears and aging**: "متابعة مديونيات العملاء و أعمار ديونهم", with
  automatic overdue alerts.
- **Profit per contract**, since an instalment sale's margin is not its cash.

What we will not pretend to have: a bank's financing decision, a credit check,
or a Shariah-compliance opinion. The panel records an agreement the showroom
made and tracks what it collects.

---

## 5 · Step 1, done 2026-11-26: the engine reads the dealership

`resolveEntitlements` now takes a subject, not a bare id:

```ts
resolveEntitlements({ userId, dealerId })
```

and resolves four layers, last winning: platform default → the person's plan →
**the dealership's plan** → the person's override. The dealership wins over a
personal plan because the panel is the person's place of work: someone who
bought a personal plan and then joined a showroom works on the showroom's plan.

**A bare id was the trap**, not a convenience: it meant "no dealership" silently,
and nothing reminded the caller. Every call site now passes the dealership where
one exists — `publish`, the sell page, `/dealer/import` and its route, the
subscription screen, `/api/v1/me/entitlements`, and `dealer-team`, which had
been working around the hole by hand (reading the *owner's* entitlements to find
team seats; a hand-written detour in one place is evidence of a hole, not a fix).

Proved by removing the dealership layer: the test fails with the member keeping
auctions their dealership's plan forbids.

**It changes no behaviour today** — no dealership has a subscription yet, so
every key still resolves to its default. That is the point: the wiring lands
before the modules, so granting a module is data entry rather than code.

## 6 · Step 2, done 2026-11-26: the keys exist and the screen reads them

**What was already there.** `/admin/plans` edits `PlanEntitlement` — a value per
key per plan, upserted in a transaction with an `AuditLog` row. So "the super
admin grants a module per plan" needed no new mechanism. The claim in
`docs/architecture/editability.md` that plan grants were not editable had become
false when that editor shipped; it is corrected.

**What was missing** were the module keys themselves, and any screen that reads
them.

- Six keys added: `dealer_branches`, `dealer_customers`, `dealer_expenses`,
  `dealer_pos`, `dealer_installments`, `dealer_landing`.
- **Defaults state today's reality**: `true` for what is built and in use, so no
  showroom loses something it already relies on; `false` for what is not built,
  so no key promises a screen that does not exist.
- **Added by migration as well as to `prisma/reference.ts`.** The seeder runs
  once on an empty database, so a reference row alone reaches a fresh
  environment and never a running one — and a missing key resolves to *allowed*,
  which would make the gap silent.
- **A key with no Arabic label is a key the operator grants blind**, so each has
  one in `/admin/plans`.

**The nav moved out of the component.** `visibleNav` and the nav table now live
in `src/lib/dealer-nav.ts`: which section shows for which role and which plan is
a product decision that should be testable without a browser, and a test that
imports a JSX component fails to transform — so the most important thing to
check had no guard.

**Role and module are two conditions, not one.** The module answers "is this
feature in their plan?"; the role answers "is it their job?" An accountant in a
showroom whose plan includes stock still does not edit stock.

**And a guard in the sidebar is not a guard.** Hiding an item is a suggestion;
whoever types the URL arrives. Every module screen asks the server too.

## 7 · Step 3, done 2026-11-26: the sidebar reads as a showroom's day

Sixteen items in four groups had grown by accretion: the dashboard sat inside
"stock and selling", bulk import stood beside daily work, canned replies lived
under company settings, and reports hid at the bottom of a group about the
business entity.

The test applied was one question — **what does a showroom owner do in a day,
and in what order?** Open the panel to see what is waiting, work on the cars,
then on who is buying them, then on the customers, then on the money. Settings
last, because they are set once and forgotten.

| Group | Items |
|---|---|
| اليوم | لوحة القيادة |
| المخزون | المركبات *(tabs: المركبات · الإضافة الجماعية)* |
| البيع | العروض والمفاوضات · الطلبات · المزادات |
| العملاء | العملاء · الردود الجاهزة |
| المال | الفواتير والضريبة · التسويات والعمولة · المصروفات · التقارير |
| الإعدادات | الفريق والفروع · الملف العام · بيانات صاحب المعرض · الاشتراك والباقة |

What moved, and why:

1. **The dashboard left "stock and selling."** A dashboard is not stock, and
   putting the first thing anyone opens *inside* a group makes it subordinate to
   what follows it.
2. **Bulk import became a tab inside stock**, the owner's own instruction. It is
   a third way in, after "add a vehicle" and the single-car form — and a
   standalone sidebar item for a door used once a month crowds out the doors used
   every day.
3. **Canned replies moved to Customers.** They are words sent to a buyer, not a
   company setting; filed under "the showroom" they sent salespeople hunting
   through settings.
4. **Reports moved to Money**, where its questions are asked.
5. **Auctions moved to Selling** — an auction is a sale method, not a class of
   stock.
6. **Team, public profile, owner data and subscription became Settings** — four
   screens configured once, lengthening a daily sidebar for no gain.

**No destination was removed and no route changed.** A reorder that breaks a
saved link is not a reorder: `/dealer/import` still answers, it is simply
presented as part of stock, with the sidebar highlighting "المركبات" and the tab
marking itself current. The test asserts the full set of destinations rather
than the shape, so the next reorder cannot quietly drop one.

## 8 · Step 4, done 2026-11-26: the counter (`D14`)

> «توفير POS بحيث يقدر يتعامل مع العملاء اللي يحضرون لمعرضه الواقعي و الـPOS
> يستعرض نفس السيارات المضافه في مخزونه»

`/dealer/pos`, gated by `dealer_pos`. The car list **is** `dealerStock` — the
same rows the showroom sees under "المركبات", so there is no second price table
to drift. One screen, no wizard: a customer is standing there.

### It is not a marketplace order, and that is deliberate

`Order` is an escrow order with stages, commission and settlement — our money
passes through it. A counter sale never touched us: cash, card or a transfer
between the showroom and its buyer. Forcing it into `Order` would inflate GMV,
credit us a commission we never took, and open an escrow with no money in it. So
a counter sale is **an invoice plus a change in a vehicle's state**, and nothing
more — which is also what keeps GMV and take-rate honest.

### The danger it exists to remove

**The car leaves the market inside the same transaction.** A showroom that sells
in its hall while its CARZ listing stays live keeps receiving offers on a car
that left through the front door. That alone is why the counter belongs in our
panel rather than in a separate system, and the state change goes through
`listing-state` like every other (gate 21). A vehicle reserved by a live
marketplace order is refused outright: a buyer's money is already with us.

### Two defects the walkthrough exposed

1. **The close reason lied.** `markListingSold` hard-coded
   `closeReason: 'order.completed'`, so a counter sale closed the listing with a
   reason that never happened — and the vehicle timeline shows that field to a
   reviewer, who would go looking for an order that does not exist. The function
   now takes a reason, defaulting to the old value so no existing caller changes.
2. **"VAT is computed on it" read as "added on top".** The price is
   **VAT-inclusive**: 99,500 issues as 86,521.74 plus 12,978.26. An owner typing
   the figure expecting +15% would be out by thirteen thousand and would not know
   until the paper printed. The field now says "شامل الضريبة" and the hint says
   to type what the customer actually pays.

### Boundaries kept

- The accountant reads invoices and does not create them, the same line as stock.
- No tax arithmetic here: `tax.ts` matches the rule, reads the margin from the
  vehicle's cost book, and numbers the invoice. The VAT number is validated by
  `checkVatNumber`, which separates "fifteen digits" from "starts and ends with
  3" — a second pattern here would be a second rule. (Gate 53 flagged the first
  attempt, reading `{15}` as a tax rate written outside `tax.ts`: a false alarm
  on a length check, but the fix it pushed toward was the right one.)
- The buyer is captured on the invoice, not as a platform account. A showroom's
  own customer book is the `dealer_customers` module's job.

## 9 · Step 6, done 2026-11-26: the showroom's own site (`D16`)

> «راح نوفر لصاحب المعرض حسب باقته امكانية تخصيص لاندنق بيج كموقع رسمي له يعرض
> سياراته فقط … بهويته و يمكن تركيب شعاره و دومينه»

`/showroom/{slug}`, a **fourth root** beside `[locale]`, `/admin` and `/dealer`,
gated by `dealer_landing`, configured at `/dealer/site` by the owner alone.

**It is not the dealer's page in our market.** `/ar/dealers/{slug}` is a page
*inside* CARZ, with our nav and our identity. This is the showroom's own site:
its logo, its colour, its cars — and no browse bar taking its visitor to a
neighbour's car. That is the whole promise, so there is no "similar cars" strip
either.

**But the car opens in CARZ.** The escrow, the contract and the transfer are
there; a second purchase path here would mean two purchase flows drifting apart.
The footer says so rather than hiding it — a site that goes silent about where
the sale happens looks like a shopfront with no back room.

### The domain is two steps, and the second is said plainly

The app owns the first: it stores the hostname, refuses one already taken, and
issues a `TXT` token to prove ownership. **Changing the domain voids the
proof** — whoever verified `a.com` and then typed `b.com` has not verified the
second, and leaving `domainVerifiedAt` set would serve the page on a name they
do not own.

The second step is the TLS certificate, issued by the proxy (Caddy, which is
configured on the server and not in this repository). **That is an operations
step, and the screen says so**: the site works on our address from day one, and
nobody is told their domain is ready before it is. Someone told "ready" who then
opens their domain to a security warning blames us.

### Three defects the walkthrough exposed, and none of them by a test

1. **307 to nowhere.** The middleware rewrote `/showroom/...` to
   `/ar/showroom/...`, a path that does not exist. This is the third time a new
   root was forgotten in that condition, after `/provider` and `/dealer` — the
   test now asserts the exclusion.
2. **500 on the first auction card.** `CarCard` contains `Countdown`, a client
   component calling `useTranslations('ui')`, and the new root had no
   `NextIntlClientProvider`. The build passed, the compiler passed, 1,700 tests
   passed; opening the page found it in one request.
3. **"سيارتان معروضة"** — a dual noun with a singular adjective, on the headline
   of the showroom's own site. `Quantity` handles the noun; the adjective beside
   it was written by hand. It now reads "سيارتان للبيع", which is invariant
   across all six forms. This is the recorded "the number governs the counted
   even in a sibling element" rule, in a new place.

### One deliberate copy, with its guard

`<input type="color">` cannot take `var(--color-accent)` — its value is a hex or
nothing. So the brand accent exists once as `BRAND_ACCENT_HEX` in
`src/lib/brand.ts`, **with a test comparing it to the token in `globals.css`**:
two copies without a guard drift, and a showroom choosing "CARZ green" would get
last year's green.

## 10 · The modules were built, shipped — and invisible everywhere (2026-11-27)

The owner deployed staging, opened the panel and said: «ما وجدت شي». He was
right. POS, instalments and the showroom site were live in production and
**absent from every dealer panel in every environment**. Measured, the cause was
four missing links in one chain:

| Link | State on 2026-11-27 |
| --- | --- |
| `Entitlement.defaultValue` for `dealer_pos`, `dealer_installments`, `dealer_landing` | `false` — written hours before those modules were built, with the comment "false for what is not built", and **never flipped when they were** |
| `PlanEntitlement` rows for any `dealer_*` key | **zero** |
| `Subscription` rows with a `dealerId` | **zero** — so the engine's dealership layer never read anything |
| A screen that assigns a plan to a dealership | **none** |

Each link alone hides the modules. Together they made a feature that passes
1,740 tests and deploys cleanly reach nobody — and gave the owner no way to turn
it on.

This is the recorded "a flag written by hand describes a capability, and goes
stale the day the capability is built" — written in `NOTES.md` about
`HOME_ADS_SERVED`, and repeated here within the same day.

### What now exists

- **`Plan.audience`** separates showroom packages from personal ones, so a
  personal plan cannot be assigned to a business — enforced in the domain, not
  only by filtering the list.
- **`assignDealerPlan`** ends the current subscription and opens the new one in
  one transaction. Two active subscriptions would make the engine read
  "whichever started later", and that is not left to two dates.
- **`/admin/dealers/[id]`** shows the package, shows **the modules as resolved**
  (not as the plan grants them — an override or a default can differ, and the
  operator must see what the showroom's owner sees), says plainly when a
  showroom has no subscription at all, and assigns one.
- **`registerDealer`** subscribes a new showroom to the cheapest visible dealer
  plan. Without it every new showroom is born outside the engine — the same hole
  again, one registration at a time. A missing plan does not block registration:
  the showroom is created and the operator assigns a package.
- **The panel's own subscription screen** read `userId` and every subscription
  in the product carries `dealerId`, so it told a subscribed showroom's owner he
  had no package — on the very screen he opens to find out why POS is missing.

### And a timestamp that hid the fix

The first run of the migration granted everything and the modules **still** did
not appear. `now()` in SQL returns the session's wall clock, and Prisma's
`DateTime` is `timestamp(3)` without a zone, read back as UTC. On a database in
`Asia/Riyadh` that writes a subscription starting **three hours in the future**,
so `startsAt <= now` was false and the grants were ignored. Every timestamp a
migration writes into a Prisma column now says `AT TIME ZONE 'UTC'` explicitly.
