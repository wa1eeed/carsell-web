import { db } from '@/lib/db';
import type { AdminUser, Prisma } from '@/generated/prisma/client';

/**
 * A9 — الحملات التسويقية.
 *
 * ═══ معيار القبول ═══ **الشريحة تُحوسَب وقت الإرسال لا وقت الحفظ.**
 *
 * وحفظ قائمة المطابقين هو الخطأ الطبيعي: أسرع، وأسهل، ويكذب بعد ساعة.
 * من ألغى موافقته التسويقية بين الحفظ والإرسال يبقى في القائمة فتصله
 * رسالة سحب إذنه منها، ومن أتمّ صفقة يصله «أكمل شراءك». والشريحة
 * المحفوظة لا تُظهر ذلك — تُظهر رقمًا كان صحيحًا يوم كُتب.
 */

/** الحقول التي يجوز بناء شرط عليها — **قائمة مغلقة**. */
export const SEGMENT_FIELDS = [
  { key: 'hasFavorites', kind: 'bool' },
  { key: 'hasCompletedOrder', kind: 'bool' },
  { key: 'hasActiveOrder', kind: 'bool' },
  { key: 'hasListing', kind: 'bool' },
  { key: 'hasVehicle', kind: 'bool' },
  { key: 'hasBid', kind: 'bool' },
  { key: 'isDealer', kind: 'bool' },
  { key: 'activeWithinDays', kind: 'number' },
] as const;

export type SegmentRule = { field: string; negate?: boolean; value?: number };

const FIELD_KEYS: readonly string[] = SEGMENT_FIELDS.map((entry) => entry.key);

export function validRules(rules: unknown): rules is SegmentRule[] {
  if (!Array.isArray(rules) || rules.length === 0) return false;
  return rules.every(
    (rule: unknown) =>
      rule !== null &&
      typeof rule === 'object' &&
      typeof (rule as SegmentRule).field === 'string' &&
      FIELD_KEYS.includes((rule as SegmentRule).field),
  );
}

/** يترجم شرطًا واحدًا إلى `where` — والنفي بـ`NOT` لا بقلب الشرط يدويًّا. */
function conditionOf(rule: SegmentRule, now: Date): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = (() => {
    switch (rule.field) {
      case 'hasFavorites':
        return { favorites: { some: {} } };
      case 'hasCompletedOrder':
        return { ordersAsBuyer: { some: { status: 'COMPLETED' } } };
      case 'hasActiveOrder':
        return { ordersAsBuyer: { some: { status: { in: ['ACTIVE', 'DISPUTED'] } } } };
      case 'hasListing':
        return { listings: { some: {} } };
      case 'hasVehicle':
        return { vehicles: { some: {} } };
      case 'hasBid':
        return { bids: { some: {} } };
      case 'isDealer':
        return { dealerId: { not: null } };
      case 'activeWithinDays': {
        const days = rule.value ?? 30;
        return { createdAt: { gte: new Date(now.getTime() - days * 86_400_000) } };
      }
      default:
        // حقل غير معروف لا يُوسِّع الشريحة — شرطٌ لا يطابق أحدًا
        return { id: '__unknown_field__' };
    }
  })();

  return rule.negate === true ? { NOT: base } : base;
}

export const MARKETING_CAP_PER_MONTH = 4;
export const COOLDOWN_HOURS = 72;

export type SegmentCounts = {
  /** من يطابق القواعد. */
  matched: number;
  /** ومنهم من وافق على التسويق. */
  consented: number;
  /** ومنهم من خرج من التهدئة ولم يبلغ السقف — **من سيصله فعلًا**. */
  reachable: number;
};

/**
 * ═══ الحوسبة الحيّة ═══
 *
 * ثلاثة أرقام لا واحد، لأن الفجوة بينها هي المعلومة: «٨٬٩٢٠ يطابقون
 * و٥٬٩٤٠ سيصلهم» تقول إن ثلث الشريحة محجوب — وهو ما لا يقوله رقم
 * واحد.
 */
export async function resolveSegment(
  rules: SegmentRule[],
  now: Date = new Date(),
): Promise<SegmentCounts> {
  const where: Prisma.UserWhereInput = {
    status: 'ACTIVE',
    AND: rules.map((rule) => conditionOf(rule, now)),
  };

  const cooldownSince = new Date(now.getTime() - COOLDOWN_HOURS * 3600 * 1000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [matched, consented, recentIds, heavyIds] = await Promise.all([
    db.user.count({ where }),
    db.user.count({ where: { ...where, marketingConsent: true } }),
    // خرج للتوّ من حملة — التهدئة ٧٢ ساعة
    db.campaignSend.findMany({
      where: { sentAt: { gte: cooldownSince } },
      select: { userId: true },
      distinct: ['userId'],
    }),
    db.campaignSend.groupBy({
      by: ['userId'],
      where: { sentAt: { gte: monthStart } },
      _count: { _all: true },
    }),
  ]);

  const blocked = new Set<string>(recentIds.map((row) => row.userId));
  for (const row of heavyIds) {
    if ((row._count._all ?? 0) >= MARKETING_CAP_PER_MONTH) blocked.add(row.userId);
  }

  const reachable =
    blocked.size === 0
      ? consented
      : await db.user.count({
          where: { ...where, marketingConsent: true, id: { notIn: [...blocked] } },
        });

  return { matched, consented, reachable };
}

export type CampaignRow = {
  id: string;
  nameAr: string;
  channels: string[];
  status: string;
  segmentName: string;
  scheduledAt: string | null;
  sentAt: string | null;
  /** **محسوبة من `CampaignSend` لا مخزَّنة** — كل نسبة من صفوفها. */
  sent: number;
  openedPct: number | null;
  clickedPct: number | null;
  converted: number;
};

function ratio(part: number, whole: number): number | null {
  // لم يُرسَل بعد ⇒ لا نسبة. و«٠٪» تُقرأ فشلًا وهي ليست كذلك
  return whole === 0 ? null : Math.round((part / whole) * 100);
}

export async function listCampaigns(): Promise<CampaignRow[]> {
  const campaigns = await db.campaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      segment: { select: { nameAr: true } },
      sends: { select: { openedAt: true, clickedAt: true, convertedAt: true } },
    },
  });

  return campaigns.map((campaign) => {
    const sent = campaign.sends.length;
    return {
      id: campaign.id,
      nameAr: campaign.nameAr,
      channels: campaign.channels,
      status: campaign.status,
      segmentName: campaign.segment.nameAr,
      scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
      sentAt: campaign.sentAt?.toISOString() ?? null,
      sent,
      openedPct: ratio(campaign.sends.filter((row) => row.openedAt !== null).length, sent),
      clickedPct: ratio(campaign.sends.filter((row) => row.clickedAt !== null).length, sent),
      converted: campaign.sends.filter((row) => row.convertedAt !== null).length,
    };
  });
}

export type SegmentRow = {
  id: string;
  key: string;
  nameAr: string;
  rules: SegmentRule[];
  /** يُحسب الآن — والرقم صالح للحظته وحدها. */
  counts: SegmentCounts;
};

export async function listSegments(now: Date = new Date()): Promise<SegmentRow[]> {
  const segments = await db.segment.findMany({ orderBy: { createdAt: 'desc' } });

  return Promise.all(
    segments.map(async (segment) => {
      const rules = validRules(segment.rules) ? segment.rules : [];
      return {
        id: segment.id,
        key: segment.key,
        nameAr: segment.nameAr,
        rules,
        counts: await resolveSegment(rules, now),
      };
    }),
  );
}

export type SaveSegmentResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'INVALID_RULES' | 'KEY_TAKEN' };

export async function saveSegment(
  admin: AdminUser,
  input: { key: string; nameAr: string; rules: unknown },
  ip: string | null,
  now = new Date(),
): Promise<SaveSegmentResult> {
  if (!validRules(input.rules)) return { ok: false, reason: 'INVALID_RULES' };
  if ((await db.segment.count({ where: { key: input.key } })) > 0) {
    return { ok: false, reason: 'KEY_TAKEN' };
  }

  const segment = await db.segment.create({
    data: {
      key: input.key,
      nameAr: input.nameAr,
      rules: input.rules as Prisma.InputJsonValue,
      createdBy: admin.id,
      createdAt: now,
    },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'Segment',
      entityId: segment.key,
      action: 'segment.created',
      before: {},
      after: { rules: input.rules as Prisma.InputJsonValue },
      ip,
      createdAt: now,
    },
  });

  return { ok: true, id: segment.id };
}

export type SendResult =
  | { ok: true; sent: number; skipped: number }
  | { ok: false; reason: 'NOT_FOUND' | 'NOT_SENDABLE' | 'NO_AUDIENCE' };

/**
 * الإرسال — **الشريحة تُحوسَب هنا، الآن**.
 *
 * ولا مزوّد بعد، فما يقع هو تسجيل `CampaignSend` لمن سيصلهم فعلًا:
 * الحالات والقواعد والقياس كلّها حقيقية، والنقل وحده مؤجَّل. وحين يصل
 * المزوّد يُستبدل سطر الإرسال — لا المنطق (كما في الضمان الوهمي).
 */
export async function sendCampaign(
  admin: AdminUser,
  campaignId: string,
  ip: string | null,
  now = new Date(),
): Promise<SendResult> {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    include: { segment: true },
  });
  if (campaign === null) return { ok: false, reason: 'NOT_FOUND' };
  if (campaign.status === 'SENT' || campaign.status === 'CANCELLED') {
    return { ok: false, reason: 'NOT_SENDABLE' };
  }

  const rules = validRules(campaign.segment.rules) ? campaign.segment.rules : [];
  const cooldownSince = new Date(now.getTime() - COOLDOWN_HOURS * 3600 * 1000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [candidates, recent, heavy] = await Promise.all([
    db.user.findMany({
      where: {
        status: 'ACTIVE',
        marketingConsent: true,
        AND: rules.map((rule) => conditionOf(rule, now)),
      },
      select: { id: true },
    }),
    db.campaignSend.findMany({
      where: { sentAt: { gte: cooldownSince } },
      select: { userId: true },
      distinct: ['userId'],
    }),
    db.campaignSend.groupBy({
      by: ['userId'],
      where: { sentAt: { gte: monthStart } },
      _count: { _all: true },
    }),
  ]);

  const blocked = new Set<string>(recent.map((row) => row.userId));
  for (const row of heavy) {
    if ((row._count._all ?? 0) >= MARKETING_CAP_PER_MONTH) blocked.add(row.userId);
  }

  const audience = candidates.filter((user) => !blocked.has(user.id));
  if (audience.length === 0) return { ok: false, reason: 'NO_AUDIENCE' };

  const channel = campaign.channels[0] ?? 'push';

  await db.$transaction([
    db.campaignSend.createMany({
      data: audience.map((user) => ({
        campaignId: campaign.id,
        userId: user.id,
        channel,
        sentAt: now,
      })),
      skipDuplicates: true,
    }),
    db.campaign.update({
      where: { id: campaign.id },
      data: { status: 'SENT', sentAt: now },
    }),
    db.auditLog.create({
      data: {
        actorId: admin.id,
        actorType: 'admin',
        entity: 'Campaign',
        entityId: campaign.id,
        action: 'campaign.sent',
        before: { status: campaign.status },
        // العدد وقت الإرسال — لا العدد الذي رآه المحرّر وقت الحفظ
        after: { sent: audience.length, skipped: candidates.length - audience.length },
        ip,
        createdAt: now,
      },
    }),
  ]);

  return { ok: true, sent: audience.length, skipped: candidates.length - audience.length };
}
