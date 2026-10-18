import { db } from '@/lib/db';
import { ALL_SPECS, type SpecOptions } from '@/lib/catalog/specs';
import type { SellFormFeature } from '@/lib/catalog/features';

/**
 * خيارات الكتالوج للشاشات — **نوع معلَن يبنيه مُسلسِل**.
 *
 * تمرير صفّ Prisma إلى مكوّن عميل يُوصله المتصفّح كاملًا ولو عرضت
 * الشاشة حقلًا واحدًا منه. وهنا الحقول قليلة وغير حسّاسة، لكن القاعدة
 * لا تُبنى على حسّاسية اليوم: `Brand` قد يكتسب غدًا حقلًا داخليًّا،
 * والشاشة التي تمرّره لن تتغيّر.
 */

export type CatalogOption = { id: string; nameAr: string; nameEn: string };

/**
 * ماركةٌ بشعارها — **والشعارُ من الصفّ لا من ملفٍّ باسم المقطع**.
 *
 * لوحةُ الأدمن ترفعه إلى `Brand.logoUrl` منذ بُنيت، واشتقاقُه من
 * المقطع (`/brands/toyota.svg`) يُنتج مصدرين يتباعدان: ماركةٌ يرفع لها
 * المشغّل شعارًا فلا يظهر، وأخرى بلا شعارٍ تطلب ملفًّا غير موجود.
 *
 * و`null` حالٌ قائمة لا استثناء: قِيس ٢٠٢٦-١٠-١٨ فكانت **كلُّ
 * الاثنتين والأربعين بلا شعار**. فالقائمةُ تقرأ الغياب ولا تنكسر به.
 */
export type BrandOption = CatalogOption & { logoUrl: string | null };
export type FeatureOption = { key: string; nameAr: string; nameEn: string };

export async function listBrandOptions(): Promise<CatalogOption[]> {
  const rows = await db.brand.findMany({
    where: { visible: true },
    orderBy: [{ sort: 'asc' }],
    select: { id: true, nameAr: true, nameEn: true },
  });
  return rows.map((row) => ({ id: row.id, nameAr: row.nameAr, nameEn: row.nameEn }));
}

/**
 * ═══ ماركاتُ البائع غيرُ ماركات الباحث ═══
 *
 * **٣٢ ماركةً من ٤٢ بلا طرازٍ واحد** (البذرة تزرع عشرًا بأشجارٍ كاملة
 * والباقي بالأسماء، والكتالوج الكامل يُستورد لاحقًا بـA12). ومعالج
 * البيع كان يعرضها كلَّها: يختار البائع «ميتسوبيشي» فتُفتح قائمةُ
 * الطرازات **فارغةً ومعطَّلة بلا كلمة** — وهو ثلاثةُ أرباع القائمة.
 *
 * والفئةُ إلزاميةٌ عند النشر، فماركةٌ بلا فئةٍ ظاهرة **لا يمكن أن
 * تُنشَر أصلًا**: عرضُها وعدٌ يُخلَف قبل أن يبدأ. فيُعرض ما يُكمَل،
 * ويُفتح باب «لا تجد ماركتك؟» لما لا يُكمَل.
 *
 * **ولا تُستعمل في البحث**: الباحث يصفّي بما في السوق، وقائمةٌ فارغة
 * نتيجةٌ مفهومة لا طريقٌ مسدود.
 */
export async function listSellableBrandOptions(): Promise<BrandOption[]> {
  const rows = await db.brand.findMany({
    where: {
      visible: true,
      models: { some: { visible: true, trims: { some: { visible: true } } } },
    },
    orderBy: [{ sort: 'asc' }],
    select: { id: true, nameAr: true, nameEn: true, logoUrl: true },
  });
  return rows.map((row) => ({
    id: row.id,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    /** الفارغُ غيابٌ — ونصٌّ فارغٌ في `src` يطلب الصفحة نفسها. */
    logoUrl: row.logoUrl === null || row.logoUrl === '' ? null : row.logoUrl,
  }));
}

export async function listModelOptions(brandId: string | null): Promise<CatalogOption[]> {
  if (brandId === null) return [];
  const rows = await db.model.findMany({
    where: { brandId, visible: true },
    orderBy: { nameAr: 'asc' },
    select: { id: true, nameAr: true, nameEn: true },
  });
  return rows.map((row) => ({ id: row.id, nameAr: row.nameAr, nameEn: row.nameEn }));
}

/**
 * ═══ ما تسأل عنه استمارةُ البائع ═══
 *
 * **ولم تكن تسأل عن شيء.** `ListingFeature` بلا كاتبٍ في المنتج كلِّه
 * — تزرعه البذرة وحدها — فالفلترُ يعرض «فتحة سقف» ولا إعلانَ حقيقيّ
 * يحملها. وقِيس ٢٠٢٦-١٠-١٨: ٦٠ إعلانًا من ٦٢ تحمل مميّزات، والستّون
 * مزروعة.
 *
 * **والقرارُ في الكتالوج مرّة** (`sell_form`) لا في كلّ فئة: الفئاتُ
 * تحمل ٤٫١ ميزةً وسطيًّا، فحصرُ الاستمارة بها يُري بائعَ مرسيدس
 * أربعةَ مربّعات ويمشي المشغّل في ٣٦٠ فئة ليصلحها.
 */
export type { SellFormFeature };

export async function listSellFormFeatures(): Promise<SellFormFeature[]> {
  const rows = await db.feature.findMany({
    where: { active: true, placements: { has: 'sell_form' } },
    orderBy: [{ group: 'asc' }, { sort: 'asc' }],
    select: { key: true, nameAr: true, nameEn: true, group: true },
  });
  return rows.map((row) => ({
    key: row.key, nameAr: row.nameAr, nameEn: row.nameEn, group: String(row.group),
  }));
}

export async function listFeatureOptions(placement: string): Promise<FeatureOption[]> {
  const rows = await db.feature.findMany({
    where: { active: true, placements: { has: placement } },
    orderBy: [{ group: 'asc' }, { sort: 'asc' }],
    select: { key: true, nameAr: true, nameEn: true },
  });
  return rows.map((row) => ({ key: row.key, nameAr: row.nameAr, nameEn: row.nameEn }));
}

/** خيارات الأدمن — تشمل المخفيّ، فالمحرّر يراه ليُظهره. */
export type AdminBrandOption = CatalogOption & { slug: string };

export async function listAdminBrandOptions(): Promise<AdminBrandOption[]> {
  const rows = await db.brand.findMany({
    orderBy: [{ sort: 'asc' }, { nameAr: 'asc' }],
    select: { id: true, nameAr: true, nameEn: true, slug: true },
  });
  return rows.map((row) => ({
    id: row.id, nameAr: row.nameAr, nameEn: row.nameEn, slug: row.slug,
  }));
}

/**
 * ═══ الكتالوج يحكم حقول الإدخال ═══
 *
 * كان معالج البيع يعرض **التعداد كاملًا**: أربعة نواقل حركة وأربعة
 * أنواع وقود لكل مركبة. فيُعرض «كهربائي» على لاندكروزر و«يدوي» على
 * طرازٍ لا يُصنع إلا أوتوماتيك — ويختار البائع أحدها فيُنشر إعلانٌ
 * بمواصفةٍ لا وجود لها.
 *
 * و`Trim` يحمل هذه القيَم منذ اليوم الأوّل: `bodyType` و`transmission`
 * و`fuel` و`drivetrain` و`seats` و`doors`. **ولا أحد يقرؤها في
 * الإدخال** — تُعرض للتعرّف على الفئة، ثم يُملأ الحقل من قائمةٍ ثابتة.
 *
 * ═══ والخيار يُحصر باتّحاد الفئات لا بأوّلها ═══
 *
 * طرازٌ له فئةٌ بنزين وأخرى هجينة يعرض الاثنين. وقصرُه على أوّل فئة
 * يمنع بائعًا صادقًا من وصف سيارته.
 *
 * ═══ وما لا يعرفه الكتالوج لا يُحصر ═══
 *
 * طرازٌ بلا فئاتٍ منشورة يعود بالتعداد كاملًا — **والحصرُ إلى لا شيء
 * يقفل الاستمارة**: بائعٌ لا يجد خيارًا واحدًا لا ينشر أبدًا، ولا رسالة
 * تقول له لماذا.
 */

export { ALL_SPECS, type SpecOptions };

/** ترتيبٌ ثابت للعرض — والاتّحاد يُرتَّب به لا بترتيب الصفوف. */
function ordered(values: ReadonlySet<string>, order: readonly string[]): string[] {
  const known = order.filter((value) => values.has(value));
  // قيمةٌ في القاعدة خارج التعداد المعروف تُعرض ولا تُسقط صامتةً
  const extra = [...values].filter((value) => !order.includes(value));
  return [...known, ...extra];
}

export async function specOptionsForModel(modelId: string): Promise<SpecOptions> {
  const trims = await db.trim.findMany({
    where: { modelId, visible: true },
    select: { bodyType: true, transmission: true, fuel: true, drivetrain: true, seats: true },
  });

  if (trims.length === 0) return { ...ALL_SPECS, fromTrims: 0 };

  return {
    bodyTypes: ordered(new Set(trims.map((t) => String(t.bodyType))), ALL_SPECS.bodyTypes),
    transmissions: ordered(new Set(trims.map((t) => String(t.transmission))), ALL_SPECS.transmissions),
    fuels: ordered(new Set(trims.map((t) => String(t.fuel))), ALL_SPECS.fuels),
    drivetrains: ordered(new Set(trims.map((t) => String(t.drivetrain))), ALL_SPECS.drivetrains),
    seats: [...new Set(trims.map((t) => t.seats))].sort((a, b) => a - b),
    fromTrims: trims.length,
  };
}

export type TrimSpec = {
  id: string;
  nameAr: string;
  nameEn: string;
  bodyType: string;
  transmission: string;
  fuel: string;
  drivetrain: string;
  seats: number;
  doors: number;
  /** فارغةٌ في الفئة القياسية — وصفُ الطراز كلِّه لا جيلٍ منه. */
  yearFrom: number | null;
  yearTo: number | null;
  /**
   * ما تأتي به هذه الفئة — **ترجيحٌ لا حصر**. يصل البائعَ مُعلَّمًا
   * مسبقًا في استمارته، ويشطب ما ليس في سيارته. (قرار المالك
   * ٢٠٢٦-١٠-١٨: «في الكتالوج مرّة · والفئة تُرجّح».)
   */
  featureKeys: string[];
};

/**
 * فئات الطراز **بمواصفاتها كاملة**.
 *
 * وكانت تُعاد بـ`bodyType` و`drivetrain` و`seats` وحدها — فالشاشة
 * تعرّف البائع على فئته ثم لا تملك ما تملأ به ناقل الحركة والوقود.
 */
export async function trimsWithSpecs(modelId: string): Promise<TrimSpec[]> {
  const rows = await db.trim.findMany({
    where: { modelId, visible: true },
    orderBy: [{ yearFrom: 'desc' }, { nameAr: 'asc' }],
    select: {
      id: true, nameAr: true, nameEn: true,
      bodyType: true, transmission: true, fuel: true, drivetrain: true,
      seats: true, doors: true, yearFrom: true, yearTo: true,
      /**
       * **وسعةُ المحرك وسلندراتُه كانتا تُخزَّنان ولا تُعرضان**:
       * ١٢٥ فئةً من ١٢٦ تحملهما، ولم تبلغا استمارةَ الإدخال قطّ.
       * (طلب المالك ٢٠٢٦-١٠-١٨.)
       */
      engineL: true, cylinders: true,
      /** المفاتيحُ وحدها — الأسماءُ تأتي من كتالوج الاستمارة مرّةً. */
      features: { select: { featureKey: true } },
    },
  });

  return rows.map(({ features, ...row }) => ({
    ...row,
    featureKeys: features.map((link) => link.featureKey),
    bodyType: String(row.bodyType),
    transmission: String(row.transmission),
    fuel: String(row.fuel),
    drivetrain: String(row.drivetrain),
    /** **و`Decimal` لا يعبر حدَّ الخادم** — نصًّا كما يُعرض. */
    engineL: row.engineL === null ? null : String(row.engineL),
  }));
}

