import { db } from '@/lib/db';
import { sendListingToReview } from './listing-state';
import { MIN_REPORT_NOTE, type ReportStatus } from './report-rules';

/**
 * ═══ A17 — طابور البلاغات ═══
 *
 * البلاغ يُنشأ من `ReportListing` منذ بنائها، **ولا شاشة تقرؤه**. فمن
 * أبلغ عن احتيالٍ يجد صمتًا، ومن أُبلغ عنه لا يُسأل — وقرار ٣٣ يقول
 * إن البلاغ يُحيل إلى **مراجعة بشرية**، وهي مراجعةٌ لا يقوم بها أحد
 * ما لم يرَ الطابور.
 *
 * ═══ والمبلِّغ لا يُكشف للهدف ═══
 *
 * التصميم يقولها في العمود: «مجهول ← خالد ع.». والشاشة تعرض اسم
 * المبلِّغ **للأدمن وحده**، وصاحب الإعلان لا يعرف من أبلغ — وإلّا صار
 * البلاغ سببًا للانتقام لا وسيلة إنصاف.
 */

export type ReportRow = {
  ref: string;
  id: string;
  /** `listing` أو `user` — والشاشة تصوغ التسمية */
  targetType: string;
  targetId: string;
  /** عنوان الهدف حين يكون إعلانًا — و`null` لمستخدم */
  targetTitle: string | null;
  reason: string;
  details: string | null;
  reporterName: string;
  status: ReportStatus;
  /** كم مضى منذ ورد — بالدقائق، والصياغة في الشاشة */
  waitingMinutes: number;
  /** كم بلاغًا مفتوحًا على الهدف نفسه — واحدٌ لا يُحيل، واثنان يُحيلان */
  siblingCount: number;
};

export type ReportStats = {
  open: number;
  oldestMinutes: number | null;
  reviewing: number;
  resolved: number;
  byReason: { reason: string; count: number }[];
};

const minutesSince = (from: Date, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));

/** الطابور — **الأقدم أوّلًا**، فمن انتظر أطول يُقرأ بلاغه أوّلًا. */
export async function reportQueue(
  status: ReportStatus | null = 'open',
  now: Date = new Date(),
): Promise<ReportRow[]> {
  const reports = await db.report.findMany({
    where: status === null ? {} : { status },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: {
      id: true,
      ref: true,
      targetType: true,
      targetId: true,
      reason: true,
      details: true,
      status: true,
      createdAt: true,
      reporter: { select: { name: true, phone: true } },
    },
  });

  if (reports.length === 0) return [];

  /**
   * عناوين الأهداف في استعلامين لا في حلقة.
   *
   * وحلقةٌ تستعلم لكل صفّ تُنتج مئتَي استعلامٍ على صفحةٍ واحدة —
   * وهو ما لا يظهر على بياناتٍ مزروعة ويظهر أوّل يومٍ حقيقيّ.
   */
  const listingIds = reports.filter((r) => r.targetType === 'listing').map((r) => r.targetId);
  const listings =
    listingIds.length === 0
      ? []
      : await db.listing.findMany({
          where: { id: { in: listingIds } },
          select: {
            id: true,
            ref: true,
            vehicle: { select: { brandName: true, modelName: true, year: true } },
          },
        });

  const openCounts = await db.report.groupBy({
    by: ['targetType', 'targetId'],
    where: { status: 'open' },
    _count: true,
  });

  return reports.map((report) => {
    const listing = listings.find((row) => row.id === report.targetId) ?? null;
    const siblings =
      openCounts.find(
        (row) => row.targetType === report.targetType && row.targetId === report.targetId,
      )?._count ?? 0;

    return {
      ref: report.ref,
      id: report.id,
      targetType: report.targetType,
      targetId: listing?.ref ?? report.targetId,
      targetTitle:
        listing === null
          ? null
          : `${listing.vehicle.brandName} ${listing.vehicle.modelName} ${String(listing.vehicle.year)}`,
      reason: report.reason,
      details: report.details,
      reporterName: report.reporter.name ?? report.reporter.phone,
      status: report.status as ReportStatus,
      waitingMinutes: minutesSince(report.createdAt, now),
      siblingCount: siblings,
    };
  });
}

export async function reportStats(now: Date = new Date()): Promise<ReportStats> {
  const [open, oldest, reviewing, resolved, byReason] = await Promise.all([
    db.report.count({ where: { status: 'open' } }),
    db.report.findFirst({
      where: { status: 'open' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    db.report.count({ where: { status: 'reviewing' } }),
    db.report.count({ where: { status: { in: ['actioned', 'dismissed'] } } }),
    db.report.groupBy({ by: ['reason'], where: { status: 'open' }, _count: true }),
  ]);

  return {
    open,
    oldestMinutes: oldest === null ? null : minutesSince(oldest.createdAt, now),
    reviewing,
    resolved,
    byReason: byReason.map((row) => ({ reason: row.reason, count: row._count })),
  };
}

export type ReportAction = 'REVIEW_LISTING' | 'DISMISS' | 'ACTIONED';

export type ReportFailure = 'REPORT_NOT_FOUND' | 'ALREADY_CLOSED' | 'NOTE_REQUIRED' | 'NOT_LISTING';

export type ReportResult = { ok: true; status: ReportStatus } | { ok: false; reason: ReportFailure };

/**
 * حسم بلاغ — **ثلاثة أفعال، وكلٌّ يترك أثرًا مختلفًا**.
 *
 * · **أحِل الإعلان للمراجعة** ⇒ يدخل طابور A15 ولا يُحذف (قرار ٣٣).
 * · **صرْف النظر** ⇒ يُغلق بلا أثرٍ على الهدف، **بملاحظة**: بلاغٌ
 *   يُصرف بلا سبب مكتوب يُعاد فتحه بعد شهر ولا أحد يذكر لماذا صُرف.
 * · **اتُّخذ إجراء** ⇒ يُغلق بعد إجراءٍ وقع خارجه (إيقاف حساب مثلًا).
 *
 * والبلاغ لا يحذف إعلانًا بنفسه في أي حال: الحذف بمجرّد بلاغ يجعله
 * سلاحًا بيد منافس.
 */
export async function decideReport(
  input: {
    ref: string;
    action: ReportAction;
    note: string | null;
    adminId: string;
    ip: string | null;
  },
  now: Date = new Date(),
): Promise<ReportResult> {
  const report = await db.report.findUnique({
    where: { ref: input.ref },
    select: { id: true, status: true, targetType: true, targetId: true },
  });

  if (report === null) return { ok: false, reason: 'REPORT_NOT_FOUND' };
  if (report.status === 'actioned' || report.status === 'dismissed') {
    return { ok: false, reason: 'ALREADY_CLOSED' };
  }

  const note = input.note?.trim() ?? '';
  if (input.action !== 'REVIEW_LISTING' && note.length < MIN_REPORT_NOTE) {
    return { ok: false, reason: 'NOTE_REQUIRED' };
  }
  if (input.action === 'REVIEW_LISTING' && report.targetType !== 'listing') {
    return { ok: false, reason: 'NOT_LISTING' };
  }

  const status: ReportStatus =
    input.action === 'REVIEW_LISTING' ? 'reviewing' : input.action === 'DISMISS' ? 'dismissed' : 'actioned';

  if (input.action === 'REVIEW_LISTING') {
    await sendListingToReview(db, report.targetId, 'USER_REPORT', now);
  }

  await db.report.update({
    where: { id: report.id },
    data: { status, resolvedBy: input.adminId },
  });

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'Report',
      entityId: input.ref,
      action: `report.${input.action.toLowerCase()}`,
      before: { status: report.status },
      after: { status, note: note === '' ? null : note },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true, status };
}
