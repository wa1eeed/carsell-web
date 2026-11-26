# The dealer panel as a showroom's operating system — measured gap

_Last updated: 2026-11-26_

The owner's request (2026-11-26), recorded before any code was written for it:

> «المعرض يجب ان يضيف السيارة لمخزونه و ضمن خيارات السياره يمكن نشرها .. ولكن
> بشكل عام يجب ان تكون اللوحة بمثابة نظام اداري و تشغيلي للمعرض بالاضافه لكونها
> لوحه فيها مبيعاته و اموره المحاسبيه … اللوحة يجب ان تغري المعرض لإستخدامها
> حيث توفر له احتياجاته في ادارة معرضه الفعلي على ارض الواقع و تحفزه لنشر
> سياراته في سوق المنصه»

With four competitor products named: Optivize car ERP, Qoyod's showroom guide,
Plugin-soft's showroom page, and a Haraj ad for a showroom accounting system.
All four were read on 2026-11-26; what follows is their union against ours, not
a recollection of what such products usually do.

**The strategic point is not parity.** Those four sell a *back office* a
showroom pays for. We give the back office away and own the thing none of them
has: **the market the cars are published into**. So the ordering rule below is
"what makes the panel worth opening every morning", and every back-office
feature that touches a car should end at a button that publishes it.

---

## 1 · What the panel already does (measured, not assumed)

| Capability | Where | Competitor who sells it |
|---|---|---|
| **Landed cost per vehicle** — purchase, transport, inspection, maintenance, detailing, customs, other | `VehicleCost` (7 kinds, one PURCHASE enforced by a partial index) | all four; **Qoyod explicitly disclaims** automatic prep-cost allocation, we do it |
| **Margin per vehicle and per month** | `dealer-dashboard.ts`, `D1` | Optivize, Plugin-soft |
| Multi-branch, with stock and staff scoped to a branch | `Branch`, `DealerActor.branchId` | all four |
| Roles and permissions (OWNER · MANAGER · SALES · ACCOUNTANT) | `DealerRole`, `visibleNav` | Optivize — **in its Agency tier only** |
| VIN and plate per vehicle; bulk CSV import | `Vehicle.vin`, `D3` | Optivize, Plugin-soft |
| Tax invoices with VAT lines, credit notes | `TaxInvoice`, `TaxInvoiceLine`, `D7` | all four |
| Settlements, platform commission, payout to IBAN | `D8`, `dealer-money.ts` | — (ours; they have no marketplace) |
| Orders pipeline with stage deadlines | `D6`, `dealer-desk.ts` | Optivize (reservation → delivery) |
| Offers and negotiation; auctions | `D5`, `D4` | — (ours) |
| Customers, canned replies, response-time median | `D10`, `D11` | Optivize CRM (partly) |
| Sales by brand, order source, funnel | `D-reports` | all four |
| Sale agreement per order | `VehicleSaleAgreement` | Optivize (contracts) |
| Subscription and plan features | `Subscription`, `Plan` | — |

## 2 · What is missing, in the order it should be built

### Phase 1 — the panel cannot do its own job yet
1. **Add a vehicle to stock, and publish it from the vehicle's own options.**
   Measured 2026-11-26: `createListing`'s only caller is the *personal* sell
   wizard `/sell`; the stock screen has no add button (its empty state says
   "أضف مركبة" with nothing to press); the bulk import writes vehicles, never
   listings. **A showroom today cannot put one car on the market from its
   panel.** This is the owner's named first task.
2. **Days in stock, per car and as aged-stock analysis** (تحليل المخزون
   الراكد). We have a days-to-sell median for *sold* cars; what a showroom
   acts on is the car that has not sold. Optivize sells this by name.
3. **Search stock by chassis number instantly** (البحث برقم الشاص). Both the
   Haraj ad and Optivize lead with it; our stock table has no search.

### Phase 2 — the money a showroom actually counts
4. **Showroom expenses** beyond a vehicle's own cost — rent, salaries,
   marketing — daily and monthly, with the largest ones named. Plugin-soft
   sells this; Optivize ties expenses to cars only.
5. **Per-branch result** (مراكز التكلفة). We scope stock and staff by branch;
   we do not report profit by branch. Qoyod lists cost centers among the six
   things a showroom's system must have.
6. **Salesperson performance and commission** — sales per rep, tiered
   commission. Plugin-soft sells tiers; Qoyod admits it computes commissions
   outside the system.

### Phase 3 — the sale a showroom makes off-platform
7. **Quote → sale order → delivery permit** (عرض سعر · أمر بيع · إذن تسليم).
   The delivery permit appears in the Haraj ad and Optivize both; it is the
   paper that lets a car leave the yard.
8. **Receivables: paid vs remaining, with aging and overdue alerts.** Our
   money is escrow-shaped because our sales are; a showroom's own sales are
   not, and this is the single most-repeated feature across all four sources.
9. **Trade-in** (الاستبدال) — one party as both customer and supplier.

### Phase 4 — the purchase side
10. **Suppliers, purchase orders that become invoices on receipt, supplier
    balances and aging.** Qoyod makes the PO→invoice conversion one of its six
    requirements; Optivize does not mention POs at all.

### Deferred by cause, not by choice
- **ZATCA phase-two live link** (الربط الفوري). We issue compliant invoices;
  the Fatoora submission needs credentials the owner is holding until launch,
  like R2 and the payment gateway.
- **WhatsApp reminders**, bank financing forms, insurer forms — all integrations
  behind keys we do not have.
- **PDI checklist run by the showroom itself.** We have inspection reports by
  accredited providers, which is stronger evidence for a buyer; a showroom's own
  checklist is a different artifact and should not be dressed as the same one.
- **Workshop, spare parts, warranties** (Optivize's after-sales package). Out of
  scope for a marketplace panel until the owner says otherwise.

## 3 · What we will not copy

- **"Odoo 17 Community"** as a selling point (the Haraj ad). It names a
  dependency, not a capability.
- **Margin VAT on used cars.** ZATCA has allowed it since 2023-07-01 for
  qualifying vehicles *with its approval*. We already store purchase and sale
  price per vehicle, which is what makes it provable — see
  `docs/tax-model.md` and `Dealer.marginSchemeApproved`. Eligibility stays the
  showroom's filing matter; the panel supplies the evidence and nothing more.
