import { db } from '@/lib/db';
import { toSlug } from './listing-detail';

/**
 * ═══ الـAPI العام — قراءةٌ فقط ═══
 *
 * **ولا يعيد صفًّا من Prisma أبدًا.** `Listing` يحمل `minAcceptPrice`
 * و`Auction` يحمل `reservePrice` — و`return listing` واحدة تُسرّب سرًّا
 * تجاريًّا لا يمسكه مراجع. فالمُسلسِل يجعل التسريب مستحيلًا بنيويًّا لا
 * يقظةً، واختبارٌ يؤكّد أن الحقلين لا يخرجان.
 */

export type PublicListing = {
  ref: string;
  title: string;
  year: number;
  city: string;
  citySlug: string;
  brand: string;
  model: string;
  mileageKm: number;
  transmission: string;
  fuel: string;
  bodyType: string | null;
  price: string;
  currency: 'SAR';
  type: string;
  inspected: boolean;
  inspectionScore: number | null;
  imageCount: number;
  seller: { kind: 'DEALER' | 'INDIVIDUAL'; name: string; verified: boolean; slug: string | null };
  publishedAt: string | null;
  url: string;
};

const SITE = 'https://carsell.one';

/** الحقول المسموحة **تُذكر صراحةً** — و`select` أضيق من `include`. */
const PUBLIC_SELECT = {
  ref: true,
  city: true,
  askPrice: true,
  type: true,
  publishedAt: true,
  vehicle: {
    select: {
      brandName: true, modelName: true, year: true, mileageKm: true,
      transmission: true, fuel: true, bodyType: true,
      brand: { select: { slug: true } },
      inspectionReports: { select: { score: true }, orderBy: { inspectedAt: 'desc' as const }, take: 1 },
    },
  },
  seller: {
    select: {
      name: true,
      idVerified: true,
      dealer: { select: { nameAr: true, slug: true, verified: true } },
    },
  },
  images: { select: { id: true } },
} as const;

type Row = {
  ref: string;
  city: string;
  askPrice: { toString: () => string };
  type: string;
  publishedAt: Date | null;
  vehicle: {
    brandName: string; modelName: string; year: number; mileageKm: number;
    transmission: string; fuel: string; bodyType: string | null;
    brand: { slug: string } | null;
    inspectionReports: { score: number }[];
  };
  seller: {
    name: string | null;
    idVerified: boolean;
    dealer: { nameAr: string; slug: string; verified: boolean } | null;
  };
  images: { id: string }[];
};

function serialize(row: Row): PublicListing {
  const report = row.vehicle.inspectionReports[0] ?? null;
  const citySlug = toSlug(row.city);
  const brandSlug = row.vehicle.brand?.slug ?? toSlug(row.vehicle.brandName);

  return {
    ref: row.ref,
    title: `${row.vehicle.brandName} ${row.vehicle.modelName}`,
    year: row.vehicle.year,
    city: row.city,
    citySlug,
    brand: row.vehicle.brandName,
    model: row.vehicle.modelName,
    mileageKm: row.vehicle.mileageKm,
    transmission: row.vehicle.transmission,
    fuel: row.vehicle.fuel,
    bodyType: row.vehicle.bodyType,
    price: row.askPrice.toString(),
    currency: 'SAR',
    type: row.type,
    inspected: report !== null,
    inspectionScore: report?.score ?? null,
    imageCount: row.images.length,
    seller: {
      kind: row.seller.dealer === null ? 'INDIVIDUAL' : 'DEALER',
      name: row.seller.dealer?.nameAr ?? row.seller.name ?? '',
      verified: row.seller.dealer?.verified ?? row.seller.idVerified,
      slug: row.seller.dealer?.slug ?? null,
    },
    publishedAt: row.publishedAt?.toISOString() ?? null,
    url: `${SITE}/ar/cars/${encodeURIComponent(citySlug)}/${encodeURIComponent(brandSlug)}/${encodeURIComponent(toSlug(row.vehicle.modelName))}/${row.ref}`,
  };
}

export type PublicQuery = {
  city?: string;
  brand?: string;
  type?: 'DIRECT' | 'NEGOTIATION' | 'AUCTION';
  minPrice?: number;
  maxPrice?: number;
  cursor?: string;
  limit: number;
};

export type PublicPage = { items: PublicListing[]; nextCursor: string | null };

/**
 * الترقيم **بمؤشّر لا بصفحة**: صفحةٌ رقمية تُكرّر عنصرًا وتُسقط آخر حين
 * يُنشَر إعلانٌ بينهما، والمستهلِك لا يعرف أنه فقد شيئًا.
 */
export async function publicListings(query: PublicQuery): Promise<PublicPage> {
  const rows = await db.listing.findMany({
    where: {
      status: 'PUBLISHED',
      ...(query.city === undefined ? {} : { city: query.city }),
      ...(query.type === undefined ? {} : { type: query.type }),
      ...(query.minPrice === undefined && query.maxPrice === undefined
        ? {}
        : {
            askPrice: {
              ...(query.minPrice === undefined ? {} : { gte: query.minPrice }),
              ...(query.maxPrice === undefined ? {} : { lte: query.maxPrice }),
            },
          }),
      ...(query.brand === undefined ? {} : { vehicle: { brandName: query.brand } }),
    },
    select: PUBLIC_SELECT,
    orderBy: { ref: 'desc' },
    take: query.limit + 1,
    ...(query.cursor === undefined ? {} : { cursor: { ref: query.cursor }, skip: 1 }),
  });

  const items = rows.slice(0, query.limit);
  return {
    items: items.map((row) => serialize(row as unknown as Row)),
    nextCursor: rows.length > query.limit ? (items[items.length - 1]?.ref ?? null) : null,
  };
}

export async function publicListing(ref: string): Promise<PublicListing | null> {
  const row = await db.listing.findFirst({
    where: { ref, status: 'PUBLISHED' },
    select: PUBLIC_SELECT,
  });
  return row === null ? null : serialize(row as unknown as Row);
}
