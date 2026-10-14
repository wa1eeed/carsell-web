import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { loginProvider, PROVIDER_SESSION_HOURS } from '@/lib/domain/provider-auth';
import { PROVIDER_COOKIE, providerCookieOptions } from '@/lib/auth/provider-session';

export const runtime = 'nodejs';

const Body = z.object({
  email: z.string().min(3).max(254),
  password: z.string().min(1).max(200),
});

/**
 * `POST /api/v1/provider/auth/login` — دخول المزوّد.
 *
 * **ورسالةٌ واحدة لكل فشل**: «البريد أو كلمة المرور غير صحيحة» — فردٌّ
 * يفرّق بينهما يقول للمحاوِل أيَّ بريدٍ مسجَّل عندنا.
 */
export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  const result = await loginProvider({
    email: parsed.data.email,
    password: parsed.data.password,
    ip: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
  });

  if (!result.ok) {
    return fail(
      {
        code: result.reason,
        messageAr:
          result.reason === 'INACTIVE'
            ? 'هذا الحساب موقوف — راجع إدارة المنصّة.'
            : 'البريد أو كلمة المرور غير صحيحة.',
        messageEn:
          result.reason === 'INACTIVE'
            ? 'This account is suspended — contact the platform.'
            : 'Email or password is incorrect.',
      },
      result.reason === 'INACTIVE' ? 403 : 401,
    );
  }

  const response = ok({
    name: result.user.name,
    mustChangePassword: result.mustChangePassword,
  });
  response.cookies.set(
    PROVIDER_COOKIE,
    result.token,
    providerCookieOptions(PROVIDER_SESSION_HOURS * 3600),
  );
  return response;
}
