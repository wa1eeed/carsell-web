# Admin authentication

Password + TOTP. **Completely separate from user authentication** — a different
table, a different cookie, no shared JWT and no shared middleware. Mixing a staff
identity with a marketplace-user identity would make a hole in either one a hole
in both.

## Why not the alternatives

- **Magic link by email** would make admin access hostage to Resend. If mail is
  down for an hour, nobody releases an escrow or resolves a dispute.
- **Phone OTP** would blend staff identity with marketplace-user identity, and
  the two tables are deliberately separate.

## Flow

1. `POST /api/v1/admin/auth/login` — `{ email, password }`.
   Success returns `{ stage: 'TOTP_REQUIRED', adminUserId, enrolled }` and
   **issues no session**. TOTP is mandatory for every role without exception.
2. `POST /api/v1/admin/auth/totp` — `{ adminUserId, code }`.
   Success sets the session cookie and returns the admin plus their permissions.
3. `POST /api/v1/admin/auth/logout` — revokes the session and clears the cookie.

Unknown email and wrong password return the **same** error code. Distinguishing
them turns the endpoint into an enumeration tool for the team roster.

## Limits

| Rule | Value |
|---|---|
| Failed attempts before lock | 5 |
| Lock duration | 15 minutes |
| Counter reset | any single success |
| Session lifetime | 8 hours |

The counter covers both stages: five wrong passwords or five wrong TOTP codes
both lock the account.

## Session

A 256-bit random token, stored **hashed** — a database leak grants no sessions.
Cookie is `httpOnly`, `secure` outside development, and `sameSite=strict` rather
than `lax`: the admin panel is never reached from an external link, so the
stricter setting closes CSRF at no usability cost.

A session stops resolving when it expires, when it is revoked, when the account
stops being active, or when `passwordChangedAt` moves past the session's
`createdAt` — so changing a password logs out every device.

## Password hashing

**Argon2id** via `@node-rs/argon2`, at the OWASP-recommended parameters
(19 MiB memory, 2 iterations, 1 lane).

Chosen over bcrypt and over the standard library's `crypto.scrypt` because it is
OWASP's first recommendation and resists GPU/ASIC attack better than scrypt at
equivalent cost. The usual practical objection — native compilation inside
`node:22-alpine` — does not apply: the package ships prebuilt
`linux-x64-musl` and `linux-arm64-musl` binaries, so no build toolchain is needed
in the image.

An empty hash never verifies. That is the deliberate state the migration leaves
existing admin rows in: an account with no known password must not be able to
sign in until `SUPER_ADMIN` resets it.

## TOTP

RFC 6238 over HOTP, SHA-1, 6 digits, 30-second step, ±1 step tolerance.

Implemented directly on `node:crypto` rather than through a library: the
algorithm is about thirty lines and has **official test vectors** in RFC 6238,
so verifying against those is stronger evidence than trusting a dependency.
`tests/totp.test.ts` runs all six published vectors.

Comparison is timing-safe across the whole tolerance window.

## No self-service

No sign-up, no password reset by email, no "remember me", no social login.
Accounts are created by `SUPER_ADMIN`, and resets come from `SUPER_ADMIN` only
and are written to `AuditLog`.

## Audit

Every attempt writes an `AuditLog` row with the IP —
`admin.login.success` or `admin.login.failed`, the latter carrying the reason
and the attempt count.

## Permissions

`src/lib/domain/permissions.ts` holds the matrix from DESIGN-DECISIONS 34.

**Code asks for a permission, never for a role.** `can(role, 'finance.view')`,
not `role === 'FINANCE'` — otherwise the role check spreads across twenty call
sites and changing the matrix means changing twenty files.

`true` is full access, `'read'` is view-without-edit, and a missing key is
denial. Any destination not in the matrix is `SUPER_ADMIN` only, by construction
rather than by an exception list.

Navigation items the role lacks are **hidden, not disabled** — showing them
would reveal the shape of the console to someone who cannot use it.

`escrow.release` and `integrations.rotateKeys` need a second member: they create
an `ApprovalRequest` rather than executing directly.
