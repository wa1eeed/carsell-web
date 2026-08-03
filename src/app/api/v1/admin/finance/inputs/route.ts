import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { setFinanceInput } from '@/lib/domain/admin-finance';

export const runtime = 'nodejs';

const Body = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  key: z.string().max(40),
  value: z.number().min(0).max(1_000_000_000),
  note: z.string().max(300).optional(),
});

/**
 * `PUT /api/v1/admin/finance/inputs` — مدخل محاسبيّ واحد لشهر واحد.
 *
 * `PUT` لا `POST`: المفتاح `(الشهر، البند)` والقيمة تحلّ محلّ سابقتها.
 * وإعادة الطلب نفسه لا تُنتج صفًّا ثانيًا ولا قيدًا ثانيًا.
 */
export async function PUT(request: NextRequest) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ value: 'INVALID' }), 422);

  const result = await setFinanceInput(guard.admin, parsed.data, guard.ip);
  if (!result.ok) {
    return fail(ERRORS.VALIDATION({ key: result.reason }), 422);
  }

  return ok({ saved: true });
}
