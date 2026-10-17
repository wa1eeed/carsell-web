/**
 * البيانات الأولية — BUILD-WEB-ADMIN.md القسم ٩.
 *
 * لماذا هذا الحجم: لا يمكن الحكم على صفحة نتائج البحث بأربعة إعلانات.
 * الشاشات صُمِّمت على كثافة حقيقية، فالزرع يبني كثافة حقيقية.
 *
 * السكربت **حتمي**: نفس المدخلات تعطي نفس المخرجات في كل تشغيل
 * (مولّد أرقام ببذرة ثابتة، ولا `Date.now()` ولا `Math.random`).
 * وهو **يمسح ويعيد البناء**، فلا يعمل إلا في تطوير أو staging.
 *
 * التشغيل: npm run db:seed
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { devPut, devStoreAllowed } from '../src/lib/storage/dev-store';
import { placeholderPng } from './placeholder-image';
import { hashPassword } from '../src/lib/auth/password';
import { encryptSecret } from '../src/lib/crypto/secrets';
import { Prisma } from '../src/generated/prisma/client';
import type {
  BodyType,
  Drivetrain,
  FeatureGroup,
  FuelType,
  ProviderType,
  ServiceCategory,
  Transmission,
} from '../src/generated/prisma/enums';

try {
  process.loadEnvFile();
} catch {
  // المتغيّرات من البيئة نفسها
}

// ═══════════════════════════════════════════════════════════
//  الحارس — لا زرع في الإنتاج بأي حال
// ═══════════════════════════════════════════════════════════

const APP_ENV = process.env.APP_ENV ?? 'development';

if (APP_ENV === 'production') {
  console.error(
    [
      '',
      '✗ رُفض التشغيل: APP_ENV=production',
      '',
      '  سكربت الزرع يمسح كل الجداول ويعيد بناءها ببيانات وهمية.',
      '  تشغيله على الإنتاج يعني فقدان بيانات حقيقية لا تُستعاد.',
      '',
      '  الإنتاج يُرحَّل بـ`prisma migrate deploy` فقط — لا زرع ولا `db push`.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString === '') {
  console.error('✗ DATABASE_URL غير مضبوط — راجع .env.example');
  process.exit(1);
}

/**
 * ═══ ووحدةُ الدفتر تُحمَّل كسولًا ═══
 *
 * `ledger-events` تجرّ `ledger.ts` التي تبني عميل التطبيق **وقت
 * تحميل الوحدة**، وهو يقرأ `DATABASE_URL` عندها. والبذرة تُحمّل
 * بيئتها بنفسها في أعلى الملفّ — لكنّ استيرادًا ساكنًا يسبقها،
 * فيسقط الزرع بـ«DATABASE_URL غير مضبوط» وهو مضبوط.
 */
type LedgerEvents = Awaited<ReturnType<typeof loadLedger>>;
const loadLedger = () => import('../src/lib/domain/ledger-events');

type Documents = Awaited<ReturnType<typeof loadDocuments>>;
const loadDocuments = () => import('../src/lib/domain/documents');

let documentsModule: Documents | null = null;
async function documents(): Promise<Documents> {
  documentsModule ??= await loadDocuments();
  return documentsModule;
}

let ledgerModule: LedgerEvents | null = null;
async function ledgerEvents(): Promise<LedgerEvents> {
  ledgerModule ??= await loadLedger();
  return ledgerModule;
}

/** **وأرقامُ الطلب تُحسب بحاسبة المنتج** — ولو زُرعت بيدٍ ناقضت قاعدةَ العمولة. */
type Amounts = Awaited<ReturnType<typeof loadAmounts>>;
const loadAmounts = () => import('../src/lib/domain/order-amounts');

let amountsModule: Amounts | null = null;
async function computeOrderAmounts(
  ...args: Parameters<Amounts['computeOrderAmounts']>
): ReturnType<Amounts['computeOrderAmounts']> {
  amountsModule ??= await loadAmounts();
  return amountsModule.computeOrderAmounts(...args);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
  log: ['error'],
});

const D = Prisma.Decimal;

/**
 * بصمة إدراكية مزروعة — **متباعدةٌ عن غيرها فعلًا**.
 *
 * كانت `${ref}-${n}`، فتختلف بصمتان بحرفٍ واحد ومسافة هامينغ بينهما ١
 * — والحدّ ٦. **فكل صورة مزروعة نسخةٌ من كل أخرى**، وأيّ إعلان جديد
 * يُحال إلى المراجعة بتهمة التكرار. وليست هذه علّة اختبار: هي حالُ
 * المنتج على هذه البيانات.
 *
 * والبصمة الحقيقية ستّ عشرة خانة سداسية عشرية (٦٤ بت). فتُولَّد هنا
 * بتجزئةٍ ثابتة — تتكرّر مع كل زرع، وتتباعد فيما بينها.
 */
function seedPhash(ref: string, index: number): string {
  const seed = `${ref}#${String(index)}`;
  let hash = 0x811c9dc5;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  // ستّ عشرة خانة من أربع جولات — فتتوزّع البتّات ولا تتشابه الرؤوس
  let out = '';
  for (let round = 0; round < 4; round += 1) {
    hash = Math.imul(hash ^ (hash >>> 15), 0x2545f491) >>> 0;
    out += hash.toString(16).padStart(8, '0').slice(0, 4);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════
//  أدوات حتمية
// ═══════════════════════════════════════════════════════════

/** mulberry32 — مولّد ببذرة ثابتة، فالزرع يعيد نفس النتيجة دائمًا. */
function makeRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = makeRandom(20260802);
const pick = <T,>(items: readonly T[]): T =>
  items[Math.floor(rnd() * items.length)] as T;
const between = (min: number, max: number): number =>
  Math.floor(rnd() * (max - min + 1)) + min;

/** لحظة مرجعية ثابتة — التخزين UTC والعرض بتوقيت الرياض في الواجهة. */
/**
 * ═══ لحظة البذرة — اليوم لا تاريخ مكتوب ═══
 *
 * كانت مثبتة على يوم كُتبت فيه، **فكل ما تزرعه يشيخ يومًا كل يوم**.
 * ومضى عليها شهران، فصار كل ما في المنصة أقدم من سبعين يومًا — وكل
 * شاشة تقيس «آخر ثلاثين يومًا» تُعرض أصفارًا.
 *
 * ولا شيء يسقط: البيانات صحيحة والاستعلام صحيح، **والمدى وحده خارجها**.
 * ومن يفتح لوحة القيادة يقرأ منصة ميتة وهي عامرة.
 *
 * فاللحظة اليوم عند التاسعة — **حتمية داخل اليوم الواحد** فلا يتغير
 * الزرع بين تشغيلين متتابعين، وتتحرك مع الأيام فلا تشيخ.
 * و`SEED_NOW` تثبّتها لمن يحتاج زرعًا مطابقًا لزرع سابق.
 */
const NOW = (() => {
  const fixed = process.env.SEED_NOW;
  if (fixed !== undefined && fixed !== '') return new Date(fixed);
  const today = new Date();
  today.setUTCHours(9, 0, 0, 0);
  return today;
})();
const days = (n: number): Date => new Date(NOW.getTime() + n * 86_400_000);

/**
 * ═══ والمزاد الحيّ يُقاس بالساعة الحقيقية لا بالمرساة ═══
 *
 * `NOW` مثبَّتةٌ عند التاسعة صباحًا UTC ليستقرّ ما يُزرع. **ونافذةُ
 * المزاد الحيّ لا تحتمل ذلك**: `hours(-6)` تساوي الثالثة فجرًا، فبذرةٌ
 * تُشغَّل قبلها تكتب `LIVE` ببدايةٍ **في المستقبل**؛ و`hours(2)` تساوي
 * الحادية عشرة، فبذرةٌ بعدها تكتب `LIVE` بنهايةٍ **منقضية**.
 *
 * وفي الحالين صفٌّ متناقض: الشاشة تحسبه غير حيٍّ (بحقّ) وحالتُه تقول
 * `LIVE` — فيسقط اختبارٌ لا علاقة له بما غُيّر، ويبدو تقطّعًا وهو
 * ساعةُ التشغيل. و`SEED_NOW` تظلّ مُطاعة فيبقى الزرع قابلًا للتثبيت.
 */
const REAL_NOW = (() => {
  const fixed = process.env.SEED_NOW;
  return fixed !== undefined && fixed !== '' ? new Date(fixed) : new Date();
})();
const realHours = (n: number): Date => new Date(REAL_NOW.getTime() + n * 3_600_000);
const hours = (n: number): Date => new Date(NOW.getTime() + n * 3_600_000);

const CITIES = [
  'الرياض',
  'جدة',
  'الدمام',
  'مكة المكرمة',
  'المدينة المنورة',
  'الخبر',
  'أبها',
  'تبوك',
] as const;

const COLORS = [
  'أبيض',
  'أسود',
  'فضّي',
  'رمادي',
  'أزرق',
  'بني',
  'أحمر',
] as const;

const SEED_DIR = join(process.cwd(), 'prisma', 'seed-data');
const load = <T,>(name: string): T =>
  JSON.parse(readFileSync(join(SEED_DIR, name), 'utf8')) as T;

// ═══════════════════════════════════════════════════════════
//  أنواع ملفات البيانات
// ═══════════════════════════════════════════════════════════

type FeatureRow = {
  key: string;
  nameAr: string;
  nameEn: string;
  group: FeatureGroup;
  sort: number;
  active: boolean;
  placements: string[];
};

type TrimRow = {
  nameAr: string;
  nameEn: string;
  bodyType: BodyType;
  transmission: Transmission;
  fuel: FuelType;
  drivetrain: Drivetrain;
  seats: number;
  doors: number;
  engineL: number | null;
  cylinders: number | null;
  horsepower: number | null;
  yearFrom: number;
  yearTo: number | null;
};

type ModelRow = {
  nameAr: string;
  nameEn: string;
  yearFrom: number;
  yearTo: number | null;
  bodyType: BodyType;
  visible: boolean;
  trims: TrimRow[];
};

type BrandRow = {
  slug: string;
  nameAr: string;
  nameEn: string;
  sort: number;
  visible: boolean;
  models: ModelRow[];
};

type ServiceRow = {
  key: string;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  /** بنودُ ما تشمله الخدمة — تُعرض قبل الدفع (Wx). */
  includesAr: string[];
  includesEn: string[];
  price: string;
  category: ServiceCategory;
  isAutomated: boolean;
  slaHours: number | null;
  placements: string[];
  sort: number;
  providerType: ProviderType | null;
};

type TaxRuleRow = {
  sellerType: string | null;
  buyerType: string | null;
  supplyType: string;
  taxableBase: string;
  ratePct: string | null;
  supplierIsPlatform: boolean;
  invoiceIssuer: string;
  active: boolean;
  note: string;
};

type GatewayRow = {
  key: string;
  nameAr: string;
  nameEn: string;
  status: string;
  sort: number;
  capabilities: Prisma.InputJsonValue;
};

type PushChannelRow = {
  key: string;
  nameAr: string;
  userControllable: boolean;
  defaultOn: boolean;
  sort: number;
};

type AdSlotRow = {
  key: string;
  nameAr: string;
  width: number;
  height: number;
  pricingModel: string;
  basePrice: string;
  maxPerSession: number;
};

type FaqPlacementRow = {
  surface: string;
  listingType: 'DIRECT' | 'NEGOTIATION' | 'AUCTION' | null;
  condition: Record<string, unknown> | null;
};

type FaqRow = {
  /** هويّةٌ ثابتة لمن يحتاجها — والترشيحُ بالنصّ هشّ */
  key?: string;
  questionAr: string;
  questionEn: string;
  answerAr: string;
  answerEn: string;
  category: string;
  sort: number;
  placements: FaqPlacementRow[];
};

type TemplateRow = {
  key: string;
  subjectAr: string;
  subjectEn: string;
  bodyAr: string;
  bodyEn: string;
  smsAr: string | null;
  smsEn: string | null;
  priority: string;
  channelEmail: boolean;
  channelSms: boolean;
  channelPush: boolean;
  channelInApp: boolean;
  variables: string[];
  active: boolean;
  /** موضوعُ الإشعار — وبه يُوصَل بمفتاح المستخدم. و`null` يصل دائمًا. */
  pushChannelKey: string | null;
};

// ═══════════════════════════════════════════════════════════
//  المسح — بترتيب يحترم المفاتيح الأجنبية
// ═══════════════════════════════════════════════════════════

async function reset(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "CreditNote","TaxInvoiceLine","TaxInvoice","TaxRule",
      "VehicleSaleAgreement","SettlementStatement",
      "PaymentEvent","Payment","PaymentRouteChange","PaymentRoute","PaymentGateway",
      "DeviceToken","NotificationPreference","PushChannel","CampaignSend","Campaign","Segment",
      "ApprovalRequest","AuditLog","Report","PriceStat","SeoTemplate","Integration",
      "AdCampaign","AdSlot","NotificationTemplate","FaqPlacement","FaqItem",
      "SavedSearch","Favorite","FinanceInput","CommissionRule","PlatformSetting",
      "Subscription","PlanEntitlement","Entitlement","Plan","EntitlementOverride",
      "FinanceSetting","FinanceProvider","InspectionReport","ServiceRequest","Service",
      "ServiceProvider","Invoice","Dispute","Escrow","OrderEvent","Order",
      "Deposit","Bid","Auction","Offer","ListingFeature","ListingImage","Listing",
      "VehicleHistoryItem","Vehicle","TrimFeature","Feature","Trim","Model","Brand",
      "OtpChallenge","AdminUser","User","Dealer",
      -- **والدفتر ليس له مفتاحٌ خارجيّ إلى الطلب، فلا يُفرَّغ بالتعاقب.**
      -- فكان يتراكم عبر كل تشغيل اختبار ولا يُمسح أبدًا: قرأتُ فيه
      -- ٢٠٧٬٧٥٠ «لدى مزوّد الدفع» والمال الفعليّ ٣٤٤٬٥٧٠ — ورقمٌ في
      -- دفترٍ لا يطابق ما في الصناديق ليس خطأ عرضٍ بل دفترٌ غير موثوق.
      "LedgerEntry"
    RESTART IDENTITY CASCADE;
  `);
}

// ═══════════════════════════════════════════════════════════
//  الزرع
// ═══════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log(`زرع البيانات الأولية · APP_ENV=${APP_ENV}`);
  await reset();

  // ————— إعدادات المنصة —————
  /**
   * ═══ وقنوات الدعم تُزرع ═══
   *
   * صفحة «تواصل معنا» تقرأ هذه الثلاثة، فبيئةٌ بلا قيمة فيها تعرض
   * «غير مضبوطة بعد» — وهي الحال التي بقيت عليها منذ بُنيت الصفحة.
   *
   * **والبريد وحده قيمةٌ رسمية**: الجوال افتراضيٌّ يُضبط من
   * `/admin/contact`، فرقمٌ في الشيفرة يبقى بعد أن يتغيّر.
   */
  await prisma.platformSetting.create({
    data: {
      id: 'default',
      transferFee: new D('350.00'),
      vatPct: new D('15.00'),
      supportEmail: 'info@carz.sa',
    },
  });
  await prisma.financeSetting.create({
    data: {
      id: 'default',
      downPaymentPct: new D('20.00'),
      months: 60,
      profitRatePct: new D('4.75'),
      minPrice: new D('30000.00'),
    },
  });

  // ————— الخصائص والباقة المجانية بعمولة صفر —————
  const ENTITLEMENTS = [
    ['can_direct_sale', 'bool', 'true', 'إتاحة البيع المباشر'],
    ['can_negotiate', 'bool', 'true', 'إتاحة التفاوض بالعروض'],
    ['can_auction', 'bool', 'true', 'إتاحة إنشاء مزاد'],
    /**
     * **بلا حدّ — ‏`-1`‎ — لأن لا شيء يفرض حدًّا اليوم.**
     *
     * كانت `10`، ولا مسار يقرؤها: فالشاشة تقول «السقف عشرة» والمنتج
     * يقبل المئة. والنصّ المعروض وعدٌ لا وصف — فإمّا يُفرَض السقف وإمّا
     * يُقال إنه بلا حدّ. والتصميم (A29) يقول «بلا حد» في الباقات الثلاث.
     */
    ['max_active_listings', 'int', '-1', 'سقف الإعلانات النشطة'],
    ['featured_slots', 'int', '0', 'عدد مرات التمييز المجانية'],
    ['bulk_upload', 'bool', 'false', 'الرفع الجماعي — لوحة التاجر'],
    ['team_seats', 'int', '0', 'مقاعد فريق المعرض'],
    ['commission_pct', 'percent', '0', 'نسبة العمولة'],
    ['deposit_required', 'bool', 'true', 'اشتراط العربون للمزايدة'],
    ['priority_support', 'bool', 'false', 'دعم ذو أولوية'],
  ] as const;

  await prisma.entitlement.createMany({
    data: ENTITLEMENTS.map(([key, type, defaultValue, description]) => ({
      key,
      type,
      defaultValue,
      description,
    })),
  });

  const freePlan = await prisma.plan.create({
    data: {
      key: 'free',
      nameAr: 'الأساسية',
      nameEn: 'Basic',
      price: new D('0.00'),
      billingCycle: 'monthly',
      visible: true,
      entitlements: {
        create: ENTITLEMENTS.map(([key, , defaultValue]) => ({
          entitlementKey: key,
          value: defaultValue,
        })),
      },
    },
  });

  /**
   * ═══ باقتا المعارض — **مجانيّتان اليوم** ═══
   *
   * التصميم (A29) يكتبها حرفيًّا: «٣ باقات · كلها مجانية اليوم».
   * والسعر صفرٌ **قرارًا لا نسيانًا**: من يزرع منصّةً لا يعرف بعد كم
   * يأخذ، ورقمٌ مزروع يُنتج اشتراكًا بسعرٍ لم يقرّره أحد.
   *
   * وما يفرّقها ليس السعر بل **قيَم خصائصها**: المقاعد والتمييز والرفع
   * الجماعي — والكود يسأل عن الخاصّية لا عن الباقة.
   */
  const DEALER_PLANS = [
    ['dealer', 'معرض', 'Dealer', { team_seats: '5', featured_slots: '2' }],
    [
      'dealer_pro',
      'معرض احترافي',
      'Dealer Pro',
      { team_seats: '8', featured_slots: '6', bulk_upload: 'true', priority_support: 'true' },
    ],
  ] as const;

  await Promise.all(
    DEALER_PLANS.map(([key, nameAr, nameEn, overrides]) =>
      prisma.plan.create({
        data: {
          key,
          nameAr,
          nameEn,
          price: new D('0.00'),
          billingCycle: 'monthly',
          visible: true,
          entitlements: {
            create: ENTITLEMENTS.map(([entitlementKey, , defaultValue]) => ({
              entitlementKey,
              value:
                (overrides as Record<string, string | undefined>)[entitlementKey] ?? defaultValue,
            })),
          },
        },
      }),
    ),
  );

  /**
   * ═══ قاعدةٌ لكل طرف — صفرٌ خارج التطوير ═══
   *
   * **الصفر افتراضٌ لا نسيان**: من يزرع منصّةً لا يعرف بعد كم يأخذ،
   * ونسبةٌ مزروعة تُنتج فواتير برقمٍ لم يقرّره أحد. والصفّان يوجدان
   * كي تجدهما شاشة الأدمن فتُعدَّلا بضغطة — لا لتُنشأ من عدم.
   * وتأكّد (٢٠٢٦-١٠-١٧): «نسبة العمولة تُضبط من إعدادات الأدمن
   * حيث يمكن تغييرها متى أردنا، وليست مزروعة داخل الكود».
   *
   * ═══ **وفي التطوير لا** ═══
   *
   * صفرٌ **يُخفي كلَّ عطبٍ في مسار العمولة**: صفرٌ من أيّ أساسٍ صفر،
   * ومن أيّ طرفٍ صفر، وبأيّ قاعدةٍ صفر. فعاشت ثلاثُ فجوات شهورًا —
   * نسخةٌ ثالثة من القاعدة، وأساسٌ هو السعر المطلوب لا المزايدة
   * المعروضة، وقاعدةٌ تُنتقى بلا طرفٍ ولا `enabled` فتُقتبَس
   * للمشتري عمولةُ البائع. **ولم يكشفها اختبار؛ كشفها ضبطُ نسبةٍ
   * حقيقية من اللوحة.**
   *
   * فبيئةُ التطوير تُزرع بنسبةٍ عاملة — **وما لا يُزرع لا يُرى**.
   * وما عداها صفرٌ حتى يقرّر المالك.
   *
   * وعمولة المشتري **معطَّلة** في الحالين، فالسلوك الافتراضيّ أن يدفع
   * السعر ورسم النقل وحدهما.
   */
  /**
   * ═══ **وعلى المشتري لا على البائع** ═══
   *
   * قرار المالك (٢٠٢٦-١٠-١٧): «يتحمّلها المشتري». وهو موافقٌ لوعد
   * المنصّة المكتوب في أربعة مواضع — «صفر عمولة على كل عملية بيع» —
   * **فعمولةُ بائعٍ مفعَّلة تُكذّبه**، والوعدُ يُرفع عندها (ترحيل
   * `faq_key` وشرطُ `sellingIsFree`).
   *
   * وكانت البذرةُ تُفعّلها على البائع، فيُرفع الوعدُ في كل بيئة تطوير
   * **وهو صادقٌ أصلًا** — والمشتري لا يدفع شيئًا فلا تُجرَّب عمولتُه.
   */
  const seedBuyerPct = APP_ENV === 'development' ? '2.50' : '0.00';

  await prisma.commissionRule.createMany({
    data: [
      {
        scope: 'global',
        side: 'SELLER',
        enabled: true,
        pct: new D('0.00'),
        fixedFee: new D('0.00'),
        activeFrom: days(-180),
      },
      {
        scope: 'global',
        side: 'BUYER',
        enabled: APP_ENV === 'development',
        pct: new D(seedBuyerPct),
        fixedFee: new D('0.00'),
        activeFrom: days(-180),
      },
    ],
  });

  // ————— ٣ حسابات أدمن بالأدوار —————
  //
  // كلمة مرور واحدة معروفة للتطوير — والدخول بها وحدها
  // يمكن الدخول بلا مسح رمز QR في كل إعادة زرع. السرّ يُطبع أدناه.
  // لا يعمل هذا إلا خارج الإنتاج — الحارس أعلى الملف يمنعه.
  /**
   * **والافتراضيّ للتطوير وحده.** الحارس أعلى الملف يمنع الإنتاج، لكنّ
   * **staging ليست إنتاجًا** — فكانت تُنشَر بحسابِ أدمن كلمتُه مكتوبة
   * في المستودع، على عنوانٍ عامّ. ومن قرأ الشيفرة دخل اللوحة.
   *
   * فالسقوط الآن **مُغلَق**: خارج التطوير لا زرع بلا كلمة صريحة.
   */
  const seedPassword = process.env.ADMIN_PASSWORD ?? null;
  if (seedPassword === null && APP_ENV !== 'development') {
    console.error(
      `\n✗ رُفض التشغيل: APP_ENV=${APP_ENV} بلا ADMIN_PASSWORD.\n` +
        '  الافتراضيّ مكتوبٌ في المستودع، ونشرُه على عنوانٍ عامّ يفتح اللوحة لمن قرأه.\n' +
        '  اضبط كلمةً قويّة واحتفظ بها:  openssl rand -base64 24\n',
    );
    process.exit(1);
  }
  const seedPasswordHash = await hashPassword(seedPassword ?? 'CarSell!dev2026');

  /**
   * بريد السوبر أدمن من البيئة — فلا يُشحن نطاقٌ ثابت إلى كل نشر،
   * ومن ينشر على نطاقه يدخل ببريده هو.
   */
  const superEmail = process.env.ADMIN_EMAIL ?? 'super@carsell.one';

  const admins = await Promise.all(
    (
      [
        [superEmail, 'وليد — سوبر أدمن', 'SUPER_ADMIN'],
        ['ops@carsell.one', 'نورة — التشغيل', 'OPS'],
        ['finance@carsell.one', 'سلطان — المالية', 'FINANCE'],
      ] as const
    ).map(([email, name, role]) => {
      return prisma.adminUser.create({
        data: {
          email,
          name,
          role,
          passwordHash: seedPasswordHash,
          // المصادقة الثنائية أُلغيت بقرار المصمّم — الدخول بالكلمة وحدها
          mustChangePassword: false,
        },
      });
    }),
  );

  // ————— ٣٩ ميزة —————
  const features = load<FeatureRow[]>('features.json');
  await prisma.feature.createMany({ data: features });

  /**
   * ربط المميّزات بالفئات — الأساسيات وحدها.
   * القاعدة في prisma/seed-data/README.md: ميزة خاطئة في الكتالوج
   * تنتشر إلى كل إعلان يُنشر من تلك الفئة، ولا يراها البائع ليصحّحها.
   */
  const ALWAYS = ['abs', 'airbags_front', 'ac_auto', 'bluetooth'] as const;
  const FROM_2020 = 'rear_camera';

  // ————— الكتالوج: ٤٢ ماركة، عشر منها بشجرة كاملة —————
  const brands = load<BrandRow[]>('brands.json');
  const trimLinks: { trimId: string; featureKey: string; isDefault: boolean }[] = [];
  type TrimRef = {
    id: string;
    row: TrimRow;
    modelId: string;
    modelNameAr: string;
    brandId: string;
    brandNameAr: string;
  };
  const allTrims: TrimRef[] = [];

  for (const b of brands) {
    const brand = await prisma.brand.create({
      data: {
        slug: b.slug,
        nameAr: b.nameAr,
        nameEn: b.nameEn,
        sort: b.sort,
        visible: b.visible,
      },
    });

    for (const m of b.models) {
      const model = await prisma.model.create({
        data: {
          brandId: brand.id,
          nameAr: m.nameAr,
          nameEn: m.nameEn,
          yearFrom: m.yearFrom,
          yearTo: m.yearTo,
          bodyType: m.bodyType,
          visible: m.visible,
        },
      });

      for (const t of m.trims) {
        const trim = await prisma.trim.create({
          data: {
            modelId: model.id,
            nameAr: t.nameAr,
            nameEn: t.nameEn,
            yearFrom: t.yearFrom,
            yearTo: t.yearTo,
            bodyType: t.bodyType,
            transmission: t.transmission,
            fuel: t.fuel,
            drivetrain: t.drivetrain,
            seats: t.seats,
            doors: t.doors,
            engineL: t.engineL === null ? null : new D(String(t.engineL)),
            cylinders: t.cylinders,
            horsepower: t.horsepower,
          },
        });

        for (const key of ALWAYS) {
          trimLinks.push({ trimId: trim.id, featureKey: key, isDefault: true });
        }
        if (t.yearFrom >= 2020) {
          trimLinks.push({
            trimId: trim.id,
            featureKey: FROM_2020,
            isDefault: true,
          });
        }

        allTrims.push({
          id: trim.id,
          row: t,
          modelId: model.id,
          modelNameAr: m.nameAr,
          brandId: brand.id,
          brandNameAr: b.nameAr,
        });
      }
    }
  }
  await prisma.trimFeature.createMany({ data: trimLinks });

  /**
   * ═══ قواعدُ الضريبة قبل ما يحسب بها ═══
   *
   * كانت تُزرع بعد الطلبات بتسعِمئة سطر، **و`computeOrderAmounts` صارت
   * تقرأ نسبتَها من قاعدتها** (قرار المالك: التعطيل والنسبة من
   * اللوحة). فكلُّ طلبٍ مزروعٍ يُحسب قبل وجود قاعدة ⇒ `supplyVatPct`
   * تردّ صفرًا ⇒ **ضريبةُ كلّ طلبٍ في البذرة صفر**، وشاشةُ الضرائب
   * تقول «لا ضريبة مستحقّة» في كل بيئة.
   *
   * ولم يسقط شيءٌ من قبل: الترتيبُ لم يكن يعني شيئًا ما دامت النسبة
   * تُقرأ من `PlatformSetting`. **فأوّلُ مصدرٍ واحد كشف ترتيبًا خاطئًا
   * كان نائمًا.**
   */
  // ————— قواعد الضريبة (A21) — ثلاث منها تنتظر المذكرة —————
  /** ومعرّفُ المحرِّر يُقرأ هنا — والكتلةُ سبقت تعريفَه في موضعها القديم */
  const taxAdmin = (await prisma.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } })).id;

  await prisma.taxRule.createMany({
    data: load<TaxRuleRow[]>('tax-rules.json').map((rule) => ({
      sellerType: rule.sellerType as never,
      buyerType: rule.buyerType as never,
      supplyType: rule.supplyType as never,
      taxableBase: rule.taxableBase as never,
      ratePct: rule.ratePct === null ? null : new D(rule.ratePct),
      supplierIsPlatform: rule.supplierIsPlatform,
      invoiceIssuer: rule.invoiceIssuer as never,
      active: rule.active,
      note: rule.note,
      activeFrom: days(-365),
      updatedBy: taxAdmin,
      updatedAt: NOW,
    })),
  });


  // ————— المزوّدون والخدمات التسعة —————
  const providerDefs = [
    ['مركز فحص المستقبل', 'Mustaqbal Inspection Centre', 'INSPECTION', 48],
    ['ناقل للشحن', 'Naqil Transport', 'SHIPPING', 96],
    ['تأمين الراجحي', 'Al Rajhi Takaful', 'INSURANCE', 1],
    /**
     * ═══ ومزوّدُ نقل الملكية — وكانت خدمتُه تُعرض ولا تُطلب ═══
     *
     * قِيس: `ownership_transfer` معروضةٌ في **الصفحة الرئيسية**
     * بـ٣٥٠ ريالًا و`providerType = NULL`، فـ`cityPool(null)` تُعيد
     * فراغًا و`requestService` تردّ `CITY_NOT_COVERED` **دائمًا**.
     * فصار لها صنفٌ (ترحيل `20261017160100`) — **ولا يكفي**: صنفٌ
     * بلا مزوّدٍ في أيّ مدينة يردّ الردَّ نفسه.
     */
    ['وكيل نقل الملكية', 'Tamleek Transfer Agent', 'TRANSFER', 72],
    ['ديتيل برو', 'Detail Pro', 'DETAILING', 48],
    ['عدسة للتصوير', 'Adasa Studio', 'PHOTOGRAPHY', 48],
  ] as const;

  const providers = new Map<ProviderType, string>();
  for (const [nameAr, nameEn, type, sla] of providerDefs) {
    const p = await prisma.serviceProvider.create({
      data: {
        nameAr,
        nameEn,
        type,
        slaHours: sla,
        contactPhone: '+966112000000',
        commissionPct: new D('15.00'),
        cities: [...CITIES].slice(0, 4),
        active: true,
        /**
         * ═══ وحسابُ دفعٍ مفعَّل — وإلّا فالبيئة لا تفحص ═══
         *
         * طابورُ المدينة يستبعد من لا حساب له: يُسنَد إليه طلبٌ فيؤدّيه
         * ثمّ لا سبيل إلى دفع مستحقّه. **وبلا هذا السطر الطابورُ صفرٌ
         * دائمًا**، فكل طلبِ فحصٍ يُردّ بـ«لا تغطية» — واختبارٌ يقيس
         * الرحلة يمرّ على فرع الرفض ويبدو أخضر.
         *
         * والمعرّفان شكلُ ما يردّه المزوّد لا قيمةٌ حقيقية — والربط
         * الحيّ يستبدلهما بما يُنشئه.
         */
        accountStatus: 'ACTIVE',
        accountRef: `seed-merchant-${type.toLowerCase()}`,
        payoutRef: `seed-entity-${type.toLowerCase()}`,
        accountSyncAt: NOW,
      },
    });
    providers.set(type, p.id);

    /**
     * ═══ ولكلّ مزوّدٍ حسابُ دخول ═══
     *
     * قرار المالك: لوحةُ مزوّدين موحَّدة يُسنَد فيها الطلب ويُعالَج
     * ويُؤكَّد. **وبلا حسابٍ لا يدخلها أحد**، فتبقى اللوحة شاشةً لا
     * يراها إنسان — والبيئة لا تُنهي طلبًا.
     *
     * والبريد مشتقٌّ من الصنف فلا يُكتب بيد، والكلمة تُغيَّر عند أوّل
     * دخول (`mustChangePassword`).
     */
    await prisma.providerUser.create({
      data: {
        providerId: p.id,
        email: `${type.toLowerCase()}@provider.example`,
        name: `مشغّل ${nameAr}`,
        /**
         * **ولا كلمةَ ثابتة هنا.** الحارس أعلى الملف يرفض الزرع خارج
         * التطوير بلا `ADMIN_PASSWORD` صريحة، وكلمةٌ أكتبها هنا تتجاوزه
         * — فيُنشَر مزوّدٌ كلمتُه في المستودع على عنوانٍ عامّ. وهو
         * الخطأ الذي أُغلق مرّةً في حساب الأدمن.
         */
        passwordHash: seedPasswordHash,
      },
    });
  }

  const serviceRows = load<ServiceRow[]>('services.json');
  const services = new Map<string, string>();
  /** سعرُ كلِّ خدمة — فطلبُ الخدمة لا يُسعَّر برقمٍ مكتوبٍ بيد. */
  const servicePrices = new Map<string, Prisma.Decimal>();
  for (const s of serviceRows) {
    const created = await prisma.service.create({
      data: {
        key: s.key,
        nameAr: s.nameAr,
        nameEn: s.nameEn,
        descAr: s.descAr,
        descEn: s.descEn,
        includesAr: s.includesAr,
        includesEn: s.includesEn,
        price: new D(s.price),
        category: s.category,
        isAutomated: s.isAutomated,
        slaHours: s.slaHours,
        placements: s.placements,
        sort: s.sort,
        /**
         * **والصنف يُكتب كما يُقرأ.** كان يُستعمل للبحث عن المزوّد ثمّ
         * يُرمى، فتبقى `providerType` فارغةً — وطابورُ المدينة يُشتقّ
         * منها، فيصير صفرًا دائمًا ويُردّ كلُّ طلبِ فحصٍ بـ«لا تغطية».
         */
        providerType: s.providerType,
        providerId:
          s.providerType === null ? null : (providers.get(s.providerType) ?? null),
      },
    });
    services.set(s.key, created.id);
    servicePrices.set(s.key, created.price);
  }

  // ————— المعارض (Wg مرحلة أولى) —————
  /**
   * **والعنوان وساعات العمل من صلب بيانات المعرض.** زائر صفحة المعرض
   * يسأل «أين ومتى أزوره؟» — وكانا غائبَين عن البذرة كلّها، فبطاقة
   * «الموقع وساعات العمل» في التصميم تفتح على فراغٍ دائم.
   */
  const dealerDefs = [
    ['al-safwa', 'معرض الصفوة', 'Al Safwa Motors', 'الرياض', true, '4.80', 142, 'طريق الملك عبدالعزيز، حي الملقا'],
    ['al-nokhba', 'معرض النخبة', 'Al Nokhba Cars', 'الرياض', true, '4.60', 98, 'طريق الملك فهد، حي النرجس'],
    ['jeddah-auto', 'جدة أوتو', 'Jeddah Auto', 'جدة', true, '4.40', 61, 'شارع الأمير سلطان، حي الروضة'],
    ['sharq-motors', 'معرض الشرق', 'Sharq Motors', 'الدمام', false, null, 0, 'طريق الكورنيش، حي الشاطئ'],
  ] as const;

  /** أيام الأسبوع السعوديّ: الجمعة مساءً وحده. */
  const DEALER_HOURS = [
    { day: 'السبت – الخميس', open: '09:00', close: '22:00' },
    { day: 'الجمعة', open: '16:00', close: '22:00' },
  ];

  const dealers = await Promise.all(
    dealerDefs.map(([slug, nameAr, nameEn, city, verified, rating, count, address]) =>
      prisma.dealer.create({
        data: {
          slug,
          nameAr,
          nameEn,
          city,
          verified,
          ratingAvg: rating === null ? null : new D(rating),
          ratingCount: count,
          status: verified ? 'ACTIVE' : 'PENDING',
          phone: '+966112345678',
          address: `${address}، ${city}`,
          hours: DEALER_HOURS,
          aboutAr: `${nameAr} — بيع وشراء السيارات المستعملة والجديدة في ${city}.`,
          aboutEn: `${nameEn} — buying and selling used and new cars in ${city}.`,
          crNumber: `10${between(10000000, 99999999)}`,
          createdAt: days(-between(200, 900)),
        },
      }),
    ),
  );

  // ————— المستخدمون —————
  const individualNames = [
    'خالد العتيبي',
    'فهد الدوسري',
    'سعود العنزي',
    'ريم القحطاني',
    'عبدالله الشهري',
    'منى الحربي',
    'ماجد الغامدي',
    'نوف السبيعي',
  ] as const;

  const sellers = await Promise.all(
    individualNames.map((name, i) =>
      prisma.user.create({
        data: {
          phone: `+9665${String(10000000 + i).padStart(8, '0')}`,
          name,
          email: `seller${i + 1}@example.com`,
          /**
           * **والحقلان يتبعان بعضهما.** `identityStatus` هي الحقيقة
           * و`idVerified` مشتقٌّ منها (`identity-state.ts`). وكانت
           * البذرة تكتب الراية وحدها، فيصير ٥٣ مستخدمًا «موثَّقين»
           * يشترون، وشاشة توثيق الهوية تقول «موثّق ٠» وطابورُها فارغ.
           */
          identityStatus: 'VERIFIED',
          idVerified: true,
          idVerifiedAt: days(-between(30, 400)),
          /**
           * **مشفَّرًا كما يكتبه المنتج** — لا صريحًا. وكان صريحًا،
           * فصار في العمود صيغتان: قارئٌ يفكّ وقارئٌ يقصّ، وكلٌّ
           * يصيب على نصف الصفوف. والبيانات المزروعة تُحاكي شكل
           * الحقيقيّ لا اسمه فقط.
           */
          iban: encryptSecret(
            `SA03${between(10, 99)}${between(1000000000000000, 9999999999999999)}`,
          ),
          createdAt: days(-between(60, 700)),
        },
      }),
    ),
  );

  const dealerUsers = await Promise.all(
    dealers.map((d, i) =>
      prisma.user.create({
        data: {
          phone: `+9665${String(20000000 + i).padStart(8, '0')}`,
          name: `مدير ${d.nameAr}`,
          email: `dealer${i + 1}@example.com`,
          role: 'DEALER',
          dealerId: d.id,
          identityStatus: 'VERIFIED',
          idVerified: true,
          idVerifiedAt: days(-300),
          createdAt: days(-between(200, 900)),
        },
      }),
    ),
  );

  const buyers = await Promise.all(
    Array.from({ length: 14 }, (_, i) =>
      prisma.user.create({
        data: {
          phone: `+9665${String(30000000 + i).padStart(8, '0')}`,
          name: `مشترٍ ${i + 1}`,
          // الثلث غير موثَّق — وحالتُه تتبع رايته، فيصير الطابور واقعيًّا
          identityStatus: i % 3 !== 0 ? 'VERIFIED' : i % 3 === 0 && i % 2 === 0 ? 'PENDING' : 'NONE',
          idVerified: i % 3 !== 0,
          ...(i % 3 === 0 && i % 2 === 0 ? { identitySubmittedAt: days(-between(1, 4)) } : {}),
          /**
           * ═══ ومشترٍ مكتملُ الملفّ — وإلّا فالبيئة لا تشتري ═══
           *
           * حارسُ الشراء يفحص **البريد والهوية والوضع الضريبيّ** معًا
           * (`profileCompletion`). والبذرة كانت تترك `taxStatus` فارغًا
           * للجميع — **فصفرُ مستخدمين يستطيعون الشراء** في كل بيئةٍ
           * مزروعة، ولا مشي رحلةٍ يكتمل.
           *
           * ولا يُجعل الكلُّ مكتملًا: طابور «أكمل ملفّك» جزءٌ من المنتج،
           * فالثلث الأوّل مكتمل وما بقي على حاله.
           */
          ...(i % 3 === 1
            ? {
                email: `buyer${String(i + 1)}@example.com`,
                taxStatus: 'INDIVIDUAL' as const,
                taxStatusSetAt: days(-between(5, 60)),
              }
            : {}),
          createdAt: days(-between(5, 300)),
        },
      }),
    ),
  );

  await prisma.subscription.createMany({
    data: [...sellers, ...dealerUsers].map((u) => ({
      userId: u.id,
      planId: freePlan.id,
      startsAt: u.createdAt,
      status: 'active',
    })),
  });

  // ————— ٦٠ إعلانًا على الأنواع والمدن والحالات —————
  const buildableTrims = allTrims.filter((t) => t.row.yearTo === null);

  /** أوصافٌ بلغة السوق — لا جملًا تسويقية. */
  const DESCRIPTIONS: readonly string[] = [
    'سيارة بحالة ممتازة، صيانة دورية في الوكالة ومالك واحد منذ الشراء. الصبغ في الرفرف الأيمن من خدش في موقف، ومثبت في تقرير الفحص. الإطارات الأمامية مغيّرة قبل ستة أشهر. قابلة للفحص في أي مركز يختاره المشتري.',
    'ممشى قليل والاستعمال داخل المدينة فقط. الصيانة كلها في الوكالة وفواتيرها موجودة. لا حوادث ولا صبغ. السعر قابل للتفاوض للجاد.',
    'نظيفة جدًا من الداخل والخارج، بصمة كاملة وشاشة أصلية. غُيّرت البطارية والمكابح الأمامية هذا العام. الرخصة والتأمين ساريان حتى نهاية السنة.',
    'مستخدمة في مشاوير العمل والطريق السريع، لذلك الممشى أعلى من مثيلاتها والمحرك بحالة ممتازة. آخر صيانة على عشرة آلاف كيلو. جاهزة للنقل فورًا.',
    'ثاني مالك، والأول اشتراها من الوكالة. يوجد خدش بسيط على المصد الخلفي موضّح في الصور ولم يُصبغ. تُسلَّم بعد فحص المشتري ولا مانع من الفحص قبل الشراء.',
  ];

  type ListingRef = {
    id: string;
    ref: string;
    type: 'DIRECT' | 'NEGOTIATION' | 'AUCTION';
    askPrice: Prisma.Decimal;
    vehicleId: string;
    sellerId: string;
    city: string;
  };
  const listings: ListingRef[] = [];
  const vehicleIds: string[] = [];

  // ٣٠ مباشر · ٢٠ تفاوض · ١٠ مزاد
  const plan: ('DIRECT' | 'NEGOTIATION' | 'AUCTION')[] = [
    ...Array.from({ length: 30 }, () => 'DIRECT' as const),
    ...Array.from({ length: 20 }, () => 'NEGOTIATION' as const),
    ...Array.from({ length: 10 }, () => 'AUCTION' as const),
  ];

  const featureKeys = features.map((f) => f.key);

  /**
   * ═══ وثلاثةٌ من مدينةٍ وطرازٍ واحد — عمدًا ═══
   *
   * صفحةُ الهبوط «طراز في مدينة» تُولَّد عند ثلاثة إعلانات، والاختيار
   * العشوائيّ للمدينة والطراز لا يبلغها إلّا مصادفةً: قِيس على الزرع
   * فكان **أكبرُ تركيبةٍ اثنين**. فالصفحة موجودةٌ في المنتج ولا تُفتح
   * في أي بيئة تطوير — **وما لا يُزرع لا يُرى**، وقد بقي فيها عيبٌ
   * أُصلح في أختها (الشبكة الغائبة) حتى قِيست بالبحث عن الصفحة نفسها.
   *
   * فتُثبَّت الثلاثة الأولى على مدينةٍ وطرازٍ واحد.
   */
  const PLANTED = 3;

  for (let i = 0; i < plan.length; i += 1) {
    const type = plan[i] as 'DIRECT' | 'NEGOTIATION' | 'AUCTION';
    const t = i < PLANTED ? (buildableTrims[0] as (typeof buildableTrims)[number]) : pick(buildableTrims);
    const year = between(Math.max(t.row.yearFrom, 2018), 2026);
    const age = 2026 - year;
    const mileageKm = age === 0 ? between(500, 8000) : between(8000, 45000) * age;
    const city = i < PLANTED ? (CITIES[0] as string) : pick(CITIES);

    // بائع تاجر في ثلث الإعلانات — البطاقات في Wa وWb تعرض شارة المعرض
    const asDealer = i % 3 === 0;
    const dealerIdx = i % dealers.length;
    const seller = asDealer
      ? (dealerUsers[dealerIdx] as (typeof dealerUsers)[number])
      : pick(sellers);
    const dealerId = asDealer ? (dealers[dealerIdx]?.id ?? null) : null;

    const base = 45_000 + (t.row.horsepower ?? 150) * 260;
    const askPrice = new D(
      String(
        Math.round(
          Math.max(28_000, base * (1 - age * 0.07) - mileageKm * 0.12) / 500,
        ) * 500,
      ),
    );

    const vehicle = await prisma.vehicle.create({
      data: {
        ownerId: seller.id,
        dealerId,
        brandId: t.brandId,
        modelId: t.modelId,
        trimId: t.id,
        brandName: t.brandNameAr,
        modelName: t.modelNameAr,
        trimName: t.row.nameAr,
        year,
        bodyType: t.row.bodyType,
        transmission: t.row.transmission,
        fuel: t.row.fuel,
        drivetrain: t.row.drivetrain,
        seats: t.row.seats,
        mileageKm,
        colorExterior: pick(COLORS),
        colorInterior: pick(['بيج', 'أسود']),
        paintStatus: age <= 1 ? 'ORIGINAL' : pick(['ORIGINAL', 'PARTIAL', 'UNKNOWN']),
        spec: pick(['SAUDI', 'SAUDI', 'GCC', 'AGENT_IMPORT']),
        condition: age === 0 ? 'NEW' : 'USED',
        city,
        entryMode: i % 4 === 0 ? 'MANUAL' : 'VIN_LOOKUP',
        vin: `SEED${String(i).padStart(4, '0')}${between(100000000, 999999999)}`,
        plateLetters: 'أ ب ح',
        plateNumbers: String(between(1000, 9999)),
        createdAt: days(-between(2, 120)),
      },
    });
    vehicleIds.push(vehicle.id);

    /**
     * ═══ حالات متنوّعة — **و«مُباع» ليست منها** ═══
     *
     * `SOLD` لا يكتبها في المنتج إلا `closeListingSold` عند اكتمال
     * طلب، بـ`closeReason: 'order.completed'`. وبذرةٌ تعلنها بعدّاد
     * (`i % 20 === 13`) تُنتج **إعلانًا مباعًا بلا مشترٍ ولا طلب** —
     * وهي حالةٌ لا يبلغها المنتج.
     *
     * وأثرُها ليس تجميليًّا: مؤشّر «نسبة البيع من المعروض» يقسم
     * المباع على المنشور، فإعلانان بلا طلب **يضخّمانه بلا بيعة**.
     * فالبيع يُكتب بعد الطلبات، من الطلبات نفسها.
     */
    const status =
      i % 20 === 5
        ? 'DRAFT'
        : i % 20 === 9
          ? 'PENDING_REVIEW'
          : i % 20 === 17
            ? 'SUSPENDED'
            : 'PUBLISHED';

    const ref = `ADS2026A${String(i + 1).padStart(4, '0')}`;
    const listing = await prisma.listing.create({
      data: {
        ref,
        vehicleId: vehicle.id,
        sellerId: seller.id,
        type,
        status,
        askPrice,
        minAcceptPrice:
          type === 'NEGOTIATION'
            ? new D(String(Math.round(Number(askPrice) * 0.92)))
            : null,
        negotiable: type === 'NEGOTIATION',
        city,
        /**
         * ═══ وصف البائع — ولم يكن لأيّ إعلان ═══
         *
         * `description` بقي `null` في كل إعلانٍ مزروع، **وتابُ «وصف
         * البائع» لا يظهر إلّا بوصف** — فالكتلة التي يرسمها التصميم
         * ويكتب فيها البائع ما لا يظهر في جدول المواصفات لا تُرى في
         * أيّ بيئة.
         *
         * وهي أهمّ ما يُقرأ بعد الصور: ما سبب الصبغ، ومتى غُيّرت
         * الإطارات، وهل تُفحص عند من يختاره المشتري.
         */
        description: DESCRIPTIONS[i % DESCRIPTIONS.length] ?? null,
        viewCount: between(12, 2400),
        publishedAt: status === 'DRAFT' ? null : days(-between(1, 90)),
        /* الإغلاق يُكتب مع البيعة، بعد الطلبات — لا هنا بعدّاد */
        closedAt: null,
        closeReason: null,
        reviewReason: status === 'PENDING_REVIEW' ? 'DUPLICATE_IMAGE' : null,
        featuredUntil: i % 12 === 0 ? days(between(1, 7)) : null,
      },
    });

    // الصور: أربع على الأقل (قرار ٣٣)، اللوحة مطموسة دائمًا (القاعدة ١٤)
    const imageCount = between(4, 10);
    /**
     * ═══ وتُكتب الملفّات التي تدّعيها ═══
     *
     * كانت الصفوف تُكتب بمفاتيح لا ملفّ خلفها، فكلُّ كرتٍ في اللوحة
     * وكلُّ معرضٍ في الموقع صندوقٌ فارغ — **والعدّاد يقول «٦ صور»
     * ولا تُفتح واحدة**. ولا شيء يسقط: الصفّ مكتوب والاختبار يعدّه.
     *
     * **وفي التطوير وحده**: `devPut` ترمي خارجه، والتخزين هناك R2.
     */
    const imageKeys = Array.from(
      { length: imageCount },
      (_, n) => `staging/listings/${ref}/${n + 1}.png`,
    );
    if (devStoreAllowed()) {
      await Promise.all(
        imageKeys.map((key, n) => devPut(key, placeholderPng(ref.charCodeAt(ref.length - 1) + n))),
      );
    }
    await prisma.listingImage.createMany({
      data: Array.from({ length: imageCount }, (_, n) => ({
        listingId: listing.id,
        r2Key: imageKeys[n] as string,
        sort: n,
        isCover: n === 0,
        plateBlurred: true,
        phash: seedPhash(ref, n),
        qualityFlags: n === 3 && i % 9 === 0 ? ['BLURRY'] : [],
      })),
    });

    // لقطة المميّزات وقت النشر — لا قراءة حيّة من الفئة
    const extra = new Set<string>(ALWAYS);
    if (year >= 2020) extra.add(FROM_2020);
    for (let k = 0; k < between(2, 7); k += 1) extra.add(pick(featureKeys));
    await prisma.listingFeature.createMany({
      data: [...extra].map((featureKey) => ({ listingId: listing.id, featureKey })),
    });

    if (status === 'PUBLISHED') {
      listings.push({
        id: listing.id,
        ref,
        type,
        askPrice,
        vehicleId: vehicle.id,
        sellerId: seller.id,
        city,
      });
    }
  }

  // ————— تاريخ المركبة: ما تملكه المنصة فقط (قرار ١٥) —————
  await prisma.vehicleHistoryItem.createMany({
    data: vehicleIds.slice(0, 24).flatMap((vehicleId, i) => [
      {
        vehicleId,
        type: 'owner',
        titleAr: 'مالك واحد منذ الشراء',
        titleEn: 'One owner since purchase',
        detailAr: 'لم تُنقل الملكية داخل المنصة منذ الإضافة.',
        detailEn: 'Ownership has not changed inside the platform since it was added.',
        source: 'PLATFORM' as const,
        occurredAt: days(-between(200, 800)),
      },
      {
        vehicleId,
        type: 'service',
        titleAr: 'صيانة دورية في الوكالة',
        titleEn: 'Scheduled service at the dealership',
        detailAr: `آخر صيانة على ${between(10, 60) * 1000} كم.`,
        detailEn: `Last service at ${between(10, 60) * 1000} km.`,
        source: 'SELLER' as const,
        occurredAt: days(-between(30, 200) - i),
      },
    ]),
  });

  /**
   * ═══ كلُّ إعلانٍ نوعُه مزاد له مزاد ═══
   *
   * كانت `.slice(0, 3)` تترك **سبعة** إعلاناتٍ نوعُها `AUCTION` بلا
   * صفّ `Auction` — وهي حالةٌ يمنعها المنتج نفسه (`publish` تُنشئ
   * المزاد في معاملة النشر). والأثر مقيس: `/browse/tabuk/lexus`
   * تردّ **٥٠٠**، وصفحة المزاد ٤٠٤، والبطاقة تعرض عدّادًا بلا موعد.
   *
   * والثلاثةُ الأولى بحالاتها المقصودة (جارٍ · قادم · منتهٍ)، وما
   * بعدها يدور عليها — فلا يبقى إعلانٌ بلا مزاده.
   */
  const auctionListings = listings.filter((l) => l.type === 'AUCTION');
  /**
   * ═══ ونافذةُ المزاد الجاري تطول بما يكفي لتُستعمل ═══
   *
   * كانت `endsAt: hours(4)`، **فيموت كلُّ مزادٍ جارٍ بعد ظهر يوم
   * الزرع**. وبعدها لا مزادَ يُزايَد عليه في البيئة كلّها: صفحةُ
   * المزاد تقول «انتهى»، والمزايدةُ تردّ `ENDED`، والبثّ اللحظيّ
   * وشريطُ «تُغلق قريبًا» لا يُرى أيٌّ منهما عاملًا.
   *
   * فثلاثةُ أيّام لمن يُراد تصفّحه، **وساعتان لواحدٍ** — فالعدّاد
   * يُرى في حالته العاجلة أيضًا، وشريطُ «تُغلق قريبًا» يجد ما يعرضه.
   */
  const auctionSpecs = [
    { status: 'LIVE' as const, startsAt: realHours(-6), endsAt: days(3) },
    { status: 'SCHEDULED' as const, startsAt: days(2), endsAt: days(4) },
    { status: 'ENDED_MET' as const, startsAt: days(-6), endsAt: days(-3) },
    { status: 'LIVE' as const, startsAt: realHours(-20), endsAt: realHours(2) },
  ];

  for (let i = 0; i < auctionListings.length; i += 1) {
    const l = auctionListings[i] as ListingRef;
    const spec = auctionSpecs[i % auctionSpecs.length] as (typeof auctionSpecs)[number];
    const start = new D(String(Math.round(Number(l.askPrice) * 0.75)));
    const increment = new D('500.00');

    const auction = await prisma.auction.create({
      data: {
        listingId: l.id,
        startPrice: start,
        reservePrice: new D(String(Math.round(Number(l.askPrice) * 0.9))),
        bidIncrement: increment,
        buyNowPrice: new D(String(Math.round(Number(l.askPrice) * 1.05))),
        depositAmount: new D('5000.00'),
        startsAt: spec.startsAt,
        endsAt: spec.endsAt,
        status: spec.status,
        extendedCount: spec.status === 'ENDED_MET' ? 2 : 0,
        viewingCity: l.city,
      },
    });

    if (spec.status !== 'SCHEDULED') {
      const bidderPool = buyers.slice(0, 6);
      const reserve = Number(auction.reservePrice);
      let amount = Number(start);
      const total = between(8, 18);
      for (let n = 0; n < total; n += 1) {
        amount += Number(increment) * between(1, 4);
        /**
         * ═══ ومزادٌ «رسا» بلغ احتياطيَه بالتعريف ═══
         *
         * المزايدات تتصاعد بمقدارٍ عشوائيّ والحالة مكتوبةٌ `ENDED_MET`
         * سلفًا، فقد تنتهي أعلى مزايدةٍ **دون الاحتياطي** — فيعرض
         * الكرت «رسا» و«لم يُبلغ» معًا: حالةٌ لا يبلغها المنتج، لأن
         * `closeEndedAuctions` لا تكتب `ENDED_MET` إلّا ببلوغه.
         *
         * فآخرُ مزايدةٍ في المزاد الراسي تتجاوز الاحتياطيَ يقينًا.
         */
        if (spec.status === 'ENDED_MET' && n === total - 1 && amount <= reserve) {
          amount = reserve + Number(increment);
        }
        const bidder = bidderPool[n % bidderPool.length] as (typeof buyers)[number];
        await prisma.bid.create({
          data: {
            auctionId: auction.id,
            bidderId: bidder.id,
            amount: new D(String(amount)),
            isAuto: n % 5 === 0,
            createdAt: new Date(spec.startsAt.getTime() + n * 900_000),
          },
        });
      }
      await prisma.deposit.createMany({
        data: bidderPool.map((b) => ({
          auctionId: auction.id,
          userId: b.id,
          amount: new D('5000.00'),
          status: spec.status === 'ENDED_MET' ? ('RELEASED' as const) : ('HELD' as const),
          releasedAt: spec.status === 'ENDED_MET' ? spec.endsAt : null,
        })),
      });
    }
  }

  // ————— ١٢ طلبًا في مراحل مختلفة —————
  const STAGES = [
    'REQUEST',
    'APPROVED',
    'INSPECTION',
    'PAYMENT',
    'TRANSFER',
    'DONE',
  ] as const;

  /**
   * ═══ وطلبٌ ملغى في البذرة ═══
   *
   * **لم يكن في القاعدة طلبٌ `CANCELLED` واحد** — والحالة معرَّفةٌ في
   * المخطّط ويكتبها `cancelOrder`. فكلُّ شاشةٍ تعرض طلبًا لم تُجرَّب
   * قطُّ في هذه الحال، ومرّ عطلٌ في ثمانية مواضع بلا أن يراه أحد:
   * بنرٌ أخضر يقول «طلبٌ ينتظر الدفع» عن طلبٍ أُلغي، ووسمان
   * متجاوران يتناقضان، وزرُّ دفعٍ يعمل.
   *
   * **والإلغاء قبل الدفع**، فلا دفعةَ له ولا ضمان — وهو الشكل الذي
   * ينتجه `cancelOrder` حين يُلغى الطلب في مرحلة الدفع.
   */
  const CANCELLED_INDEX = 12;
  const orderListings = listings.slice(0, CANCELLED_INDEX + 1);
  for (let i = 0; i < orderListings.length; i += 1) {
    const l = orderListings[i] as ListingRef;
    const cancelled = i === CANCELLED_INDEX;
    const stage = cancelled
      ? ('PAYMENT' as const)
      : (STAGES[i % STAGES.length] as (typeof STAGES)[number]);
    const buyer = buyers[i % buyers.length] as (typeof buyers)[number];
    const agreed = new D(String(Math.round(Number(l.askPrice) * 0.97)));

    /**
     * ═══ وأرقامُ الطلب تُحسب بحاسبة المنتج لا بيد ═══
     *
     * كانت مكتوبةً هنا: عمولةٌ صفر وضريبةٌ صفر وإجماليٌّ = الثمن +
     * الرسم. **فكانت تناقض قاعدة العمولة النافذة**: تُضبط ٢٫٥٪ من
     * اللوحة ويبقى كلُّ طلبٍ مزروعٍ على صفر، **فبطاقةُ «إيراد
     * المنصّة» صفرٌ في كل بيئة** ولا شاشةَ ماليّةٍ تُجرَّب على رقمٍ
     * حقيقيّ.
     *
     * و`computeOrderAmounts` هي التي يحسب بها الشراءُ والعرضُ
     * والمزاد — فالمزروعُ يُشبه ما يُنتجه المنتج، لا شكلَه وحده.
     */
    const amounts = await computeOrderAmounts(prisma, Number(agreed));
    const transferFee = amounts.transferFee;
    const total = amounts.totalAmount;
    const vat = amounts.vatAmount;

    /**
     * ═══ والطلبُ يُولد قبل أحداثه ═══
     *
     * كان `createdAt` متروكًا لافتراضيّه (**الآن**) و`stageEnteredAt`
     * مؤرَّخًا قبل أسبوعين وأحداثُه قبل أربعةَ عشر يومًا — **فالإنشاء
     * يقع بعد ما نشأ عنه**. وخطُّ زمن الطلب يعرض «أُنشئ طلب» آخرَ
     * سطرٍ، ونزاعٌ عليه يسبق مولدَه.
     *
     * ولا شيء يسقط: الصفوف صحيحةٌ كلٌّ على حدة، **والتناقض بينها**.
     */
    const bornAt = days(-between(16, 30));
    const enteredAt = days(-between(1, 14));

    const order = await prisma.order.create({
      data: {
        ref: `ORD-2026-${String(1000 + i)}`,
        listingId: l.id,
        buyerId: buyer.id,
        sellerId: l.sellerId,
        source:
          l.type === 'AUCTION'
            ? 'AUCTION'
            : l.type === 'NEGOTIATION'
              ? 'OFFER'
              : 'DIRECT',
        stage,
        status: cancelled ? 'CANCELLED' : stage === 'DONE' ? 'COMPLETED' : 'ACTIVE',
        /** **ومن ألغى يُكتب ولماذا** — «أُلغي» وحدها لا تقول شيئًا. */
        ...(cancelled
          ? { cancelReason: 'انسحب المشتري قبل الدفع', cancelledBy: buyer.id }
          : {}),
        agreedPrice: agreed,
        commissionPct: amounts.commissionPct,
        commissionAmount: amounts.commissionAmount,
        buyerCommission: amounts.buyerCommission,
        sellerCommission: amounts.sellerCommission,
        /** **ولقطةُ ضريبة كلّ طرف** — فوق الرسم لا داخله (قرار «فوقها») */
        buyerVat: amounts.buyerVat,
        sellerVat: amounts.sellerVat,
        transferFee,
        vatAmount: vat,
        totalAmount: total,
        createdAt: bornAt,
        stageEnteredAt: enteredAt,
        paymentDueAt: stage === 'PAYMENT' ? hours(between(2, 22)) : null,
        transferAppointmentAt: stage === 'TRANSFER' ? days(between(1, 5)) : null,
      },
    });

    await prisma.orderEvent.createMany({
      data: STAGES.slice(0, STAGES.indexOf(stage) + 1).map((s, n, all) => ({
        orderId: order.id,
        // نفس اسم `advanceStage` — واسمان لحدث واحد أسوأ من اسم غير مثالي
        type: 'stage.advanced',
        fromStage: n === 0 ? null : (STAGES[n - 1] ?? null),
        toStage: s,
        actorType: 'system',
        /* موزَّعةٌ بين المولد ودخول المرحلة — فالتسلسل يُقرأ كما وقع */
        createdAt: new Date(
          bornAt.getTime() +
            ((enteredAt.getTime() - bornAt.getTime()) * (n + 1)) / all.length,
        ),
      })),
    });

    /** **ولا ضمانَ لملغًى قبل الدفع** — لا دفعةَ وقعت فلا شيء يُحجز. */
    if (!cancelled && STAGES.indexOf(stage) >= STAGES.indexOf('PAYMENT')) {
      const heldAt = days(-between(2, 10));

      /**
       * ═══ ولا ضمانَ بلا دفعته ═══
       *
       * `applyState` تُنشئ `Escrow` **من دفعةٍ محجوزة** — لا تُكتب
       * واحدةٌ بلا الأخرى. والبذرة كانت تكتب الضمان وحده، وجدولُ
       * `Payment` **فارغٌ تمامًا**.
       *
       * والأثر شاشةٌ كاملة: `/admin/settlements` تقرأ الطلبات التي
       * لها دفعةٌ `HELD`، فتقول «لا مبالغ محجوزة» بينما يقول الدفتر
       * «٢٠٧٬٧٥٠ لدى مزوّد الدفع» والماليةُ «١٦٩٬٨٣٠ محتجزًا» —
       * **ثلاث شاشات وثلاثة أرقام عن المال نفسه**، وطابورُ الإفراج
       * الذي بُني بنصاب عضوين لا يُرى عاملًا في أيّ بيئة.
       */
      const settled = stage === 'DONE';
      await prisma.payment.create({
        data: {
          orderId: order.id,
          purpose: 'VEHICLE_ESCROW',
          gatewayKey: 'bank_escrow',
          amount: total,
          method: 'mada',
          status: settled ? 'SETTLED' : 'HELD',
          holdRef: `hold_seed_${String(1000 + i)}`,
          ...(settled ? { settleRef: `stl_seed_${String(1000 + i)}`, settledAmount: total, settledAt: days(-1) } : {}),
          heldAt,
          createdAt: heldAt,
        },
      });

      await prisma.escrow.create({
        data: {
          orderId: order.id,
          amount: total,
          status: settled ? 'RELEASED' : 'HELD',
          heldAt,
          releasedAt: settled ? days(-1) : null,
          gatewayRef: 'bank_escrow',
        },
      });
      /**
       * ═══ والدفتر يُكتب مع المال لا بعده ═══
       *
       * البذرة كانت تُنشئ ضمانًا وعرابين وحوالات **ولا قيدًا واحدًا**،
       * فصفحة `/admin/ledger` تعرض ما تركته الاختبارات لا ما في
       * المنتج. ومحاسبٌ يفتحها يجد دفترًا لا يطابق الصناديق.
       *
       * والقيد يمرّ بـ`recordOrderPaid` و`recordOrderEarned` —
       * مدخلُه الوحيد الذي يفحص التوازن (البوابة ٢٠) — لا بكتابةٍ
       * مباشرة تُنتج معاملةً لا تتوازن.
       */
      const { recordOrderCaptured, recordOrderEarned, recordOrderPaid } = await ledgerEvents();

      await recordOrderPaid(
        prisma,
        { orderId: order.id, paymentId: null, buyerId: buyer.id, total },
        heldAt,
      );

      if (settled) {
        /**
         * ═══ والمستندات الثلاثة تُصدَر كما يُصدرها المنتج ═══
         *
         * إتمامُ البيع في `applyState` يُصدر **عقد بيع** و**كشف
         * تسوية** و**فاتورة ضريبية** على عمولتنا. والبذرة كانت
         * تُنشئ `Invoice` البسيط وحده — فصفر فاتورةٍ ضريبية وصفر
         * كشفٍ وصفر عقد في كل بيئة.
         *
         * والأثر: عمود «فواتير صدرت» في شاشة الضرائب صفرٌ أبدًا،
         * **وفرعُ الجدول الذي يعرضها لم يُصيَّر قطّ** — وهو الفرع
         * الذي سقط فيه تمريرُ دالّةٍ عبر حدّ الخادم من قبل، فلم
         * يكشفه إلّا `curl`. وتنزيلاتُ المشتري والبائع فارغة كذلك.
         */
        const { issueSaleAgreement, issueSettlementDocuments } = await documents();
        await issueSaleAgreement(order.id, enteredAt);
        await issueSettlementDocuments(order.id, enteredAt);

        await recordOrderEarned(
          prisma,
          {
            orderId: order.id,
            paymentId: null,
            buyerId: buyer.id,
            sellerId: l.sellerId,
            total,
            commission: amounts.commissionAmount,
            vat,
            govtFee: transferFee,
          },
          days(-1),
        );

        /**
         * ═══ والتحصيل يُزرع مع الاستحقاق ═══
         *
         * قرار المالك (٢٠٢٦-١٠-١٧): ما حُصِّل ولم يُحوَّل **مالٌ لنا**.
         * و`applyState` تكتب القيدين معًا — فالبذرةُ تكتبهما معًا،
         * وإلّا عرضت لوحةُ الدفتر حالًا لا يُنتجها المنتج: صفقةٌ
         * مكتملة ومالُها «محجوز» أبدًا.
         *
         * **وما لا يُزرع لا يُرى**: بطاقةُ «ما وصلنا فعلًا» كانت صفرًا
         * في كل بيئة.
         */
        await recordOrderCaptured(
          prisma,
          { orderId: order.id, paymentId: null, amount: total },
          days(-1),
        );
      }

      await prisma.invoice.create({
        data: {
          ref: `INV-2026-${String(2000 + i)}`,
          orderId: order.id,
          userId: buyer.id,
          type: 'SALE',
          subtotal: total.minus(vat),
          vatAmount: vat,
          total,
          issuedAt: days(-between(1, 9)),
        },
      });
    }

    /**
     * **والإعلان يُغلق ببيعه لا بعدّاد** — وبالسبب نفسه الذي يكتبه
     * `closeListingSold`، فما في القاعدة هو ما ينتجه المنتج.
     */
    if (stage === 'DONE') {
      await prisma.listing.update({
        where: { id: l.id },
        data: { status: 'SOLD', closedAt: enteredAt, closeReason: 'order.completed' },
      });
    }
  }

  /**
   * ═══ ومركبتان في المرآب ═══
   *
   * **مركبةٌ بلا إعلان لم تكن تُزرع قطّ** — ولا يمكن أن توجد أصلًا:
   * الطريق الوحيد لإنشاء مركبة كان النشر، وهو يكتب إعلانًا معها
   * دائمًا حتى في المسودّة. فشريحة `garage` في لوحة الأدمن كانت صفرًا
   * بنيويًّا، وبطاقة الحساب التي يرسمها التصميم («٢ معروضة · ١ في
   * المرآب») لا تصل إلى شطرها الثاني.
   *
   * وهي الحال الطبيعية لمن أضاف سيارته ليطلب عليها فحصًا أو تأمينًا
   * ولا يريد بيعها.
   */
  for (const [n, owner] of buyers.slice(0, 2).entries()) {
    const trim = buildableTrims[(n * 7) % buildableTrims.length] as TrimRef;
    await prisma.vehicle.create({
      data: {
        ownerId: owner.id,
        brandId: trim.brandId,
        modelId: trim.modelId,
        trimId: trim.id,
        brandName: trim.brandNameAr,
        modelName: trim.modelNameAr,
        trimName: trim.row.nameAr,
        year: 2024 - n,
        bodyType: trim.row.bodyType,
        drivetrain: trim.row.drivetrain,
        seats: trim.row.seats,
        transmission: 'AUTOMATIC',
        fuel: 'PETROL',
        mileageKm: between(8_000, 60_000),
        colorExterior: pick(COLORS),
        spec: 'GCC',
        condition: 'USED',
        city: pick(CITIES),
        entryMode: 'MANUAL',
      },
    });
  }

  // ————— العروض والنزاعات والبلاغات —————
  /**
   * ═══ وثلاثُ شاشاتٍ كانت فارغةً دائمًا ═══
   *
   * البذرة تُنشئ إعلاناتٍ ومزاداتٍ وطلبات، **ولا عرضًا ولا نزاعًا ولا
   * بلاغًا واحدًا**. فـ`/admin/offers` و`/admin/disputes` و
   * `/admin/reports` تُفتح فارغةً في كل بيئةٍ مزروعة — وصفحاتُ
   * تفاصيلها لا شيء يُفتح فيها.
   *
   * ولا شيء يسقط: الشاشة تُصيَّر والاختبار يمرّ (يصنع صفوفه بنفسه) —
   * **والفراغ يُقرأ «لم يُبنَ» لا «لا بيانات»**.
   *
   * **والحالاتُ تُغطّى كلُّها**: شاشةٌ فيها `PENDING` وحدها لا تُظهر
   * نبراتِ الشارات ولا فروعَ العرض — ومراجعةُ التصميم عليها تُخطئ.
   */
  const negotiables = listings.filter((l) => l.type === 'NEGOTIATION').slice(0, 6);
  const offerPlan = [
    { status: 'PENDING' as const, autoRejected: false, ratio: 0.93 },
    { status: 'COUNTERED' as const, autoRejected: false, ratio: 0.96 },
    { status: 'ACCEPTED' as const, autoRejected: false, ratio: 0.98 },
    { status: 'REJECTED' as const, autoRejected: true, ratio: 0.62 },
    { status: 'REJECTED' as const, autoRejected: false, ratio: 0.88 },
    { status: 'WITHDRAWN' as const, autoRejected: false, ratio: 0.9 },
    { status: 'EXPIRED' as const, autoRejected: false, ratio: 0.85 },
  ];

  for (const [n, plan] of offerPlan.entries()) {
    const listing = negotiables[n % negotiables.length];
    if (listing === undefined) break;
    const offerBuyer = buyers[n % buyers.length];
    if (offerBuyer === undefined || offerBuyer.id === listing.sellerId) continue;

    const madeAt = days(-between(2, 20));
    await prisma.offer.create({
      data: {
        listingId: listing.id,
        buyerId: offerBuyer.id,
        amount: new Prisma.Decimal(Math.round(Number(listing.askPrice) * plan.ratio)),
        status: plan.status,
        autoRejected: plan.autoRejected,
        createdAt: madeAt,
        /* **والمنتهي مهلتُه في الماضي** — وإلّا قُرئ نشطًا رغم حالته */
        expiresAt: new Date(madeAt.getTime() + (plan.status === 'EXPIRED' ? 1 : 96) * 3600 * 1000),
      },
    });
  }

  /** نزاعان: واحدٌ مفتوحٌ ينتظر، وواحدٌ حُسم — فالشاشة تُظهر الطرفين. */
  const disputable = await prisma.order.findMany({
    where: { stage: { in: ['TRANSFER', 'DONE'] } },
    select: { id: true, buyerId: true, createdAt: true },
    take: 2,
  });
  for (const [n, order] of disputable.entries()) {
    const resolved = n === 1;
    /** **والنزاع يُفتح بعد طلبه** — ومرساه تاريخُ الطلب لا «الآن». */
    const openedAt = new Date(order.createdAt.getTime() + 3 * 24 * 3600 * 1000);
    await prisma.dispute.create({
      data: {
        orderId: order.id,
        openedBy: order.buyerId,
        reason: resolved ? 'تأخّر نقل الملكية عن الموعد' : 'المركبة بحالةٍ غير الموصوفة في الإعلان',
        /* **والتعدادُ يُقرأ لا يُتذكَّر**: لا `RESOLVED` فيه — بل بمن حُسم لصالحه */
        status: resolved ? 'RESOLVED_BUYER' : 'OPEN',
        slaDueAt: new Date(openedAt.getTime() + 48 * 3600 * 1000),
        openedAt,
        ...(resolved
          ? {
              resolution: 'PARTIAL_SETTLEMENT',
              resolutionAmount: new Prisma.Decimal(1500),
              resolvedAt: new Date(openedAt.getTime() + 36 * 3600 * 1000),
            }
          : {}),
        messages: [
          { at: new Date(openedAt.getTime() + 3600 * 1000).toISOString(), by: 'buyer', text: 'أرفقت صور الحالة.' },
          { at: new Date(openedAt.getTime() + 7200 * 1000).toISOString(), by: 'seller', text: 'الوصف مطابق، والصور بعد التسليم.' },
        ],
      },
    });

    /**
     * **والضمان يتبع القرار.** `resolveDispute` تكتب `PARTIAL_REFUND`
     * مع التسوية الجزئية، وبذرةٌ تترك الضمان `RELEASED` تُنتج حالةً
     * **لا يستطيع المنتج إنتاجها**: «حُسم للمشتري» فوق «أُفرج للبائع».
     * والشاشة تعرضهما معًا فيبدو العطل فيها وهو في البيانات.
     */
    if (resolved) {
      await prisma.escrow.updateMany({
        where: { orderId: order.id },
        data: { status: 'PARTIAL_REFUND' },
      });

      /**
       * **وردُّ المال يُقيَّد.** الضمان يصير `PARTIAL_REFUND` والدفتر
       * لا يعلم — فيقول «لدى مزوّد الدفع» مبلغًا خرج نصفُه. والردّ
       * هنا **قبل الاستحقاق**: الطلب لم يُكمَل، فلا إيرادَ يُعكَس.
       */
      const { recordRefund } = await ledgerEvents();
      await recordRefund(
        prisma,
        {
          orderId: order.id,
          buyerId: order.buyerId,
          amount: new D('1500.00'),
          afterEarning: false,
        },
        new Date(openedAt.getTime() + 36 * 3600 * 1000),
      );
    } else {
      /**
       * ═══ والطلب يدخل `DISPUTED` بفتح النزاع ═══
       *
       * `openDispute` تكتبها في المعاملة نفسها، والبذرة كانت تترك
       * الطلب `ACTIVE`. والأثر **ماليّ لا تجميليّ**: لوحة المالية
       * تقرأ «المجمَّد بنزاع» من `escrow HELD AND order DISPUTED`،
       * فكانت تقول صفرًا وفي الضمان أربعةٌ وثمانون ألفًا مجمَّدة.
       *
       * ورقمٌ يُعرض على مستثمر ويقول صفرًا عن مالٍ مجمَّد أسوأ من
       * غيابه.
       */
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'DISPUTED' },
      });
    }
  }

  /** بلاغان على إعلانين — أحدهما مفتوحٌ والآخر مُغلق. */
  for (const [n, listing] of listings.slice(0, 2).entries()) {
    const reporter = buyers[n % buyers.length];
    if (reporter === undefined) continue;
    await prisma.report.create({
      data: {
        ref: `RPT-2026-${String(100 + n)}`,
        reporterId: reporter.id,
        targetType: 'listing',
        targetId: listing.id,
        reason: n === 0 ? 'سعرٌ مضلّل' : 'صورٌ لا تخصّ المركبة',
        details: n === 0 ? 'السعر المعروض أقلّ ممّا يطلبه البائع عند التواصل.' : null,
        status: n === 0 ? 'open' : 'closed',
        createdAt: days(-between(1, 12)),
      },
    });
  }

  // ————— تقريرا فحص كاملان — ٢١٠ نقطة لكلٍّ منهما —————
  /**
   * النقاط أسماء حقيقية لا معرّفات مصطنعة: تقرير فحص يقرؤه مشترٍ
   * ليقرّر شراءً، و«الهيكل والصبغ-١٧» لا يقول له شيئًا. الأسماء في
   * `prisma/seed-data/inspection-points.json` ومجموعها ٢١٠ بالضبط.
   */
  const POINTS = load<Record<string, { name: string; points: string[] }>>('inspection-points.json');

  /** الملاحظات المحدَّدة — الفاحص لا يكتب على كل نقطة، بل على ما يستحق. */
  const FINDINGS: Record<string, { state: string; note: string; photos: string[] }> = {
    'سماكة طلاء المصد الخلفي': {
      state: 'PAINT',
      note: 'سماكة الطلاء ١٨٠ ميكرون مقابل ١١٥ للقطع المجاورة — صبغ إصلاحي لا استبدال.',
      photos: ['inspection/rear-bumper-1.jpg'],
    },
    'مساعد أمامي أيسر': {
      state: 'NOTE',
      note: 'بداية ترشيح زيت دون تأثير على الأداء. يُنصح بالمتابعة خلال ١٠٬٠٠٠ كم.',
      photos: ['inspection/front-left-strut.jpg'],
    },
    'عمق نقشة الإطار الأمامي الأيمن': {
      state: 'NOTE',
      note: 'عمق النقشة ٥٫٤ ملم مقابل ٦٫٢ لبقية الإطارات.',
      photos: ['inspection/front-right-tyre.jpg'],
    },
    'سماكة طلاء الرفرف الأمامي الأيمن': {
      state: 'PAINT',
      note: 'صبغ في الرفرف الأيمن — ٢٤٠ ميكرون.',
      photos: ['inspection/right-fender.jpg'],
    },
  };

  const SECTION_SCORES: Record<string, number> = {
    engine: 96,
    transmission: 94,
    brakes: 89,
    tyres: 91,
    body: 86,
    electric: 95,
  };

  const SECTION_NOTES: Record<string, string> = {
    engine: 'ضغط متساوٍ على الأسطوانات، لا تسريب زيت.',
    transmission: 'تعشيق سلس، لا اهتزاز عند التسارع.',
    brakes: 'الأقراص الأمامية ٧٢٪ من العمر، ومساعد أمامي أيسر بداية ترشيح.',
    tyres: 'الإطارات الأمامية بعمر سنتين، والخلفية بثلاث.',
    body: 'هيكل سليم بلا حوادث مسجّلة. صبغ على المصد الخلفي فقط.',
    electric: 'جميع الأنظمة تعمل، وشحن البطارية ضمن المدى.',
  };

  const inspectionServiceId = services.get('inspection') as string;

  /**
   * ═══ تقريرُ فحصٍ في كل نوع بيع ═══
   *
   * كان التقريران كلاهما على `listings[0]` و`listings[1]`، **وهما
   * بيعٌ مباشر**. فشاشةُ تقرير الفحص — وهي من أثقل ما في المنتج:
   * درجةٌ وأقسامٌ ومخطّط هيكلٍ وملاحظات — **لا تُرى في مزادٍ ولا في
   * مساومة** في أيّ بيئة مزروعة. وشارةُ «مفحوصة» لا تظهر على كرت
   * مزادٍ قطّ، والمزاد أحوجُ ما يكون إليها: من يحجز عربونًا على
   * مركبةٍ لم يرَها يشتري التقرير قبل السيارة.
   *
   * فواحدٌ من كل نوع — ومن أوائل القائمة، فالطلبات تُبنى عليها
   * فتظهر البطاقة بشارتها في الرئيسية والبحث معًا.
   */
  const inspectables: ListingRef[] = (['DIRECT', 'NEGOTIATION', 'AUCTION'] as const)
    .map((type) => listings.find((row) => row.type === type))
    .filter((row): row is ListingRef => row !== undefined);

  for (let i = 0; i < inspectables.length; i += 1) {
    const l = inspectables[i] as ListingRef;
    const request = await prisma.serviceRequest.create({
      data: {
        ref: `SRV-2026-${String(3000 + i)}`,
        serviceId: inspectionServiceId,
        userId: l.sellerId,
        listingId: l.id,
        vehicleId: l.vehicleId,
        providerId: providers.get('INSPECTION') ?? null,
        status: 'DONE',
        amount: new D('450.00'),
        dueAt: days(-between(5, 20)),
        createdAt: days(-between(21, 40)),
      },
    });

    /** فارقُ هذا التقرير عن الأساس — صفرٌ للأوّل، ثم أعمقُ فأعمق. */
    const SECTION_DROP = [0, 14, 28][i] ?? 0;

    const sections = Object.entries(POINTS).map(([key, section]) => ({
      key,
      name: section.name,
      /**
       * ═══ والدرجة الكلّية من أقسامها ═══
       *
       * كانت درجاتُ الأقسام ثابتةً للتقارير الثلاثة والدرجةُ الكلّية
       * مكتوبةً بيد، فخرج تقريرٌ **كلّيُّه ٦٤ وكلُّ أقسامه ٨٦ فأعلى**
       * — ومتوسّطُها ٩٢. وتقريرٌ كهذا لا يُنتجه فاحص، والقارئ يرى
       * الرقمين فلا يصدّق أيًّا منهما.
       *
       * فالأقسام تهبط بفارقٍ واحد عن الأساس، والكلّيّة متوسّطُها.
       */
      score: Math.max(35, (SECTION_SCORES[key] ?? 90) - SECTION_DROP),
      note: SECTION_NOTES[key] ?? null,
      points: section.points.map((label, n) => {
        /**
         * الملاحظات لكل تقرير لا للأوّل وحده.
         *
         * وكان الثاني يحمل درجة ٨٧ **بلا ملاحظة واحدة** — تقريرٌ يقول
         * «٨٧ من ١٠٠» ثم لا يذكر ما نقص. والمشتري يقرأ الرقم ويبحث عن
         * سببه فلا يجده.
         */
        const finding = FINDINGS[label];
        return {
          id: `${key}-${n + 1}`,
          label,
          state: finding?.state ?? 'OK',
          note: finding?.note ?? null,
          photos: finding?.photos ?? [],
        };
      }),
    }));

    await prisma.inspectionReport.create({
      data: {
        ref: `INS-2026-${String(41800 + i)}`,
        serviceRequestId: request.id,
        vehicleId: l.vehicleId,
        /**
         * **منشورٌ لأن طالبه مالكُ المركبة** (قرار المالك ٤). والشرط
         * واحدٌ مع ما يقرؤه المنتج — لا رايةٌ تُكتب هنا بيد.
         */
        publishedAt: days(-between(5, 20)),
        /**
         * **ودرجاتٌ متباعدة** — فالشاشة تُرى في حالاتها: ممتازٌ
         * أخضر، ومقبولٌ أصفر، ودونه. ودرجةٌ واحدة لا تُظهر إلّا حالًا.
         */
        score: Math.round(
          sections.reduce((total, section) => total + section.score, 0) / sections.length,
        ),
        inspectorName:
          ['م. تركي الشمري', 'م. بدر المطيري', 'م. عبدالعزيز الحربي'][i] ?? 'م. فاحص',
        inspectedAt: days(-between(5, 20)),
        sections,
        paintMap: {
          summary:
            'هيكل سليم بلا حوادث مسجّلة. صبغ على المصد الخلفي فقط بسماكة ١٨٠ ميكرون. لا آثار لحام أو استبدال في أي قطعة أساسية.',
          frontBumper: 'original',
          hood: 'original',
          roof: 'original',
          trunk: 'original',
          rearBumper: i === 0 ? 'repainted' : 'original',
          frontRightFender: i === 0 ? 'repainted' : 'original',
          frontLeftFender: 'original',
          rightFrontDoor: 'original',
          leftFrontDoor: 'original',
          rightRearDoor: 'original',
          leftRearDoor: 'original',
        },
      },
    });
  }

  /**
   * ═══ وتقريرٌ دفع ثمنَه مشترٍ — خاصٌّ به ═══
   *
   * قرار المالك ٤: «تقرير البائع عامٌّ على الإعلان، وتقرير المشتري
   * خاصٌّ به حتى يشاركه أو يشتريه البائع». والثلاثة أعلاه كلُّها
   * طلبها بائعُها — **فالحالُ الخاصّ لم يُزرع قطّ**، وقد بقي الشرط
   * غائبًا من الاستعلام حتى قِيس: أيُّ زائر يرى تقريرَ من دفع.
   *
   * **وما لا يُزرع لا يُرى.**
   */
  const buyerInspected = listings.find(
    (row) => !inspectables.some((other) => other.id === row.id),
  );
  const reportBuyer = sellers.find((row) => row.id !== buyerInspected?.sellerId);
  if (buyerInspected !== undefined && reportBuyer !== undefined) {
    const request = await prisma.serviceRequest.create({
      data: {
        /**
         * **ولكلِّ عائلةِ مراجعَ كتلتُها المئوية.** كان هذا `3100`
         * وطابورُ المزوّد يبدأ من `3100 + n` — **فاصطدما عند `n = 0`
         * و`npm run db:seed` يسقط منذ `bac2d43`**: بيئةٌ جديدة لا
         * تُزرع أصلًا، ولا شيء في `verify` يمرّ بالبذرة فيقول.
         * والبوابة ٥٧ تمنع تقاطع الكتل.
         */
        ref: 'SRV-2026-3200',
        serviceId: inspectionServiceId,
        userId: reportBuyer.id,
        sellerId: buyerInspected.sellerId,
        listingId: buyerInspected.id,
        vehicleId: buyerInspected.vehicleId,
        providerId: providers.get('INSPECTION') ?? null,
        status: 'DONE',
        amount: new D('450.00'),
        dueAt: days(-4),
        createdAt: days(-12),
      },
    });

    await prisma.inspectionReport.create({
      data: {
        ref: 'INS-2026-41900',
        serviceRequestId: request.id,
        vehicleId: buyerInspected.vehicleId,
        score: 78,
        inspectorName: 'م. تركي الشمري',
        inspectedAt: days(-4),
        /** **خاصٌّ**: طالبُه ليس مالكَ المركبة. */
        publishedAt: null,
        sections: Object.entries(POINTS).map(([key, section]) => ({
          key,
          name: section.name,
          score: Math.max(35, (SECTION_SCORES[key] ?? 90) - 12),
          note: SECTION_NOTES[key] ?? null,
          points: section.points.map((label, n) => {
            const finding = FINDINGS[label];
            return {
              id: `${key}-${n + 1}`,
              label,
              state: finding?.state ?? 'OK',
              note: finding?.note ?? null,
              photos: finding?.photos ?? [],
            };
          }),
        })),
        paintMap: {
          summary: 'هيكل سليم. صبغ على الباب الخلفي الأيمن بسماكة ١٦٠ ميكرون.',
          frontBumper: 'original',
          hood: 'original',
          roof: 'original',
          trunk: 'original',
          rearBumper: 'original',
          frontRightFender: 'original',
          frontLeftFender: 'original',
          rightFrontDoor: 'original',
          leftFrontDoor: 'original',
          rightRearDoor: 'repainted',
          leftRearDoor: 'original',
        },
      },
    });
  }

  /**
   * ═══ وطابورٌ فيه عمل ═══
   *
   * الطلبان أعلاه **منجَزان كلاهما**، فشاشة طلبات الخدمات تُفتح وكلُّ
   * شريحةٍ فيها صفر عدا «مكتملة» — والطابور الذي بُني لإسناد الطلبات
   * وملاحقة مهلها لا يُرى عاملًا في أيّ بيئة.
   *
   * فهذه خمسةٌ تملأ الحالات التي يُدار بها: جديدٌ بلا مزوّد ينتظر
   * الإسناد، ومُسنَدٌ في مهلته، وقيد تنفيذٍ **تجاوز مهلته**، وفاشلٌ،
   * ومستردّ. وكلُّها على خدماتٍ مختلفة فتُقرأ الشرائح بالنوع أيضًا.
   */
  const QUEUE: readonly {
    service: string;
    status: 'NEW' | 'ASSIGNED' | 'IN_PROGRESS' | 'FAILED' | 'REFUNDED';
    provider: 'INSPECTION' | 'SHIPPING' | 'DETAILING' | 'TRANSFER' | null;
    /** ساعاتٌ من الآن — سالبٌ يعني أن المهلة فاتت. */
    dueInHours: number;
    scheduledInHours: number | null;
  }[] = [
    { service: 'inspection', status: 'NEW', provider: null, dueInHours: 20, scheduledInHours: 28 },
    { service: 'shipping', status: 'ASSIGNED', provider: 'SHIPPING', dueInHours: 44, scheduledInHours: 50 },
    /**
     * **ومُسنَدٌ إلى مزوّده** — كان `provider: null` وحالُه
     * `IN_PROGRESS`: طلبٌ «قيد التنفيذ» لا مزوّدَ له، فلا يراه أحدٌ في
     * طابوره ولا يُنهيه أحد. وهو متأخّرٌ بتسع ساعات في لوحة المهل إلى
     * الأبد.
     */
    { service: 'ownership_transfer', status: 'IN_PROGRESS', provider: 'TRANSFER', dueInHours: -9, scheduledInHours: -2 },
    /**
     * **وفحصٌ مُسنَدٌ وآخرُ جارٍ** — وكانا ناقصين، فشاشةُ نموذج الفحص
     * لا تُفتح على بياناتٍ مزروعة أصلًا: كلُّ فحصٍ في الزرع منتهٍ.
     * وهو نمطُ «ما لا يُزرع لا يُرى» المسجَّل: كلُّ قيمةِ تعدادٍ
     * يكتبها المنتج تُزرع.
     */
    { service: 'inspection', status: 'ASSIGNED', provider: 'INSPECTION', dueInHours: 30, scheduledInHours: 36 },
    { service: 'inspection', status: 'IN_PROGRESS', provider: 'INSPECTION', dueInHours: 18, scheduledInHours: 6 },
    { service: 'inspection', status: 'FAILED', provider: 'INSPECTION', dueInHours: -60, scheduledInHours: -72 },
    { service: 'detailing', status: 'REFUNDED', provider: 'DETAILING', dueInHours: -96, scheduledInHours: -100 },
  ];

  /**
   * **وصاحبُ الصفقة المكتملة هو من يُعطى طلبَ الخدمة.** فحسابٌ واحد
   * يجمع طلبَ شراءٍ بوثائقه وطلبَ خدمةٍ بتقريره — ومشيُ السطح يدخل
   * بحسابٍ واحد، فإن تفرّقا بقيت إحدى الشاشتين بلا قياسٍ قطّ:
   * `/account/orders/[ref]/documents/[kind]` أو `/account/reports/[ref]`.
   */
  const docBuyer = prisma.order.findFirst({
    where: { agreement: { isNot: null } },
    select: { buyerId: true },
  });

  for (const [n, plan] of QUEUE.entries()) {
    const serviceId = services.get(plan.service);
    const l = listings[n + 2] as ListingRef | undefined;
    if (serviceId === undefined || l === undefined) continue;
    const price = servicePrices.get(plan.service) ?? new D('450.00');

    /**
     * ═══ وطلبٌ يطلبه مشترٍ له طلبُ شراء — وكان الصنفان منفصلين ═══
     *
     * كلُّ طلبِ خدمةٍ هنا `userId: l.sellerId`، وكلُّ طلبِ شراءٍ
     * لمشترٍ — **فلا حسابَ في البيئة يجمع الاثنين**. ومشيُ السطح
     * يدخل بحسابٍ واحد، فإن اختار مشتريًا بقيت `/account/reports/[ref]`
     * **بلا قياسٍ قطّ**، وإن اختار بائعًا بقيت صفحات الطلبات.
     *
     * والشكلُ صحيحٌ في النطاق أصلًا: مشترٍ يفحص سيارة غيره —
     * `userId` من طلب، و`sellerId` صاحبُ المركبة.
     */
    const asBuyer = n === 0 ? ((await docBuyer)?.buyerId ?? l.sellerId) : l.sellerId;

    await prisma.serviceRequest.create({
      data: {
        ref: `SRV-2026-${String(3100 + n)}`,
        serviceId,
        userId: asBuyer,
        listingId: l.id,
        vehicleId: l.vehicleId,
        /** و`null` تعني طلبًا على مركبةِ صاحبه — فلا إذنَ يلزم */
        sellerId: asBuyer === l.sellerId ? null : l.sellerId,
        providerId: plan.provider === null ? null : (providers.get(plan.provider) ?? null),
        status: plan.status,
        amount: price,
        city: l.city,
        dueAt: hours(plan.dueInHours),
        scheduledAt: plan.scheduledInHours === null ? null : hours(plan.scheduledInHours),
        createdAt: hours(plan.dueInHours - 48),
      },
    });
  }

  // ————— مواعيد المعاينة —————
  /**
   * ═══ وكلُّ حالٍ تُزرع ═══
   *
   * **ما لا يُزرع لا يُرى**: حالٌ لا تفتحها شاشةٌ قطّ تسكن فيها عيوبٌ
   * شهورًا — وقعت في الطلب الملغى فكشفت تسعة مواضع. فالستُّ كلُّها
   * هنا: ينتظر، ومؤكَّد، ومعتذَرٌ عنه، وملغًى بكلا الطرفين، ومنقضٍ،
   * وتامّ.
   *
   * **والمشتري من له طلبُ شراءٍ وطلبُ خدمة** — فحسابٌ واحد يجمع
   * الثلاثة، ومشيُ السطح يدخل بحسابٍ واحد.
   */
  const viewingBuyer = (await docBuyer)?.buyerId ?? buyers[0]?.id ?? null;
  const viewable = listings.filter((row) => row.sellerId !== viewingBuyer).slice(0, 7);

  if (viewingBuyer !== null && viewable.length >= 7) {
    const PLAN = [
      { status: 'REQUESTED', days: 2, period: 'AFTERNOON', meeting: null, reason: null, by: null },
      /**
       * **واقترح البائع موعدًا آخر** — والدورُ على المشتري. ونقطةُ
       * اللقاء مكتوبةٌ ومخفيّةٌ حتى يقبل، فالاقتراحُ كاملٌ لا نصفُه.
       */
      {
        status: 'COUNTERED',
        days: 4,
        period: 'NOON',
        meeting: 'مواقف مجمّع العثيم، مخرج ٩، الرياض.',
        reason: null,
        by: null,
      },
      {
        status: 'CONFIRMED',
        days: 3,
        period: 'EVENING',
        meeting: 'محطة بترومين، تقاطع طريق الملك عبدالعزيز مع الأمير سلطان، حيّ الملقا.',
        reason: null,
        by: null,
      },
      {
        status: 'DECLINED',
        days: 1,
        period: 'MORNING',
        meeting: null,
        reason: 'السيارة عند وكالة الصيانة هذا الأسبوع. أقترح بعد العصر يوم السبت.',
        by: null,
      },
      { status: 'CANCELLED', days: 1, period: 'NOON', meeting: null, reason: null, by: 'BUYER' },
      { status: 'EXPIRED', days: -4, period: 'EVENING', meeting: null, reason: null, by: null },
      {
        status: 'COMPLETED',
        days: -7,
        period: 'AFTERNOON',
        meeting: 'مواقف نادي الحي، شارع الأمير ماجد.',
        reason: null,
        by: null,
      },
    ] as const;

    for (const [n, plan] of PLAN.entries()) {
      const l = viewable[n] as ListingRef;
      const day = new Date(NOW.getTime() + plan.days * 86_400_000);
      await prisma.viewing.create({
        data: {
          ref: `VIW-2026-${String(9100 + n)}`,
          listingId: l.id,
          buyerId: viewingBuyer,
          sellerId: l.sellerId,
          status: plan.status,
          onDate: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())),
          period: plan.period,
          buyerNote: n === 0 ? 'أصل من الدمام نهاية الأسبوع — أفضّل بعد العصر.' : null,
          /** وما طلبه المشتري قبل الاقتراح — فيُقرأ الفرق لا الموعدُ وحده */
          originalDate:
            plan.status === 'COUNTERED'
              ? new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() - 2))
              : null,
          originalPeriod: plan.status === 'COUNTERED' ? 'EVENING' : null,
          meetingPoint: plan.meeting,
          declineReason: plan.reason,
          cancelledBy: plan.by,
          respondedAt: plan.status === 'REQUESTED' ? null : hours(-6),
          createdAt: hours(plan.days * 24 - 48),
        },
      });
    }
  }

  // ————— مواضع الأسئلة الشائعة —————
  for (const f of load<FaqRow[]>('faqs.json')) {
    await prisma.faqItem.create({
      data: {
        key: f.key ?? null,
        questionAr: f.questionAr,
        questionEn: f.questionEn,
        answerAr: f.answerAr,
        answerEn: f.answerEn,
        category: f.category,
        sort: f.sort,
        placements: {
          create: f.placements.map((p, n) => ({
            surface: p.surface,
            listingType: p.listingType,
            condition: (p.condition ?? Prisma.DbNull) as Prisma.InputJsonValue,
            sort: n,
          })),
        },
      },
    });
  }

  // ————— القوالب والمساحات الإعلانية —————
  /**
   * **والقناة قبل القالب.** صار القالب يحمل `pushChannelKey` بمفتاحٍ
   * أجنبيّ، فزرعُه قبل قنواته يسقط على قيدٍ مرجعيّ — والترتيب هنا
   * يحترم المفاتيح كما يحترمه المسح.
   */
  await prisma.pushChannel.createMany({
    data: load<PushChannelRow[]>('push-channels.json'),
  });

  await prisma.notificationTemplate.createMany({
    data: load<TemplateRow[]>('notification-templates.json'),
  });
  // ————— بوابات الدفع وتوجيه الأغراض (A20) —————
  await prisma.paymentGateway.createMany({
    data: load<GatewayRow[]>('payment-gateways.json').map((g) => ({
      ...g,
      status: g.status as 'ACTIVE' | 'INACTIVE' | 'DEGRADED',
    })),
  });
  const routingAdmin = (await prisma.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } })).id;
  await prisma.paymentRoute.createMany({
    data: [
      // الضمان يحتاج ٣٠ يومًا — والمصرفية وحدها تبلغها
      { purpose: 'VEHICLE_ESCROW', gatewayKey: 'bank_escrow', environment: 'TEST', enabled: true, updatedBy: routingAdmin, updatedAt: NOW },
      { purpose: 'AUCTION_DEPOSIT', gatewayKey: 'bank_escrow', environment: 'TEST', enabled: true, updatedBy: routingAdmin, updatedAt: NOW },
      { purpose: 'TRANSFER_FEE', gatewayKey: 'bank_escrow', environment: 'TEST', enabled: true, updatedBy: routingAdmin, updatedAt: NOW },
      // تحصيل فوري بلا حجز
      { purpose: 'WALLET_TOPUP', gatewayKey: 'moyasar', environment: 'TEST', enabled: true, updatedBy: routingAdmin, updatedAt: NOW },
      { purpose: 'SERVICE_PURCHASE', gatewayKey: 'tap', environment: 'TEST', enabled: true, updatedBy: routingAdmin, updatedAt: NOW },
      // معطّل — كل الباقات مجانية
      { purpose: 'SUBSCRIPTION', gatewayKey: 'moyasar', environment: 'TEST', enabled: false, updatedBy: routingAdmin, updatedAt: NOW },
    ],
  });

  // ————— مفضّلات وبحوث محفوظة — بلاها لا تُقاس شريحة ولا تُختبر —————
  const buyerPool = await prisma.user.findMany({
    where: { dealerId: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  const publishedListings = await prisma.listing.findMany({
    where: { status: 'PUBLISHED' },
    select: { id: true },
    orderBy: { ref: 'asc' },
  });

  for (const [index, buyer] of buyerPool.entries()) {
    // ثلثا المشترين لهم مفضّلة — والباقي بلاها ليبقى للشريحة معنًى
    if (index % 3 === 2 || publishedListings.length === 0) continue;
    const count = between(1, 3);
    for (let n = 0; n < count; n += 1) {
      const listing = publishedListings[(index * 3 + n) % publishedListings.length];
      if (listing === undefined) continue;
      await prisma.favorite.upsert({
        where: { userId_listingId: { userId: buyer.id, listingId: listing.id } },
        create: { userId: buyer.id, listingId: listing.id, createdAt: days(-between(1, 40)) },
        update: {},
      });
    }
  }

  // ————— شرائح وحملة — القواعد تُحوسَب وقت الإرسال لا الآن —————
  const superAdminId = (await prisma.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } })).id;
  const favouriteSegment = await prisma.segment.create({
    data: {
      key: 'has_favourites',
      nameAr: 'لديه مفضلة نشطة',
      rules: [{ field: 'hasFavorites' }],
      createdBy: superAdminId,
      createdAt: days(-20),
    },
  });
  await prisma.segment.create({
    data: {
      key: 'added_no_listing',
      nameAr: 'أضاف مركبة ولم يعلن',
      rules: [{ field: 'hasVehicle' }, { field: 'hasListing', negate: true }],
      createdBy: superAdminId,
      createdAt: days(-14),
    },
  });
  await prisma.campaign.create({
    data: {
      nameAr: 'عاد سعر سيارة في مفضلتك',
      channels: ['push'],
      segmentId: favouriteSegment.id,
      status: 'DRAFT',
      createdBy: superAdminId,
      createdAt: days(-6),
    },
  });

  // موافقة التسويق — تُطلب ولا تُفترض، فثلث المستخدمين وافقوا
  const consenting = await prisma.user.findMany({ select: { id: true } });
  await prisma.user.updateMany({
    where: { id: { in: consenting.filter((_, i) => i % 3 === 0).map((u) => u.id) } },
    data: { marketingConsent: true, marketingConsentAt: days(-30) },
  });
  await prisma.adSlot.createMany({
    data: load<AdSlotRow[]>('ad-slots.json').map((s) => ({
      ...s,
      basePrice: new D(s.basePrice),
    })),
  });

  // ————— جهات التمويل (قرار ١٤: عرض وحساب فقط) —————
  await prisma.financeProvider.createMany({
    data: (
      [
        ['الراجحي', 'Al Rajhi Bank'],
        ['البلاد', 'Bank Albilad'],
        ['الرياض', 'Riyad Bank'],
        ['الإنماء', 'Alinma Bank'],
        ['الجزيرة', 'Bank Aljazira'],
        ['الأهلي', 'SNB'],
        ['عبداللطيف جميل', 'Abdul Latif Jameel'],
        ['إمكان', 'Emkan Finance'],
      ] as const
    ).map(([nameAr, nameEn], i) => ({
      nameAr,
      nameEn,
      downPaymentPct: new D('20.00'),
      months: 60,
      profitRatePct: new D(String(4 + i * 0.25)),
      sort: i + 1,
    })),
  });

  // ————— التكاملات (A11) —————
  await prisma.integration.createMany({
    data: [
      ['otp_sms', 'رسائل التحقّق', 'Unifonic', 'INFRASTRUCTURE', 'ACTIVE', 'التحويل للاحتياطي خلال ٣٠ ثانية'],
      ['nafath', 'النفاذ الوطني', 'Nafath', 'IDENTITY', 'INACTIVE', 'المسار اليدوي دائمًا متاح'],
      /**
       * ═══ بوّابتان لا واحدة — قرار المالك ٢٠٢٦-١٠-١٤ ═══
       *
       * الأولى حسابُ تاجرٍ عاديّ لبيع المركبات: ضمانٌ وعمولةٌ ورسوم نقل.
       * والثانية **منصّةٌ متعدّدة التجّار** لخدمات المزوّدين: تُسجَّل فيها
       * حساباتُهم وتوزَّع عليها الدفعات، فيصل المال إليهم مباشرةً
       * وحصّتُنا تُقتطع في الدفعة نفسها.
       *
       * وحسابان مختلفان بإمكاناتٍ مختلفة، فمدخلان لا مدخل.
       */
      ['payments', 'بوابة الدفع للمنصّة', 'Moyasar', 'PAYMENT', 'INACTIVE', 'رسالة واضحة وإعادة محاولة'],
      ['moyasar_platform', 'بوابة الدفع للمزوّدين', 'Moyasar Platform', 'PAYMENT', 'INACTIVE', 'الخدمة تبقى تُطلب ويتأخّر التحصيل'],
      ['vin_lookup', 'بيانات المركبة', 'Tamm', 'GOVERNMENT', 'INACTIVE', 'فتح الإدخال اليدوي'],
      // سجلُّ المنشأة وعقدُ التأسيس والمفوَّضون — بالرقم الموحَّد
      ['lean', 'سجل المنشأة', 'Lean', 'GOVERNMENT', 'INACTIVE', 'فتح الإدخال اليدوي'],
      ['mojaz', 'تقارير موجز', 'Mojaz', 'GOVERNMENT', 'INACTIVE', 'ردّ المبلغ تلقائيًا'],
      ['r2', 'الوسائط', 'Cloudflare R2', 'INFRASTRUCTURE', 'ACTIVE', 'عرض من الذاكرة المؤقتة'],
      ['email', 'البريد المعاملاتي', 'Resend', 'INFRASTRUCTURE', 'INACTIVE', 'طابور إعادة إرسال'],
    ].map(([key, nameAr, provider, category, status, failureBehavior]) => ({
      key: key as string,
      nameAr: nameAr as string,
      provider: provider as string,
      category: category as 'IDENTITY' | 'PAYMENT' | 'GOVERNMENT' | 'INFRASTRUCTURE',
      status: status as 'ACTIVE' | 'INACTIVE' | 'DEGRADED',
      failureBehavior: failureBehavior as string,
      lastCheckAt: status === 'ACTIVE' ? hours(-1) : null,
      lastCheckOk: status === 'ACTIVE' ? true : null,
    })),
  });

  // ————— قوالب نصوص SEO (قرار ٢٦) —————
  await prisma.seoTemplate.createMany({
    data: [
      {
        key: 'search_results',
        surface: 'search',
        titleAr: 'سيارات {brand} {model} {condition} في {city}',
        titleEn: '{condition} {brand} {model} cars in {city}',
        introAr:
          '{count} سيارة {model} معروضة في {city} بأسعار من {priceMin} إلى {priceMax} ريال، جميعها موثّقة الملكية.',
        introEn:
          '{count} {model} cars listed in {city}, priced from {priceMin} to {priceMax} SAR, all with verified ownership.',
        outroAr:
          'متوسط سعر {model} المستعملة في {city} {median} ريال، ويتفاوت حسب سنة الصنع والممشى ودرجة الفحص.',
        outroEn:
          'The median price for a used {model} in {city} is {median} SAR, varying with year, mileage and inspection score.',
        variables: [
          'brand',
          'model',
          'city',
          'condition',
          'count',
          'priceMin',
          'priceMax',
          'median',
        ],
      },
    ],
  });

  // ————— إحصاءات السعر (RangeBar — المئينات ١٠/٢٥/٥٠/٧٥/٩٠) —————
  /**
   * ═══ إحصاءُ السوق ليس متوسطَ مخزوننا ═══
   *
   * كانت تُجمَّع من إعلانات البذرة بمفتاح `model|year|bucket` — مفتاحٌ
   * ضيّق حتى إن أكثر مجموعاته **إعلانٌ واحد**. فتخرج مئيناتٌ متساوية
   * بحجم عيّنةٍ ١، ويرفضها `PRICE_STAT_MIN_SAMPLE = 8` كلَّها —
   * **فبطاقة «موقع السعر في السوق» لا تظهر على إعلانٍ واحد في المنتج**
   * وهي مبنيّةٌ بكاملها.
   *
   * وقِيس: أربعةٌ وخمسون إعلانًا ⇒ خمسون مجموعة، أكبرُها اثنان. فلا
   * مفتاحَ أضيقُ ولا أوسعُ يُنتج ثمانيةً — العيب في المصدر لا في المفتاح.
   *
   * **والأعمق أن الاشتقاق من مخزوننا دائريّ**: أن نقول لبائعٍ إن سعره
   * دون المتوسط ونعني متوسطَ *إعلاناتنا* ليس خبرًا عن السوق. وفي
   * الإنتاج تأتي هذه من وظيفةٍ تقرأ مبيعاتٍ منفَّذة في السوق — فتُزرع
   * هنا **مرجعًا مستقلًّا** بشكل الحقيقيّ: عيّنةٌ ذاتُ حجم، ومئيناتٌ
   * متباعدة.
   */
  const anchorByModel = new Map<string, number[]>();
  /** **والسنة جزءٌ من مفتاح البحث** — فيُكتب صفٌّ لكل (طراز، سنة) يقع. */
  const modelYears = new Set<string>();
  for (const l of listings) {
    const v = await prisma.vehicle.findUniqueOrThrow({
      where: { id: l.vehicleId },
      select: { modelId: true, year: true },
    });
    anchorByModel.set(v.modelId, [...(anchorByModel.get(v.modelId) ?? []), Number(l.askPrice)]);
    modelYears.add(`${v.modelId}|${String(v.year)}`);
  }

  /** تجزئةٌ ثابتة — فالزرع يُعيد الانحراف نفسه في كل تشغيل. */
  const hashOf = (value: string): number => {
    let total = 0;
    for (let n = 0; n < value.length; n += 1) total = (total * 31 + value.charCodeAt(n)) % 100_003;
    return total;
  };

  for (const key of modelYears) {
    const [modelId, yearText] = key.split('|');
    const prices = anchorByModel.get(modelId as string) ?? [];
    // الوسيط مرساةُ السوق، والتباعد حولها بنسبٍ معقولة لسوق السيارات
    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    if (median <= 0) continue;

    /**
     * ═══ ووسيطُ السوق ليس وسيطَ أسعارنا ═══
     *
     * كان الوسيط يُشتقّ من أسعار إعلاناتنا نفسها، وأكثرُ طرازٍ-سنة
     * له إعلانٌ واحد — **فالوسيط يساوي سعرَ الإعلان بالضبط**، وتقول
     * الشاشة «عند متوسّط السوق» لكلّ سيارة في المنتج. فمؤشّرٌ بُني
     * ليقول «أقلّ بسبعة آلاف» لا يقول شيئًا أبدًا.
     *
     * ووسيطُ السوق في الحقيقة من **صفقاتٍ مكتملة** لدى مزوّد بيانات،
     * لا من أسعار طلبنا. فينحرف عنها انحرافًا ثابتًا لكل طراز-سنة —
     * فتقع إعلاناتُنا فوقه وتحته كما تقع في السوق.
     */
    const drift = 0.9 + ((hashOf(`${modelId as string}|${yearText as string}`) % 21) / 100);
    const anchor = median * drift;

    const at = (ratio: number) => new D(String(Math.round((anchor * ratio) / 500) * 500));

    await prisma.priceStat.create({
      data: {
        modelId: modelId as string,
        year: Number(yearText),
        mileageBucket: 0,
        p10: at(0.82),
        p25: at(0.91),
        p50: at(1),
        p75: at(1.09),
        p90: at(1.18),
        /** حجمُ عيّنةٍ يشبه ما يأتي من مصدر سوق — لا عددَ إعلاناتنا. */
        sampleSize: between(14, 52),
        daysToSellMedian: between(12, 45),
        computedAt: NOW,
      },
    });
  }

  // ————— سجلّ التدقيق: كل إجراء أدمن يُكتب —————
  const superAdmin = admins[0] as (typeof admins)[number];
  await prisma.auditLog.create({
    data: {
      actorId: superAdmin.id,
      actorType: 'system',
      entity: 'Database',
      entityId: 'seed',
      action: 'seed.run',
      after: { appEnv: APP_ENV, at: NOW.toISOString() },
    },
  });

  /**
   * أنواع الهياكل — جدول **عرض** لا كيانات. المفاتيح من `BodyType`
   * نفسه، فلا مرجع جديد يمكن أن ينحرف عن التعداد. الصور الظلّية
   * يرفعها الأدمن في A12، والبطاقة تُعرض بالاسم وحده حتى ذلك الحين.
   */
  const BODY_TYPES = [
    { key: 'SEDAN', nameAr: 'سيدان', nameEn: 'Sedan', sort: 1 },
    { key: 'SUV', nameAr: 'دفع رباعي', nameEn: 'SUV', sort: 2 },
    { key: 'PICKUP', nameAr: 'بيك أب', nameEn: 'Pickup', sort: 3 },
    { key: 'HATCHBACK', nameAr: 'هاتشباك', nameEn: 'Hatchback', sort: 4 },
    { key: 'COUPE', nameAr: 'كوبيه', nameEn: 'Coupe', sort: 5 },
    { key: 'VAN', nameAr: 'فان', nameEn: 'Van', sort: 6 },
  ] as const;

  for (const body of BODY_TYPES) {
    await prisma.bodyTypeDisplay.upsert({
      where: { key: body.key },
      update: { nameAr: body.nameAr, nameEn: body.nameEn, sort: body.sort },
      create: { ...body },
    });
  }

  /**
   * المستندات القانونية — نسخة وتاريخ سريان لكل مستند. مستخدم قَبِل
   * شروط مارس محكومٌ بنصّها لا بنصّ اليوم، فالنسخة جزء من البيانات.
   */
  const LEGAL = load<Record<string, {
    titleAr: string; titleEn: string; version: string;
    summaryAr: string; summaryEn: string; sort: number; sections: unknown;
  }>>('legal.json');

  for (const [key, doc] of Object.entries(LEGAL)) {
    await prisma.legalDocument.upsert({
      where: { key },
      update: { ...doc, sections: doc.sections as never, effectiveAt: NOW },
      create: { key, ...doc, sections: doc.sections as never, effectiveAt: NOW },
    });
  }

  // ————— التقرير —————
  /**
   * ═══ أرقام العملاء — بترتيب الانضمام ═══
   *
   * وبلا هذه الخطوة يخرج نشرٌ جديد بعملاءَ **بلا رقمٍ يُعرفون به**:
   * الترحيل عبّأ الصفوف القائمة يومَ كُتب، ولا يمسّ ما يُزرع بعده.
   * فالزرع يمنحها كما يمنحها التسجيل.
   */
  const unnumbered = await prisma.user.findMany({
    where: { ref: null },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const perYear = new Map<number, number>();
  for (const user of unnumbered) {
    const year = user.createdAt.getFullYear();
    const taken = perYear.get(year) ?? (
      await prisma.user.count({ where: { ref: { startsWith: `CUS-${year}-` } } })
    );
    const next = taken + 1;
    perYear.set(year, next);
    await prisma.user.update({
      where: { id: user.id },
      data: { ref: `CUS-${year}-${String(next).padStart(4, '0')}` },
    });
  }

  const counts = {
    ماركة: await prisma.brand.count(),
    'نوع هيكل': await prisma.bodyTypeDisplay.count(),
    'مستند قانوني': await prisma.legalDocument.count(),
    طراز: await prisma.model.count(),
    فئة: await prisma.trim.count(),
    ميزة: await prisma.feature.count(),
    'ربط ميزة بفئة': await prisma.trimFeature.count(),
    معرض: await prisma.dealer.count(),
    مستخدم: await prisma.user.count(),
    'حساب أدمن': await prisma.adminUser.count(),
    مركبة: await prisma.vehicle.count(),
    إعلان: await prisma.listing.count(),
    صورة: await prisma.listingImage.count(),
    مزاد: await prisma.auction.count(),
    مزايدة: await prisma.bid.count(),
    طلب: await prisma.order.count(),
    فاتورة: await prisma.invoice.count(),
    'تقرير فحص': await prisma.inspectionReport.count(),
    خدمة: await prisma.service.count(),
    'سؤال شائع': await prisma.faqItem.count(),
    'قالب إشعار': await prisma.notificationTemplate.count(),
    'قناة دفع': await prisma.pushChannel.count(),
    'بوابة دفع': await prisma.paymentGateway.count(),
    'قاعدة ضريبية': await prisma.taxRule.count(),
    مفضّلة: await prisma.favorite.count(),
    'مساحة إعلانية': await prisma.adSlot.count(),
    'جهة تمويل': await prisma.financeProvider.count(),
    تكامل: await prisma.integration.count(),
    'إحصاء سعر': await prisma.priceStat.count(),
  };

  console.log('');
  /**
   * **كلمة المرور لا تُطبع حين تأتي من البيئة.**
   *
   * سجلّ الحاوية يقرؤه كل من يملك لوحة النشر، ويبقى محفوظًا فيها —
   * فطباعتها هناك تجعل سرًّا ضبطتَه بعناية مقروءًا لكل من يفتح
   * السجلّات، وإلى الأبد. ومن ضبطها يعرفها أصلًا.
   *
   * وفي التطوير تُطبع: الافتراضيّ معروفٌ في المستودع، وإخفاؤه إخفاءُ
   * ما لا يخفى.
   */
  console.log(
    process.env.ADMIN_PASSWORD === undefined
      ? `  حسابات الأدمن — كلمة المرور: ${seedPassword ?? ''}`
      : '  حسابات الأدمن — كلمة المرور: (من ADMIN_PASSWORD)',
  );
  console.log('');
  for (const [label, n] of Object.entries(counts)) {
    console.log(`  ${String(n).padStart(5)}  ${label}`);
  }
  console.log('');

  await prisma.$disconnect();
}

void main().catch(async (error: unknown) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
