import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import type { EscrowStatus, OfferStatus, OrderStage, OrderStatus } from '@/generated/prisma/enums';

/**
 * ═══ مكتبُ المعرض — `D5` العروض و`D6` الطلبات ═══
 *
 * **وكلاهما قراءةٌ لما بُني في كارز بعينِ المعرض**: العرضُ والطلبُ
 * موجودان بقواعدهما، والجديدُ أنّ المعرضَ يراهما **على مركباته
 * وفرعِه** لا على حسابٍ واحد.
 *
 * **والحصرُ بالفرع في الاستعلام لا في العرض** (مصفوفة `D9`): ترشيحٌ
 * بعد الجلب يُسلسل صفوفَ فرعٍ آخر إلى المتصفّح — وهو مسلكُ
 * `reservePrice` نفسُه: ما لا يدخل الكائن لا يتسرّب منه.
 */

/**
 * سقفُ صفوف الطابور.
 *
 * **ويُصدَّر ليقرأه من يقول إنّ الجدول اقتُطع**: رقمٌ في الاستعلام
 * وآخرُ في الجملة يتباعدان، فتقول الشاشة «أحدث مئتين» وهي تعرض مئة.
 */
export const DESK_ORDER_CAP = 200;

function scope(dealerId: string, branchId: string | null) {
  return { dealerId, ...(branchId === null ? {} : { branchId }) };
}

export type DeskOffer = {
  id: string;
  buyerName: string | null;
  amount: string;
  listingRef: string;
  vehicle: string;
  year: number;
  /** الساعاتُ منذ وصوله — والترميز يرتّب بالأقدم. */
  hours: number;
  status: OfferStatus;
  /** أهو الأعلى على هذه المركبة؟ — الترميزُ يسِمه «الأعلى». */
  top: boolean;
  /**
   * أفوق أرضيّةِ البائع هو؟ — و`null` حين لا أرضيّةَ موضوعة.
   *
   * **والسكوتُ عن أرضيّةٍ غير موضوعة يُقرأ «العرضُ دونها»** — قاعدةٌ
   * مسجَّلة في هذا المستودع.
   */
  aboveFloor: boolean | null;
  /**
   * ═══ من ردّ عليه من الفريق — و`null` لمن لم يُردّ عليه بعد ═══
   *
   * معرضٌ بثلاثة بائعين يردّ اثنان منهم على مشترٍ واحد برقمين، فيختار
   * هو الأدنى ويحسب الآخرُ أنّ مفاوضتَه قائمة. والصفُّ يقول من حمل
   * الردّ، فلا يُقابِل أحدٌ عرضًا قابله زميلُه.
   */
  respondedByName: string | null;
  /**
   * ═══ أيملك المعرضُ ردًّا على هذا الصفّ؟ ═══
   *
   * **والمُرسِلُ لا يردّ على نفسه**: صفٌّ `COUNTERED` معناه أنّ المعرض
   * ردّ والدورُ للمشتري، وصفٌّ `PENDING` له أبٌ هو **مقابلُ المعرض**
   * نفسُه ينتظر المشتري. وكان الجدولُ يعرض «اقبل» و«مقابل» و«ارفض» على
   * الحالين، والخادمُ يردّها بـ«لست الطرف» — وهو زرٌّ معروضٌ لمن لا
   * يستطيع. وقِيس بالنقر بعد مقابلةٍ واحدة: صفّان بأزرارٍ ميّتة.
   */
  canAnswer: boolean;
};

export async function deskOffers(
  dealerId: string,
  branchId: string | null,
  now: Date = new Date(),
): Promise<DeskOffer[]> {
  const rows = await db.offer.findMany({
    where: {
      status: { in: ['PENDING', 'COUNTERED'] },
      listing: { vehicle: scope(dealerId, branchId) },
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: {
      id: true, amount: true, status: true, createdAt: true, parentOfferId: true,
      buyer: { select: { name: true } },
      respondedBy: { select: { name: true } },
      listing: {
        select: {
          ref: true, minAcceptPrice: true,
          vehicle: { select: { year: true, brand: { select: { nameAr: true } }, model: { select: { nameAr: true } } } },
          offers: { where: { status: { in: ['PENDING', 'COUNTERED'] } }, select: { amount: true } },
        },
      },
    },
  });

  return rows.map((row) => {
    const highest = row.listing.offers.reduce(
      (max, o) => (o.amount.greaterThan(max) ? o.amount : max),
      new Prisma.Decimal(0),
    );
    return {
      id: row.id,
      buyerName: row.buyer.name,
      amount: row.amount.toFixed(2),
      listingRef: row.listing.ref,
      vehicle: `${row.listing.vehicle.brand.nameAr} ${row.listing.vehicle.model.nameAr}`,
      year: row.listing.vehicle.year,
      hours: Math.max(0, Math.floor((now.getTime() - row.createdAt.getTime()) / 3_600_000)),
      status: row.status,
      top: row.amount.greaterThanOrEqualTo(highest),
      aboveFloor:
        row.listing.minAcceptPrice === null
          ? null
          : row.amount.greaterThanOrEqualTo(row.listing.minAcceptPrice),
      respondedByName: row.respondedBy?.name ?? null,
      canAnswer: row.status === 'PENDING' && row.parentOfferId === null,
    };
  });
}

export type DeskOrder = {
  ref: string;
  vehicle: string;
  buyerName: string | null;
  stage: OrderStage;
  /**
   * حالُ الطلب — **والمرحلةُ لا تكفي متى كان له حال** (قاعدةٌ مسجَّلة).
   *
   * و`live` مشتقٌّ منها، ويبقى لأنّ الصفّ يسأل «أيتحرّك؟» لا «ما
   * حالُه؟»: ما توقّف لا يُقاس بقاؤه في المرحلة.
   */
  status: OrderStatus;
  live: boolean;
  /**
   * ساعاتٌ في المرحلة الحالية — **ساعاتٌ لا أيّام**: `Duration`
   * تُسلّم السُّلَّم من الساعة، فمرحلةٌ عمرُها ثلاثُ ساعاتٍ تُقرأ
   * «ثلاث ساعات» لا «لا أيّام».
   */
  inStageHours: number;
  amount: string;
  /**
   * حالُ الضمان كما هي — **لا رايةً من حالين**.
   *
   * كانت `escrowHeld: escrow?.status === 'HELD'`، فكلُّ ما ليس
   * محتجزًا يُقرأ «أُفرج»: و`PARTIAL_REFUND` **ردٌّ جزئيّ وباقيه
   * محجوزٌ بحقّ**، و`REFUNDED` ردٌّ كامل، و`PENDING` لم يُقبض بعد.
   * فثلاثُ حالاتٍ تقول كلُّها للمعرض «أُفرج عن مالك» وهو لم يصله.
   * و`null` حين لا ضمانَ لهذا الطلب أصلًا.
   */
  escrow: EscrowStatus | null;
  transferAt: string | null;
  /**
   * أيُّ مهلةٍ انقضت — و`null` حين لا شيءَ انقضى.
   *
   * **ويُقال في الصفّ لا في الشريحة وحدها**: شريحةٌ تقول «متعثّرة ١»
   * وصفوفُها تبدو سليمة تجعل صاحبَها يفتح سبعةً يبحث عن واحد.
   */
  overdue: 'PAYMENT' | 'TRANSFER' | null;
};

function overdueBy(
  order: { status: string; paymentDueAt: Date | null; transferDeadlineAt: Date | null },
  now: Date,
): 'PAYMENT' | 'TRANSFER' | null {
  if (order.status !== 'ACTIVE') return null;
  if (order.paymentDueAt !== null && order.paymentDueAt.getTime() < now.getTime()) return 'PAYMENT';
  if (order.transferDeadlineAt !== null && order.transferDeadlineAt.getTime() < now.getTime()) {
    return 'TRANSFER';
  }
  return null;
}

export async function deskOrders(
  dealerId: string,
  branchId: string | null,
  bucket: OrderBucket = 'LIVE',
  now: Date = new Date(),
): Promise<DeskOrder[]> {
  const rows = await db.order.findMany({
    where: {
      AND: [{ listing: { vehicle: scope(dealerId, branchId) } }, bucketWhere(bucket, now)],
    },
    orderBy: { createdAt: 'desc' },
    take: DESK_ORDER_CAP,
    select: {
      ref: true, stage: true, status: true, agreedPrice: true,
      stageEnteredAt: true, createdAt: true, transferAppointmentAt: true,
      paymentDueAt: true, transferDeadlineAt: true,
      buyer: { select: { name: true } },
      listing: {
        select: {
          vehicle: { select: { year: true, brand: { select: { nameAr: true } }, model: { select: { nameAr: true } } } },
        },
      },
      escrow: { select: { status: true } },
    },
  });

  return rows.map((row) => {
    const since = row.stageEnteredAt ?? row.createdAt;
    return {
      ref: row.ref,
      vehicle: `${row.listing.vehicle.brand.nameAr} ${row.listing.vehicle.model.nameAr} ${String(row.listing.vehicle.year)}`,
      buyerName: row.buyer.name,
      stage: row.stage,
      /**
       * **والمرحلةُ تُعرض مع حالها دائمًا** (البوابة ٣٩): طلبٌ أُلغي
       * عند الدفع تبقى مرحلتُه `PAYMENT` إلى الأبد — فيُقرأ «ينتظر
       * الدفع» وهو ميّت.
       */
      status: row.status,
      live: row.status === 'ACTIVE',
      inStageHours: Math.max(0, Math.floor((now.getTime() - since.getTime()) / 3_600_000)),
      amount: row.agreedPrice.toFixed(2),
      escrow: row.escrow?.status ?? null,
      transferAt: row.transferAppointmentAt?.toISOString() ?? null,
      overdue: overdueBy(row, now),
    };
  });
}

/**
 * ═══ ما ينتظر ردَّ المعرض — مِصفاةٌ واحدة يقرؤها العدّ والجدول ═══
 *
 * **والمُرسِلُ لا ينتظر ردَّ نفسه**: مقابلُ المعرض صفٌّ `PENDING` له
 * أبٌ، فعدُّ كلِّ `PENDING` يجعل الشاشة تقول «واحد ينتظر ردك» عن عرضٍ
 * هو أرسله ويُنتظَر فيه المشتري. وقِيس بالنقر بعد مقابلةٍ واحدة: قال
 * العدّادُ واحدًا والجدولُ كلُّه «بانتظار رد المشتري».
 *
 * وهي قاعدةُ «العدّادُ يُحسب بمرشّح القائمة التي يفتحها» — فالمِصفاةُ
 * هنا، ويقرؤها `deskCounts` و`dealerDashboard` معًا.
 */
export const AWAITING_SELLER = { status: 'PENDING', parentOfferId: null } as const;

export type DeskCounts = {
  offersWaiting: number;
  offersActive: number;
  ordersLive: number;
  ordersDoneThisMonth: number;
};

export async function deskCounts(
  dealerId: string,
  branchId: string | null,
  now: Date = new Date(),
): Promise<DeskCounts> {
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const where = { listing: { vehicle: scope(dealerId, branchId) } };

  const [waiting, active, live, done] = await Promise.all([
    db.offer.count({ where: { ...where, ...AWAITING_SELLER } }),
    db.offer.count({ where: { ...where, status: { in: ['PENDING', 'COUNTERED'] } } }),
    db.order.count({
      where: { ...where, status: { in: ['ACTIVE', 'STALLED', 'DISPUTED'] }, stage: { not: 'DONE' } },
    }),
    /**
     * **و`advanceStage` تكتب `COMPLETED` عند `DONE`** — فالعدُّ على
     * `ACTIVE` كان يُخرج صفرًا أبدًا، ولا شيء يشكو: ترويسةٌ تقول «لا
     * مكتملةَ هذا الشهر» عن معرضٍ أنهى عشرًا.
     */
    db.order.count({ where: { ...where, status: 'COMPLETED', stageEnteredAt: { gte: month } } }),
  ]);

  return { offersWaiting: waiting, offersActive: active, ordersLive: live, ordersDoneThisMonth: done };
}

/**
 * ═══ `D6` — شرائحُ الطابور ═══
 *
 * **والعدّادُ يُحسب بمرشّح القائمة التي يفتحها** (قاعدةٌ مسجَّلة): فمِصفاةٌ
 * واحدة لكلّ شريحة يقرؤها العدُّ والجلب معًا — وإلّا قالت الشريحة سبعًا
 * وفتحت على خمس.
 *
 * **و«الطلب» تضمّ `APPROVED`**: الترميزُ يرسم خمسَ شرائح لستّ مراحل،
 * فلو تُركت `APPROVED` بلا شريحة لظهر الطلبُ في «الجارية» ولم يُفتح من
 * أيّ شريحة — صفٌّ حيٌّ لا بابَ إليه. والشريحتان قبل الفحص كلتاهما
 * «طلبٌ لم يبدأ».
 *
 * **و«متعثّرة» مقطعٌ لا قسمٌ**: تتقاطع مع «الجارية» بحقّ — طلبٌ تجاوز
 * مهلتَه حيٌّ ومتعثّرٌ معًا. وشرائحُ المراحل وحدها تجمع «الجارية».
 */
export type OrderBucket = 'LIVE' | 'REQUEST' | 'INSPECTION' | 'PAYMENT' | 'TRANSFER' | 'DONE' | 'TROUBLED';

export const ORDER_BUCKETS: readonly OrderBucket[] = [
  'LIVE', 'REQUEST', 'INSPECTION', 'PAYMENT', 'TRANSFER', 'DONE', 'TROUBLED',
];

/**
 * **و«متعثّر» يُشتقّ من المهلة لا من `OrderStatus.STALLED` وحدها**:
 * لا كاتبَ لها في المنتج (مسجَّلٌ في `admin-orders.ts`)، فشريحةٌ عليها
 * تقول صفرًا إلى الأبد والمعرضُ أمامه طلبٌ عالقٌ منذ أسبوع.
 *
 * فالتعثّرُ ما يراه صاحبُه: نزاعٌ مفتوح، أو مهلةُ دفعٍ انقضت، أو سقفُ
 * نقلِ ملكيةٍ انقضى — **والحالة المخزَّنة لا تكفي متى كان لها وقت**.
 */
function troubledWhere(now: Date): Prisma.OrderWhereInput {
  return {
    OR: [
      { status: { in: ['STALLED', 'DISPUTED'] } },
      { status: 'ACTIVE', paymentDueAt: { lt: now } },
      { status: 'ACTIVE', transferDeadlineAt: { lt: now } },
    ],
  };
}

function bucketWhere(bucket: OrderBucket, now: Date): Prisma.OrderWhereInput {
  switch (bucket) {
    case 'LIVE':
      return { status: { in: ['ACTIVE', 'STALLED', 'DISPUTED'] }, stage: { not: 'DONE' } };
    case 'REQUEST':
      return { status: { in: ['ACTIVE', 'STALLED', 'DISPUTED'] }, stage: { in: ['REQUEST', 'APPROVED'] } };
    case 'INSPECTION':
      return { status: { in: ['ACTIVE', 'STALLED', 'DISPUTED'] }, stage: 'INSPECTION' };
    case 'PAYMENT':
      return { status: { in: ['ACTIVE', 'STALLED', 'DISPUTED'] }, stage: 'PAYMENT' };
    case 'TRANSFER':
      return { status: { in: ['ACTIVE', 'STALLED', 'DISPUTED'] }, stage: 'TRANSFER' };
    case 'DONE':
      return { status: 'COMPLETED' };
    case 'TROUBLED':
      return troubledWhere(now);
  }
}

export async function deskOrderBuckets(
  dealerId: string,
  branchId: string | null,
  now: Date = new Date(),
): Promise<Record<OrderBucket, number>> {
  const mine: Prisma.OrderWhereInput = { listing: { vehicle: scope(dealerId, branchId) } };

  const counts = await Promise.all(
    ORDER_BUCKETS.map((bucket) =>
      db.order.count({ where: { AND: [mine, bucketWhere(bucket, now)] } }),
    ),
  );

  return Object.fromEntries(
    ORDER_BUCKETS.map((bucket, index) => [bucket, counts[index] ?? 0]),
  ) as Record<OrderBucket, number>;
}

/**
 * ═══ `D6` — «المستحق لك» و«مواعيد نقل الملكية» ═══
 *
 * **والقاعدةُ هي قاعدةُ الإفراج نفسُها**: `canSettle` تقرؤها الشاشةُ
 * والمسارُ والوظيفةُ الدورية — ونسخةٌ ثانية هنا تُنتج بطاقةً تقول
 * «جاهز للتحويل» عن مالٍ يردّه الحارس. و`netToSeller` في `money.ts`
 * تقرؤها كشفُ التسوية وشاشةُ الإفراج، فهي الصافي نفسُه لا تقديرٌ له.
 */
export type DeskMoney = {
  /** محتجزٌ في الضمان — صافي البائع لا السعر. */
  held: string;
  heldCount: number;
  /** ما يُفرج عنه الآن بشرطَي الحارس. */
  ready: string;
  readyCount: number;
  /** عمولةُ المنصّة على ما هو قائم — ونسبتُها السارية. */
  commission: string;
  commissionPct: string;
};

export async function deskMoney(
  dealerId: string,
  branchId: string | null,
): Promise<DeskMoney> {
  const [{ canSettle }, { netToSeller }, { listCommissionRules }] = await Promise.all([
    import('./transfer-windows'),
    import('./money'),
    import('./admin-commission'),
  ]);

  const orders = await db.order.findMany({
    where: {
      listing: { vehicle: scope(dealerId, branchId) },
      escrow: { status: { in: ['HELD', 'PARTIAL_REFUND'] } },
    },
    select: {
      stage: true, status: true, agreedPrice: true, settlementAmount: true,
      sellerCommission: true, sellerVat: true,
      escrow: { select: { status: true } },
      settlement: { select: { gatewayFee: true } },
      disputes: { where: { status: { in: ['OPEN', 'INVESTIGATING'] } }, select: { id: true }, take: 1 },
    },
  });

  const zero = new Prisma.Decimal(0);
  let held = zero;
  let heldCount = 0;
  let ready = zero;
  let readyCount = 0;
  let commission = zero;

  for (const order of orders) {
    const net = netToSeller({ ...order, gatewayFee: order.settlement?.gatewayFee ?? null });
    commission = commission.plus(order.sellerCommission);

    /**
     * **والنزاعُ المفتوح يُقدَّم على الحارس**: `canSettle` تقرأ
     * `status` وطلبٌ متنازَعٌ عليه في مرحلةٍ أخرى قد لا يبلغها —
     * وهو المسلك نفسُه في `seller-book.ts`.
     */
    const guard = order.disputes.length > 0
      ? ({ allowed: false } as const)
      : canSettle({ stage: order.stage, status: order.status, escrow: order.escrow });

    if (guard.allowed) {
      ready = ready.plus(net);
      readyCount += 1;
    } else {
      held = held.plus(net);
      heldCount += 1;
    }
  }

  const rules = await listCommissionRules();
  const seller = rules.find((rule) => rule.side === 'SELLER');

  return {
    /** **وكلُّ رقمٍ يُطابَق بجهةٍ خارجية يُعرض بهللاته** — قاعدةٌ مسجَّلة. */
    held: held.toFixed(2),
    heldCount,
    ready: ready.toFixed(2),
    readyCount,
    commission: commission.toFixed(2),
    commissionPct: seller === undefined || !seller.enabled ? '0.00' : seller.pct,
  };
}

export type DeskTransfer = {
  orderRef: string;
  at: string;
  vehicle: string;
  buyerName: string | null;
};

/**
 * مواعيدُ نقل الملكية في الأيّام السبعة القادمة.
 *
 * **والموعدُ الماضي يُسقط لا يُعرض**: صفٌّ يقول «الثلاثاء ١٨» بعد أن
 * مضى الثلاثاءُ يجعل صاحبَه يحسب أنّ عليه موعدًا، والبطاقةُ عنوانُها
 * «هذا الأسبوع».
 */
export async function deskTransfers(
  dealerId: string,
  branchId: string | null,
  now: Date = new Date(),
): Promise<DeskTransfer[]> {
  const week = new Date(now.getTime() + 7 * 86_400_000);

  const rows = await db.order.findMany({
    where: {
      listing: { vehicle: scope(dealerId, branchId) },
      status: 'ACTIVE',
      transferAppointmentAt: { gte: now, lte: week },
    },
    orderBy: { transferAppointmentAt: 'asc' },
    take: 20,
    select: {
      ref: true, transferAppointmentAt: true,
      buyer: { select: { name: true } },
      listing: {
        select: {
          vehicle: {
            select: { brand: { select: { nameAr: true } }, model: { select: { nameAr: true } } },
          },
        },
      },
    },
  });

  return rows.flatMap((row) =>
    row.transferAppointmentAt === null
      ? []
      : [{
          orderRef: row.ref,
          at: row.transferAppointmentAt.toISOString(),
          vehicle: `${row.listing.vehicle.brand.nameAr} ${row.listing.vehicle.model.nameAr}`,
          buyerName: row.buyer.name,
        }],
  );
}

/**
 * ═══ صفوفُ التصدير — أعلى سقفًا وأقلّ حسابًا ═══
 *
 * **والجدولُ يقتطع والتصديرُ هو البابُ**: جملةٌ تحت الجدول تَعِد بأنّ
 * «التصدير يحمل الطابور كله»، **ووعدٌ يُفرض أو يُحذف** — فسقفُه هنا
 * أعلى، والشرائحُ لا تحصره: من يصدّر يريد الطابور لا شريحةً منه.
 */
export const DESK_EXPORT_CAP = 5_000;

export type DeskExportRow = {
  ref: string;
  vehicle: string;
  buyerName: string | null;
  stage: OrderStage;
  status: OrderStatus;
  amount: string;
  escrow: string | null;
  createdAt: string;
  transferAt: string | null;
};

export async function deskOrdersForExport(
  dealerId: string,
  branchId: string | null,
): Promise<DeskExportRow[]> {
  const rows = await db.order.findMany({
    where: { listing: { vehicle: scope(dealerId, branchId) } },
    orderBy: { createdAt: 'desc' },
    take: DESK_EXPORT_CAP,
    select: {
      ref: true, stage: true, status: true, agreedPrice: true,
      createdAt: true, transferAppointmentAt: true,
      buyer: { select: { name: true } },
      listing: {
        select: {
          vehicle: {
            select: {
              year: true,
              brand: { select: { nameAr: true } },
              model: { select: { nameAr: true } },
            },
          },
        },
      },
      escrow: { select: { status: true } },
    },
  });

  return rows.map((row) => ({
    ref: row.ref,
    vehicle: `${row.listing.vehicle.brand.nameAr} ${row.listing.vehicle.model.nameAr} ${String(row.listing.vehicle.year)}`,
    buyerName: row.buyer.name,
    stage: row.stage,
    status: row.status,
    amount: row.agreedPrice.toFixed(2),
    escrow: row.escrow?.status ?? null,
    createdAt: row.createdAt.toISOString(),
    transferAt: row.transferAppointmentAt?.toISOString() ?? null,
  }));
}

/**
 * ═══ عدّاداتُ المِلاحة ═══
 *
 * الترميزُ يضع شارةً على أربعة بنود: المخزون · المزادات · العروض ·
 * الطلبات. **والشارةُ تُحسب بمرشّح الشاشة التي تفتحها** — فالمخزونُ
 * المعروض لا كلّ المخزون، والطلباتُ الجارية لا كلّ الطلبات.
 *
 * **وموضعُها الهيكل لا كلُّ صفحة**: شارةٌ تمرّرها كلُّ صفحة تغيب عن
 * من نسيها، فتقول الملاحةُ شيئًا في شاشةٍ وشيئًا في أختها.
 */
export type DealerNavCounts = {
  inventory: number;
  auctions: number;
  offers: number;
  orders: number;
};

export async function dealerNavCounts(
  dealerId: string,
  branchId: string | null,
  now: Date = new Date(),
): Promise<DealerNavCounts> {
  const mine = scope(dealerId, branchId);

  const [inventory, auctions, offers, orders] = await Promise.all([
    db.vehicle.count({ where: mine }),
    /**
     * **والمباشرُ يُحسب بالحالة والوقت معًا** (قاعدةٌ مسجَّلة): مزادٌ
     * انقضى وقتُه ولم تمرّ عليه الوظيفةُ الدورية حالتُه `LIVE` بعد.
     */
    db.auction.count({
      where: { listing: { vehicle: mine }, status: 'LIVE', endsAt: { gt: now } },
    }),
    db.offer.count({
      where: { listing: { vehicle: mine }, status: { in: ['PENDING', 'COUNTERED'] } },
    }),
    db.order.count({
      where: {
        AND: [{ listing: { vehicle: mine } }, bucketWhere('LIVE', now)],
      },
    }),
  ]);

  return { inventory, auctions, offers, orders };
}

/**
 * ═══ طلبٌ بعينه، بعينِ المعرض ═══
 *
 * **والسؤالُ هنا غيرُ سؤال المتجر.** `getOrder` تسأل «أهذا الرائي
 * أحدُ الطرفين؟» — وهو الصواب في المتجر. ومديرُ المعرض ليس طرفًا
 * ولا بائعًا، ومع ذلك **الطلبُ على مركبةٍ يملكها معرضُه**.
 *
 * فالحارسُ هنا يفحص ذلك وحده، ثمّ يُقرأ الطلبُ بعينِ بائعه — فلا
 * نسخةَ ثانية من `getOrder` تتباعد عن أصلها أوّلَ تعديل. **وحصرُ
 * الفرع داخل الاستعلام** كغيره: بائعٌ في فرعٍ لا يفتح طلبَ فرعٍ آخر.
 *
 * ويُرجَع `null` لا «ممنوع»: **وجودُ الطلب نفسُه معلومة**.
 */
export async function dealerOrderSellerId(
  dealerId: string,
  branchId: string | null,
  ref: string,
): Promise<string | null> {
  const order = await db.order.findFirst({
    where: { ref, listing: { vehicle: scope(dealerId, branchId) } },
    select: { sellerId: true },
  });
  return order?.sellerId ?? null;
}
