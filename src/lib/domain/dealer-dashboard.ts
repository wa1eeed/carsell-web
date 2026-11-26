import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { RIYADH_OFFSET_HOURS } from './viewing-rules';
import { toLatinDigits } from '@/lib/arabic';
import { normalizeArabicLetters } from '@/lib/plate';
import { AWAITING_SELLER } from './dealer-desk';

/**
 * ═══ `D1` — صحّةُ المعرض في شاشة ═══
 *
 * خمسُ بطاقات يرسمها الترميز: مبيعاتُ الشهر · **الهامش** · المخزونُ
 * النشط · وسيطُ أيام البيع · عروضٌ تحتاج ردًّا.
 *
 * **والهامشُ هو ما لم يكن ممكنًا** قبل دفتر الكلفة: لا حقلَ لسعر
 * الشراء في `Vehicle`. فبطاقتُه تقرأ `VehicleCost` الآن.
 */

export type DealerKpis = {
  /** مبيعاتُ الشهر الجاري — من الطلبات المكتملة لا من أسعار الإعلانات. */
  monthSales: string;
  monthDeals: number;
  /** الفرقُ عن الشهر السابق — و`null` حين لا مبيعاتٍ فيه (لا «+∞»). */
  salesChangePct: number | null;
  /**
   * الهامشُ المحقَّق — ومن الصفقات **التي سُجّلت كلفةُ مركباتها** وحدها.
   * ويُقال كم صفقةً دخلت الحساب، فنسبةٌ من ثلاثٍ ليست نسبةَ المعرض.
   */
  margin: string | null;
  marginPct: number | null;
  marginFrom: number;
  marginOf: number;
  /** المخزونُ النشط وقيمتُه — مركباتُ المعرض لا إعلاناتُه. */
  activeStock: number;
  stockValue: string;
  /** وسيطُ أيّام البيع — والوسيطُ لا المتوسّط (صفقةٌ شاذّة تجرّه). */
  medianDaysToSell: number | null;
  /** عروضٌ تنتظر ردًّا، وأقدمُها بالساعات. */
  offersWaiting: number;
  oldestOfferHours: number | null;
};

function monthStart(now: Date, back: number): Date {
  const riyadh = new Date(now.getTime() + RIYADH_OFFSET_HOURS * 3_600_000);
  return new Date(Date.UTC(riyadh.getUTCFullYear(), riyadh.getUTCMonth() - back, 1));
}

export async function dealerKpis(
  dealerId: string,
  /** فرعُ الناظر — و`null` يعني كلَّ الفروع (المالك والمدير). */
  branchId: string | null,
  now: Date = new Date(),
): Promise<DealerKpis> {
  const thisMonth = monthStart(now, 0);
  const lastMonth = monthStart(now, 1);

  /** مركباتُ المعرض — و`Vehicle` هو المخزون، والإعلانُ حالٌ منه. */
  const vehicleWhere = { dealerId, ...(branchId === null ? {} : { branchId }) };
  const vehicles = await db.vehicle.findMany({
    where: vehicleWhere,
    select: { id: true },
  });
  const vehicleIds = vehicles.map((v) => v.id);

  const [orders, costs, stock, offers] = await Promise.all([
    /** الصفقاتُ المكتملة — الحجمُ من طلبٍ تمّ لا من سعرٍ معروض. */
    db.order.findMany({
      where: {
        listing: { vehicleId: { in: vehicleIds } },
        status: 'ACTIVE',
        stage: 'DONE',
        createdAt: { gte: lastMonth },
      },
      select: { agreedPrice: true, createdAt: true, listing: { select: { vehicleId: true, publishedAt: true } } },
    }),
    db.vehicleCost.findMany({
      where: { vehicleId: { in: vehicleIds } },
      select: { vehicleId: true, kind: true, amount: true },
    }),
    db.listing.findMany({
      where: { vehicleId: { in: vehicleIds }, status: 'PUBLISHED' },
      select: { askPrice: true },
    }),
    db.offer.findMany({
      where: { listing: { vehicleId: { in: vehicleIds } }, ...AWAITING_SELLER },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const inMonth = orders.filter((o) => o.createdAt >= thisMonth);
  const inPrev = orders.filter((o) => o.createdAt < thisMonth);
  /** **والسعرُ المتَّفق عليه لا سعرُ الطلب**: العمولةُ والرسومُ غيرُه. */
  const sum = (rows: { agreedPrice: Prisma.Decimal }[]): Prisma.Decimal =>
    rows.reduce((acc, r) => acc.add(r.agreedPrice), new Prisma.Decimal(0));

  const monthSales = sum(inMonth);
  const prevSales = sum(inPrev);

  /**
   * **ولا نسبةَ على صفر.** شهرٌ سابق بلا مبيعات يجعل «+∞» أو «+100٪»
   * — وكلاهما يقول ما لا يُقاس. فالبطاقة تقول «أوّلُ شهر» بدله.
   */
  const salesChangePct = prevSales.isZero()
    ? null
    : Math.round(monthSales.sub(prevSales).div(prevSales).toNumber() * 100);

  /** كلفةُ كلّ مركبة — شراءٌ وما بعده، ومن لا شراءَ لها لا تدخل الهامش. */
  const costByVehicle = new Map<string, { purchase: boolean; total: Prisma.Decimal }>();
  for (const row of costs) {
    const entry = costByVehicle.get(row.vehicleId) ?? { purchase: false, total: new Prisma.Decimal(0) };
    entry.total = entry.total.add(row.amount);
    if (row.kind === 'PURCHASE') entry.purchase = true;
    costByVehicle.set(row.vehicleId, entry);
  }

  let margin = new Prisma.Decimal(0);
  let marginBase = new Prisma.Decimal(0);
  let marginFrom = 0;
  for (const order of inMonth) {
    const entry = costByVehicle.get(order.listing.vehicleId);
    if (entry === undefined || !entry.purchase) continue;
    margin = margin.add(order.agreedPrice.sub(entry.total));
    marginBase = marginBase.add(order.agreedPrice);
    marginFrom += 1;
  }

  /** وسيطُ أيّام البيع — من النشر إلى اكتمال الطلب. */
  const days = inMonth
    .map((o) =>
      o.listing.publishedAt === null
        ? null
        : Math.round((o.createdAt.getTime() - o.listing.publishedAt.getTime()) / 86_400_000),
    )
    .filter((d): d is number => d !== null && d >= 0)
    .sort((a, b) => a - b);
  const medianDaysToSell =
    days.length === 0
      ? null
      : days.length % 2 === 1
        ? (days[(days.length - 1) / 2] as number)
        : Math.round((((days[days.length / 2 - 1] as number) + (days[days.length / 2] as number)) / 2));

  const oldest = offers[0];
  return {
    monthSales: monthSales.toFixed(2),
    monthDeals: inMonth.length,
    salesChangePct,
    margin: marginFrom === 0 ? null : margin.toFixed(2),
    marginPct: marginFrom === 0 || marginBase.isZero() ? null : Math.round(margin.div(marginBase).toNumber() * 1000) / 10,
    marginFrom,
    marginOf: inMonth.length,
    activeStock: stock.length,
    stockValue: stock.reduce((acc, l) => acc.add(l.askPrice), new Prisma.Decimal(0)).toFixed(2),
    medianDaysToSell,
    offersWaiting: offers.length,
    oldestOfferHours:
      oldest === undefined ? null : Math.floor((now.getTime() - oldest.createdAt.getTime()) / 3_600_000),
  };
}

export type StockRow = {
  vehicleId: string;
  title: string;
  year: number;
  plate: string | null;
  branchName: string | null;
  /** حالُ العرض على كارز — ومركبةٌ في المخزون قد لا تُعرض أصلًا. */
  listingRef: string | null;
  listingStatus: string | null;
  askPrice: string | null;
  /** كلفتُها المسجَّلة — و`null` لمن لم يُسجَّل شراؤها. */
  cost: string | null;
  /** أيّامُها في المخزون — من أوّل كلفةٍ مسجَّلة أو من إنشاء الصفّ. */
  ageDays: number;
};

/**
 * ═══ `D2` — المخزون: مركباتٌ لا إعلانات ═══
 *
 * **والجدولُ على `Vehicle`** (قاعدةُ `ADR 0003`): مخزونُ المعرض
 * مركباتُه، وعرضُها على كارز حالٌ اختيارية منها. فمركبةٌ اشتُريت ولم
 * تُعرض بعد **تظهر في مخزونه** — وجدولٌ مبنيٌّ على `Listing` يُخفيها،
 * وهي بالضبط ما يحتاج أن يراه: رأسُ مالٍ واقف.
 */
/**
 * ═══ والبحثُ برقم الشاص — أوّلُ ما يُسأل عنه في الصالة ═══
 *
 * «إمكانية البحث عن السيارة برقم الشاص في لحظة» تصدّرت إعلانَ منافسٍ
 * وصفحةَ آخر، والسببُ أنّ الزميلَ على الهاتف يُملي رقمًا لا اسمًا.
 * وجدولُنا كان بلا بحثٍ أصلًا.
 *
 * **ويُطبَّع ما يُلصق**: الرقمُ يُنسخ من وثيقةٍ بأحرفٍ صغيرة، واللوحةُ
 * تُملى بأرقامٍ عربية — ومن يبحث بما لديه لا بما نخزّنه.
 *
 * **والآخِرةُ تكفي**: من يحفظ رقمَ هيكلٍ كاملًا نادر، والسائدُ آخرُ
 * ستٍّ — فالمطابقةُ احتواءٌ لا تطابقٌ تامّ.
 */
export type StockFilter = {
  /** رقمُ هيكلٍ أو لوحةٌ أو اسمُ مركبة. */
  q?: string;
  /** الراكدُ وحده — بعتبةٍ يحسبها `stockAging`. */
  agedOverDays?: number;
  now?: Date;
};

export async function dealerStock(
  dealerId: string,
  branchId: string | null,
  filter: StockFilter = {},
): Promise<StockRow[]> {
  const now = filter.now ?? new Date();
  const q = (filter.q ?? '').trim();
  const digits = toLatinDigits(q).replace(/\D/g, '');
  const letters = normalizeArabicLetters(q);

  const vehicles = await db.vehicle.findMany({
    where: {
      dealerId,
      ...(branchId === null ? {} : { branchId }),
      ...(q === ''
        ? {}
        : {
            OR: [
              { vin: { contains: q.toUpperCase() } },
              { brandName: { contains: q } },
              { modelName: { contains: q } },
              { trimName: { contains: q } },
              { colorExterior: { contains: q } },
              ...(digits === '' ? [] : [{ plateNumbers: { contains: digits } }]),
              /**
               * وحروفُ اللوحة تُطبَّع كما تُخزَّن — «أ» و«ا» واحدة.
               *
               * **وشرطٌ فارغ يطابق كلَّ شيء.** `contains: ''` صحيحٌ في
               * SQL ويردّ الجدولَ كلَّه — فبحثٌ برقمٍ خالص («5615») كان
               * يُنتج `normalizeArabicLetters` فارغةً، فيردّ المخزونَ
               * كلَّه ويبدو أنّ البحث لا يعمل. والشرطُ يسقط حين يفرغ.
               */
              ...(letters === '' ? [] : [{ plateLetters: { contains: letters } }]),
            ],
          }),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true, year: true, createdAt: true,
      plateLetters: true, plateNumbers: true,
      brand: { select: { nameAr: true } },
      model: { select: { nameAr: true } },
      trim: { select: { nameAr: true } },
      branch: { select: { name: true } },
      costs: { select: { kind: true, amount: true, incurredAt: true } },
      listings: {
        where: { status: { in: ['PUBLISHED', 'PENDING_REVIEW', 'DRAFT'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { ref: true, status: true, askPrice: true },
      },
    },
  });

  const rows = vehicles.map((v) => {
    const listing = v.listings[0];
    const hasPurchase = v.costs.some((c) => c.kind === 'PURCHASE');
    const total = v.costs.reduce((acc, c) => acc.add(c.amount), new Prisma.Decimal(0));
    const first = v.costs
      .map((c) => c.incurredAt)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const since = first ?? v.createdAt;

    return {
      vehicleId: v.id,
      title: `${v.brand.nameAr} ${v.model.nameAr}${v.trim === null ? '' : ` ${v.trim.nameAr}`}`,
      year: v.year,
      plate:
        v.plateLetters === null || v.plateNumbers === null
          ? null
          : `${v.plateLetters} ${v.plateNumbers}`,
      branchName: v.branch?.name ?? null,
      listingRef: listing?.ref ?? null,
      listingStatus: listing?.status ?? null,
      askPrice: listing === undefined ? null : listing.askPrice.toFixed(2),
      cost: hasPurchase ? total.toFixed(2) : null,
      ageDays: Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86_400_000)),
    };
  });

  /**
   * **والعمرُ يُشتقّ ولا يُخزَّن**، فترشيحُ الراكد بعد الاشتقاق لا في
   * الاستعلام. وهو آمنٌ هنا: السقفُ مئتان، والراكدُ جزءٌ منها.
   */
  return filter.agedOverDays === undefined
    ? rows
    : rows.filter((row) => row.ageDays > (filter.agedOverDays as number));
}
