# Catalog — brands (A12)

`/admin/catalog/brands`. Business logic in `src/lib/domain/catalog.ts`; the
routes validate shape and delegate.

## Both names are required

The acceptance criterion for task 7, and it is checked **on the server**. The app
renders whichever name matches the user's locale, so a brand missing its English
name shows blank in the English UI and nobody notices until after publishing.

Whitespace does not count as a name — `'   '` is rejected exactly like `''`.
The rule applies on update as well as on create: a name cannot be emptied later.

## Slug

Derived from the English name when not supplied (`Land Rover` → `land-rover`).
Must match `^[a-z0-9]+(?:-[a-z0-9]+)*$` and be unique. Uniqueness is checked on
update too, not only on create.

## Hiding vs deleting

**Hiding** (`visible = false`) stops new listings from being created against the
brand. It does **not** delete models, does not delete vehicles, and does not
hide already-published listings.

**Deleting** is only possible for a brand with no models and no vehicles, and
that is enforced in the domain layer — a hidden button is not a constraint, and
anyone who knows the route can call it directly. Attempting it returns
`BRAND_HAS_CHILDREN` (409) with the blocking count.

## Logo

PNG, SVG or WebP on a transparent background. A brand with no logo renders its
first letter rather than an empty box.

Upload is **presigned and goes straight from the browser to R2** — the file never
passes through Next, so a 8 MB image does not occupy container memory. Type and
size are validated server-side when signing; the browser check is UX, the server
check is the protection.

Permission is `catalog.uploadLogo`, which only `SUPER_ADMIN` and `CONTENT` hold.

When R2 is not configured, signing returns `UPLOAD_NOT_CONFIGURED` (503) and the
form says so instead of failing silently — a brand can still be saved without a
logo.

## Listing counts

Counted through `Vehicle.brandId`, not through the `brandName` snapshot string.
The identifier is for counting and filtering; the snapshot is for display
(decision 32).

## Audit

Every create, update and delete writes an `AuditLog` row with `before` and
`after`. A log that says "brand updated" without values does not answer "what
changed, and when" a month later.

## Not in this task

CSV import appears in the A12 markup but is outside task 7's scope
(`CRUD + logo to R2`). The button renders disabled.
