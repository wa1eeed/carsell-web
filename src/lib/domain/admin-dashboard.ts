import { db } from '@/lib/db';
import { LIVE_LISTING_STATUSES } from './garage';
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
  /**
   * ═══ الإجماليُّ على المنصّة — لا عدُّ المدى ═══
   *
   * كان عدَّ المدى، **فقرأ المشغّل «المستخدمون ١» ومنصّتُه فيها واحدٌ
   * وثلاثون**، و«المركبات ١٤» وفيها اثنتان وستّون. وسطرُ «آخر ٣٠
   * يومًا» فوق البطاقات لا يُصلح ذلك: الرقمُ الكبير يُقرأ حالَ
   * المنصّة، والمخزونُ تراكميٌّ لا مدَويّ.
   *
   * والتصميم (`A1`) يرسمها هكذا بالضبط: «العملاء **+١٬٩٤٠**
   * ٢٤٬٦٨٠» — زيادةُ المدى شارةً، والإجماليُّ رقمًا، والشرائحُ
   * تجمعه (١٦٬٢٤٠ + ٦٬١٢٠ + ٣٤٢ + ١٬٩٧٨ = ٢٤٬٦٨٠).
   */
  total: number;
  /** ما أُضيف **في المدى** — تعرضه الشاشة `+N`، و`null` لما لا مدى له. */
  added: number | null;
  /** ما أُضيف في المدى السابق المساوي — للنسبة لا للعرض. */
  previous: number | null;
  /** تراكميّةٌ كالإجمالي، وتجمعه. */
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

  /** الإعلانُ يولد في السوق حين يُنشر — ومسودّةٌ ليست إعلانًا في عدّاد. */
  const published = { publishedAt: { not: null } } as const;

  const [
    usersAll, sellerIdsAll, dealerUsersAll, suspendedAll, usersAdded, usersBefore,
    vehiclesAll, listedAll, soldAll, vehiclesAdded, vehiclesBefore,
    listingsAll, listingsAdded, listingsBefore,
    ordersAll, ordersAdded, ordersBefore,
    auctionsAll, auctionsAdded, auctionsBefore,
    serviceRequestsAll, serviceRequestsAdded, serviceRequestsBefore, servicesByKey, services,
    repeatBuyers,
  ] = await Promise.all([
    db.user.count(),
    /**
     * الشرائح الأربع **متباينة**: موقوف، ثم من بقي — تاجر، ثم بائع،
     * ثم مشترٍ. ولولا التباين لما جمعت الشرائحُ الإجماليَ فوقها،
     * فتناقض البطاقةُ نفسها في سطرين متجاورين.
     */
    db.listing.findMany({
      where: { seller: { status: 'ACTIVE', dealerId: null } },
      select: { sellerId: true },
      distinct: ['sellerId'],
    }),
    db.user.count({ where: { status: 'ACTIVE', dealerId: { not: null } } }),
    db.user.count({ where: { status: { not: 'ACTIVE' } } }),
    db.user.count({ where: { createdAt: window } }),
    db.user.count({ where: { createdAt: before } }),

    db.vehicle.count(),
    /**
     * **مركباتٌ لا صفوفُ إعلانات.** كان العدّ على `listing` فمركبةٌ
     * لها إعلانان تُعدّ مرّتين، ومسودّةٌ تُخرج صاحبها من المرآب —
     * فقالت شاشة «سياراتي» اثنين وقالت اللوحة واحدًا عن القاعدة نفسها.
     * والتعريف الآن واحدٌ مصدَّرٌ من `garage`.
     */
    db.vehicle.count({
      where: { listings: { some: { status: { in: [...LIVE_LISTING_STATUSES] } } } },
    }),
    db.vehicle.count({ where: { listings: { some: { status: 'SOLD' } } } }),
    db.vehicle.count({ where: { createdAt: window } }),
    db.vehicle.count({ where: { createdAt: before } }),

    db.listing.groupBy({ by: ['type'], where: published, _count: { _all: true } }),
    db.listing.count({ where: { publishedAt: window } }),
    db.listing.count({ where: { publishedAt: before } }),

    db.order.groupBy({ by: ['status'], _count: { _all: true } }),
    db.order.count({ where: { createdAt: window } }),
    db.order.count({ where: { createdAt: before } }),

    // والمزاد يُقاس ببدايته
    db.auction.groupBy({ by: ['status'], _count: { _all: true } }),
    db.auction.count({ where: { startsAt: window } }),
    db.auction.count({ where: { startsAt: before } }),

    db.serviceRequest.groupBy({ by: ['serviceId'], _count: { _all: true } }),
    db.serviceRequest.count({ where: { createdAt: window } }),
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

  const sellers = sellerIdsAll.length;
  const buyers = Math.max(0, usersAll - sellers - dealerUsersAll - suspendedAll);

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
      total: usersAll,
      added: usersAdded,
      previous: usersBefore,
      segments: [
        { key: 'buyers', count: buyers },
        { key: 'sellers', count: sellers },
        { key: 'dealers', count: dealerUsersAll },
        { key: 'suspended', count: suspendedAll },
      ],
    },
    {
      key: 'vehicles',
      total: vehiclesAll,
      added: vehiclesAdded,
      previous: vehiclesBefore,
      segments: [
        { key: 'listed', count: listedAll },
        // في الجراج: مملوكةٌ ولا إعلانَ حيًّا لها — والمسودّة منها
        { key: 'garage', count: Math.max(0, vehiclesAll - listedAll - soldAll) },
        { key: 'sold', count: soldAll },
      ],
    },
    {
      key: 'listings',
      total: countOf(listingsAll),
      added: listingsAdded,
      previous: listingsBefore,
      segments: listingsAll.map((row) => ({
        key: row.type,
        count: each(row),
      })),
    },
    {
      key: 'orders',
      total: countOf(ordersAll),
      added: ordersAdded,
      previous: ordersBefore,
      segments: ordersAll.map((row) => ({
        key: row.status,
        count: each(row),
      })),
    },
    {
      key: 'repeat',
      total: repeat.length,
      // تراكميّ لا مدَويّ — فلا زيادةَ مدًى ولا فترةَ تُقارَن بها
      added: null,
      previous: null,
      segments: [
        { key: 'twice', count: twice },
        { key: 'thrice', count: thrice },
        { key: 'more', count: more },
      ],
    },
    {
      key: 'auctions',
      total: countOf(auctionsAll),
      added: auctionsAdded,
      previous: auctionsBefore,
      segments: auctionsAll.map((row) => ({
        key: row.status,
        count: each(row),
      })),
    },
    {
      key: 'serviceRequests',
      total: countOf(serviceRequestsAll),
      added: serviceRequestsAdded,
      previous: serviceRequestsBefore,
      segments: serviceRequestsAll
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
export async function listingsByCity(top = 5): Promise<CityRow[]> {
  /**
   * **نفس الجمهور الذي تعدّه بطاقة الإعلانات** — كلُّ ما نُشر، لا ما
   * بقي منشورًا اليوم. وتضييقُه بـ`status` كان يُنتج رقمين مختلفين
   * على شاشة واحدة تحت الاسم نفسه، وأحدهما لا يعدّ ما نُشر ثمّ بيع.
   *
   * **وصار تراكميًّا مع البطاقة.** كان يعدّ المدى وحده، والبطاقةُ
   * فوقه صارت تعدّ المنصّة — فرقمان تحت اسمٍ واحد في شاشةٍ واحدة،
   * وهو العطلُ الذي يحذّر منه السطرُ الأوّل من هذا التعليق.
   */
  const rows = await db.listing.groupBy({
    by: ['city'],
    where: { publishedAt: { not: null } },
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
