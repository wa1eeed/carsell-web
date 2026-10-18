import { currentUserFromCookies } from '@/lib/domain/account';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { parseFilters, searchListings } from '@/lib/domain/listings';
import { createListing, type PublishFailure } from '@/lib/domain/publish';
import {
  AccidentStatus,
  ChargePort,
  DocumentStatus,
  FuelType,
  ListingType,
  PaintStatus,
  PreviousOwners,
  RegistrationType,
  Transmission,
  VehicleCondition,
  VehicleSpec,
} from '@/generated/prisma/enums';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/v1/listings` — القسم ٦.
 *
 * عام بلا مصادقة. الفلاتر تُفكّ بنفس الدالة التي تستعملها الشاشة،
 * فالرابط المشترَك يعطي النتيجة نفسها في الاثنين.
 *
 * `data` بطاقات مُسلسَلة — لا كائن Prisma: `Listing` يحمل
 * `minAcceptPrice` و`Auction` يحمل `reservePrice`، وإرجاع الكائن
 * خامًا يسرّب سرًّا تجاريًا بسطر واحد لا يلتقطه مراجع بثبات.
 */
export async function GET(request: NextRequest) {
  const filters = parseFilters(request.nextUrl.searchParams);
  /**
   * **والجلسة تُقرأ وإن كان المسار عامًّا.** من دخل يرى بطاقاته
   * موسومةً «إعلانك»، ومن لم يدخل يراها كغيرها — ولا سرَّ في الوسم.
   */
  const viewer = await currentUserFromCookies();
  const result = await searchListings(filters, 'ar', viewer?.id ?? null);

  return ok(result.items, {
    total: result.total,
    page: result.page,
    totalPages: result.totalPages,
    nextCursor: result.nextCursor,
    facets: result.facets,
    priceRange: result.priceRange,
  });
}

/**
 * ═══ رسالةُ كل سبب — خريطةً لا سلسلةَ شروط ═══
 *
 * كانت سلسلةً من عشرة ثلاثيّاتٍ متداخلة تنتهي بـ«الماركة أو الطراز
 * غير معروف» افتراضًا — **فكلُّ سببٍ جديد يُولد برسالةٍ خاطئة**: من
 * يخطئ في مدّة المزاد يُقال له إن ماركته مجهولة.
 *
 * والخريطة تجعل النقص ظاهرًا: مفتاحٌ ناقص يسقط في الأنواع لا في وجه
 * المستخدم.
 */
const PUBLISH_ERROR: Record<
  PublishFailure,
  { ar: string; en: string; status: number }
> = {
  PROFILE_INCOMPLETE: {
    ar: 'أكمل ملفك — البريد وتوثيق الهوية والآيبان — قبل النشر.',
    en: 'Complete your profile — email, identity and IBAN — before publishing.',
    status: 428,
  },
  TAX_STATUS_REQUIRED: {
    ar: 'حدد وضعك الضريبي قبل النشر.',
    en: 'Set your tax status before publishing.',
    status: 428,
  },
  /**
   * **ولا يُقال «غير موجودة» لمركبةِ غيرك** — أن يعرف سائلٌ أنّ
   * المعرّف قائمٌ لسواه خبرٌ لا يُعطى. والجوابُ واحد في الحالين.
   */
  VEHICLE_NOT_FOUND: {
    ar: 'لم نجد هذه السيارة في سياراتك.',
    en: 'We could not find this car among yours.',
    status: 404,
  },
  VEHICLE_ALREADY_LISTED: {
    ar: 'هذه السيارة معروضة بالفعل — اسحب إعلانها القائم قبل عرضها من جديد.',
    en: 'This car is already listed — withdraw its current listing first.',
    status: 409,
  },
  VIN_ALREADY_LISTED: {
    ar: 'هذه المركبة معروضة بالفعل — اسحب الإعلان القائم أولا.',
    en: 'This vehicle is already listed — withdraw the existing listing first.',
    status: 409,
  },
  NO_IMAGES: { ar: 'أضف صورة واحدة على الأقل.', en: 'Add at least one photo.', status: 422 },
  IMAGE_NOT_UPLOADED: {
    ar: 'إحدى الصور لم ترفع أو ليست لك — أعد رفعها.',
    en: 'One of the photos was not uploaded or is not yours — upload it again.',
    status: 422,
  },
  PRICE_INVALID: { ar: 'أدخل سعرا صحيحا.', en: 'Enter a valid price.', status: 422 },
  TRIM_UNKNOWN: { ar: 'اختر فئة المركبة.', en: 'Choose the vehicle trim.', status: 422 },
  BRAND_OR_MODEL_UNKNOWN: {
    ar: 'الماركة أو الطراز غير معروف.',
    en: 'Unknown brand or model.',
    status: 422,
  },
  AUCTION_SETTINGS_REQUIRED: {
    ar: 'حدد مدة المزاد وموعد بدئه قبل النشر.',
    en: 'Set the auction duration and start time before publishing.',
    status: 422,
  },
  AUCTION_DURATION_INVALID: {
    ar: 'اختر مدة من المدد المتاحة.',
    en: 'Choose one of the available durations.',
    status: 422,
  },
  AUCTION_STARTS_IN_PAST: {
    ar: 'موعد البدء مضى — اختر وقتا قادما أو ابدأ فورا.',
    en: 'The start time has passed — pick a future time or start now.',
    status: 422,
  },
  AUCTION_RESERVE_INVALID: {
    ar: 'السعر الاحتياطي لا يقل عن سعر الافتتاح — وإلا بلغته أول مزايدة.',
    en: 'The reserve cannot be below the opening price — the first bid would meet it.',
    status: 422,
  },
  AUCTION_INCREMENT_TOO_SMALL: {
    ar: 'خطوة المزايدة أقل من الحد الأدنى المسموح.',
    en: 'The bid increment is below the allowed minimum.',
    status: 422,
  },
  AUCTION_DEPOSIT_INVALID: {
    ar: 'العربون خارج الحد — عالي يطرد المزايدين، ومنخفض يفقد المزايدة جديتها.',
    en: 'The deposit is out of range — too high drives bidders away, too low makes bidding costless.',
    status: 422,
  },
  AUCTION_BUY_NOW_INVALID: {
    ar: 'سعر «اشتر الآن» لا يقل عن الاحتياطي — وإلا بيعت السيارة بأقل مما قبلت به.',
    en: 'The buy-now price cannot be below the reserve — it would sell under your floor.',
    status: 422,
  },
  MIN_ACCEPT_INVALID: {
    ar: 'أقل سعر تقبله لا يعلو السعر المعلن — وإلا رفض كل عرض تلقائيا.',
    en: 'Your minimum cannot exceed the asking price — every offer would be auto-rejected.',
    status: 422,
  },
  /**
   * **والمنعُ يُقال بسببه لا بـ«غير مسموح»**: من يُمنع ولا يعرف لِمَ
   * يظنّه عطلًا فيعيد المحاولة، ومن يعرف يراجع باقته.
   */
  SALE_METHOD_NOT_ALLOWED: {
    ar: 'طريقة البيع هذه ليست ضمن باقتك — راجع خياراتك أو تواصل معنا.',
    en: 'This sale method is not included in your plan — review your options or contact us.',
    status: 403,
  },
  LISTING_LIMIT_REACHED: {
    ar: 'بلغت حد الإعلانات المعروضة في باقتك — اسحب إعلانا أو أوقفه لتنشر غيره.',
    en: 'You have reached your plan’s limit of live listings — withdraw or pause one to publish another.',
    status: 409,
  },
};

/**
 * ═══ طولان لا يُخلطان — ويُفرَضان في الخادم ═══
 *
 * **البطاقةُ الجمركية عشرةُ أرقام، ورقمُ الهيكل سبعةَ عشرَ خانةً**
 * فيها حروفٌ وأرقام (قولُ المالك ٢٠٢٦-١٠-١٨). ووثيقةُ تأمين المركبة
 * الجديدة تُفعَّل على البطاقة وتُربط بنجم والمرور — فمن كتب رقم
 * الهيكل مكانها لا يعرف أنّه أخطأ حتى تُرفض وثيقتُه.
 *
 * **والشاشةُ تمنعه، والخادمُ يفرضه**: حارسٌ في العميل ليس حارسًا،
 * ونداءٌ مباشر يكتب ما يشاء.
 */
const VIN = z.string().regex(/^[0-9A-Z]{17}$/, 'VIN_FORMAT');
const CUSTOMS_CARD = z.string().regex(/^[0-9]{10}$/, 'CUSTOMS_FORMAT');

const PublishBody = z.object({
  type: z.enum(ListingType),
  /**
   * **ومسودّةٌ لا تُنشر** — فلا تُشترط لها شروط العرض على الناس.
   * والحارس في النطاق لا هنا: حارسٌ في العميل ليس حارسًا.
   */
  draft: z.boolean().optional(),
  /**
   * ═══ سيارةٌ قائمة في «سياراتي» ═══
   *
   * **ولولاها لكُتب صفٌّ ثانٍ لسيارةٍ واحدة**: من سجّلها في حسابه
   * ليطلب عليها فحصًا ثمّ عرضها للبيع كان يخرج بمركبتين — فحصُها على
   * واحدة وإعلانُها على الأخرى.
   *
   * والهويّةُ تُقرأ من صفّها في النطاق لا من هذا الجسد.
   */
  vehicleId: z.string().min(1).max(40).optional(),
  askPrice: z.number().int().min(1).max(100_000_000),
  taxableSupply: z.boolean().nullable(),
  vehicle: z.object({
    brandId: z.string().min(1).max(40),
    modelId: z.string().min(1).max(40),
    trimId: z.string().min(1).max(40),
    year: z.number().int().min(1950).max(2100),
    mileageKm: z.number().int().min(0).max(2_000_000),
    /**
     * **التعدادات من المخطّط لا مكتوبةً بيد.**
     *
     * كتبتُها يدويًّا أوّلًا فاخترعتُ `WAGON` و`GULF` و`IMPORT` — ثلاثة
     * لا وجود لها. وقائمةٌ مكتوبة هنا مصدرُ حقيقةٍ ثانٍ ينحرف عن الأوّل
     * بصمت: تُضاف قيمة إلى المخطّط فيرفضها المسار، أو تُحذف فيقبلها.
     */
    transmission: z.enum(Transmission),
    fuel: z.enum(FuelType),
    spec: z.enum(VehicleSpec),
    condition: z.enum(VehicleCondition),
    city: z.string().min(1).max(60),
    colorExterior: z.string().min(1).max(40),
    vin: VIN.nullable(),
    /**
     * لوحةُ المركبة — اختياريّة: مركبةٌ لم تُسجَّل بعدُ حالٌ قائمة.
     * والتطبيعُ في النطاق لا هنا، فيُقبل ما يُلصق كما يُلصق.
     */
    plateLetters: z.string().max(20).nullable().optional(),
    plateNumbers: z.string().max(12).nullable().optional(),
    /** بطاقةٌ جمركية للجديدة التي لم تُسجَّل — ولا تظهر في استجابةٍ عامّة. */
    customsCard: CUSTOMS_CARD.nullable().optional(),
    /**
     * ═══ صفاتٌ أضافها المالك ٢٠٢٦-١٠-١٨ ═══
     *
     * **والحالتان لا تخرجان في استجابةٍ عامّة** — تُقرآن في لوحة
     * الأدمن وفي صفحة سيارة صاحبها وحدهما.
     */
    colorInterior: z.string().max(40).nullable().optional(),
    paintStatus: z.enum(PaintStatus).optional(),
    accidentStatus: z.enum(AccidentStatus).nullable().optional(),
    previousOwners: z.enum(PreviousOwners).nullable().optional(),
    registrationType: z.enum(RegistrationType).nullable().optional(),
    periodicInspection: z.enum(DocumentStatus).nullable().optional(),
    licenseStatus: z.enum(DocumentStatus).nullable().optional(),
    /** وبيانُ الكهربائية — يُرسَل لمن له بطارية. */
    batteryKwh: z.number().positive().max(400).nullable().optional(),
    rangeKm: z.number().int().positive().max(2000).nullable().optional(),
    chargePort: z.enum(ChargePort).nullable().optional(),
    /**
     * ما يقرّه البائع عن سيارته — **والنطاق يرشّحها بما في الكتالوج**،
     * فمفتاحٌ مخترَع لا يصير صفًّا. والفارغةُ تُرسَل: الشطبُ فعلٌ.
     */
    features: z.array(z.string().max(40)).max(120).optional(),
  }),
  /**
   * مفاتيح التخزين وحدها — والبصمة تُقرأ من الخادم لا من العميل.
   *
   * **ولا حدَّ أدنى هنا**: كان `.min(1)` يردّ المسودّة قبل أن يرى
   * النطاقُ رايتَها — ومسودّةٌ بلا صور حالٌ طبيعية (يُحفظ العمل عند
   * الخطوة الأولى). وشرطُ «صورةٌ واحدة على الأقل» قائمٌ في
   * `createListing` لمسار النشر وحده، حيث موضعه.
   */
  /** إظهارُ اللوحة مع الإعلان — اختيارُ البائع، وافتراضُه الإخفاء. */
  showPlate: z.boolean().optional(),
  images: z.array(z.string().min(1).max(300)).max(10),

  /**
   * ═══ إعدادات طريقة البيع ═══
   *
   * **والعقد كان بلا واحدٍ منها.** من ينشر «مزادًا» كان يُنشئ إعلانًا
   * نوعُه `AUCTION` بلا صفّ مزاد — فصفحتُه ٤٠٤ وبطاقتُه تعرض «اشترِ
   * الآن» تحت وسم «مزاد».
   *
   * والحدود تُفحص في النطاق مقابل إعدادات المشغّل، وهنا الشكلُ وحده:
   * قائمةٌ مكتوبة بالمدد هنا مصدرُ حقيقةٍ ثانٍ ينحرف عن اللوحة.
   */
  auction: z
    .object({
      durationDays: z.number().int().min(1).max(90),
      startsAt: z.string().datetime().nullable(),
      reservePrice: z.number().int().min(1).max(100_000_000).nullable(),
      bidIncrement: z.number().int().min(1).max(1_000_000).nullable(),
      buyNowPrice: z.number().int().min(1).max(100_000_000).nullable(),
      depositAmount: z.number().int().min(1).max(10_000_000).nullable(),
      /** المدينة تُقال للجميع، والعنوان الدقيق بعد تأكيد الموعد. */
      viewingCity: z.string().max(60).nullable(),
      viewingAddress: z.string().max(200).nullable(),
    })
    .optional(),

  negotiation: z
    .object({
      minAcceptPrice: z.number().int().min(1).max(100_000_000).nullable(),
    })
    .optional(),
});

/**
 * `POST /api/v1/listings` — نشر إعلان.
 *
 * **والحارس مع المسار لا بعده** (القرار ٣٣): ثلاثة شروط تُقيَّم عند
 * النشر وتُدخل المراجعة — ولا ترفض. ومسارٌ ينشر بلا تقييمها يفتح نافذةً
 * تكفي لنشرةٍ واحدة تفسد الفهرس.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = PublishBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    /**
     * **والحقل المُعلَّم هو الذي سقط.** كان الردّ يقول `askPrice`
     * مهما كان الساقط — فيُرسَل سعرٌ صحيح ويُقال «السعر خاطئ»،
     * ويُطارَد العطل في الحقل السليم. (وقع في مسودّةٍ ردّها
     * `images` وقال «السعر».)
     */
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues.slice(0, 6)) {
      fields[issue.path.join('.') || 'body'] = 'INVALID';
    }
    return fail(ERRORS.VALIDATION(fields), 422);
  }

  const result = await createListing({ ...parsed.data, sellerId: user.id });

  if (!result.ok) {
    const message = PUBLISH_ERROR[result.reason];
    return fail(
      { code: result.reason, messageAr: message.ar, messageEn: message.en },
      message.status,
    );
  }

  /**
   * الحالة تعود صراحةً: **«نُشر» و«قيد المراجعة» ليسا سواءً**، والشاشة
   * التي تقول «نُشر» عن إعلانٍ في الطابور تَعِد بما لم يقع.
   */
  return ok(
    { ref: result.ref, status: result.status, reviewReason: result.reviewReason },
    undefined,
    { status: 201 },
  );
}
