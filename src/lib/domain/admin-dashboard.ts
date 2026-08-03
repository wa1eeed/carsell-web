import { db } from '@/lib/db';
import { REST_OF_CITIES } from '@/lib/labels/admin';

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

/** المفتاح وحده — والتسمية في `src/lib/labels/admin.ts`. */
export type Segment = { key: string; count: number; serviceName?: string | null };

export type MetricCard = {
  key: string;
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
      total: users,
      previous: usersBefore,
      segments: [
        { key: 'buyers', count: buyers },
        { key: 'sellers', count: sellers },
        { key: 'dealers', count: dealerUsers },
        { key: 'suspended', count: suspended },
      ],
    },
    {
      key: 'vehicles',
      total: vehicles,
      previous: vehiclesBefore,
      segments: [
        { key: 'listed', count: listedVehicles - soldVehicles },
        // في الجراج فقط: مركبة بلا إعلان — والفرق هو التعريف نفسه
        { key: 'garage', count: Math.max(0, vehicles - listedVehicles) },
        { key: 'sold', count: soldVehicles },
      ],
    },
    {
      key: 'listings',
      total: countOf(listings),
      previous: listingsBefore,
      segments: listings.map((row) => ({
        key: row.type,
        count: each(row),
      })),
    },
    {
      key: 'orders',
      total: countOf(orders),
      previous: ordersBefore,
      segments: orders.map((row) => ({
        key: row.status,
        count: each(row),
      })),
    },
    {
      key: 'repeat',
      total: repeat.length,
      // تراكميّ لا مدَويّ — فلا فترة سابقة تُقارَن بها
      previous: null,
      segments: [
        { key: 'twice', count: twice },
        { key: 'thrice', count: thrice },
        { key: 'more', count: more },
      ],
    },
    {
      key: 'auctions',
      total: countOf(auctions),
      previous: auctionsBefore,
      segments: auctions.map((row) => ({
        key: row.status,
        count: each(row),
      })),
    },
    {
      key: 'serviceRequests',
      total: countOf(serviceRequests),
      previous: serviceRequestsBefore,
      segments: serviceRequests
        .map((row) => {
          const service = servicesByKey.find((entry) => entry.id === row.serviceId);
          return {
            key: service?.key ?? row.serviceId,
            /** اسم الخدمة بيانٌ من قاعدة البيانات لا تسمية واجهة. */
            serviceName: service?.nameAr ?? null,
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

  // مفتاحٌ محجوز لا اسم مدينة — والشاشة تسمّيه
  return rest === 0 ? head : [...head, { city: REST_OF_CITIES, count: rest }];
}

/** فرقٌ مئويّ — و`null` حين لا أساس يُقارَن به (القسمة على صفر ليست ٠٪). */
export function deltaPct(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
