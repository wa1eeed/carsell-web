# Dealer panel — invoices (`D7`) and settlements (`D8`)

_Last updated: 2026-11-26_

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

## D13 — the showroom's own expenses

Plugin-soft sells "تابع مصروفات المعرض اليومية والشهرية" by name; Optivize ties
expenses to a car only, which leaves rent and salaries nowhere. We already had
`VehicleCost` for what attaches to a car, and nothing for what does not.

**The boundary is the point of the table.** What belongs to one vehicle —
purchase, transport, inspection, detailing — goes to `VehicleCost` and enters
*that car's margin*. What belongs to no single vehicle — rent, salaries,
marketing, utilities, government fees, facility upkeep — goes to `DealerExpense`
and enters *the showroom's result*, touching no car's margin. Mixing them
corrupts both numbers: a general cost loaded onto a car makes its margin a lie,
and a car's cost counted as general removes it from its own reckoning. The
screen says this above the form, not only here.

**It does not touch `LedgerEntry`.** That is the platform's book; this is the
showroom's book about itself. Joining them would mix two monies that never meet.

Decisions worth keeping:

- **The spend date, not the entry date.** Whoever records last month's rent
  late records it at its date, or the figure moves to a month it does not
  belong to and two totals lie at once. A future date is refused outright.
- **A zero that was never entered is not a zero** — the month card says "لم يدخل
  بعد". And today's zero is two zeros: with no entries at all it is unmeasured;
  with entries this month and none today it is a measured zero, worded as a
  negation. This is the `A30` expense-card rule, now in its second place.
- **The largest categories, not the list.** Seven categories get read at month's
  end; the top two get read now.
- **A branchless expense is a real state**, not a missing field: rent for the
  whole showroom belongs to no branch, and a per-branch result needs its share,
  not everything.
- **A book that cannot be corrected gets abandoned**, so a row can be deleted —
  scoped by dealership, so an id from another showroom deletes nothing.
- **Sales staff do not see it**, the same line as the cost drawer. The
  accountant does enter here, unlike stock: this is their work, and restricting
  it to the owner gets the book filled from memory at month's end.

## D15 — instalments

> «نظام التقسيط و ادارة الاقساط … اللوحه يجب ان تغني اصحاب المعارض عن اي نظام آخر»

The largest gap against every competitor: three sell it by name, and Qoyod says
outright that it **is not** an instalment system.

**This is the showroom's contract with its buyer, not a bank's financing.** No
credit decision, no affordability check, no Shariah opinion — the panel records
an agreement the showroom made and tracks what it collects. Conflating the two
would promise what we do not have.

### Decisions

- **Instalments are a payment method on the counter, not a second way to sell.**
  An instalment sale is a sale: an invoice is issued and the car leaves the
  market. Giving it its own path would create two sale entries — and two entries
  mean a day when one of them forgets to withdraw the listing.
- **The terms are validated before the invoice is issued.** A contract whose
  validation fails afterwards leaves a completed sale with no schedule — paper
  with no obligation behind it.
- **The schedule is written as rows, not computed on read.** A schedule
  recalculated on every read changes when the rule changes; a signed contract
  does not.
- **`installmentSchedule` is exact, unlike `monthlyPayment`.** The public
  estimate rounds to the nearest ten "so it is not read as a promise to the
  halala". A contract is the opposite: the instalments must sum to the financed
  amount exactly, or the customer owes a riyal nobody can explain. The remainder
  rides on the **last** instalment — a few halalas, known from day one, and not a
  surprise in the first month.
- **No profit rate is added here.** This is a repayment schedule for an agreed
  amount, not a financing calculation: a rate added inside the schedule beside a
  different displayed price would make two numbers for one contract.
- **Due dates follow the day of the month**, so a contract starting 31 January
  falls due on 28 February, not 3 March. Adding thirty days slides the date off
  its day and the twelfth instalment lands in the wrong month.
- **A receipt names its instalment.** The most-repeated feature across all four
  sources. An amount recorded without the instalment it belongs to makes "paid"
  and "remaining" two numbers nobody can account for — the showroom cannot tell
  its customer which month is still open. Excess over one instalment is refused
  and recorded against the next with a second receipt, otherwise the sum of
  instalments exceeds the financed amount.
- **Arrears are calendar-based.** `dueOn <= now` makes *today's* instalment late
  from first light. Overdue means the due day is **before** today, by Riyadh
  days. The screen caught this on a contract that started the same day.
- **The contract closes when its last instalment closes**, so it does not sit in
  the arrears queue after being paid off.
- **Arrears first, not newest first.** Whoever opens this screen opens it to
  find out who has not paid, not to read a log.

### What two gates caught

- **Gate 53 fired on `status: 'SETTLED'`** for a *contract* being fully paid —
  it was written for `Payment`/`Escrow`, where a settlement must carry the
  gateway's reference for reconciliation. A contract has no gateway. The gate now
  reads the **model** being written rather than the word, and was re-measured by
  removing a real `settleRef` to confirm it still bites.
- **Gate 64 caught `InstallmentReceipt` having no reader** on the day it was
  created. A receipt that is never read makes "paid" a number with nothing
  explaining it — and the first question a disputing customer asks is "when did I
  pay?". The plan screen now lists every receipt with its amount, method, the
  instalment it was applied to, and who recorded it.
