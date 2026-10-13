import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import { normalizeSaudiPhone } from '@/lib/domain/phone';
import { profileCompletion, toPublicUser } from '@/lib/domain/profile';
import { SESSION_COOKIE, SESSION_DAYS, signSession } from '@/lib/auth/token';
import { isDevelopment } from '@/lib/env';

export const runtime = 'nodejs';

const Body = z.object({
  phone: z.string().min(5).max(30),
  password: z.string().min(1).max(200),
});

/**
 * ═══ `POST /api/v1/auth/login` — دخولٌ بكلمة المرور ═══
 *
 * **والرمز يبقى بابًا.** تسعةٌ وعشرون حسابًا قائمًا لا كلمة لها،
 * فجعلُ الكلمة الطريقَ الوحيد يُغلق عليها حساباتها. هذا بابٌ ثانٍ لمن
 * وضع كلمةً عند التسجيل.
 *
 * ═══ والجوابُ واحدٌ للحالتين ═══
 *
 * رقمٌ غير مسجَّل وكلمةٌ خاطئة يُردّان بالرسالة نفسها: التفريق بينهما
 * يقول للمجرّب «هذا الرقم عندنا» — وهو نصفُ الطريق إلى حسابٍ بعينه.
 */
export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ phone: 'INVALID' }), 422);

  const phone = normalizeSaudiPhone(parsed.data.phone);
  if (phone === null) return fail(ERRORS.OTP_INVALID, 401);

  const user = await db.user.findUnique({ where: { phone } });

  /**
   * **والمقارنة تجري ولو لم يوجد الحساب** — وإلّا فرّق زمنُ الردّ بين
   * رقمٍ مسجَّل وغيره، فأغنى عن الرسالة التي حُجبت.
   */
  const matched = await verifyPassword(parsed.data.password, user?.passwordHash ?? '');
  if (user === null || !matched) return fail(ERRORS.OTP_INVALID, 401);

  if (user.status !== 'ACTIVE') return fail(ERRORS.ACCOUNT_BLOCKED, 403);

  const token = await signSession({ userId: user.id });
  const response = ok({
    token,
    user: toPublicUser(user),
    isNew: false,
    completion: profileCompletion(user),
  });

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !isDevelopment,
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });

  return response;
}
