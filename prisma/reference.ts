import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '../src/generated/prisma/client';
import type { PrismaClient } from '../src/generated/prisma/client';
import type {
  BodyType,
  Drivetrain,
  FeatureGroup,
  FuelType,
  ProviderType,
  ServiceCategory,
  Transmission,
} from '../src/generated/prisma/enums';

/**
 * ═══ البياناتُ المرجعية — ما تحتاجه قاعدةٌ جديدة لتعمل ═══
 *
 * البذرةُ ترفض العمل على `APP_ENV=production` عمدًا: فيها سياراتٌ
 * ومستخدمون وهميّون. والإقلاع يُشغّل الترحيلات ومزامنةَ الأدمن وحدهما.
 * **فقاعدةُ إنتاجٍ جديدة تقلع بلا ماركةٍ ولا خدمةٍ ولا قاعدةِ ضريبة
 * ولا بوّابةِ دفع** — الموقع يعمل ولا يُستعمل: لا أحد ينشر إعلانًا،
 * ولا ضريبةَ تُحتسب، ولا فاتورةَ تصدر.
 *
 * وقِيس ٢٠٢٦-١١-٢٣: من ١٠٩ ترحيلات، **١٢ تحمل بيانات** وتغطّي قوالبَ
 * الإشعار وقنواتِ الدفع وقالبَ الفحص. والباقي كلُّه في البذرة.
 *
 * ═══ ويُدرج ولا يُحدِّث ═══
 *
 * كلُّ كتابةٍ هنا «أدرِج إن غاب» — لا `update` ولا `upsert` يكتب فوق
 * قيمة. **لأن المشغّل يعدّل هذه الصفوف من اللوحة**: سعرُ خدمةٍ غيّره،
 * أو قاعدةُ ضريبةٍ عطّلها، أو بنودُ خدمةٍ حرّرها. ومُمهِّدٌ يُحدِّث
 * يمحو عملَه في أوّل نشرٍ بعده، وهو الضررُ الذي تمنعه قاعدةُ
 * «البياناتُ المرجعية تصل القاعدةَ الحيّة بترحيل».
 *
 * فتشغيلُه آمنٌ في كلّ إقلاع: يزرع الناقصَ ويترك الموجود.
 */

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
  /** اختيارية: الفئة القياسية تصف الطراز كلَّه لا جيلًا منه. */
  yearFrom: number | null;
  yearTo: number | null;
};

type ModelRow = {
  nameAr: string;
  nameEn: string;
  yearFrom: number | null;
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

export type ReferenceSummary = Record<string, number>;

/**
 * مواصفةُ فئةٍ **كما هي في القاعدة** — لا كما في ملفّ JSON.
 *
 * فالشجرةُ تُعاد في الحالين: زُرعت الآن أو كانت موجودة. ولو بُني
 * المرجعُ من الملفّ لاختلف ما تقرؤه البذرةُ عمّا في القاعدة حين
 * يكون المشغّل قد عدّل فئةً من اللوحة.
 */
export type TrimSpec = {
  nameAr: string;
  bodyType: BodyType;
  transmission: Transmission;
  fuel: FuelType;
  drivetrain: Drivetrain;
  seats: number;
  engineL: Prisma.Decimal | null;
  horsepower: number | null;
  yearFrom: number | null;
  yearTo: number | null;
};

/** شجرةُ الكتالوج كما هي في القاعدة — تحتاجها البذرة لتصنع مركباتها. */
export type TrimRef = {
  id: string;
  row: TrimSpec;
  modelId: string;
  modelNameAr: string;
  brandId: string;
  brandNameAr: string;
};

const TRIM_SPEC = {
  nameAr: true,
  bodyType: true,
  transmission: true,
  fuel: true,
  drivetrain: true,
  seats: true,
  engineL: true,
  horsepower: true,
  yearFrom: true,
  yearTo: true,
} as const;

export type ReferenceResult = { planted: ReferenceSummary; trims: TrimRef[] };

/** المميّزاتُ المرتبطة بكل فئة — الأساسيّات وحدها (README في seed-data). */
export const BASE_FEATURES = ['abs', 'airbags_front', 'ac_auto', 'bluetooth'] as const;
export const FROM_2020_FEATURE = 'rear_camera';

/**
 * أنواعُ الهياكل — جدولُ **عرض** لا كيانات. المفاتيحُ من `BodyType`
 * نفسِه، فلا مرجعَ جديد ينحرف عن التعداد.
 */
const BODY_TYPES = [
  { key: 'SEDAN', nameAr: 'سيدان', nameEn: 'Sedan', sort: 1 },
  { key: 'SUV', nameAr: 'دفع رباعي', nameEn: 'SUV', sort: 2 },
  { key: 'PICKUP', nameAr: 'بيك أب', nameEn: 'Pickup', sort: 3 },
  { key: 'HATCHBACK', nameAr: 'هاتشباك', nameEn: 'Hatchback', sort: 4 },
  { key: 'COUPE', nameAr: 'كوبيه', nameEn: 'Coupe', sort: 5 },
  { key: 'VAN', nameAr: 'فان', nameEn: 'Van', sort: 6 },
] as const;

/** الخصائصُ التي تقرؤها الشيفرة بالاسم — والباقةُ تحمل قيمتَها. */
export const ENTITLEMENTS = [
  ['can_direct_sale', 'bool', 'true', 'إتاحة البيع المباشر'],
  ['can_negotiate', 'bool', 'true', 'إتاحة التفاوض بالعروض'],
  ['can_auction', 'bool', 'true', 'إتاحة إنشاء مزاد'],
  ['max_active_listings', 'int', '-1', 'سقف الإعلانات النشطة'],
  ['featured_slots', 'int', '0', 'عدد مرات التمييز المجانية'],
  ['bulk_upload', 'bool', 'false', 'الرفع الجماعي — لوحة التاجر'],
  ['team_seats', 'int', '0', 'مقاعد فريق المعرض'],
  ['commission_pct', 'percent', '0', 'نسبة العمولة'],
  ['deposit_required', 'bool', 'true', 'اشتراط العربون للمزايدة'],
  ['priority_support', 'bool', 'false', 'دعم ذو أولوية'],
] as const;

/**
 * ═══ الباقاتُ الثلاث — **مجانيّةٌ كلُّها اليوم** ═══
 *
 * التصميم (A29) يكتبها حرفيًّا: «٣ باقات · كلها مجانية اليوم». والسعرُ
 * صفرٌ **قرارًا لا نسيانًا**: من يزرع منصّةً لا يعرف بعد كم يأخذ،
 * ورقمٌ مزروع يُنتج اشتراكًا بسعرٍ لم يقرّره أحد.
 *
 * وما يفرّقها ليس السعر بل **قيَم خصائصها** — والكود يسأل عن الخاصّية
 * لا عن الباقة.
 */
const PLANS: readonly [string, string, string, Record<string, string | undefined>][] = [
  ['free', 'الأساسية', 'Basic', {}],
  ['dealer', 'معرض', 'Dealer', { team_seats: '5', featured_slots: '2' }],
  [
    'dealer_pro',
    'معرض احترافي',
    'Dealer Pro',
    { team_seats: '8', featured_slots: '6', bulk_upload: 'true', priority_support: 'true' },
  ],
];

const D = Prisma.Decimal;

/**
 * يزرع البياناتِ المرجعية في قاعدةٍ أيًّا كانت بيئتُها.
 *
 * `adminId` يُكتب محرِّرًا لقواعد الضريبة ومسارات الدفع — وهي أعمدةٌ
 * إلزامية. و`null` يعني «لا تزرعهما»: قاعدةٌ بلا أدمن بعد.
 */
export async function plantReference(
  prisma: PrismaClient,
  options: { adminId: string | null; now?: Date; activeFrom?: Date },
): Promise<ReferenceResult> {
  const now = options.now ?? new Date();
  /**
   * بدايةُ سريان القواعد — الضريبةُ والعمولة.
   *
   * **وتسبق `now` حيث تُزرع بياناتٌ ماضية**: `supplyVatPct(type, date)`
   * تنتقي القاعدةَ السارية في تاريخ الطلب، فقاعدةٌ تسري اليومَ لا
   * تُطبَّق على طلبٍ مؤرَّخٍ قبل شهر — فيخرج صفرًا بلا شكوى.
   */
  const activeFrom = options.activeFrom ?? now;
  const planted: ReferenceSummary = {};
  const note = (key: string, n: number): void => {
    if (n > 0) planted[key] = (planted[key] ?? 0) + n;
  };

  /**
   * ═══ صفّا الإعدادات — وغيابُهما يُسقط أوّلَ حفظ ═══
   *
   * `setTransferFee` و`saveAuctionSettings` تنادِيان `update` على
   * `id: 'default'`، فصفٌّ غائب يرمي لا يُنشأ.
   */
  const settings = await prisma.platformSetting.findUnique({ where: { id: 'default' } });
  if (settings === null) {
    await prisma.platformSetting.create({
      data: {
        id: 'default',
        transferFee: new D('350.00'),
        vatPct: new D('15.00'),
        supportEmail: 'info@carz.sa',
      },
    });
    note('إعدادات المنصة', 1);
  }

  const finance = await prisma.financeSetting.findUnique({ where: { id: 'default' } });
  if (finance === null) {
    await prisma.financeSetting.create({
      data: {
        id: 'default',
        downPaymentPct: new D('20.00'),
        months: 60,
        profitRatePct: new D('4.75'),
        minPrice: new D('30000.00'),
      },
    });
    note('إعدادات التمويل', 1);
  }

  // ═══ الخصائص والباقة المجانية ═══
  const entitlements = await prisma.entitlement.createMany({
    data: ENTITLEMENTS.map(([key, type, defaultValue, description]) => ({
      key,
      type,
      defaultValue,
      description,
    })),
    skipDuplicates: true,
  });
  note('خاصية', entitlements.count);

  for (const [key, nameAr, nameEn, overrides] of PLANS) {
    const existing = await prisma.plan.findUnique({ where: { key } });
    if (existing !== null) continue;
    await prisma.plan.create({
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
            value: overrides[entitlementKey] ?? defaultValue,
          })),
        },
      },
    });
    note('باقة', 1);
  }

  /**
   * ═══ قاعدتا العمولة — صفرٌ ومعطَّلتان ═══
   *
   * **والصفُّ يُزرع ولو كان صفرًا**: شاشةُ العمولة تقرأ أحدثَ قاعدةٍ
   * لكلّ طرف، وبلا صفٍّ لا تعرض حقلًا يُضبط — فالمشغّل لا يجد أين
   * يكتب نسبته. والقيمةُ قرارُ المالك، والصفُّ مقبضُه.
   */
  for (const side of ['SELLER', 'BUYER'] as const) {
    const rule = await prisma.commissionRule.findFirst({ where: { scope: 'global', side } });
    if (rule !== null) continue;
    await prisma.commissionRule.create({
      data: {
        scope: 'global',
        side,
        enabled: false,
        pct: new D('0'),
        fixedFee: new D('0'),
        activeFrom,
      },
    });
    note('قاعدة عمولة', 1);
  }

  /**
   * ═══ المميّزات — **وهي تُحذف من اللوحة فبوّابتُها على المجموعة** ═══
   *
   * `deleteFeature` في `catalog.ts` تحذف الميزةَ بمفتاحها. فلو أُدرج
   * الغائبُ منها صفًّا صفًّا عادت كلُّ ميزةٍ حذفها المشغّل في أوّل
   * إقلاع. والشرطُ «أفارغةٌ هي؟» كما في الكتالوج.
   */
  if ((await prisma.feature.count()) === 0) {
    const features = await prisma.feature.createMany({
      data: load<FeatureRow[]>('features.json'),
      skipDuplicates: true,
    });
    note('ميزة', features.count);
  }

  const bodyTypes = await prisma.bodyTypeDisplay.createMany({
    data: BODY_TYPES.map((row) => ({ ...row })),
    skipDuplicates: true,
  });
  note('نوع هيكل', bodyTypes.count);

  const trims = await plantCatalogue(prisma, note);

  // ═══ الضريبة — وبلا قاعدةٍ لا فاتورة تصدر ═══
  const adminId = options.adminId;
  if (adminId !== null) {
    const taxRules = await prisma.taxRule.count();
    if (taxRules === 0) {
      const rows = await prisma.taxRule.createMany({
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
          activeFrom,
          updatedBy: adminId,
          updatedAt: now,
        })),
      });
      note('قاعدة ضريبية', rows.count);
    }
  }

  // ═══ الخدمات ═══
  for (const service of load<ServiceRow[]>('services.json')) {
    const existing = await prisma.service.findUnique({ where: { key: service.key } });
    if (existing !== null) continue;
    await prisma.service.create({
      data: {
        key: service.key,
        nameAr: service.nameAr,
        nameEn: service.nameEn,
        descAr: service.descAr,
        descEn: service.descEn,
        includesAr: service.includesAr,
        includesEn: service.includesEn,
        price: new D(service.price),
        category: service.category,
        isAutomated: service.isAutomated,
        slaHours: service.slaHours,
        placements: service.placements,
        sort: service.sort,
        providerType: service.providerType,
      },
    });
    note('خدمة', 1);
  }

  /** **والقناة قبل القالب** — القالب يحمل `pushChannelKey` بمفتاحٍ أجنبيّ. */
  const channels = await prisma.pushChannel.createMany({
    data: load<PushChannelRow[]>('push-channels.json'),
    skipDuplicates: true,
  });
  note('قناة دفع', channels.count);

  const templates = await prisma.notificationTemplate.createMany({
    data: load<TemplateRow[]>('notification-templates.json'),
    skipDuplicates: true,
  });
  note('قالب إشعار', templates.count);

  // ═══ بوّابات الدفع وتوجيه الأغراض ═══
  const gateways = await prisma.paymentGateway.createMany({
    data: load<GatewayRow[]>('payment-gateways.json').map((row) => ({
      ...row,
      status: row.status as 'ACTIVE' | 'INACTIVE' | 'DEGRADED',
    })),
    skipDuplicates: true,
  });
  note('بوابة دفع', gateways.count);

  if (adminId !== null) {
    const routes = await prisma.paymentRoute.createMany({
      data: (
        [
          ['VEHICLE_ESCROW', 'bank_escrow', true],
          ['AUCTION_DEPOSIT', 'bank_escrow', true],
          ['TRANSFER_FEE', 'bank_escrow', true],
          ['WALLET_TOPUP', 'moyasar', true],
          ['SERVICE_PURCHASE', 'tap', true],
          ['SUBSCRIPTION', 'moyasar', false],
        ] as const
      ).map(([purpose, gatewayKey, enabled]) => ({
        purpose,
        gatewayKey,
        environment: 'TEST' as const,
        enabled,
        updatedBy: adminId,
        updatedAt: now,
      })),
      skipDuplicates: true,
    });
    note('مسار دفع', routes.count);
  }

  const slots = await prisma.adSlot.createMany({
    data: load<AdSlotRow[]>('ad-slots.json').map((row) => ({
      ...row,
      basePrice: new D(row.basePrice),
    })),
    skipDuplicates: true,
  });
  note('مساحة إعلانية', slots.count);

  // ═══ الأسئلة ومواضعها ═══
  for (const faq of load<FaqRow[]>('faqs.json')) {
    const existing =
      faq.key === null || faq.key === undefined
        ? await prisma.faqItem.findFirst({ where: { questionAr: faq.questionAr } })
        : await prisma.faqItem.findUnique({ where: { key: faq.key } });
    if (existing !== null) continue;
    await prisma.faqItem.create({
      data: {
        key: faq.key ?? null,
        questionAr: faq.questionAr,
        questionEn: faq.questionEn,
        answerAr: faq.answerAr,
        answerEn: faq.answerEn,
        category: faq.category,
        sort: faq.sort,
        placements: {
          create: faq.placements.map((placement, index) => ({
            surface: placement.surface,
            listingType: placement.listingType,
            condition: (placement.condition ?? Prisma.DbNull) as Prisma.InputJsonValue,
            sort: index,
          })),
        },
      },
    });
    note('سؤال شائع', 1);
  }

  /** **والمستندُ لا يُحدَّث**: من قبِل شروطَ أمس محكومٌ بنصِّها. */
  const legal = load<
    Record<
      string,
      {
        titleAr: string;
        titleEn: string;
        version: string;
        summaryAr: string;
        summaryEn: string;
        sort: number;
        sections: unknown;
      }
    >
  >('legal.json');
  for (const [key, doc] of Object.entries(legal)) {
    const existing = await prisma.legalDocument.findUnique({ where: { key } });
    if (existing !== null) continue;
    await prisma.legalDocument.create({
      data: { key, ...doc, sections: doc.sections as never, effectiveAt: now },
    });
    note('مستند قانوني', 1);
  }

  return { planted, trims };
}

/**
 * ═══ الكتالوج — **أوّلُ تعبئةٍ لا مزامنةٌ دائمة** ═══
 *
 * ماركةٌ فطرازٌ ففئة، وربطُ المميّزات الأساسية.
 *
 * **والبوّابةُ على المجموعة لا على الصفّ.** الماركةُ والطرازُ والفئةُ
 * والميزةُ **تُحذف من اللوحة** (قِيس: أربعُ دالّاتِ حذفٍ في
 * `catalog.ts`، ولا خامسةَ في سائر البيانات المرجعية). ومُمهِّدٌ
 * يُدرج صفًّا غائبًا يُعيد ماركةً حذفها المشغّل في أوّل إقلاعٍ بعده —
 * **فحذفُه يرتدّ بلا كلمة، ولا سبيل له أن يُثبته**. فالشرطُ «أفارغةٌ
 * هي؟»: قاعدةٌ بكرٌ تُعبَّأ مرّة، وقاعدةٌ فيها كتالوجٌ لا تُمَسّ أبدًا.
 *
 * **ويُعيد الشجرة كما هي في القاعدة** في الحالين — فالبذرة تحتاج
 * الفئات لتصنع مركباتها، زُرعت الآن أو كانت.
 *
 * والقوالبُ والبوّاباتُ وأمثالُها على العكس: لا تُحذف من اللوحة،
 * فالغائبُ منها نقصٌ حقيقيّ يُزرع — وقالبٌ ناقص يعرض مفتاحه الخام
 * في جرس المستخدم.
 */
async function plantCatalogue(
  prisma: PrismaClient,
  note: (key: string, n: number) => void,
): Promise<TrimRef[]> {
  if ((await prisma.brand.count()) > 0) return readCatalogue(prisma);

  const brands = load<BrandRow[]>('brands.json');
  const links: { trimId: string; featureKey: string; isDefault: boolean }[] = [];
  const trims: TrimRef[] = [];

  for (const b of brands) {
    const brand = await prisma.brand.create({
      data: {
        slug: b.slug,
        nameAr: b.nameAr,
        nameEn: b.nameEn,
        sort: b.sort,
        visible: b.visible,
        /** الشعارُ باسم المقطع — يُستبدل الملفّ بلا لمس شيفرةٍ ولا قاعدة. */
        logoUrl: `/brand-logos/${b.slug}.svg`,
      },
    });
    note('ماركة', 1);

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
      note('طراز', 1);

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
          select: { id: true, ...TRIM_SPEC },
        });
        note('فئة', 1);

        for (const key of BASE_FEATURES) {
          links.push({ trimId: trim.id, featureKey: key, isDefault: true });
        }
        /** والفارغُ لا يُقارن — فئةٌ بلا سنةٍ لا تدّعي كاميرا خلفية. */
        if (t.yearFrom !== null && t.yearFrom >= 2020) {
          links.push({ trimId: trim.id, featureKey: FROM_2020_FEATURE, isDefault: true });
        }

        const { id, ...spec } = trim;
        trims.push({
          id,
          row: spec,
          modelId: model.id,
          modelNameAr: m.nameAr,
          brandId: brand.id,
          brandNameAr: b.nameAr,
        });
      }
    }
  }

  if (links.length > 0) {
    const made = await prisma.trimFeature.createMany({ data: links, skipDuplicates: true });
    note('ربط ميزة بفئة', made.count);
  }
  return trims;
}

/** الشجرةُ القائمة — بلا كتابةٍ واحدة. */
async function readCatalogue(prisma: PrismaClient): Promise<TrimRef[]> {
  const rows = await prisma.trim.findMany({
    select: {
      id: true,
      ...TRIM_SPEC,
      model: { select: { id: true, nameAr: true, brand: { select: { id: true, nameAr: true } } } },
    },
    orderBy: { id: 'asc' },
  });
  return rows.map(({ id, model, ...spec }) => ({
    id,
    row: spec,
    modelId: model.id,
    modelNameAr: model.nameAr,
    brandId: model.brand.id,
    brandNameAr: model.brand.nameAr,
  }));
}
