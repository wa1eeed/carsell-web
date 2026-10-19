# The provider payments gateway

_Last updated: 2026-10-19_

Two gateways, not one — the owner's decision, 2026-10-14.

| | The platform's gateway | The providers' gateway |
| --- | --- | --- |
| Integration key | `payments` | `moyasar_platform` |
| Account | an ordinary merchant account | a **multi-merchant platform** |
| Carries | vehicle sales: escrow, commission, transfer fees | provider services |
| Can do | hold · settle · refund | open provider accounts · **split** · authorize & capture · onboarding |
| Base URL | `https://api.moyasar.com/v1` | `https://apimig.moyasar.com/v1` |
| Docs | public | private, credentials held by the owner |

The difference is structural, not administrative. On the first, money lands in
our account and we transfer it onward. On the second it goes **straight from the
licensed gateway to the provider**, and our share is deducted as a split inside
the same payment. We never hold or aggregate someone else's money — which is a
regulatory condition, not an engineering preference.

## Why a separate port

`PaymentGatewayPort` knows hold, settle, refund — verbs about a **payment**.
This knows open an account, track its state, read its balance — verbs about an
**account**. Folding both into one port would make every card gateway claim
capabilities it does not have.

`src/lib/payments/provider-platform.ts` holds the port; the vocabulary there is
ours. Gate 15 keeps the provider's words inside
`src/lib/payments/adapters/moyasar-platform.ts`, which is the one place that
translates:

```
account        → merchant          payout reference → entity_id
split          → splits            open an account  → create merchant
```

## Authentication

HTTP Basic. **The key is the username and the password is empty** — the
provider's own documentation says so. It is an unusual shape that invites
putting the key in the password field, and the API then answers 401 without
saying the two are swapped. The adapter has a test pinning the exact header.

## Two identifiers, never interchangeable

A created account returns both:

- `accountRef` (`id`) — how the account is **managed**.
- `payoutRef` (`entity_id`) — where money is **sent**.

Both are UUIDs, so using the first for a split is accepted in shape and sends
money nowhere. They are separate fields in `ServiceProvider` and separate fields
in the port's type, so the mistake cannot be made by forgetting.

## Account states

Eight, carried through rather than flattened: `PENDING` · `MISSING_DOCS` ·
`UNDER_REVIEW` · `SEMI_ACTIVE` · `ACTIVE` · `HOLD` · `REJECTED` · `DISABLED`,
plus `NONE` for a provider with no account yet.

Flattening these into "active / not active" hides the difference between
"waiting for a document" and "rejected" — two completely different next actions
for whoever is chasing it. The provider's own `reasons` are carried verbatim
into `accountNote` and shown to the operator; a reason translated by guesswork
is worse than the original.

An unknown state reads as `PENDING`, never as active. A new state the provider
adds must not quietly grant a provider the ability to be paid.

## Splits

Splits ride on the payment, as an array of `{recipient_id, amount}` in the
smallest currency unit. Our recipient id is the platform id (read from the
provider, never typed — a mistyped id sends our share to someone else's
account); the provider's is their `entity_id`.

Two rules, enforced by `checkShares` **before** the payment is sent:

1. **The splits must sum to the payment.** A payment rejected for a bad split is
   rejected *after* the customer entered their card, so our defect reads as a
   problem with their card.
2. **At most one split bears the gateway fee.** With none marked, the provider
   picks the largest merchant split — so the provider ends up paying a fee
   nobody agreed with them.

Sums are compared in halalas, not riyals: `0.1 + 0.2` is not `0.3` in floating
point, and a one-halala mismatch rejects a whole sale.

Splitting is **enabled per platform by the provider's account manager**, not by
default. A platform without it sees splits ignored rather than refused — so the
first live run must be checked against a real settlement, not assumed from a 200.

## Credentials

Entered from `/admin/integrations`, encrypted into `IntegrationCredential`,
**never written into the repository** — the repo's rule that a default committed
to the tree eventually reaches a public server.

The editor used to accept free-form key names, which meant one extra character
stored a secret nobody reads: configured in the operator's eyes, unconfigured in
the code's, with nothing failing. `src/lib/domain/integration-fields.ts` now
declares the names per integration and the editor prefills them. That module
holds no `db` import on purpose — the editor is a client component, and the
server boundary runs through imports, not directives.

`moyasar_platform` takes one field: `platformKey`.

## Verified against the sandbox

A test platform key arrived on 2026-10-14 and is stored in the admin panel
(encrypted, never in the repo). Three calls were made against
`https://apimig.moyasar.com/v1`:

| Call | Result |
| --- | --- |
| `GET /platform` | **200** — returns the exact platform id we were given, so the auth header and the id mapping are proven |
| `GET /merchants` | **200** — `{merchants: [...], meta: {...}}` |
| `GET /balance` | **403 `User not authorized`** |

**Two things only a live call could show.**

**The balance is not a platform-key endpoint.** The documentation says it in one
word — "using the **entity** secret API key" — and I had read it as the
platform's balance and written a method that cannot work. The shape was right,
the path exists, the key is valid, and the answer is a refusal. `balance()` now
takes the account's own key and returns `NOT_CONFIGURED` when we do not hold
one; merchant keys come back in `api_keys` when an account is created.

**The merchant list is paged**, not a bare array. Reading it as an array returns
nothing *without an error* — the quietest possible failure.

## The connection check actually calls now

`/admin/integrations` has a «افحص الاتصال» button that used to ask "is a secret
stored?" and answer "untested". **A label is a promise, not a description**:
whoever pressed it believed their key worked when nothing had tried it, and the
error would surface at the first paying customer.

`src/lib/domain/integration-probes.ts` holds a probe per integration. For
`moyasar_platform` it is `GET /platform` — the lightest call that proves the
key: it reads nothing, writes nothing, and returns the id our share is split to.
Integrations with no adapter stay honestly "untested" rather than being called
"connected".

Walked from the panel: `moyasar_platform` → `LIVE_OK`, `lean` → `NO_SECRET`.

## Creating an account — four things only the call revealed

One merchant was created in the sandbox on 2026-10-14, with the owner's own
email as the admin address (their explicit authorisation — the call sends an
invitation). It took three refusals to get a 201, and each refusal taught
something the documentation did not.

**1 · `fees` is required, and the overview page does not list it.** Omitting it
returns `400 {"fees":["This field is missing."]}`. The field is documented on a
separate page.

**2 · The rate is a fraction, not a percentage.** `1.70` returns `400 — "must be
less than or equal to 1"`, while the fee documentation's own example writes
`1.70` and calls it a percentage. The value is `0.0170`.

This is the most dangerous item in the whole integration: had the ceiling been
looser, `1.70` would have been accepted and charged a partner **a hundred times**
the intended fee, with nothing in the type system or a stubbed test to catch it.
`FeeMatrix` now says fraction in its name and its comment, and the fee matrix is
a **required explicit input** rather than a default written in code — defaults
set commercial terms for a real partner that nobody decided.

**3 · The response carries the account's secret keys, once.** `api_keys` holds a
publishable and a secret key per environment. The secret is the **only** way to
read that account's balance, and it is returned exactly once — never fetched
again. It is captured at creation and stored encrypted in
`ServiceProvider.accountSecret`; it is never shown on a screen or written to a
log. The environment is chosen by `APP_ENV`, not `NODE_ENV`, because the second
reads `production` on staging too.

**4 · The response says which documents the account needs.** For an
establishment: commercial registration, owner ID, bank IBAN certificate. Without
surfacing these, an account sits at "missing documents" with no way to know
which.

### Verified end to end

| Call | Result |
| --- | --- |
| `POST /merchants` | **201** — `status: pending`, both identifiers, keys, required documents |
| `GET /merchants/:id` | **200** — reads back `PENDING`, the payout id, the three documents |
| `GET /merchants` | **200** — one account, inside the paged envelope |
| `GET /balance` with the **account's** key | **200** — `0.00` across the board |
| `GET /balance` with the **platform** key | **403**, as before |

### The fee matrix is a commercial decision

The sandbox account was opened with the provider's own documented example rates
(mada 1.70 %, card 2.70 %). **Those are not our terms** — what we charge a
provider per transaction is the owner's call, and the field is deliberately
required so nobody can set it by forgetting.

## The matrix is set from the admin panel

> «مصفوفة الرسوم سواء للمزوّدين أو لبوابة الدفع يجب أن تكون قابلة للضبط من لوحة
> التحكّم … فالرسوم تُضبط من لوحة الأدمن ولا نضعها داخل الكود»
> — the owner, 2026-10-14.

`/admin/payments` carries three fee cards, deliberately not derived from one
another: what the gateway charges **us**, what we charge the **two sides of a
sale**, and this one — what the providers' gateway charges a **partner**.

Stored in `PlatformSetting` as seven nullable decimals plus a tax-inclusive
flag. `PUT /api/v1/admin/payments/provider-fees`, permission `finance.view`,
audited as `payments.provider_fees_changed`, and the response says how many
accounts are already open: the fees ride to the gateway when an account is
created and stay there, so what is open keeps its terms.

**Null is not zero.** An unset matrix blocks account opening and says so;
sending zeros would mean "we take nothing from this partner" — a commercial
decision that must not happen by forgetting.

### Percent in, fraction out — in one function

The operator agrees on "1.70 %" and types that. The gateway caps the value at 1
and rejects `1.70`. `feeMatrixFromPercent` is the only place that converts, and
the field shows the fraction it will send directly under the percentage box, so
the two numbers sit side by side before saving rather than after the first
charge. `toFixed(5)`, because the column holds three decimals of a percentage —
which is five of a fraction.

Storing the fraction instead would be worse: the operator would read `0.017` as
a percentage and type a hundred times over.

## Opening an account — from a screen

`openAccount` was built, tested and proven against the sandbox, and **nothing in
the product called it**: no button, no route. `accountStatus` had no writer
outside the seed, and `cityPool` requires `ACTIVE` or `SEMI_ACTIVE` — so a
provider added from the admin panel would never be sent a request, ever.

The provider's page now carries the whole account lifecycle:

| Step | What it is |
|---|---|
| The registration file | `PUT …/providers/{id}/account` — the seven fields the regulator asks for, saved and reviewed before anything is sent |
| Open the account | `POST …/providers/{id}/account` — irreversible, and the screen says so |
| Read its state | `POST …/providers/{id}/account/sync` — the partner uploads documents in the gateway's own dashboard, not ours |
| Submit for review | `POST …/providers/{id}/account/submit` — shown only when the gateway says the documents are complete |

**The file and the opening are two acts, not one.** The file is collected from
the partner over time and corrected; opening creates an account with a regulated
body under commercial terms and sends an invitation to an email. Merging them
would let a corrected website open an account.

**A file is not edited once its account is open.** What the gateway holds does
not change because we changed a row, and a screen saying otherwise is a lie.

Everything the response returns **once** is captured in the same write: both
identifiers, the account's secret key (encrypted — it is the only way to read
that partner's balance), the required documents, and a **snapshot of the fees
actually sent**. The snapshot is shown on the page instead of today's matrix:
the matrix changes, the partner's terms do not.

Permissions split the decision from the act: finance sets the matrix
(`finance.view`), operations opens accounts under it (`services.manage`).

### Walked on screen, 2026-10-14

A provider was created from `/admin/providers`, its file filled, and the account
opened against the sandbox with the owner's authorised test email. The gateway
returned `201`: `accountRef a7d28ad2…`, `payoutRef 760f8ef6…`, status pending,
and three required documents, which the page renders in Arabic. The fee line
reads `mada 0.01700 · card 0.02700` — the fractions, from the percentages typed
into the panel. Sync returned `200`.

## Still unproven

Submitting an account for review and sending splits with a payment. Submission
needs the documents in place first, which the sandbox account does not have —
the button exists and is shown only when the gateway reports them complete.
