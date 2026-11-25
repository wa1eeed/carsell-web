# Dealer panel — invoices (`D7`) and settlements (`D8`)

_Last updated: 2026-11-25_

Both screens read what the system already writes. The invoice is issued by
`issueInvoice` at settlement with a snapshot of its tax rule and a gapless
number; the ledger is written only through `postEntries`. A screen that added
up its own figures would produce a third number matching neither the document
nor the entry.

## 1 · Three buttons the encoding draws that are not here, each with a reason

| Drawn | Why not built |
|---|---|
| **أنشئ فاتورة** (`D7`) | Nothing in the product issues an invoice by hand, and the gapless sequence is the reason: an extra invoice is a document that left, not a gap to fill. |
| **اشتراك** chip (`D7`) | There is no `SupplyType.SUBSCRIPTION` and no writer — because every `Plan.price` is `0.00` today. A chip shipped now reads zero forever, which reads as a fault. **When a plan is priced, its invoice and VAT must be built with it.** |
| **غيّر الآيبان** (`D8`) | The encoding's own note requires admin verification and a 24-hour payout freeze. None of that exists. A button promising a security procedure that does not happen is worse than no button. The IBAN is edited today from the owner's profile, and the screen says so. |

## 2 · The commission card shows the dimension we have, not the one drawn

The encoding draws three rates — direct sale, negotiation, auction. Our
`CommissionRule` is dimensioned by **side** (seller / buyer), not by listing
type. Printing three equal numbers would advertise a distinction the system
cannot make, and a showroom would price against it.

## 3 · What building these two screens uncovered

Each of these was found by opening the screen, not by a test.

**No dealer sale in any environment could be invoiced.** `sellerTypeFor` reads
the **seller user's** tax status. Seeded dealers had no `vatNumber` and their
owners no `taxStatus`, so every dealer sale resolved to `DEALER_NO_VAT`, whose
rule is unapproved — `RULE_AWAITING_APPROVAL`, silently. Money settled and no
document came out. The seed now gives a verified dealer a VAT number and its
owner the matching registration. `INV-2026-000001` is the first sale invoice
this project has ever produced.

**Seeded dealer owners had no IBAN.** The seed writes one for every individual
seller and forgot the dealers, so the settlements screen said "no IBAN — nothing
will be transferred to you" for every showroom in the environment.

**A partial refund read as a full one.** `REFUND` covered both
`REFUNDED` and `PARTIAL_REFUND`. "Returned to the buyer", on a deal where most
of the money stayed with the seller, reads as a total loss.

**`settlementAmount` was never written by the seed on a partial settlement.**
`resolvePartial` writes it (`totalAmount − refund`); the seed refunded 1,500 in
the ledger and left the field null — and `netToSeller` reads
`settlementAmount ?? agreedPrice`. So the seller's book, the dealer's money
card, the settlement statement and the invoice all read the **full** price. The
platform promised the seller money it had already returned to the buyer.

**Invoice line descriptions are English.** `issueSettlementDocuments` writes
`'vehicle'`, `'platform commission'`. The screen printed `vehicle` raw in an
Arabic table. The screen now composes the Arabic supply type plus the vehicle;
**the document's own descriptions remain English and are a separate question**
— a ZATCA invoice is an Arabic document.
