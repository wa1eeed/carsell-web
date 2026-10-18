import { normalizeArabicLetters, normalizePlateNumbers } from '@/lib/plate';
import { db } from '@/lib/db';
import { nextListingRef } from './refs';
import { Prisma } from '@/generated/prisma/client';
import type {
  AccidentStatus,
  ChargePort,
  DocumentStatus,
  PaintStatus,
  PreviousOwners,
  RegistrationType,
} from '@/generated/prisma/enums';
import type {
  BodyType,
  Drivetrain,
  FuelType,
  ListingType,
  ReviewReason,
  Transmission,
  VehicleCondition,
  VehicleSpec,
} from '@/generated/prisma/enums';
import { findDuplicate } from './listing-images';
import { auctionSettings } from './admin-auction-settings';
import { SEAT_TAKING_STATUSES, sellingAllowance } from './entitlements';
import { LIVE_LISTING_STATUSES } from './garage';

/**
 * ═══ نشر الإعلان — والحارس معه لا بعده ═══
 *
 * **القرار ٣٣: الشروط الأربعة وحدها تُدخل المراجعة، ولا نشر بمراجعة
 * بشرية افتراضية.** ومسارُ نشرٍ يُبنى بلا تقييمها ينشر كل شيء فورًا،
 * وبين بنائه وحراسته نافذةٌ تكفي لنشرةٍ واحدة تفسد الفهرس.
 *
 * والشروط الثلاثة الأولى تُقيَّم هنا (الرابع بلاغٌ يرد لاحقًا):
 *
 *   ١· صورة مكرّرة > ٩٠٪ مع إعلان **مستخدم آخر**
 *   ٢· سعر دون ٤٠٪ من `PriceStat.p25`
 *   ٣· حساب عمره < ٧ أيام وله أكثر من ٣ إعلانات
 *
 * **ولا يُرفض شيء منها** — تُدخل المراجعة. فصاحب الإعلانين قد يعيد
 * الصورة بحسن نيّة، والسعر المنخفض قد يكون بيعًا مستعجلًا صادقًا.
 */

const NEW_ACCOUNT_DAYS = 7;
const NEW_ACCOUNT_MAX_LISTINGS = 3;
/** دون هذه النسبة من `p25` يُعدّ السعر شاذًّا — لا خطأً. */
const PRICE_OUTLIER_RATIO = 0.4;

export type PublishInput = {
  /**
   * ═══ مسودّة: تُحفظ ولا تُنشر ═══
   *
   * زرّ «احفظ كمسودة» كان **بلا `onClick` أصلًا** — يضغطه البائع بعد
   * سبع خطواتٍ ورفعِ صور فلا يقع شيء، ولا رسالة. وهو أسوأ من غيابه:
   * من ضغطه حسب عملَه محفوظًا فأغلق الصفحة.
   *
   * **والمسودّة لا تلتزم بشيء** — فلا تُشترط لها هويةٌ ولا آيبان ولا
   * وضعٌ ضريبيّ ولا صور: تلك شروطُ **العرض على الناس**، لا شروطُ أن
   * يحفظ المرء ما كتب. وتُشترط عند النشر حيث مكانها.
   */
  draft?: boolean;
  sellerId: string;
  type: ListingType;
  askPrice: number;
  /** وصف البائع — اختياريّ عند النشر، ويُحرَّر لاحقًا من «مركباتي». */
  description?: string;
  /** استثناء الإعلان الضريبيّ — `null` يتبع وضع البائع */
  /**
   * ═══ مركبةٌ قائمة في مرآب البائع ═══
   *
   * **ولولاها لكُتبت نسختان من سيارةٍ واحدة.** `createListing` كانت
   * تُنشئ `Vehicle` دائمًا، وزرُّ «اعرضها للبيع» في «سياراتي» يقود
   * إلى معالجٍ فارغ — فمن سجّل سيارته في حسابه ليطلب عليها فحصًا ثمّ
   * قرّر بيعها يملأ بياناتها ثانيةً، ويخرج بصفّين لمركبةٍ واحدة:
   * فحصُها على أحدهما وإعلانُها على الآخر.
   *
   * وحين تُمرَّر، **تُقرأ هويّةُ المركبة من صفّها لا من المُدخَل**:
   * الماركةُ والطرازُ والفئةُ والسنةُ والهيكل. والمُدخَل يحمل ما
   * يتغيّر وحده — الممشى واللون والمدينة واللوحة — وهي الحقول نفسها
   * التي يعدّلها `PATCH /api/v1/vehicles/{id}`.
   */
  vehicleId?: string;
  taxableSupply: boolean | null;
  vehicle: {
    brandId: string;
    modelId: string;
    /**
     * **الفئة إلزامية** — ومنها تُنسخ القيَم الموروثة: نوع الهيكل
     * والدفع وعدد المقاعد. وإدخالُها يدويًّا يعني أربعة حقول يخطئ
     * البائع في أحدها، والمخطّط نفسه يقول إنها «تُنسخ لقطةً وقت النشر».
     *
     * وكل طرازٍ في الكتالوج له فئات، فلا مسار بلا فئة.
     */
    trimId: string;
    year: number;
    mileageKm: number;
    /** يبقيان من إدخال البائع: النسخة قد تخالف الفئة القياسية */
    transmission: Transmission;
    fuel: FuelType;
    spec: VehicleSpec;
    condition: VehicleCondition;
    city: string;
    colorExterior: string;
    vin: string | null;
    /**
     * ═══ لوحةُ المركبة — وكان العمودان بلا كاتب ═══
     *
     * `Vehicle.plateLetters` و`plateNumbers` في المخطّط منذ بُني،
     * **ولا نموذجَ في المنتج كلّه يكتبهما** — تكتبهما البذرةُ وحدها.
     * فكلُّ مركبةٍ يُنشئها بائعٌ حقيقيّ بلا لوحة، وتقريرُ فحصها
     * ينقصه ما تُعرف به. (قرار المالك ٢٠٢٦-١٠-١٨.)
     *
     * واختياريّان: مركبةٌ لم تُسجَّل بعدُ حالٌ قائمة.
     */
    plateLetters?: string | null;
    plateNumbers?: string | null;
    /**
     * بطاقةٌ جمركية — **للجديدة التي لم تُسجَّل بعد**: لا لوحةَ لها
     * حتى تُسجَّل، وتُعرف بها. ولا تخرج في استجابةٍ عامّة.
     */
    customsCard?: string | null;
    /**
     * ═══ صفاتٌ أضافها المالك ٢٠٢٦-١٠-١٨ ═══
     *
     * **ولم يُبنَ منها ما كان قائمًا**: الدفعُ والسلندراتُ وسعةُ
     * المحرك في `Trim` منذ بُني المخطّط. وهذه ما نقص.
     */
    colorInterior?: string | null;
    paintStatus?: PaintStatus;
    /** وإقرارُ صاحبها عن تاريخها — للمستعملة وحدها. */
    accidentStatus?: AccidentStatus | null;
    previousOwners?: PreviousOwners | null;
    registrationType?: RegistrationType | null;
    /** **ولا تخرجان في استجابةٍ عامّة** — قرارُ المالك. */
    periodicInspection?: DocumentStatus | null;
    licenseStatus?: DocumentStatus | null;
    batteryKwh?: number | null;
    rangeKm?: number | null;
    chargePort?: ChargePort | null;
  };
  /** إظهارُ اللوحة مع الإعلان — اختيارُ البائع، وافتراضُه الإخفاء. */
  showPlate?: boolean;
  /**
   * **مفاتيح التخزين وحدها** — الترتيب هو ترتيب العرض.
   *
   * والبصمة تُقرأ من `UploadedAsset` لا من العميل: قبولُها منه يجعل
   * كشف التكرار حارسًا يُطفئه من يريد تجاوزه.
   */
  images: string[];
  /**
   * ═══ إعدادات المزاد — **وبدونها لا يُنشأ مزاد أصلًا** ═══
   *
   * البائع كان يختار «مزاد» في المعالج فيُكتب `type: AUCTION` على
   * الإعلان **ولا يُنشأ صفّ `Auction`** — ولا شيء في المنتج كلّه
   * يُنشئه إلّا البذرة. فصفحة المزاد ٤٠٤، وصفحة المركبة تحمل وسم
   * «مزاد» وتعرض «اشترِ الآن»: إعلانٌ يقول شيئًا ويفعل غيره.
   *
   * وعاشرُ مرّةٍ لنمط «قيمةٌ في المخطّط بلا كاتب».
   */
  auction?: {
    /** من المدد التي يسمح بها المشغّل — ولا يخترع البائع مدّة. */
    durationDays: number;
    /** `null` يعني «يبدأ فور النشر» — والموعد لا يكون في الماضي. */
    startsAt: string | null;
    /** مخفيٌّ عن كل مزايد — ولا يخرج في أي استجابة عامّة. */
    reservePrice: number | null;
    /** `null` يأخذ أدنى ما يسمح به المشغّل. */
    bidIncrement: number | null;
    /** «اشترِ الآن» — ويختفي متى بلغت المزايدات الاحتياطي. */
    buyNowPrice: number | null;
    /**
     * عربون المزايدة — `null` يأخذ افتراضيّ المشغّل.
     *
     * **ويرفعه البائع ولا يُلغيه**: عربونٌ أعلى يقلّل المزايدين ويرفع
     * جدّيتهم، والتصميم يوصي بـ٣–٥٪ من الاحتياطي لأنه يعكس القيمة
     * الحقيقية لا نقطة البداية.
     */
    depositAmount: number | null;
    /**
     * موقع المعاينة — **وكان يُقرأ ولا يُكتب**.
     *
     * صفحة المزاد تعرض «المعاينة متاحة في …» أو «لم يحدّد البائع موقع
     * معاينة»، والثانية كانت **الحال الوحيد الممكن** لأيّ مزادٍ ينشئه
     * بائع: لا حقل في المنتج كلّه يكتب الحقلين.
     *
     * والعنوان الدقيق لا يُعرض قبل تأكيد الموعد — والمدينة وحدها تُقال.
     */
    viewingCity: string | null;
    viewingAddress: string | null;
  };
  /**
   * إعدادات التفاوض — **و`minAcceptPrice` لم يكن لها كاتبٌ عند النشر**.
   *
   * النطاق يرفض العروض دونها تلقائيًّا، ومركز المساعدة يقول «البائع
   * يحدّد حدًّا أدنى مخفيًا» — ولا حقل في المعالج يسأله عنه. فالقاعدة
   * مبنيّةٌ ومشروحةٌ للمشتري ولا يملك البائع ضبطها إلّا بعد النشر.
   */
  negotiation?: {
    minAcceptPrice: number | null;
  };
};

export type PublishFailure =
  | 'PROFILE_INCOMPLETE'
  | 'TAX_STATUS_REQUIRED'
  | 'NO_IMAGES'
  | 'IMAGE_NOT_UPLOADED'
  | 'PRICE_INVALID'
  | 'BRAND_OR_MODEL_UNKNOWN'
  | 'TRIM_UNKNOWN'
  | 'VIN_ALREADY_LISTED'
  | 'AUCTION_SETTINGS_REQUIRED'
  | 'AUCTION_DURATION_INVALID'
  | 'AUCTION_STARTS_IN_PAST'
  | 'AUCTION_RESERVE_INVALID'
  | 'AUCTION_INCREMENT_TOO_SMALL'
  | 'AUCTION_BUY_NOW_INVALID'
  | 'AUCTION_DEPOSIT_INVALID'
  | 'MIN_ACCEPT_INVALID'
  | 'SALE_METHOD_NOT_ALLOWED'
  | 'LISTING_LIMIT_REACHED'
  /** **ولا يُفرَّق بين الغائبة ومركبةِ غيرك**: وجودُها ليس خبرًا يُعطى. */
  | 'VEHICLE_NOT_FOUND'
  | 'VEHICLE_ALREADY_LISTED';

export type PublishResult =
  | {
      ok: true;
      ref: string;
      status: 'PUBLISHED' | 'PENDING_REVIEW' | 'DRAFT';
      reviewReason: ReviewReason | null;
    }
  | { ok: false; reason: PublishFailure };

type Asset = { r2Key: string; phash: string; plateBlurred: boolean; qualityFlags: string[] };

/**
 * يحفظ ما أُدخل بحالة `DRAFT` — **ولا يُنشئ مزادًا ولا يفحص شيئًا**.
 *
 * والمزاد يُنشأ عند النشر: صفُّ `Auction` بمواعيده وعربونه التزامٌ
 * قائم، ومسودّةٌ تحمله تفتح مزادًا لم يُعلنه صاحبه.
 */
/**
 * ═══ حقول المركبة — تُكتب مرّة ═══
 *
 * كانت منسوخةً في `saveDraft` وفي `createListing`، والنسختان تختلفان
 * بالفعل: إحداهما تكتب `brandId` من المُدخَل والأخرى من الكتالوج،
 * وإحداهما بلا `city`. **ونسختان لحقول كيانٍ واحد تتباعدان أوّل حقلٍ
 * يُضاف** — ويُضاف إلى واحدة.
 *
 * وصار لها نادٍ ثالث: المرآب يُنشئ مركبةً بلا إعلان، فلا تُنسخ ثالثةً.
 */
/**
 * ═══ ما يتغيّر من المركبة بين تسجيلها وعرضها ═══
 *
 * الممشى يزيد، واللون يُصحَّح، والمدينة تنتقل، واللوحةُ قد تُدخَل
 * الآن وقد كانت فارغة. **وهي الحقول نفسها التي يفتحها
 * `PATCH /api/v1/vehicles/{id}`** — ولا ثالثَ لهما: قائمتان لما
 * يُعدَّل تتباعدان أوّلَ حقلٍ يُضاف إلى إحداهما.
 *
 * وما عداها هويّةٌ: الماركةُ والطرازُ والفئةُ والسنةُ والهيكل. من
 * غيّرها لم يصحّح سيارته، بل وضع مكانها سيارةً أخرى.
 */
export function mutableVehicleFields(
  input: Pick<PublishInput, 'vehicle'>,
): Prisma.VehicleUpdateInput {
  const plateLetters = normalizeArabicLetters(input.vehicle.plateLetters ?? '');
  const plateNumbers = normalizePlateNumbers(input.vehicle.plateNumbers ?? '');
  const customsCard = (input.vehicle.customsCard ?? '').trim();
  return {
    mileageKm: input.vehicle.mileageKm,
    colorExterior: input.vehicle.colorExterior,
    city: input.vehicle.city,
    transmission: input.vehicle.transmission,
    fuel: input.vehicle.fuel,
    spec: input.vehicle.spec,
    condition: input.vehicle.condition,
    /** **والفارغُ لا يمحو مخزَّنًا**: من ترك اللوحة لم يطلب حذفها. */
    ...(plateLetters === '' ? {} : { plateLetters }),
    ...(plateNumbers === '' ? {} : { plateNumbers }),
    ...(customsCard === '' ? {} : { customsCard }),
    ...(input.vehicle.colorInterior == null || input.vehicle.colorInterior.trim() === ''
      ? {}
      : { colorInterior: input.vehicle.colorInterior.trim() }),
    ...(input.vehicle.paintStatus === undefined ? {} : { paintStatus: input.vehicle.paintStatus }),
    ...(input.vehicle.accidentStatus == null
      ? {}
      : { accidentStatus: input.vehicle.accidentStatus }),
    ...(input.vehicle.previousOwners == null
      ? {}
      : { previousOwners: input.vehicle.previousOwners }),
    ...(input.vehicle.registrationType == null
      ? {}
      : { registrationType: input.vehicle.registrationType }),
    ...(input.vehicle.periodicInspection == null
      ? {}
      : { periodicInspection: input.vehicle.periodicInspection }),
    ...(input.vehicle.licenseStatus == null
      ? {}
      : { licenseStatus: input.vehicle.licenseStatus }),
    ...(input.vehicle.batteryKwh == null
      ? {}
      : { batteryKwh: new Prisma.Decimal(input.vehicle.batteryKwh) }),
    ...(input.vehicle.rangeKm == null ? {} : { rangeKm: input.vehicle.rangeKm }),
    ...(input.vehicle.chargePort == null ? {} : { chargePort: input.vehicle.chargePort }),
  };
}

/**
 * ═══ مركبةُ المرآب — تُحلّ أو تُردّ ═══
 *
 * **ولا يُفرَّق بين الغائبة ومركبةِ غيرك**: أن يعرف سائلٌ أنّ المعرّف
 * قائمٌ لسواه خبرٌ لا يُعطى. والجوابُ واحد في الحالين.
 *
 * **والمعروضةُ بالفعل تُردّ بسببها**: صاحبُها يعرف أنّها له، وإخفاءُ
 * السبب يجعله يعيد المحاولة. وهي القاعدةُ نفسُها التي تمنع سيارةً
 * بإعلانين — تُفسد كلّ عدّاد وكلّ إحصاء.
 */
async function resolveGarageVehicle(
  input: PublishInput,
): Promise<{ row: GarageVehicle } | { ok: false; reason: PublishFailure } | null> {
  if (input.vehicleId === undefined) return null;

  const row = await db.vehicle.findUnique({
    where: { id: input.vehicleId },
    select: {
      id: true, ownerId: true, brandId: true, modelId: true, trimId: true,
      year: true, vin: true,
      listings: { where: { status: { in: [...LIVE_LISTING_STATUSES] } }, select: { id: true } },
    },
  });
  if (row === null || row.ownerId !== input.sellerId) {
    return { ok: false, reason: 'VEHICLE_NOT_FOUND' };
  }
  if (row.listings.length > 0) return { ok: false, reason: 'VEHICLE_ALREADY_LISTED' };
  return { row };
}

type GarageVehicle = {
  id: string;
  ownerId: string;
  brandId: string;
  modelId: string;
  /** **وقد تكون بلا فئة**: المخطّط يسمح بها فارغة، والنشرُ لا يسمح. */
  trimId: string | null;
  year: number;
  vin: string | null;
};

export function vehicleFields(
  input: Pick<PublishInput, 'sellerId' | 'vehicle'>,
  catalogue: {
    brand: { id: string; nameAr: string };
    model: { id: string; nameAr: string };
    trim: { id: string; nameAr: string; bodyType: BodyType; drivetrain: Drivetrain; seats: number };
  },
): Prisma.VehicleUncheckedCreateInput {
  const { brand, model, trim } = catalogue;
  const vin = input.vehicle.vin;
  const entered = vin !== null && vin !== '';
  const plateLetters = normalizeArabicLetters(input.vehicle.plateLetters ?? '');
  const plateNumbers = normalizePlateNumbers(input.vehicle.plateNumbers ?? '');
  const customsCard = (input.vehicle.customsCard ?? '').trim();

  return {
    ownerId: input.sellerId,
    brandId: brand.id,
    modelId: model.id,
    trimId: trim.id,
    // لقطة الكتالوج وقت الإضافة — لا تُقرأ من `Trim` لاحقًا (قرار ٣٢)
    brandName: brand.nameAr,
    modelName: model.nameAr,
    trimName: trim.nameAr,
    year: input.vehicle.year,
    // موروثة من الفئة — لقطةً لا مرجعًا (قرار ٣٢)
    bodyType: trim.bodyType,
    drivetrain: trim.drivetrain,
    seats: trim.seats,
    // ومن إدخال البائع: نسخته قد تخالف الفئة القياسية
    transmission: input.vehicle.transmission,
    fuel: input.vehicle.fuel,
    mileageKm: input.vehicle.mileageKm,
    colorExterior: input.vehicle.colorExterior,
    spec: input.vehicle.spec,
    condition: input.vehicle.condition,
    city: input.vehicle.city,
    entryMode: entered ? 'VIN_LOOKUP' : 'MANUAL',
    /**
     * **وتُطبَّع قبل التخزين لا عند العرض**: «أ» و«ي» وأرقامٌ عربية
     * تَرِد من الاستمارة، والتخزينُ بالشكل المعتمد في جدول المرور —
     * فالبحثُ يُطابقها، ولا يُترك التطبيعُ لكلّ قارئٍ يفعله بنفسه.
     */
    ...(plateLetters === '' ? {} : { plateLetters }),
    ...(plateNumbers === '' ? {} : { plateNumbers }),
    ...(customsCard === '' ? {} : { customsCard }),
    ...(input.vehicle.colorInterior == null || input.vehicle.colorInterior.trim() === ''
      ? {}
      : { colorInterior: input.vehicle.colorInterior.trim() }),
    ...(input.vehicle.paintStatus === undefined ? {} : { paintStatus: input.vehicle.paintStatus }),
    ...(input.vehicle.accidentStatus == null
      ? {}
      : { accidentStatus: input.vehicle.accidentStatus }),
    ...(input.vehicle.previousOwners == null
      ? {}
      : { previousOwners: input.vehicle.previousOwners }),
    ...(input.vehicle.registrationType == null
      ? {}
      : { registrationType: input.vehicle.registrationType }),
    ...(input.vehicle.periodicInspection == null
      ? {}
      : { periodicInspection: input.vehicle.periodicInspection }),
    ...(input.vehicle.licenseStatus == null
      ? {}
      : { licenseStatus: input.vehicle.licenseStatus }),
    ...(input.vehicle.batteryKwh == null
      ? {}
      : { batteryKwh: new Prisma.Decimal(input.vehicle.batteryKwh) }),
    ...(input.vehicle.rangeKm == null ? {} : { rangeKm: input.vehicle.rangeKm }),
    ...(input.vehicle.chargePort == null ? {} : { chargePort: input.vehicle.chargePort }),
    ...(entered ? { vin } : {}),
  };
}

async function saveDraft(input: PublishInput, now: Date): Promise<PublishResult> {
  /**
   * **والمسودّةُ تمرّ بالحلّ نفسه.** لو خرجت قبله لكتبت نسخةً ثانية
   * من سيارةٍ في المرآب — والزرّ «احفظ كمسودة» قائمٌ في الخطوة
   * الثانية، فالطريقُ مسلوك. وأخطرُ ما فيه أنّ أثرَه لا يُرى: مركبتان
   * في «سياراتي» والمسودّةُ لا تظهر لأحد.
   */
  const existing = await resolveGarageVehicle(input);
  if (existing !== null && 'reason' in existing) return existing;

  const plan: PublishInput =
    existing === null
      ? input
      : {
          ...input,
          vehicle: {
            ...input.vehicle,
            brandId: existing.row.brandId,
            modelId: existing.row.modelId,
            trimId: existing.row.trimId ?? input.vehicle.trimId,
            year: existing.row.year,
            vin: existing.row.vin,
          },
        };

  /**
   * **والأسماء من الكتالوج لا من المُدخَل** — كما في النشر تمامًا.
   * وكتابةُ اسمٍ يرسله العميل تجعل الإعلان يقول ماركةً غير التي
   * يشير إليها معرّفه.
   */
  const [brand, model, trim] = await Promise.all([
    db.brand.findUnique({ where: { id: plan.vehicle.brandId } }),
    db.model.findUnique({ where: { id: plan.vehicle.modelId } }),
    db.trim.findUnique({ where: { id: plan.vehicle.trimId } }),
  ]);
  if (brand === null || model === null) return { ok: false, reason: 'BRAND_OR_MODEL_UNKNOWN' };
  if (trim === null) return { ok: false, reason: 'TRIM_UNKNOWN' };

  const { listing } = await db.$transaction(async (tx) => {
    const vehicle =
      existing === null
        ? await tx.vehicle.create({ data: vehicleFields(plan, { brand, model, trim }) })
        : await tx.vehicle.update({
            where: { id: existing.row.id },
            data: mutableVehicleFields(plan),
          });

    const ref = await nextListingRef(tx, now);
    const row = await tx.listing.create({
      data: {
        ref,
        vehicleId: vehicle.id,
        sellerId: input.sellerId,
        type: input.type,
        status: 'DRAFT',
        // سعرٌ لم يُكتب بعد يُحفظ صفرًا — والنشر يفحصه
        askPrice: new Prisma.Decimal(Number.isFinite(input.askPrice) ? input.askPrice : 0),
        ...(input.description === undefined || input.description.trim() === ''
          ? {}
          : { description: input.description.trim().slice(0, 4000) }),
        showPlate: input.showPlate ?? false,
        city: plan.vehicle.city,
      },
    });

    /**
     * **والصور تُربط بمالكها.** مفتاحٌ رفعه غيرك لا يصير صورتك بذكر
     * مفتاحه — والشرط هنا كما في النشر.
     */
    const owned = await tx.uploadedAsset.findMany({
      where: { r2Key: { in: input.images }, ownerId: input.sellerId },
    });
    if (owned.length > 0) {
      await tx.listingImage.createMany({
        data: owned.map((asset, index) => ({
          listingId: row.id,
          r2Key: asset.r2Key,
          sort: index,
          isCover: index === 0,
          phash: asset.phash,
          plateBlurred: asset.plateBlurred,
          qualityFlags: asset.qualityFlags,
        })),
      });
    }

    return { listing: row };
  });

  return { ok: true, ref: listing.ref, status: 'DRAFT', reviewReason: null };
}

/** أيّ شرطٍ من الثلاثة انطبق — و`null` يعني نشرًا مباشرًا. */
async function reviewReasonFor(
  input: PublishInput,
  assets: readonly Asset[],
  now: Date,
): Promise<ReviewReason | null> {
  /**
   * الترتيب مقصود: **الأخطر أوّلًا**. وصفٌّ واحد يحمل سببًا واحدًا،
   * فالذي يُكتب هو الذي يبدأ به المراجع.
   */
  for (const asset of assets) {
    const duplicate = await findDuplicate(asset.phash, { sellerId: input.sellerId });
    if (duplicate !== null) return 'DUPLICATE_IMAGE';
  }

  const stat = await db.priceStat.findFirst({
    where: { modelId: input.vehicle.modelId, year: input.vehicle.year },
    orderBy: { computedAt: 'desc' },
  });
  if (stat !== null && input.askPrice < Number(stat.p25) * PRICE_OUTLIER_RATIO) {
    return 'PRICE_OUTLIER';
  }

  const account = await db.user.findUnique({
    where: { id: input.sellerId },
    select: { createdAt: true },
  });
  if (account !== null) {
    const ageDays = (now.getTime() - account.createdAt.getTime()) / 86_400_000;
    if (ageDays < NEW_ACCOUNT_DAYS) {
      const count = await db.listing.count({ where: { sellerId: input.sellerId } });
      if (count > NEW_ACCOUNT_MAX_LISTINGS) return 'NEW_ACCOUNT_BURST';
    }
  }

  return null;
}

export async function createListing(
  input: PublishInput,
  now: Date = new Date(),
): Promise<PublishResult> {
  /**
   * **الوضع الضريبيّ شرطٌ قبل النشر** — كما هو قبل الشراء.
   *
   * والمعالج يفتح النافذة قبل النداء، لكن **حارسًا في العميل ليس
   * حارسًا**: نداءٌ مباشر ينشر إعلانًا لبائعٍ لم يُسأل، فيُعرض سعره
   * بوصفٍ اخترناه له. والخادم يردّ، والشاشة تسأل ثم تعيد المحاولة.
   */
  const seller = await db.user.findUnique({ where: { id: input.sellerId } });
  if (seller === null) return { ok: false, reason: 'PROFILE_INCOMPLETE' };

  /**
   * **والمسودّة تخرج من هنا** — قبل حُرّاس النشر كلِّهم. وما بعدها
   * يفحص ما يلزم للعرض على الناس: الهوية والآيبان والوضع الضريبيّ
   * والصور وإعدادات طريقة البيع. والمسودّة لا تُعرض على أحد.
   */
  if (input.draft === true) return saveDraft(input, now);

  /**
   * **الشاشة تقول «لن تستطيع البيع قبل إكمال الثلاثة» — فليكن.**
   * والقاعدة في `profileCompletion` وحدها فتتبعها الشاشة والحارس.
   *
   * // DESIGN-Q: الآيبان ضمن `canSell` — أيُشترط عند النشر أم يكفي قبل
   * الإفراج؟ التزمتُ بما تقوله الشاشة اليوم.
   */
  const { profileCompletion } = await import('./profile');
  if (!profileCompletion(seller).canSell) return { ok: false, reason: 'PROFILE_INCOMPLETE' };

  if (seller.taxStatus == null) return { ok: false, reason: 'TAX_STATUS_REQUIRED' };

  /**
   * ═══ وخصائصُ الباقة لم يكن يقرؤها أحد ═══
   *
   * عشرُ خصائص وشاشةُ أدمن تضبطها — **ولا سطر في المنتج
   * يسأل عن واحدة**، فمن مُنع من المزاد بتجاوزٍ يراه المشغّل
   * محفوظًا — وينشر مزادًا بعده بدقيقة.
   *
   * **والسؤال عن المفتاح لا عن الدور** (القاعدة الذهبية، §١٤):
   * لا «أتاجر هو؟» ولا «ما باقتُه؟».
   *
   * **والمسودّة خرجت قبلهما**: حدُّ المعروض لا يمنع أحدًا من أن
   * يحفظ ما كتب.
   */
  const allowance = await sellingAllowance(input.sellerId, now);
  if (!allowance.types[input.type]) return { ok: false, reason: 'SALE_METHOD_NOT_ALLOWED' };

  if (allowance.maxActiveListings >= 0) {
    const active = await db.listing.count({
      where: { sellerId: input.sellerId, status: { in: [...SEAT_TAKING_STATUSES] } },
    });
    if (active >= allowance.maxActiveListings) {
      return { ok: false, reason: 'LISTING_LIMIT_REACHED' };
    }
  }

  if (input.images.length === 0) return { ok: false, reason: 'NO_IMAGES' };
  if (!Number.isFinite(input.askPrice) || input.askPrice <= 0) {
    return { ok: false, reason: 'PRICE_INVALID' };
  }

  /**
   * ═══ إعدادات طريقة البيع — تُفحص قبل أن يُكتب شيء ═══
   *
   * **والحدود من إعدادات المشغّل لا من رقمٍ هنا**: أدنى فرقٍ بين
   * مزايدتين والمدد المسموحة والعربون كلُّها في لوحة المزادات، ونسخُها
   * هنا يُنتج مصدرَي حقيقةٍ يتباعدان أوّل تغيير.
   */
  const settings = input.type === 'AUCTION' ? await auctionSettings() : null;

  if (input.type === 'AUCTION') {
    const auction = input.auction;
    if (auction === undefined || settings === null) {
      return { ok: false, reason: 'AUCTION_SETTINGS_REQUIRED' };
    }

    if (!settings.durationsDays.includes(auction.durationDays)) {
      return { ok: false, reason: 'AUCTION_DURATION_INVALID' };
    }

    /**
     * **وموعدٌ في الماضي يُغلق المزاد قبل أن يُفتح.** والسماحُ دقيقةً
     * لفرق ساعة العميل عن الخادم: رفضُ «الآن» لمن ضغط «الآن» عبثٌ.
     */
    if (auction.startsAt !== null) {
      const at = Date.parse(auction.startsAt);
      if (!Number.isFinite(at) || at < now.getTime() - 60_000) {
        return { ok: false, reason: 'AUCTION_STARTS_IN_PAST' };
      }
    }

    /**
     * **والاحتياطي لا يقلّ عن سعر الافتتاح.** احتياطيٌّ دونه يُبلَغ
     * بأوّل مزايدة فلا معنى له، والبائع يظنّه حارسًا.
     */
    if (auction.reservePrice !== null) {
      if (!Number.isFinite(auction.reservePrice) || auction.reservePrice < input.askPrice) {
        return { ok: false, reason: 'AUCTION_RESERVE_INVALID' };
      }
    }

    if (auction.bidIncrement !== null) {
      if (
        !Number.isFinite(auction.bidIncrement) ||
        auction.bidIncrement < Number(settings.minIncrement)
      ) {
        return { ok: false, reason: 'AUCTION_INCREMENT_TOO_SMALL' };
      }
    }

    /**
     * **و«اشترِ الآن» فوق الاحتياطي.** دونه يشتري المشتري بأقلّ ممّا
     * قَبِل به البائع — بضغطةٍ واحدة قبل أيّ مزايدة.
     */
    if (auction.buyNowPrice !== null) {
      const floor = auction.reservePrice ?? input.askPrice;
      if (!Number.isFinite(auction.buyNowPrice) || auction.buyNowPrice < floor) {
        return { ok: false, reason: 'AUCTION_BUY_NOW_INVALID' };
      }
    }

    /**
     * ═══ العربون بين حدّين ═══
     *
     * **بصفرٍ تسقط جدّية المزايد** — يزايد ولا يخسر شيئًا بالانسحاب،
     * فيُعطَّل المزاد بلا كلفة. وبرُبع قيمة المركبة لا يزايد أحد.
     *
     * // DESIGN-Q: الحدّ الأعلى ١٥٪ من الاحتياطي اجتهادًا — والتصميم
     * يوصي بـ٣–٥٪ ولا يذكر سقفًا. أيُترك للبائع أم يُقيَّد بالتوصية؟
     */
    if (auction.depositAmount !== null) {
      const ceiling = Math.round((auction.reservePrice ?? input.askPrice) * 0.15);
      if (
        !Number.isFinite(auction.depositAmount) ||
        auction.depositAmount < Number(settings.minIncrement) ||
        auction.depositAmount > ceiling
      ) {
        return { ok: false, reason: 'AUCTION_DEPOSIT_INVALID' };
      }
    }
  }

  /**
   * **وحدُّ القبول لا يعلو السعر المعلن** — والقاعدة نفسها في
   * `updateOwnListing`. حدٌّ فوقه يرفض كل عرضٍ تلقائيًّا بما فيه
   * العرض بالسعر المطلوب، فيظنّ البائع أن لا أحد يعرض عليه.
   */
  const minAccept = input.negotiation?.minAcceptPrice ?? null;
  if (input.type === 'NEGOTIATION' && minAccept !== null) {
    if (!Number.isFinite(minAccept) || minAccept < 1000 || minAccept > input.askPrice) {
      return { ok: false, reason: 'MIN_ACCEPT_INVALID' };
    }
  }

  /**
   * ═══ مركبةُ المرآب تُحلّ قبل كلِّ ما يقرأ هويّتَها ═══
   *
   * فالكتالوجُ والرقمُ التسلسليّ وسببُ المراجعة ومدينةُ الإعلان
   * كلُّها تقرأ `input.vehicle` — فلو حُلّت بعدها لقرأت المُرسَل من
   * الشاشة لا المخزَّن، **فيكفي نداءٌ مباشر ببيانات أخرى ليُنشر
   * إعلانٌ يقول ماركةً والمركبةُ ماركةٌ ثانية**.
   */
  const existing = await resolveGarageVehicle(input);
  if (existing !== null && 'reason' in existing) return existing;

  const plan: PublishInput =
    existing === null
      ? input
      : {
          ...input,
          vehicle: {
            ...input.vehicle,
            /** الهويّةُ من الصفّ — ولا تُغيَّر بنشرٍ. */
            brandId: existing.row.brandId,
            modelId: existing.row.modelId,
            /** والفئةُ من الصفّ إن كانت — وإلّا فمن الاستمارة، والنشرُ يفحصها. */
            trimId: existing.row.trimId ?? input.vehicle.trimId,
            year: existing.row.year,
            vin: existing.row.vin,
          },
        };

  const [brand, model] = await Promise.all([
    db.brand.findUnique({ where: { id: plan.vehicle.brandId } }),
    db.model.findUnique({ where: { id: plan.vehicle.modelId } }),
  ]);
  if (brand === null || model === null) return { ok: false, reason: 'BRAND_OR_MODEL_UNKNOWN' };

  /**
   * **هيكلٌ معروض بالفعل يُوقِف.** سيارةٌ بإعلانين تُفسد كل عدّاد وكل
   * إحصاء، وهذا رفضٌ لا مراجعة: الرقم واحدٌ لا يحتمل تأويلًا.
   */
  if (plan.vehicle.vin !== null && plan.vehicle.vin !== '') {
    const listed = await db.vehicle.findFirst({
      where: {
        vin: plan.vehicle.vin,
        listings: { some: { status: { in: [...LIVE_LISTING_STATUSES] } } },
        /** **ومركبةُ المرآب ليست نسختَها**: الصفُّ نفسُه لا يُحسب تكرارًا. */
        ...(existing === null ? {} : { id: { not: existing.row.id } }),
      },
      select: { id: true },
    });
    if (listed !== null) return { ok: false, reason: 'VIN_ALREADY_LISTED' };
  }

  const trim = await db.trim.findUnique({ where: { id: plan.vehicle.trimId } });
  // الفئة تُملي الهيكل والدفع والمقاعد — وغيابُها يعني حقولًا لا مصدر لها
  if (trim === null || trim.modelId !== model.id) return { ok: false, reason: 'TRIM_UNKNOWN' };

  /**
   * الصور تُقرأ من الخادم بمفاتيحها — وصاحبها شرط: مفتاحٌ رفعه غيرك
   * لا يصير صورتك بذكر مفتاحه.
   */
  const rows = await db.uploadedAsset.findMany({
    where: { r2Key: { in: input.images }, ownerId: input.sellerId },
  });
  const assets = input.images
    .map((key) => rows.find((row) => row.r2Key === key))
    .filter((row): row is (typeof rows)[number] => row !== undefined);
  if (assets.length !== input.images.length) {
    return { ok: false, reason: 'IMAGE_NOT_UPLOADED' };
  }

  const reviewReason = await reviewReasonFor(plan, assets, now);

  return db.$transaction(async (tx): Promise<PublishResult> => {
    /**
     * **والقائمةُ تُحدَّث ولا تُستنسخ.** الممشى يزيد بين تسجيلِها
     * وعرضِها، واللوحةُ قد تُدخَل الآن وقد كانت فارغة — فما يتغيّر
     * يُكتب، والهويّةُ لا تُمسّ.
     */
    const vehicle =
      existing === null
        ? await tx.vehicle.create({ data: vehicleFields(plan, { brand, model, trim }) })
        : await tx.vehicle.update({
            where: { id: existing.row.id },
            data: mutableVehicleFields(plan),
          });

    const ref = await nextListingRef(tx, now);

    const listing = await tx.listing.create({
      data: {
        ref,
        vehicleId: vehicle.id,
        sellerId: input.sellerId,
        type: input.type,
        status: reviewReason === null ? 'PUBLISHED' : 'PENDING_REVIEW',
        reviewReason,
        // لحظة دخول الطابور — وبدونها لا يُقاس انتظارُ صاحبه
        reviewQueuedAt: reviewReason === null ? null : now,
        askPrice: new Prisma.Decimal(input.askPrice),
        ...(input.description === undefined || input.description.trim() === ''
          ? {}
          : { description: input.description.trim().slice(0, 4000) }),
        taxableSupply: input.taxableSupply,
        /** **واختيارُ الإظهار يُخزَّن** — ومعاملٌ يُرسَل ولا يُقرأ صمتٌ بعد نجاح. */
        showPlate: input.showPlate ?? false,
        negotiable: input.type === 'NEGOTIATION',
        /**
         * حدُّ القبول — **سرٌّ لا يخرج في أي استجابة عامّة**، ولم يكن
         * له كاتبٌ عند النشر رغم أن النطاق يرفض العروض دونه.
         */
        ...(minAccept === null ? {} : { minAcceptPrice: new Prisma.Decimal(minAccept) }),
        city: plan.vehicle.city,
        // تاريخ النشر يُكتب حين يُنشَر فعلًا — والمراجَع لم يُنشَر بعد
        publishedAt: reviewReason === null ? now : null,
      },
    });

    /**
     * ═══ والمزاد يُنشأ **مع** إعلانه لا بعده ═══
     *
     * خارج المعاملة نافذةٌ يكون فيها إعلانٌ نوعُه `AUCTION` بلا صفّ
     * مزاد — وصفحتُه تعرض «اشترِ الآن» بوسم «مزاد»، ونشرةٌ واحدة في
     * تلك النافذة تكفي. وهي القاعدة نفسها: «ما يحتاج حراسةً يُبنى
     * محروسًا».
     *
     * **وحالة البدء تُحسب لا تُفترض**: مزادٌ يبدأ فورًا يُكتب `LIVE`
     * مباشرةً — و`SCHEDULED` بموعدٍ ماضٍ تنتظر وظيفةً دورية قد لا
     * تمرّ قبل أن ينقضي وقتُه كلُّه، فيُغلق بلا مزايدةٍ واحدة.
     */
    if (input.type === 'AUCTION' && input.auction !== undefined && settings !== null) {
      const plan = input.auction;
      const startsAt = plan.startsAt === null ? now : new Date(plan.startsAt);
      const endsAt = new Date(startsAt.getTime() + plan.durationDays * 24 * 3600 * 1000);

      await tx.auction.create({
        data: {
          listingId: listing.id,
          startPrice: new Prisma.Decimal(input.askPrice),
          ...(plan.reservePrice === null
            ? {}
            : { reservePrice: new Prisma.Decimal(plan.reservePrice) }),
          bidIncrement: new Prisma.Decimal(plan.bidIncrement ?? Number(settings.minIncrement)),
          ...(plan.buyNowPrice === null
            ? {}
            : { buyNowPrice: new Prisma.Decimal(plan.buyNowPrice) }),
          depositAmount: new Prisma.Decimal(plan.depositAmount ?? Number(settings.defaultDeposit)),
          startsAt,
          endsAt,
          /** المدينة تُقال، والعنوان الدقيق بعد تأكيد الموعد. */
          ...(plan.viewingCity === null || plan.viewingCity.trim() === ''
            ? {}
            : { viewingCity: plan.viewingCity.trim().slice(0, 60) }),
          ...(plan.viewingAddress === null || plan.viewingAddress.trim() === ''
            ? {}
            : { viewingAddress: plan.viewingAddress.trim().slice(0, 200) }),
          /**
           * والمراجَع لا يُفتح مزادُه: إعلانٌ في الطابور يبقى مزادُه
           * `SCHEDULED` حتى يُعتمد — ولا يُزايَد على ما لم يُنشَر.
           */
          status:
            reviewReason !== null || startsAt.getTime() > now.getTime() ? 'SCHEDULED' : 'LIVE',
        },
      });
    }

    await tx.listingImage.createMany({
      data: assets.map((asset, index) => ({
        listingId: listing.id,
        r2Key: asset.r2Key,
        sort: index,
        isCover: index === 0,
        phash: asset.phash,
        plateBlurred: asset.plateBlurred,
        qualityFlags: asset.qualityFlags,
      })),
    });

    // رُبطت بإعلانها — فلا تبقى يتيمة في جدول المرفوعات
    await tx.uploadedAsset.deleteMany({ where: { r2Key: { in: input.images } } });

    return {
      ok: true,
      ref,
      status: reviewReason === null ? 'PUBLISHED' : 'PENDING_REVIEW',
      reviewReason,
    };
  });
}
