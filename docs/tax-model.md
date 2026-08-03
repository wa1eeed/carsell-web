# Tax and invoicing model

Screen `A21`. Domain: `src/lib/domain/tax.ts` — **the only file that computes
tax**, enforced by gate 16.

> **Read this first.** Three of the twelve seeded rules are `active: false` and
> marked `AWAITING RULING`. They are not oversights and must not be switched on
> without a written classification. What they cover is the single largest
> financial exposure in the product — see § 5.

## 1 · Why an engine and not a branch in code

The January 2026 VAT amendment may make the platform a **deemed supplier** when
the seller is an unregistered individual. If it does, tax becomes due on the
**full vehicle value** rather than on our commission.

On a 100,000 SAR car that is the difference between roughly **150 SAR and
15,000 SAR** of tax on a single transaction. The classification is not ours to
guess, so the handling is **rows an admin manages**, not conditions in code.

## 2 · Three documents, never merged

A single sale produces up to three documents, and conflating any two of them is
a legal error, not a presentation one.

| # | Document | What it is | Are we a party? |
|---|---|---|---|
| 1 | `VehicleSaleAgreement` | Contract between seller and buyer. VIN, parties, price, inspection, delivery. | **No** |
| 2 | `SettlementStatement` | Financial breakdown: vehicle value, our commission and its tax, gateway fee, services, net to seller, held and returned. | Yes |
| 3 | `TaxInvoice` | ZATCA invoice. **Possibly three per sale, from different suppliers.** | Only for our own supplies |

**The settlement statement is not a tax invoice**, and says so in its own header.
It is the document a seller reads to understand what they received; it has no
standing with the authority.

The third can be three because the vehicle may be invoiced by the dealer while
the commission and services are invoiced by us — three suppliers, one sale.

## 3 · Rule matching, and what happens when nothing matches

`TaxRule` is keyed on `(sellerType, buyerType, supplyType)`, where seller and
buyer may be `null` meaning "any".

Matching is **most-specific-first**, scored explicitly rather than relying on
insertion order — a row added today must not displace a more specific row added
yesterday.

**With no matching rule, issuance stops and records why.** The system never
assumes an intermediary and never assumes a supplier. A default here would mean
a legal document built on a guess.

## 4 · The rule is copied into the invoice, in full

Not referenced — **copied**. `ruleId` plus every value that affected the
computation: seller type, buyer type, supply type, taxable base, rate, issuer.

Editing a rule afterwards changes nothing that has been issued. **An invoice is
a document, and a document does not change retroactively.** This is the single
most important rule in this section, and a test asserts it: the rate is changed
from 15 to 20 after issuance, and the issued invoice still reads 15 and 150.

Rule edits need two approvers and are written to `AuditLog`.

## 5 · The three rules awaiting a ruling

| Seller | Buyer | Supply | Current treatment |
|---|---|---|---|
| Unregistered individual | Individual | Vehicle | **No vehicle invoice.** Contract + settlement statement. Our invoice covers commission only. |
| Unregistered individual | Dealer | Vehicle | Purchase contract; no invoice from the individual. |
| Dealer below threshold | Any | Vehicle | Same question. |

A21 labels these `خارج النطاق؟` — **with the question mark**. That punctuation is
deliberate and must survive translation: it is the difference between "we have
ruled this out of scope" and "we do not yet know".

Until the ruling arrives these sales issue a contract and a settlement statement
with **no vehicle invoice at all**, and our commission invoice is unaffected.

## 6 · The profit-margin scheme is a property of the dealer

`Dealer.marginSchemeApproved` + `marginSchemeRef` + who approved it and when.

Granted by an admin against a document from the authority. **Never applied
automatically.** A dealer without approval falls under `FULL_VALUE`, and a test
covers exactly that: a `MARGIN` rule matched by an unapproved dealer returns
`MARGIN_NOT_APPROVED` rather than under-charging tax.

When it does apply, tax is computed on the margin alone — 1,500 SAR on an 11,500
margin, not 13,043 on the full 100,000 — and the invoice states the basis.

## 7 · Sequence, cancellation, and the QR code

**The sequence is unbroken.** Read the maximum and add one, inside the
transaction. **An invoice is never deleted** — a gap in the sequence cannot be
explained to an auditor.

**Cancellation is a credit note** referencing the original. The original stays
and is marked `CANCELLED`; both remain readable together. A second cancellation
is refused.

**The QR code is TLV then Base64**, carrying the five ZATCA fields. Lengths are
counted **in bytes, not characters** — an Arabic letter is two bytes in UTF-8,
and counting characters produces a code no scanner can read. A test asserts the
byte length and round-trips an Arabic seller name.

## 8 · Reporting

Within 24 hours of issuance. A failed report retries automatically and raises an
alert; `InvoiceStatus` carries `REPORT_FAILED` so a failure is a state, not a
lost log line.

**Not built:** the reporting client itself, cryptographic signing, and the
XML export. They need ZATCA onboarding credentials.

## 9 · What is issued at settlement, and what is deliberately not

Issuance is wired to `applyState(payment, 'SETTLED')` — a **confirmed** settle,
never `PENDING`. See `DESIGN-DECISIONS` § 39 for why, and `src/lib/domain/documents.ts`
for the code.

| Supply | At settlement | Reason |
|---|---|---|
| Commission | **Invoiced** | Our supply, settled by this payment. Currently 0 % (see below), so in practice no line is produced. |
| Vehicle | Rule-dependent | Usually `NO_MATCHING_RULE` today — the three rows in § 5 are inactive by design. |
| Services | **Not invoiced here** | `SERVICE_PURCHASE` is its own payment; the supply happened when the service was delivered. Re-invoicing at vehicle settlement is a **duplicate**, not a late invoice. |
| Transfer fee | **Not invoiced here** | Unresolved whether it is our supply or a pass-through of a government charge. See question 11. |

Nothing is dropped silently: every deferred supply appears in
`IssueDocumentsResult.blocked` with a written reason, so the monthly
reconciliation asks a question that already has an answer on file.

### Commission is 0 % at launch

The design states «عمولة المنصة (٠٪ حاليًا)». A zero-value invoice is not a
lighter document — it attests to a supply that did not occur — so no commission
invoice is issued while the rate is zero. A test locks both directions: none at
0 %, one when the rate is switched on.

### Who bears the gateway fee

The settlement statement currently deducts **100 % of the gateway fee from the
seller's net**, computed from the gateway's declared `feePct` / `feeFixed`. This
is the common marketplace default, but it is a policy choice, not a derivation —
see question 12.

---

## Twelve questions for the tax adviser

1. **Deemed supplier.** When an unregistered individual sells to an individual
   through the platform, does the January 2026 amendment make us the supplier of
   the vehicle, or do we remain an intermediary supplying only a commission
   service?
2. If we are deemed the supplier, is the taxable base the **full vehicle value**
   or the **margin**, given that we never take title to the vehicle?
3. **Individual to dealer.** Is the dealer's purchase from an unregistered
   individual outside scope entirely, or does a reverse-charge obligation fall on
   the dealer?
4. **Our commission** when the underlying vehicle sale is out of scope — is it
   still a standard-rated service supply, or does it follow the treatment of the
   underlying supply?
5. **Dealer below the registration threshold.** What evidence must we hold to
   treat their sale as out of scope, and are we liable if that evidence is wrong?
6. **Profit-margin scheme.** What documentation must a dealer provide before we
   may apply it, and must the invoice state the basis explicitly?
7. **Invoice issuer.** In a dealer sale, may we issue on the dealer's behalf
   (`PLATFORM_ON_BEHALF`), and what agreement is required for that?
8. **Transfer fee and services** — inspection, report, shipping, photography.
   Are these a single composite supply with the vehicle, or separate supplies
   each with its own treatment?
9. **Auction deposits.** A deposit is held, then either returned or applied to
   the price. Is there a tax event at the hold, at the application, or only at
   the sale? And is a **forfeited** deposit a taxable supply or compensation?
10. **Credit notes and the return window.** A buyer returns a vehicle within the
    7-day window after a dealer sale — does the dealer issue the credit note, do
    we, and what is the deadline relative to the original invoice?
11. **Transfer fee.** The 350 SAR ownership-transfer fee is currently stored with
    VAT embedded at 15/115. Is it our taxable supply, or a disbursement passed
    through to the traffic department and therefore outside the scope of our
    invoice?
12. **Gateway fee incidence.** We deduct the payment-gateway fee from the seller's
    net. Does that deduction change the taxable base of our commission supply, and
    must it appear on any invoice rather than only on the settlement statement?

## 10 · Government fee vs. administrative fee

**Ruled 2026-08-03.** The 350 SAR ownership-transfer fee is a **government
charge**, passed through unchanged. It is a disbursement: we act as agent, the
customer is the party liable, and the exact amount is passed on. It carries no
VAT of ours and appears on no invoice we issue.

Alongside it, each service — and the transfer itself — may carry an optional,
switchable **administrative fee**. That fee is ours, so it is a standard-rated
supply of a service.

### Why two columns and not one number

The disbursement treatment survives only while the amount is passed on
**unchanged**. Charge 400 against a 350 government fee and call it "transfer
fee", and the whole 400 becomes our taxable supply — tax on 400, not on the 50.

So the split is a **condition of the classification**, not a presentation
choice. It is two columns in the schema (`transferFee` / `transferAdminFee`,
`Service.price` / `Service.adminFee`), `assertNoMarkup` guards the invariant,
and no path sums them before storage. `src/lib/domain/fees.ts`.

The administrative fee is **VAT-inclusive**, like every other platform price:
what the operator types is what the customer pays, and the A7 field says so.

### Consequences for figures that were already stored

`Order.vatAmount` was 15/115 of the whole total. That put the vehicle value —
whose supplier is the seller — and the government fee — whose supplier is
nobody we invoice for — into a base neither belongs to. It is now VAT on **our
supplies only**: commission plus administrative fees. The migration backfills
existing rows, and its rollback restores the old formula exactly.

A3's GMV card said "of which embedded tax, computed 15/115 of the total". That
sentence was a promise the system no longer kept — an individual-to-individual
sale is out of scope entirely and carries no tax at all. The card now reports
our VAT, summed from `Order.vatAmount`, and says so.

### `OUT_OF_SCOPE` now means no invoice from us

Not a zero-tax invoice. Zero says "we supplied it and the tax is nil"; the truth
is that we did not supply it. This also separates *stating* a treatment from
*deactivating* a row: a row can now be active and correctly produce no invoice,
where before the only way to express that was `active: false` — which reads as
"undecided", not "decided not to invoice".

## 11 · Tax status: deferred, asked once, two categories

**Ruled 2026-08-03.** Registration asks for a phone number and nothing else. The
tax question appears at the first act that has a tax consequence — publishing a
first listing, or a first purchase — and never again. It is editable from
account settings.

`src/lib/domain/tax-profile.ts` owns this. `src/app/api/v1/account/tax-status`
saves it.

### `null` is a third state, and must stay one

`User.taxStatus` is nullable and null means **not yet asked**. Defaulting it to
`INDIVIDUAL` would be convenient and wrong: the classification would become our
choice rather than the user's, and we issue invoices on the strength of it. A
seller who has not answered is never treated as taxable.

### Two categories, not three

The predicate is `isVatRegistered(user)` — a business and a registered
individual are the same thing for VAT, and building a third branch means every
screen and every calculation has to remember a distinction that changes nothing.

A registered status without a number is not stored. The number is what makes the
status checkable; without it the claim is an assertion, and between accepting it
and completing it, invoices go out carrying a description with nothing behind it.

`SellerType.DEALER_VAT` is therefore the **rule-matching key for a registered
supplier**, not an assertion that the person is a dealer. Who the supplier is
comes from `supplierName` / `supplierVatNo` on the invoice. The name should
become `SUPPLIER_VAT` at the next migration that touches this type.

### The per-listing override

`Listing.taxableSupply` is nullable: null follows the seller, `true` marks a
business vehicle sold by an individual, `false` marks a personal vehicle sold by
a registered seller. **`false` is not overridden by the seller's status** — the
seller is the one who said it is outside their business.

The checkbox is shown only to sellers who answered "individual". For a
registered seller their listings are taxable anyway, so asking again is noise.

### What the buyer sees

The price statement follows the seller's status, and it is on the card before
the buyer commits, not discovered at payment:

| Seller | Badge | Price |
|---|---|---|
| Not registered | بائع فرد | Final price, no VAT on the vehicle |
| Registered | بائع مسجل ضريبيًا | VAT-inclusive, with the VAT amount shown |

`cost.vatIncludedInPrice` is `null` when the seller is not registered — not
zero. Zero would claim a calculation was made and came to nothing.

A registered **buyer** is typed `COMPANY`, so their invoice carries both VAT
numbers and the input tax can be reclaimed.

### The margin scheme follows the registration, not the account type

**Ruled 2026-08-03.** Entitlement tracks the VAT number, not whether the account
is a dealer. The approval fields moved from `Dealer` to `User`, beside
`taxStatus`; the migration copies existing dealer approvals onto their members,
because dropping them would silently withdraw an approval that was granted and
charge full-value tax on the next sale.

`marginApprovedFor()` **requires both** registration and approval, and checks
them in one place rather than at each call site. An approval flag on an
unregistered account is meaningless, and applying it would tax the margin alone
for a seller who charges no VAT at all — an under-collection wearing the cover of
a stale setting.

A dealer approval still counts for its registered members, so nothing granted
before the move is lost.

`Dealer.marginScheme*` is now read-only legacy and should be dropped once its
last reader is gone.
