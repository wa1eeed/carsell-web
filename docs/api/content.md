# Services, help and legal (Wi · Wn · Wo)

Three screens that share one property: **their content is edited by the admin and
never written in code.** The consequence is that every count on them is computed.
"8 articles" under a help topic must become 9 when an editor adds the ninth, or
the count is a printed lie.

## Wi — services directory

Grouped **by category, not one list**. "Before buying", "after buying" and "for
sellers" are three different questions asked by three different people; merging
them forces each to skip what does not concern them.

The category filter writes to the URL, exactly like Wb — a filtered directory is
shareable.

A free service shows the word **free**, not `0`. A zero where a price belongs
reads as a missing value.

`SERVICE_CATEGORIES` lives in its own module. The client filter needs the list
and not the database, and importing it from a module that imports `db` pulls all
of Prisma into the browser bundle and fails the build — which is exactly what
happened.

## Wn — help centre

**Topics are derived from the questions that exist**, not from a fixed list. A
topic that empties out disappears; a new one appears the moment a question is
filed under it. A list written in code means an empty topic waiting for an editor
who does not know it exists.

An unrecognised `topic` in the URL renders the empty state and says so — it does
not 404 and does not silently show everything.

## Wo — legal documents

**Version and effective date are always shown.** A user who accepted March's
terms is bound by that text, not today's; hiding the version makes the document
look timeless when it is not. That is also why the model stores a version rather
than editing text in place.

Sections carry **stable numbered anchors**. Legal text gets quoted in disputes,
and "clause 5" has to be a link you can send, not a place someone has to search
for.

`parseLegalSections` drops what it cannot read — a malformed clause must not take
the whole document down. The English fields fall back to Arabic rather than
rendering empty.

## Body diagram — the designer's drawing

`public/diagrams/car-body-top.svg` — a top view with an id per panel, in three
groups: `panels` (painted and interactive), `glass` (never painted), `decor`
(inherits `currentColor`).

The file is read once and cached; **its absence is not an error** — the screen
falls back to the schematic and stays honest about being one. That fallback was
written before the file arrived, so landing the file required no code change.

Panels are painted by **class, not by a written colour**, so the tokens stay the
single source and gate 10 can still see them. Only ids in the agreed list are
touched; anything else in the file passes through untouched.
