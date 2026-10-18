# The provider panel

One panel for every provider type — the owner's decision, 2026-10-14:

> «ليس لكل مزوّد خدمة لوحة مستقلّة، وإنما نريد **لوحة مزوّدين موحَّدة** مهما
> كان نوع الخدمة … **الفرق يكون في صفحة تفاصيل الطلب**: كرت معلومات الطلب، ثم
> قسمٌ أسفله متغيّر حسب نوعية الطلب وفيه أزرار الأكشن.»

Inspectors today; ownership-transfer providers later, assigned and confirmed the
same way. Adding that second type is **a line in a definition, not a second
screen** — two twin screens drift the first time one of them is edited.

## What was missing

`src/app` held `[locale]` and `admin` and nothing else, so a provider had no
login and no screen. `ServiceRequestStatus` had no writer past `NEW`: whoever
paid for an inspection stayed in the queue forever, and the inspector could not
see the work, let alone confirm it.

## Identity — a third one, not a second

The product had two: a marketplace user (phone and a code) and an admin (email
and a password). A provider is **neither**: a business with staff who change,
working only on requests assigned to it.

`ProviderUser` + `ProviderSession`, with their own cookie, separate from both.
Mixing a provider's identity into the admin's would make one hole in either a
hole in both — and a provider reading the platform's money.

Login is email and password like an admin, not a phone like a customer: a
business has staff who come and go, and one account each beats one number they
pass around. There is no self-registration and no password reset: the account is
created by the platform alongside the payment account, because an open sign-up
for parties who get assigned real work and real money is an impersonation door.

No lockout after failed attempts, unlike the admin: a provider account does not
release money or settle a dispute, and locking a door shared by a centre's staff
takes the whole centre offline over one typo. `AuditLog` carries the record.

## The shell is one; the steps are a definition

```
accept  NEW          → ASSIGNED      (the request becomes yours alone)
start   ASSIGNED     → IN_PROGRESS   (the requester learns work began)
complete IN_PROGRESS → DONE          (form: INSPECTION, or none)
fail    IN_PROGRESS  → FAILED        (a written reason, reviewed by the platform)
```

`accept`, `start` and `fail` are shared — that is the journey of any assigned
work. **Only the form at `complete` differs by type**, which is exactly the
"variable section" the owner described. Ownership transfer will be one more row
in `STEPS_BY_TYPE`.

**And each step tells whoever paid.** `applyStep` used to write the status and
say nothing: the person who paid for an inspection did not learn that a centre
had taken it, nor that it was done, nor that it had failed — so they came back
to the screen to ask, or did not come back. Three moments are sent, not four:
`accept` (a centre took it), `complete` (high), `fail` (critical — money was
paid and the service did not happen). `start` is deliberately silent: it changes
nothing the requester can do, and a notification that leads to no action and no
new expectation is noise.

`service.completed` had been **declared silent** under gate 45 with the reason
"nothing in the product finishes a service request" — true when it was written,
and false the moment the provider panel shipped. The declaration is gone and the
gate now holds it to a writer.

**`fail` exists from every working state.** Without it a request stays "in
progress" forever, or the provider closes it falsely to be rid of it.

**Only what the current state accepts is offered.** A button that returns 409
after the click is worse than no button — and the guard is in the **server**:
`applyStep` re-derives the allowed steps and refuses anything else, so a direct
call cannot finish a request that never started.

**Acceptance happens once.** The update carries `providerId: null` in its
condition, so two simultaneous accepts produce one winner; the loser reads zero
rows affected and is told someone else took it — not that the request vanished.

## What the provider sees

Only **paid** requests. One awaiting consent or payment is not work yet, and
showing it sends an inspector to an appointment nobody paid for.

Only requests **assigned to them**, or offered to their type in their cities. A
request assigned elsewhere is a 404, not a 403 — its existence is itself
information.

The info card carries **two parties**: who requested and paid, and who holds the
car. They are not always the same person — a buyer inspecting someone else's
car is the common case — and showing only one sends the inspector to call
somebody who cannot open the gate.

## Routing

`/provider` sits outside the locale tree, Arabic only, like the admin panel
(decision 2026-10-12). The middleware must exclude it explicitly: without that
line `next-intl` rewrites `/provider` to `/ar/provider` and the panel answers
**307 to a path that does not exist**. That was measured by clicking, not
reasoned about.

It stays inside the CSP matcher. Being outside locale routing is not a reason to
be outside the content policy — that mistake was already made once with `/admin`
and `/api`.

## The provider's page in the admin panel

The owner's words: «صفحة تفاصيل المزوّد… إضافة رصيد، والطلبات التي استلمها،
ومستحقّاته، وكل شيء يخصّه… كل شيء كل شي».

Before it there was a table showing «three overdue» that opened none of them,
so whoever read the number went looking for three rows among a hundred by hand.
The name is now a link, and the page carries:

- **Counters** for offered · accepted · in progress · completed · failed ·
  overdue, each computed from the same list the page renders. A count derived by
  a second query with a second condition answers one question with two numbers —
  which is how gate 40 was born.
- **The requests received**, each one a link to its admin page.
- **Who signs in on the provider's behalf**, with whether they have changed
  their password and when they were last seen. Without this list nobody knows
  who can read our customers' requests, or who still has access after leaving.
- **The payment account**: its state, both identifiers, what the state means for
  the operator — and the registration file, the button that opens the account,
  and the fees that were actually sent with it. Before this the card could only
  *display* an account; nothing in the product could create one, so a provider
  added from the panel stayed at `NONE` and never entered the dispatch pool.
- **The value of what they completed.**

**Two numbers deliberately not shown as one.** What the provider has *earned* is
computed from **completed requests in our ledger** — we know it and can prove
it. Their **balance at the gateway** is not ours to compute: the money goes to
them directly, so a figure we calculate is a figure we are guessing. That
difference is the difference between a mirror and an original, and the page says
«قيمة ما أنجزه» rather than «رصيده».

And the amount is the **request's value, not the provider's share**: our cut is
deducted in the split at the gateway, and computing it here with a second rule
would produce two answers to one question.

- **The bank account and what was transferred** — see below.

## Paying the provider

> «ابدأ بصرف مستحقات المزودين» — the owner, 2026-10-18.

`PROVIDER_PAYABLE` was credited on every completed service and **nothing ever
debited it**. The inspector inspected, we booked a debt, and no path in the
product moved a riyal to them; the balance on their page meant *everything ever
earned*, never *what is still owed*.

### The queue

`/admin/provider-payouts` lists who is owed, read **from the ledger** rather than
from a sum of their requests, with the pending requests first because that is
what needs a person now. It mirrors `/admin/payouts` for sellers deliberately:
one shape for "money leaves to an external account", learned once.

A separate screen, not a mixed one: whoever pays providers should not search for
seven rows among a hundred sellers. And a separate table (`ProviderPayout`), not
a nullable column on `Payout` — the party is a `ServiceProvider`, the account is
`PROVIDER_PAYABLE`, and one foreign key cannot point at two tables.

### Two people, and the second one writes

`requestProviderPayout` opens an `ApprovalRequest` with `requiredApprovals: 2`
and **moves nothing**. `approveProviderPayout`, run by a different admin, writes
the `SENT` row, the ledger entry and the audit record in one transaction. The
requester cannot approve their own request (403, not 422 — it is forbidden to
this person however often they retry), and cancelling *is* theirs: the quorum
guards money leaving, not calling it off.

The amount is re-checked against the ledger at approval, not only at request: a
manual adjustment in between would otherwise let an approved transfer exceed
what is owed.

The bank reference is required, because the transfer itself is executed by
finance from the bank — integrations are deferred — and this row is what
reconciles against the bank statement.

### The destination had no field

`ServiceProvider.iban` was added with the flow. Enforcing "no payout without an
IBAN" with no way to enter one is a lock with no key — the same mistake
`profileCompletion` made against buyers. It is written through
`PUT /api/v1/admin/providers/{id}/iban` (write-only, `payouts.send`, never a
field in the general edit form that would blank it on save), stored encrypted
like `User.iban`, and read back masked — `SA03••••7519`. Validation is
`checkIban`, mod-97 included: a correct length and prefix do not stop a
transposed digit, and that money does not come back.

### What the provider sees

`/provider/earnings` answers the three questions in their own words: **لك الآن**
(what is still owed), **مجموع ما استُحقّ** (everything ever earned) and **ما
حُوِّل إليك** (what has arrived), plus the bank account on file, the transfers
with their references, and the full statement. Only `SENT` rows are shown: a
request awaiting a second approver is not money that arrived.

The statement's wording is its own map (`PROVIDER_SELF_EVENT_LABEL`), because
the admin's says «حُوِّل إلى **حسابه**» and this reader is the provider.

## Not yet

- The **inspection form** behind `complete`. Its fields come from the owner
  after the current tasks, so the button completes without a form today rather
  than inventing fields that would be replaced.
- **Money**: the hold is never captured and the split is never sent. That is the
  Moyasar Platform adapter's job — `docs/api/provider-payments.md` — and the
  remaining rows in `docs/BACKLOG.md` § I. The **account** itself is no longer
  missing: the provider's admin page opens it, reads its state and submits it
  for review, under a fee matrix set from `/admin/payments`.
- **Notifications to the provider** when a request lands in their queue.
  `Notification` is keyed to a marketplace `User`, and a provider is a third
  identity — so nothing can reach them out of band, and the channels that would
  carry it (email, SMS) are behind flags for everyone. The panel's empty state
  **used to promise one anyway**; it now says what is true: the queue is the
  place, check it. A centre waiting for a message that never comes loses a paid
  request while its clock runs.

---

## Completion forms — one form, a field schema per type

Added 2026-10-17, on the owner's request:

> «يجب ان تكون لوحة مستقله للمزود و كما تناقشنا موحده لجميع المزودين بطريقه
> ذكيه و تشمل المزودين من نوع فاحصين حيث هناك حقول للتعامل مع الفحص **و اذا
> كان المزود نقل ملكيه هناك حقول تناسبه لتنفيذ الطلب و هكذا لباقي المزودين**»

### The hole this closed, and it was wider than it looked

`Step.form` was declared in `STEPS_BY_TYPE` the day it was written — and
**never enforced**. Two separate defects fell out of that:

1. **Six types finished with no fields at all.** A shipping provider pressed
   «أنهِ» and we never learned the waybill number; an insurer left no policy
   number; a lender's decision was never recorded. The customer paid, read
   «اكتمل», and that was the whole of it.

2. **The inspector could close an inspection with no report.** `form:
   'INSPECTION'` sat next to the «أنهِ» button as a *link*, and the button
   worked whether or not the link was followed. Everything downstream then ran:
   `recordServiceEarned`, `issueServiceInvoice`, `captureServicePayment` — so
   **we recognised revenue, issued a tax invoice and captured the money for an
   inspection that did not exist**. A guard the screen suggests is not a guard.

Both are now one rule: `applyStep` refuses `FORM_INCOMPLETE` unless the proof
is complete, checked on the single entry point to the status.

### The shape

Difference between types is **data, not screens**:

| File | Holds |
| --- | --- |
| `src/lib/domain/completion-schema.ts` | the field schema per `ProviderType`; no `db`, so the browser reads it |
| `src/lib/domain/completion-validate.ts` | `checkCompletion` — pure, time passed in; **the screen and the server call this same function** |
| `src/lib/domain/service-completion.ts` | `completionFormView`, `saveCompletion`, `completionComplete`, `completionOf` |
| `src/lib/labels/completion.ts` | the Arabic names (gate 17 keeps prose out of the domain) |
| `src/app/provider/[ref]/complete/` | one form that renders any type's schema |
| `src/components/ui/CompletionRecord.tsx` | one card read by the provider, the admin and the customer |

Adding a field is a line in the schema. Adding a type is a line in the enum —
`STEPS_BY_TYPE` is now **built** from `ProviderType` × the schema, so a new
value cannot arrive with no steps at all.

### Storage — a row per field, a column per kind

`ServiceCompletionField(requestId, key, valueText?, valueNumber?, valueDate?)`,
unique on `(requestId, key)`. A row per field so a new field is not a
migration; a column per kind so money stays `Decimal` and dates stay dates —
one text column would make `١٢٠٤٠٠` and `120400` two different readings of one
odometer. Same shape as `InspectionResult`.

A re-save **deletes then writes**: a lender who switches the decision from
approval to rejection must not leave `approvedAmount` behind, or the record
reads «رُفض» above «المبلغ المعتمد ٨٠٬٠٠٠».

### What the fields check

Beyond required/length: numbers accept any paste shape and normalise through
`toLatinDigits` (Arabic-Indic digits, Arabic thousands and decimal marks);
`when: 'PAST'` refuses a delivery date that has not happened yet — a proof of
something not yet done is a lie, not a formatting slip; `notBefore` refuses a
delivery before its pickup and a policy that expires before it starts;
`onlyWhen` hides a field whose answer has no meaning, and **the server derives
the visible set from the same function**, so the screen never hides what the
server then demands.

Every issue is returned at once. A form of seven fields that reports one error
per round trip is seven round trips for one job.

### The second half

The provider writes it; the customer and the operator read it. Both screens
carry `CompletionRecord`. Before this, `/account/reports` listed only
`NEW · ASSIGNED · IN_PROGRESS` plus inspection reports — so **a completed
shipping or insurance request vanished from the account entirely** the moment
it was finished, and the page holding its policy number had no inbound link.

### Wording follows the type

`SERVICE_REQUEST_NEXT.DONE` read «التقرير جاهز» for every type, so a courier
who delivered a car told its owner a *report* was ready. `SERVICE_DONE_BY_TYPE`
now names what actually happened — «سُلّمت المركبة», «صدرت الوثيقة», «نُقلت
الملكية» — and a test pins every enum value to a phrase.
