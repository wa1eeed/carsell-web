import { Prisma } from '@/generated/prisma/client';
import type { AuctionStatus, ListingStatus, OfferStatus } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { publicUrl } from '@/lib/r2';

/**
 * ═══ شاشات المراقبة — A16 · A22 · A23 · A27 ═══
 *
 * أربع شاشات تجمعها صفة واحدة: **تُقرأ ولا تُكتب**. المزاد يُدار من
 * قواعده، والعرض من طرفيه، والإعلان من طابور مراجعته، والتدقيق **لا
 * يُعدَّل ولا يُحذف** بحكم تعريفه.
 *
 * فلا مسار كتابةٍ لأيٍّ منها — وزرٌّ يُغري بالتدخّل في مفاوضةٍ بين
 * طرفين هو أوّل ما يُساء استعماله. التصميم يقولها في عنوان A23:
 * **«مراقبة لا تدخّل»**.
 *
 * ═══ والحالة المخزَّنة لا تكفي متى كان لها وقت ═══
 *
 * مزادٌ حالتُه `LIVE` وقد انقضى وقتُه ليس جاريًا، وعرضٌ `PENDING`
 * فاتت مهلتُه ليس نشطًا — والوظيفة الدورية تمرّ كل خمس دقائق. فالفرز
 * هنا **بالحالة وانقضاء الوقت معًا**، وإلّا عرضت الشاشة عددًا يكذب.
 */

const minutesSince = (from: Date, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));

// ═══════════════════════════════════════════════════════════
//  A27 — كل الإعلانات
// ═══════════════════════════════════════════════════════════

/**
 * ═══ صفُّ الإعلان في اللوحة — كرتٌ لا سطر ═══
 *
 * كان سطرًا: عنوانٌ وسعرٌ وحالة. **ومن يراجع إعلانًا يحتاج أن يعرف
 * قبل أن يفتحه**: أيُّ مركبةٍ هي (صورة)، ومن يبيعها، وأفردٌ هو أم
 * معرض، وأمشترِكٌ هو أم لا، ومتى نُشر — وكلُّ ذلك يُفتح اليوم في
 * صفحةٍ أخرى أو لا يُعرض أصلًا.
 *
 * فمراجعةُ عشرين إعلانًا كانت عشرين فتحًا ورجوعًا.
 */
export type ListingRow = {
  ref: string;
  title: string;
  year: number;
  sellerName: string;
  askPrice: string;
  type: string;
  status: ListingStatus;
  city: string;
  offerCount: number;
  viewCount: number;
  publishedAt: string | null;
  /** غلافُ الإعلان — `null` حين لا صورة، فتُرسم خانةٌ لا فراغ */
  thumbnail: string | null;
  imageCount: number;
  /** **صفةُ البائع**: معرضٌ موثَّق · معرض · فرد — وهي تغيّر المراجعة */
  sellerKind: 'DEALER_VERIFIED' | 'DEALER' | 'INDIVIDUAL';
  /** اسمُ باقته إن كان مشتركًا — و`null` لمن لا اشتراك له */
  planName: string | null;
  mileageKm: number;
  /** أمفحوصةٌ هي — فالمراجع يعرف قبل أن يفتح التقرير */
  inspected: boolean;
};

export type ListingCounts = {
  total: number;
  published: number;
  pendingReview: number;
  reserved: number;
  sold: number;
  suspended: number;
  /**
   * ═══ وحالةٌ بلا شريحة لا تُرى ═══
   *
   * `DRAFT` يكتبه المنتج (معالج البيع يحفظ مسودّة) ولم تكن له شريحة —
   * فمجموع الشرائح الخمس ٥٧ و«الكل» ٦٠، وثلاثُ مسودّات لا تُبلَغ إلا
   * من «الكل». والصنف نفسه أُصلح في `REFUNDED` بطلبات الخدمة.
   */
  draft: number;
  /** أوقفه بائعُه مؤقّتًا — ويعود بضغطة. */
  paused: number;
  /** نصيب المنشور من الإجمالي — والانخفاض يعني طابورًا أو إيقافات */
  activeSharePct: number;
  /** نصيبُ المباع من الجرد كلِّه — وهو ما يقيس السوق لا العدد وحده */
  soldSharePct: number;
  /**
   * ═══ متوسّطُ أيّام البيع — **إلى الإغلاق لا إلى اليوم** ═══
   *
   * إعلانٌ بِيع بعد شهرٍ يبقى عمرُه شهرًا، وقياسُه إلى اليوم يرفع
   * المتوسّطَ كلَّما مرّ وقتٌ على ما بيع — فيبدو السوقُ يتباطأ وهو ساكن.
   *
   * و`null` حين لا مبيعَ له تاريخان: صفرٌ هنا يُقرأ «يُباع في يومه».
   */
  avgDaysToSell: number | null;
};

/**
 * ═══ بحث القوائم — وما يُبحث عنه فعلًا ═══
 *
 * المرجع (`ADS2026A0042`) أوّلًا: هو ما يُنسخ من محادثةٍ أو بلاغ.
 * ثم اسم المركبة والمدينة واسم البائع — وهي ما يُكتب حين لا يُحفظ
 * المرجع. **ولا يُبحث في الهاتف**: رقمٌ كامل في مربّع بحثٍ يُسجَّل في
 * كل سجلّ وصول، وهو بيانٌ شخصيّ لا يُسرَّب بحثًا.
 *
 * و`mode: 'insensitive'` لأن المراجع تُنسخ بحالتين، و«ADS» و«ads»
 * واحد عند من يكتبها.
 */
function listingSearch(q: string | null): Prisma.ListingWhereInput {
  const term = (q ?? '').trim();
  if (term === '') return {};
  return {
    OR: [
      { ref: { contains: term, mode: 'insensitive' } },
      { city: { contains: term, mode: 'insensitive' } },
      { seller: { name: { contains: term, mode: 'insensitive' } } },
      { vehicle: { brandName: { contains: term, mode: 'insensitive' } } },
      { vehicle: { modelName: { contains: term, mode: 'insensitive' } } },
      { vehicle: { trimName: { contains: term, mode: 'insensitive' } } },
    ],
  };
}

export async function allListings(
  status: ListingStatus | null = null,
  take = 100,
  q: string | null = null,
): Promise<ListingRow[]> {
  const rows = await db.listing.findMany({
    where: { ...(status === null ? {} : { status }), ...listingSearch(q) },
    orderBy: { publishedAt: { sort: 'desc', nulls: 'last' } },
    take,
    select: {
      ref: true,
      askPrice: true,
      type: true,
      status: true,
      city: true,
      viewCount: true,
      publishedAt: true,
      seller: {
        select: {
          name: true,
          phone: true,
          dealer: { select: { verified: true } },
          subscriptions: {
            where: { status: 'active' },
            take: 1,
            select: { plan: { select: { nameAr: true } } },
          },
        },
      },
      vehicle: {
        select: {
          brandName: true, modelName: true, trimName: true, year: true, mileageKm: true,
          inspectionReports: { take: 1, select: { id: true } },
        },
      },
      /** الغلاف أوّلًا، وإلّا فأوّل صورة — ولا تُجلب البقيّة */
      images: {
        orderBy: [{ isCover: 'desc' }, { sort: 'asc' }],
        take: 1,
        select: { r2Key: true },
      },
      _count: { select: { offers: true, images: true } },
    },
  });

  return rows.map((row) => ({
    ref: row.ref,
    title: [row.vehicle.brandName, row.vehicle.modelName, row.vehicle.trimName]
      .filter((part) => part !== null && part !== '')
      .join(' '),
    year: row.vehicle.year,
    sellerName: row.seller.name ?? row.seller.phone,
    askPrice: row.askPrice.toFixed(2),
    type: row.type,
    status: row.status,
    city: row.city,
    offerCount: row._count.offers,
    viewCount: row.viewCount,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    thumbnail: row.images[0] === undefined ? null : publicUrl(row.images[0].r2Key),
    imageCount: row._count.images,
    sellerKind:
      row.seller.dealer === null
        ? 'INDIVIDUAL'
        : row.seller.dealer.verified
          ? 'DEALER_VERIFIED'
          : 'DEALER',
    planName: row.seller.subscriptions[0]?.plan.nameAr ?? null,
    mileageKm: row.vehicle.mileageKm,
    inspected: row.vehicle.inspectionReports.length > 0,
  }));
}

export async function listingCounts(): Promise<ListingCounts> {
  const [grouped, soldRows] = await Promise.all([
    db.listing.groupBy({ by: ['status'], _count: true }),
    db.listing.findMany({
      where: { status: 'SOLD', publishedAt: { not: null }, closedAt: { not: null } },
      select: { publishedAt: true, closedAt: true },
    }),
  ]);
  const at = (status: ListingStatus): number =>
    grouped.find((row) => row.status === status)?._count ?? 0;

  const total = grouped.reduce((sum, row) => sum + row._count, 0);
  const published = at('PUBLISHED');

  return {
    total,
    published,
    pendingReview: at('PENDING_REVIEW'),
    reserved: at('RESERVED'),
    sold: at('SOLD'),
    suspended: at('SUSPENDED'),
    draft: at('DRAFT'),
    /**
     * **وأوقفه صاحبُه** — غيرُ `SUSPENDED` التي يوقعها الأدمن.
     * والزائرُ لا يرى الإعلان في الحالين، **والمشغّل لم يكن يراه في
     * واحدةٍ منهما**: لا شريحةَ له في «كل الإعلانات»، فيسقط من
     * المجموع ولا يُفتح من مكان. وكشفَه زرعُ الحال.
     */
    paused: at('PAUSED'),
    activeSharePct: total === 0 ? 0 : Math.round((published / total) * 100),
    soldSharePct: total === 0 ? 0 : Math.round((at('SOLD') / total) * 100),
    avgDaysToSell:
      soldRows.length === 0
        ? null
        : Math.round(
            soldRows.reduce(
              (sum, row) =>
                sum +
                ((row.closedAt?.getTime() ?? 0) - (row.publishedAt?.getTime() ?? 0)) / 86_400_000,
              0,
            ) / soldRows.length,
          ),
  };
}

// ═══════════════════════════════════════════════════════════
//  A22 — المزادات
// ═══════════════════════════════════════════════════════════

export type AuctionRow = {
  listingRef: string;
  title: string;
  year: number;
  sellerName: string;
  /**
   * ═══ ما يحتاجه المراقب قبل أن يفتح المزاد ═══
   *
   * الصفّ كان يقول مركبةً نصًّا واسمَ بائعٍ **لا يُفتح**، ولا صورةَ
   * للمركبة التي يُزايَد عليها، ولا مدينتَها — والمزاد سوقٌ محلّيّ.
   */
  sellerId: string;
  thumbnail: string | null;
  brand: string;
  model: string;
  city: string;
  /** متى يبدأ — والقادمُ يُقاس ببدئه لا بانتهائه. */
  startsAt: string;
  /** أعلى مزايدة — و`null` حين لا مزايد */
  topBid: string | null;
  /** **بلغ الاحتياطي؟** — والاحتياطي نفسه لا يخرج في استجابة عامة */
  reserveMet: boolean;
  bidderCount: number;
  bidCount: number;
  /**
   * ═══ «يتابعون» — ومن يُخطَر بالإغلاق هم من حفظوه ═══
   *
   * ترميزُ `A22` يكتب «٤٢ يتابعون» على المزاد **القادم**: لا مزايدةَ قبل
   * البدء، فالعددُ الوحيد الذي يقول إن كان مرتقَبًا هو من حفظه.
   *
   * وليس حقلًا جديدًا: `remindClosingAuctions` تُخطر **أصحابَ المفضّلة**
   * على الإعلان — فهم «المتابعون» في المنتج، والشاشةُ تعدّ ما يُخطَر.
   */
  watcherCount: number;
  status: AuctionStatus;
  /** ثوانٍ حتى الإغلاق — وسالبٌ يعني انقضى ولم تمرّ الوظيفة بعد */
  secondsLeft: number;
  endsAt: string;
};

export type AuctionCounts = {
  /** كلُّ المزادات — **عدًّا لا جمعَ شرائح**. */
  all: number;
  live: number;
  scheduled: number;
  unmet: number;
  ended: number;
  /** مجموع أعلى المزايدات في الجارية */
  liveValue: string;
  /** نصيب ما بلغ احتياطيه من المنتهية */
  clearancePct: number;
};

export async function auctionMonitor(
  filter: 'live' | 'scheduled' | 'unmet' | 'ended' | null = null,
  now: Date = new Date(),
  q: string | null = null,
): Promise<AuctionRow[]> {
  const rows = await db.auction.findMany({
    where: {
      ...(filter === 'live'
        ? { status: 'LIVE' as const, endsAt: { gt: now } }
        : filter === 'scheduled'
          ? { status: 'SCHEDULED' as const }
          : filter === 'unmet'
            ? { status: 'ENDED_UNMET' as const }
            : filter === 'ended'
              ? { status: { in: ['ENDED_MET' as const, 'ENDED_UNMET' as const] } }
              : {}),
      // البحث على الإعلان — والمزاد لا مرجع له يُنسخ، فمرجعُ إعلانه هو المقروء
      ...(q === null || q.trim() === '' ? {} : { listing: listingSearch(q) }),
    },
    orderBy: { endsAt: 'asc' },
    take: 100,
    select: {
      id: true,
      status: true,
      endsAt: true,
      reservePrice: true,
      startsAt: true,
      listing: {
        select: {
          ref: true,
          city: true,
          seller: { select: { id: true, name: true, phone: true } },
          vehicle: { select: { brandName: true, modelName: true, year: true } },
          images: {
            orderBy: [{ isCover: 'desc' }, { sort: 'asc' }],
            take: 1,
            select: { r2Key: true },
          },
        },
      },
      bids: { orderBy: { amount: 'desc' }, take: 1, select: { amount: true } },
      _count: { select: { bids: true } },
      listingId: true,
    },
  });

  /**
   * عدد **المزايدين** لا المزايدات — والفرق كبير: تسع عشرة مزايدة من
   * ثلاثة أشخاص سوقٌ ضيّق، ومن تسعة عشر سوقٌ حيّ.
   *
   * و`groupBy` لا يعطي `distinct` داخل التجميع، فتُقرأ الأزواج مرّةً
   * ويُعدّ الفريد في الشيفرة — استعلامٌ واحد لا استعلامٌ لكل صفّ.
   */
  const auctionIds = rows.map((row) => row.id);
  const bidPairs =
    auctionIds.length === 0
      ? []
      : await db.bid.findMany({
          where: { auctionId: { in: auctionIds } },
          select: { auctionId: true, bidderId: true },
          distinct: ['auctionId', 'bidderId'],
        });

  const bidderCounts = new Map<string, number>();
  for (const pair of bidPairs) {
    bidderCounts.set(pair.auctionId, (bidderCounts.get(pair.auctionId) ?? 0) + 1);
  }

  /**
   * المتابعون — **أصحابُ المفضّلة على الإعلان**، وهم من تُخطرهم
   * `remindClosingAuctions`. و`Favorite` بلا علاقةٍ إلى `Listing`،
   * فالتجميعُ بالمعرّفات في استعلامٍ واحد لا استعلامٍ لكل صفّ.
   */
  const listingIds = rows.map((row) => row.listingId);
  const watchPairs =
    listingIds.length === 0
      ? []
      : await db.favorite.groupBy({
          by: ['listingId'],
          where: { listingId: { in: listingIds } },
          _count: { _all: true },
        });
  const watchers = new Map(watchPairs.map((row) => [row.listingId, row._count._all]));

  return rows.map((row) => {
    const top = row.bids[0]?.amount ?? null;
    return {
      listingRef: row.listing.ref,
      title: `${row.listing.vehicle.brandName} ${row.listing.vehicle.modelName}`,
      year: row.listing.vehicle.year,
      sellerName: row.listing.seller.name ?? row.listing.seller.phone,
      sellerId: row.listing.seller.id,
      /** مفتاحُ R2 ليس رابطًا — ويُمرَّر خامًا فتُرسم صورةٌ مكسورة. */
      thumbnail:
        row.listing.images[0] === undefined ? null : publicUrl(row.listing.images[0].r2Key),
      brand: row.listing.vehicle.brandName,
      model: row.listing.vehicle.modelName,
      city: row.listing.city,
      startsAt: row.startsAt.toISOString(),
      topBid: top === null ? null : top.toFixed(2),
      /**
       * **`reserveMet` لا `reservePrice`.** الاحتياطي سرّ البائع، وقد
       * حُرس في الاستجابة العامّة — فتسريبُه في لوحة الأدمن يجعله
       * يمرّ في لقطة شاشة أو تصدير.
       */
      reserveMet: top !== null && row.reservePrice !== null && top.greaterThanOrEqualTo(row.reservePrice),
      bidderCount: bidderCounts.get(row.id) ?? 0,
      watcherCount: watchers.get(row.listingId) ?? 0,
      bidCount: row._count.bids,
      status: row.status,
      secondsLeft: Math.floor((row.endsAt.getTime() - now.getTime()) / 1000),
      endsAt: row.endsAt.toISOString(),
    };
  });
}

export async function auctionCounts(now: Date = new Date()): Promise<AuctionCounts> {
  const [all, live, scheduled, unmet, met, liveRows] = await Promise.all([
    /**
     * **«الكل» تُعَدّ ولا تُجمَع.** كانت الشاشة تجمع `live + scheduled
     * + ended`، و**المزاد الذي انقضى وقتُه وحالتُه `LIVE` بعد** ليس في
     * أيٍّ منها (الوظيفة تمرّ كل خمس دقائق) — فتقول الشريحة أقلَّ ممّا
     * تعرض القائمة. (البوابة ٤٠.)
     */
    db.auction.count(),
    // **الحالة وانقضاء الوقت معًا** — و`LIVE` وحدها تعدّ المنتهي جاريًا
    db.auction.count({ where: { status: 'LIVE', endsAt: { gt: now } } }),
    db.auction.count({ where: { status: 'SCHEDULED' } }),
    db.auction.count({ where: { status: 'ENDED_UNMET' } }),
    db.auction.count({ where: { status: 'ENDED_MET' } }),
    db.auction.findMany({
      where: { status: 'LIVE', endsAt: { gt: now } },
      select: { bids: { orderBy: { amount: 'desc' }, take: 1, select: { amount: true } } },
    }),
  ]);

  const liveValue = liveRows.reduce(
    (sum, row) => sum.plus(row.bids[0]?.amount ?? 0),
    new Prisma.Decimal(0),
  );
  const ended = met + unmet;

  return {
    all,
    live,
    scheduled,
    unmet,
    ended,
    liveValue: liveValue.toFixed(2),
    clearancePct: ended === 0 ? 0 : Math.round((met / ended) * 100),
  };
}

// ═══════════════════════════════════════════════════════════
//  A23 — العروض والمفاوضات
// ═══════════════════════════════════════════════════════════

export type OfferRow = {
  id: string;
  listingRef: string;
  title: string;
  buyerName: string;
  sellerName: string;
  amount: string;
  askPrice: string;
  status: OfferStatus;
  autoRejected: boolean;
  isCounter: boolean;
  /** انقضت مهلته وإن بقيت حالته نشطة في الجدول */
  lapsed: boolean;
  waitingMinutes: number;
  /**
   * ═══ ما يحتاجه المراقب قبل أن يفتح العرض ═══
   *
   * الصفّ كان يقول اسمين نصًّا لا يُفتح أيٌّ منهما، ولا يقول أيّ
   * مركبةٍ هي بصورتها، ولا **كم بقي من المهلة** — وعرضٌ بقيت له ساعة
   * غير عرضٍ بقي له يومان، والصفّ كان يسوّيهما بـ«منذ».
   */
  buyerId: string;
  sellerId: string;
  thumbnail: string | null;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear: number;
  city: string;
  /** ساعاتٌ حتى انقضاء المهلة — سالبٌ حين انقضت. */
  hoursToExpiry: number;
  /** عددُ جولات المفاوضة — عرضٌ ومقابلُه ومقابلُ مقابله. */
  round: number;
};

export type OfferCounts = {
  /** كلُّ العروض — **عدًّا لا جمعَ شرائح**: الجمع يُسقط ما لا شريحةَ له. */
  all: number;
  active: number;
  countered: number;
  accepted: number;
  autoRejected: number;
  /** بلا ردّ أكثر من يوم — وهي التي تسقط تلقائيًّا */
  stale: number;
  acceptancePct: number;
  /**
   * ═══ وسيطُ ردّ البائع بالساعات — **لا متوسّطُه** ═══
   *
   * ردٌّ واحدٌ بعد أسبوعٍ يجرّ متوسّطَ عشرين ردًّا في دقائق، فيقول الرقمُ
   * عن السوق ما لا يلقاه أحد. والوسيطُ يصف ما يلقاه أكثرُ من يفاوض.
   * (القاعدةُ مكتوبةٌ في هذا المستودع من بطاقة ردّ المعرض.)
   *
   * و`null` حين لا ردَّ بعد — صفرٌ هنا يُقرأ «يردّون فورًا».
   */
  medianResponseHours: number | null;
  /**
   * نصيبُ ما جاء **فوق الحدّ الأدنى** من العروض التي لصاحبها حدّ.
   *
   * وترميزُ `A23` يضعها تحت «نسبة القبول» تفسيرًا لها: عرضٌ دون الأرضيّة
   * يُرفض آليًّا، فنسبةُ القبول تُقرأ على ضوء كم عرضًا بلغها أصلًا.
   */
  aboveFloorPct: number | null;
};

export async function offerMonitor(
  filter: 'active' | 'countered' | 'accepted' | 'auto' | null = null,
  now: Date = new Date(),
  q: string | null = null,
): Promise<OfferRow[]> {
  const rows = await db.offer.findMany({
    where: {
      ...(filter === 'active'
        ? { status: 'PENDING' as const, expiresAt: { gt: now } }
        : filter === 'countered'
          ? { status: 'COUNTERED' as const }
          : filter === 'accepted'
            ? { status: 'ACCEPTED' as const }
            : filter === 'auto'
              ? { autoRejected: true }
              : {}),
      /**
       * البحث على الإعلان — **والعرض لا مرجع له يُنسخ**، ومرجعُ إعلانه
       * هو ما يُكتب في بلاغٍ أو مكالمة.
       */
      ...(q === null || q.trim() === '' ? {} : { listing: listingSearch(q) }),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      amount: true,
      status: true,
      autoRejected: true,
      parentOfferId: true,
      createdAt: true,
      expiresAt: true,
      buyer: { select: { id: true, name: true, phone: true } },
      listing: {
        select: {
          ref: true,
          askPrice: true,
          city: true,
          seller: { select: { id: true, name: true, phone: true } },
          vehicle: { select: { brandName: true, modelName: true, year: true } },
          images: {
            orderBy: [{ isCover: 'desc' }, { sort: 'asc' }],
            take: 1,
            select: { r2Key: true },
          },
        },
      },
    },
  });

  /**
   * ═══ جولةُ التفاوض — وتُحسب بصعود السلسلة ═══
   *
   * `parentOfferId` يقول «هذا مقابل» ولا يقول الكم. والفرق قرارٌ:
   * عرضٌ في جولته الرابعة مفاوضةٌ جادّة تقترب، وعرضٌ أوّل جسّ نبض.
   */
  const parents = new Map(rows.map((row) => [row.id, row.parentOfferId]));
  const roundOf = (id: string): number => {
    let depth = 1;
    let cursor = parents.get(id) ?? null;
    while (cursor !== null && depth < 20) {
      depth += 1;
      cursor = parents.get(cursor) ?? null;
    }
    return depth;
  };

  return rows.map((row) => ({
    id: row.id,
    listingRef: row.listing.ref,
    title: `${row.listing.vehicle.brandName} ${row.listing.vehicle.modelName} ${String(row.listing.vehicle.year)}`,
    buyerName: row.buyer.name ?? row.buyer.phone,
    sellerName: row.listing.seller.name ?? row.listing.seller.phone,
    amount: row.amount.toFixed(2),
    askPrice: row.listing.askPrice.toFixed(2),
    status: row.status,
    autoRejected: row.autoRejected,
    isCounter: row.parentOfferId !== null,
    lapsed: row.expiresAt <= now,
    waitingMinutes: minutesSince(row.createdAt, now),
    buyerId: row.buyer.id,
    sellerId: row.listing.seller.id,
    /** مفتاحُ R2 ليس رابطًا — ويُمرَّر خامًا فتُرسم صورةٌ مكسورة. */
    thumbnail:
      row.listing.images[0] === undefined ? null : publicUrl(row.listing.images[0].r2Key),
    vehicleBrand: row.listing.vehicle.brandName,
    vehicleModel: row.listing.vehicle.modelName,
    vehicleYear: row.listing.vehicle.year,
    city: row.listing.city,
    hoursToExpiry: (row.expiresAt.getTime() - now.getTime()) / 3_600_000,
    round: roundOf(row.id),
  }));
}

export async function offerCounts(now: Date = new Date()): Promise<OfferCounts> {
  const dayAgo = new Date(now.getTime() - 86_400_000);

  const [all, active, countered, accepted, autoRejected, stale, decided, responded, withFloor] =
    await Promise.all([
    /**
     * ═══ «الكل» تُعَدّ ولا تُجمَع ═══
     *
     * كانت الشاشة تجمع أربعَ شرائح من ستّ حالات، والقائمةُ بلا ترشيحٍ
     * تعيد الستّ — فقالت «٤» وعرضت «٧». **رقمان متناقضان في شاشة.**
     * (ثاني وقوعٍ للصنف بعد «متعثّرة» في الطلبات؛ البوابة ٤٠.)
     */
    db.offer.count(),
    // **نشط = الحالة ولم تنقضِ المهلة** — والحالة وحدها تعدّ الميّت حيًّا
    db.offer.count({ where: { status: 'PENDING', expiresAt: { gt: now } } }),
    db.offer.count({ where: { status: 'COUNTERED' } }),
    db.offer.count({ where: { status: 'ACCEPTED' } }),
    db.offer.count({ where: { autoRejected: true } }),
    db.offer.count({
      where: { status: 'PENDING', expiresAt: { gt: now }, createdAt: { lt: dayAgo } },
    }),
    db.offer.count({ where: { status: { in: ['ACCEPTED', 'REJECTED'] }, autoRejected: false } }),

    /** أزواجُ الإنشاء والردّ — والوسيطُ يُحسب في الشيفرة لا في SQL. */
    db.offer.findMany({
      where: { respondedAt: { not: null } },
      select: { createdAt: true, respondedAt: true },
      take: 500,
      orderBy: { respondedAt: 'desc' },
    }),

    /**
     * العروضُ على إعلانٍ له أرضيّة — ومنها ما بلغها.
     * و`minAcceptPrice` سرُّ البائع: يُعَدّ ولا يخرج.
     */
    db.offer.findMany({
      where: { listing: { minAcceptPrice: { not: null } } },
      select: { amount: true, listing: { select: { minAcceptPrice: true } } },
      take: 1000,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  /** الوسيطُ — والقائمةُ تُرتَّب ثمّ يُؤخذ وسطُها. */
  const hours = responded
    .map((row) => ((row.respondedAt?.getTime() ?? 0) - row.createdAt.getTime()) / 3_600_000)
    .filter((value) => value >= 0)
    .sort((a, b) => a - b);
  const medianResponseHours =
    hours.length === 0 ? null : Math.round(hours[Math.floor(hours.length / 2)] ?? 0);

  const aboveFloor = withFloor.filter(
    (row) => Number(row.amount) >= Number(row.listing.minAcceptPrice ?? 0),
  ).length;

  return {
    all,
    active,
    countered,
    accepted,
    autoRejected,
    stale,
    // النسبة من العروض التي نظر فيها البائع — والمرفوض آليًّا لم ينظر فيه
    acceptancePct: decided === 0 ? 0 : Math.round((accepted / decided) * 100),
    medianResponseHours,
    aboveFloorPct:
      withFloor.length === 0 ? null : Math.round((aboveFloor / withFloor.length) * 100),
  };
}

// ═══════════════════════════════════════════════════════════
//  A16 — سجل التدقيق
// ═══════════════════════════════════════════════════════════

export type AuditRow = {
  id: string;
  actorId: string;
  /** `null` للنظام — والشاشة تصوغ اسمه */
  actorName: string | null;
  actorRole: string;
  actorType: string;
  action: string;
  entity: string;
  entityId: string;
  ip: string | null;
  createdAt: string;
};

/** أصناف الإجراءات — والتصفية بها لا بالبحث النصّيّ. */
export const AUDIT_LENSES = {
  money: ['escrow.', 'payout.', 'commission.', 'deadline.', 'finance.'],
  identity: ['identity.', 'user.identity'],
  permissions: ['admin.', 'team.', 'role.'],
} as const;

/**
 * ═══ الحسّاسة — قائمةٌ بأعيانها لا ببادئة ═══
 *
 * العدساتُ الثلاث ببادئاتٍ واسعة، و«حسّاسة» في الترميز **أضيقُ منها
 * كلِّها** (٣١ من ٤٢٨٠، ودون «مالية ١٤٦» و«بيانات شخصية ٨٩»). فليست
 * اتّحادًا ولا بادئة: هي ما يفتحه المدقّق أوّلًا.
 *
 * والمعيار: **ما لا رجعةَ فيه على إنسان، أو مالٌ يخرج من المنصّة، أو
 * تبديلُ من يملك ماذا.** فـ`escrow.settled` فيها و`deadline.changed`
 * ليست (مالٌ لا يتحرّك)، و`identity.view` فيها و`identity.verified`
 * ليست (قرارٌ يُراجَع، والاطّلاعُ على الوثيقة لا يُستعاد).
 *
 * **والقائمةُ تُحرَس**: `tests/audit-lenses.test.ts` يشترط لكلّ مفتاحٍ
 * هنا تسميةً في `AUDIT_ACTION_LABEL` — فإجراءٌ يُعاد تسميتُه يُسقط
 * الاختبار بدل أن يسقط صامتًا من العدسة.
 */
export const AUDIT_SENSITIVE: readonly string[] = [
  // وثيقةٌ شخصية تُفتح — ولا يُستعاد اطّلاع
  'identity.view',
  'identity.access_spike',
  // مالٌ يخرج
  'escrow.settled',
  'payout.sent',
  'provider_payout.sent',
  'wallet.adjustment_requested',
  'provider.iban_set',
  // من يملك ماذا
  'admin.provisioned',
  'admin.password_set',
  'admin.sessions_revoked',
  'apikey.issue',
  'apikey.revoke',
  // حسابٌ يُغلق على صاحبه
  'account.closed',
];

export type AuditLens = keyof typeof AUDIT_LENSES | 'sensitive';

/**
 * المفاتيحُ المقبولة في `?lens=` — **مشتقّةٌ لا منسوخة**: كانت الشاشة
 * تحمل قائمتَها بيدٍ، فعدسةٌ تُضاف هنا لا تُقبل هناك وتُقرأ «الكل».
 */
export const AUDIT_LENS_KEYS: readonly AuditLens[] = [
  'sensitive',
  ...(Object.keys(AUDIT_LENSES) as (keyof typeof AUDIT_LENSES)[]),
];

/**
 * شرطُ العدسة — **مكتوبٌ مرّة**: كان `auditTrail` و`auditCounts` يترجمان
 * العدسة كلٌّ بيده، فعدسةٌ تُضاف إلى إحداهما تُنتج عدّادًا لا يطابق قائمته.
 */
function lensWhere(lens: AuditLens): { OR: { action: object }[] } {
  if (lens === 'sensitive') {
    return { OR: AUDIT_SENSITIVE.map((action) => ({ action: { equals: action } })) };
  }
  return { OR: AUDIT_LENSES[lens].map((prefix) => ({ action: { startsWith: prefix } })) };
}

/**
 * ═══ التصفية المتقدّمة — نافذةٌ وفاعلٌ وإجراء ═══
 *
 * العدسةُ تسأل «أيّ صنف»، والمدقّق يسأل «ماذا وقع بين الاثنين والخميس»
 * و«ماذا فعل فلان». وثلاثتها تُجمع بـ`AND` لا بـ`OR`: من يحدّد نافذةً
 * ثمّ فاعلًا يقصد الاثنين معًا.
 */
export type AuditFilter = {
  /** من — شاملٌ لليوم نفسه */
  from?: Date;
  /** إلى — **وتُدفَع إلى آخر اليوم**: «إلى الخميس» تعني بنهايته */
  to?: Date;
  /** جزءٌ من اسم الإجراء — `escrow` يطابق `escrow.settled` */
  action?: string;
  actorId?: string;
};

export async function auditTrail(
  lens: AuditLens | null = null,
  take = 120,
  filter: AuditFilter = {},
): Promise<AuditRow[]> {
  const range =
    filter.from === undefined && filter.to === undefined
      ? {}
      : {
          createdAt: {
            ...(filter.from === undefined ? {} : { gte: filter.from }),
            ...(filter.to === undefined ? {} : { lte: filter.to }),
          },
        };

  const rows = await db.auditLog.findMany({
    where: {
      ...(lens === null ? {} : lensWhere(lens)),
      ...range,
      ...(filter.action === undefined || filter.action === ''
        ? {}
        : { action: { contains: filter.action, mode: 'insensitive' as const } }),
      ...(filter.actorId === undefined || filter.actorId === ''
        ? {}
        : { actorId: filter.actorId }),
    },
    orderBy: { createdAt: 'desc' },
    take,
  });

  const adminIds = [...new Set(rows.filter((r) => r.actorType === 'admin').map((r) => r.actorId))];
  const admins =
    adminIds.length === 0
      ? []
      : await db.adminUser.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, name: true, role: true },
        });

  return rows.map((row) => {
    const admin = admins.find((entry) => entry.id === row.actorId) ?? null;
    return {
      id: row.id,
      actorId: row.actorId,
      /**
       * **`null` لا جملة.** النظام فاعلٌ أيضًا، وتسميتُه صياغةٌ
       * تخصّ الشاشة — والنطاق لا يعرف لغةً (البوابة ١٧).
       */
      actorName: admin?.name ?? (row.actorType === 'system' ? null : row.actorId),
      actorRole: admin?.role ?? row.actorType.toUpperCase(),
      actorType: row.actorType,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      ip: row.ip,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function auditCounts(): Promise<Record<string, number>> {
  const [total, sensitive, money, identity, permissions] = await Promise.all([
    db.auditLog.count(),
    db.auditLog.count({ where: lensWhere('sensitive') }),
    db.auditLog.count({ where: lensWhere('money') }),
    db.auditLog.count({ where: lensWhere('identity') }),
    db.auditLog.count({ where: lensWhere('permissions') }),
  ]);

  return { total, sensitive, money, identity, permissions };
}
