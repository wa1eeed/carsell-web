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

## Not yet

- The **inspection form** behind `complete`. Its fields come from the owner
  after the current tasks, so the button completes without a form today rather
  than inventing fields that would be replaced.
- **Money**: the hold is never captured and the split is never sent. That is the
  Moyasar Platform adapter's job — `docs/api/provider-payments.md` — and the
  remaining rows in `docs/BACKLOG.md` § I.
- **Notifications** to the provider when a request lands in their queue.
