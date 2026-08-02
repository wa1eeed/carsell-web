import { db } from '@/lib/db';
import { verifiedSellerWhere } from './seller';
import { monthlyPayment } from './listing-detail';
import { canonicalPath } from './listing-detail';
import type { ListingCard } from './listings';

/**
 * الرئيسية — Wa.
 *
 * **كل رقم على هذه الصفحة محسوب، لا مكتوب.** «١٨٬٤٠٠ مركبة» في التصميم
 * رقمُ عرضٍ؛ وهنا يأتي من `count`. صفحةٌ تعِد بموثوقية ثم تعرض رقمًا
 * مؤلَّفًا تنقض وعدها في أول سطر يقرؤه الزائر.
 *
 * والاستعلامات **دفعة واحدة متوازية**: الصفحة تُبنى على الخادم، وسلسلة
 * استعلامات متتابعة تظهر مباشرةً في زمن أول بايت.
 */

/** شرائح القسط الشهري — «اختر السيارة اللي تناسب قسطك». */
export const PAYMENT_BANDS = [
  { key: 'lt1000', min: 0, max: 1000 },
  { key: '1000_1500', min: 1000, max: 1500 },
  { key: '1500_2000', min: 1500, max: 2000 },
  { key: '2000_2500', min: 2000, max: 2500 },
  { key: '2500_3000', min: 2500, max: 3000 },
  { key: '3000_4000', min: 3000, max: 4000 },
  { key: '4000_5000', min: 4000, max: 5000 },
  { key: 'gt5000', min: 5000, max: Number.MAX_SAFE_INTEGER },
] as const;

export type PaymentBandKey = (typeof PAYMENT_BANDS)[number]['key'];

export type HomeBrand = {
  id: string;
  nameAr: string;
  nameEn: string;
  slug: string;
  count: number;
};

export type HomeCard = {
  ref: string;
  title: string;
  year: number;
  mileageKm: number;
  transmission: string;
  city: string;
  price: string;
  monthly: number | null;
  type: ListingCard['type'];
  inspected: boolean;
  imageCount: number;
  sellerName: string;
  sellerVerified: boolean;
  href: string;
};

export type HomeAuction = HomeCard & {
  endsAt: string;
  highestBid: string | null;
  bidCount: number;
};

export type HomeBodyType = {
  key: string;
  nameAr: string;
  nameEn: string;
  imageUrl: string | null;
  count: number;
};

export type HomeService = {
  key: string;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  price: string;
};

export type HomeData = {
  live: {
    auctions: number;
    closing: { title: string; endsAt: string; href: string } | null;
  };
  stats: { listings: number; dealers: number; financeProviders: number };
  summary: { used: number; newCars: number; auctions: number };
  brands: { top: HomeBrand[]; total: number };
  bodyTypes: HomeBodyType[];
  finance: {
    /** الشرط المعروض للزائر: دفعة أولى ونسبة ومدّة (قرار ١٤). */
    downPaymentPct: number;
    months: number;
    bands: { key: PaymentBandKey; count: number }[];
    selected: PaymentBandKey;
    cars: HomeCard[];
  };
  auctions: HomeAuction[];
  recent: { city: string; cars: HomeCard[] };
  services: HomeService[];
  faq: { id: string; questionAr: string; questionEn: string; answerAr: string; answerEn: string }[];
};

const CARD_INCLUDE = {
  vehicle: {
    select: {
      brandName: true,
      modelName: true,
      trimName: true,
      year: true,
      mileageKm: true,
      transmission: true,
      brand: { select: { slug: true } },
      inspectionReports: { select: { id: true }, take: 1 },
    },
  },
  seller: { select: { name: true, idVerified: true, dealer: { select: { nameAr: true, verified: true } } } },
  images: { select: { id: true }, orderBy: { sort: 'asc' } },
  auction: { select: { id: true, endsAt: true, status: true, _count: { select: { bids: true } } } },
} as const;

type CardRow = {
  ref: string;
  city: string;
  askPrice: unknown;
  type: ListingCard['type'];
  vehicle: {
    brandName: string;
    modelName: string;
    trimName: string | null;
    year: number;
    mileageKm: number;
    transmission: string;
    brand: { slug: string } | null;
    inspectionReports: { id: string }[];
  };
  seller: {
    name: string | null;
    idVerified: boolean;
    dealer: { nameAr: string; verified: boolean } | null;
  };
  images: { id: string }[];
  auction: { id: string; endsAt: Date; status: string; _count: { bids: number } } | null;
};

/**
 * البطاقة من نفس شكل بطاقة البحث — **لا شكل ثانٍ للرئيسية**.
 * شكلان لبطاقة واحدة يعني تعديلين لكل تغيير، وأحدهما يُنسى.
 */
function toCard(
  row: CardRow,
  locale: string,
  finance: { minPrice: number; downPaymentPct: number; months: number; profitRatePct: number } | null,
): HomeCard {
  const price = Number(row.askPrice);
  const eligible = row.type !== 'AUCTION' && finance !== null && price >= finance.minPrice;

  return {
    ref: row.ref,
    // بلا سنة — السنة رقم يُصاغ لا نصّ يُلصق (فحص ٩)
    title: [row.vehicle.brandName, row.vehicle.modelName, row.vehicle.trimName]
      .filter((part) => part !== null && part !== '')
      .join(' '),
    year: row.vehicle.year,
    mileageKm: row.vehicle.mileageKm,
    transmission: row.vehicle.transmission,
    city: row.city,
    price: String(row.askPrice),
    monthly: eligible
      ? monthlyPayment(price, finance.downPaymentPct, finance.months, finance.profitRatePct)
      : null,
    type: row.type,
    inspected: row.vehicle.inspectionReports.length > 0,
    imageCount: row.images.length,
    sellerName: row.seller.dealer?.nameAr ?? row.seller.name ?? '',
    sellerVerified: row.seller.idVerified || row.seller.dealer?.verified === true,
    href: canonicalPath(locale, row).path,
  };
}

/**
 * حدود السعر التي تقابل شريحة قسط.
 *
 * القسط مشتقّ من السعر بمعادلة خطّية (قرار ١٤)، فيمكن عكسها إلى حدّي
 * سعر بدل حساب القسط لكل صفّ. الفلترة تبقى على عمود مفهرس، فتُعدّ
 * الشريحة بـ`count` واحد مهما كبر المعروض.
 */
export function priceBoundsForPayment(
  band: { min: number; max: number },
  finance: { downPaymentPct: number; months: number; profitRatePct: number },
): { gte: number; lte: number } {
  const factor =
    ((1 - finance.downPaymentPct / 100) *
      (1 + (finance.profitRatePct / 100) * (finance.months / 12))) /
    finance.months;
  return {
    gte: Math.floor(band.min / factor),
    lte: band.max === Number.MAX_SAFE_INTEGER ? 1_000_000_000 : Math.ceil(band.max / factor),
  };
}

export async function getHomeData(
  locale: string,
  options: { city?: string; band?: PaymentBandKey } = {},
): Promise<HomeData> {
  const published = { status: 'PUBLISHED' } as const;

  const [settings, cityRows] = await Promise.all([
    db.financeSetting.findUnique({ where: { id: 'default' } }),
    db.listing.groupBy({
      by: ['city'],
      where: published,
      _count: { _all: true },
      orderBy: { _count: { city: 'desc' } },
      take: 1,
    }),
  ]);

  const finance =
    settings === null
      ? null
      : {
          minPrice: Number(settings.minPrice),
          downPaymentPct: Number(settings.downPaymentPct),
          months: settings.months,
          profitRatePct: Number(settings.profitRatePct),
        };

  /** مدينة الزائر إن عُرفت، وإلا أكثر المدن معروضًا — لا مدينة مؤلَّفة. */
  const city = options.city ?? cityRows[0]?.city ?? '';
  const bandKey: PaymentBandKey = options.band ?? '2000_2500';
  const band = PAYMENT_BANDS.find((b) => b.key === bandKey) ?? PAYMENT_BANDS[3];
  const bounds = finance === null ? null : priceBoundsForPayment(band, finance);

  const [
    liveAuctions,
    closingRow,
    listingCount,
    dealerCount,
    financeProviderCount,
    usedCount,
    newCount,
    brandRows,
    brandTotal,
    bodyTypeRows,
    bodyTypeCounts,
    bandCounts,
    financeCars,
    auctionRows,
    recentRows,
    services,
    faqRows,
  ] = await Promise.all([
    db.auction.count({ where: { status: 'LIVE' } }),
    db.auction.findFirst({
      where: { status: 'LIVE', listing: published },
      orderBy: { endsAt: 'asc' },
      select: { endsAt: true, listing: { select: { ref: true, city: true, vehicle: { select: { brandName: true, modelName: true, brand: { select: { slug: true } } } } } } },
    }),
    db.listing.count({ where: published }),
    db.dealer.count({ where: { verified: true, status: 'ACTIVE' } }),
    db.financeProvider.count({ where: { active: true } }),
    db.listing.count({ where: { ...published, vehicle: { condition: 'USED' } } }),
    db.listing.count({ where: { ...published, vehicle: { condition: 'NEW' } } }),
    db.vehicle.groupBy({
      by: ['brandId'],
      where: { listings: { some: published } },
      _count: { _all: true },
      orderBy: { _count: { brandId: 'desc' } },
      take: 15,
    }),
    db.brand.count({ where: { visible: true } }),
    db.bodyTypeDisplay.findMany({ where: { visible: true }, orderBy: { sort: 'asc' } }),
    db.vehicle.groupBy({
      by: ['bodyType'],
      where: { listings: { some: published } },
      _count: { _all: true },
    }),
    finance === null
      ? Promise.resolve([])
      : Promise.all(
          PAYMENT_BANDS.map(async (b) => ({
            key: b.key,
            count: await db.listing.count({
              where: {
                ...published,
                type: { not: 'AUCTION' },
                askPrice: priceBoundsForPayment(b, finance),
              },
            }),
          })),
        ),
    bounds === null
      ? Promise.resolve([])
      : db.listing.findMany({
          where: { ...published, type: { not: 'AUCTION' }, askPrice: bounds },
          include: CARD_INCLUDE,
          orderBy: { publishedAt: 'desc' },
          take: 4,
        }),
    db.listing.findMany({
      where: { ...published, auction: { status: { in: ['LIVE', 'SCHEDULED'] } } },
      include: CARD_INCLUDE,
      orderBy: { auction: { endsAt: 'asc' } },
      take: 4,
    }),
    db.listing.findMany({
      where: { ...published, city, ...verifiedSellerWhere(true) },
      include: CARD_INCLUDE,
      orderBy: { publishedAt: 'desc' },
      take: 4,
    }),
    db.service.findMany({
      where: { active: true, placements: { has: 'home_services' } },
      orderBy: { sort: 'asc' },
      take: 4,
      select: { key: true, nameAr: true, nameEn: true, descAr: true, descEn: true, price: true },
    }),
    db.faqPlacement.findMany({
      where: { surface: 'help_center', active: true, faq: { active: true } },
      orderBy: { sort: 'asc' },
      take: 6,
      include: { faq: true },
    }),
  ]);

  const brandIds = brandRows.map((row) => row.brandId);
  const brandNames = await db.brand.findMany({
    where: { id: { in: brandIds }, visible: true },
    select: { id: true, nameAr: true, nameEn: true, slug: true },
  });

  const top: HomeBrand[] = brandRows.flatMap((row) => {
    const brand = brandNames.find((b) => b.id === row.brandId);
    return brand === undefined ? [] : [{ ...brand, count: row._count._all }];
  });

  const card = (row: unknown): HomeCard => toCard(row as CardRow, locale, finance);

  return {
    live: {
      auctions: liveAuctions,
      closing:
        closingRow === null
          ? null
          : {
              title: `${closingRow.listing.vehicle.brandName} ${closingRow.listing.vehicle.modelName}`,
              endsAt: closingRow.endsAt.toISOString(),
              href: canonicalPath(locale, closingRow.listing).path,
            },
    },
    stats: { listings: listingCount, dealers: dealerCount, financeProviders: financeProviderCount },
    summary: { used: usedCount, newCars: newCount, auctions: liveAuctions },
    brands: { top, total: brandTotal },
    /**
     * النوع الفارغ **يُخفى** — بخلاف شرائح القسط: هناك السلّم نفسه
     * معلومة، وهنا «لا فان معروض» ليس جوابًا يبحث عنه أحد.
     */
    bodyTypes: bodyTypeRows.flatMap((row) => {
      const count = bodyTypeCounts.find((c) => c.bodyType === row.key)?._count._all ?? 0;
      return count === 0
        ? []
        : [{ key: row.key, nameAr: row.nameAr, nameEn: row.nameEn, imageUrl: row.imageUrl, count }];
    }),
    finance: {
      downPaymentPct: finance?.downPaymentPct ?? 0,
      months: finance?.months ?? 0,
      bands: bandCounts,
      selected: bandKey,
      cars: financeCars.map(card),
    },
    auctions: auctionRows.map((row) => {
      const base = card(row);
      const auction = (row as unknown as CardRow).auction;
      return {
        ...base,
        endsAt: auction?.endsAt.toISOString() ?? '',
        highestBid: null,
        bidCount: auction?._count.bids ?? 0,
      };
    }),
    recent: { city, cars: recentRows.map(card) },
    services: services.map((service) => ({ ...service, price: service.price.toString() })),
    faq: faqRows.map((placement) => ({
      id: placement.faqId,
      questionAr: placement.faq.questionAr,
      questionEn: placement.faq.questionEn,
      answerAr: placement.faq.answerAr,
      answerEn: placement.faq.answerEn,
    })),
  };
}
