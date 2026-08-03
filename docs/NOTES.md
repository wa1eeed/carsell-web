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

## When R2 is configured

**One verification is deliberately missing and must be run then.**

The plate-blur acceptance criterion ("an image with a plate is saved blurred") is
proven at the storage boundary: `tests/listing-images.test.ts` replaces the store
with a spy and measures the bytes handed to it. What has **never** run is the
full round trip over HTTP — upload a real file through
`POST /api/v1/listings/images`, then read the object back from R2 and confirm the
plate region is blurred in what storage actually holds.

Locally R2 is unconfigured, so the route stops at `503 STORAGE_UNAVAILABLE`,
which is correct behaviour and is itself verified. But nothing has yet proven
that `storeObject` writes what it was given, or that the object served from the
public URL is the processed one.

With keys in place this is a single check. Without this note it is a silent gap:
every test passes and the criterion still might not hold in production.

Run:

1. Upload a photo with a readable plate through the sell flow.
2. Fetch the resulting public URL.
3. Assert the plate region's standard deviation is below half the original.

## قبل الإنتاج — ما لا يُطلَق بدونه

### القاعدة ١٢ · نصاب ثنائي على الإفراج عن الضمان — **غير مبنيّ الآن**

كانت مبنيّة في `payments.ts`، وحُذفت معه حين أُلغيت بنية الدفع القديمة
(قرار ٣٤). و`canSettle` في `transfer-windows.ts` تحرس **التوقيت** — لا
تحرس النصاب.

**فالحال اليوم:** لا شيء يمنع إفراجًا بموافقة شخص واحد، لأنه لا مسار
إفراج أصلًا. وهذا آمنٌ ما دام لا مُهايئ، **وخطرٌ لحظة وصوله**.

**يُعاد مع `MoyasarAdapter`** — حين يصير للإفراج استدعاءٌ حقيقيّ يُحرَس.
والآلية جاهزة: `ApprovalRequest` بـ`kind = ESCROW_RELEASE`، وهي نفسها
التي تدوّر المفاتيح وتبدّل البوابات.

> **لا يُطلَق إنتاج بلا نصاب ثنائي على الإفراج.**

### عند وصول مفاتيح ميسر — **طابِق كل حقل بالاسم**

`MoyasarAdapter` بُني على الوثائق ولم يلمس المزوّد. واختباراته على بوابة
وهميّة تُثبت المنطق ولا تُثبت **أسماء الحقول**.

**أوّل استدعاء حقيقيّ لا يكتفي بنجاح الطلب.** اطبع الاستجابة كاملة وطابق:

| ما ينتظره المُهايئ | تحقّق منه |
|---|---|
| `id` | معرّف العملية |
| `status` | و**قيَمه**: `initiated` · `authorized` · `captured` · `paid` · `voided` · `refunded` |
| `source.transaction_url` | رابط تحدّي 3DS — وليس `transactionUrl` |
| `captured` | المبلغ المُسوّى بالهللات |
| `message` | نصّ الرفض |

ولو اختلف اسمٌ واحد لمرّ الاختبار وسقط الإنتاج — فالنجاح وحده لا يكشف
حقلًا اسمه غير الذي نقرأ، لأن `undefined` تُقرأ «لم يُطلب تحدٍّ» لا «لم أجد
الحقل».

**واختبر مسار الحجز ثم الإلغاء أوّلًا** على بطاقة اختبار: هو المسار الوحيد
الذي لا يحرّك مالًا، فيكشف أسماء الحقول بلا أثر.

## ⛔ حاجز إطلاق: بناء الإنتاج يسقط

`npm run build` يسقط عند تصدير صفحات الجذر الخاصّة:

```
Error: <Html> should not be imported outside of pages/_document.
Export encountered an error on /_error: /404, exiting the build.
```

**وهو سابق لهذه الجلسة** — أُعيد إنتاجه في شجرة عمل معزولة عند `fca00c9`.
و**`npm run verify` لا يبني**، فبقي غير مرئيّ: الأنواع واللينت والبوابات
والاختبارات كلّها تمرّ.

### ⚠️ تصحيح: الترقية إلى Next 16 **لا تُصلحه**

قيل في تشخيصٍ أوّل إنها تُصلحه، وكان ذلك **استنتاجًا من تشغيلٍ ناقص**:
اختفت رسالة `<Html>` فبدا الأمر منتهيًا، والبناء كان قد سقط بعدها بخطوة
على `/_global-error`. وجُرّبت الترقية كاملةً على تثبيت نظيف (٤٨٦ اختبارًا
تمرّ عليها، والأنواع واللينت سليمة) **فسقط البناء أيضًا** — ثم أُعيد
Next إلى ١٥٫٥٫٢٢ مثبَّتًا بلا `^` كما كان.

### والرسالتان عَرَضٌ واحد

| النسخة | الرسالة | الموضع |
|---|---|---|
| 15.5.22 | `<Html> should not be imported…` | `/404` و`/500` |
| 16.2.12 | `Cannot read properties of null (reading 'useContext')` | `/_global-error` |

و`<Html>` في Next ترمي تلك الرسالة **حين يعود سياق React فارغًا** — فهي
الخطأ نفسه بصياغتين. **والسبب: سياق React يكون `null` عند التصيير المسبق
لصفحات الجذر الخاصّة.**

### ما استُبعد بالقياس

| الفرضية | الاختبار | النتيجة |
|---|---|---|
| `next-intl/plugin` | بناء بلا `withNextIntl` | يسقط |
| إصدار React | تثبيت `19.1.1` ثم العودة | يسقط |
| `output: 'standalone'` | تعطيله وحده | يسقط |
| نسخة React مكرّرة | `npm ls react` | نسخة واحدة مُوحَّدة |
| إصدار Node | `.nvmrc` = ٢٢، والبناء عليه | مطابق |
| Next 16 | ترقية كاملة نظيفة | يسقط بموضعٍ آخر |
| ملفاتنا | حذفًا وإعادةً واحدًا واحدًا | لا أثر |

### وما تحسّن فعلًا

`src/app/layout.tsx` (تخطيط جذرٍ يمرّر `children`) و`src/app/not-found.tsx`:
**بهما مرّت `/_not-found` على Next 16** بعد أن كانت تسقط. وهما صوابٌ
بذاتهما — Next يوجب تخطيطًا في الجذر، و٤٠٤ عربية خيرٌ من صفحة Next
الافتراضية. أُبقيا وإن لم يُنهيا الحاجز.

### الخطوة التالية

الفرضية الباقية: **شيءٌ في هذه البيئة يُفرِغ سياق React عند التصيير
المسبق**. وأرخص اختبارٍ حاسم لها: `create-next-app` فارغ في هذا الجهاز
ثم `next build`.

- سقط ⇒ العلّة في البيئة (npm/Node/نظام الملفات) لا في المشروع.
- مرّ ⇒ العلّة في تركيب المشروع، ويُبحث بالحذف من نسخةٍ من الشجرة.

**والتذبذب بين `/404` و`/500` ضجيج**: تُولَّدان بالتوازي فتُبلَّغ أيّهما
سبقت. **والقياس بعد `rm -rf .next-check` وحده** — ذاكرته تعطي نتائج
متناقضة أضلّت التشخيص طويلًا.

### حتى يُحلّ

`npm run build` لا يمرّ، و**٢٩ (الأداء) و٣٠ (المراجعة البصرية) موقوفتان
عليه**. والتطوير والاختبارات تعمل كاملة.
