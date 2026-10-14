# The provider payments gateway

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

## Still unproven

Creating a merchant, submitting one for review, and sending splits with a
payment. Those write, so they wait for a deliberate sandbox run rather than a
read-only probe.
