# Legal documents, versions, and consent

_Last updated: 2026-11-24_

Two mechanisms that only make sense together: a legal document is **versioned**
because somebody's consent points at a specific text, and consent is **recorded
per version** because the text can change under it.

## Why the record exists

`AuthForm` renders a required checkbox — «أوافق على الشروط والأحكام وسياسة
الخصوصية» — and will not submit without it. Until 2026-11-24 that checkbox was
`useState(false)` in the browser and nothing else: no column, no table, no row.
The platform required an agreement and held **no evidence that anyone gave
one**. A single dispute asking which text a user accepted had no answer.

`LegalAcceptance` is that evidence. It stores the version as a **string taken
at the moment of consent**, not a foreign key to something that keeps moving —
whoever agreed in August agreed to August's words.

## The models

| Model | Holds |
| --- | --- |
| `LegalDocument` | The **published** text, read by `/legal/[key]` in one query. Plus `key`, `sort`, `active`, `requiredAtSignup`. |
| `LegalVersion` | Drafts, and every version ever published. The archive. |
| `LegalAcceptance` | One row per `(user, document, version)`, with `acceptedAt` and a context of `signup` or `reaccept`. |

`LegalDocument` and the newest `PUBLISHED` `LegalVersion` carry the same text.
They are not two sources that can drift: one is the live copy for reading, the
other is the archive written once at publish time and never read for display.
`tests/legal.test.ts` asserts they match after every publish.

## Version lifecycle

```
            saveDraft                 publishDraft
  (none) ─────────────► DRAFT ──────────────────────► PUBLISHED
                          │                               │
                          │ discardDraft                  │ next publishDraft
                          ▼                               ▼
                       (deleted)                      SUPERSEDED
```

- **One draft per document.** A second would mean two texts competing for one
  release with nothing saying which wins.
- **A draft is born from the published text**, so correcting one line is not
  retyping a document.
- **Only a draft is ever deleted.** A published version stays forever, because
  acceptance rows name it. `discardDraft` does not touch the document.
- **Publishing happens in one transaction**: supersede the old, publish the
  draft, copy its text onto the document.
- **Publishing takes one person.** The markup says two; the owner removed that
  quorum (`ROADMAP` §35, restated as a class in §41). The `AuditLog` row naming
  the actor remains — that is a ledger, not an authority gate.

## The material-change rule

A draft marked `material` cannot be published with an effective date less than
`REACCEPT_NOTICE_DAYS` (14) away — the markup's own figure, enforced in
`validateDraft` rather than written in prose. A material version that takes
effect puts its documents back into `pendingAcceptance` for everyone, and the
strip under the site header asks again.

The ask is a **request, not a gate**. The markup says «ويُطلب قبول جديد عند
أوّل فتح بعده» — asking is what it says, and barring a user from the product
over a terms revision is a separate decision nobody has taken.

## Where consent is asked

| Moment | What happens |
| --- | --- |
| Registration | `completeRegistration` calls `recordAcceptance(userId, 'signup')` after the user row is written — a consent row for an account whose validation failed would be a consent with no account. |
| Any page, signed in, something pending | `LegalNotice` renders a strip under the header naming the documents. It reads the session the way `NotificationBell` beside it already does, so it costs no page its static rendering. |
| `/account/legal` | Lists what is pending with links to the text, an acknowledgement checkbox, and the user's own acceptance history with dates. |

`POST /api/v1/me/legal` records; `GET` returns what is pending.

## «يظهر في» is derived, never stored

The admin column shows `SIGNUP` when `requiredAtSignup` is set and `LEGAL` when
`active` is. Both come from fields the product actually reads — the same
`requiredAtSignup` that `recordAcceptance` consults — so the column cannot
claim a placement the code does not make. An empty cell means a document
nothing links to.

A stored, operator-typed field was rejected for the reason recorded in
`DESIGN-DEVIATIONS`: it would keep saying «قبل أوّل مزايدة» long after the code
around it changed, and whoever read it would believe it.

## Admin screens

| Path | What it does |
| --- | --- |
| `/admin/legal` | A34. Documents, draft count, last update, acceptance rate. |
| `/admin/legal/[key]` | Edits the draft; publishes or discards it. |
| `/admin/legal/new` | Creates a document, unpublished, with a `1.0` draft. |
| `/admin/legal/history` | «سجل النسخ» — every version with its publisher and how many accepted it. |

Reserved keys: `new` and `history`, since a static route would shadow a
document with either name and its screen would never open.

## The acceptance rate reads below 100, and that is correct

26 accounts predate the record. **No row is fabricated for them** — a consent
date we write ourselves is a forged record, and worse than an honest shortfall.
They are asked through the strip, and the figure rises by what actually
happens.
