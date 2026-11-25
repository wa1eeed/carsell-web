# Dealer panel — the remaining seven screens

_Last updated: 2026-11-25_

`D3` bulk import, `D4` auctions, `D10` public profile, `D11` reports, plus
customers, subscription and canned replies. With these the eleven screens the
encoding draws all exist, and every nav item resolves.

## 1 · Why these seven were built together

The nav showed fourteen items and **seven returned 404**. A panel whose own
sidebar is half dead reads as broken software, not as work in progress. Gate 33
now catches this class: it matched `href=` in a tag but not `href:` in a nav
array, so seven dead destinations passed under it. The extension was measured
first (10 alarms: 7 real, 3 on `public/` files — the gate now checks the disk
for those) and proved by breaking it in both directions.

## 2 · `D4` — and the dead branch it finally reached

`resolveSellerDecision(id, **true**)` — a seller accepting a bid below their
reserve — has been built and tested since task 19, and **its only caller was a
cron passing `false`**. Every unmet auction therefore ended in rejection no
matter what the seller wanted. This is recorded in `NOTES.md` as the worst
thing the dead-function sweep produced. The button on `D4` is its first real
caller.

The reserve is shown here and nowhere public. Decision 29 keeps
`reservePrice` out of every public response; a dealer cannot decide at close
without seeing it, so it is scoped into the query — not filtered after.

The encoding draws three exits for an unmet auction. Two have no writer
(relist at a lower reserve keeping watchers; convert to a negotiation listing),
so two buttons ship and the gap is recorded rather than faked.

## 3 · `D3` — what the encoding promises and the catalogue actually supplies

> «الرقم التسلسلي وحده كافٍ — بقية القيَم تُجلب من الكتالوج وتُملأ آليًا»

Half true, and the half matters. `lookupVin` yields the brand and the year and
says `needsModel: true` — **the model is not in a VIN**. `Vehicle` additionally
requires body type, transmission, fuel, drivetrain and seats. All of those live
on `Trim`, and the encoding's own column map lists `Make`, `Model` and `Trim`.
So the file supplies make/model/trim, the trim supplies the spec, and the VIN
fills the year when that column is absent. Nothing is guessed: a vehicle listed
for sale with an invented transmission is read as fact.

**Preview and import share one reader** — and the walk proved why. A row whose
trim did not belong to its model showed as *clean* in the preview and was
*skipped* on import: the preview promising what does not happen is exactly what
a preview exists to prevent. `tests/dealer-import.test.ts` asserts
`created + updated === preview.ready`, and was proved by removing the check.

Every rejected row names **its line, its column and its value**. "Row rejected"
sends someone into a spreadsheet hunting for something they cannot see.

## 4 · `D11` — reporting what is recorded, named correctly

The encoding draws «مصدر الطلب» as surfaces: search results, dealer page, home.
**No attribution exists** — nothing stores a referrer. What is stored is
`OrderSource`: the *mechanism* (direct, offer, auction, buy-now). So the panel
shows the mechanism under its own heading, with a line saying page attribution
is not built. Inventing surfaces from mechanisms would have a showroom
optimising a number that measures something else.

The funnel is four steps, not five: «مشاهدة الإعلان» and «فتح التفاصيل» are one
event for us. An invented step produces an invented leak, and sends someone to
fix what is not broken.

**A percentage below 1% is not zero.** 13 engagements out of 7,935 views
printed «٠٪» — reading as *nobody engaged*, which is the normal shape of a wide
funnel. It now reads «أقل من ١٪».

## 5 · `D10` — what the operator edits versus what the platform computes

The CR number, the VAT number, the verified badge and the rating are read-only,
and the screen says why. The encoding's own note says the badge comes from
admin verification. The VAT number is the sharpest: **tax invoices are issued
with it**, so a dealer editing it here would produce a document carrying a
number nobody verified.

## 6 · Canned replies — and the reader built with the writer

A template is stored **with its variables**, substituted at send time.
Substituting at save time freezes a price that changes afterwards, and the
showroom then promises something no longer true.

The screen was built, and the table would have had no reader — the defect gate
64 guards. So `D5`'s counter-offer dialog reads them, filling `{price}` from
the box being typed into and `{branch}` from the member's branch.

## 7 · Three buttons not built, each with its reason

| Drawn | Why not |
|---|---|
| **أنشئ مزادًا** (`D4`) | No auction-creation flow exists anywhere in the product, panel or admin. A button opening onto nothing. |
| **جدول تقريرًا دوريًا** (`D11`) | No scheduled email report. The screen says so instead of offering it. |
| **اقبل تلقائيًا فوق / ارفض تلقائيًا دون** (`D5`) | Auto-response rules are a negotiation engine of their own; nothing in the domain evaluates them. |
