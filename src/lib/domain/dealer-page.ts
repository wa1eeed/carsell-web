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

  /**
   * ═══ كيف يردّ هذا المعرض — **و`null` دون عتبة الثقة** ═══
   *
   * ترميز `Wg` يعرض «معدل الرد ٩٨٪» و«متوسط زمن الرد ٢٢ د». وهما
   * يُحسبان من العروض الواردة على إعلاناته: ما رُدّ عليه بقبولٍ أو
   * مقابلٍ أو رفضٍ **مقصود**، مقابل ما انقضت مهلتُه بلا ردّ.
   *
   * **والرفضُ الآليّ ليس ردًّا**: النظامُ ردّ لا البائع، وعدُّه يرفع
   * معدَّلَ من وضع أرضيّةً عاليةً ولم يفتح الصندوق قطّ.
   *
   * **ورقمٌ من عرضين ليس معدَّلًا**: معرضٌ ردّ على واحدٍ من اثنين يُقرأ
   * «٥٠٪» كأنها سجلُّ سنة. فدون العتبة `null`، ولا تُعرض البطاقة —
   * وهو مسلك `RangeBar` نفسه.
   */
  responses: { ratePct: number; medianMinutes: number; sample: number } | null;
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

/**
 * ترتيبُ مخزون المعرض — **وترميز `Wg` يضع «الأحدث» بجوار المرشّحات**.
 *
 * وكان المخزونُ يُرتَّب بالأحدث دائمًا ولا سبيلَ إلى غيره: من يفتح
 * صفحةَ معرضٍ ليبحث عن أرخص ما عنده يُقلّب الصفحات بعينه.
 */
export type DealerStockSort = 'newest' | 'priceAsc' | 'priceDesc';

const STOCK_ORDER = {
  newest: { publishedAt: 'desc' },
  priceAsc: { askPrice: 'asc' },
  priceDesc: { askPrice: 'desc' },
} as const satisfies Record<DealerStockSort, Record<string, 'asc' | 'desc'>>;

/**
 * ═══ عتبةُ الثقة — وثمانيةٌ كأختها في `RangeBar` ═══
 *
 * رقمٌ من عرضين ليس معدَّلًا: «٥٠٪» من اثنين تُقرأ كأنها سجلُّ سنة.
 */
const RESPONSE_MIN_SAMPLE = 8;

/** نافذةُ القياس — فمعدَّلُ العام الماضي لا يصف معرضًا تبدّل. */
const RESPONSE_WINDOW_DAYS = 180;

/**
 * معدَّلُ ردّ المعرض وزمنُه — **والوسيطُ لا المتوسّط**.
 *
 * ردٌّ واحد بعد سبعة أيّام يرفع المتوسّطَ على عشرين ردًّا في دقائق،
 * فيقول الرقم عن المعرض ما لا يصفه. والوسيطُ يصف ما يلقاه أكثرُ من
 * يراسله.
 */
async function dealerResponses(
  memberIds: readonly string[],
  now: Date = new Date(),
): Promise<PublicDealer['responses']> {
  if (memberIds.length === 0) return null;

  const since = new Date(now.getTime() - RESPONSE_WINDOW_DAYS * 86_400_000);

  const offers = await db.offer.findMany({
    where: {
      listing: { sellerId: { in: [...memberIds] } },
      createdAt: { gte: since },
      /** **والمقابلُ ليس واردًا** — هو ردُّ البائع نفسِه. */
      parentOfferId: null,
      /** **والرفضُ الآليّ ليس ردًّا ولا تقصيرًا**، فيخرج من الطرفين. */
      autoRejected: false,
    },
    select: { createdAt: true, respondedAt: true, expiresAt: true },
  });

  /**
   * **وعرضٌ لم يُردّ ولم تنقضِ مهلتُه بعد لا يُحتسب**: البائع ما زال
   * في وقته، وعدُّه تقصيرًا يحكم عليه قبل أن يتأخّر.
   */
  const decided = offers.filter(
    (offer) => offer.respondedAt !== null || offer.expiresAt <= now,
  );
  if (decided.length < RESPONSE_MIN_SAMPLE) return null;

  const answered = decided.filter((offer) => offer.respondedAt !== null);
  const minutes = answered
    .map((offer) => (offer.respondedAt as Date).getTime() - offer.createdAt.getTime())
    .map((ms) => Math.max(0, Math.round(ms / 60_000)))
    .sort((a, b) => a - b);

  return {
    ratePct: Math.round((answered.length / decided.length) * 100),
    /** صفرٌ حين لا ردَّ واحد — والمعدَّلُ حينها صفرٌ أيضًا، فلا يُعرض زمنٌ كاذب. */
    medianMinutes: minutes.length === 0 ? 0 : (minutes[Math.floor(minutes.length / 2)] ?? 0),
    sample: decided.length,
  };
}

export async function getDealerPage(
  slug: string,
  locale: string,
  filter: DealerStockFilter = null,
  /** صاحبُ الجلسة — ومنه تُعرف بطاقاتُه. و`null` للزائر. */
  viewerId: string | null = null,
  sort: DealerStockSort = 'newest',
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

  const responses = await dealerResponses(memberIds);

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
      orderBy: STOCK_ORDER[sort],
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
    responses,
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
        /**
         * **وصفحةُ المعرض لا تحمل القلب بعد** — والحقلُ مطلوبٌ في
         * النوع، فيُقال `false` صراحةً لا يُسكَت عنه: البطاقةُ تُظهر
         * القلب حين يكون لها قارئٌ معروف، وهذه الشاشة لا تجلبه.
         */
        isFavorite: false,
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
/**
 * ينزع اسمَ المدينة من طرفَي العنوان — **ولا يمسّ وسطَه**.
 *
 * «حي الرياض» في جدةَ حيٌّ لا مدينة، فحذفُ الاسم أينما وقع يشوّه
 * عناوينَ صحيحة. والتكرارُ الذي يُقرأ خطأً إنّما يقع في الطرف.
 */
function stripCity(address: string | null, city: string): string | null {
  if (address === null) return null;
  const edge = '[\u060c,\u00b7-]';
  let out = address.trim();
  out = out.replace(new RegExp(`^${city}\\s*${edge}\\s*`), '').trim();
  out = out.replace(new RegExp(`\\s*${edge}\\s*${city}$`), '').trim();
  return out === '' ? null : out;
}

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
      /**
       * ═══ والعنوانُ بلا مدينته — فالمدينةُ بجواره ═══
       *
       * البطاقةُ تطبع «المدينة · العنوان»، والعنوانُ الذي يكتبه
       * المعرضُ ينتهي بمدينته عادةً — **فيُقرأ السطر «الرياض ·
       * طريق الملك عبدالعزيز، حي الملقا، الرياض»** — والمدينةُ
       * مرّتين في سطرٍ واحد.
       *
       * وترميز `Wp` يكتبه «الرياض · حي الملقا».
       */
      address: stripCity(dealer.address, dealer.city),
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
