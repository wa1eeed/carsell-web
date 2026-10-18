import { db } from '@/lib/db';
import { canonicalPath } from './listing-detail';
import { vehicleFields, type PublishInput } from './publish';
import { vehicleTitle } from './vehicle-title';

/**
 * ═══ المرآب — مركباتٌ يملكها صاحبُها ولم يعرضها ═══
 *
 * **والتصميم يعرفه منذ البداية**: بطاقة الحساب تقول «٣ مركباتي · ٢
 * معروضة · ١ في المرآب»، و«سياراتي» أوّل بنود الشريط الجانبيّ. ولوحة
 * الأدمن تعدّ شريحةً اسمُها `garage` معرَّفةً بأنها «مركبة بلا إعلان».
 *
 * **وكان العدّاد صفرًا بنيويًّا.** الطريق الوحيد لإنشاء مركبة هو النشر،
 * وهو يكتب صفَّ إعلانٍ معها دائمًا — حتى المسودّة تكتب `Listing` بحالة
 * `DRAFT`. فقِيس: ٦١ مركبة · ٦١ إعلانًا · **صفرٌ في المرآب**.
 *
 * وهو صنفُ «قيمةٌ في المخطّط بلا كاتب» الذي تكرّر في هذا المستودع —
 * لكنّه هنا أوسع: ليست قيمةً بل **شاشةٌ كاملة** يفترضها التصميم
 * ويعدّها الأدمن ولا يمكن أن توجد.
 *
 * ═══ والفرق بين المرآب والمسودّة ═══
 *
 * المسودّة إعلانٌ نصفُ مكتوب — نيّةُ بيعٍ لم تكتمل. والمرآب **ملكيّة
 * بلا نيّة بيع**: سيارةٌ أضافها صاحبُها ليطلب عليها فحصًا أو تأمينًا،
 * أو ليعرضها يومًا. فلا تُخلط إحداهما بالأخرى.
 */

export type AddVehicleFailure = 'BRAND_OR_MODEL_UNKNOWN' | 'TRIM_UNKNOWN';

export type AddVehicleResult =
  | { ok: true; vehicleId: string }
  | { ok: false; reason: AddVehicleFailure };

/**
 * يُنشئ مركبةً **بلا إعلان**.
 *
 * **ولا يشترط شيئًا ممّا يشترطه النشر**: لا هويةً ولا آيبان ولا وضعًا
 * ضريبيًّا ولا صورًا. تلك شروطُ العرض على الناس، لا شروطُ أن يسجّل
 * المرء سيارةً يملكها — وهي الحجّة نفسها المكتوبة للمسودّة.
 */
export async function addVehicle(
  input: Pick<PublishInput, 'sellerId' | 'vehicle'>,
): Promise<AddVehicleResult> {
  /** والأسماء من الكتالوج لا من المُدخَل — كما في النشر تمامًا. */
  const [brand, model, trim] = await Promise.all([
    db.brand.findUnique({ where: { id: input.vehicle.brandId } }),
    db.model.findUnique({ where: { id: input.vehicle.modelId } }),
    db.trim.findUnique({ where: { id: input.vehicle.trimId } }),
  ]);
  if (brand === null || model === null) return { ok: false, reason: 'BRAND_OR_MODEL_UNKNOWN' };
  if (trim === null) return { ok: false, reason: 'TRIM_UNKNOWN' };

  const vehicle = await db.vehicle.create({
    data: vehicleFields(input, { brand, model, trim }),
    select: { id: true },
  });

  return { ok: true, vehicleId: vehicle.id };
}

/**
 * ═══ حالُ المركبة في المرآب ═══
 *
 * `listed` معروضةٌ الآن · `garage` مملوكةٌ ولا إعلان حيًّا لها ·
 * `sold` بِيعت.
 *
 * **والمسودّة `garage`**: صاحبُها لم يعرضها على أحد، فعدُّها «معروضة»
 * يقول له إنها في السوق وهي ليست فيه.
 */
export type VehicleState = 'listed' | 'garage' | 'sold';

export type GarageVehicle = {
  id: string;
  title: string;
  year: number;
  city: string;
  mileageKm: number;
  /** ما يُعدَّل — تقرؤه الاستمارة بلا نداءٍ ثانٍ. */
  colorExterior: string;
  state: VehicleState;
  /** مرجع الإعلان الحيّ أو المُباع — ومنه يُفتح. و`null` لما في المرآب. */
  listingRef: string | null;
  /**
   * ═══ مسارُ إعلانها — لا قائمةُ الإعلانات ═══
   *
   * كان الصفّ يربط إلى «إعلاناتي»، فمن ينقر سيارةً بعينها يصل قائمةً
   * يبحث فيها عنها ثانيةً. والمسار **قانونيٌّ من أوّله**: يُبنى من
   * المقاطع لا من المرجع وحده، فلا تحويل ٣٠١ عند كل نقرة.
   */
  listingPath: string | null;
  listingStatus: string | null;
  /** طلبات خدمةٍ قائمة على هذه المركبة — فيعرف صاحبُها أن عليها عملًا. */
  openServices: number;
  /**
   * **أيمكن حذفها؟** معروضةٌ أو مفحوصة ⇒ لا. ويُحسب هنا فتعرفه الشاشة
   * قبل أن تعرض زرًّا — وزرٌّ يُرفض دائمًا أسوأ من غيابه.
   */
  canRemove: boolean;
};

/**
 * ═══ المعروضة — تعريفٌ واحد تقرؤه الشاشة واللوحة ═══
 *
 * **والمسودّة ليست معروضة**: لا يراها أحد، فعدُّها «معروضة» يقول
 * لصاحبها إنها في السوق وهي ليست فيه.
 *
 * وكانت اللوحة تعدّ **صفوف الإعلانات** لا المركبات، فمركبةٌ لها
 * إعلانان تُعدّ مرّتين، ومسودّةٌ تُخرج صاحبَها من المرآب. فقالت
 * الشاشة «٢ في المرآب» واللوحة «١» عن القاعدة نفسها.
 */
export const LIVE_LISTING_STATUSES = ['PUBLISHED', 'PENDING_REVIEW', 'RESERVED'] as const;

const LIVE = LIVE_LISTING_STATUSES;

export async function myVehicles(userId: string, locale: string): Promise<GarageVehicle[]> {
  const rows = await db.vehicle.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, year: true, city: true, mileageKm: true, colorExterior: true,
      brandName: true, modelName: true, trimName: true,
      brand: { select: { nameEn: true, slug: true } },
      model: { select: { nameEn: true } },
      trim: { select: { nameEn: true } },
      listings: {
        orderBy: { publishedAt: 'desc' },
        // المدينة من الإعلان لا من المركبة — فالمسار يُبنى بما بُني به
        select: { ref: true, status: true, city: true },
      },
      serviceRequests: {
        where: { status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS'] } },
        select: { id: true },
      },
      _count: { select: { listings: true, inspectionReports: true } },
    },
  });

  return rows.map((row) => {
    const sold = row.listings.find((listing) => listing.status === 'SOLD');
    const live = row.listings.find((listing) => (LIVE as readonly string[]).includes(listing.status));
    const shown = sold ?? live ?? null;

    return {
      id: row.id,
      title: vehicleTitle(row, locale),
      year: row.year,
      city: row.city,
      mileageKm: row.mileageKm,
      colorExterior: row.colorExterior,
      state: sold !== undefined ? 'sold' : live !== undefined ? 'listed' : 'garage',
      listingRef: shown?.ref ?? null,
      listingPath:
        shown === null || shown === undefined
          ? null
          : canonicalPath(locale, {
              ref: shown.ref,
              city: shown.city,
              vehicle: {
                brandName: row.brandName,
                modelName: row.modelName,
                brand: row.brand,
                model: row.model,
              },
            }).path,
      listingStatus: shown?.status ?? null,
      openServices: row.serviceRequests.length,
      canRemove: row._count.listings === 0 && row._count.inspectionReports === 0,
    };
  });
}

/** عدّادُ بطاقة الحساب — «٢ معروضة · ١ في المرآب» كما في التصميم. */
export function garageCounts(vehicles: readonly GarageVehicle[]): {
  total: number;
  listed: number;
  garage: number;
  sold: number;
} {
  return {
    total: vehicles.length,
    listed: vehicles.filter((vehicle) => vehicle.state === 'listed').length,
    garage: vehicles.filter((vehicle) => vehicle.state === 'garage').length,
    sold: vehicles.filter((vehicle) => vehicle.state === 'sold').length,
  };
}

/**
 * ═══ تعديل مركبة — ما يتغيّر منها وحده ═══
 *
 * **لا الماركة ولا الطراز ولا الفئة**: تلك لقطةُ الكتالوج وقت الإضافة
 * (قرار ٣٢)، وتغييرُها يجعل المركبة شيئًا آخر — ومن أخطأ فيها يحذفها
 * ويضيف غيرها. والذي يتغيّر حقًّا: الممشى (يزيد كل يوم) واللون (يُصبغ)
 * والمدينة (ينتقل صاحبها).
 */
export type EditVehicleFailure = 'NOT_YOURS' | 'BAD_MILEAGE';

export async function editVehicle(input: {
  userId: string;
  vehicleId: string;
  mileageKm: number;
  colorExterior: string;
  city: string;
}): Promise<{ ok: true } | { ok: false; reason: EditVehicleFailure }> {
  if (!Number.isInteger(input.mileageKm) || input.mileageKm < 0 || input.mileageKm > 2_000_000) {
    return { ok: false, reason: 'BAD_MILEAGE' };
  }

  /** **والملكية تُفحص في الاستعلام لا بعده** — فلا نافذةَ بين الفحص والكتابة. */
  const updated = await db.vehicle.updateMany({
    where: { id: input.vehicleId, ownerId: input.userId },
    data: {
      mileageKm: input.mileageKm,
      colorExterior: input.colorExterior.trim().slice(0, 40),
      city: input.city,
    },
  });

  if (updated.count === 0) return { ok: false, reason: 'NOT_YOURS' };
  return { ok: true };
}

/**
 * ═══ حذف مركبة — والمخطّط يكتب القاعدة ═══
 *
 * `Listing` و`InspectionReport` يشيران إلى المركبة بـ`onDelete: Restrict`.
 * **وهذا ليس قيدًا تقنيًّا بل قاعدةً صحيحة**: مركبةٌ عُرضت للبيع صارت
 * جزءًا من تاريخ السوق — عروضٌ وطلباتٌ ومشاهدات تشير إليها؛ ومركبةٌ
 * فُحصت لها تقريرٌ يقرؤه مشترٍ. فالمحذوف ما لم يُعرض ولم يُفحص: سيارةٌ
 * أُضيفت إلى المرآب ثم تبيّن أنها خطأ.
 *
 * **ويُفحص الشرط قبل المحاولة لا بعدها**: تركُ القاعدة ترمي يُخرج
 * رسالةً عن قيدٍ أجنبيّ لا يفهمها صاحب الحساب.
 */
export type RemoveVehicleFailure = 'NOT_YOURS' | 'HAS_LISTING' | 'HAS_INSPECTION';

export async function removeVehicle(input: {
  userId: string;
  vehicleId: string;
}): Promise<{ ok: true } | { ok: false; reason: RemoveVehicleFailure }> {
  const vehicle = await db.vehicle.findFirst({
    where: { id: input.vehicleId, ownerId: input.userId },
    select: {
      id: true,
      _count: { select: { listings: true, inspectionReports: true } },
    },
  });
  if (vehicle === null) return { ok: false, reason: 'NOT_YOURS' };
  if (vehicle._count.listings > 0) return { ok: false, reason: 'HAS_LISTING' };
  if (vehicle._count.inspectionReports > 0) return { ok: false, reason: 'HAS_INSPECTION' };

  await db.vehicle.delete({ where: { id: vehicle.id } });
  return { ok: true };
}

/**
 * ═══ سيارةٌ من المرآب تُعرض للبيع ═══
 *
 * **وزرُّ «اعرضها للبيع» كان يقود إلى معالجٍ فارغ**، و`createListing`
 * تُنشئ `Vehicle` دائمًا — فمن سجّل سيارته في حسابه ثمّ عرضها يخرج
 * بصفّين لسيارةٍ واحدة: فحصُها على أحدهما وإعلانُها على الآخر،
 * و«سياراتي» تعدّها اثنتين.
 *
 * فهذه تملأ المعالج بما يعرفه عنها، **وتقول صراحةً أيمكن عرضُها**:
 * شاشةٌ تفتح استمارةً لسيارةٍ معروضةٍ بالفعل تَعِد بما سيرفضه الخادم.
 */
export type SaleCandidate = {
  vehicleId: string;
  title: string;
  brandId: string;
  modelId: string;
  trimId: string | null;
  year: number;
  mileageKm: number;
  colorExterior: string;
  city: string;
  transmission: string;
  fuel: string;
  spec: string;
  condition: string;
  vin: string | null;
  plateLetters: string | null;
  plateNumbers: string | null;
  /** معروضةٌ الآن — فلا تُفتح لها استمارةُ عرض. */
  alreadyListed: boolean;
};

export async function saleCandidate(
  userId: string,
  vehicleId: string,
  locale: string,
): Promise<SaleCandidate | null> {
  const row = await db.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      id: true, ownerId: true, year: true, city: true, mileageKm: true,
      colorExterior: true, transmission: true, fuel: true, spec: true,
      condition: true, vin: true, plateLetters: true, plateNumbers: true,
      brandId: true, modelId: true, trimId: true,
      brandName: true, modelName: true, trimName: true,
      brand: { select: { nameEn: true, slug: true } },
      model: { select: { nameEn: true } },
      trim: { select: { nameEn: true } },
      listings: {
        where: { status: { in: [...LIVE_LISTING_STATUSES] } },
        select: { id: true },
      },
    },
  });

  /** **ولا يُفرَّق بين الغائبة ومركبةِ غيرك** — وجودُها ليس خبرًا يُعطى. */
  if (row === null || row.ownerId !== userId) return null;

  return {
    vehicleId: row.id,
    title: vehicleTitle(row, locale),
    brandId: row.brandId,
    modelId: row.modelId,
    trimId: row.trimId,
    year: row.year,
    mileageKm: row.mileageKm,
    colorExterior: row.colorExterior,
    city: row.city,
    transmission: row.transmission,
    fuel: row.fuel,
    spec: row.spec,
    condition: row.condition,
    vin: row.vin,
    plateLetters: row.plateLetters,
    plateNumbers: row.plateNumbers,
    alreadyListed: row.listings.length > 0,
  };
}
