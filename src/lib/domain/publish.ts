import { db } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type {
  FuelType,
  ListingType,
  ReviewReason,
  Transmission,
  VehicleCondition,
  VehicleSpec,
} from '@/generated/prisma/enums';
import { findDuplicate } from './listing-images';

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
  sellerId: string;
  type: ListingType;
  askPrice: number;
  /** استثناء الإعلان الضريبيّ — `null` يتبع وضع البائع */
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
  };
  /**
   * **مفاتيح التخزين وحدها** — الترتيب هو ترتيب العرض.
   *
   * والبصمة تُقرأ من `UploadedAsset` لا من العميل: قبولُها منه يجعل
   * كشف التكرار حارسًا يُطفئه من يريد تجاوزه.
   */
  images: string[];
};

export type PublishFailure =
  | 'PROFILE_INCOMPLETE'
  | 'TAX_STATUS_REQUIRED'
  | 'NO_IMAGES'
  | 'IMAGE_NOT_UPLOADED'
  | 'PRICE_INVALID'
  | 'BRAND_OR_MODEL_UNKNOWN'
  | 'TRIM_UNKNOWN'
  | 'VIN_ALREADY_LISTED';

export type PublishResult =
  | { ok: true; ref: string; status: 'PUBLISHED' | 'PENDING_REVIEW'; reviewReason: ReviewReason | null }
  | { ok: false; reason: PublishFailure };

type Asset = { r2Key: string; phash: string; plateBlurred: boolean; qualityFlags: string[] };

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
   * **الشاشة تقول «لن تستطيع البيع قبل إكمال الثلاثة» — فليكن.**
   * والقاعدة في `profileCompletion` وحدها فتتبعها الشاشة والحارس.
   *
   * // DESIGN-Q: الآيبان ضمن `canSell` — أيُشترط عند النشر أم يكفي قبل
   * الإفراج؟ التزمتُ بما تقوله الشاشة اليوم.
   */
  const { profileCompletion } = await import('./profile');
  if (!profileCompletion(seller).canSell) return { ok: false, reason: 'PROFILE_INCOMPLETE' };

  if (seller.taxStatus == null) return { ok: false, reason: 'TAX_STATUS_REQUIRED' };

  if (input.images.length === 0) return { ok: false, reason: 'NO_IMAGES' };
  if (!Number.isFinite(input.askPrice) || input.askPrice <= 0) {
    return { ok: false, reason: 'PRICE_INVALID' };
  }

  const [brand, model] = await Promise.all([
    db.brand.findUnique({ where: { id: input.vehicle.brandId } }),
    db.model.findUnique({ where: { id: input.vehicle.modelId } }),
  ]);
  if (brand === null || model === null) return { ok: false, reason: 'BRAND_OR_MODEL_UNKNOWN' };

  /**
   * **هيكلٌ معروض بالفعل يُوقِف.** سيارةٌ بإعلانين تُفسد كل عدّاد وكل
   * إحصاء، وهذا رفضٌ لا مراجعة: الرقم واحدٌ لا يحتمل تأويلًا.
   */
  if (input.vehicle.vin !== null && input.vehicle.vin !== '') {
    const listed = await db.vehicle.findFirst({
      where: {
        vin: input.vehicle.vin,
        listings: { some: { status: { in: ['PUBLISHED', 'PENDING_REVIEW', 'RESERVED'] } } },
      },
      select: { id: true },
    });
    if (listed !== null) return { ok: false, reason: 'VIN_ALREADY_LISTED' };
  }

  const trim = await db.trim.findUnique({ where: { id: input.vehicle.trimId } });
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

  const reviewReason = await reviewReasonFor(input, assets, now);

  return db.$transaction(async (tx): Promise<PublishResult> => {
    const vehicle = await tx.vehicle.create({
      data: {
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
        entryMode: input.vehicle.vin === null || input.vehicle.vin === '' ? 'MANUAL' : 'VIN_LOOKUP',
        ...(input.vehicle.vin === null || input.vehicle.vin === ''
          ? {}
          : { vin: input.vehicle.vin }),
      },
    });

    const year = now.getFullYear();
    const count = await tx.listing.count({ where: { ref: { startsWith: `ADS${year}A` } } });
    const ref = `ADS${year}A${String(count + 1).padStart(4, '0')}`;

    const listing = await tx.listing.create({
      data: {
        ref,
        vehicleId: vehicle.id,
        sellerId: input.sellerId,
        type: input.type,
        status: reviewReason === null ? 'PUBLISHED' : 'PENDING_REVIEW',
        reviewReason,
        askPrice: new Prisma.Decimal(input.askPrice),
        taxableSupply: input.taxableSupply,
        negotiable: input.type === 'NEGOTIATION',
        city: input.vehicle.city,
        // تاريخ النشر يُكتب حين يُنشَر فعلًا — والمراجَع لم يُنشَر بعد
        publishedAt: reviewReason === null ? now : null,
      },
    });

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
