import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { approveRuleChange, requestRuleChange } from '@/lib/domain/admin-tax';

export const runtime = 'nodejs';

const Body = z.object({
  taxableBase: z.enum(['FULL_VALUE', 'MARGIN', 'FEE_ONLY', 'OUT_OF_SCOPE']),
  ratePct: z.number().min(0).max(100).nullable(),
  invoiceIssuer: z.enum(['PLATFORM', 'SELLER', 'PLATFORM_ON_BEHALF', 'NONE']),
  active: z.boolean(),
  note: z.string().max(600).nullable(),
});

/**
 * `PATCH /api/v1/admin/tax/rules/{id}` — طلب تعديل قاعدة.
 *
 * **لا يُطبَّق بيدٍ واحدة.** أوّل نداءٍ يفتح طلبًا، والثاني من عضوٍ آخر
 * يُنفّذه — وتفعيلُ صفٍّ ينتظر مذكرةً قد ينقل الضريبة من ١٥٠ إلى
 * ١٥٬٠٠٠ في صفقة واحدة.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ ratePct: 'INVALID' }), 422);

  const { id } = await params;
  const result = await requestRuleChange(guard.admin, id, parsed.data, guard.ip);
  if (!result.ok) {
    return fail(result.reason === 'NOT_FOUND' ? ERRORS.NOT_FOUND : ERRORS.VALIDATION({ ratePct: 'INVALID' }), result.reason === 'NOT_FOUND' ? 404 : 422);
  }

  return ok(result);
}

/** `POST` — الموافقة الثانية. ولا يوافق الطالب على نفسه. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const result = await approveRuleChange(guard.admin, id, guard.ip);
  if (!result.ok) {
    return fail(
      result.reason === 'SELF_APPROVAL' ? ERRORS.FORBIDDEN : ERRORS.NOT_FOUND,
      result.reason === 'SELF_APPROVAL' ? 403 : 404,
    );
  }

  return ok(result);
}
