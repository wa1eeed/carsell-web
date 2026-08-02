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
| `rear_camera` | trims whose `yearFrom >= 2020` |

All five are linked with `isDefault: true`.

Everything else — sunroof, leather, 360° camera, adaptive cruise — is left
unlinked. Real per-trim equipment lists come from the manufacturer and are
entered through screen A19, not guessed here.

`ListingFeature` is a **snapshot taken at publish time**, never a live read of
`TrimFeature`. A seller may add or remove features on their own listing; editing
the trim later must not change listings that are already published.
