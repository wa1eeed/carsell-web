import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { listDeadlines, setDeadline } from '@/lib/domain/deadlines';

export const runtime = 'nodejs';

const Body = z.object({
  key: z.string().min(1).max(60),
  value: z.number().int().min(0).max(100_000),
});

/**
 * `PUT /api/v1/admin/deadlines` — تعديل مهلة واحدة.
 *
 * **مهلةً مهلة لا استمارةً واحدة**: من عدّل مهلة الدفع لا يُعاد إليه
 * خطأٌ لأن مهلة النقل خارج حدودها.
 */
export async function PUT(request: NextRequest) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ value: 'INVALID' }), 422);

  const result = await setDeadline({
    key: parsed.data.key,
    value: parsed.data.value,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) {
    return fail(
      {
        code: result.reason,
        messageAr:
          result.reason === 'UNKNOWN_KEY'
            ? 'مهلة غير معروفة.'
            : 'القيمة خارج الحدّ المسموح.',
        messageEn:
          result.reason === 'UNKNOWN_KEY'
            ? 'Unknown deadline key.'
            : 'The value is outside the allowed range.',
      },
      422,
    );
  }

  return ok({ deadlines: await listDeadlines() });
}
