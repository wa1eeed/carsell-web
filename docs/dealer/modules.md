# Dealer modules and the entitlement engine

_Last updated: 2026-11-26_

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
