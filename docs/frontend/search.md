# Search

_Last updated: 2026-10-19_

How a sentence becomes filters, and how a search becomes a standing alert.

---

## 1. The box on the home page was decorative

`HeroSearch` has always put what the visitor typed into `?q=`. **Nothing read
it.** Searching *"Camry 2020 used Riyadh"* returned all 46 listings — the same
number returned by an empty search, and by random characters. The most
prominent control on the first page did nothing.

Task 104 made `q` mean something, and the design (Wb) asks for more than
applying it: it shows **what was understood**, as chips that can be removed one
by one.

That difference is the whole feature. An engine that guesses without saying what
it guessed leaves the visitor in front of results they cannot account for: if the
guess is wrong they do not know where to correct it, and if it is right they have
no reason to trust it.

---

## 2. The parser is pure

`parseQuery(text, vocabulary)` in `src/lib/domain/query-parse.ts` takes the
sentence and a vocabulary, and returns:

```ts
{ chips: Chip[], rest: string }
```

Each chip carries the field it filled, the value, **and the span of text it
consumed**. The span is not decoration: it is how `rest` — the part of the
sentence that was *not* understood — is computed, and `rest` is displayed. An
engine that silently swallows a word leaves the visitor reading wider results
than they asked for while believing they are narrower.

The vocabulary is passed in, never read inside. That keeps the parser testable
without a database: twenty sentences run in milliseconds in
`tests/query-parse.test.ts`. `loadVocabulary()` in `query-vocabulary.ts` supplies
brands and models from the catalogue and cities from the published listings, so a
brand added in the admin console becomes understandable in the same moment, and a
city with no listings is never "understood" into an empty result.

### The lexicon lives outside the domain

Gate 17 forbids Arabic characters in `src/lib/domain` because the domain cannot
compose prose — it knows neither the locale nor plural rules. A parsing lexicon
is not prose; it is the domain's input alphabet. Rather than carve an exception,
the words live in `src/lib/search/lexicon.ts` and the algorithm in the domain
stays free of a single Arabic literal.

### Ambiguities it resolves

| Input | Read as | Why |
|---|---|---|
| `من ٢٠٢٠` | `yearFrom` | explicit lower bound |
| `قبل ٢٠٢٠` / `تحت ٢٠٢٠` | `yearTo` | for a car buyer, "under 2020" is a model year |
| `٢٠٢٠ ألف` | `priceMax = 2,020,000` | **a multiplier settles it**, even inside the year range |
| `تحت ١٥٠` | `priceMax = 150,000` | no car costs 150 riyals |
| `لاند كروزر` | one model | longest name matched first, so it is not read as "Land" |
| `كامري` | model **and** Toyota | a model drags its brand, or the chip would not say who made it |

One value per field: `كامري ألتيما` keeps the first and leaves the second in
`rest`. Assigning both would produce a filter matching nothing, and two
contradictory chips the visitor would read as "or".

---

## 3. Removing a chip is a link, not client state

Each chip is an anchor to the same page without that filter. No JavaScript: it
works before the bundle arrives, it is indexable, and its URL can be shared.

Because a sentence-derived filter is not written in the URL, deleting it from the
URL deletes nothing — it would simply be re-derived on the next render, and the
control would look stuck. So removal records the field in a `-` parameter, which
`applyUnderstanding` honours. The filter panel does the same whenever it clears a
key, for the same reason.

Two consequences follow, and both were bugs before they were rules:

- **A removed chip is not shown.** It kept rendering after removal, so the bar
  claimed a filter the results did not have.
- **The removal link is built from the incoming URL, not from the computed
  filters.** Serialising all filters turned derived ones into explicit ones, so
  removing one chip pinned its siblings into the URL and each then appeared
  twice — once in the understanding bar and once in the active-filter row.

---

## 4. Saved searches

`SavedSearch` existed in the schema from day one with `notify` and `lastSeenAt`,
and **nothing in the product touched it**. It was not an oversight: designer
decision 18 places it in phase one alongside favourites. Favourites were built;
this was not.

`src/lib/domain/saved-search.ts`:

| Function | Note |
|---|---|
| `saveSearch` | stores the URL query string — what is saved is what is opened, character for character |
| `savedSearches` | each row with `fresh`, the count published since `lastSeenAt` |
| `markSeen` | stamped **on click**, not on render |
| `setNotify` / `removeSearch` | both scoped by `userId`, so no one touches another's row by guessing an id |

### `lastSeenAt` is the feature

A saved search without "how many are new since you looked" is a bookmark whose
owner reopens it to compare against memory. With it, the question is computed:
how many listings were published after the last time you opened this search. That
is what makes saving worth doing.

Two rules fall out of it:

- **New counts from the moment of saving, not from zero** — otherwise the owner
  saves a search and immediately sees "45 new".
- **Seen is stamped when the row is clicked, not when the list renders** —
  otherwise the number they came for disappears before they read it.

### What is refused

- **A search with no filter.** Saving "all cars" produces an alert on every
  listing published on the platform, which is how an owner ends up switching all
  alerts off — and the channel is lost for one meaningless row.
- **A duplicate**, after normalising: parameter order and page number do not make
  one search into two.
- **More than `SAVED_SEARCH_LIMIT` (20).** Without a ceiling the list becomes a
  browsing history rather than a choice.

### Not yet wired

Nothing sends the alert. `notify` is stored and respected by the UI; the job that
reads it and dispatches belongs with the notification channels. The saved search
and its fresh count are correct and visible today without it.

---

## 5. The account screen had nine pages and linked to five

Favourites, offers, reports and saved searches were built, worked, and were
reachable only by typing their URL. Three of them appeared in the "you have…"
line **only when something was urgent**, so a visitor with no pending offer had
no way to learn that offers have a page at all.

`AccountSections` lists all nine, always, with a count where a count means
something — and a zero is the absence of a badge, not a badge reading zero.
