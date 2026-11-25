import { db } from '@/lib/db';
import {
  COOLDOWN_HOURS,
  MARKETING_CAP_PER_MONTH,
  validRules,
  type SegmentRule,
} from '@/lib/campaigns/segments';
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
/**
 * **والمشتركُ مع الشاشة في ملفّه بلا `db`** — وهو يُعاد تصديره هنا
 * فلا يتغيّر مستوردٌ قائم.
 */
export {
  SEGMENT_FIELDS,
  validRules,
  MARKETING_CAP_PER_MONTH,
  COOLDOWN_HOURS,
} from '@/lib/campaigns/segments';
export type { SegmentFieldKey, SegmentRule } from '@/lib/campaigns/segments';

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
      /** الحالةُ لا الراية — `idVerified` منطقيٌّ لا يقول «ينتظر» (قرار A18) */
      case 'isVerified':
        return { identityStatus: 'VERIFIED' };
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

/**
 * ═══ من يُحجب الآن — قاعدةٌ واحدة يقرؤها العرضُ والإرسال ═══
 *
 * كانت مكتوبةً مرّتين حرفًا بحرف: مرّةً في `resolveSegment` لتعرض
 * «سيصلهم فعلًا»، ومرّةً في `sendCampaign` لتختار من يُكتب له. **وهما
 * رقمان لجمهورٍ واحد**: تتغيّر مهلةُ التهدئة في موضعٍ فتقول الشاشة
 * سبعةً ويصل خمسة، ولا شيء يشكو.
 *
 * **والسببُ يُفصَّل لا يُجمَع**: «حُجب ثمانية» لا يقول للمشغّل شيئًا،
 * و«ستّةٌ في تهدئتهم واثنان بلغا سقف الشهر» يقول له أيُؤجّل أم يُلغي.
 */
export type Blocked = {
  /** خرج من حملةٍ قبل أقلّ من `COOLDOWN_HOURS`. */
  cooldown: Set<string>;
  /** بلغ `MARKETING_CAP_PER_MONTH` هذا الشهر. */
  cap: Set<string>;
  /** الاتّحاد — وهو ما يُطرح من الجمهور. */
  all: Set<string>;
};

export async function blockedRecipients(now: Date = new Date()): Promise<Blocked> {
  const cooldownSince = new Date(now.getTime() - COOLDOWN_HOURS * 3600 * 1000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [recent, heavy] = await Promise.all([
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

  const cooldown = new Set<string>(recent.map((row) => row.userId));
  const cap = new Set<string>(
    heavy.flatMap((row) => ((row._count._all ?? 0) >= MARKETING_CAP_PER_MONTH ? [row.userId] : [])),
  );
  return { cooldown, cap, all: new Set<string>([...cooldown, ...cap]) };
}

export type SegmentCounts = {
  /** من يطابق القواعد. */
  matched: number;
  /** ومنهم من وافق على التسويق. */
  consented: number;
  /**
   * ومنهم من خرج من فترة التهدئة — **والفرقُ عن `reachable` هو السقف**.
   *
   * ترميزُ `A9` يضع السطر الرابع لأنّ الفجوة تُشخَّص به: شريحةٌ «سيصلهم
   * فعلًا ٠» لا تقول لماذا — أبسقفٍ شهريّ أم بتهدئةِ حملةٍ قبل يومين؟
   * وقد وقع ذلك هنا: تشغيلُ اختبارٍ ساقط أرسل إلى تسعة مزروعين فقرأت
   * كلُّ شريحةٍ صفرًا، **والشاشة لا تقول السبب**.
   */
  outsideCooldown: number;
  /** ومنهم من لم يبلغ السقف أيضًا — **من سيصله فعلًا**. */
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

  const [matched, consented, blocked] = await Promise.all([
    db.user.count({ where }),
    db.user.count({ where: { ...where, marketingConsent: true } }),
    blockedRecipients(now),
  ]);

  const [outsideCooldown, reachable] = await Promise.all([
    blocked.cooldown.size === 0
      ? Promise.resolve(consented)
      : db.user.count({
          where: { ...where, marketingConsent: true, id: { notIn: [...blocked.cooldown] } },
        }),
    blocked.all.size === 0
      ? Promise.resolve(consented)
      : db.user.count({
          where: { ...where, marketingConsent: true, id: { notIn: [...blocked.all] } },
        }),
  ]);

  return { matched, consented, outsideCooldown, reachable };
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
  /** المعرّف وحده — وهو ما يُكتب في السجلّ، فلا يُطلَب الصفُّ كلُّه */
  admin: { id: string },
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

  /** **والقاعدةُ واحدة** — ما تعرضه الشاشة هو ما يُكتب به. */
  const [candidates, blocked] = await Promise.all([
    db.user.findMany({
      where: {
        status: 'ACTIVE',
        marketingConsent: true,
        AND: rules.map((rule) => conditionOf(rule, now)),
      },
      select: { id: true },
    }),
    blockedRecipients(now),
  ]);

  const audience = candidates.filter((user) => !blocked.all.has(user.id));
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

export type CampaignDetail = {
  id: string;
  nameAr: string;
  channels: string[];
  status: string;
  /** ما سيصل المستخدم — وكان لا يُعرض في شاشةٍ قطّ. */
  subjectAr: string | null;
  bodyAr: string | null;
  segment: { id: string; key: string; nameAr: string; rules: SegmentRule[] };
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  createdBy: string;
  createdByName: string | null;
  /**
   * الجمهورُ الآن — **بالقاعدة التي يطبّقها الإرسال نفسُه**، لا بقاعدةٍ
   * ثانية تشبهها.
   */
  audience: {
    matched: number;
    consented: number;
    reachable: number;
    /** الفجوةُ مفصَّلة: من حُجب ولماذا. */
    blockedByCooldown: number;
    blockedByCap: number;
  };
  /** بعد الإرسال — وقبله أصفارٌ وقائمةٌ فارغة. */
  results: {
    sent: number;
    opened: number;
    clicked: number;
    converted: number;
    rows: {
      id: string;
      name: string | null;
      ref: string | null;
      userId: string;
      channel: string;
      sentAt: string;
      openedAt: string | null;
      clickedAt: string | null;
      convertedAt: string | null;
    }[];
  };
};

/** سقفُ ما يُعرض من المستقبِلين — والعدّادُ يقول العددَ كلَّه. */
export const CAMPAIGN_ROWS = 50;

/**
 * ═══ حملةٌ واحدة — وكانت صفًّا في جدول ═══
 *
 * الصفُّ يقول اسمًا وأربعة عدّادات، **ولا موضعَ يُقرأ فيه نصُّ الرسالة
 * التي ستخرج**. والإرسال لا رجعة فيه ويستهلك سقفَ الشهر لكلّ من وصلته،
 * فنافذةُ التأكيد تسمّي الحملة ولا تُري ما فيها — يُمضي المشغّل بريدًا
 * إلى آلافٍ وهو لا يعرف ماذا يقول.
 */
export async function campaignDetail(
  id: string,
  now: Date = new Date(),
): Promise<CampaignDetail | null> {
  const campaign = await db.campaign.findUnique({
    where: { id },
    include: {
      segment: { select: { id: true, key: true, nameAr: true, rules: true } },
      sends: {
        orderBy: { sentAt: 'desc' },
        take: CAMPAIGN_ROWS,
        select: {
          id: true, userId: true, channel: true, sentAt: true,
          openedAt: true, clickedAt: true, convertedAt: true,
          user: { select: { name: true, ref: true } },
        },
      },
    },
  });
  if (campaign === null) return null;

  const rules = validRules(campaign.segment.rules) ? campaign.segment.rules : [];
  const where: Prisma.UserWhereInput = {
    status: 'ACTIVE',
    AND: rules.map((rule) => conditionOf(rule, now)),
  };

  const [matched, consented, blocked, totals, admin] = await Promise.all([
    db.user.count({ where }),
    db.user.count({ where: { ...where, marketingConsent: true } }),
    blockedRecipients(now),
    /** العدّاداتُ من تجميعةٍ كاملة — لا من الصفوف المعروضة. */
    db.campaignSend.findMany({
      where: { campaignId: id },
      select: { openedAt: true, clickedAt: true, convertedAt: true },
    }),
    db.adminUser.findUnique({ where: { id: campaign.createdBy }, select: { name: true } }),
  ]);

  const consentedIn = async (ids: readonly string[]): Promise<number> =>
    ids.length === 0
      ? 0
      : db.user.count({ where: { ...where, marketingConsent: true, id: { in: [...ids] } } });

  /**
   * **والمحجوبُ يُعدّ داخل الشريحة لا في الدنيا كلّها**: «٤٠٠ في
   * تهدئتهم» عن منصّةٍ كلِّها لا تقول شيئًا عن هذه الحملة.
   */
  const [blockedByCooldown, blockedByCap] = await Promise.all([
    consentedIn([...blocked.cooldown]),
    consentedIn([...blocked.cap].filter((userId) => !blocked.cooldown.has(userId))),
  ]);

  const reachable =
    blocked.all.size === 0
      ? consented
      : await db.user.count({
          where: { ...where, marketingConsent: true, id: { notIn: [...blocked.all] } },
        });

  return {
    id: campaign.id,
    nameAr: campaign.nameAr,
    channels: campaign.channels,
    status: campaign.status,
    subjectAr: campaign.subjectAr,
    bodyAr: campaign.bodyAr,
    segment: {
      id: campaign.segment.id,
      key: campaign.segment.key,
      nameAr: campaign.segment.nameAr,
      rules,
    },
    scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
    sentAt: campaign.sentAt?.toISOString() ?? null,
    createdAt: campaign.createdAt.toISOString(),
    createdBy: campaign.createdBy,
    createdByName: admin?.name ?? null,
    audience: { matched, consented, reachable, blockedByCooldown, blockedByCap },
    results: {
      sent: totals.length,
      opened: totals.filter((row) => row.openedAt !== null).length,
      clicked: totals.filter((row) => row.clickedAt !== null).length,
      converted: totals.filter((row) => row.convertedAt !== null).length,
      rows: campaign.sends.map((row) => ({
        id: row.id,
        userId: row.userId,
        name: row.user.name,
        ref: row.user.ref,
        channel: row.channel,
        sentAt: row.sentAt.toISOString(),
        openedAt: row.openedAt?.toISOString() ?? null,
        clickedAt: row.clickedAt?.toISOString() ?? null,
        convertedAt: row.convertedAt?.toISOString() ?? null,
      })),
    },
  };
}

export type CreateCampaignResult =
  | { ok: true; campaignId: string; status: 'DRAFT' | 'SCHEDULED' }
  | {
      ok: false;
      reason: 'NAME_REQUIRED' | 'NO_CHANNEL' | 'SEGMENT_NOT_FOUND' | 'PAST_SCHEDULE' | 'NO_BODY';
    };

const CHANNELS: readonly string[] = ['email', 'sms', 'push'];

/**
 * ═══ حملةٌ جديدة — وكانت لا تُنشأ إلّا بالبذرة ═══
 *
 * ترميزُ `A9` يضع «+ حملة جديدة» في رأس الشاشة، **ولا مسارَ ينشئ
 * `Campaign` في المنتج كلّه**: الشرائح تُبنى وتُحفظ، والإرسال مبنيٌّ
 * بضوابطه كلّها (الموافقة · التهدئة · السقف الشهريّ) — ولا شيء بينهما.
 * فمن فتح الشاشة وجد ما زرعته البذرة وحده.
 *
 * ═══ والمجدولة تُرسَل أو لا تُجدوَل ═══
 *
 * `scheduledAt` في المخطّط و`SCHEDULED` في التعداد، **ولا وظيفةَ دورية
 * تُرسلها**: حملةٌ تُجدوَل تقف إلى الأبد، وتابُ «مجدولة» يعدّ ما لن يقع.
 * فإمّا كاتبٌ وقارئ، وإمّا لا يُعرض الخيار.
 */
export async function createCampaign(
  input: {
    nameAr: string;
    channels: readonly string[];
    segmentId: string;
    subjectAr: string | null;
    bodyAr: string;
    /** `null` ⇒ مسودّة تُرسَل بيد؛ وتاريخٌ ⇒ مجدولة */
    scheduledAt: Date | null;
    adminId: string;
    ip: string | null;
  },
  now: Date = new Date(),
): Promise<CreateCampaignResult> {
  const nameAr = input.nameAr.trim();
  const bodyAr = input.bodyAr.trim();
  const channels = input.channels.filter((channel) => CHANNELS.includes(channel));

  if (nameAr === '') return { ok: false, reason: 'NAME_REQUIRED' };
  if (bodyAr === '') return { ok: false, reason: 'NO_BODY' };
  if (channels.length === 0) return { ok: false, reason: 'NO_CHANNEL' };
  if (input.scheduledAt !== null && input.scheduledAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'PAST_SCHEDULE' };
  }

  const segment = await db.segment.findUnique({
    where: { id: input.segmentId },
    select: { id: true },
  });
  if (segment === null) return { ok: false, reason: 'SEGMENT_NOT_FOUND' };

  const status = input.scheduledAt === null ? 'DRAFT' : 'SCHEDULED';

  const created = await db.campaign.create({
    data: {
      nameAr,
      channels,
      segmentId: segment.id,
      subjectAr: input.subjectAr?.trim() === '' ? null : (input.subjectAr?.trim() ?? null),
      bodyAr,
      status,
      scheduledAt: input.scheduledAt,
      createdBy: input.adminId,
      createdAt: now,
    },
    select: { id: true },
  });

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'Campaign',
      entityId: created.id,
      action: 'campaign.created',
      before: {},
      after: { nameAr, channels, status, segmentId: segment.id },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true, campaignId: created.id, status };
}

/**
 * إرسالُ ما حلّ موعدُه — **بالمرسِل نفسِه الذي يضغطه المشغّل**.
 *
 * ولا نسخةَ ثانية من قواعد الإرسال: `sendCampaign` تحوسب الشريحة الآن
 * وتفحص الموافقة والتهدئة والسقف. والفاعلُ في السجلّ **من جدولها** —
 * فالجدولةُ قرارُه، والوظيفةُ تنفّذه؛ وحملةٌ جدولَها حسابٌ حُذف تُترك
 * وتُعلَّم، فإرسالٌ بلا فاعلٍ في السجلّ لا يُراجَع.
 */
export async function sendDueCampaigns(now: Date = new Date()): Promise<number> {
  const due = await db.campaign.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
    select: { id: true, createdBy: true },
    orderBy: { scheduledAt: 'asc' },
  });

  let sent = 0;
  for (const campaign of due) {
    const actor = await db.adminUser.findUnique({
      where: { id: campaign.createdBy },
      select: { id: true },
    });

    if (actor === null) {
      await db.campaign.update({
        where: { id: campaign.id },
        data: { status: 'CANCELLED' },
      });
      await db.auditLog.create({
        data: {
          actorId: 'system',
          actorType: 'system',
          entity: 'Campaign',
          entityId: campaign.id,
          action: 'campaign.schedule_orphaned',
          before: { status: 'SCHEDULED' },
          after: { createdBy: campaign.createdBy },
          ip: null,
          createdAt: now,
        },
      });
      continue;
    }

    const result = await sendCampaign({ id: actor.id }, campaign.id, null, now);
    if (result.ok) sent += 1;
  }

  return sent;
}
