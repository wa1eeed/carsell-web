import { db } from '@/lib/db';
import { canonicalPath } from './listing-detail';
import { verifiedSellerWhere } from './seller';
import type { Prisma } from '@/generated/prisma/client';
import type {
  BodyType,
  Drivetrain,
  FuelType,
  ListingType,
  PaintStatus,
  Transmission,
  VehicleCondition,
  VehicleSpec,
} from '@/generated/prisma/enums';

/**
 * بحث الإعلانات — Wb و`GET /api/v1/listings`.
 *
 * **الفلاتر تُفكّ من `URLSearchParams` في مكان واحد** تقرأه الصفحة
 * والمسار معًا. لو فكّ كلٌّ منهما بنفسه لانحرف أحدهما عن الآخر،
 * ولصار الرابط المشترَك يعطي نتيجة تختلف عن الشاشة التي وُلد منها.
 */

export const SORTS = ['newest', 'price_asc', 'price_desc', 'closing_soon'] as const;
export type Sort = (typeof SORTS)[number];

export const PAGE_SIZE = 20;
export const MAX_LIMIT = 60;

export type Filters = {
  type: ListingType | null;
  brandId: string | null;
  modelId: string | null;
  trimId: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  priceMin: number | null;
  priceMax: number | null;
  mileageMin: number | null;
  mileageMax: number | null;
  city: string | null;
  condition: VehicleCondition | null;
  spec: VehicleSpec | null;
  transmission: Transmission | null;
  fuel: FuelType | null;
  bodyType: BodyType | null;
  drivetrain: Drivetrain | null;
  inspected: boolean | null;
  scoreMin: number | null;
  paintStatus: PaintStatus | null;
  verifiedSeller: boolean | null;
  financing: boolean | null;
  features: string[];
  sort: Sort;
  page: number;
  limit: number;
};

export const EMPTY_FILTERS: Filters = {
  type: null, brandId: null, modelId: null, trimId: null,
  yearFrom: null, yearTo: null, priceMin: null, priceMax: null,
  mileageMin: null, mileageMax: null, city: null, condition: null, spec: null,
  transmission: null, fuel: null, bodyType: null, drivetrain: null,
  inspected: null, scoreMin: null, paintStatus: null,
  verifiedSeller: null, financing: null, features: [],
  sort: 'newest', page: 1, limit: PAGE_SIZE,
};

/** أبعاد الفلترة التي تُحسب لها عدّادات. */
export const FACET_DIMENSIONS = ['type', 'brandId', 'city', 'condition'] as const;
export type FacetDimension = (typeof FACET_DIMENSIONS)[number];

/**
 * ما يمكن استثناؤه من الشرط. الأبعاد المستمرّة (سعر · سنة · ممشى)
 * تُستثنى هي أيضًا: مدرَّج السعر يجب أن يبقى ثابتًا وأنت تسحب
 * مقبضيه، وإلا انهار تحت يدك وصار سحبه مستحيلًا.
 */
export type SkipDimension = FacetDimension | 'price' | 'year' | 'mileage';

function enumOf<T extends string>(
  allowed: readonly T[],
  raw: string | null,
): T | null {
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

function intOf(raw: string | null, min: number, max: number): number | null {
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function boolOf(raw: string | null): boolean | null {
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return null;
}

/**
 * يفكّ الفلاتر من الرابط.
 *
 * **قيمة غير صالحة تُهمَل ولا تُفشِل الطلب**: رابط قديم أو معدَّل يدويًا
 * يجب أن يعرض نتائج لا شاشة خطأ.
 */
export function parseFilters(params: URLSearchParams): Filters {
  const get = (key: string): string | null => params.get(key);

  return {
    type: enumOf(['DIRECT', 'NEGOTIATION', 'AUCTION'] as const, get('type')),
    brandId: get('brandId'),
    modelId: get('modelId'),
    trimId: get('trimId'),
    yearFrom: intOf(get('yearFrom'), 1970, 2100),
    yearTo: intOf(get('yearTo'), 1970, 2100),
    priceMin: intOf(get('priceMin'), 0, 100_000_000),
    priceMax: intOf(get('priceMax'), 0, 100_000_000),
    mileageMin: intOf(get('mileageMin'), 0, 2_000_000),
    mileageMax: intOf(get('mileageMax'), 0, 2_000_000),
    city: get('city'),
    condition: enumOf(['NEW', 'USED'] as const, get('condition')),
    spec: enumOf(['SAUDI', 'GCC', 'AGENT_IMPORT'] as const, get('spec')),
    transmission: enumOf(['AUTOMATIC', 'MANUAL', 'CVT', 'DCT'] as const, get('transmission')),
    fuel: enumOf(['PETROL', 'DIESEL', 'HYBRID', 'ELECTRIC'] as const, get('fuel')),
    bodyType: enumOf(
      ['SEDAN', 'SUV', 'PICKUP', 'HATCHBACK', 'COUPE', 'VAN'] as const,
      get('bodyType'),
    ),
    drivetrain: enumOf(['FWD', 'RWD', 'AWD', 'FOUR_WD'] as const, get('drivetrain')),
    inspected: boolOf(get('inspected')),
    scoreMin: intOf(get('scoreMin'), 0, 100),
    paintStatus: enumOf(
      ['ORIGINAL', 'PARTIAL', 'REPAINTED', 'UNKNOWN'] as const,
      get('paintStatus'),
    ),
    verifiedSeller: boolOf(get('verifiedSeller')),
    financing: boolOf(get('financing')),
    features: params.getAll('features').filter((f) => f.trim() !== '').slice(0, 20),
    sort: enumOf(SORTS, get('sort')) ?? 'newest',
    page: intOf(get('page'), 1, 500) ?? 1,
    /**
     * `limit` **يُقصّ** ولا يسقط إلى الافتراضي: من طلب ٩٩٩٩ يقصد
     * «أعطني أكبر ما تسمح به»، وإرجاع ٢٠ صامتًا يخالف قصده.
     */
    limit: Math.min(intOf(get('limit'), 1, 100_000) ?? PAGE_SIZE, MAX_LIMIT),
  };
}

/**
 * يعيد بناء الرابط من الفلاتر.
 * التسلسل والفكّ متعاكسان تمامًا، فالرابط المشترَك يعيد الحالة كاملة.
 */
export function serializeFilters(filters: Partial<Filters>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined) continue;
    if (key === 'features') {
      for (const feature of value as string[]) params.append('features', feature);
      continue;
    }
    // الافتراضيات لا تُكتب في الرابط — رابط أنظف وأقصر
    if (key === 'sort' && value === 'newest') continue;
    if (key === 'page' && value === 1) continue;
    if (key === 'limit' && value === PAGE_SIZE) continue;
    params.set(key, String(value));
  }
  return params;
}

/** عدد الفلاتر المفعّلة — الرقم بجوار «الفلاتر» في Wb. */
export function activeFilterCount(filters: Filters): number {
  let count = 0;
  for (const [key, value] of Object.entries(filters)) {
    if (key === 'sort' || key === 'page' || key === 'limit') continue;
    if (key === 'features') count += (value as string[]).length;
    else if (value !== null) count += 1;
  }
  return count;
}

/**
 * شرط Prisma من الفلاتر.
 *
 * `skip` يستثني بُعدًا واحدًا — تحتاجه عدّادات facets: عدّاد «لكزس»
 * يجيب «كم سأرى لو بدّلت تويوتا بلكزس»، فيُحسب ضمن بقية الفلاتر
 * ومن دون فلتر الماركة نفسه.
 */
export function buildWhere(
  filters: Filters,
  financingMinPrice: number,
  skip?: SkipDimension,
): Prisma.ListingWhereInput {
  const and: Prisma.ListingWhereInput[] = [
    // المنشور وحده يظهر في البحث — لا مسودّة ولا قيد مراجعة
    { status: 'PUBLISHED' },
  ];

  if (filters.type !== null && skip !== 'type') and.push({ type: filters.type });
  if (filters.city !== null && skip !== 'city') and.push({ city: filters.city });

  const vehicle: Prisma.VehicleWhereInput = {};
  if (filters.brandId !== null && skip !== 'brandId') vehicle.brandId = filters.brandId;
  if (filters.modelId !== null) vehicle.modelId = filters.modelId;
  if (filters.trimId !== null) vehicle.trimId = filters.trimId;
  if (filters.condition !== null && skip !== 'condition') vehicle.condition = filters.condition;
  if (filters.spec !== null) vehicle.spec = filters.spec;
  if (filters.transmission !== null) vehicle.transmission = filters.transmission;
  if (filters.fuel !== null) vehicle.fuel = filters.fuel;
  if (filters.bodyType !== null) vehicle.bodyType = filters.bodyType;
  if (filters.drivetrain !== null) vehicle.drivetrain = filters.drivetrain;
  if (filters.paintStatus !== null) vehicle.paintStatus = filters.paintStatus;
  if (skip !== 'mileage' && (filters.mileageMin !== null || filters.mileageMax !== null)) {
    vehicle.mileageKm = {
      ...(filters.mileageMin === null ? {} : { gte: filters.mileageMin }),
      ...(filters.mileageMax === null ? {} : { lte: filters.mileageMax }),
    };
  }
  if (skip !== 'year' && (filters.yearFrom !== null || filters.yearTo !== null)) {
    vehicle.year = {
      ...(filters.yearFrom === null ? {} : { gte: filters.yearFrom }),
      ...(filters.yearTo === null ? {} : { lte: filters.yearTo }),
    };
  }

  // الفحص: الوسم من وجود تقرير، والدرجة من قيمته
  if (filters.inspected === true) {
    vehicle.inspectionReports = { some: {} };
  } else if (filters.inspected === false) {
    vehicle.inspectionReports = { none: {} };
  }
  if (filters.scoreMin !== null) {
    vehicle.inspectionReports = { some: { score: { gte: filters.scoreMin } } };
  }

  if (Object.keys(vehicle).length > 0) and.push({ vehicle });

  if (skip !== 'price' && (filters.priceMin !== null || filters.priceMax !== null)) {
    and.push({
      askPrice: {
        ...(filters.priceMin === null ? {} : { gte: filters.priceMin }),
        ...(filters.priceMax === null ? {} : { lte: filters.priceMax }),
      },
    });
  }

  /**
   * «بائع موثّق» من مصدره الواحد — لا يُكتب الشرط هنا.
   * والنفي مدعوم كبقية الرايات (`inspected` و`financing`): عقد
   * متماثل أسهل توقّعًا من رايات بعضها أحادي الاتجاه.
   */
  if (filters.verifiedSeller !== null) {
    and.push(verifiedSellerWhere(filters.verifiedSeller));
  }

  /**
   * التقسيط مشتقّ لا مخزَّن (قرار ١٤):
   * `type != AUCTION && askPrice >= FinanceSetting.minPrice`.
   */
  if (filters.financing === true) {
    and.push({ type: { not: 'AUCTION' }, askPrice: { gte: financingMinPrice } });
  } else if (filters.financing === false) {
    and.push({
      OR: [{ type: 'AUCTION' }, { askPrice: { lt: financingMinPrice } }],
    });
  }

  // كل ميزة مطلوبة شرط مستقل — «فتحة سقف **و** جلد» لا «أو»
  for (const key of filters.features) {
    and.push({ features: { some: { featureKey: key } } });
  }

  return { AND: and };
}

function orderBy(sort: Sort): Prisma.ListingOrderByWithRelationInput[] {
  switch (sort) {
    case 'price_asc':
      return [{ askPrice: 'asc' }, { id: 'asc' }];
    case 'price_desc':
      return [{ askPrice: 'desc' }, { id: 'asc' }];
    case 'closing_soon':
      return [{ auction: { endsAt: 'asc' } }, { id: 'asc' }];
    default:
      return [{ publishedAt: 'desc' }, { id: 'asc' }];
  }
}

/** حدود بُعد مستمرّ — طرفا شريط المدى قبل تقييده بنفسه. */
export type Bounds = { min: number; max: number };

export type Facets = {
  type: Record<string, number>;
  brandId: Record<string, number>;
  city: Record<string, number>;
  condition: Record<string, number>;
  /** حدود الشرائط، محسوبة ضمن بقية الفلاتر ومن دون البُعد نفسه. */
  price: Bounds | null;
  year: Bounds | null;
  mileage: Bounds | null;
  /**
   * توزّع الأسعار — «توزّع الأسعار في هذا البحث» تحت الشريط.
   * يجيب سؤالًا لا تجيبه الرقائق: أين يتكدّس المعروض فعلًا.
   */
  priceBars: number[];
};

export const PRICE_BARS = 8;

/**
 * عدّاد كل بُعد يُحسب ضمن بقية الفلاتر **ويستثني بُعده هو** — السلوك
 * القياسي الذي يجيب «كم سأرى لو بدّلت هذا الخيار».
 */
async function computeFacets(
  filters: Filters,
  financingMinPrice: number,
): Promise<Facets> {
  const [priceBounds, yearBounds, mileageBounds] = await Promise.all([
    db.listing.aggregate({
      where: buildWhere(filters, financingMinPrice, 'price'),
      _min: { askPrice: true },
      _max: { askPrice: true },
    }),
    db.vehicle.aggregate({
      where: { listings: { some: buildWhere(filters, financingMinPrice, 'year') } },
      _min: { year: true },
      _max: { year: true },
    }),
    db.vehicle.aggregate({
      where: { listings: { some: buildWhere(filters, financingMinPrice, 'mileage') } },
      _min: { mileageKm: true },
      _max: { mileageKm: true },
    }),
  ]);

  const price =
    priceBounds._min.askPrice === null || priceBounds._max.askPrice === null
      ? null
      : { min: Number(priceBounds._min.askPrice), max: Number(priceBounds._max.askPrice) };

  /**
   * المدرَّج بثماني عدّات مفهرسة لا بجرّ كل الأسعار إلى الذاكرة:
   * `count` على مدى مفهرس يبقى ثابت الكلفة مهما كبر المعروض، بينما
   * جرّ الصفوف ينمو معه — والحدّ الصامت على عددها يكذب على القارئ.
   */
  const priceBars = await (async (): Promise<number[]> => {
    if (price === null || price.max <= price.min) return [];
    const width = (price.max - price.min) / PRICE_BARS;
    const base = buildWhere(filters, financingMinPrice, 'price');
    return Promise.all(
      Array.from({ length: PRICE_BARS }, (_, i) => {
        const from = price.min + i * width;
        const last = i === PRICE_BARS - 1;
        return db.listing.count({
          where: {
            AND: [
              base,
              { askPrice: { gte: from, ...(last ? {} : { lt: from + width }) } },
            ],
          },
        });
      }),
    );
  })();

  const [byType, byCity, byBrand, byCondition] = await Promise.all([
    db.listing.groupBy({
      by: ['type'],
      where: buildWhere(filters, financingMinPrice, 'type'),
      _count: { _all: true },
    }),
    db.listing.groupBy({
      by: ['city'],
      where: buildWhere(filters, financingMinPrice, 'city'),
      _count: { _all: true },
    }),
    db.vehicle.groupBy({
      by: ['brandId'],
      where: {
        listings: { some: buildWhere(filters, financingMinPrice, 'brandId') },
      },
      _count: { _all: true },
    }),
    db.vehicle.groupBy({
      by: ['condition'],
      where: {
        listings: { some: buildWhere(filters, financingMinPrice, 'condition') },
      },
      _count: { _all: true },
    }),
  ]);

  const toMap = <T extends string>(
    rows: readonly { _count: { _all: number } }[],
    key: (row: never) => T,
  ): Record<string, number> =>
    Object.fromEntries(rows.map((row) => [key(row as never), row._count._all]));

  return {
    type: toMap(byType, (r: { type: string }) => r.type),
    city: toMap(byCity, (r: { city: string }) => r.city),
    brandId: toMap(byBrand, (r: { brandId: string }) => r.brandId),
    condition: toMap(byCondition, (r: { condition: string }) => r.condition),
    price,
    year:
      yearBounds._min.year === null || yearBounds._max.year === null
        ? null
        : { min: yearBounds._min.year, max: yearBounds._max.year },
    mileage:
      mileageBounds._min.mileageKm === null || mileageBounds._max.mileageKm === null
        ? null
        : { min: mileageBounds._min.mileageKm, max: mileageBounds._max.mileageKm },
    priceBars,
  };
}

export type ListingCard = {
  ref: string;
  /**
   * مسار الصفحة — **والبطاقة بلا رابط ليست بطاقة**.
   *
   * كانت نتائج البحث تُعرض بلا روابط أصلًا، فيرى الزائر ٥٢ سيارة ولا
   * يستطيع فتح واحدة. والرئيسية كانت تلفّ بطاقاتها بـ`Link` منذ البداية،
   * فبقي العطل في الشاشة الوحيدة التي يصلها الناس من البحث.
   */
  href: string;
  title: string;
  city: string;
  year: number;
  mileageKm: number;
  transmission: Transmission;
  price: string;
  monthly: number | null;
  type: ListingType;
  inspected: boolean;
  score: number | null;
  imageCount: number;
  coverKey: string | null;
  publishedAt: string | null;
  sellerName: string | null;
  sellerVerified: boolean;
  sellerIsDealer: boolean;
  highestBid: string | null;
  bidderCount: number | null;
  endsAt: string | null;
};

export type SearchResult = {
  items: ListingCard[];
  total: number;
  page: number;
  totalPages: number;
  nextCursor: string | null;
  facets: Facets;
  priceRange: { min: string; max: string } | null;
};

/**
 * القسط الشهري التقريبي — حساب محلي بلا استدعاء (قرار ١٤).
 * قسط ثابت على رأس مال بعد دفعة أولى، بنسبة ربح سنوية بسيطة.
 */
function monthlyPayment(
  price: number,
  downPct: number,
  months: number,
  ratePct: number,
): number {
  const principal = price * (1 - downPct / 100);
  const total = principal * (1 + (ratePct / 100) * (months / 12));
  return Math.round(total / months / 10) * 10;
}

export async function searchListings(
  filters: Filters,
  locale = 'ar',
): Promise<SearchResult> {
  const settings = await db.financeSetting.findUnique({ where: { id: 'default' } });
  const minPrice = Number(settings?.minPrice ?? 0);
  const where = buildWhere(filters, minPrice);

  const [total, rows, facets, aggregate] = await Promise.all([
    db.listing.count({ where }),
    db.listing.findMany({
      where,
      orderBy: orderBy(filters.sort),
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
      include: {
        vehicle: {
          include: {
            inspectionReports: { orderBy: { inspectedAt: 'desc' }, take: 1 },
            /**
             * **الرابط يُبنى قانونيًّا من أوّله.** وبلا `brand.slug` يقع
             * `canonicalPath` على الاسم العربي فيُنتج `/نيسان/`، ثم تحوّله
             * الصفحة ٣٠١ إلى `/nissan/` — تحويلٌ على **كل** نقرة نتيجة:
             * بطءٌ للزائر، وإشارةٌ لمحرّك البحث أن روابطنا ليست نهائية.
             */
            brand: { select: { slug: true } },
          },
        },
        seller: { include: { dealer: true } },
        images: { orderBy: { sort: 'asc' } },
        auction: { include: { _count: { select: { bids: true } } } },
      },
    }),
    computeFacets(filters, minPrice),
    db.listing.aggregate({ where, _min: { askPrice: true }, _max: { askPrice: true } }),
  ]);

  const items: ListingCard[] = await Promise.all(
    rows.map(async (row) => {
      const report = row.vehicle.inspectionReports[0] ?? null;
      const cover = row.images.find((i) => i.isCover) ?? row.images[0] ?? null;
      const price = Number(row.askPrice);

      const highest =
        row.auction === null
          ? null
          : await db.bid.aggregate({
              where: { auctionId: row.auction.id },
              _max: { amount: true },
            });

      const eligible = row.type !== 'AUCTION' && price >= minPrice;

      return {
        ref: row.ref,
        href: canonicalPath(locale, row).path,
        title: [row.vehicle.brandName, row.vehicle.modelName, row.vehicle.trimName]
          .filter((p) => p !== null && p !== '')
          .join(' '),
        city: row.city,
        year: row.vehicle.year,
        mileageKm: row.vehicle.mileageKm,
        transmission: row.vehicle.transmission,
        price: row.askPrice.toString(),
        monthly:
          eligible && settings != null
            ? monthlyPayment(
                price,
                Number(settings.downPaymentPct),
                settings.months,
                Number(settings.profitRatePct),
              )
            : null,
        type: row.type,
        // وسم «مفحوصة» من وجود التقرير — بلا رقم (القسم ٤)
        inspected: report !== null,
        score: report?.score ?? null,
        imageCount: row.images.length,
        coverKey: cover?.r2Key ?? null,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        // `null` لا «بائع»: التسمية من شأن الشاشة
      sellerName: row.seller.dealer?.nameAr ?? row.seller.name ?? null,
        sellerVerified:
          row.seller.idVerified || row.seller.dealer?.verified === true,
        sellerIsDealer: row.seller.dealer != null,
        highestBid: highest?._max.amount?.toString() ?? null,
        bidderCount: row.auction?._count.bids ?? null,
        endsAt: row.auction?.endsAt.toISOString() ?? null,
      };
    }),
  );

  const last = rows[rows.length - 1];

  return {
    items,
    total,
    page: filters.page,
    totalPages: Math.max(1, Math.ceil(total / filters.limit)),
    // الويب يستعمل `page` والتطبيق `cursor` (قرار ٢١)
    nextCursor:
      rows.length === filters.limit && last !== undefined ? last.id : null,
    facets,
    priceRange:
      aggregate._min.askPrice === null || aggregate._max.askPrice === null
        ? null
        : {
            min: aggregate._min.askPrice.toString(),
            max: aggregate._max.askPrice.toString(),
          },
  };
}
