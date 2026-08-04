# Public API — `/api/public/v1`

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

## Not built

- Key management screen in the admin. Keys are inserted directly for now.
- Scopes are stored and returned but not yet enforced — every valid key gets
  the full read surface. **This is recorded here rather than left implied:** a
  field that looks like a permission and is not checked is worse than no field.
- A shared rate-limit counter, per the warning above.
