# Public API — `/api/public/v1`

_Last updated: 2026-10-19_

Read-only. Key-authenticated, rate-limited per key.

## Authentication

```
Authorization: Bearer csk_...
```

Keys are **stored hashed**, never in the clear. A stolen database gives an
attacker nothing that works. The key is shown **once at creation** and never
retrievable — a "retrieve my key" feature is a back door into every account
that uses it.

The first eight characters are stored as a `prefix` for identification only.
That prefix alone does not authenticate; a test asserts it.

Comparison is constant-time after hashing. A comparison that exits at the first
difference leaks the length of the matching prefix, and enough measurements
rebuild the key one character at a time.

### Two failures, not one

| Status | Code | Meaning |
|---|---|---|
| 401 | `API_KEY_MISSING` | No header |
| 401 | `API_KEY_INVALID` | Unknown key — a configuration error |
| 401 | `API_KEY_REVOKED` | Known key, withdrawn — a decision that was taken |

They are distinguished on purpose. One message for both makes a client retry a
key that will never work again.

## Rate limiting

Per **key**, not per IP: a client behind NAT shares an address with strangers,
and limiting by address punishes whoever did not exceed it. `429` carries
`Retry-After`.

> ⚠️ The counter is in memory: **per instance, and lost on restart**. It stops
> casual abuse; it does not enforce a contracted quota. A shared counter is
> required before a quota is sold.

## Endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/listings` | Published listings, cursor-paginated |
| GET | `/listings/{ref}` | One published listing |
| GET | `/dealers` | Active dealers |

### Query parameters for `/listings`

`city` · `brand` · `type` (`DIRECT`/`NEGOTIATION`/`AUCTION`) · `minPrice` ·
`maxPrice` · `cursor` · `limit` (1–100, default 20).

**Pagination is by cursor, not page number.** A numbered page repeats one item
and drops another when something is published between two requests, and the
consumer never learns they lost it.

**The limit is capped at 100.** An uncapped request pulls the whole index in one
call, which makes this a scraping tool rather than an integration surface.

## What never leaves

`reservePrice` and `minAcceptPrice` are commercial secrets and appear in no
response. This is enforced by the serialiser's explicit `select` — the fields
are not fetched at all, so forgetting them is not possible. A test asserts their
absence across a full page and a single listing.

Nothing about buyers, offers, orders, or payments is exposed. The public surface
is the catalogue, and only what is already visible on the website.

## Issuing a key

`/admin/api-keys` issues, renames, re-limits and revokes. Until 2026-10-19 this
note said «keys are inserted directly for now» — and **nothing inserted one**:
not the seed, not a screen, not a route, and `mintKey()` had no caller outside
its own test. The three routes above could not be called in any environment that
had ever existed. A lock built, guarded and documented, with no key cut for it.

- The raw key is returned **once**, in the issuing response, and never again.
  It is stored hashed; `adminApiKeys()` does not select `keyHash`, and the
  `AuditLog` entry records the prefix, never the secret — writing it to a log
  that gets read would undo the hashing.
- **Revocation is final.** No re-activation: a key is withdrawn because it
  leaked or its holder's contract ended, and restoring it restores a secret to
  whoever should not have it. The replacement is a new key.
- Every issue, change and revocation writes `AuditLog`. A key is an identity;
  who cut it and when is the only record that it was authorised.

### Scopes are enforced

Each route declares the scope it needs and `requirePublicKey` checks it, with
`403 API_KEY_SCOPE` naming the missing scope — a valid key that lacks a surface
is not an invalid key, and saying so sends the integrator to the right fix.

An **empty list keeps its original meaning**: the full public read surface. Every
key cut before the check existed is empty, so enforcement does not silently
break an integration; restricting one is an explicit choice.

This section used to read «stored and returned but not yet enforced… a field
that looks like a permission and is not checked is worse than no field». The
check was built together with the screen that grants it, so there was never a
window where the form promised something the guard did not do.

## Not built

- A shared rate-limit counter, per the warning above.
