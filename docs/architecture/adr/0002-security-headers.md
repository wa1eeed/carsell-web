# ADR 0002 — Security headers, and a nonce-based CSP

**Status:** accepted · 2026-10-11
**Applies from:** task 96 onward.

## Context

The platform serves a marketplace that holds payments in escrow, stores national
identity numbers, and gives staff an admin console with permission to release
money. It was serving **no security headers at all** — no `Content-Security-Policy`,
no `X-Content-Type-Options`, no framing protection, no HSTS.

Three consequences, in order of severity:

1. **Any injected script executes.** Listing descriptions, dealer names, dispute
   messages and inspection notes are all user-supplied text rendered into pages.
   React escapes them, but one `dangerouslySetInnerHTML`, one third-party widget,
   or one dependency compromise turns into script execution on our origin — with
   the session cookie of whoever is looking.
2. **The admin console can be framed.** A transparent iframe over a decoy page
   steals clicks from a signed-in administrator. The actions behind those clicks
   include releasing escrowed funds.
3. **Uploaded files can be sniffed into scripts.** Without `nosniff`, a browser
   may ignore the declared `Content-Type` and execute what it guesses.

## Decision

Headers are defined **once**, in `src/lib/security/headers.ts`, and applied from
two places because they have two lifetimes:

| Where | What | Why there |
|---|---|---|
| `next.config.ts` → `headers()` | the constant headers | evaluated once at boot, and **covers every path** including `/api`, `/admin`, `/_next` and static files |
| `src/middleware.ts` | `Content-Security-Policy` | needs a **fresh nonce per request**, which a static config cannot produce |

### The CSP is nonce-based, not `unsafe-inline`

A policy that allows `'unsafe-inline'` for scripts permits exactly what it exists
to prevent. The middleware mints a nonce per request and writes it **to both the
request and the response**:

- the **response** header is what the browser enforces;
- the **request** header is where Next reads the nonce to stamp its own inline
  bootstrap scripts.

Writing one without the other produces two opposite failures: a policy that is
never enforced, or a blank page because the framework's own scripts were blocked.

`'unsafe-inline'` **is** allowed for styles. Next injects inline styles during
hydration, blocking them breaks rendering, and a style cannot execute.

### The middleware matcher now includes `/admin` and `/api`

They were excluded because they are outside locale routing — and so they were
also outside the CSP. They are the two highest-value targets in the product. The
middleware now branches internally instead of excluding them at the matcher.

### HSTS is gated on `APP_ENV === 'production'`

Not `NODE_ENV`, which equals `production` on staging too. And never on a local
host: a browser caches HSTS for the whole hostname, so sending it from
`localhost` disables plain `http://localhost` for **every other project** on that
machine, and clearing it requires a browser-internal setting rather than clearing
site data.

## Consequences

- No external origin may be loaded without editing the policy and this ADR.
  `tests/security-headers.test.ts` fails if any `https://` appears in it — a new
  origin should be a written decision, not a line that passes review.
- Adding an inline `<script>` requires passing the nonce from `headers()`.
- A dropped header is invisible: the page keeps working and only the protection
  disappears. The test is the only thing that notices.

## Alternatives considered

**Headers at the reverse proxy (Coolify/nginx).** Rejected: configuration that
lives outside the repository is forgotten on the next environment, and cannot be
tested in CI. The Dockerfile lesson applies — the file travels with the repo.

**A report-only CSP first.** Rejected for this stage: there are no external
origins to discover, the policy was verified by loading the public site and the
admin console, and a report-only policy protects nothing while it collects data.
