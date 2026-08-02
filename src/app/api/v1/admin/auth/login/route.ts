import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { loginWithPassword } from '@/lib/domain/admin-auth';

export const runtime = 'nodejs';

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

/** الخطوة الأولى — لا تُصدر جلسة، فـTOTP إلزامي بعدها. */
export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.ADMIN_INVALID_CREDENTIALS, 401);

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const result = await loginWithPassword(parsed.data.email, parsed.data.password, ip);

  if (!result.ok) {
    if (result.reason === 'LOCKED') return fail(ERRORS.ADMIN_LOCKED, 423);
    if (result.reason === 'INACTIVE') return fail(ERRORS.ADMIN_INACTIVE, 403);
    return fail(ERRORS.ADMIN_INVALID_CREDENTIALS, 401);
  }

  return ok({ stage: result.stage, adminUserId: result.adminUserId, enrolled: result.enrolled });
}
