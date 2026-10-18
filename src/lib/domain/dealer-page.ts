import { db } from '@/lib/db';
import { MAX_CARD_BADGES } from '@/lib/catalog/badges';
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
  /** عدد المعروض بكل طريقة بيع — لشريط الترشيح. */
  byType: { DIRECT: number; NEGOTIATION: number; AUCTION: number };
};

/**
 * **رقم السجلّ والرقم الضريبيّ لا يخرجان.**
 *
 * وهما بيانات تسجيلٍ لا شارات ثقة: عرضُهما يدعو إلى انتحال المعرض في
 * موضعٍ آخر، والثقة تُنقل بشارة «موثّق» التي يمنحها الأدمن.
 */
/**
 * ترشيحُ مخزون المعرض — **بطريقة البيع كما يرسمه التصميم**.
 *
 * ومعرضٌ بمئةٍ وأربعين مركبة بلا ترشيحٍ يُقرأ صفحتين ثم يُترك.
 * و`null` تعني الكلّ، فالترشيح إضافةٌ لا بوّابة.
 */
export type DealerStockFilter = 'DIRECT' | 'NEGOTIATION' | 'AUCTION' | null;

export async function getDealerPage(
  slug: string,
  locale: string,
  filter: DealerStockFilter = null,
  /** صاحبُ الجلسة — ومنه تُعرف بطاقاتُه. و`null` للزائر. */
  viewerId: string | null = null,
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

  const [rows, listingCount, soldCount, typeCounts] = await Promise.all([
    db.listing.findMany({
      where: {
        sellerId: { in: memberIds },
        status: 'PUBLISHED',
        ...(filter === null ? {} : { type: filter }),
      },
      include: {
        // الفحص على المركبة لا على الإعلان — وأحدثه هو المعروض
        vehicle: {
          include: {
            /** **المنشور وحده** (قرار المالك ٤) — صفحةُ المعرض عامّة. */
            inspectionReports: {
              where: { publishedAt: { not: null } },
              orderBy: { inspectedAt: 'desc' },
              take: 1,
            },
            // بلا `brand.slug` يُبنى الرابط بالاسم العربي فيُحوَّل ٣٠١
            brand: { select: { slug: true } },
          model: { select: { nameEn: true } },
          },
        },
        /** شاراتُ البطاقة — الموسومةُ وحدها، وبترتيب الكتالوج. */
        features: {
          where: { feature: { active: true, placements: { has: 'card_badge' } } },
          orderBy: { feature: { sort: 'asc' } },
          take: MAX_CARD_BADGES,
          select: { feature: { select: { key: true, nameAr: true, nameEn: true } } },
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
    db.listing.groupBy({
      by: ['type'],
      where: { sellerId: { in: memberIds }, status: 'PUBLISHED' },
      _count: { _all: true },
    }),
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
    /**
     * **وعدّاد كل طريقةٍ من الكلّ لا من المرشَّح.** عدٌّ من المعروض
     * يجعل الشريحة المختارة وحدها تحمل رقمًا والبقيّة أصفارًا.
     */
    byType: {
      DIRECT: typeCounts.find((row) => row.type === 'DIRECT')?._count._all ?? 0,
      NEGOTIATION: typeCounts.find((row) => row.type === 'NEGOTIATION')?._count._all ?? 0,
      AUCTION: typeCounts.find((row) => row.type === 'AUCTION')?._count._all ?? 0,
    },
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
        /** **إعلانُ من يقرأ** — ومالكُ المعرض يرى بطاقاته موسومة. */
        isOwn: viewerId !== null && row.sellerId === viewerId,
        badges: row.features.map((link) => link.feature),
        highestBid: null,
        bidderCount: row.auction?._count.bids ?? null,
        endsAt: row.auction?.endsAt.toISOString() ?? null,
        href: canonicalPath(locale, row).path,
      };
    }),
  };
}

export type PublicDealerCard = {
  slug: string;
  name: string;
  /** شعارُ المعرض — والشبكة تُقرأ بالصورة قبل الاسم */
  logoUrl: string | null;
  city: string;
  /** العنوان — والتصميم يكتب «الرياض · حي الملقا»، فالمدينة وحدها تُضيّع من يبحث قربه. */
  address: string | null;
  verified: boolean;
  listingCount: number;
  rating: string | null;
  ratingCount: number;
};

/**
 * المعارض النشطة — لفهرس `/dealers` وخريطة الموقع.
 *
 * **والترتيب يُطلب لا يُفرَض**: التصميم يضع «الأعلى تقييمًا»، ومن
 * يبحث عن معرضٍ قريبٍ منه يرتّب بغيره. و`verified` أوّلًا يبقى
 * افتراضًا، لأن الموثَّق هو ما تَعِد به المنصّة.
 */
export async function listPublicDealers(
  locale: string,
  options: { city?: string | null; sort?: 'rating' | 'listings' | null } = {},
): Promise<PublicDealerCard[]> {
  const dealers = await db.dealer.findMany({
    where: {
      status: 'ACTIVE',
      ...(options.city === null || options.city === undefined ? {} : { city: options.city }),
    },
    select: {
      id: true, slug: true, nameAr: true, nameEn: true, city: true, address: true,
      verified: true, ratingAvg: true, ratingCount: true, logoUrl: true,
    },
    orderBy:
      options.sort === 'rating'
        ? [{ ratingAvg: { sort: 'desc', nulls: 'last' } }, { nameAr: 'asc' }]
        : [{ verified: 'desc' }, { nameAr: 'asc' }],
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

  const mapped = dealers.map((dealer) => {
    const ids = members.filter((m) => m.dealerId === dealer.id).map((m) => m.id);
    return {
      slug: dealer.slug,
      name: locale === 'ar' ? dealer.nameAr : dealer.nameEn,
      /**
       * **وشبكةُ المعارض تُقرأ بالصورة قبل الاسم.** فهرسٌ من ثماني
       * بطاقاتٍ نصّية يُسقط كلّ تمييزٍ بينها، ويجعل الاختيار قراءةً
       * لا لمحة.
       */
      logoUrl: dealer.logoUrl,
      city: dealer.city,
      address: dealer.address,
      verified: dealer.verified,
      // التقييم نصًّا — والقسمة تُترك للعرض فلا تُفقد الكسور
      rating: dealer.ratingAvg?.toString() ?? null,
      ratingCount: dealer.ratingCount,
      listingCount: counts
        .filter((row) => ids.includes(row.sellerId))
        .reduce((total, row) => total + row._count._all, 0),
    };
  });

  /**
   * **والترتيب بالمخزون يقع هنا**: العدد محسوبٌ بعد الجلب (مجموعُ
   * إعلانات أعضائه)، فلا يُرتَّب به في الاستعلام.
   */
  if (options.sort === 'listings') {
    return mapped.sort((a, b) => b.listingCount - a.listingCount);
  }
  return mapped;
}
