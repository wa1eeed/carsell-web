import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { saveSearch } from '@/lib/domain/saved-search';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/me/searches` — يحفظ البحث الحالي.
 *
 * **والجسد هو سلسلة الرابط** لا كائن فلاتر: فما يُحفظ هو ما يُفتح،
 * حرفًا بحرف. وكائنٌ وسيط كان سيحتاج مُسلسِلًا ثانيًا يتباعد عن
 * الأوّل أوّل حقلٍ يُضاف.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const body: unknown = await request.json().catch(() => null);
  const input = (body ?? {}) as { query?: unknown; name?: unknown; notify?: unknown };
  if (typeof input.query !== 'string') return fail(ERRORS.VALIDATION({ query: 'REQUIRED' }), 422);

  const result = await saveSearch(user.id, {
    query: input.query,
    name: typeof input.name === 'string' ? input.name : null,
    notify: input.notify !== false,
  });

  if (!result.ok) return fail(ERRORS.VALIDATION({ search: result.reason }), 422);
  return ok({ id: result.id });
}
