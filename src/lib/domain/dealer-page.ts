import { db } from '@/lib/db';
import { canonicalPath } from './listing-detail';
import type { ListingCard } from './listings';

/**
 * Wg — صفحة المعرض العامة.
 *
 * **وهي صفحة ثقة قبل أن تكون فهرسًا.** المشتري يفتحها ليعرف مع من
 * يتعامل: أموثَّق هو، وأين، ومنذ متى، وكم باع. والمركبات تحتها لا فوقها.
 *
 * ولا تُعرض إلا للمعرض **النشط**: معرضٌ معلَّق أو منتظِر موافقةً صفحته
 * دعوةٌ للتعامل مع من لم يُقبل بعد.
 */

export type DealerHours = { day: string; open: string; close: string }[];

export type PublicDealer = {
  slug: string;
  name: string;
  about: string | null;
  city: string;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  verified: boolean;
  ratingAvg: string | null;
  ratingCount: number;
  hours: DealerHours | null;
  /** منذ متى — تاريخٌ يُصاغ في الشاشة لا نصٌّ يُخزَّن */
  joinedAt: string;
  listingCount: number;
  soldCount: number;
  // اسمٌ واحد للمسار في كل الشاشات — `href` كما في البحث والرئيسية
  listings: ListingCard[];
};

/**
 * **رقم السجلّ والرقم الضريبيّ لا يخرجان.**
 *
 * وهما بيانات تسجيلٍ لا شارات ثقة: عرضُهما يدعو إلى انتحال المعرض في
 * موضعٍ آخر، والثقة تُنقل بشارة «موثّق» التي يمنحها الأدمن.
 */
export async function getDealerPage(
  slug: string,
  locale: string,
): Promise<PublicDealer | null> {
  const dealer = await db.dealer.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, nameAr: true, nameEn: true, aboutAr: true, aboutEn: true,
      city: true, address: true, phone: true, logoUrl: true, coverUrl: true,
      verified: true, ratingAvg: true, ratingCount: true, hours: true,
      createdAt: true, status: true,
    },
  });
  // غير النشط يُعامَل كغير موجود — لا صفحة ثقةٍ لمن لم يُقبل بعد
  if (dealer === null || dealer.status !== 'ACTIVE') return null;

  const memberIds = (
    await db.user.findMany({ where: { dealerId: dealer.id }, select: { id: true } })
  ).map((member) => member.id);

  const [rows, listingCount, soldCount] = await Promise.all([
    db.listing.findMany({
      where: { sellerId: { in: memberIds }, status: 'PUBLISHED' },
      include: {
        // الفحص على المركبة لا على الإعلان — وأحدثه هو المعروض
        vehicle: {
          include: {
            inspectionReports: { orderBy: { inspectedAt: 'desc' }, take: 1 },
            // بلا `brand.slug` يُبنى الرابط بالاسم العربي فيُحوَّل ٣٠١
            brand: { select: { slug: true } },
          },
        },
        images: { orderBy: { sort: 'asc' } },
        auction: { include: { _count: { select: { bids: true } } } },
      },
      orderBy: { publishedAt: 'desc' },
      take: 24,
    }),
    db.listing.count({ where: { sellerId: { in: memberIds }, status: 'PUBLISHED' } }),
    /**
     * **المباع محسوبٌ من الطلبات المكتملة** لا من عمودٍ على المعرض.
     * وعمودٌ مخزَّن يكذب أوّل مرّة يُلغى فيها طلب، ثم لا يُكتشف كذبه.
     */
    db.order.count({ where: { sellerId: { in: memberIds }, status: 'COMPLETED' } }),
  ]);

  const arabic = locale === 'ar';

  return {
    slug: dealer.slug,
    name: arabic ? dealer.nameAr : dealer.nameEn,
    about: (arabic ? dealer.aboutAr : dealer.aboutEn) ?? null,
    city: dealer.city,
    address: dealer.address,
    phone: dealer.phone,
    logoUrl: dealer.logoUrl,
    coverUrl: dealer.coverUrl,
    verified: dealer.verified,
    ratingAvg: dealer.ratingAvg?.toString() ?? null,
    ratingCount: dealer.ratingCount,
    hours: Array.isArray(dealer.hours) ? (dealer.hours as unknown as DealerHours) : null,
    joinedAt: dealer.createdAt.toISOString(),
    listingCount,
    soldCount,
    listings: rows.map((row) => {
      const report = row.vehicle.inspectionReports[0] ?? null;
      const cover = row.images.find((image) => image.isCover) ?? row.images[0] ?? null;
      return {
        ref: row.ref,
        title: [row.vehicle.brandName, row.vehicle.modelName, row.vehicle.trimName]
        .filter((part) => part !== null && part !== '')
        .join(' '),
        city: row.city,
        year: row.vehicle.year,
        mileageKm: row.vehicle.mileageKm,
        transmission: row.vehicle.transmission,
        price: row.askPrice.toString(),
        monthly: null,
        type: row.type,
        inspected: report !== null,
        score: report?.score ?? null,
        imageCount: row.images.length,
        coverKey: cover?.r2Key ?? null,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        sellerName: arabic ? dealer.nameAr : dealer.nameEn,
        sellerVerified: dealer.verified,
        sellerIsDealer: true,
        highestBid: null,
        bidderCount: row.auction?._count.bids ?? null,
        endsAt: row.auction?.endsAt.toISOString() ?? null,
        href: canonicalPath(locale, row).path,
      };
    }),
  };
}

/** المعارض النشطة — لفهرس `/dealers` وخريطة الموقع. */
export async function listPublicDealers(locale: string): Promise<
  { slug: string; name: string; city: string; verified: boolean; listingCount: number }[]
> {
  const dealers = await db.dealer.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, slug: true, nameAr: true, nameEn: true, city: true, verified: true },
    orderBy: [{ verified: 'desc' }, { nameAr: 'asc' }],
  });

  const counts = await db.listing.groupBy({
    by: ['sellerId'],
    where: { status: 'PUBLISHED' },
    _count: { _all: true },
  });
  const members = await db.user.findMany({
    where: { dealerId: { in: dealers.map((dealer) => dealer.id) } },
    select: { id: true, dealerId: true },
  });

  return dealers.map((dealer) => {
    const ids = members.filter((m) => m.dealerId === dealer.id).map((m) => m.id);
    return {
      slug: dealer.slug,
      name: locale === 'ar' ? dealer.nameAr : dealer.nameEn,
      city: dealer.city,
      verified: dealer.verified,
      listingCount: counts
        .filter((row) => ids.includes(row.sellerId))
        .reduce((total, row) => total + row._count._all, 0),
    };
  });
}
