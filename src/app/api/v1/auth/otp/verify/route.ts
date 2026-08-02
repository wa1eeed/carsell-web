import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { OTP_LENGTH, verifyOtp } from '@/lib/domain/auth';
import { profileCompletion, toPublicUser } from '@/lib/domain/profile';
import { SESSION_COOKIE, SESSION_DAYS, signSession } from '@/lib/auth/token';
import { isDevelopment } from '@/lib/env';
import { toLatinDigits } from '@/lib/arabic';

export const runtime = 'nodejs';

const Body = z.object({
  challengeId: z.string().min(1),
  code: z.string().min(1).max(12),
});

/**
 * `POST /api/v1/auth/otp/verify`
 *
 * أول تحقّق ناجح لرقم جديد يُنشئ الحساب — الدخول والتسجيل خطوة
 * واحدة كما في Wm. ويصدر الرمز في الجسم (للتطبيق) وفي كوكي
 * `HttpOnly` (للويب) معًا.
 */
export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(ERRORS.VALIDATION({ code: 'مطلوب' }), 422);
  }

  // المستخدم قد يكتب الرمز بأرقام عربية-هندية
  const code = toLatinDigits(parsed.data.code).trim();
  if (code.length !== OTP_LENGTH) {
    return fail(ERRORS.OTP_INVALID, 400);
  }

  const result = await verifyOtp(parsed.data.challengeId, code);

  if (!result.ok) {
    switch (result.reason) {
      case 'EXPIRED':
        return fail(ERRORS.OTP_EXPIRED, 410);
      case 'CONSUMED':
        return fail(ERRORS.OTP_CONSUMED, 410);
      case 'ATTEMPTS_EXHAUSTED':
        return fail(ERRORS.OTP_ATTEMPTS_EXHAUSTED, 429);
      case 'BLOCKED':
        return fail(ERRORS.ACCOUNT_BLOCKED, 403);
      default:
        return fail(ERRORS.OTP_INVALID, 400);
    }
  }

  const token = await signSession({ userId: result.user.id });

  const response = ok({
    token,
    user: toPublicUser(result.user),
    isNew: result.isNew,
    completion: profileCompletion(result.user),
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
