# Errors and logs

_Last updated: 2026-10-19_

## One entry point

Every error is reported through `reportError()` in
`src/lib/observability/report.ts` — not through scattered `console.error`. When
a provider key arrives, one file changes and no path is left writing into
nothing.

With no provider configured it falls back to **one structured JSON line on
stderr**. Not an error, not a redirect: a deferred integration failing is the
expected state, and turning the expected into an error floods the log with what
nobody reads.

## Nothing secret reaches a log

Redaction runs **by key name and by value shape**, because either alone leaks:

- By name: `secret`, `token`, `password`, `authorization`, `cookie`, `iban`,
  `vat`, `otp`, `pin`, `hash`.
- By value: API keys (`csk_…`, `sk_live_…`), bearer tokens, JWTs, 15-digit
  numbers, Saudi mobile numbers.

A name alone misses a secret pasted into a field called `note`. A value alone
misses a short password with no pattern. Tests assert both directions, and also
assert that non-secret fields survive — blanket redaction produces a log with no
diagnostic value.

## Reporting never throws

A reporter that throws inside an error handler hides the original error and
replaces it with its own. `reportError` swallows everything, including circular
structures (depth-capped), and a test asserts it.

## Failures after a committed transaction

Document issuance runs **after** the transaction that settles a payment or
advances a stage. If it throws, the money has already moved — so it is caught
and reported rather than rethrown. Rethrowing would show the caller a failure
that did not happen, and invite a retry against a settled payment.

The retry queue is the data itself: `orderDocuments` shows the document as
pending, so the gap is visible and re-issuable.

## Client render errors

`src/app/global-error.tsx` posts to `/api/v1/client-error`, which is
**rate-limited by IP** — a route that accepts free text from any visitor is
otherwise a channel for burying what matters under noise.

The visitor is never shown the error message; it can carry a path, an id, or a
fragment of a query. Only `digest` is shown, which links to the log and says
nothing about the system.

## Not built

A hosted error tracker (Sentry or equivalent). It needs an account and a DSN.
The interface above is what it plugs into; nothing else changes.

## Security headers

Defined once in `src/lib/security/headers.ts`; see
[ADR 0002](../architecture/adr/0002-security-headers.md) for the reasoning.

Verify on a running environment:

```bash
curl -sD- -o /dev/null https://carsell.one/ar | grep -iE '^(content-security|x-|referrer|cross-origin|strict-)'
```

Expected on production: `Content-Security-Policy` carrying a `nonce-…` that
**changes on every request**, plus `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy`, both `Cross-Origin-*` headers, and
`Strict-Transport-Security`.

A fixed nonce across two requests means the middleware is being bypassed —
usually a path that stopped matching `config.matcher`.

`Strict-Transport-Security` is absent outside production **by design**: it is
gated on `APP_ENV`, and sending it from a local host disables plain
`http://localhost` for every project on that machine.
