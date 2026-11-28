# A template per service — what is asked, what is filled, what it costs

_Last updated: 2026-11-28_

> Owner, 2026-11-28: «مو المفروض قالب الفحص وباقي الخدمات يكون لها قالب … ويمكن
> إعداد قالب لكل خدمة بشكل مرن وسهل من خلال إضافة حقول لاسم الخدمة وحقول لاتخاذ
> إجراء وحقول للسعر».

## 1 · What was measured first

**Inspection was the only editable one.** Its template — 210 items in
categories, with weights and the items that cap the grade — lives in the
database and the operator edits it without a deploy.

**Every other service was frozen in code.** `completion-schema.ts` holds a
hard-wired field list per `ProviderType`: shipping asks for carrier and
tracking number, insurance for policy and premium, transfer for the channel.
Adding one field meant a code change and a release — and the file's own comment
admitted the lists were a proposal awaiting the owner's word.

**And a price was a single number per service.** «تأمين شامل» is priced `0.00`
because its real price depends on the policy, and nothing could express that.

## 2 · The model

`ServiceTemplate` belongs to a `Service`, carries a `version`, and holds
`ServiceTemplateField` rows. Each field has a latin `key` (stored with the
answer, so renaming the label never breaks history), an Arabic label, a kind
(text, latin, number, money, date, select, checkbox, note), and a **purpose**:

- **`REQUEST`** — the customer fills it while ordering. It may carry a price.
- **`ACTION`** — the provider fills it to finish. **It may never carry a
  price**, and the domain refuses one: money that moves after the customer has
  paid is not a price, it is a surprise.

Inspection keeps its own template. It is a scored checklist — weights, critical
items, a grade — and flattening it into a field list would lose exactly what
makes it an inspection. The service says which engine renders it; each keeps its
shape.

## 3 · Pricing, by the owner's decision

Asked on 2026-11-28 between three models, the owner chose: **price fields
compute the price before payment**. So:

- A `SELECT` option carries its own addition — one choice costs more than
  another. A `CHECKBOX` adds when ticked. A `NUMBER` adds **per unit**, so a
  hundred kilometres is not priced like ten.
- **The sum is computed on the server**, in `quoteFor`. A number computed in the
  page arrives from the user's hand, and whoever edits it pays what they typed.
- **The breakdown is snapshotted with the request**: `quoteBase`, `quoteExtra`,
  `templateVersion`, and one `ServiceRequestAnswer` row per answer carrying the
  label and the addition **as they were on the day**. Edit the template
  tomorrow and an existing request still reads «٩٠٠ أساس + ٦٠ مسافة» — even if
  the option has since been deleted.
- A missing answer is returned **by its field**, not as a flat "could not".

## 4 · What the operator sees

`/admin/services/{key}` grew a «قالب الخدمة» card: the fields with their kind,
purpose, requiredness and addition; and an editor that adds one. While typing an
addition it shows the resulting price — «٩٠٠ أساس ← يصير ٩٠٢٫٥٠ لمن كتب وحدة
واحدة» — because a number that every customer will see should be seen by the
person setting it, before it is saved and not after.

Every change bumps the version, and the card says so, in the same words the
inspection template uses.

## 5 · Not yet

- **The customer-facing form does not render these fields yet.** The API accepts
  `answers` and prices them; the ordering screen still posts none, so every
  service is still ordered at its base price until that screen is built. Said
  plainly here rather than left to be discovered.
- **`completion-schema.ts` still drives the provider's finish form.** The
  template can already hold `ACTION` fields; migrating the six hard-coded lists
  into seeded templates — without losing what existing requests recorded — is
  its own task.
- A provider still holds exactly one type, so a workshop that both inspects and
  details needs two records.
