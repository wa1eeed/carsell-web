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

---

## Ten questions for the tax adviser

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
