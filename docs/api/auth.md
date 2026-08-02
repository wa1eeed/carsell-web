# Auth

Phone + one-time code. No passwords, no NextAuth. The same endpoints serve the
web and the Flutter app: the web reads the session from an `HttpOnly` cookie, the
app from an `Authorization: Bearer` header.

All business logic lives in `src/lib/domain/auth.ts`. The route handlers only
validate shape, normalise input and delegate — the app will call the same
functions, so a rule may never live in an HTTP route alone.

## Response envelope

Success is `{ data, meta? }`. Failure is
`{ error: { code, messageAr, messageEn, fields? } }`. Messages ship in both
languages so no client has to keep its own error translation table. Codes are
defined once in `src/lib/api/response.ts`.

## `POST /api/v1/auth/otp/request`

```jsonc
// → { "phone": "0512345678" }
// ← { "data": { "challengeId": "…", "expiresIn": 300 } }
```

**The response is identical whether the number is registered or not.** Sign-in
and sign-up are the same step: no account is created here, only on the first
successful verification. This is what stops the endpoint from becoming an
account-existence oracle.

Accepted input formats — all normalise to `+9665XXXXXXXX` before touching the
database, otherwise one person ends up with several accounts:

`0512345678` · `+966512345678` · `966512345678` · `00966512345678` ·
`512345678` · with spaces or dashes · with Arabic-Indic digits.

In `development` only, the response also carries `devCode` so the flow is
testable without an SMS provider.

The condition is `APP_ENV === 'development'`, **not** `NODE_ENV !== 'production'`.
Staging is on the public internet, and an exposed code means impersonating any
number with one click. A test asserts `devCode` is absent whenever `APP_ENV` is
not `development`, including the case where `NODE_ENV` says `development` — the
exact configuration in which the wrong condition leaks.

### Test numbers

For exercising staging without SMS cost, `OTP_TEST_NUMBERS` holds a
comma-separated list of E.164 numbers whose code is always `000000`. **Real
numbers always go through the provider — no exception.** Every use writes an
`AuditLog` row with action `otp.test_number`, so a list left open in production
shows up in the audit trail rather than in silence.

| Failure | Status | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 422 | not a Saudi mobile number |
| `OTP_COOLDOWN` | 429 | resend requested within 30s; `Retry-After` set |
| `OTP_RATE_LIMITED` | 429 | 6th send within the hour |

## `POST /api/v1/auth/otp/verify`

```jsonc
// → { "challengeId": "…", "code": "164468" }
// ← { "data": { "token", "user", "isNew", "completion" } }
```

Sets the session cookie and returns the same token in the body. Codes typed in
Arabic-Indic digits are normalised before comparison.

| Failure | Status | Meaning |
|---|---|---|
| `OTP_INVALID` | 400 | wrong code, or unknown challenge |
| `OTP_EXPIRED` | 410 | older than 5 minutes |
| `OTP_CONSUMED` | 410 | already used, or invalidated |
| `OTP_ATTEMPTS_EXHAUSTED` | 429 | 5 wrong attempts — challenge is dead |
| `ACCOUNT_BLOCKED` | 403 | user is suspended or banned |

## Limits

| Rule | Value |
|---|---|
| Code length | 6 digits |
| Validity | 5 minutes |
| Sends per hour, per number | 5 — the 6th is rejected |
| Verify attempts per challenge | 5 — the 6th is rejected |
| Resend cooldown | 30 seconds |

Four digits would be 10,000 combinations, which is not enough to guard an account
that moves money.

Limits are counted in Postgres rather than in memory: they survive a restart and
stay auditable. Redis takes over for the high-frequency limits later — bidding at
10/minute, task 19.

An attempt is counted **before** the comparison, so a failed attempt costs even if
the connection drops afterwards. Reaching the ceiling invalidates the challenge
rather than slowing it down. A correct code on the last remaining attempt still
succeeds.

## Code storage

Codes are never stored raw. The hash is
`sha256(OTP_PEPPER + ':' + challengeId + ':' + code)`. The pepper lives outside
the database, and including the challenge id means the same six digits hash
differently in every challenge — so no rainbow table over a six-digit space.
Comparison is timing-safe.

## Session

HS256 JWT, subject is the user id, issuer `carsell.one`, 30 days. Cookie is
`HttpOnly`, `SameSite=Lax`, and `Secure` outside development. `verifySession`
returns `null` on any bad or expired token — it never throws.

## `GET /api/v1/me`

Returns the user plus `completion`. `iban` is never returned — only `hasIban`.

`completion.missing` lists what is still needed **before the first purchase or
sale, not at sign-up**: `email`, `idVerification`, `iban`. Browsing works
immediately with just a phone number, which is what keeps sign-up from losing
people. `canBuy` needs email and identity; `canSell` needs the IBAN too, because
an IBAN is for receiving money, not sending it.

## `GET /api/v1/me/entitlements`

Returns the resolved feature map. The UI shows or hides selling options from
this — never from a hardcoded condition.

Resolution order, last wins: entitlement default → active subscription's plan →
non-expired user override.

**The golden rule:** code asks `entitlement("can_auction")`. It never asks "is
this a dealer?" or "what plan is this?". One exception destroys the system later.

## Not yet built

- SMS delivery (task 27) — `devCode` stands in until then.
- Nafath is **not** a sign-in method. It is an identity-verification option after
  sign-in, on screen A18.
