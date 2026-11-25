import { db } from '@/lib/db';
import { toCsv } from '@/lib/csv';
import { EXPORT_ROW_LIMIT, REPORTS, type ReportKey } from './report-catalog';

/**
 * ═══ A36 — التقارير والتصدير ═══
 *
 * **كل تقرير استعلامٌ مسمّى على القراءة** — لا لقطةُ شاشة. فما يُصدَّر
 * لا يتغيّر بتغيّر ترتيبٍ في جدولٍ ولا بترشيحٍ تركه أحدهم مفتوحًا.
 *
 * ═══ وأي تصدير يحمل بيانات شخصية يُسجَّل ═══
 *
 * اسم من صدّر ووقته وعدد الصفوف — في سجلّ التدقيق. وهو الفرق بين
 * تقريرٍ مجمَّع وقائمةِ ناس: الأولى رقمٌ، والثانية ملفٌّ يخرج من
 * المنصّة ولا يعود.
 *
 * ═══ والصيغة CSV ═══
 *
 * تفتحها كل أداة، ولا تحتاج مكتبةً تُضاف للحزمة. وXLSX في التصميم
 * صيغةُ راحة لا صيغةُ بيانات — وأوّل ما يفعله من يستلمها هو فتحها في
 * الأداة نفسها.
 */

export type ExportResult =
  | { ok: true; filename: string; csv: string; rows: number; personal: boolean }
  | { ok: false; reason: 'UNKNOWN_REPORT' };

type Query = () => Promise<{ headers: readonly string[]; rows: (readonly unknown[])[] }>;

const QUERIES: Record<ReportKey, Query> = {
  sales_commissions: async () => {
    const orders = await db.order.findMany({
      where: { stage: { in: ['TRANSFER', 'DONE'] } },
      orderBy: { createdAt: 'desc' },
      take: EXPORT_ROW_LIMIT,
      select: {
        ref: true,
        createdAt: true,
        source: true,
        stage: true,
        agreedPrice: true,
        settlementAmount: true,
        buyerCommission: true,
        sellerCommission: true,
        transferFee: true,
        transferAdminFee: true,
        vatAmount: true,
        totalAmount: true,
      },
    });

    return {
      headers: [
        'ref', 'created_at', 'source', 'stage', 'agreed_price', 'settlement_amount',
        'buyer_commission', 'seller_commission', 'transfer_fee', 'transfer_admin_fee',
        'vat_amount', 'total_amount',
      ],
      rows: orders.map((order) => [
        order.ref, order.createdAt, order.source, order.stage,
        order.agreedPrice.toFixed(2), order.settlementAmount?.toFixed(2) ?? '',
        order.buyerCommission.toFixed(2), order.sellerCommission.toFixed(2),
        order.transferFee.toFixed(2), order.transferAdminFee.toFixed(2),
        order.vatAmount.toFixed(2), order.totalAmount.toFixed(2),
      ]),
    };
  },

  ledger: async () => {
    const entries = await db.ledgerEntry.findMany({
      orderBy: { createdAt: 'desc' },
      take: EXPORT_ROW_LIMIT,
      select: {
        createdAt: true,
        txnId: true,
        account: true,
        direction: true,
        amount: true,
        event: true,
        orderId: true,
        note: true,
      },
    });

    return {
      headers: [
        'created_at', 'txn_id', 'account', 'direction', 'amount', 'event', 'order_id', 'note',
      ],
      rows: entries.map((entry) => [
        entry.createdAt, entry.txnId, entry.account, entry.direction,
        entry.amount.toFixed(2), entry.event, entry.orderId ?? '', entry.note ?? '',
      ]),
    };
  },

  inventory_aging: async () => {
    const now = Date.now();
    const listings = await db.listing.findMany({
      where: { status: { in: ['PUBLISHED', 'RESERVED', 'PENDING_REVIEW'] } },
      orderBy: { publishedAt: 'asc' },
      take: EXPORT_ROW_LIMIT,
      select: {
        ref: true, status: true, type: true, city: true,
        askPrice: true, publishedAt: true, viewCount: true,
        vehicle: { select: { brandName: true, modelName: true, year: true } },
      },
    });

    return {
      headers: [
        'ref', 'status', 'type', 'city', 'brand', 'model', 'year',
        'ask_price', 'published_at', 'days_listed', 'views',
      ],
      rows: listings.map((listing) => [
        listing.ref, listing.status, listing.type, listing.city,
        listing.vehicle.brandName, listing.vehicle.modelName, listing.vehicle.year,
        listing.askPrice.toFixed(2),
        listing.publishedAt ?? '',
        // «لم يُنشر بعد» فراغٌ لا صفر — والصفر يُقرأ «نُشر اليوم»
        listing.publishedAt === null
          ? ''
          : Math.floor((now - listing.publishedAt.getTime()) / 86_400_000),
        listing.viewCount,
      ]),
    };
  },

  auction_performance: async () => {
    const auctions = await db.auction.findMany({
      orderBy: { endsAt: 'desc' },
      take: EXPORT_ROW_LIMIT,
      include: {
        listing: { select: { ref: true, city: true } },
        // **أعلى مزايدة هي السعر الحالي** — ولا حقل يخزّنه
        bids: { orderBy: { amount: 'desc' }, take: 1, select: { amount: true } },
        _count: { select: { bids: true, deposits: true } },
      },
    });

    return {
      headers: [
        'listing_ref', 'city', 'status', 'start_price', 'top_bid', 'deposit_amount',
        'starts_at', 'ends_at', 'extensions', 'bids', 'deposits',
      ],
      rows: auctions.map((auction) => [
        auction.listing.ref, auction.listing.city, auction.status,
        auction.startPrice.toFixed(2), auction.bids[0]?.amount.toFixed(2) ?? '',
        auction.depositAmount.toFixed(2), auction.startsAt, auction.endsAt,
        auction.extendedCount, auction._count.bids, auction._count.deposits,
      ]),
    };
  },

  service_requests: async () => {
    const requests = await db.serviceRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: EXPORT_ROW_LIMIT,
      select: {
        ref: true, status: true, amount: true, adminFee: true,
        createdAt: true, dueAt: true,
        service: { select: { nameAr: true } },
        provider: { select: { nameAr: true, slaHours: true } },
      },
    });

    const now = Date.now();

    return {
      headers: [
        'ref', 'service', 'provider', 'status', 'amount', 'admin_fee',
        'created_at', 'due_at', 'sla_hours', 'breached',
      ],
      rows: requests.map((request) => [
        request.ref, request.service.nameAr, request.provider?.nameAr ?? '',
        request.status, request.amount.toFixed(2), request.adminFee.toFixed(2),
        request.createdAt, request.dueAt ?? '', request.provider?.slaHours ?? '',
        // التجاوز من المهلة والزمن معًا — لا من راية
        request.dueAt !== null &&
        request.dueAt.getTime() < now &&
        ['NEW', 'ASSIGNED', 'IN_PROGRESS'].includes(request.status)
          ? 'yes'
          : 'no',
      ]),
    };
  },

  /**
   * **بيانات شخصية.** ولذلك يُقيَّد تصديره، وصلاحيتُه `users.viewIdentity`
   * لا `users.view`: من يرى قائمة العملاء في الشاشة ليس بالضرورة من
   * يُخرجها ملفًّا من المنصّة.
   */
  customers: async () => {
    const users = await db.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: EXPORT_ROW_LIMIT,
      select: {
        id: true, name: true, phone: true, email: true,
        status: true, idVerified: true, identityStatus: true,
        marketingConsent: true, createdAt: true,
        _count: { select: { listings: true, ordersAsBuyer: true, ordersAsSeller: true } },
      },
    });

    return {
      headers: [
        'id', 'name', 'phone', 'email', 'status', 'id_verified', 'identity_status',
        'marketing_consent', 'created_at', 'listings', 'orders_as_buyer', 'orders_as_seller',
      ],
      rows: users.map((user) => [
        user.id, user.name ?? '', user.phone, user.email ?? '',
        user.status, user.idVerified ? 'yes' : 'no', user.identityStatus,
        user.marketingConsent ? 'yes' : 'no', user.createdAt,
        user._count.listings, user._count.ordersAsBuyer, user._count.ordersAsSeller,
      ]),
    };
  },

  /**
   * **والقبلُ والبعدُ عمودان** — سطرٌ يقول «عدّل رسوم النقل» بلا قيمتين
   * لا يُراجَع. وهما `Json`، فيُسلسَلان كما خُزّنا.
   */
  orders: async () => {
    const rows = await db.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: EXPORT_ROW_LIMIT,
      select: {
        ref: true, stage: true, status: true, source: true,
        agreedPrice: true, commissionAmount: true, transferFee: true,
        buyerId: true, sellerId: true,
        createdAt: true, paymentDueAt: true, stageEnteredAt: true,
        transferDeadlineAt: true,
        listing: { select: { ref: true, city: true } },
      },
    });

    return {
      headers: [
        'ref', 'listing_ref', 'city', 'stage', 'status', 'source',
        'agreed_price', 'commission', 'transfer_fee',
        'buyer_id', 'seller_id', 'created_at', 'payment_due_at', 'stage_entered_at',
        'transfer_deadline_at',
      ],
      rows: rows.map((row) => [
        row.ref,
        row.listing.ref,
        row.listing.city,
        row.stage,
        row.status,
        row.source,
        /**
         * **والمبلغُ نصًّا بهللاته** — `cell` تُسلسِل الكائنَ بـJSON،
         * و`Decimal` كائن: فيخرج مقتبسًا ثلاثَ مرّات في خانةٍ يقرؤها
         * Excel نصًّا لا رقمًا. وسائرُ التقارير تكتبها `toFixed(2)`.
         */
        row.agreedPrice.toFixed(2),
        row.commissionAmount.toFixed(2),
        row.transferFee.toFixed(2),
        row.buyerId,
        row.sellerId,
        row.createdAt,
        row.paymentDueAt ?? '',
        row.stageEnteredAt,
        row.transferDeadlineAt ?? '',
      ]),
    };
  },

  audit_log: async () => {
    const entries = await db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: EXPORT_ROW_LIMIT,
      select: {
        id: true, createdAt: true, actorId: true, actorType: true,
        action: true, entity: true, entityId: true, ip: true,
        before: true, after: true,
      },
    });

    const adminIds = [
      ...new Set(entries.filter((row) => row.actorType === 'admin').map((row) => row.actorId)),
    ];
    const admins =
      adminIds.length === 0
        ? []
        : await db.adminUser.findMany({
            where: { id: { in: adminIds } },
            select: { id: true, name: true, role: true },
          });
    const byId = new Map(admins.map((row) => [row.id, row]));

    return {
      headers: [
        'at', 'actor_id', 'actor_name', 'actor_role', 'actor_type',
        'action', 'entity', 'entity_id', 'ip', 'before', 'after',
      ],
      rows: entries.map((row) => [
        row.createdAt,
        row.actorId,
        byId.get(row.actorId)?.name ?? '',
        byId.get(row.actorId)?.role ?? row.actorType.toUpperCase(),
        row.actorType,
        row.action,
        row.entity,
        row.entityId,
        row.ip ?? '',
        JSON.stringify(row.before ?? {}),
        JSON.stringify(row.after ?? {}),
      ]),
    };
  },
};

/**
 * تنفيذ تقرير — **ويُقيَّد الأثر حين يحمل بيانات شخصية**.
 *
 * والتقييد بعدد الصفوف: «صدّر ٤٠٠ عميل» و«صدّر عميلًا واحدًا» فعلان
 * مختلفان تمامًا، وسجلٌّ بلا عدد لا يفرّق بينهما.
 */
export async function runReport(
  input: { key: string; adminId: string; ip: string | null },
  now: Date = new Date(),
): Promise<ExportResult> {
  const definition = REPORTS.find((report) => report.key === input.key);
  if (definition === undefined) return { ok: false, reason: 'UNKNOWN_REPORT' };

  /**
   * ═══ وزمنُ التنفيذ يُقاس ويُكتب ═══
   *
   * ترميزُ `A36` يعرض «أطول تقرير ١٤ ثانية · حدّ المهلة ٦٠»: والرقمُ
   * إنذارٌ لا زينة — تقريرٌ يقترب من الحدّ سيسقط يومًا على بياناتٍ أكبر،
   * **ولا شيء كان يقيسه**. فيُكتب مع الأثر، ويُقرأ منه أطولُ ما جرى.
   */
  const startedAt = Date.now();
  const { headers, rows } = await QUERIES[definition.key]();
  const csv = toCsv(headers, rows);
  const ms = Date.now() - startedAt;
  const day = now.toISOString().slice(0, 10);

  /**
   * ═══ وكلُّ تصديرٍ يُقيَّد، لا الشخصيُّ وحده ═══
   *
   * كان القيدُ مشروطًا بـ`personal` — وقاعدةُ هذا المستودع أنّ **كلَّ
   * إجراء أدمن يكتب `AuditLog`**. وأثرُه عمليّ أيضًا: الزمنُ لا يُقاس
   * إلّا ممّا كُتب، فبطاقةُ «أطول تقرير» كانت تقرأ الشخصيَّ وحده —
   * وأثقلُ التقارير هو الدفتر، وهو غيرُ شخصيّ.
   *
   * و`personal` تبقى في الحمولة: الفرقُ بين «صدّر مجمَّعًا» و«صدّر
   * قائمةَ ناس» يبقى مقروءًا في السجلّ.
   */
  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'Report',
      entityId: definition.key,
      action: 'report.exported',
      before: {},
      after: { report: definition.key, rows: rows.length, personal: definition.personal, ms },
      ip: input.ip,
      createdAt: now,
    },
  });

  return {
    ok: true,
    filename: `carsell-${definition.key}-${day}.csv`,
    csv,
    rows: rows.length,
    personal: definition.personal,
  };
}

export type ExportStats = {
  reports: number;
  personalReports: number;
  exportsThisMonth: number;
  rowLimit: number;
  /**
   * ═══ أطولُ تقريرٍ جرى هذا الشهر — بالثواني ═══
   *
   * ترميزُ `A36` يعرضه بجوار «حدّ المهلة ٦٠»، وهو **إنذارٌ لا زينة**:
   * تقريرٌ يقترب من الحدّ سيسقط يومًا على بياناتٍ أكبر، والمشغّلُ يعرف
   * ذلك قبل أن يسقط لا بعده.
   *
   * و`null` حين لا تصديرَ هذا الشهر — صفرٌ هنا يُقرأ «فوريّ».
   */
  slowestSeconds: number | null;
  slowestReport: string | null;
};

export async function exportStats(now: Date = new Date()): Promise<ExportStats> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [exports, runs] = await Promise.all([
    db.auditLog.count({
      where: { action: 'report.exported', createdAt: { gte: monthStart } },
    }),
    /**
     * **والزمنُ في الحمولة لا في عمود** — فيُقرأ بالمرور على الصفوف.
     * وهي عشراتٌ في الشهر لا آلاف، فلا فهرسَ يُحتاج.
     */
    db.auditLog.findMany({
      where: { action: 'report.exported', createdAt: { gte: monthStart } },
      select: { after: true },
    }),
  ]);

  let slowestMs = 0;
  let slowestKey: string | null = null;
  for (const run of runs) {
    const payload = run.after as { ms?: unknown; report?: unknown } | null;
    const ms = typeof payload?.ms === 'number' ? payload.ms : 0;
    if (ms > slowestMs) {
      slowestMs = ms;
      slowestKey = typeof payload?.report === 'string' ? payload.report : null;
    }
  }

  return {
    reports: REPORTS.length,
    personalReports: REPORTS.filter((report) => report.personal).length,
    exportsThisMonth: exports,
    rowLimit: EXPORT_ROW_LIMIT,
    // ثانيةٌ واحدة على الأقلّ لما جرى — «٠ ثانية» تُقرأ «لم يُقَس»
    slowestSeconds: slowestKey === null ? null : Math.max(1, Math.round(slowestMs / 1000)),
    slowestReport: slowestKey,
  };
}

export type ExportLogRow = {
  id: string;
  /** المفتاح — والصياغة في `src/lib/labels/reports.ts` (البوابة ١٧) */
  reportKey: string;
  rows: number;
  at: string;
};

/** سجلّ التصديرات — **من سجلّ التدقيق لا من جدولٍ ثانٍ يتباعد عنه**. */
export async function exportLog(): Promise<ExportLogRow[]> {
  const entries = await db.auditLog.findMany({
    where: { action: 'report.exported' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, entityId: true, after: true, createdAt: true },
  });

  return entries.map((entry) => {
    const after = entry.after as { rows?: number } | null;
    return {
      id: entry.id,
      reportKey: entry.entityId,
      rows: after?.rows ?? 0,
      at: entry.createdAt.toISOString(),
    };
  });
}
