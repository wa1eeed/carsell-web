import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { approveInspection, returnInspection } from '@/lib/domain/inspection-review';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/admin/inspections/{id}/review` — يُعيد أو يعتمد.
 *
 * **والنشرُ على الإعلان ليس قرارَ المراجع**: يتبع قرار المالك ٤ في
 * `publishOnIssue` — تقريرُ البائع عامّ، وتقريرُ المشتري خاصٌّ به.
 */
const Body = z.union([
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('return'), note: z.string().min(10).max(1000) }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, 'serviceRequests.handle');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ review: 'INVALID' }), 422);

  const { id } = await params;
  const result =
    parsed.data.action === 'approve'
      ? await approveInspection({ draftId: id, adminId: guard.admin.id, ip: guard.ip })
      : await returnInspection({
          draftId: id,
          adminId: guard.admin.id,
          note: parsed.data.note,
          ip: guard.ip,
        });

  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(ERRORS.VALIDATION({ review: result.reason }), 422);
  }

  return ok(
    'reportRef' in result
      ? { reportRef: result.reportRef, published: result.published }
      : { returned: true },
  );
}
