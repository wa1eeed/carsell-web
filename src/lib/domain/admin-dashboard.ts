import { db } from '@/lib/db';

/**
 * A1 — لوحة القيادة: نمو وأعداد.
 *
 * ═══ معيار القبول ═══ **كل رقم من قاعدة البيانات، لا رقم ثابت.**
 *
 * وهذا أصعب ممّا يبدو: الرقم الثابت لا يدخل الشاشة رقمًا مكتوبًا، بل
 * يدخل «مؤقّتًا حتى نصل بيانات المصدر». والقاعدة هنا أنّ ما لا مصدر له
 * **لا يُعرض** — لا يُعرض صفرًا ولا يُعرض تقديرًا. البطاقة الغائبة سؤال
 * يُطرح، والبطاقة الكاذبة جواب يُصدَّق.
 *
 * والفرق عن الفترة السابقة يُحسب على **مدى مساوٍ يسبقه مباشرةً**:
 * مقارنة ثلاثين يومًا بشهر تقويمي تُنتج قفزةً أو هبوطًا لا وجود لهما.
 */

export type Segment = { key: string; label: string; count: number };

export type MetricCard = {
  key: string;
  title: string;
  /** الإجمالي **في المدى** — لا الإجمالي التاريخي. */
  total: number;
  /** العدد في المدى السابق المساوي، و`null` حين لا معنى للمقارنة. */
  previous: number | null;
  segments: Segment[];
};

type Window = { gte: Date; lt: Date };

function previousWindow(from: Date, to: Date): Window {
  const span = to.getTime() - from.getTime();
  return { gte: new Date(from.getTime() - span), lt: from };
}

const USER_LABEL: Record<string, string> = {
  buyers: 'أفراد مشترون',
  sellers: 'أفراد بائعون',
  dealers: 'تجار ومعارض',
  suspended: 'موقوفون',
};

const LISTING_TYPE_LABEL: Record<string, string> = {
  DIRECT: 'بيع مباشر',
  NEGOTIATION: 'تفاوض',
  AUCTION: 'مزاد',
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'مكتملة',
  ACTIVE: 'جارية',
  CANCELLED: 'ملغاة',
  STALLED: 'متعثّرة',
  DISPUTED: 'متنازع عليها',
};

const AUCTION_STATUS_LABEL: Record<string, string> = {
  LIVE: 'جارية',
  SCHEDULED: 'قادمة',
  ENDED_MET: 'رست',
  ENDED_UNMET: 'لم تبلغ الاحتياطي',
  CANCELLED: 'ملغاة',
};

export async function dashboardCards(from: Date, to: Date): Promise<MetricCard[]> {
  const window: Window = { gte: from, lt: to };
  const before = previousWindow(from, to);

  const [
    users, usersBefore, sellerIds, dealerUsers, suspended,
    vehicles, vehiclesBefore, listedVehicles, soldVehicles,
    listings, listingsBefore,
    orders, ordersBefore,
    auctions, auctionsBefore,
    serviceRequests, serviceRequestsBefore, servicesByKey, services,
    repeatBuyers,
  ] = await Promise.all([
    db.user.count({ where: { createdAt: window } }),
    db.user.count({ where: { createdAt: before } }),
    /**
     * الشرائح الأربع **متباينة**: موقوف، ثم من بقي — تاجر، ثم بائع،
     * ثم مشترٍ. ولولا التباين لما جمعت الشرائحُ الإجماليَ فوقها،
     * فتناقض البطاقةُ نفسها في سطرين متجاورين.
     */
    db.listing.findMany({
      where: { seller: { createdAt: window, status: 'ACTIVE', dealerId: null } },
      select: { sellerId: true },
      distinct: ['sellerId'],
    }),
    db.user.count({ where: { createdAt: window, status: 'ACTIVE', dealerId: { not: null } } }),
    db.user.count({ where: { createdAt: window, status: { not: 'ACTIVE' } } }),

    db.vehicle.count({ where: { createdAt: window } }),
    db.vehicle.count({ where: { createdAt: before } }),
    db.listing.count({ where: { vehicle: { createdAt: window } } }),
    db.listing.count({ where: { vehicle: { createdAt: window }, status: 'SOLD' } }),

    // `Listing` لا `createdAt` له — والنشر هو ميلاده في السوق
    db.listing.groupBy({ by: ['type'], where: { publishedAt: window }, _count: { _all: true } }),
    db.listing.count({ where: { publishedAt: before } }),

    db.order.groupBy({ by: ['status'], where: { createdAt: window }, _count: { _all: true } }),
    db.order.count({ where: { createdAt: before } }),

    // والمزاد يُقاس ببدايته
    db.auction.groupBy({ by: ['status'], where: { startsAt: window }, _count: { _all: true } }),
    db.auction.count({ where: { startsAt: before } }),

    db.serviceRequest.groupBy({
      by: ['serviceId'],
      where: { createdAt: window },
      _count: { _all: true },
    }),
    db.serviceRequest.count({ where: { createdAt: before } }),
    db.service.findMany({ select: { id: true, nameAr: true, key: true } }),
    db.service.count(),

    /**
     * العميل المتكرّر — **من أتمّ صفقتين فأكثر**، تراكميًّا لا في المدى.
     * التكرار سلوك يمتدّ عبر السنين، وحصرُه في ثلاثين يومًا يجعل كل
     * عميل «غير متكرّر» لأن السيارة لا تُشترى مرّتين في شهر.
     */
    db.order.groupBy({
      by: ['buyerId'],
      where: { status: 'COMPLETED' },
      _count: { _all: true },
    }),
  ]);

  const sellers = sellerIds.length;
  const buyers = Math.max(0, users - sellers - dealerUsers - suspended);

  const repeat = repeatBuyers.filter((row) => (row._count._all ?? 0) >= 2);
  const twice = repeat.filter((row) => row._count._all === 2).length;
  const thrice = repeat.filter((row) => row._count._all === 3).length;
  const more = repeat.filter((row) => row._count._all >= 4).length;

  const countOf = (
    rows: readonly { _count: { _all?: number } | true }[],
  ): number =>
    rows.reduce((total, row) => total + (row._count === true ? 0 : (row._count._all ?? 0)), 0);

  /** `_count` في نوع groupBy اتّحادٌ يشمل `true` — والقيمة الفعلية عدد. */
  const each = (row: { _count: { _all?: number } | true }): number =>
    row._count === true ? 0 : (row._count._all ?? 0);

  return [
    {
      key: 'users',
      title: 'العملاء',
      total: users,
      previous: usersBefore,
      segments: [
        { key: 'buyers', label: USER_LABEL.buyers ?? '', count: buyers },
        { key: 'sellers', label: USER_LABEL.sellers ?? '', count: sellers },
        { key: 'dealers', label: USER_LABEL.dealers ?? '', count: dealerUsers },
        { key: 'suspended', label: USER_LABEL.suspended ?? '', count: suspended },
      ],
    },
    {
      key: 'vehicles',
      title: 'المركبات المضافة',
      total: vehicles,
      previous: vehiclesBefore,
      segments: [
        { key: 'listed', label: 'معروضة للبيع', count: listedVehicles - soldVehicles },
        // في الجراج فقط: مركبة بلا إعلان — والفرق هو التعريف نفسه
        { key: 'garage', label: 'في الجراج فقط', count: Math.max(0, vehicles - listedVehicles) },
        { key: 'sold', label: 'مباعة', count: soldVehicles },
      ],
    },
    {
      key: 'listings',
      title: 'الإعلانات',
      total: countOf(listings),
      previous: listingsBefore,
      segments: listings.map((row) => ({
        key: row.type,
        label: LISTING_TYPE_LABEL[row.type] ?? row.type,
        count: each(row),
      })),
    },
    {
      key: 'orders',
      title: 'الطلبات',
      total: countOf(orders),
      previous: ordersBefore,
      segments: orders.map((row) => ({
        key: row.status,
        label: ORDER_STATUS_LABEL[row.status] ?? row.status,
        count: each(row),
      })),
    },
    {
      key: 'repeat',
      title: 'العملاء المتكرّرون',
      total: repeat.length,
      // تراكميّ لا مدَويّ — فلا فترة سابقة تُقارَن بها
      previous: null,
      segments: [
        { key: 'twice', label: 'شراء مرتين', count: twice },
        { key: 'thrice', label: 'ثلاث مرات', count: thrice },
        { key: 'more', label: 'أربع فأكثر', count: more },
      ],
    },
    {
      key: 'auctions',
      title: 'المزادات',
      total: countOf(auctions),
      previous: auctionsBefore,
      segments: auctions.map((row) => ({
        key: row.status,
        label: AUCTION_STATUS_LABEL[row.status] ?? row.status,
        count: each(row),
      })),
    },
    {
      key: 'serviceRequests',
      title: 'طلبات الخدمات',
      total: countOf(serviceRequests),
      previous: serviceRequestsBefore,
      segments: serviceRequests
        .map((row) => {
          const service = servicesByKey.find((entry) => entry.id === row.serviceId);
          return {
            key: service?.key ?? row.serviceId,
            label: service?.nameAr ?? '—',
            count: each(row),
          };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, Math.min(4, services)),
    },
  ];
}

export type CityRow = { city: string; count: number };

/**
 * الإعلانات حسب المدينة — **أعلى خمس ثم «بقية المدن»**.
 *
 * والبقية تُجمع ولا تُحذف: قائمةٌ تعرض خمسًا وتصمت عن الباقي تجعل
 * المجموع لا يطابق العدد المعروض فوقه، فيُظنّ أحدهما خطأً.
 */
export async function listingsByCity(from: Date, to: Date, top = 5): Promise<CityRow[]> {
  /**
   * **نفس الجمهور الذي تعدّه بطاقة الإعلانات** — كل ما نُشر في المدى،
   * لا ما بقي منشورًا اليوم. وتضييقُه بـ`status` كان يُنتج رقمين
   * مختلفين على شاشة واحدة تحت الاسم نفسه، وأحدهما تحت عنوان يقول
   * «نُشرت في المدى» وهو لا يعدّ ما نُشر ثمّ بيع.
   */
  const rows = await db.listing.groupBy({
    by: ['city'],
    where: { publishedAt: { gte: from, lt: to } },
    _count: { _all: true },
    orderBy: { _count: { city: 'desc' } },
  });

  const head = rows.slice(0, top).map((row) => ({ city: row.city, count: row._count._all ?? 0 }));
  const rest = rows.slice(top).reduce((total, row) => total + (row._count._all ?? 0), 0);

  return rest === 0 ? head : [...head, { city: 'بقية المدن', count: rest }];
}

/** فرقٌ مئويّ — و`null` حين لا أساس يُقارَن به (القسمة على صفر ليست ٠٪). */
export function deltaPct(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
