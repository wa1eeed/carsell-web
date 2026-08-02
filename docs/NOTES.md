# Notes — things to do before a specific task

Short-lived reminders that would otherwise be lost between sessions. Delete an
entry once its task lands. Permanent decisions belong in `DESIGN-DECISIONS.md`,
not here.

## Before task 4 — component library

**Direction isolation is mandatory**, not optional, in every component that
renders a value inside mixed text: `CarCard` · `CarRow` · `SpecRow` · `Money` ·
`StatCard` · `DataTable` · `PlateBadge`.

A neutral separator (`·`) sitting between an Arabic word and an
Arabic-Indic numeral slides to the wrong side and reads as a stray digit:
`١٤٥٬٠٠٠ ريال · ٣٬٤٥٦ كم` renders as `١٤٥٬٠٠٠ ريال ٣٬٤٥٦٠ كم`. Wrap every
segment in `bidi-isolate`; never build a data line as one string. Never use RLM
characters in translation files — an invisible character breaks comparison,
search and export, and is invisible in code review. CI check 6 enforces this.

**Admin table padding** is not a radius token. Set it once in `DataTable`:
rows `13px 22px`, header `12px 22px`.

## Before tasks 12 and 19 — Wa and Wk

Remove the licence-plate auction cards from `Wa` (auction rail) and `Wk`
(auction index). Plates are out of phase 1: there is no `Plate` entity, no `Wp`
screen, and `Auction` requires a `Listing`, which requires a `Vehicle`.
Also drop the `لوحات ٠٫٥ م` line from A3 and the plate-auctions link from the
site footer.

## Before task 28 — deployment

The `Dockerfile` printed in `BUILD-WEB-ADMIN.md` §12 copies `prisma` but not
`prisma.config.ts`. Prisma 7 keeps the datasource URL and the migration config
in that file, so the build stage fails without it. Fix the copy line:

```dockerfile
COPY package*.json prisma prisma.config.ts ./
```

`prisma generate` itself does not need a database connection — `prisma.config.ts`
reads `process.env.DATABASE_URL` rather than Prisma's `env()`, which throws when
the variable is absent.
