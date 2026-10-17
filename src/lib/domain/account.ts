import { cookies } from 'next/headers';
import { ibanMasked } from './iban';
import { db } from '@/lib/db';
import { STAGES as ORDER_STAGES } from './orders';
import { consentsAwaiting } from './service-lifecycle';
import { viewingsAwaiting } from './viewings';
import type { OrderStage } from '@/generated/prisma/enums';
import type { Prisma } from '@/generated/prisma/client';
import { walletBalance as walletBalanceOf } from './wallet';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/token';
import { profileCompletion, type ProfileCompletion } from './profile';
import { canonicalPath } from './listing-detail';
import type { User } from '@/generated/prisma/client';

/**
 * حساب المستخدم — Wf.
 *
 * **قراءة الجلسة من الكوكي مباشرةً** لا من `NextRequest`: صفحة خادم
 * ليست مسار API، ولا يصلها الطلب. و`currentUser` تخدم المسارات.
 */
export async function currentUserFromCookies(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  if (token === null || token === '') return null;

  const claims = await verifySession(token);
  if (claims === null) return null;

  return db.user.findUnique({ where: { id: claims.userId } });
}

export type AccountStat = { key: string; value: number };

export type AccountOrder = {
  ref: string;
  stage: string;
  /**
   * **والحالة لم تكن تُختار إطلاقًا.** الإلغاء حالةٌ لا مرحلة، فطلبٌ
   * ملغى في `PAYMENT` تبقى مرحلتُه `PAYMENT` — وبلا هذا الحقل لا
   * تستطيع الشاشة أن تعرف أنه ملغى، فتعرض شارة «دفع» وبنرًا يقول
   * «طلبٌ ينتظر الدفع».
   */
  status: string;
  /**
   * موضع المرحلة من ستّ — **والتصميم يعرضه «الخطوة ٥ من ٦»**.
   * واسمُ المرحلة وحده لا يقول كم بقي، ومن يقرأ «نقل الملكية» لا يعرف
   * أهو في أوّل الطريق أم آخره.
   */
  step: number;
  stepCount: number;
  title: string;
  year: number;
  amount: string;
  createdAt: string;
  path: string;
};

export type AccountOffer = {
  id: string;
  listingRef: string;
  /**
   * سعر البائع المعلن — **والتصميم يعرضه بجوار العرض**.
   * وعرضٌ بلا ما يُقارَن به لا يُقرَّر عليه: «١٤١٬٠٠٠» تعني شيئًا
   * حين يكون المعلن «١٤٥٬٠٠٠».
   */
  askPrice: string;
  title: string;
  year: number;
  amount: string;
  status: string;
  expiresAt: string;
  path: string;
};

/**
 * ═══ أرقامُ «إعلاناتي» — صفُّ التصميم فوق الجدول ═══
 *
 * والتصميم يكتب «مشاهدات **هذا الأسبوع**»، و`Listing.viewCount`
 * عدّادٌ تراكميّ بلا سجلّ زمنيّ: لا جدول مشاهداتٍ بطوابعها، فلا سبيل
 * إلى نافذة أسبوع. **فالعنوان يقول ما يُحسب**: «مشاهدات» لا
 * «هذا الأسبوع» — ووسمٌ يَعِد بنافذةٍ لا تُحسب أسوأ من رقمٍ أعمّ.
 */
export type ListingStats = {
  views: number;
  favorites: number;
  /** عروضٌ تنتظر ردَّك — القائمة وحدها، لا ما انتهى */
  pendingOffers: number;
  /** متوسّط أيام العرض للمنشور — `null` حين لا منشور */
  avgDaysListed: number | null;
};

export type AccountListing = {
  ref: string;
  title: string;
  year: number;
  price: string;
  status: string;
  type: string;
  /** ملاحظة المراجع حين يُعاد الإعلان — و`null` فيما عدا ذلك */
  reviewNote: string | null;
  offerCount: number;
  viewCount: number;
  /** قابل للتفاوض — يقرؤه صندوق التحكّم ويكتبه البائع */
  negotiable: boolean;
  /** وصف البائع — يُحرَّر من «مركباتي»، و`''` حين لم يُكتب بعد */
  description: string;
  /** طلبٌ قائم يقفل السعر والإيقاف معًا — والشاشة تقولها قبل الضغط */
  hasActiveOrder: boolean;
  path: string;
};

export type AccountReport = {
  ref: string;
  score: number;
  inspectedAt: string;
  title: string;
  /** `null` إن لم يعد للمركبة إعلان منشور — التقرير يبقى وملكه لا. */
  path: string | null;
};

/**
 * ═══ طلبُ خدمةٍ قائم — ولم يكن له شاشة ═══
 *
 * شاشةُ «تقاريري» تعرض `InspectionReport` — أي **ما انتهى**. ومن دفع
 * خمسمئة ريال واختار موعدًا لا يرى طلبَه في المنتج كلّه حتى يصدر
 * التقرير. ورسالةُ النجاح تقول حرفيًّا «وتتابعه من ‹تقاريري›» —
 * فالشاشة تَعِد بمتابعةٍ لا تقع.
 */
export type AccountServiceRequest = {
  ref: string;
  serviceName: string;
  status: string;
  title: string;
  /** موعدُ العميل الذي اختاره — لا مهلةُ المزوّد */
  scheduledAt: string | null;
  city: string | null;
  amount: string;
  /** صنفُ المزوّد — ومنه معنى «اكتمل» لهذا الطلب بعينه */
  providerType: string | null;
};

export type FavoriteListing = {
  ref: string;
  title: string;
  year: number;
  price: string;
  city: string;
  /** `null` إن سُحب الإعلان — يبقى في المفضّلة ولا يُفتح */
  path: string | null;
  available: boolean;
};

/**
 * المفضّلة — **كانت تُعدّ ولا تُقرأ**.
 *
 * بطاقة الحساب تعرض «المفضّلة ٤» وتربط إلى صفحةٍ ترد ٤٠٤، فيرى
 * المستخدم عددًا لا يبلغه. والصفّ لا علاقة له بـ`Listing` في المخطّط،
 * فالربط هنا يدويّ.
 *
 * **والمسحوب يبقى معروضًا ولا يُفتح**: حذفُه من القائمة يجعل المستخدم
 * يظنّ أنه لم يحفظه قطّ، وهي معلومةٌ تخصّه لا تخصّ الإعلان.
 */
export async function favoriteListings(
  userId: string,
  locale: string,
): Promise<FavoriteListing[]> {
  const rows = await db.favorite.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  if (rows.length === 0) return [];

  const listings = await db.listing.findMany({
    where: { id: { in: rows.map((row) => row.listingId) } },
    select: {
      id: true, ref: true, askPrice: true, city: true, status: true,
      vehicle: {
        select: {
          brandName: true, modelName: true, trimName: true, year: true,
          brand: { select: { slug: true } },
          model: { select: { nameEn: true } },
        },
      },
    },
  });

  return rows.flatMap((row) => {
    const listing = listings.find((entry) => entry.id === row.listingId);
    if (listing === undefined) return [];
    const available = listing.status === 'PUBLISHED';
    return [{
      ref: listing.ref,
      title: title(listing.vehicle),
      year: listing.vehicle.year,
      price: listing.askPrice.toString(),
      city: listing.city,
      path: available ? canonicalPath(locale, listing).path : null,
      available,
    }];
  });
}

export type AccountAuction = {
  listingRef: string;
  title: string;
  year: number;
  endsAt: string;
  /** حيٌّ الآن — حالةً ووقتًا، لا حالةً وحدها */
  live: boolean;
  /** أعلى مزايدة، أو سعر الافتتاح حين لا مزايدة */
  price: string;
  bidderCount: number;
  /** دوري فيه: أعرضه أم أزايد عليه */
  role: 'seller' | 'bidder';
  /** للمزايد: أهو الأعلى الآن */
  leading: boolean;
  reserveMet: boolean;
  path: string;
};

export type AccountData = {
  user: {
    /** رقم العميل — وهو ما يقوله في مكالمة الدعم */
    ref: string | null;
    name: string | null;
    phone: string;
    email: string | null;
    idVerified: boolean;
    identityStatus: string;
    /**
     * ما كتبه المراجع — **ولم يكن يصل أحدًا**.
     *
     * شاشةُ المراجعة تطلبه بنصّها («يقرؤه صاحبه») ويُحفظ في
     * `identityNote`، ولا شاشةَ تعرضه ولا إشعارَ ينقله. فيُطلب توضيحٌ
     * ولا يصل من يستطيع تقديمه.
     */
    identityNote: string | null;
    city: string | null;
    /** الآيبان **مقنَّعًا** — يُعرض ليطمئنّ صاحبه أنه مُسجَّل، لا ليُقرأ */
    ibanMasked: string | null;
    taxStatus: string | null;
    vatNumber: string | null;
    memberSince: string;
  };
  /** رصيد محفظته — والمجموع من القيود لا من عمود */
  walletBalance: string;
  /**
   * ═══ عربونُ مزادٍ محجوز — **على البطاقة لا من الرصيد** ═══
   *
   * كان اسمُه `walletHeld` ويُعرض «منها ٥٬٠٠٠ محجوزة» تحت «رصيد
   * المحفظة **٠** ريال» — **رقمان متناقضان في سطر واحد**، ووصفٌ
   * يضع المال في غير موضعه.
   *
   * و`holdDeposit` تطلب بطاقةً وتمرّ بالبوّابة دائمًا (لا فرعَ
   * يخصم من المحفظة أصلًا): فالمال محجوزٌ عند بطاقة المزايد، لا
   * مقتطعٌ من رصيدٍ لدينا. والتعليقُ هنا كان يقول «دفتريّ اليوم»
   * من قبل أن يمرّ الحجز بالبوّابة — فصدّقه من قرأه.
   */
  depositsOnCard: string;
  /**
   * ═══ مزاداتي — وكانت غائبةً كلّيًّا ═══
   *
   * التصميم يضع قسمًا كاملًا: ما يزايد فيه وما يعرضه، بعدّاد كلٍّ.
   * ولم يكن في بيانات الحساب مزادٌ واحد — فالبائع لا يرى مزاده من
   * حسابه، والمزايد لا يعرف أين وصلت مزايداته إلّا بفتح كل صفحة.
   */
  auctions: AccountAuction[];
  completion: ProfileCompletion;
  stats: AccountStat[];
  orders: AccountOrder[];
  offers: AccountOffer[];
  listings: AccountListing[];
  reports: AccountReport[];
  /** قائمٌ لم يصدر تقريرُه بعد — وهو ما يتابعه الدافع */
  serviceRequests: AccountServiceRequest[];
  /**
   * طلباتُ فحصٍ على مركباته ينتظر إذنَه — **وبلا هذا الرقم لا باب**.
   *
   * قرار المالك: طلبُ المشتري يمرّ بالبائع. ومن لا يفتح حسابَه على
   * سطرٍ يقول «يُطلب فحصُ مركبتك» لا يعرف إلّا من إشعارٍ قد يفوته،
   * فتنقضي المهلة ويسقط الطلب — وهو الصنف الذي تكرّر: طرفٌ يُبنى بلا
   * الطرف الثاني.
   */
  consentsAwaiting: number;
  /** مواعيدُ معاينةٍ على إعلاناته تنتظر ردّه — **وعدّادٌ بلا بابٍ لا يُعرض** */
  viewingsAwaiting: number;
  /** أرقامُ صفحة «إعلاناتي» — فوق الجدول كما في التصميم */
  listingStats: ListingStats;
};

const title = (vehicle: { brandName: string; modelName: string; trimName: string | null }): string =>
  [vehicle.brandName, vehicle.modelName, vehicle.trimName]
    .filter((part) => part !== null && part !== '')
    .join(' ');

export async function getAccountData(user: User, locale: string): Promise<AccountData> {
  const vehicleSelect = {
    brandName: true,
    modelName: true,
    trimName: true,
    year: true,
    brand: { select: { slug: true } },
          model: { select: { nameEn: true } },
  } as const;

  const [orders, offers, listings, reports, favourites, serviceRequests] = await Promise.all([
    db.order.findMany({
      where: { buyerId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        ref: true, stage: true, status: true, totalAmount: true, createdAt: true,
        listing: { select: { ref: true, city: true, vehicle: { select: vehicleSelect } } },
      },
    }),
    // العروض الواردة على مركبات المستخدم — لا عروضه هو
    db.offer.findMany({
      where: { listing: { sellerId: user.id }, status: { in: ['PENDING', 'COUNTERED'] } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true, amount: true, status: true, expiresAt: true,
        // سعر البائع المعلن — والعرض بلا ما يُقارَن به لا يُقرَّر عليه
        listing: {
          select: { ref: true, city: true, askPrice: true, vehicle: { select: vehicleSelect } },
        },
      },
    }),
    db.listing.findMany({
      where: { sellerId: user.id },
      orderBy: { publishedAt: 'desc' },
      select: {
        ref: true, city: true, askPrice: true, status: true, type: true, viewCount: true,
        reviewNote: true, negotiable: true, description: true,
        vehicle: { select: vehicleSelect },
        /**
         * **والطلب القائم يُعدّ هنا.** التحكّم في الصفّ يحتاجه ليقول
         * «لا يُعدَّل» قبل الضغط لا بعده — وسؤالُه لكل صفّ على حدة
         * استعلامٌ لكل إعلان.
         */
        _count: { select: { offers: true, orders: { where: { status: 'ACTIVE' } } } },
      },
    }),
    /**
     * ═══ «تقاريري» = ما دفعتُ ثمنه (قرار المالك ٤) ═══
     *
     * كان الشرط `vehicle.ownerId` — أي **صاحبُ المركبة** لا دافعُ
     * التقرير، والاثنان مختلفان في الحال الشائعة: مشترٍ يفحص سيارةَ
     * غيره قبل شرائها. فكان الأثر معكوسًا في الطرفين:
     *
     *   · من دفع لا يجد تقريره في المنتج كلّه،
     *   · والبائع يجد في «تقاريري» تقريرًا دفع ثمنَه سواه.
     *
     * فالقائمة: ما طلبتُه أنا، ومعه ما نُشر على مركبةٍ أملكها — إذ
     * المنشور صار جزءًا من إعلانها.
     */
    db.inspectionReport.findMany({
      where: {
        OR: [
          { serviceRequest: { userId: user.id } },
          { vehicle: { ownerId: user.id }, publishedAt: { not: null } },
        ],
      },
      orderBy: { inspectedAt: 'desc' },
      take: 10,
      select: {
        ref: true, score: true, inspectedAt: true,
        vehicle: {
          select: {
            ...vehicleSelect,
            listings: {
              where: { status: 'PUBLISHED' },
              take: 1,
              select: { ref: true, city: true, vehicle: { select: vehicleSelect } },
            },
          },
        },
      },
    }),
    db.favorite.count({ where: { userId: user.id } }),
    /**
     * **القائم لا المنتهي.** `DONE` له تقريرٌ يظهر أعلاه، و`REFUNDED`
     * انتهى بردّ المال — فالمعروض هنا ما ينتظره صاحبه فعلًا.
     */
    /**
     * ═══ والمُنجَزُ يبقى مرئيًّا ═══
     *
     * كان المُرشَّح `NEW · ASSIGNED · IN_PROGRESS` وحدها، والقسم الثاني
     * في الشاشة `InspectionReport` — **فطلبٌ غيرُ فحصٍ يختفي من
     * الحساب كلِّه لحظةَ إنجازه**: من دفع ٩٠٠ ريالًا لنقل مركبته أو
     * أمّن سيارته لا يجد رقم بوليصته ولا وثيقته في أيّ شاشة، ولا
     * رابطَ يصل صفحةَ الطلب التي تحملها.
     *
     * وكلُّ حالٍ تُعرض الآن إلّا المرفوضة قبل السداد — فلا مال فيها
     * ولا أثر، وقد أُخطِر صاحبُها.
     */
    db.serviceRequest.findMany({
      where: {
        userId: user.id,
        status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'FAILED', 'REFUNDED'] },
      },
      /** والقائمُ أوّلًا: موعدٌ ينتظره يسبق إثباتًا انتهى */
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
      take: 20,
      select: {
        ref: true,
        status: true,
        scheduledAt: true,
        city: true,
        amount: true,
        service: { select: { nameAr: true, nameEn: true, providerType: true } },
        vehicle: { select: vehicleSelect },
      },
    }),
  ]);

  /**
   * ═══ أرقامُ «إعلاناتي» ═══
   *
   * **على الإعلانات كلّها لا على العشرة المعروضة.** الجدول يأخذ
   * `take: 10`، ورقمٌ فوقه يُحسب على عشرةٍ وهو يقول «مشاهداتك» يُنقص
   * من بائعٍ عنده عشرون.
   */
  /**
   * **وصفٌّ واحد لكل إعلاناته** — لا للعشرة المعروضة وحدها: الجدول
   * يأخذ `take: 10`، ورقمٌ فوقه يقول «مشاهداتك» محسوبًا على عشرةٍ
   * يُنقص من بائعٍ عنده عشرون.
   */
  const myListings = await db.listing.findMany({
    where: { sellerId: user.id },
    select: { id: true, viewCount: true, publishedAt: true, closedAt: true },
  });

  const [favouriteCount, pendingOfferCount] = await Promise.all([
    /** و`Favorite` بلا علاقةٍ إلى `Listing` — فالعدّ بالمعرّفات. */
    myListings.length === 0
      ? Promise.resolve(0)
      : db.favorite.count({ where: { listingId: { in: myListings.map((row) => row.id) } } }),
    db.offer.count({
      where: { listing: { sellerId: user.id }, status: { in: ['PENDING', 'COUNTERED'] } },
    }),
  ]);

  /**
   * **ومتوسّطُ أيام العرض يُقاس إلى الإغلاق لا إلى اليوم.** إعلانٌ
   * بِيع بعد أسبوع يبقى عمرُه أسبوعًا، وقياسُه إلى اليوم يجعل متوسّطَ
   * بائعٍ قديمٍ يرتفع كلّما مرّ شهر على ما باعه.
   */
  const measuredAt = Date.now();
  const days = myListings
    .filter((row) => row.publishedAt !== null)
    .map((row) => {
      const from = row.publishedAt?.getTime() ?? measuredAt;
      const to = row.closedAt?.getTime() ?? measuredAt;
      return Math.max(0, Math.round((to - from) / 86_400_000));
    });

  const walletBalance = await walletBalanceOf(user.id);

  /**
   * ═══ المزادات: ما أعرضه وما أزايد فيه ═══
   *
   * استعلامان لا واحد — الدور يختلف وكذلك ما يُعرض: البائع يسأل «هل
   * بلغ احتياطيّ؟»، والمزايد يسأل «هل ما زلتُ الأعلى؟».
   *
   * **والحيّ بالحالة والوقت معًا**: `LIVE` مخزَّنة لمزادٍ انقضى حتى
   * تمرّ الوظيفة الدورية، وعرضُه «جارٍ» في حساب صاحبه يُنتظَر بلا طائل.
   */
  const [mine, participated] = await Promise.all([
    db.auction.findMany({
      where: { listing: { sellerId: user.id } },
      orderBy: { endsAt: 'desc' },
      take: 10,
      select: AUCTION_SELECT,
    }),
    db.auction.findMany({
      where: { bids: { some: { bidderId: user.id } } },
      orderBy: { endsAt: 'desc' },
      take: 10,
      select: AUCTION_SELECT,
    }),
  ]);

  const auctions: AccountAuction[] = [
    ...mine.map((row) => toAccountAuction(row, 'seller', user.id, locale)),
    ...participated
      // مزادُه الذي يزايد فيه بنفسه لا يُعدّ مرّتين
      .filter((row) => row.listing.sellerId !== user.id)
      .map((row) => toAccountAuction(row, 'bidder', user.id, locale)),
  ];

  /** عرابينُ مزاداتٍ لم تُحسم — محجوزةٌ على بطاقة المزايد لدى البوّابة. */
  const heldDeposits = await db.deposit.aggregate({
    where: { userId: user.id, status: 'HELD' },
    _sum: { amount: true },
  });
  const depositsOnCard = (heldDeposits._sum.amount ?? 0).toString();

  return {
    user: {
      ref: user.ref,
      name: user.name,
      phone: user.phone,
      email: user.email,
      idVerified: user.idVerified,
      identityStatus: user.identityStatus,
      identityNote: user.identityNote,
      city: null,
      /**
       * **الآيبان مقنَّعًا لا كاملًا.** يُعرض ليطمئنّ صاحبه أنه
       * مُسجَّل — وعرضُه كاملًا على شاشةٍ قد تُصوَّر أو تُشارَك يكشف
       * حسابًا بنكيًّا بلا سببٍ يستدعيه.
       */
      ibanMasked: ibanMasked(user.iban),
      taxStatus: user.taxStatus,
      vatNumber: user.vatNumber,
      memberSince: user.createdAt.toISOString(),
    },
    walletBalance,
    depositsOnCard,
    auctions,
    completion: profileCompletion(user),
    stats: [
      { key: 'listings', value: listings.length },
      { key: 'orders', value: orders.length },
      { key: 'offers', value: offers.length },
      { key: 'favourites', value: favourites },
    ],
    orders: orders.map((order) => ({
      ref: order.ref,
      stage: order.stage,
      status: order.status,
      /**
       * **والترتيب من `STAGES` لا مكتوبًا هنا.** قائمةٌ ثانية تتباعد
       * عن الأولى أوّل مرحلةٍ تُضاف، فيقول الحساب «٥ من ٦» والطلب
       * يقول غيرها.
       */
      step: Math.max(1, ORDER_STAGES.indexOf(order.stage as OrderStage) + 1),
      stepCount: ORDER_STAGES.length,
      title: title(order.listing.vehicle),
      year: order.listing.vehicle.year,
      amount: order.totalAmount.toString(),
      createdAt: order.createdAt.toISOString(),
      path: canonicalPath(locale, order.listing).path,
    })),
    offers: offers.map((offer) => ({
      id: offer.id,
      listingRef: offer.listing.ref,
      title: title(offer.listing.vehicle),
      year: offer.listing.vehicle.year,
      amount: offer.amount.toString(),
      askPrice: offer.listing.askPrice.toString(),
      status: offer.status,
      expiresAt: offer.expiresAt.toISOString(),
      path: canonicalPath(locale, offer.listing).path,
    })),
    listings: listings.map((listing) => ({
      ref: listing.ref,
      title: title(listing.vehicle),
      year: listing.vehicle.year,
      price: listing.askPrice.toString(),
      status: listing.status,
      type: listing.type,
      // **الإرجاع بلا سببٍ معروض إرجاعٌ صامت** — فيُعاد نشره كما هو
      reviewNote: listing.status === 'DRAFT' ? listing.reviewNote : null,
      offerCount: listing._count.offers,
      viewCount: listing.viewCount,
      negotiable: listing.negotiable,
      description: listing.description ?? '',
      hasActiveOrder: listing._count.orders > 0,
      path: canonicalPath(locale, listing).path,
    })),
    listingStats: {
      views: myListings.reduce((total, row) => total + row.viewCount, 0),
      favorites: favouriteCount,
      pendingOffers: pendingOfferCount,
      avgDaysListed:
        days.length === 0
          ? null
          : Math.round(days.reduce((total, value) => total + value, 0) / days.length),
    },
    /** طلباتُ فحصٍ على مركباته تنتظر إذنَه — والعدّاد يربط إلى شاشة */
    consentsAwaiting: await consentsAwaiting(user.id),
    viewingsAwaiting: await viewingsAwaiting(user.id),
    serviceRequests: serviceRequests.map((row) => ({
      ref: row.ref,
      serviceName: locale === 'ar' ? row.service.nameAr : row.service.nameEn,
      status: row.status,
      title: row.vehicle === null ? '' : title(row.vehicle),
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      city: row.city,
      amount: row.amount.toString(),
      providerType: row.service.providerType,
    })),
    reports: reports.map((report) => {
      const listing = report.vehicle.listings[0] ?? null;
      return {
        ref: report.ref,
        score: report.score,
        inspectedAt: report.inspectedAt.toISOString(),
        title: title(report.vehicle),
        // التقرير يبقى وإن سُحب الإعلان — ورابطه يذهب معه
        path: listing === null ? null : `${canonicalPath(locale, listing).path}/inspection`,
      };
    }),
  };
}

/** ما يحتاجه صفّ المزاد في الحساب — ولا احتياطيّ فيه (قرار ٢٩). */
const AUCTION_SELECT = {
  status: true,
  endsAt: true,
  startPrice: true,
  reservePrice: true,
  listing: {
    select: {
      ref: true,
      city: true,
      sellerId: true,
      vehicle: {
        select: {
          brandName: true, modelName: true, trimName: true, year: true,
          brand: { select: { slug: true } },
          model: { select: { nameEn: true } },
        },
      },
    },
  },
  bids: { orderBy: { amount: 'desc' }, take: 1, select: { amount: true, bidderId: true } },
  _count: { select: { bids: true } },
} as const;

type AuctionRow = {
  status: string;
  endsAt: Date;
  startPrice: Prisma.Decimal;
  reservePrice: Prisma.Decimal | null;
  listing: {
    ref: string;
    city: string;
    sellerId: string;
    vehicle: {
      brandName: string; modelName: string; trimName: string | null; year: number;
      brand: { slug: string } | null;
    };
  };
  bids: { amount: Prisma.Decimal; bidderId: string }[];
  _count: { bids: number };
};

function toAccountAuction(
  row: AuctionRow,
  role: 'seller' | 'bidder',
  viewerId: string,
  locale: string,
): AccountAuction {
  const top = row.bids[0] ?? null;
  return {
    listingRef: row.listing.ref,
    title: title(row.listing.vehicle),
    year: row.listing.vehicle.year,
    endsAt: row.endsAt.toISOString(),
    // الحالة والوقت معًا — والقاعدة مسجَّلة
    live: row.status === 'LIVE' && row.endsAt.getTime() > Date.now(),
    // الافتتاح حين لا مزايدة: صفرٌ يوحي بأن المركبة بلا قيمة
    price: (top?.amount ?? row.startPrice).toString(),
    bidderCount: row._count.bids,
    role,
    leading: top !== null && top.bidderId === viewerId,
    // الراية وحدها تخرج — لا المبلغ ولا ما يُشتقّ منه
    reserveMet: row.reservePrice === null || (top !== null && top.amount.gte(row.reservePrice)),
    path: canonicalPath(locale, row.listing).path,
  };
}
