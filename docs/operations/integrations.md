# Integration inventory

Every external dependency, what it does, what happens when it is not there, and
where its keys live. Status is read from the `Integration` and `PaymentGateway`
tables, not from this page — the table is the truth and this is the explanation.

## The rule that governs all of them

> **Every integration behind a flag fails quietly, not loudly.** While a service
> is deferred, failure is the expected state, and turning the expected into an
> error makes the user feel they did something wrong when they did not. One grey
> line, no redirect.

`src/lib/env.ts` (`isFeatureOn`) decides. A flag that is off **hides the field
entirely** rather than disabling it: a disabled control invites a click that will
never work.

## Keys and environments

Secrets live in `IntegrationCredential`, encrypted with AES-256-GCM, keyed by
`(integrationKey, env)` where `env` is `TEST` or `LIVE`.

**Outside production the environment is forced to `TEST` in code, not by
discipline** — `effectiveEnvironment()` in `src/lib/domain/integration-env.ts`.
A staging deployment cannot reach a live key even if someone stores one.

**A secret is never shown in full**, is stored encrypted, and rotation needs two
approvers (`ApprovalKind.KEY_ROTATION`).

## The integrations

| Key | What it does | Status | When it is down |
|---|---|---|---|
| `otp_sms` | Login codes by SMS | **active** | Login stops. No silent fallback — an unverified session is worse than no session. |
| `r2` | Image storage (Cloudflare R2) | **active** | Uploads fail; existing images keep serving from their stored URLs. |
| `nafath` | National identity verification | inactive | `idVerified` stays false. Browsing and offers work; anything requiring a verified identity is hidden, not shown-then-refused. |
| `mojaz` | Inspection reports | inactive | Inspection service requests cannot auto-complete; an operator attaches the report by hand. |
| `vin_lookup` | Vehicle data from the chassis number | inactive | **Manual entry is a first-class path, not a fallback.** The VIN field is hidden while the flag is off; the seller fills the form. Most of what a VIN yields is the year and make anyway. |
| `email` | Transactional email | inactive | Notifications fall back to the in-app inbox, which is written first in every case. |
| `payments` | The payment category as a whole | inactive | See the gateways below. |

## Payment gateways

Routing is **per purpose**, not one gateway for everything — `PaymentRoute`,
one row per `PaymentPurpose`. See `docs/api/payments.md`.

| Key | Status | Notes |
|---|---|---|
| `moyasar` | linked | Adapter written **against the published documentation and never tested against the provider**. No test keys yet. `settlementFor` declares itself absent. |
| `tap` | linked | No adapter. `pendingGateway` answers `GATEWAY_NOT_CONFIGURED` for every call. |
| `bank_escrow` | linked | No adapter. Same. |

**A gateway with no adapter is not derived from its capabilities.** Capabilities
describe what it *can* do, not how it is *called* — so an unimplemented gateway
fails explicitly rather than being guessed at.

**A gateway missing a capability a purpose requires does not appear in the list
at all** — it is not offered and then refused. A hold shorter than the purpose
needs is a warning that explains the consequence, and does not block.

## What is not built

- **ZATCA reporting**: the client, cryptographic signing, and the XML export.
  Needs onboarding credentials. Invoices are issued and stored; nothing is
  transmitted.
- **Gateway settlement reads**: `settlementFor` on the Moyasar adapter returns
  `SETTLEMENT_API_NOT_WIRED`. The reconciliation records `UNAVAILABLE`, which is
  deliberately not `MATCHED`.

## When the Moyasar keys arrive

1. Match **every response field by name** against the adapter — the mapping is
   inferred from documentation and has never seen a real response.
2. Run hold-then-cancel first. It is the only sequence that moves no money.
3. Only then let a green reconciliation line mean anything.
