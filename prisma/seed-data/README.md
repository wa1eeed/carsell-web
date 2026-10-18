# Seed data

Reference data loaded by `prisma/seed.ts`. Files here are **content**, not code —
they are the source of truth for values the admin panel will later manage.

## `features.json`

39 vehicle features, the full catalogue behind `Feature` / `TrimFeature` /
`ListingFeature` (decision 19). Shape:

```json
{ "key": "abs", "nameAr": "…", "nameEn": "…", "group": "SAFETY", "sort": 1, "active": true }
```

`group` is one of `SAFETY` (13) · `COMFORT` (14) · `TECH` (12). `sort` runs 1–39
across the whole list, so display order is stable without a per-group offset.

### Linking features to trims

**Rule: link only what is certainly true.** A wrong feature in the catalogue
propagates into every listing published from that trim, and the seller never
sees it to correct it.

The seed links these and nothing else:

| Feature | Applied to |
|---|---|
| `abs` | every trim |
| `airbags_front` | every trim |
| `ac_auto` | every trim |
| `bluetooth` | every trim |
| `rear_camera` | trims whose `yearFrom >= 2020` — a trim with no `yearFrom` is not claimed |

All five are linked with `isDefault: true`.

Everything else — sunroof, leather, 360° camera, adaptive cruise — is left
unlinked. Real per-trim equipment lists come from the manufacturer and are
entered through screen A19, not guessed here.

## `brands.json`

The catalogue: **42 brands · 303 models · 360 trims.**

Ten brands carry a full tree — real trim names with engine capacity, cylinders
and horsepower. The other 32 carry **breadth without invented numbers**
(owner's decision 2026-10-18, «اتساع بلا أرقام مخترعة»): their real
Saudi-market models, each with the trims its powertrain actually comes in, and
`engineL` / `cylinders` / `horsepower` left `null`.

**Why the numbers are empty rather than approximate.** Decision 32 snapshots a
trim's specs onto the `Vehicle` at publish. A litre figure guessed here does not
stay in the catalogue — it travels into the listing, the inspection report and
the price statistic, and nobody sees it enter. An empty field asks the seller;
a wrong one tells them something false.

**Why most models have one trim, and some have two or three.** The sell form
narrows the seller's fuel and gearbox choices to the union of the model's
visible trims (`specOptionsForModel`). One trim per model is therefore a
constraint, not just a default: a lone petrol trim means nobody can list the
hybrid. So a model gets a trim per powertrain it is genuinely sold with —
Grand Vitara petrol and hybrid, D-Max automatic and manual, Jimny 3-door and
5-door — and a single «قياسي» only where the model has one configuration.

A trim's `yearFrom` is optional for the same reason the model's is (ROADMAP §22
and §23): «قياسي» describes the model, not one generation of it, and a year
written on it would claim a boundary nothing enforces.

### Reaching a database that is already running

The seed runs **once, on an empty database**, so a row added to this file
reaches a fresh environment and never reaches a live one. Every reference row
added here therefore ships with a migration as well —
`20261019050000_catalog_breadth` for the models and trims above. It inserts
only what is missing (`WHERE NOT EXISTS`, matched on brand + English name), so
it passes over anything the seed already planted.

### Where each placement is read

`placements` carries five independent values. Four of them fill the catalogue
or display it; **`sell_form` is the only one that asks anybody anything** — it
decides whether the seller is offered that feature in the entry form. It was
added 2026-10-18, when measuring showed `ListingFeature` had no writer in the
product at all. The seed turns on every placement except `card_badge`.

`VehicleFeature` is written from the entry form (both intents), and
`ListingFeature` is a **snapshot taken at publish time**, never a live read of
`TrimFeature`. A seller may add or remove features on their own listing; editing
the trim later must not change listings that are already published.
