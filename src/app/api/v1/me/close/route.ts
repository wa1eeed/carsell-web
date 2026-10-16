import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/auth/session';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { SESSION_COOKIE } from '@/lib/auth/token';
import { closeOwnAccount, closureBlockers } from '@/lib/domain/account-closure';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/me/close` — إغلاقُ الحساب.
 *
 * ومن سجّل كان لا يستطيع المغادرة: لا شاشة ولا مسار ولا دالّة.
 * والقرار (المالك، ١٦ أكتوبر): **تجهيلٌ لا محو** — تُمسح البيانات
 * الشخصية وتبقى الفواتير والعقود، فهي مستنداتٌ تُحفظ سنوات.
 *
 * **و`POST` لا `DELETE`**: الفعل ليس حذفَ صفّ، والاسم يصف ما يقع.
 * والرسالة التي تردّ تقول ما بقي لا ما ذهب وحده.
 */
const Body = z.object({ reason: z.string().max(300).nullable().optional() });

const BLOCKED: Record<string, { ar: string; en: string }> = {
  LIVE_ORDERS: {
    ar: 'عليك طلبٌ جارٍ — أنهِه أو ألغِه قبل الإغلاق.',
    en: 'You have a live order — finish or cancel it first.',
  },
  HELD_ESCROW: {
    ar: 'في الضمان مبلغٌ محجوز على صفقةٍ لم تُحسم بعد.',
    en: 'Escrow still holds money on a deal that has not settled.',
  },
  LIVE_AUCTION: {
    ar: 'لك مزادٌ قائم — انتظر إغلاقه أو ألغِه.',
    en: 'You have a live auction — wait for it to close or cancel it.',
  },
  HELD_DEPOSIT: {
    ar: 'عربونُك محجوزٌ على مزاد — يُفرَج عنه عند إغلاقه.',
    en: 'Your deposit is held on an auction — it is released when it closes.',
  },
  PENDING_PAYOUT: {
    ar: 'لك تحويلٌ قيد التنفيذ — انتظر وصوله.',
    en: 'A payout is in flight — wait for it to land.',
  },
  WALLET_BALANCE: {
    ar: 'في محفظتك رصيد — اسحبه قبل الإغلاق، فالمال لك.',
    en: 'Your wallet still holds a balance — withdraw it first; the money is yours.',
  },
};

export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ reason: 'INVALID' }), 422);

  const result = await closeOwnAccount({
    userId: user.id,
    reason: parsed.data.reason ?? null,
  });

  if (!result.ok) {
    if (result.reason === 'USER_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    const text = BLOCKED[result.reason];
    return fail(
      {
        code: result.reason,
        messageAr: text?.ar ?? 'تعذّر إغلاق الحساب.',
        messageEn: text?.en ?? 'Could not close the account.',
      },
      409,
    );
  }

  /**
   * **والجلسة تُنهى هنا لا عند انقضائها.** الحارس يرفض غير `ACTIVE`
   * منذ اللحظة، لكنّ كعكةً باقيةً تُبقي الشاشة تحاول وتفشل — والوداع
   * يكون نظيفًا.
   */
  const response = ok({ closed: true });
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}

/**
 * `GET` — ما يمنع الإغلاق، **قبل أن يُضغط الزرّ**.
 *
 * واكتشافُ «عليك عمل» بعد الضغط أسوأ توقيت، والقاعدة مكتوبة:
 * التذكير يسبق لحظة الحاجة.
 */
export async function GET(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const blockers = await closureBlockers(user.id);
  return ok({
    canClose: blockers.length === 0,
    blockers: blockers.map((key) => ({ code: key, messageAr: BLOCKED[key]?.ar ?? '' })),
  });
}
