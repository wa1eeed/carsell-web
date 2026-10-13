import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { OTP_LENGTH, verifyOtp } from '@/lib/domain/auth';
import { profileCompletion, toPublicUser } from '@/lib/domain/profile';
import { SESSION_COOKIE, SESSION_DAYS, signSession } from '@/lib/auth/token';
import { isDevelopment } from '@/lib/env';
import { toLatinDigits } from '@/lib/arabic';
import { db } from '@/lib/db';
import { completeRegistration } from '@/lib/domain/registration';

export const runtime = 'nodejs';

const Body = z.object({
  challengeId: z.string().min(1),
  code: z.string().min(1).max(12),
  /**
   * ═══ بياناتُ التسجيل — تُطبَّق على الحساب الجديد وحده ═══
   *
   * والهاتف يُوثَّق بالرمز **قبل** أن يُكتب شيء: تسجيلٌ يكتب حسابًا ثمّ
   * يطلب التحقّق يترك صفوفًا لأرقامٍ لا يملكها أحد. فالاستمارة تُملأ
   * أوّلًا وتُحمَل هنا، ولا تُكتب إلّا بعد أن يصحّ الرمز.
   *
   * **ولا تُطبَّق على حسابٍ قائم**: من دخل برمزه لا تُبدَّل كلمتُه ولا
   * نوعُ حسابه بما يُرسَل في طلب دخول.
   */
  registration: z.object({
    accountType: z.enum(['INDIVIDUAL', 'BUSINESS']),
    name: z.string().max(160),
    city: z.string().max(60).nullable().optional(),
    email: z.string().max(254).nullable().optional(),
    password: z.string().max(200),
  }).optional(),
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

  /**
   * **والتسجيل يُطبَّق على الجديد وحده** — ولو فشل تحقّقُه رُدَّ الطلب
   * كلُّه: حسابٌ أُنشئ بلا اسمٍ ولا كلمة يصل «حسابي» على «بلا اسم»،
   * ولا سبيل له إلى الدخول إلّا رمزٌ جديد في كل مرّة.
   */
  if (parsed.data.registration !== undefined && result.isNew) {
    const saved = await completeRegistration(result.user.id, parsed.data.registration);
    if (!saved.ok) {
      return saved.reason === 'VALIDATION'
        ? fail(ERRORS.VALIDATION(saved.fields), 422)
        : fail(ERRORS.VALIDATION({ email: 'TAKEN' }), 422);
    }
  }

  const fresh = await db.user.findUniqueOrThrow({ where: { id: result.user.id } });
  const token = await signSession({ userId: fresh.id });

  const response = ok({
    token,
    user: toPublicUser(fresh),
    isNew: result.isNew,
    completion: profileCompletion(fresh),
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
