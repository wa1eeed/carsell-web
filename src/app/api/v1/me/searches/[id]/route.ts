import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { markSeen, removeSearch, setNotify } from '@/lib/domain/saved-search';

export const runtime = 'nodejs';

/** `DELETE /api/v1/me/searches/{id}` */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const { id } = await params;
  // والحذف بـ`userId` معًا — فلا يحذف أحدٌ بحث غيره بمعرّفٍ مُخمَّن
  return (await removeSearch(user.id, id)) ? ok({ removed: true }) : fail(ERRORS.NOT_FOUND, 404);
}

/** `PATCH` — تبديل التنبيه، أو ختمُ «رأيتُه». */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const { id } = await params;
  const body: unknown = await request.json().catch(() => null);
  const input = (body ?? {}) as { notify?: unknown; seen?: unknown };

  if (input.seen === true) {
    await markSeen(user.id, id);
    return ok({ seen: true });
  }
  if (typeof input.notify !== 'boolean') return fail(ERRORS.VALIDATION({ notify: 'REQUIRED' }), 422);

  return (await setNotify(user.id, id, input.notify))
    ? ok({ notify: input.notify })
    : fail(ERRORS.NOT_FOUND, 404);
}
