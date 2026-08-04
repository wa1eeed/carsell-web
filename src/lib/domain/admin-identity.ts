import type { IdentityStatus } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { IDENTITY_QUEUE, holdIdentity, verifyIdentity } from './identity-state';
import { MIN_IDENTITY_NOTE } from './identity-rules';

/**
 * ═══ A18 — طابور توثيق الهوية ═══
 *
 * **لم يكن أحدٌ يوثَّق إطلاقًا**: `idVerified` منطقيّ بلا كاتب، ولا
 * شاشة تعرض من قدّم هويته. وحارس الشراء يقرؤه — فكل حساب ممنوع من كل
 * معاملة، والباب الذي يُستوفى منه غير موجود.
 *
 * ═══ والطابور اليدويّ وحده ═══
 *
 * التصميم يقولها في العنوان: «النفاذ الوطني يُوثَّق تلقائيًّا». فما
 * يصل هنا هو الإدخال اليدويّ والسجلّ التجاريّ، ونسبة النفاذ المعروضة
 * **مقياسٌ لطول الطابور**: كلّما ارتفعت قلّ ما ينتظر إنسانًا.
 *
 * ═══ ولا يُقرأ رقم الهوية هنا ═══
 *
 * الطابور يعرض الاسم والجوال والطريقة والملاحظة الآلية. وكشفُ الرقم
 * فعلٌ مستقلّ بسببٍ مكتوب عبر `viewIdentity` — فلا يمرّ الاطّلاع
 * عرَضًا لأن مراجعًا فتح قائمة.
 */

export type IdentityRow = {
  userId: string;
  name: string | null;
  phone: string;
  status: IdentityStatus;
  /** `manual` · `nafath` · `commercial_register` — والشاشة تصوغها */
  method: string | null;
  /** ما طُلب توضيحه أو سبب الرفض — و`null` للمنتظر */
  note: string | null;
  waitingMinutes: number;
  /** لهم إعلانات أو طلبات؟ فالتأخير عليهم أثقل */
  listingCount: number;
};

export type IdentityStats = {
  waiting: number;
  oldestMinutes: number | null;
  verifiedTotal: number;
  rejectedTotal: number;
  clarification: number;
  /** نصيب النفاذ من الموثَّقين — وارتفاعُه يُقصّر الطابور */
  nafathSharePct: number;
};

const minutesSince = (from: Date, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));

/** الطابور — **الأقدم أوّلًا**، ومن انتظر أطول يُراجَع أوّلًا. */
export async function identityQueue(
  status: IdentityStatus | null = null,
  now: Date = new Date(),
): Promise<IdentityRow[]> {
  const users = await db.user.findMany({
    where: { identityStatus: status === null ? { in: [...IDENTITY_QUEUE] } : status },
    orderBy: { identitySubmittedAt: 'asc' },
    take: 200,
    select: {
      id: true,
      name: true,
      phone: true,
      identityStatus: true,
      identityMethod: true,
      identityNote: true,
      identitySubmittedAt: true,
      _count: { select: { listings: true } },
    },
  });

  return users.map((user) => ({
    userId: user.id,
    name: user.name,
    phone: user.phone,
    status: user.identityStatus,
    method: user.identityMethod,
    note: user.identityNote,
    waitingMinutes:
      user.identitySubmittedAt === null ? 0 : minutesSince(user.identitySubmittedAt, now),
    listingCount: user._count.listings,
  }));
}

export async function identityStats(now: Date = new Date()): Promise<IdentityStats> {
  const [waiting, oldest, verified, rejected, clarification, viaNafath] = await Promise.all([
    db.user.count({ where: { identityStatus: 'PENDING' } }),
    db.user.findFirst({
      where: { identityStatus: 'PENDING', identitySubmittedAt: { not: null } },
      orderBy: { identitySubmittedAt: 'asc' },
      select: { identitySubmittedAt: true },
    }),
    db.user.count({ where: { identityStatus: 'VERIFIED' } }),
    db.user.count({ where: { identityStatus: 'REJECTED' } }),
    db.user.count({ where: { identityStatus: 'CLARIFICATION' } }),
    db.user.count({ where: { identityStatus: 'VERIFIED', identityMethod: 'nafath' } }),
  ]);

  return {
    waiting,
    oldestMinutes:
      oldest?.identitySubmittedAt == null
        ? null
        : minutesSince(oldest.identitySubmittedAt, now),
    verifiedTotal: verified,
    rejectedTotal: rejected,
    clarification,
    nafathSharePct: verified === 0 ? 0 : Math.round((viaNafath / verified) * 100),
  };
}

export type IdentityDecision = 'VERIFY' | 'CLARIFY' | 'REJECT';

export type IdentityFailure = 'USER_NOT_FOUND' | 'NOT_IN_QUEUE' | 'NOTE_REQUIRED';

export type IdentityResult =
  | { ok: true; status: IdentityStatus }
  | { ok: false; reason: IdentityFailure };

/**
 * قرار التوثيق — **ثلاثة، واثنان منها يشترطان سببًا**.
 *
 * ورفضٌ بلا سبب يجعل صاحبه يرفع الصورة نفسها فيُرفض ثانيةً، ودورةٌ لا
 * تنتهي بين الطرفين — وهي الدورة نفسها التي عولجت في إرجاع الإعلان.
 */
export async function decideIdentity(
  input: {
    userId: string;
    decision: IdentityDecision;
    note: string | null;
    adminId: string;
    ip: string | null;
  },
  now: Date = new Date(),
): Promise<IdentityResult> {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, identityStatus: true },
  });

  if (user === null) return { ok: false, reason: 'USER_NOT_FOUND' };
  if (!IDENTITY_QUEUE.includes(user.identityStatus)) {
    return { ok: false, reason: 'NOT_IN_QUEUE' };
  }

  const note = input.note?.trim() ?? '';
  if (input.decision !== 'VERIFY' && note.length < MIN_IDENTITY_NOTE) {
    return { ok: false, reason: 'NOTE_REQUIRED' };
  }

  if (input.decision === 'VERIFY') {
    await verifyIdentity(db, user.id, input.adminId, now);
  } else {
    await holdIdentity(db, user.id, input.decision === 'CLARIFY' ? 'CLARIFICATION' : 'REJECTED', {
      note,
      adminId: input.adminId,
    });
  }

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'User',
      entityId: user.id,
      action: `identity.${input.decision.toLowerCase()}`,
      before: { identityStatus: user.identityStatus },
      // **الملاحظة تُسجَّل ولا يُسجَّل رقم الهوية** — السجلّ يُقرأ لاحقًا
      after: { note: note === '' ? null : note },
      ip: input.ip,
      createdAt: now,
    },
  });

  const status: IdentityStatus =
    input.decision === 'VERIFY' ? 'VERIFIED' : input.decision === 'CLARIFY' ? 'CLARIFICATION' : 'REJECTED';
  return { ok: true, status };
}
