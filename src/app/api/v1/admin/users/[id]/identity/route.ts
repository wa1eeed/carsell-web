import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { identityAccessLog, viewIdentity } from '@/lib/domain/admin-orders';

export const runtime = 'nodejs';

/**
 * `POST` لا `GET` — **الكشف فعلٌ لا قراءة**.
 *
 * `GET` يُخزَّن في سجلّ المتصفّح ويُعاد بالرجوع ويُستدعى مسبقًا، فيقع
 * الاطّلاع بلا قصد ويُسجَّل مرارًا بلا سبب. و`POST` بجسمٍ يحمل السبب
 * يجعل كل اطّلاع مقصودًا ومعلَّلًا.
 */
const Body = z.object({ reason: z.string().min(10).max(500) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request, 'users.viewIdentity');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ reason: 'REQUIRED' }), 422);

  const { id } = await params;
  const identity = await viewIdentity(guard.admin, id, guard.ip, parsed.data.reason);
  if (identity === null) return fail(ERRORS.NOT_FOUND, 404);

  const accessLog = await identityAccessLog(id);

  return ok({
    identity,
    accessLog: accessLog.map((entry) => ({
      actorId: entry.actorId,
      createdAt: entry.createdAt.toISOString(),
      reason:
        typeof entry.after === 'object' && entry.after !== null
          ? ((entry.after as { reason?: string }).reason ?? null)
          : null,
    })),
  });
}
