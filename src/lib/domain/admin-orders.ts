import { db } from '@/lib/db';
import type { AdminUser } from '@/generated/prisma/client';
import type { OrderStage } from '@/generated/prisma/enums';

/**
 * الطلبات والتشغيل في اللوحة — A4 وA2.
 *
 * **مدّة البقاء محسوبة، والتنبيه عند تجاوز الضعف** (معيار A4). و«الضعف»
 * ليس رقمًا مكتوبًا بل ضعف **الهدف المعلن** لكل مرحلة: مرحلةٌ هدفها يوم
 * تتنبّه عند يومين، وأخرى هدفها خمسة تتنبّه عند عشرة. رقمٌ واحد للجميع
 * يجعل التنبيه يصرخ على مرحلة بطيئة بطبعها ويصمت عن أخرى تعثّرت.
 */

/** خطّ الهدف لكل مرحلة، بالساعات. */
export const STAGE_TARGET_HOURS: Record<OrderStage, number> = {
  REQUEST: 24,
  APPROVED: 24,
  INSPECTION: 72,
  PAYMENT: 24,
  TRANSFER: 120,
  DONE: 0,
};

export type OrderRow = {
  ref: string;
  stage: OrderStage;
  status: string;
  dwellHours: number;
  targetHours: number;
  /** تجاوز الهدف — أصفر. */
  late: boolean;
  /** تجاوز ضعفه — أحمر، وهو ما يحتاج تدخّلًا. */
  critical: boolean;
  total: string;
  buyer: string;
  seller: string;
  listingRef: string;
  hasDispute: boolean;
};

export async function listAdminOrders(
  filters: { stage?: OrderStage; onlyLate?: boolean } = {},
  now: Date = new Date(),
): Promise<OrderRow[]> {
  const rows = await db.order.findMany({
    where: {
      ...(filters.stage === undefined ? {} : { stage: filters.stage }),
      status: { in: ['ACTIVE', 'DISPUTED', 'STALLED'] },
    },
    orderBy: { stageEnteredAt: 'asc' },
    take: 200,
    select: {
      ref: true, stage: true, status: true, stageEnteredAt: true, totalAmount: true,
      listing: { select: { ref: true } },
      buyer: { select: { name: true, phone: true } },
      seller: { select: { name: true, phone: true } },
      disputes: { where: { status: { in: ['OPEN', 'INVESTIGATING'] } }, select: { id: true } },
    },
  });

  const mapped = rows.map((order) => {
    const dwellHours = (now.getTime() - order.stageEnteredAt.getTime()) / 3_600_000;
    const targetHours = STAGE_TARGET_HOURS[order.stage];

    return {
      ref: order.ref,
      stage: order.stage,
      status: order.status,
      dwellHours: Math.floor(dwellHours),
      targetHours,
      late: targetHours > 0 && dwellHours > targetHours,
      critical: targetHours > 0 && dwellHours > targetHours * 2,
      total: order.totalAmount.toString(),
      // الاسم أو آخر أربعة من الجوال — لا الرقم كاملًا في جدول
      buyer: order.buyer.name ?? order.buyer.phone.slice(-4),
      seller: order.seller.name ?? order.seller.phone.slice(-4),
      listingRef: order.listing.ref,
      hasDispute: order.disputes.length > 0,
    };
  });

  return filters.onlyLate === true ? mapped.filter((order) => order.late) : mapped;
}

export type StageMetric = {
  stage: OrderStage;
  count: number;
  targetHours: number;
  /** متوسّط البقاء بالساعات — يُقارَن بخطّ الهدف. */
  averageHours: number;
  late: number;
  critical: number;
};

/**
 * A2 — مؤشّرات المراحل بخطّ هدف.
 *
 * **العدد وحده لا يقول شيئًا**: عشرون طلبًا في «الدفع» حالٌ طبيعية إن
 * دخلوها اليوم، وأزمةٌ إن مضى على أقدمهم أسبوع. فالمؤشّر متوسّط البقاء
 * مقابل الهدف، والعدد سياق له.
 */
export async function stageMetrics(now: Date = new Date()): Promise<StageMetric[]> {
  const rows = await db.order.findMany({
    where: { status: { in: ['ACTIVE', 'DISPUTED', 'STALLED'] } },
    select: { stage: true, stageEnteredAt: true },
  });

  const stages: OrderStage[] = ['REQUEST', 'APPROVED', 'INSPECTION', 'PAYMENT', 'TRANSFER'];

  return stages.map((stage) => {
    const inStage = rows.filter((order) => order.stage === stage);
    const hours = inStage.map(
      (order) => (now.getTime() - order.stageEnteredAt.getTime()) / 3_600_000,
    );
    const target = STAGE_TARGET_HOURS[stage];

    return {
      stage,
      count: inStage.length,
      targetHours: target,
      averageHours:
        hours.length === 0
          ? 0
          : Math.round(hours.reduce((a, b) => a + b, 0) / hours.length),
      late: hours.filter((h) => h > target).length,
      critical: hours.filter((h) => h > target * 2).length,
    };
  });
}

/**
 * ═══ A5 ═══ كشف هوية عميل — **خلف صلاحية، وكل اطّلاع مسجَّل**.
 *
 * التسجيل **قبل الإرجاع لا بعده**: لو سُجِّل بعده لأمكن أن يُقرأ ثم
 * يفشل التسجيل، فيقع اطّلاع بلا أثر. وهذا بالضبط ما يجعل سجلّ الاطّلاع
 * بلا قيمة — أثرٌ قد يوجد وقد لا يوجد.
 *
 * ولا تُعاد صورة الهوية ولا رقمها كاملًا: الاسم والحالة وتاريخ التوثيق
 * تكفي من يعالج طلبًا، والصورة تُطلب بإجراء منفصل موثَّق.
 */
export type IdentityView = {
  name: string | null;
  phone: string;
  email: string | null;
  idVerified: boolean;
  idVerifiedAt: string | null;
  /** آخر أربعة من الآيبان — يكفي للمطابقة ولا يكفي للتحويل. */
  ibanTail: string | null;
};

export async function viewIdentity(
  admin: AdminUser,
  userId: string,
  ip: string | null,
  reason: string,
  now: Date = new Date(),
): Promise<IdentityView | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      name: true, phone: true, email: true,
      idVerified: true, idVerifiedAt: true, iban: true,
    },
  });
  if (user === null) return null;

  // **قبل الإرجاع** — اطّلاعٌ بلا أثر يُفرغ السجلّ من معناه
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'User',
      entityId: userId,
      action: 'user.viewIdentity',
      after: { reason },
      ip,
      createdAt: now,
    },
  });

  // التنبيه بعد التسجيل — يقرأ منه ولا يسبقه
  await alertOnAccessSpike(admin.id, now);

  return {
    name: user.name,
    phone: user.phone,
    email: user.email,
    idVerified: user.idVerified,
    idVerifiedAt: user.idVerifiedAt?.toISOString() ?? null,
    ibanTail: user.iban === null || user.iban === '' ? null : user.iban.slice(-4),
  };
}

/** من اطّلع على هوية هذا العميل ومتى — يراه الأدمن والعميل لاحقًا. */
export async function identityAccessLog(userId: string) {
  return db.auditLog.findMany({
    where: { entity: 'User', entityId: userId, action: 'user.viewIdentity' },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export type UserRow = {
  id: string;
  name: string | null;
  /** آخر أربعة وحدها — الرقم كاملًا لا يعبر إلى العميل. */
  phoneTail: string;
  status: string;
  idVerified: boolean;
  listingCount: number;
  orderCount: number;
};

/**
 * صفوف جدول العملاء — **مُعدّة على الخادم**.
 *
 * تمرير صفوف Prisma كما هي إلى مكوّن عميل يضع مئة رقم جوال كامل في
 * حمولة الصفحة، ولو لم يُعرض أيٌّ منها. الإخفاء بالعرض ليس إخفاءً:
 * ما يعبر الحدّ يصل المتصفّح.
 */
export async function listAdminUsers(): Promise<UserRow[]> {
  const rows = await db.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, name: true, phone: true, status: true, idVerified: true,
      _count: { select: { listings: true, ordersAsBuyer: true } },
    },
  });

  return rows.map((user) => ({
    id: user.id,
    name: user.name,
    phoneTail: user.phone.slice(-4),
    status: user.status,
    idVerified: user.idVerified,
    listingCount: user._count.listings,
    orderCount: user._count.ordersAsBuyer,
  }));
}

// ═══════════════════════════════════════════════════════════
//  قرار ٧ — سجلّ الاطّلاع يُقرأ
// ═══════════════════════════════════════════════════════════

/**
 * **سجلٌّ لا يقرؤه أحد لا يمنع شيئًا** — وهذه هي القيمة كلّها.
 *
 * ملخّص أسبوعي إلى `SUPER_ADMIN` بعدد اطّلاعات كل عضو، وتنبيه فوري
 * عند تجاوز عضوٍ ضعف متوسّطه الأسبوعي.
 *
 * والمقارنة **بمتوسّط العضو نفسه** لا بمتوسّط الفريق: من يعالج
 * النزاعات يطّلع عشرة أضعاف من يحرّر الكتالوج، ورقمٌ موحّد يصرخ عليه
 * كل أسبوع حتى يُتجاهَل التنبيه كلّه.
 */
export const ACCESS_SPIKE_MULTIPLIER = 2;
const WEEK_MS = 7 * 24 * 3600 * 1000;

export type AccessSummaryRow = {
  adminId: string;
  adminName: string;
  thisWeek: number;
  /** متوسّط الأسابيع الأربعة السابقة — بلا الأسبوع الجاري. */
  baseline: number;
  spike: boolean;
};

export async function identityAccessSummary(
  now: Date = new Date(),
): Promise<AccessSummaryRow[]> {
  const weekAgo = new Date(now.getTime() - WEEK_MS);
  const fiveWeeksAgo = new Date(now.getTime() - 5 * WEEK_MS);

  const rows = await db.auditLog.findMany({
    where: {
      action: 'user.viewIdentity',
      actorType: 'admin',
      createdAt: { gte: fiveWeeksAgo },
    },
    select: { actorId: true, createdAt: true },
  });

  const admins = await db.adminUser.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.actorId))] } },
    select: { id: true, name: true },
  });

  return admins.map((admin) => {
    const mine = rows.filter((row) => row.actorId === admin.id);
    const thisWeek = mine.filter((row) => row.createdAt >= weekAgo).length;
    const earlier = mine.filter((row) => row.createdAt < weekAgo).length;
    const baseline = earlier / 4;

    return {
      adminId: admin.id,
      adminName: admin.name,
      thisWeek,
      baseline: Math.round(baseline * 10) / 10,
      // بلا تاريخ سابق لا قفزة — عضوٌ جديد ليس متجاوزًا
      spike: baseline > 0 && thisWeek > baseline * ACCESS_SPIKE_MULTIPLIER,
    };
  });
}

/**
 * التنبيه الفوري — يُستدعى بعد كل اطّلاع.
 *
 * **يُخطَر `SUPER_ADMIN` وحده**: تنبيهُ الفريق كلّه يجعل الرقابة
 * جماعية أي بلا صاحب، والقفزة قد تكون مشروعة فلا تُعلَن قبل أن تُفحص.
 */
export async function alertOnAccessSpike(
  adminId: string,
  now: Date = new Date(),
): Promise<{ alerted: boolean }> {
  const summary = await identityAccessSummary(now);
  const row = summary.find((entry) => entry.adminId === adminId);
  if (row === undefined || !row.spike) return { alerted: false };

  // تنبيه واحد لكل عضو في الأسبوع — التكرار يُدرِّب على التجاهل
  const since = new Date(now.getTime() - WEEK_MS);
  const already = await db.auditLog.count({
    where: {
      action: 'identity.access_spike',
      entityId: adminId,
      createdAt: { gte: since },
    },
  });
  if (already > 0) return { alerted: false };

  await db.auditLog.create({
    data: {
      actorId: 'system',
      actorType: 'system',
      entity: 'AdminUser',
      entityId: adminId,
      action: 'identity.access_spike',
      after: { thisWeek: row.thisWeek, baseline: row.baseline },
      createdAt: now,
    },
  });

  return { alerted: true };
}
