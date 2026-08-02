import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requestOtp } from '@/lib/domain/auth';
import { normalizeSaudiPhone } from '@/lib/domain/phone';

export const runtime = 'nodejs';

const Body = z.object({ phone: z.string().min(6).max(24) });

/**
 * `POST /api/v1/auth/otp/request`
 *
 * المسار رقيق عمدًا: تحقّق من الشكل، تطبيع، تفويض إلى `domain/auth`.
 * لا قاعدة عمل هنا — التطبيق سيستدعي نفس الدالة لاحقًا.
 *
 * **لا يكشف وجود الحساب**: الاستجابة واحدة سواء كان الرقم مسجّلًا أم لا.
 */
export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(ERRORS.VALIDATION({ phone: 'مطلوب' }), 422);
  }

  const phone = normalizeSaudiPhone(parsed.data.phone);
  if (phone === null) {
    return fail(ERRORS.VALIDATION({ phone: ERRORS.INVALID_PHONE.messageAr }), 422);
  }

  const result = await requestOtp(phone);

  if (!result.ok) {
    const error =
      result.reason === 'RATE_LIMITED' ? ERRORS.OTP_RATE_LIMITED : ERRORS.OTP_COOLDOWN;
    return fail(error, 429, {
      headers: { 'Retry-After': String(result.retryAfter) },
    });
  }

  return ok({
    challengeId: result.challengeId,
    expiresIn: result.expiresIn,
    ...(result.devCode === undefined ? {} : { devCode: result.devCode }),
  });
}
