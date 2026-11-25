import { createHash, randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import type { DealerRole } from '@/generated/prisma/enums';

/**
 * ═══ جلسةُ لوحة المعرض ═══
 *
 * قرار المالك ٢٠٢٦-١١-٢٥: «المعرض ليس كمثل المستخدم العادي».
 *
 * **والاعتمادُ واحدٌ والجلسةُ ثلاث.** الشخصُ يُثبت نفسَه بجواله ورمزِه
 * كما يفعل أيُّ مستخدم — فلا كلمةَ مرورٍ للمعرض تُتداوَل بين موظّفيه
 * (لا تُسحب من شخصٍ بعينه، وتُسرَّب، **وتمحو أثرَ من فعل**). ثمّ
 * تُفتح له جلسةٌ **لهذا المعرض** محصورةٌ بـ`/dealer`.
 *
 * ولوحةُ المعرض يتحرّك فيها مالٌ ومخزونٌ وفريق، **وجهازٌ يُترك مفتوحًا
 * في صالة العرض** حالٌ متوقَّعة لا شاذّة — فمهلتُها أقصر من مهلة
 * المتجر.
 */
export const DEALER_SESSION_HOURS = 12;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type DealerActor = {
  userId: string;
  name: string | null;
  dealerId: string;
  dealerName: string;
  role: DealerRole;
  /** فرعُه — و`null` تعني «كل الفروع» (المالك والمدير) أو لا فرعَ له. */
  branchId: string | null;
};

export type DealerSignInFailure =
  /** الحسابُ ليس عضوًا في أيّ معرض. */
  | 'NOT_A_MEMBER'
  /** المعرضُ لم يُعتمد بعد، أو أُوقف. */
  | 'DEALER_NOT_ACTIVE'
  | 'USER_NOT_ACTIVE';

/**
 * يفتح جلسةَ لوحةٍ لمستخدمٍ أثبت نفسَه بالفعل.
 *
 * **ولا يفحص رمزًا ولا كلمة**: إثباتُ الهويّة وقع في `/api/v1/auth/otp`،
 * وهذه تسأل سؤالًا آخر — «أهذا الشخصُ عضوٌ في معرضٍ معتمد؟». وخلطُ
 * السؤالين يجعل بابًا ثانيًا للاعتماد، وثانيًا يعني ثانيًا يُخترق.
 */
export async function openDealerSession(
  userId: string,
  now: Date = new Date(),
): Promise<{ ok: true; token: string; actor: DealerActor } | { ok: false; reason: DealerSignInFailure }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, status: true, dealerId: true, dealerRole: true, branchId: true,
      dealer: { select: { id: true, nameAr: true, status: true } },
    },
  });

  if (user === null || user.status !== 'ACTIVE') return { ok: false, reason: 'USER_NOT_ACTIVE' };
  if (user.dealer === null || user.dealerRole === null) {
    return { ok: false, reason: 'NOT_A_MEMBER' };
  }
  /**
   * **والاعتمادُ شرطٌ لفتح الجلسة لا لعرض الشاشة.** معرضٌ ينتظر
   * مراجعة سجلّه لا يبيع ولا يسعّر — وفتحُ اللوحة له ثمّ منعُه عند
   * كل زرّ يجعله يحسب النظام معطّلًا.
   */
  if (user.dealer.status !== 'ACTIVE') return { ok: false, reason: 'DEALER_NOT_ACTIVE' };

  const token = randomBytes(32).toString('base64url');
  await db.dealerSession.create({
    data: {
      userId: user.id,
      dealerId: user.dealer.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + DEALER_SESSION_HOURS * 3_600_000),
      createdAt: now,
    },
  });

  return {
    ok: true,
    token,
    actor: {
      userId: user.id,
      name: user.name,
      dealerId: user.dealer.id,
      dealerName: user.dealer.nameAr,
      role: user.dealerRole,
      branchId: user.branchId,
    },
  };
}

/**
 * يحلّ الجلسة إلى فاعلٍ — أو `null`.
 *
 * **والعضويّةُ تُقرأ الآن لا يوم فُتحت الجلسة.** عضوٌ أُخرج من الفريق
 * أو بُدّل دورُه أو أُوقف معرضُه يبقى بكوكي صالحٍ زمنيًّا — فتُقرأ
 * حالُه في كل طلب، وإلّا بقي يبيع من معرضٍ لم يعد فيه.
 */
export async function resolveDealerSession(
  token: string,
  now: Date = new Date(),
): Promise<DealerActor | null> {
  if (token === '') return null;

  const session = await db.dealerSession.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      revokedAt: true, expiresAt: true, dealerId: true,
      user: {
        select: {
          id: true, name: true, status: true, dealerId: true, dealerRole: true, branchId: true,
          dealer: { select: { id: true, nameAr: true, status: true } },
        },
      },
    },
  });

  if (session === null) return null;
  if (session.revokedAt !== null) return null;
  if (session.expiresAt.getTime() <= now.getTime()) return null;

  const user = session.user;
  if (user.status !== 'ACTIVE') return null;
  if (user.dealerRole === null || user.dealer === null) return null;
  if (user.dealer.status !== 'ACTIVE') return null;
  /** وانتقالُ عضوٍ إلى معرضٍ آخر يُبطل جلستَه في الأوّل. */
  if (user.dealer.id !== session.dealerId) return null;

  return {
    userId: user.id,
    name: user.name,
    dealerId: user.dealer.id,
    dealerName: user.dealer.nameAr,
    role: user.dealerRole,
    branchId: user.branchId,
  };
}

/** يُبطل جلسةً بعينها — خروجٌ من اللوحة لا من المتجر. */
export async function revokeDealerSession(token: string, now: Date = new Date()): Promise<void> {
  if (token === '') return;
  await db.dealerSession
    .updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: now } })
    .catch(() => undefined);
}
