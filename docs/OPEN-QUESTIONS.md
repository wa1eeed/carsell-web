# Open questions

Assumptions taken **without asking** in tasks 18–22, re-read with a second eye.
The question here is not "was this reasonable" but **"what breaks if the
assumption is wrong"** — an assumption that looked obvious is exactly the kind
that never surfaces as a question.

**All ten were answered on 2026-08-02.** What follows is the record: the
assumption as built, what would have broken, and the ruling. Kept because the
reasoning is the durable part — a future change to any of these needs to know
why it is the way it is.

Three touched money. The first was **inverted** — see its ruling.

---

## 1 · A dispute resolution ends the order — it never resumes

**Assumed:** every resolution closes the order. Full refund and partial
settlement cancel it; release to seller completes it.

**If wrong:** a partial settlement is arguably a *continuation* — the buyer keeps
the car at a reduced price, so the order should proceed to `TRANSFER`, not
cancel. As built, a partial settlement cancels the order and the vehicle never
transfers, which contradicts the settlement itself.

**Touches money.** This is the one I would most want answered.

**Implemented:** partial settlement → `PARTIAL_REFUND` + order `CANCELLED`.
`src/lib/domain/disputes.ts`


> **RULED:** A settlement **completes the sale**. The buyer keeps the vehicle,
> the order moves to `TRANSFER`, ownership transfers. The difference is refunded
> to the buyer's **wallet** from escrow; the remainder is released to the seller.
>
> A settlement means both sides agreed a price that accounts for the defect.
> Cancelling means returning the car — and that is a *full refund*, not a
> settlement. `Order.settlementAmount` holds the settled price; `agreedPrice`
> keeps the original. The invoice uses the settled price; an audit needs both.

---

## 2 · Who may open a dispute, and until when

**Assumed:** either party, at any stage before the order completes or cancels.

**If wrong:** a seller opening a dispute at `REQUEST` — before any money moved —
freezes a listing indefinitely with no cost. That is a denial tool. A rule like
"buyer only, and only after payment" would close it.

**Implemented:** both parties, any active stage. `openDispute`


> **RULED:** **Buyer only, and only once the order has reached payment** — when
> money is in escrow. No dispute on a live listing, none before payment.
>
> The seller has no dispute; they have cancel-with-reason, and report.

---

## 3 · A dispute freezes the payment window permanently

**Assumed:** while frozen, the 24-hour payment window does not run — and it does
not resume afterwards either, because the resolution closes the order.

**If wrong:** if a resolution could return an order to its path (see #1), the
payment window would need to resume with its remaining time, not restart. As
built there is no remaining-time arithmetic at all.

**Touches money.** `timeoutUnpaidOrders` skips `DISPUTED`.


> **RULED:** The window **pauses and resumes**. The dispute stops the clock and
> stores the remainder (`paymentPausedRemainingMs`); resolution resumes it from
> where it stopped. If under 6 hours remain, 6 hours are granted — someone who
> has just been through a dispute is not asked to pay within half an hour.

---

## 4 · Deposits settle at auction close, including on an unmet reserve

**Assumed:** reserve unmet → no winner → every deposit returned.

**If wrong:** if the seller may accept the highest bid after an unmet-reserve
close, returning deposits immediately destroys the mechanism — the winning bidder
has already been released and has no obligation. A short window before settling
would be needed.

**Touches money.** `closeEndedAuctions` settles in the same operation.


> **RULED:** Both concerns were right. The fix distinguishes the top bidder:
> their deposit stays **held for 24 hours** — the seller's window to accept or
> decline. Accepted → applied. Declined or expired → refunded immediately.
> Everyone else is refunded at close.
>
> An expired window is a **refund, not a forfeit**: the bidder honoured their
> bid; it was the seller who did not decide.

---

## 5 · The extension cap is 10, and it is per auction not per bidder

**Assumed:** `MAX_EXTENSIONS = 10`, shared.

**If wrong:** a shared cap lets one bidder exhaust it early with cheap bids and
then win in silence. A per-bidder cap, or a cap on total added time, behaves
differently at the end.

**Implemented:** 10 shared, published in the public object.


> **RULED:** One report does **not** trigger review. The listing stays published.
> Review is triggered by two independent reports, by one report from a buyer with
> an order on that listing, or at admin discretion. A single report appears in the
> queue with no effect on the listing.
>
> One click to remove a competitor's listing is cheaper than any paid ad.

---

## 6 · Bidder aliases number by order of first appearance

**Assumed:** "bidder 1" is whoever bid first.

**If wrong:** the number leaks arrival order, which combined with public
timestamps can identify someone who is known to have been present early. Random
per-auction numbering would not.

**Implemented:** `aliasMap` in `src/lib/domain/auctions.ts`


> **RULED:** **Random per auction**, not derived from the id. Order of appearance
> reveals who was there early; a stable number is traceable across auctions.

---

## 7 · A report puts a listing into review immediately, on the first report

**Assumed:** one report is enough.

**If wrong:** a competitor removes any listing from search with a single click.
A threshold (two reports, or one from a verified buyer) changes the economics
entirely.

**Implemented:** first report → `PENDING_REVIEW`. Decision 33 says a report
triggers review; it does not say how many. `fileReport`


> **RULED:** Weekly summary to `SUPER_ADMIN` with each member's access count, and
> an immediate alert when a member exceeds **twice their own weekly average** —
> compared against themselves, not the team: whoever handles disputes reads ten
> times what a catalogue editor does.

---

## 8 · Stage targets are fixed constants in code

**Assumed:** 24 / 24 / 72 / 24 / 120 hours.

**If wrong:** these are operational SLAs that will change with volume and with
partner performance, and changing them means a deploy. They arguably belong in
`PlatformSetting` where operations can tune them.

**Implemented:** `STAGE_TARGET_HOURS` in `src/lib/domain/admin-orders.ts`

---

## 9 · "Contenders" excludes auto-rejected bidders

**Assumed:** someone whose offer was below the hidden floor chose to leave, so a
relist notice would be noise.

**If wrong:** they did not choose anything — they were rejected by a threshold
they cannot see. On a relist the seller may well have lowered it, and they are
precisely the audience.

**Implemented:** `timeoutUnpaidOrders` notifies only `autoRejected: false`.

---

## 10 · Identity access is logged but nobody is alerted

**Assumed:** writing to `AuditLog` is sufficient.

**If wrong:** a log nobody reads is a log nobody reads. If access is meant to be
exceptional, the customer — or a supervisor — should be notified when it happens,
not only be able to find it later.

**Implemented:** logged, not notified. `viewIdentity`

---

## 11 · Services have no image, and the design shows one per row

**Assumed:** the `الصورة` column in A7 is deferred, not dropped. `Service` has no
image field, and the design shows a thumbnail in every row plus "image and icon"
in the list of what an admin controls per service.

**If wrong:** the services directory the customer sees is a wall of text. A
service is a thing you recognise before you read — the same argument that put
silhouettes on `BodyTypeStrip`.

**Implemented:** column omitted; the row leads with the name and the key.
Adding it later means one `imageUrl` column and a reuse of `ImageUploader` —
cheap, which is why it was not guessed at now.

---

## 12 · Per-service settings the schema cannot hold yet

**Assumed:** the editor covers what `Service` has — names, descriptions, price,
SLA, placements, visibility. The design also lists provider shares, available
cities, display conditions (inspected / auction / dealer), fields the requester
fills, and a cancellation and refund policy.

**If wrong:** "cancellation and refund policy" is a money rule, and money rules
are not the developer's to invent. It is left unbuilt rather than guessed.

**Implemented:** the six schema-backed groups only. The rest needs both columns
and a ruling — the refund policy above all.

---

## 13 · Finance-input keys are a closed list in code

**Assumed:** salaries · paid marketing · referral incentives · content and SEO ·
infrastructure · other · cash balance. The three marked `inCac` are what CAC
divides by new customers.

**If wrong:** an expense line that does not fit any of them gets filed under
"other" and disappears from every derived figure. Adding a key is a deploy.

**Implemented:** `FINANCE_INPUT_KEYS` in `src/lib/domain/admin-finance.ts`. A
free-text key was rejected deliberately — it produces "marketing", "mktg" and
"تسويق" across three months and CAC then sums a subset of itself.

---

## 14 · LTV counts platform commission only

**Assumed:** lifetime value is commission per paying customer. Service revenue,
sponsored ads and shipping are not attributed back to the buyer who generated
them.

**If wrong:** LTV is understated, possibly badly — right now commission is
disabled, so LTV reads zero while the platform does earn from services. That
makes LTV/CAC useless exactly when it is being used to decide whether to enable
commission.

**Implemented:** commission only. Attributing service revenue to a customer
needs `ServiceRequest.userId` joined through to orders, which is a reporting
decision, not a rendering one.

---

## 15 · SMS cost is 0.04 SAR per segment, hard-coded

**Assumed:** a placeholder until a provider is contracted. Displayed as an
estimate, and labelled as one on screen.

**If wrong:** it is a money figure on an admin screen, and a wrong one shapes
decisions about which templates use SMS. The real rate varies by provider and by
destination network.

**Implemented:** `SMS_COST_PER_SEGMENT` in `src/lib/domain/notification-text.ts`,
overridable per call. It belongs in `PlatformSetting` once a provider exists.

---

## 16 · A1 has two cards with no source

**Assumed:** `المستخدم النشط` (DAU/WAU/MAU) and `مصدر التسجيل` are deferred, not
dropped. The first needs an activity log the schema does not have; the second
needs a `source` column on `User` captured at registration.

**If wrong:** these are the two cards that answer "is the product working" and
"where do people come from" — arguably the most important on the screen. A
growth dashboard without them measures inventory, not growth.

**Implemented:** both omitted, with a line on the screen saying why. Showing
estimated numbers would have made them believed. `source` is one nullable column
and one write at registration; activity tracking is a larger decision.

---

## 17 · Integrations have one environment, not two — **RESOLVED 2026-08-03**

> **Answered — decision 33.** Two key sets per integration (`test` · `live`),
> staging restricted to `test` **in code**, and switching a production
> integration to test needs two approvers. Implemented; see
> `docs/api/admin-dashboard.md` § Environment separation. Kept below as the
> record of the question.


**Assumed:** `Integration` holds one configuration per key. A11's markup shows a
`بيئة الاختبار` / `إنتاج` toggle and separate keys for each.

**If wrong:** an operator testing a payment flow has to overwrite the production
key to do it — which is the exact accident the two-approver rule exists to
prevent, made routine.

**Implemented:** one configuration. Two environments means either two rows per
integration (`payments:test`, `payments:live`) or a second secrets column — a
schema decision, and one that touches how every integration is read at runtime.

---

## 18 · Rotation approval expires after 48 hours

**Assumed:** same window as a dispute. A rotation nobody seconds within two days
is one nobody wanted.

**If wrong:** rotations often happen under pressure — a leaked key at midnight
Thursday, no second approver until Sunday. Expiry then forces the whole request
to be re-entered, secret and all, by someone already anxious.

**Implemented:** `ROTATION_WINDOW_HOURS = 48`, and expiry marks the request
`EXPIRED` rather than executing late.

---

## 19 · Marketing cap is 4/month with a 72-hour cooldown

**Assumed:** both numbers, taken from A9's markup.

**If wrong:** they are the difference between a marketing programme and a
complaint rate. Four a month is aggressive for a purchase people make once every
few years; a 72-hour cooldown means a well-timed price-drop alert can be
suppressed by an unrelated promotion two days earlier.

**Implemented:** `MARKETING_CAP_PER_MONTH = 4`, `COOLDOWN_HOURS = 72`, both
enforced at send time and both shown on screen. They belong in `PlatformSetting`
once someone owns the number.

---

## 20 · Marketing consent defaults to false for existing users

**Assumed:** nobody is opted in without asking. The migration adds
`marketingConsent BOOLEAN NOT NULL DEFAULT false`, so every existing user starts
opted out.

**If wrong:** it is the only defensible default, but it means the first campaign
reaches almost nobody until consent is collected — and there is currently no
screen that asks for it.

**Implemented:** default false, with `marketingConsentAt` recording when it was
given. The asking is the app's job and is not built.

---

## 21 · Two channels are critical, and the admin cannot change that

**Assumed:** auctions the user participates in, and orders/payment — exactly the
two A10's markup marks «لا — حرِجة».

**If wrong:** an operator facing a complaint spike has no lever. The only way to
make a critical channel mutable is a migration.

**Implemented:** `PushChannel.userControllable`, deliberately excluded from
`updateChannel`. Making it editable from the console would let a product decision
happen by button-press in a meeting.

## أربعةُ مسارات تنقّلٍ لا واحد — ٢٠٢٦-١٠-١٤

**المهمة:** قياس الهاتف (المرحلة ١ في السجلّ).
**الشاشة:** Wa · Wb · Wc · صفحة الخدمة.

**السياق:**
مكوّن `Breadcrumb` مبنيٌّ بدلالاته (الأخيرة ليست رابطًا، عقدةٌ بلا صفحة
تُعرض ولا تُنقر، عزلٌ اتجاهيّ) — **وثلاث شاشات ترسم مسارها بيدها**:
صفحة المركبة، ونتائج البحث، وصفحة الخدمة.

**السؤال:**
أتوحَّد الأربعة على مكوّن واحد، ولو تغيّر مقاسُ المسار في تلك الشاشات
الثلاث (‎text-2xs‎ → ‎text-3xs‎) وفقدت العقدةُ الأخيرة ثِقَلها؟

**ما وجدته في التصميم:**
Wc لا يرسم مسارًا أصلًا — المسار إضافتُنا. والمكوّن بُني لأربع شاشاتٍ
أخرى يرسمها التصميم (القانوني، المزاد، المعرض، التقرير).

**اقتراحي:**
التوحيد على المكوّن، وإبقاء العقدة الأخيرة ثقيلةً فيه **لكل** الشاشات
— فهي تقول «أنت هنا» وهذا نافع في الحساب أيضًا. والمقاس يتبع المكوّن.

**الأثر إن لم يُجَب:**
بقيت الأربعة. وقد ظهر ثمنُها بالفعل: إصلاحُ مساحة اللمس في المكوّن
وحده ترك ثلاثًا دون الحدّ، فأُصلحت كلٌّ على حدة — والخامسة ستُكتب
بالعيب نفسه.

## المنصّة مبدأٌ أم وكيل في الخدمات؟ — ٢٠٢٦-١٠-١٦

**المهمة:** قيدُ الخدمة في الدفتر (المرحلة ٣).
**الشاشة:** لا شاشة — الدفتر و`/admin/ledger`.

**السياق:**
طلبُ خدمةٍ مدفوع لم يكن يكتب في الدفتر سطرًا واحدًا. ولكتابته يلزم حسمُ
من المورِّد: أنحن نبيع الخدمة ونشتريها من المزوّد (مبدأ)، أم نحن وسيطٌ
يقبض رسمًا (وكيل)؟ والفرق في الدفتر كبير: على فحصٍ بـ٤٥٠ ورسمٍ ٥٠،
إيرادُنا **٥٠٠ وتكلفتُنا ٤٥٠**، أو **٥٠ بلا تكلفة**.

**السؤال:**
أتبقى المنصّة **المورِّد** للخدمة كما تقول القاعدة الضريبية، ولو صار
المال يذهب إلى المزوّد مباشرةً بالتوزيع؟

**ما وجدته في التصميم:**
قاعدة `SERVICE` المزروعة: `supplierIsPlatform: true` و`invoiceIssuer:
PLATFORM` و`taxableBase: FULL_VALUE`، وملاحظتُها: «الخدمات دائمًا
توريدُنا». وفي المقابل قرارُ بوّابة المزوّدين يقول إن المال يذهب إليهم
مباشرةً و«لا نحتفظ بمال غيرنا».

**اقتراحي:**
**المبدأ** — كما تقول القاعدة الضريبية، إذ الفاتورة تخرج منّا بكامل
القيمة فنحن المورِّد قانونًا. والتوزيع لدى البوّابة **تعليمةُ دفع** لا
تغييرُ مورِّد: وكيلُنا يدفع مقاولَنا نيابةً عنّا. وعليه بُني القيد،
وفيه تعليق `// DESIGN-Q` عند الحسابين.

**الأثر إن لم يُجَب:**
الدفتر يعمل ويتوازن على التأويل الأوّل. وتغييرُه لاحقًا إلى الوكالة
يحتاج تعديلَ قيدين وإعادةَ ترحيل ما كُتب — لا تغييرَ مخطّط.

## ردُّ مال الخدمة المتعذّرة — آليًّا أم بعد مراجعة؟ — ٢٠٢٦-١٠-١٦

**المهمة:** ردّ الخدمة الفاشلة (المرحلة ٣).
**الشاشة:** لوحة المزوّدين — زرّ «تعذّر»، وإشعار `service.failed`.

**السياق:**
المزوّد يُعلن تعذُّر الخدمة بسببٍ مكتوب، ويصل الطالبَ إشعارٌ حرج نصُّه
«وما دُفع يُردّ — يراجعه فريقنا». وماله محجوزٌ لدى البوّابة.

**السؤال:**
أيُردّ المال **آليًّا** لحظةَ إعلان المزوّد الفشل، أم يبقى محجوزًا حتى
يراجع الفريق؟

**ما وجدته في التصميم:**
لا يوجد. ونصُّ الإشعار (كتبتُه أنا) يَعِد بالردّ ويذكر المراجعة معًا.

**اقتراحي:**
**آليًّا.** من دفع ثمن فحصٍ لم يقع لا يُحتجز مالُه ريثما يُراجَع سلوكُ
المزوّد — وهما أمران مختلفان: أحدهما بيننا وبين العميل، والآخر بيننا
وبين مقاولنا. وإن ادّعى المزوّد أن العميل تخلّف فتلك مطالبةٌ تُعالج
معه، لا سببٌ لحبس مالٍ عن ثالث.

**الأثر إن لم يُجَب:**
نُفِّذ الردّ آليًّا، وتعليق `// DESIGN-Q` عند الدالّة. وتحويلُه إلى
مراجعةٍ لاحقًا زرٌّ في اللوحة ينادي الدالّة نفسها — لا تغيير في القيد
ولا في المخطّط.

## نقطةُ الاستحقاق الضريبيّ في الخدمات — ٢٠٢٦-١٠-١٦

**المهمة:** فاتورة الخدمة (المرحلة ٣).
**الشاشة:** لا شاشة — `TaxInvoice` وطابور الضريبة في اللوحة.

**السياق:**
الخدمة تُدفع أوّلًا ثم تُؤدَّى. وفاتورتُها تُصدَر الآن عند **الإنجاز**.

**السؤال:**
أتُصدَر الفاتورة الضريبية عند **قبض المال** أم عند **إنجاز الخدمة**؟

**ما وجدته في التصميم:**
لا يوجد. ونظام الضريبة السعوديّ يجعل تاريخ التوريد أسبقَ ثلاثة: التوريد
أو الفاتورة أو القبض — والقبض عندنا أسبقها.

**اقتراحي:**
**الإنجاز.** الخدمة قصيرة (ساعاتٌ أو أيّام)، والفشلُ قبلها يعني ألّا
فاتورة صدرت فلا إشعار دائن يُلغيها. **والخطأ غير متماثل**: النقص ثغرةٌ
تُسدّ، والزيادة وثيقةٌ خرجت لا تُسحب إلّا بإشعارٍ على ورقةٍ ما كان لها
أن توجد. وإن أفتى محاسبُك بالقبض فالتحويل سطرٌ واحد: النداء ينتقل من
`complete` إلى `payServiceRequest`، ويلزم معه إشعارُ دائن عند الفشل.

**الأثر إن لم يُجَب:**
الفواتير تصدر عند الإنجاز، ومن دفع ولم تُنجَز خدمتُه يُردّ ماله بلا
وثيقةٍ صدرت ولا أُلغيت.

## متى يصير مالُ بيع المركبة نقدًا في الدفتر؟ — ٢٠٢٦-١٠-١٦

**المهمة:** تحصيل الخدمة (ومن قياسها ظهر هذا).
**الشاشة:** `/admin/ledger` — بطاقة «لدى مزوّد الدفع» وبطاقة «ما وصلنا فعلًا».

**السياق:**
بنيتُ `service.captured` فصار للخدمات قيدُ خزينة: `PLATFORM_CASH` مدين
و`ESCROW_AT_PROVIDER` دائن. ثمّ قِستُ مسار المركبة فوجدتُ أنه **يُحصِّل
لدى البوّابة فعلًا** (`settleOnTransferConfirmed` تنادي `gateway.settle`)
**ولا يكتب قيدَ خزينة قطّ**.

**السؤال:**
أيبقى `ESCROW_AT_PROVIDER` حسابًا واحدًا يجمع المحجوزَ والمُحصَّل، أم
يُفصل إلى حسابين فيصير لِما وصلنا رصيدٌ يُطابَق بكشف البنك؟

**ما وجدته في التصميم:**
لا يوجد. والقيود الثلاثة متّسقة في ذاتها: `order.paid` تُدين الحساب،
و`payout.sent` تُدينه عكسًا حين يُحوَّل للبائع. **لكنّ حصّتنا — العمولة
والضريبة — لا تُغادره أبدًا**: تُقيَّد إيرادًا وضريبةً مستحقّة ويبقى
مقابلُها «لدى مزوّد الدفع» إلى الأبد. فالبطاقة التي تقول «التزامٌ تجاه
الأطراف، لا مالٌ لنا» تحمل اليوم مالنا نحن أيضًا، و«ما وصلنا فعلًا»
يساوي مجموعَ الخدمات وحدها.

**اقتراحي:**
قيدُ خزينةٍ عند تحصيل المركبة أيضًا — نفسُ شكل `service.captured`،
بمبلغ ما حُصِّل. وأن يُفهم `ESCROW_AT_PROVIDER` بعدها على أنه **المحجوز
غير المُحصَّل**، و`PLATFORM_CASH` على أنه **رصيدُنا لدى المزوّد قبل
التحويل البنكيّ** — وهو الرصيد الذي يُطابَق بكشف ميسر. ويبقى
`SELLER_PAYABLE` كما هو: التزامٌ علينا، لا موضعُ المال.

**الأثر إن لم يُجَب:**
تُرك كما هو ومعه هذه الملاحظة وصفٌّ في `docs/ROADMAP.md` و
`docs/LEDGER.md` § ٧. ولا شيء خاطئ في الدفتر اليوم — الحسابات متوازنة —
لكنّ شاشة الأدمن تصف حسابًا بغير ما فيه، ولا رصيدَ يُطابَق بالبنك.

## أيَرفض البائعُ عرضًا صراحةً؟ — ٢٠٢٦-١٠-١٦

**المهمة:** مشيُ رحلة التفاوض بالنقر.
**الشاشة:** نافذة «قدّم عرضك» في صفحة المركبة · و«صندوق العروض» في الحساب.

**السياق:**
أرسلتُ عرضًا ثمّ فتحتُ صندوق البائع، فوجدتُ زرّين: **«اقبل»** و**«قابِل»**.
ونافذةُ المشتري كانت تقول «يقدر البائع يقبل **أو يرفض** أو يعرض مبلغ
مقابل». وقِيس النطاق: `createOffer` · `counterOffer` · `withdrawOffer`
(للمشتري) · `acceptOffer` · `expireOffers` — **ولا دالّةَ رفضٍ للبائع**.
و`OfferStatus.REJECTED` يُكتب في حالين آليّين فقط: عرضٌ دون الحدّ
المخفيّ يُرفض عند إرساله، وبقيّةُ العروض تُرفض حين يُقبل واحد.

**السؤال:**
أيُضاف للبائع زرُّ رفضٍ صريح، أم يبقى الرفضُ آليًّا وحده؟

**ما وجدته في التصميم:**
لا يوجد. والمواصفة تذكر القبول والمقابلة والانقضاء ولا تذكر رفضًا بيد
البائع.

**اقتراحي:**
**يُضاف.** بلا رفضٍ صريح، يبقى المشتري ثماني وأربعين ساعة ينتظر ردًّا
لن يأتي، ويبقى البائع يرى عرضًا لا يريده في صندوقه حتى ينقضي. والرفض
خبرٌ نافع لكليهما: المشتري يعرف فيرفع عرضه أو ينصرف، والصندوق يخلو.
وسببُ الرفض **اختياريّ** — إلزامُه يجعل البائع يتجاهل بدل أن يرفض.

**الأثر إن لم يُجَب:**
صُحِّح النصّ ليقول ما يفعله المنتج: «للبائع أن يقبل أو يعرض مبلغًا
مقابلًا، وإن لم يردّ انقضى عرضك بانقضاء مهلته» — فلا تَعِد الشاشةُ بما
لا يقع. ولا تغيير في المخطّط ولا في القيود؛ وإضافةُ الزرّ لاحقًا
دالّةٌ واحدة ومسارٌ واحد.

---

━━━ سؤال للمصمّم ━━━
المهمة: إكمالُ النواقص — ماركاتٌ بلا طرازات
الشاشة: Ws «بِع سيارتك» · خطوة «بيانات المركبة»

السياق:
البذرة تزرع **عشر ماركاتٍ بأشجارٍ كاملة و٣٢ بأسمائها فقط**، والمعالج
كان يعرضها كلَّها — فيختار البائع «ميتسوبيشي» وتُفتح قائمةُ الطرازات
فارغةً ومعطَّلة بلا كلمة. والفئةُ إلزاميةٌ عند النشر، فتلك الاثنتان
والثلاثون **لا يمكن أن تُنشَر أصلًا**.

السؤال:
أتبقى الماركاتُ غيرُ المكتملة مخفيّةً عن البائع حتى يصل الكتالوج، أم
تُعرض ومعها سطرٌ يقول إن طرازاتها لم تُضف بعد؟

ما وجدته في التصميم:
لا يوجد. والتصميم يفترض كتالوجًا كاملًا، و`BUILD-WEB-ADMIN` يقول إن
الكتالوج الكامل «يُستورد لاحقًا عبر A12».

اقتراحي:
**تُخفى**، ومعها بابٌ ظاهر: «لا تجد ماركتك؟ أخبرنا ونضيفها» إلى صفحة
التواصل. وعرضُ ماركةٍ لا تُنشَر وعدٌ يُخلَف بعد أن يكون البائع قد
اختار وأدخل؛ وإخفاؤها مع بابٍ يُسمعنا الطلب **ويقيس** ما ينقص
الكتالوج فعلًا من أفواه الناس لا بالتخمين.

الأثر إن لم يُجَب:
نُفِّذ الاقتراح (القائمة عشرٌ اليوم). وعودتُها كلِّها سطرٌ واحد، ولا
تغيير في المخطّط. **والعلاجُ الحقيقيّ بياناتٌ لا شيفرة**: استيرادُ
الكتالوج يُعيد الاثنتين والثلاثين بلا تغيير سطر.
━━━━━━━━━━━━━━━━━

---

━━━ سؤال للمصمّم ━━━
المهمة: وصلُ خصائص الباقات
الشاشة: A—الباقات (`/admin/plans`) · وWs «بِع سيارتك»

السياق:
محرّكُ الخصائص كان مبنيًّا ولا يقرؤه أحد، فوُصل منه أربعة:
`can_direct_sale` و`can_negotiate` و`can_auction` و`max_active_listings`.
والأخيرُ يحتاج تعريفًا: أيُّ الحالات «تشغل مقعدًا»؟

السؤال:
أيُحسب الإعلانُ الموقوف من صاحبه (`PAUSED`) ضمن حدّ الإعلانات؟

ما وجدته في التصميم:
لا يوجد. والمواصفة (§١٤) تسمّي المفتاح ولا تعرّف «النشط».

اقتراحي:
**يُحسب.** إعلانٌ يوقفه صاحبُه يعود بضغطة، فلو لم يُحسب لصار الحدُّ
بلا معنًى: يوقف خمسةً وينشر خمسة. والمسودّةُ والمباعة والمنتهية
والموقوفة إداريًّا لا تُحسب — الأولى ليست عرضًا، والثلاثُ انتهت.

الأثر إن لم يُجَب:
نُفِّذ الاقتراح، وعليه تعليق `// DESIGN-Q` في
`src/lib/domain/entitlements.ts`. **ولا أثر اليوم**: الحدُّ `-1` في
الباقة الوحيدة، فلا أحد يبلغه. وتغييرُه سطرٌ واحد.
━━━━━━━━━━━━━━━━━

---

━━━ سؤال للمصمّم ━━━
المهمة: ٦ — ملفُّ المزوّد ٣٦٠ درجة
الشاشة: A28 «تفاصيل المزوّد» · بطاقة «حسابه عندنا»

السياق:
بنيتُ الرصيد والكشف والقيد كما طلبتَ، فظهر أنّ `PROVIDER_PAYABLE`
**يُقيَّد دائنًا عند كل خدمةٍ تُنجَز ولا شيء يخصمه أبدًا**: لا مسار
صرفٍ للمزوّدين ولا قيدَ سداد. فالالتزامُ يكبر بلا حدّ، والرصيد الذي
تراه اليوم هو مجموعُ ما استُحقّ منذ البداية لا ما بقي.

السؤال:
كيف يصل المالُ إلى المزوّد — بتقسيمٍ آليّ لدى بوّابة الدفع، أم بحوالةٍ
دورية منّا كما يُصرف للبائعين؟

ما وجدته في التصميم:
`provider-account.ts` يبني للمزوّد حسابًا لدى البوّابة ويقول في
`ledger-events.ts`: «التوزيع لدى البوّابة تعليمةُ دفعٍ لا تغييرُ
مورِّد». فالنيّةُ تقسيمٌ آليّ — **ولا شيء يكتب أثره في دفترنا**.

اقتراحي:
**تُسجَّل التسوية أيًّا كان طريقُها.** إن قسّمت البوّابة فالويبهوك
يكتب خصمًا بمرجع التحويل، وإن حوّلنا بأنفسنا فالخصم يدويٌّ بمرجع
الحوالة — وكلاهما نفسُ القيد. وبهذا يصير الرصيد «ما بقي له» لا «ما
استُحقّ»، ويُطابَق كشفُنا بكشفه.

الأثر إن لم يُجَب:
القيدُ اليدويّ يسدّ الفجوة اليوم: من سدّد بحوالة يخصمها بمرجعها،
والموافقةُ الثانية تحرسها. ولا إعادةَ عمل حين يأتي الجواب — المسارُ
الآليّ يكتب القيد نفسه.
━━━━━━━━━━━━━━━━━

---

━━━ سؤال للمصمّم ━━━
المهمة: ٨ — الفحص · صورُ البنود
الشاشة: نموذج الفحص في لوحة المزوّد

السياق:
مواصفتُك تقول: «Notes and photos required when status is Minor or
Major». والملاحظةُ أُلزمت نصًّا كما طلبت. والصورةُ بُنيت: يفتح الفاحصُ
الكاميرا من البند، وتُطمَس لوحةُ السيارة، وتظهر مصغّرةً تُحذف بنقرة.

السؤال:
أتُلزَم الصورةُ مع «ملاحظة» أيضًا، أم مع «عطل» وحده؟

ما وجدته في التصميم:
لا يوجد — والمواصفة تُلزم بهما معًا.

اقتراحي:
**مع «عطل» وحده.** تقريرٌ من ٢١٠ بنودٍ قد يحمل ثلاثين ملاحظةً خفيفة،
وإلزامُ صورةٍ لكلٍّ منها يجعل الفاحصَ **يتجنّب وسمَها أصلًا** ويضع
«سليم» ليمضي — فتفسد البيانات التي نقيس بها المزوّدين وتُضلَّل
المشتري. والعطلُ قليلٌ وخطير، والصورةُ فيه دليلٌ يُحتجّ به.

والملاحظةُ النصّية تبقى إلزاميّةً في الحالين كما طلبت.

الأثر إن لم يُجَب:
نُفِّذ الاقتراح، وعليه تعليق `// DESIGN-Q` في `InspectionForm.tsx`.
والتحويلُ إلى إلزامها في الحالين **شرطٌ واحد** في `saveDraftResult`
و`submitInspection` — لا إعادة بناء.
━━━━━━━━━━━━━━━━━

---

━━━ سؤال للمصمّم ━━━
المهمة: ٧ — لوحة المزوّد · حقول الإنجاز لكل صنف
الشاشة: `/provider/<ref>/complete` — نموذجٌ واحد يرسم مخطّط كل صنف

السياق:
طلبتَ «وإذا كان المزوّد نقل ملكيّة هناك حقول تناسبه لتنفيذ الطلب
**وهكذا لباقي المزوّدين**». والنموذج مبنيٌّ وعامل، ومخطّطُ الفحص
وحده عندك. وحقولُ الأصناف السبعة الباقية **اقترحتُها أنا** من حاجة
كلِّ عمل، لا من نصٍّ منك.

السؤال:
أتُقرّ هذه القوائم كما هي، أم تبدّل فيها؟

ما وجدته في التصميم:
لا يوجد — لا التصميم ولا المواصفة تذكر حقول إنجازٍ لأيّ صنف.

اقتراحي:
| الصنف | المطلوب | الاختياري |
| --- | --- | --- |
| نقل المركبة | الناقل · رقم البوليصة · تاريخ الاستلام · تاريخ التسليم · من استلم | قراءة العدّاد · ملاحظات |
| التأمين | الشركة · رقم الوثيقة · التغطية (ضدّ الغير \| شامل) · بداية السريان · نهايته · القسط | ملاحظات |
| نقل الملكية | رقم المعاملة · رقم اللوحة · تاريخ النقل · المالك الجديد | الرسوم · ملاحظات |
| التهيئة | وصف ما أُنجز | ساعات العمل · ملاحظات |
| التصوير | عدد الصور · رابط الألبوم | ملاحظات |
| التمويل | الجهة · رقم الطلب · القرار (موافقة \| مشروطة \| رفض) ثمّ المبلغ والمدّة على الموافقة، والسبب على الرفض | ملاحظات |
| غير المصنَّف | وصف ما أُنجز | ملاحظات |

ومعيارُ الاختيار: **ما يُطالَب به بعد شهر**. رقمُ الوثيقة يُسأل عنه
عند حادث، ورقمُ البوليصة عند تأخّر شحنة، ورقمُ معاملة النقل عند
مراجعة المرور. وما لا يُطالَب به تركتُه اختياريًّا.

وثلاثةُ قيودٍ أضفتُها بلا سؤال لأنها صدقٌ لا ذوق: تاريخُ تسليمٍ لم
يأتِ بعد يُرفض، وتسليمٌ قبل استلامه يُرفض، ووثيقةٌ تنتهي قبل أن تبدأ
تُرفض.

الأثر إن لم يُجَب:
القوائم عاملةٌ الآن، والمزوّدون يكتبون بها. وتبديلُ حقلٍ أو إضافتُه
**سطرٌ في `completion-schema.ts` واسمُه في `labels/completion.ts`** —
لا ترحيلَ ولا شاشة، لأنّ التخزين صفٌّ لكل حقل. فالإجابة المتأخّرة لا
تُعيد عملًا.
━━━━━━━━━━━━━━━━━

---

━━━ سؤال للمصمّم ━━━
المهمة: ٧ — لوحة المزوّد · خدمةُ المعاينة
الشاشة: `/cars/<slug>` — زرّ «طلب معاينة» في عمود الشراء

السياق:
قِستُ كلَّ خدمةٍ فعّالة: أتصل مزوّدًا في مدينة؟ فخرجت اثنتان لا
تُطلبان. أُصلحت «نقل الملكية» (كانت معروضةً في الرئيسية بـ٣٥٠ ريالًا
ولا تُشترى)، وبقيت «المعاينة».

السؤال:
المعاينةُ — موعدٌ بين المشتري والبائع مباشرةً، أم خدمةٌ يؤدّيها
مزوّد؟

ما وجدته في التصميم:
صفُّها في `services.json` بسعر صفر و`providerType: null`، فلا تُطلب.
وزرُّها في الشاشة يقول «قريبًا — تواصل مع البائع من صفحة الطلب بعد
الشراء». وهي مستثناةٌ من بنر الخدمات (`SHOWN_ELSEWHERE`).

اقتراحي:
**موعدٌ مباشر لا خدمةُ مزوّد.** المعاينةُ لقاءٌ بين طرفي الصفقة، ولا
طرفَ ثالثًا يؤدّيها ولا مالَ فيها. فتُبنى مواعيدَ على الإعلان
(يقترح المشتري، ويقبل البائع، ويُكشف العنوان عند القبول — وهو ما
يَعِد به نصّ «لا يُكشف العنوان إلا بعد تأكيد الموعد» القائم
بالفعل)، **ويُحذف صفُّها من الخدمات** حتى لا يبقى صفٌّ لا يُطلب.

الأثر إن لم يُجَب:
الحالُ كما هي: الزرّ يقول «قريبًا» بصدق، والصفُّ لا يُعرض في بنر
الخدمات. فلا وعدَ مُخلَف — لكنّ الميزةَ غائبة، والنصّ يَعِد بها.
━━━━━━━━━━━━━━━━━

---

━━━ سؤال للمصمّم ━━━
المهمة: ٨ — الفحص · وزنُ الأقسام في الدرجة
الشاشة: `/admin/inspection-template` — عمود «الوزن»، ودرجةُ التقرير في `/cars/<slug>`

السياق:
**حقولُ الفحص ليست محجوبة ولا تنتظرك**: القالب مبنيٌّ بـ٢١٠ بندًا في
ستّة أقسام، وكلُّ بندٍ يُضاف ويُحذف ويُعلَّم «حرجًا» من لوحة الأدمن —
وكلُّ تغييرٍ يرفع الإصدار، والتقاريرُ الصادرة محفوظةٌ بلقطتها. والذي
يحتاجك شيءٌ واحد: **كم يزن كلُّ قسم في الدرجة**.

السؤال:
أتبقى الأقسام الستّة متساوية الوزن، أم تُثقَّل بما يُكلّف إصلاحه؟

ما وجدته في التصميم:
لا يوجد. والأوزان اليوم **واحدٌ لكلٍّ**، أي أنّ كلّ قسمٍ سدسُ الدرجة
مهما كان عدد بنوده. وأثرُه بالأرقام:

| ما فسد | البنود | الدرجة اليوم |
| --- | --- | --- |
| الإطارات كلُّها | ١٥ | ٨٣ |
| الهيكل والصبغ كلُّه | ٤٠ | ٨٣ |

**والإطاراتُ تُبدَّل بثلاثة آلاف، والهيكلُ المعوجّ هو سببُ ألّا تشتريها
أصلًا** — والرقمان متساويان. والشارةُ الحرجة تُغطّي جزءًا (ستّةٌ من
ثمانية بنودٍ حرجة في الهيكل تسقف التقدير عند «مقبول») **لكنّ الرقم
يبقى ٨٣**.

اقتراحي:
| القسم | الوزن المقترح |
| --- | --- |
| الهيكل والصبغ | ٣ |
| المحرك | ٣ |
| ناقل الحركة | ٢ |
| الفرامل والتعليق | ٢ |
| الكهرباء والمقصورة | ١ |
| الإطارات والعجلات | ١ |

ومعياره **كلفةُ الإصلاح وأثرُه على القرار**: ما لا يُصلَح (الهيكل)
وما يُكلّف ربع ثمن السيارة (المحرك والناقل) يثقل، وما يُشترى من أيّ
محلّ (إطار، لمبة) يخفّ. وبها تصير السيارة المعوجّة الهيكل ٧٥ لا ٨٣،
والمهترئة الإطارات ٩٢.

الأثر إن لم يُجَب:
الأوزان تبقى متساوية، **والدرجة تُضلّل في أخطر حالةٍ تُقاس**. وتبديلُها
ضغطاتٌ في اللوحة لا شيفرة — فجوابُك يُطبَّق في دقيقة، ولا يمسّ تقريرًا
صدر.
━━━━━━━━━━━━━━━━━

---

━━━ سؤال للمصمّم ━━━
المهمة: تحصيل بيع المركبة · ما معنى «ما وصلنا فعلًا» في لوحتك
الشاشة: `/admin/ledger` — بطاقتا «لدى مزوّد الدفع» و«ما وصلنا فعلًا»

السياق:
حين يؤكّد المشتري الاستلام نُفرج عن مال البائع، **وتبقى حصّتنا
(العمولة والضريبة) عند مزوّد الدفع** حتى نسحبها إلى البنك. والدفتر
اليوم **لا يكتب لها قيدَ خزينة**: تُعترف إيرادًا وضريبةً مستحقّة،
ويبقى مقابلُها في حساب «لدى مزوّد الدفع» إلى الأبد.

السؤال:
المبلغُ الذي صار لنا ولم يُحوَّل إلى البنك بعد — أيُحسب في لوحتك
**مالًا لنا**، أم يبقى «لدى مزوّد الدفع» حتى تصل الحوالة؟

ما وجدته في التصميم:
لا يوجد. وخدماتُ المزوّدين تكتب قيد الخزينة بالفعل (`service.captured`)
— **فالمساران مختلفان اليوم**: ثمنُ فحصٍ يظهر في «ما وصلنا»، وعمولةُ
بيع سيارةٍ لا تظهر. والبطاقةُ التي تقول «التزامٌ تجاه الأطراف، لا مالٌ
لنا» تحمل مالَنا نحن.

اقتراحي:
**مالٌ لنا من لحظة التحصيل.** يُكتب قيدُ خزينةٍ عند تحصيل المركبة كما
يُكتب للخدمة، فيصير:
· «لدى مزوّد الدفع» = **المحجوز الذي لم يُحصَّل** — التزامٌ خالص.
· «ما وصلنا فعلًا» = **رصيدنا لدى ميسر قبل الحوالة البنكية** — وهو
  الرقم الذي يُطابَق بكشف ميسر شهريًّا.
وسببُه أنّ المال خرج من يد المشتري ولم يعد قابلًا للردّ التلقائيّ،
فهو لنا وإن لم يصل البنك.

الأثر إن لم يُجَب:
الدفتر يبقى متّسقًا في ذاته، **ولوحتُك تُظهر نقدًا أقلّ ممّا تملك**
ولا رصيدَ يُطابَق بكشف المزوّد — فتُكتشف الفروق بعد شهور لا في حينها.
━━━━━━━━━━━━━━━━━
