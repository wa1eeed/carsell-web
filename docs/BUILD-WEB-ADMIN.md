# CarSell — مواصفة تنفيذ المرحلة الأولى (الويب + لوحة الأدمن)

> هذا الملف **عقد التنفيذ**. كل ما فيه إلزامي. لا تبدأ مهمة بلا فتح القسم المقابل لها هنا.
> **اقرأ `DESIGN-DECISIONS.md` أولًا** — يحوي أحدث القرارات ويتقدّم على أي نصّ هنا يخالفه.
> مراجع التصميم: `CarSell Web.dc.html` (Wa–Wp) · `CarSell Admin.dc.html` (A1–A14) · `HANDOFF.md` (قواعد العمل)
> **قاعدة عليا:** التصميم هو الحقيقة. إن تعارض الكود مع التصميم، الكود خطأ.

---

## 0. ما تبنيه في هذه المرحلة وما لا تبنيه

**نعم:** موقع الويب العام (تصفّح، سيارة، مزادات، فحص، خدمات، معرض، دخول) · لوحة الأدمن (١٤ شاشة) · قاعدة البيانات الكاملة · API · لوحة تحكم النشر.

**لا (المرحلة الثانية):** تطبيق Flutter · لوحة التاجر · إشعارات الدفع · الحملات التسويقية · التسعير الذكي والبحث الطبيعي (هياكلها فقط).

**سبب الترتيب:** الأدمن يملأ الكتالوج، والويب يعرضه. بلا كتالوج لا يوجد ما يُعرض، وبلا ويب لا تعرف إن كان الكتالوج صحيحًا. التطبيق يستهلك نفس الـAPI فيصير بناؤه لاحقًا تجميعًا لا تصميمًا.

---

## 1. المكدّس — مثبَّت لا خياري

```
Next.js 15 (App Router) + TypeScript strict
Postgres 16 + Prisma
Auth: خاص بنا (OTP) — لا NextAuth
Tailwind v4 + توكنات CSS (القسم 3)
TanStack Query (كل جلب بيانات)
Zod (تحقّق على الحدّين)
next-intl (ar/en + RTL)
Cloudflare R2 (الوسائط) · Resend (البريد) · Sentry (المراقبة)
Coolify على VPS
```

**ممنوع:** أي مكتبة UI جاهزة (shadcn/MUI/Chakra) — التصميم موجود، والمكتبة ستفرض مظهرها · أي ORM ثانٍ · أي CSS-in-JS · `any` في TypeScript.

**بنية المستودع:**
```
/prisma/schema.prisma
/src/app/(site)/…            ← الويب العام، locale-aware
/src/app/admin/…             ← لوحة الأدمن
/src/app/api/v1/…            ← REST
/src/components/ui/          ← المكوّنات الأساسية (القسم 4)
/src/components/site/        ← مكوّنات الويب
/src/components/admin/       ← مكوّنات الأدمن
/src/lib/{db,auth,r2,money,arabic,audit}.ts
/src/messages/{ar,en}.json
/design/                     ← نسخة من ملفات .dc.html للمراجعة البصرية
```

---

## 2. المصطلحات — استخدم هذه الأسماء حرفيًا في الكود

| المصطلح | الكود | ملاحظة |
|---|---|---|
| مركبة في ملف المستخدم | `Vehicle` | تُضاف ولو لم تُعرض للبيع |
| إعلان | `Listing` | `vehicleId` + طريقة بيع + سعر |
| طريقة البيع | `ListingType` | `DIRECT` \| `NEGOTIATION` \| `AUCTION` |
| عرض من مشتري | `Offer` | للتفاوض فقط |
| مزايدة | `Bid` | للمزاد فقط |
| طلب | `Order` | ينشأ بعد القبول/الفوز/الشراء |
| مرحلة الطلب | `OrderStage` | `REQUEST→APPROVED→INSPECTION→PAYMENT→TRANSFER→DONE` |
| ضمان | `Escrow` | حجز وإفراج |
| عربون | `Deposit` | للمزاد |
| فئة | `Trim` | تحت `Model` تحت `Brand` |
| خدمة | `Service` + `ServiceRequest` | يسعّرها الأدمن |

**ممنوع** خلط `Vehicle` و`Listing` — هذا أكبر خطأ محتمل. المركبة تبقى بعد انتهاء الإعلان.

---

## 3. التوكنات — انسخها كما هي

`src/app/globals.css`:
```css
@theme {
  /* الأسطح */
  --color-bg: #f5ead8;          /* خلفية الصفحة */
  --color-surface: #efe4cf;     /* بطاقات وأشرطة */
  --color-ink: #201e1d;         /* السطح الداكن والنص */

  /* الأخضر — الإجراء والتوثيق والنجاح */
  --color-accent: #4a8a5e;
  --color-accent-100: #eef7ee;
  --color-accent-200: #d8ecda;
  --color-accent-400: #8cc79e;  /* على الأسطح الداكنة فقط */
  --color-accent-700: #2f6142;
  --color-accent-800: #20452f;
  --color-accent-900: #16301f;

  /* الأوكر — الوقت والتحذير وما يحتاج انتباهًا */
  --color-warn: #c39a3c;
  --color-warn-100: #fdf5e2;
  --color-warn-200: #f7e9c2;
  --color-warn-400: #ddb95f;    /* على الأسطح الداكنة فقط */
  --color-warn-700: #7d5f1c;
  --color-warn-800: #5a4313;
  --color-warn-900: #3a2a0d;

  /* الأحمر — الفشل والحذف والتجاوز الحرج فقط */
  --color-danger: #b8452f;

  /* سلاسل المخططات — بهذا الترتيب، خمس سلاسل كحد أقصى */
  --chart-1: #4a8a5e;  --chart-2: #7fb08d;  --chart-3: #c39a3c;
  --chart-4: #a8977a;  --chart-5: #6d6a64;  --chart-neg: #b8452f;

  /* الخطوط الفاصلة */
  --carz-line:   rgba(32,30,29,.13);
  --carz-line-2: rgba(32,30,29,.07);

  --font-body-ar: 'Tajawal', system-ui, sans-serif;
  --font-heading-ar: 'Tajawal', system-ui, sans-serif;  /* 700/800 */
  --font-body-en: 'Figtree', system-ui, sans-serif;
  --font-num: Arial, Helvetica, sans-serif;             /* كل الأرقام */
}
```

**قواعد لا تُخالف:**
1. **لا لون مكتوب في مكوّن.** `bg-[#4a8a5e]` مرفوض. `bg-accent` فقط.
2. **كل رقم بـ Arial** (`font-num`) — الأسعار، الممشى، الأعداد، العدّادات، اللوحات، IBAN. الأرقام العربية-الهندية للعرض والتخزين Latin.
3. **الفصل بالخطوط لا بالظلال** في الويب والأدمن. الظل للطبقات العائمة فقط (قوائم منسدلة، حوارات).
4. **شبكة الويب:** عرض المحتوى ١٣٦٠px، هامش ٤٠px، فراغ أعمدة ٤٠px، عمود جانبي ٣٨٠px، حواف ١٤/١٨px.
5. **شبكة الأدمن:** عرض ١٤٤٠px، شريط جانبي ٢٣٨px داكن، رأس صفحة ١٧px/٣٠px، حواف ١١/١٢px.
6. **الأخضر = إجراء وتوثيق. الأوكر = وقت وتحذير. الأحمر = فشل فقط.** لا تخلط.

---

## 4. المكوّنات الأساسية — ابنها قبل أي شاشة

في `src/components/ui/`. لكل مكوّن قصة Storybook (أو صفحة `/dev/ui`) بكل حالاته، وسكرين شوت مقابل التصميم.

| المكوّن | الحالات | مرجع التصميم |
|---|---|---|
| `Button` | primary · outline · ghost · danger · icon · مع عدّاد | كل الشاشات |
| `Chip` | فلتر · وسم حالة · قابل للإزالة · بعدّاد داخل دائرة | Wb, A2 |
| `Tabs` | مع عدّاد في دائرة، تاب نشط داكن | A4, D2 |
| `DataTable` | رأس، صفوف، فرز، تحديد جماعي، حالة فارغة، تحميل | A4, A5, A12 |
| `StatCard` | عادي · أوكر (تحذير) · داكن | A1, D1 |
| `Money` | مبلغ + عملة + مشطوب + سالب أخضر | كل الشاشات |
| `ArabicNumber` | تحويل Latin→عربي-هندي للعرض | إلزامي |
| `PlateBadge` | sm/md/lg — لوحة سعودية بصفَّين وشريط KSA، **Arial** | 5a, Wp |
| `ScoreRing` | درجة الفحص /١٠٠ | Wc, Wd |
| `InspectedBadge` | «مفحوصة» أخضر — بلا رقم، وغياب الوسم = غير مفحوصة | كل البطاقات |
| `CarCard` / `CarRow` | شبكة · قائمة · مموّلة | Wb |
| `StageTracker` | ٦ مراحل، أفقي ورأسي، حالات done/now/next | Wj, A4 |
| `RangeBar` | نطاق السوق + مؤشّر — يُوسَّط على المؤشّر | Wc, Wh |
| `Countdown` | `HH:MM:SS` Arial، يتوقف عند إخفاء الصفحة | Wk, We |
| `Sheet` / `Modal` | مقبض، عنوان، محتوى، فوتر | Wb فلاتر |
| `EmptyState` | نص + إجراء | كل جدول |
| `Toast` | نجاح · خطأ · معلومة | كل نموذج |
| `AdminShell` | شريط جانبي ٣٠ بندًا في ٤ مجموعات + رأس | A1–A14 |
| `SiteHeader` / `SiteFooter` | شريط حيّ + تنقّل بمؤشّر سفلي | Wa |

**قاعدة الشاشات:** الشاشة **تركيب** لا رسم. إن احتجت عنصرًا جديدًا، أضِفه إلى `ui/` أولًا.

---

## 5. قاعدة البيانات — المرحلة الأولى كاملة

```prisma
// ————— الهوية —————
model User {
  id            String   @id @default(cuid())
  phone         String   @unique          // E.164
  email         String?  @unique
  name          String?
  avatarUrl     String?
  locale        String   @default("ar")
  role          UserRole @default(USER)
  status        UserStatus @default(ACTIVE)
  idVerified    Boolean  @default(false)
  idVerifiedAt  DateTime?
  iban          String?                   // مشفّر
  dealerId      String?
  createdAt     DateTime @default(now())
  @@index([status, createdAt])
}
enum UserRole { USER DEALER ADMIN SUPER_ADMIN }
enum UserStatus { ACTIVE SUSPENDED BANNED }

model AdminUser {              // فريق الأدمن منفصل عن مستخدمي السوق
  id String @id @default(cuid())
  email String @unique
  name String
  role AdminRole
  twoFactorEnabled Boolean @default(false)
  lastSeenAt DateTime?
  status String @default("active")
}
enum AdminRole { SUPER_ADMIN OPS FINANCE SUPPORT CONTENT READONLY }

model OtpChallenge {
  id String @id @default(cuid())
  phone String
  codeHash String
  attempts Int @default(0)
  expiresAt DateTime
  consumedAt DateTime?
  @@index([phone, expiresAt])
}

// ————— الكتالوج (A12–A14) —————
model Brand {
  id String @id @default(cuid())
  nameAr String
  nameEn String
  slug String @unique
  logoUrl String?
  visible Boolean @default(true)
  sort Int @default(0)
  models Model[]
}
model Model {
  id String @id @default(cuid())
  brandId String
  nameAr String
  nameEn String
  yearFrom Int
  yearTo Int?
  bodyType BodyType?          // افتراضي للطراز
  visible Boolean @default(true)
  trims Trim[]
  @@index([brandId, visible])
}
model Trim {
  id String @id @default(cuid())
  modelId String
  nameAr String
  nameEn String
  yearFrom Int
  yearTo Int?
  // القيَم الموروثة — تُنسخ لقطةً إلى الإعلان
  bodyType     BodyType
  transmission Transmission
  fuel         FuelType
  drivetrain   Drivetrain
  seats Int
  doors Int
  engineL Decimal? @db.Decimal(3,1)
  cylinders Int?
  horsepower Int?
  defaultFeatures String[]     // مفاتيح مميّزات
  visible Boolean @default(true)
}
enum BodyType { SEDAN SUV PICKUP HATCHBACK COUPE VAN }
enum Transmission { AUTOMATIC MANUAL CVT DCT }
enum FuelType { PETROL DIESEL HYBRID ELECTRIC }
enum Drivetrain { FWD RWD AWD FOUR_WD }

// ————— المركبة والإعلان —————
model Vehicle {
  id String @id @default(cuid())
  ownerId String
  dealerId String?
  vin String?                  // فريد إن وُجد
  plateLetters String?         // ٣ أحرف
  plateNumbers String?         // ٤ أرقام
  trimId String?
  // لقطة الكتالوج وقت الإضافة — لا تُقرأ من Trim لاحقًا
  brandName String
  modelName String
  trimName String?
  year Int
  bodyType BodyType
  transmission Transmission
  fuel FuelType
  drivetrain Drivetrain
  seats Int
  mileageKm Int
  colorExterior String
  colorInterior String?
  spec VehicleSpec              // سعودي/خليجي/وارد وكيل
  condition VehicleCondition    // جديد/مستعمل
  overriddenFields Json?        // {field: {value, reason}}
  city String
  entryMode EntryMode           // VIN_LOOKUP | MANUAL
  createdAt DateTime @default(now())
  @@unique([vin])
  @@index([ownerId])
}
enum VehicleSpec { SAUDI GCC AGENT_IMPORT }
enum VehicleCondition { NEW USED }
enum EntryMode { VIN_LOOKUP MANUAL }

model Listing {
  id String @id @default(cuid())
  ref String @unique            // ADS2026A0005
  vehicleId String
  sellerId String
  type ListingType
  status ListingStatus @default(DRAFT)
  askPrice Decimal @db.Decimal(12,2)
  minAcceptPrice Decimal? @db.Decimal(12,2)   // مخفي عن المشترين
  negotiable Boolean @default(false)
  city String
  viewCount Int @default(0)
  featuredUntil DateTime?
  publishedAt DateTime?
  closedAt DateTime?
  closeReason String?
  images ListingImage[]
  @@index([status, type, city])
  @@index([status, publishedAt])
}
enum ListingType { DIRECT NEGOTIATION AUCTION }
enum ListingStatus { DRAFT PENDING_REVIEW PUBLISHED RESERVED SOLD SUSPENDED EXPIRED }

model ListingImage {
  id String @id @default(cuid())
  listingId String
  r2Key String
  sort Int
  isCover Boolean @default(false)
  phash String?
  plateBlurred Boolean @default(false)
  qualityFlags String[]         // BLURRY LOW_RES DUPLICATE
  @@index([listingId, sort])
}

// ————— التفاوض والمزاد —————
model Offer {
  id String @id @default(cuid())
  listingId String
  buyerId String
  amount Decimal @db.Decimal(12,2)
  status OfferStatus @default(PENDING)
  parentOfferId String?          // العرض المقابل
  autoRejected Boolean @default(false)
  expiresAt DateTime             // ٤٨ ساعة
  createdAt DateTime @default(now())
  @@index([listingId, status])
  @@index([buyerId, status])
}
enum OfferStatus { PENDING COUNTERED ACCEPTED REJECTED WITHDRAWN EXPIRED }

model Auction {
  id String @id @default(cuid())
  listingId String @unique
  startPrice Decimal @db.Decimal(12,2)
  reservePrice Decimal? @db.Decimal(12,2)   // مخفي — لا يُعاد في API العام أبدًا
  bidIncrement Decimal @db.Decimal(12,2)
  buyNowPrice Decimal? @db.Decimal(12,2)
  depositAmount Decimal @db.Decimal(12,2)
  startsAt DateTime
  endsAt DateTime
  extendedCount Int @default(0)
  status AuctionStatus @default(SCHEDULED)
  viewingCity String?
  viewingAddress String?
  bids Bid[]
  @@index([status, endsAt])
}
enum AuctionStatus { SCHEDULED LIVE ENDED_MET ENDED_UNMET CANCELLED }

model Bid {
  id String @id @default(cuid())
  auctionId String
  bidderId String
  amount Decimal @db.Decimal(12,2)
  isAuto Boolean @default(false)
  createdAt DateTime @default(now())
  @@index([auctionId, amount])
}
model Deposit {
  id String @id @default(cuid())
  auctionId String
  userId String
  amount Decimal @db.Decimal(12,2)
  status DepositStatus @default(HELD)
  releasedAt DateTime?
  @@unique([auctionId, userId])
}
enum DepositStatus { HELD RELEASED FORFEITED APPLIED }

// ————— الطلب والضمان —————
model Order {
  id String @id @default(cuid())
  ref String @unique             // ORD-2026-1184
  listingId String
  buyerId String
  sellerId String
  source OrderSource             // DIRECT | OFFER | AUCTION | BUY_NOW
  stage OrderStage @default(REQUEST)
  status OrderStatus @default(ACTIVE)
  agreedPrice Decimal @db.Decimal(12,2)
  commissionPct Decimal @db.Decimal(5,2)     // لقطة وقت الإنشاء
  commissionAmount Decimal @db.Decimal(12,2)
  stageEnteredAt DateTime @default(now())    // لحساب مدة البقاء
  paymentDueAt DateTime?
  transferAppointmentAt DateTime?
  cancelledBy String?
  cancelReason String?
  events OrderEvent[]
  @@index([stage, status])
  @@index([buyerId]) @@index([sellerId])
}
enum OrderSource { DIRECT OFFER AUCTION BUY_NOW }
enum OrderStage { REQUEST APPROVED INSPECTION PAYMENT TRANSFER DONE }
enum OrderStatus { ACTIVE COMPLETED CANCELLED STALLED DISPUTED }

model OrderEvent {
  id String @id @default(cuid())
  orderId String
  type String
  fromStage OrderStage?
  toStage OrderStage?
  actorId String?
  actorType String       // user | admin | system
  payload Json?
  createdAt DateTime @default(now())
  @@index([orderId, createdAt])
}

model Escrow {
  id String @id @default(cuid())
  orderId String @unique
  amount Decimal @db.Decimal(12,2)
  status EscrowStatus @default(PENDING)
  heldAt DateTime?
  releasedAt DateTime?
  releaseApprovedBy String[]     // يحتاج عضوين
  providerRef String?
}
enum EscrowStatus { PENDING HELD RELEASED REFUNDED PARTIAL_REFUND }

model Dispute {
  id String @id @default(cuid())
  orderId String
  openedBy String
  reason String
  status DisputeStatus @default(OPEN)
  slaDueAt DateTime
  resolution String?
  resolvedBy String?
  messages Json[]
}
enum DisputeStatus { OPEN INVESTIGATING RESOLVED_BUYER RESOLVED_SELLER CLOSED }

// ————— الخدمات —————
model Service {
  id String @id @default(cuid())
  key String @unique             // inspection | mojaz | shipping …
  nameAr String
  nameEn String
  descAr String
  descEn String
  price Decimal @db.Decimal(10,2)
  category ServiceCategory
  providerId String?
  isAutomated Boolean @default(false)
  slaHours Int?
  placements String[]            // home_services | listing_banner | guide …
  active Boolean @default(true)
  sort Int @default(0)
}
enum ServiceCategory { PRE_PURCHASE POST_PURCHASE SELLER }

model ServiceRequest {
  id String @id @default(cuid())
  ref String @unique
  serviceId String
  userId String
  listingId String?
  vehicleId String?
  status ServiceRequestStatus @default(NEW)
  providerId String?
  amount Decimal @db.Decimal(10,2)
  dueAt DateTime?
  resultUrl String?              // PDF في R2
  createdAt DateTime @default(now())
  @@index([status, dueAt])
}
enum ServiceRequestStatus { NEW ASSIGNED IN_PROGRESS DONE FAILED REFUNDED }

model InspectionReport {
  id String @id @default(cuid())
  serviceRequestId String @unique
  vehicleId String
  score Int                      // 0–100
  sections Json                  // ٢١٠ نقطة
  paintMap Json
  inspectorName String
  inspectedAt DateTime
  pdfUrl String?
}

// ————— الباقات والعمولة —————
model Plan {
  id String @id @default(cuid())
  key String @unique
  nameAr String
  nameEn String
  price Decimal @db.Decimal(10,2) @default(0)
  billingCycle String @default("monthly")
  visible Boolean @default(true)
  entitlements PlanEntitlement[]
}
model Entitlement {
  key String @id                 // can_auction | commission_pct …
  type String                    // bool | int | percent
  defaultValue String
  description String
}
model PlanEntitlement {
  planId String
  entitlementKey String
  value String
  @@id([planId, entitlementKey])
}
model Subscription {
  id String @id @default(cuid())
  userId String?
  dealerId String?
  planId String
  startsAt DateTime
  endsAt DateTime?
  status String @default("active")
  grandfatheredUntil DateTime?
}
model CommissionRule {
  id String @id @default(cuid())
  scope String                   // global | plan | dealer | listing_type
  scopeId String?
  pct Decimal @db.Decimal(5,2)
  fixedFee Decimal @db.Decimal(10,2) @default(0)
  minFee Decimal? @db.Decimal(10,2)
  maxFee Decimal? @db.Decimal(10,2)
  activeFrom DateTime
}

// ————— المحتوى والتشغيل —————
model FaqItem {
  id String @id @default(cuid())
  questionAr String
  questionEn String
  answerAr String
  answerEn String
  category String
  sort Int @default(0)
  active Boolean @default(true)
  placements FaqPlacement[]
}
model FaqPlacement {
  id String @id @default(cuid())
  faqId String
  surface String                 // listing_page | help_center | checkout
  listingType ListingType?
  condition Json?
  sort Int @default(0)
  active Boolean @default(true)
}

model NotificationTemplate {
  key String @id
  channelEmail Boolean @default(false)
  channelSms Boolean @default(false)
  channelPush Boolean @default(false)
  channelInApp Boolean @default(true)
  priority String @default("normal")   // critical | high | normal
  subjectAr String? subjectEn String?
  bodyAr String? bodyEn String?
  smsAr String? smsEn String?
  variables String[]
  active Boolean @default(true)
}

model AdSlot {
  key String @id                 // home_story | home_banner | search_inline …
  nameAr String
  width Int
  height Int
  pricingModel String            // day | week | cpm | cpc
  basePrice Decimal @db.Decimal(10,2)
  maxPerSession Int @default(1)
  active Boolean @default(true)
}
model AdCampaign {
  id String @id @default(cuid())
  advertiserName String
  slotKey String
  creativeUrl String
  targetUrl String
  startsAt DateTime
  endsAt DateTime
  budget Decimal @db.Decimal(10,2)
  targeting Json?                // city | brand | userType
  priority Int @default(0)
  status String @default("scheduled")
  impressions Int @default(0)
  clicks Int @default(0)
}

model Report {                    // بلاغات المستخدمين
  id String @id @default(cuid())
  reporterId String
  targetType String               // listing | user
  targetId String
  reason String
  details String?
  attachments String[]
  status String @default("open")
  resolvedBy String?
  createdAt DateTime @default(now())
}

model AuditLog {
  id String @id @default(cuid())
  actorId String
  actorType String                // admin | user | system
  entity String
  entityId String
  action String
  before Json?
  after Json?
  ip String?
  createdAt DateTime @default(now())
  @@index([entity, entityId])
  @@index([actorId, createdAt])
}

model PriceStat {                 // يُعاد بناؤه ليليًا
  id String @id @default(cuid())
  modelId String
  year Int
  trimId String?
  mileageBucket Int               // بآلاف الكيلومترات
  city String?
  p25 Decimal @db.Decimal(12,2)
  p50 Decimal @db.Decimal(12,2)
  p75 Decimal @db.Decimal(12,2)
  sampleSize Int
  daysToSellMedian Int?
  computedAt DateTime
  @@unique([modelId, year, trimId, mileageBucket, city])
}
```

**قواعد قاعدة البيانات:**
- كل المبالغ `Decimal(12,2)` — **ممنوع** `Float` للأموال.
- كل التواريخ UTC. العرض بتوقيت الرياض في الواجهة فقط.
- الحذف **منطقي** لما له أثر مالي (`status`)، وفيزيائي للمسودّات فقط.
- `reservePrice` و`minAcceptPrice` **لا تُعاد في أي استجابة عامة**. اكتب اختبارًا يفشل إن ظهرت.
- كل تعديل أدمن يكتب `AuditLog` — بدون استثناء.

---

## 6. عقود الـAPI — الويب العام

كل المسارات تحت `/api/v1`. الاستجابة `{ data, meta? }` والخطأ `{ error: { code, messageAr, messageEn, fields? } }`.

```
GET  /listings?type&brand&model&trim&yearFrom&yearTo&priceMin&priceMax
     &mileageMax&city&condition&spec&inspected&transmission&fuel&bodyType
     &sort=newest|price_asc|price_desc|closing_soon&cursor&limit=20
     → { data: ListingCard[], meta: { total, nextCursor, priceHistogram } }

GET  /listings/{ref}
     → { vehicle, listing, seller, images, inspection?, faqs[], marketPosition?, similar[] }
     ⚠ بلا reservePrice وبلا minAcceptPrice

GET  /brands            → شجرة الكتالوج المرئية (مخزّنة ٦٠ دقيقة)
GET  /models?brandId    → طرازات + الفئات المتاحة
GET  /trims/{id}        → القيَم الموروثة (لنموذج البيع)

POST /auth/otp/request  { phone }            → { challengeId, expiresIn }
POST /auth/otp/verify   { challengeId, code } → { token, user, isNew }
GET  /me                 → المستخدم + الحقول الناقصة قبل المعاملة
GET  /me/entitlements    → { can_auction, commission_pct, … }

POST /offers            { listingRef, amount }
GET  /me/offers?status
POST /offers/{id}/withdraw

POST /auctions/{id}/deposit
POST /auctions/{id}/bid { amount }
POST /auctions/{id}/buy-now
GET  /auctions?status=live|upcoming|ended&cursor

POST /orders            { listingRef, source }
GET  /me/orders?stage
POST /orders/{ref}/cancel { reason }

GET  /services
POST /service-requests  { serviceKey, vehicleId?, listingRef? }
GET  /me/service-requests

POST /reports           { targetType, targetId, reason, details?, attachments? }
POST /uploads/sign      { kind, contentType } → رابط R2 موقّع
GET  /ads?slots=a,b,c   → طلب واحد لكل شاشة، مخزّن ١٥ دقيقة
```

**قواعد الـAPI:**
- التصفّح: الويب بـ`page` (روابط قابلة للزحف للـSEO)، والتطبيق بـ`cursor`. الاستجابة تعيد الاثنين.
- كل `POST` يقبل `Idempotency-Key` — إلزامي للعروض والمزايدات والطلبات والدفع.
- تحديد المعدّل: OTP ٥/ساعة للرقم · المزايدة ١٠/دقيقة · البلاغات ٥/يوم.
- منطق العمل في `src/lib/domain/*` لا في المسارات — التطبيق سيستهلكه لاحقًا.

---

## 7. قواعد العمل الحرجة — اكتب اختبارًا لكل واحدة

| # | القاعدة | الاختبار |
|---|---|---|
| 1 | عرض دون `minAcceptPrice` يُرفض تلقائيًا مع إشعار | `offer.autoReject` |
| 2 | عرض واحد نشط لكل (مشتري، إعلان) | `offer.singleActive` |
| 3 | العرض يسقط بعد ٤٨ ساعة | `offer.expiry` |
| 4 | قبول عرض ⇒ إغلاق الباقي + سحب الإعلان + مهلة دفع ٢٤ ساعة | `offer.acceptCascade` |
| 5 | عدم الدفع في المهلة ⇒ إعادة نشر + إخطار المتقدّمين | `order.paymentTimeout` |
| 6 | المزايدة ≥ أعلى + `bidIncrement` | `bid.increment` |
| 7 | مزايدة في آخر دقيقة ⇒ تمديد ٥ دقائق (بحد أقصى معلن) | `auction.extend` |
| 8 | `reservePrice` لا يظهر ولا يُستنتج من نص | `auction.reserveHidden` |
| 9 | العربون: يُرد لغير الفائزين، يُخصم للفائز، يُصادَر عند الانسحاب | `deposit.lifecycle` |
| 10 | «اشترِ الآن» يختفي متى بلغت المزايدات الاحتياطي | `auction.buyNowGate` |
| 11 | العمولة لقطةً في الطلب — تعديل الباقة لا يمسّ القائم | `commission.snapshot` |
| 12 | الإفراج عن الضمان يحتاج موافقة عضوين | `escrow.dualApproval` |
| 13 | القيَم الموروثة تُنسخ وقت النشر لا تُقرأ لاحقًا | `listing.trimSnapshot` |
| 14 | طمس اللوحة تلقائي وغير قابل للتعطيل | `image.plateBlur` |
| 15 | تكرار صورة > ٩٠٪ ⇒ مراجعة لا رفض | `image.duplicateFlag` |
| 16 | الأسئلة الشائعة تتبع `listingType` والشرط | `faq.placement` |
| 17 | الإشعارات الحرجة غير قابلة للإيقاف | `notification.critical` |
| 18 | كل إجراء أدمن يكتب `AuditLog` | `audit.coverage` |

---

## 8. خريطة الشاشات → الملفات

### الويب
| التصميم | المسار | المكوّنات | معيار القبول |
|---|---|---|---|
| Wa الرئيسية | `/[locale]` | SiteHeader, LiveBar, HeroSearch, SummaryCards, BrandGrid, BodyTypeStrip, AuctionRail, CarCard, ServiceBanners, SiteFooter | البطاقات من `/listings` الحقيقي · شريط المزادات حيّ · CLS < 0.1 |
| Wb نتائج البحث | `/[locale]/cars` | FilterPanel, PriceHistogram, ActiveChips, Toolbar, CarCard/CarRow, SponsoredCard, Pagination | كل فلتر يعمل ويظهر كرقاقة · التاريخ في الـURL · الرقائق تطابق الفلاتر |
| Wc صفحة السيارة | `/[locale]/cars/[ref]` | Gallery, SpecTable, ScoreRing, PaintMap, HistoryList, BuyColumn, RangeBar, FaqAccordion, SimilarGrid | لا reservePrice في HTML · FAQ حسب النوع · JSON-LD Vehicle+FAQPage |
| Wd تقرير الفحص | `/[locale]/cars/[ref]/inspection` | ScoreRing, SectionAccordion, PaintMap, PhotoGrid | ٢١٠ نقطة من DB · تنزيل PDF |
| We المزاد | `/[locale]/auctions/[id]` | Countdown, BidPanel, BidLog, DepositSheet | WebSocket واحد · العدّاد محلي بمزامنة ٣٠ ثانية |
| Wk فهرس المزادات | `/[locale]/auctions` | AuctionCard, Tabs, SortControl | الترتيب يطابق التبويب المفعّل |
| Wf حساب المستخدم | `/[locale]/account` | StatBox, OrderList, Tabs | الحقول الناقصة بارزة |
| Wj صفحة الطلب | `/[locale]/account/orders/[ref]` | StageTracker, EscrowCard, DocList | المرحلة من DB · مدة البقاء محسوبة |
| Wl صندوق العروض | `/[locale]/account/offers` | OfferRow, VehicleSidebar | لا عرض مرفوض في «نشطة» |
| Wg صفحة المعرض | `/[locale]/dealers/[slug]` | DealerHeader, InventoryGrid, RatingSummary | — |
| Wh بِع سيارتك | `/[locale]/sell` | Stepper, VinLookup, ManualEntry, ImageUploader, PriceAdvisor, RangeBar | الجلب يفشل ⇒ إدخال يدوي · الصور تُطمس قبل الحفظ |
| Wi دليل الخدمات | `/[locale]/services` | ServiceCard, CategoryTabs | من DB لا ثابت |
| Wm الدخول | `/[locale]/auth` | PhoneInput, OtpInput | ٥/ساعة · لا تسريب وجود الحساب |
| Wn–Wp | `/[locale]/help`, `/legal/*`, `/plates` | Accordion, DocPage, PlateBadge | — |

### الأدمن
| التصميم | المسار | معيار القبول |
|---|---|---|
| A1 نمو وأعداد | `/admin` | كل رقم من DB · لا رقم ثابت |
| A2 تشغيلية | `/admin/ops` | مؤشّرات المراحل بخط هدف |
| A3 مالية | `/admin/finance` | الضريبة مضمَّنة ١٥/١١٥ |
| A4 الطلبات | `/admin/orders` | مدة البقاء + تنبيه تجاوز الضعف |
| A5 العملاء | `/admin/users` | الهوية خلف صلاحية + كل اطّلاع مسجَّل |
| A6 طلبات الخدمات | `/admin/service-requests` | المهلة المتجاوزة بارزة |
| A7 الخدمات وأسعارها | `/admin/services` | تغيير السعر لا يمسّ القائم |
| A8 الإشعارات والقوالب | `/admin/notifications` | متغيّر غير مُصرَّح يمنع الحفظ |
| A9 الحملات | `/admin/campaigns` | الشريحة تُحسب وقت الإرسال |
| A10 إشعارات الدفع | `/admin/push` | الحرجة غير قابلة للإيقاف |
| A11 التكاملات | `/admin/integrations` | المفاتيح مشفّرة ولا تُعرض · تدوير بعضوين |
| A12 البراندات | `/admin/catalog/brands` | الاسمان إلزاميان |
| A13 الطرازات والفئات | `/admin/catalog/models` | الشجرة الثلاثية |
| A14 محرّر الفئة | `/admin/catalog/trims/[id]` | التعديل لا يمسّ المنشور |

---

## 9. البيانات الأولية (Seed) — لا تبنِ بلا هذا

`prisma/seed.ts` يزرع: **٤٢ ماركة** بالاسمين · **٦١٨ طرازًا** · **٢٬١٤٦ فئة** بالقيَم الموروثة (ابدأ بعشر ماركات كاملة والبقية أسماء) · ٣ حسابات أدمن بالأدوار · باقة واحدة مجانية بعمولة ٠٪ · ٩ خدمات بأسعارها · ٣٨ قالب إشعار · ٧ مساحات إعلانية · ٢٤ سؤالًا شائعًا بمواضعها · **٦٠ إعلانًا واقعيًا** موزّعًا على الأنواع والمدن والحالات · ٣ مزادات (جارٍ، قادم، منتهٍ) · ١٢ طلبًا في مراحل مختلفة · تقريرَي فحص كاملين.

**لماذا:** لا يمكن الحكم على صفحة نتائج البحث بأربعة إعلانات. الشاشات صُمِّمت على كثافة حقيقية.

---

## 10. تسلسل المهام — واحدة في كل جلسة مع Claude Code

كل مهمة تُقاس بمعيار قبول واحد قابل للفحص. **لا تنتقل قبل أن تمرّ.**

**الأساس (١–٦)**
1. المشروع: Next+TS+Tailwind+توكنات القسم ٣ + خطوط + RTL/LTR. القبول: صفحة فارغة بلونَي الخلفية والخط الصحيح في اللغتين.
2. Prisma + مخطط القسم ٥ كاملًا + ترحيل أول. القبول: `prisma studio` يفتح كل الجداول.
3. Seed القسم ٩. القبول: ٦٠ إعلانًا و٤٢ ماركة في DB.
4. مكوّنات `ui/` القسم ٤ + صفحة `/dev/ui`. القبول: كل حالات كل مكوّن معروضة ومطابقة للتصميم.
5. المصادقة OTP + `/me` + تحديد المعدّل. القبول: دخول برقم وهمي، ٦ محاولات ⇒ حظر.
6. AdminShell + تسجيل دخول الأدمن + الأدوار. القبول: OPS لا يرى المالية.

**الكتالوج (٧–٩)** ← يجب أن يسبق كل شيء
7. A12 البراندات — CRUD + شعار إلى R2.
8. A13 الطرازات والفئات — الشجرة + CRUD.
9. A14 محرّر الفئة + `GET /trims/{id}`. القبول: اختيار كامري LE يعيد سيدان/أوتوماتيك/بنزين/FWD/٥.

**الويب العام (١٠–١٥)**
10. Wb نتائج البحث + `GET /listings` بكل الفلاتر. القبول: كل فلتر يغيّر النتيجة ويظهر كرقاقة، والـURL قابل للمشاركة.
11. Wc صفحة السيارة + FAQ + JSON-LD. القبول: بحث نصّي في HTML عن `reserve` يعيد صفرًا.
12. Wa الرئيسية بالبيانات الحقيقية.
13. Wd تقرير الفحص.
14. Wi الخدمات + Wn المساعدة + Wo القانونية.
15. Wm الدخول + Wf الحساب.

**المعاملات (١٦–٢٠)**
16. Wh بِع سيارتك: خطوات + رفع صور + طمس اللوحة + pHash. القبول: صورة بلوحة تُحفظ مطموسة.
17. العروض: إنشاء، مقابل، قبول، سحب + القواعد ١–٥. القبول: اختبارات القسم ٧ تمرّ.
18. الطلبات والمراحل الستة + Wj + الضمان (وهمي أولًا).
19. المزاد: We + Wk + WebSocket + العربون + القواعد ٦–١٠.
20. Wl صندوق العروض + البلاغات.

**الأدمن (٢١–٢٦)**
21. A4 الطلبات + A2 التشغيلية.
22. A5 العملاء + صلاحية الهوية + سجل الاطّلاع.
23. A6 + A7 الخدمات.
24. A3 المالية + A8 الإشعارات.
25. A1 لوحة القيادة + A11 التكاملات.
26. A9 + A10 (هياكل تُفعَّل مع التطبيق).

**الإطلاق (٢٧–٣٠)**
27. الدفع الحقيقي + الضمان + 3DS.
28. Sentry + السجلّات + النسخ الاحتياطي + لوحة صحّة التكاملات.
29. الأداء: Lighthouse ≥ ٩٠ على Wa/Wb/Wc · صور R2 بثلاثة مقاسات · ISR للكتالوج.
30. مراجعة بصرية: كل شاشة جنبًا إلى جنب مع بطاقة التصميم برقمها.

---

## 11. كيف تكتب المهمة لـ Claude Code

الصق هذا القالب حرفيًا في كل جلسة، جلسة واحدة لكل مهمة:

```
اقرأ BUILD-WEB-ADMIN.md كاملًا و HANDOFF.md الأقسام 12 و16 و18.
مرجع التصميم: <اسم الملف>.dc.html — الشاشة <المعرّف>. افتحها واقرأ ترميزها.

المهمة: <رقم واسم المهمة من القسم 10>

قيود إلزامية:
- استخدم مكوّنات src/components/ui/ الموجودة. إن نقص مكوّن، أضِفه هناك أولًا مع حالاته، ثم استخدمه.
- ممنوع لون أو مسافة أو ظل مكتوب — توكنات القسم 3 فقط.
- كل رقم بـ font-num، والعرض بالأرقام العربية-الهندية.
- الفصل بالخطوط لا بالظلال.
- ممنوع any. ممنوع مكتبة UI جاهزة. ممنوع بيانات ثابتة — كل شيء من Prisma.
- منطق العمل في src/lib/domain/ لا في مسار الـAPI.

معيار القبول: <من جدول القسم 8 أو 10>
عند الانتهاء: شغّل الاختبارات، اعرض لقطة الشاشة، واذكر أي انحراف عن التصميم وسببه.
لا تبدأ مهمة أخرى.
```

**ثلاث عادات تُنجيك:**
1. **جلسة = مهمة واحدة.** الجلسة الطويلة تفقد السياق فتبدأ بالتأليف.
2. **افحص بصريًا بعد كل مهمة.** افتح الشاشة وبطاقة التصميم جنبًا إلى جنب. الانحراف الصغير يتراكم.
3. **التزم بـ commit لكل مهمة** برسالة `task-14: Wd inspection report`. فترجع بسهولة.

---

## 11-ب. بروتوكول التعاون مع المصمّم


مصمّم هذا المنتج ليس متاحًا في هذه الجلسة، لكنه يراجع أسئلتك. المستخدم هو الوسيط: ينسخ سؤالك إليه، وينسخ الجواب إليك.

### متى تسأل — وفقط في هذه الحالات
1. **تعارض** بين شاشتين في التصميم، أو بين التصميم والمواصفة.
2. **حالة غير مصمَّمة** يفرضها المنطق: خطأ، قائمة فارغة، صلاحية مرفوضة، نص طويل يكسر التخطيط، شاشة صغيرة.
3. **قاعدة عمل غامضة** يترتّب على تأويلها أثر مالي أو قانوني (عمولة، ضمان، إلغاء، عربون، ضريبة).
4. **عنصر ناقص** تحتاجه شاشة ولا وجود له في التصميم ولا في مكتبة المكوّنات.
5. **تنازل بصري مفروض تقنيًا** — لا يمكن تحقيق التصميم كما هو، ولديك بديل تقترحه.

### متى لا تسأل — قرّر بنفسك وسجّل قرارك
- تسمية متغيّر أو ملف أو دالة.
- ترتيب الاستعلامات، الفهارس، التخزين المؤقت.
- بنية المجلدات داخل ما هو محدَّد.
- تفاصيل الاختبارات.
- أي شيء جوابه موجود في المواصفة أو في التصميم — **اقرأ قبل أن تسأل**.

### صيغة السؤال — التزم بها حرفيًا

```
━━━ سؤال للمصمّم ━━━
المهمة: <رقم واسم المهمة>
الشاشة: <المعرّف> في <اسم ملف التصميم>

السياق:
<سطران: ما الذي تبنيه وأين توقّفت>

السؤال:
<سؤال واحد محدَّد — لا أسئلة متعدّدة في بلاغ واحد>

ما وجدته في التصميم:
<ما رأيته فعلًا، أو "لا يوجد">

اقتراحي:
<حلّك المقترح ولماذا — لا تسأل بلا اقتراح>

الأثر إن لم يُجَب:
<ما ستفعله للاستمرار مؤقتًا، وهل سيحتاج إعادة عمل>
━━━━━━━━━━━━━━━━━
```

### قواعد
- **لا تتوقّف انتظارًا للجواب.** نفّذ اقتراحك، وضع تعليق `// DESIGN-Q: <ملخّص>` في مكانه، وأكمل. عند وصول الجواب، عدّل واحذف التعليق.
- **بلاغ واحد لكل سؤال.** لا تكدّس ثلاثة أسئلة في نصّ واحد.
- **راكِم الأسئلة الصغيرة** واعرضها دفعة في نهاية المهمة. لا تقطع العمل لسؤال ثانوي.
- **سجّل كل سؤال وجوابه** في `docs/DESIGN-DECISIONS.md` بالتاريخ والمهمة — هذا الملف يصير مرجعًا يمنع تكرار السؤال نفسه.
- إن جاءك جواب يخالف اقتراحك، **طبّقه بلا جدال** وسجّله.

---

## 12. النشر على Coolify — خطوة بخطوة

**قبل أي شيء:** مستودع GitHub خاص، فرعان `main` (إنتاج) و`staging`.

**على الـVPS:**
1. Coolify مثبَّت، ونطاقك موجّه إليه (A record).
2. أنشئ **Project** باسم `carsell` وبيئتين: `staging` و`production`.
3. أضف **Postgres 16** كـ Service في كل بيئة. سجّل `DATABASE_URL`.
4. أضف **Redis** (للتخزين المؤقت وتحديد المعدّل).
5. أضف **Application** من GitHub، Build Pack = `Dockerfile` (لا Nixpacks — أوضح وأثبت).
6. النطاقات: `carsell.one` للإنتاج و`staging.carsell.one` — Coolify يصدر شهادة Let's Encrypt تلقائيًا.
7. متغيّرات البيئة (القسم ١٣) في كل بيئة على حدة. المفاتيح الحقيقية في الإنتاج فقط.
8. Health Check: `/api/health` يعيد ٢٠٠ بعد اتصال DB.
9. `prisma migrate deploy` في أمر ما قبل التشغيل — **لا** `db push` في الإنتاج أبدًا.
10. النسخ الاحتياطي: نسخة Postgres يومية إلى R2 مع الاحتفاظ ٣٠ يومًا. **جرّب الاستعادة مرة قبل الإطلاق** — النسخة غير المُجرَّبة ليست نسخة.

`Dockerfile` (متعدّد المراحل، standalone):
```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json prisma ./
RUN npm ci && npx prisma generate

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 3000
CMD ["node","server.js"]
```
`next.config.ts`: `output: 'standalone'`.

**ترتيب النشر في كل مرة:** ادفع إلى `staging` → افحص بصريًا → شغّل الاختبارات → ادمج في `main`. لا تدفع إلى `main` مباشرة ولو كان التغيير سطرًا.

**الانتقال إلى Google Cloud لاحقًا:** لأنك على Docker + Postgres مُدار، الانتقال = Cloud Run للتطبيق + Cloud SQL لقاعدة البيانات + نفس R2 (أو GCS). لا تغيير في الكود. **الشرط الوحيد:** لا تكتب شيئًا على قرص الحاوية — كل ملف إلى R2. التزم بهذا من اليوم الأول وسيكون الانتقال يومًا واحدًا.

---

## 13. متغيّرات البيئة

```
DATABASE_URL=
REDIS_URL=
APP_URL=https://carsell.one
JWT_SECRET=                 # 32 بايت عشوائي
OTP_PEPPER=

R2_ACCOUNT_ID= R2_ACCESS_KEY_ID= R2_SECRET_ACCESS_KEY=
R2_BUCKET=carsell-media R2_PUBLIC_URL=

RESEND_API_KEY= MAIL_FROM="CarSell <no-reply@carsell.one>"
SMS_PROVIDER_KEY= SMS_SENDER_ID=

PAYMENT_PUBLIC_KEY= PAYMENT_SECRET_KEY= PAYMENT_WEBHOOK_SECRET=

SENTRY_DSN= SENTRY_ENVIRONMENT=

VIN_LOOKUP_URL= VIN_LOOKUP_KEY=
MOJAZ_API_URL= MOJAZ_API_KEY=

FEATURE_AI_PRICING=false
FEATURE_NL_SEARCH=false
FEATURE_ADS=true
```

لا سرّ في المستودع. `.env.example` بأسماء فقط.

---

## 14. بوابة الجودة — لا يُدمج شيء بلا هذه

1. `tsc --noEmit` بلا أخطاء · `eslint` بلا تحذيرات.
2. اختبارات القسم ٧ كلها تمرّ.
3. اختبار يفشل إن ظهر `reservePrice` أو `minAcceptPrice` في استجابة عامة.
4. لا لون سادس عشري في `src/components` و`src/app` (فحص regex في CI).
5. لا رقم Latin يسبق كلمة عربية في نص الواجهة (فحص regex — نفس الخطأ الذي وقع في لوحة التاجر).
6. Lighthouse ≥ ٩٠ (Performance + Accessibility) على Wa وWb وWc.
7. لقطة الشاشة مقابل بطاقة التصميم مرفقة في وصف الـPR.

---

## 15. الأخطاء التي ستقع فيها — وكيف تتجنّبها

| الخطأ | الأثر | الوقاية |
|---|---|---|
| خلط `Vehicle` و`Listing` | فقدان المركبة بانتهاء الإعلان | كيانان منفصلان من اليوم الأول |
| قراءة `Trim` وقت العرض | تغيير الكتالوج يعبث بإعلانات قديمة | لقطة عند النشر |
| `Float` للأموال | فروق هللات لا تُفسَّر | `Decimal` دائمًا |
| `reservePrice` في الاستجابة | انكشاف تجاري | اختبار إلزامي |
| بناء شاشة قبل مكوّنات `ui/` | كل شاشة بمظهر مختلف | المهمة ٤ قبل ١٠ |
| بيانات ثابتة «مؤقتة» | تبقى للأبد وتكذب | Seed أولًا |
| جلسة Claude Code طويلة | يؤلّف ويكسر ما بُني | جلسة = مهمة |
| `db push` في الإنتاج | فقدان بيانات | `migrate deploy` فقط |
| كتابة ملفات على قرص الحاوية | تفقد الملفات كل نشر ويصعب الانتقال | R2 دائمًا |
| نسخ احتياطي غير مُجرَّب | كارثة صامتة | جرّب الاستعادة قبل الإطلاق |

---

## 16. أول أسبوعين — خطة يومية واقعية

**الأسبوع ١:** المهام ١–٦ (الأساس). يومان للمكوّنات وحدها — لا تستعجلها، هي ٧٠٪ من جودة النتيجة.
**الأسبوع ٢:** المهام ٧–١٢ (الكتالوج + أهم ثلاث صفحات ويب). في نهايته يجب أن ترى موقعًا حقيقيًا يتصفّح بيانات حقيقية.

ثم أرسل لي ما بنيت لأراجعه مقابل التصميم قبل أن تكمل.
