import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { submitProviderAccount } from '@/lib/domain/provider-account';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/admin/providers/{id}/account/submit` — تقديمُ الحساب للمراجعة.
 *
 * ولا يُعرض الزرّ إلّا حين تقول البوّابة إن المستندات اكتملت: تقديمٌ
 * ناقص يُرفض، ويُقرأ الرفضُ عطلًا.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, 'services.manage');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const result = await submitProviderAccount(guard.admin, id, guard.ip);
  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(ERRORS.VALIDATION({ account: result.reason }), 422);
  }

  return ok({ status: result.state.status, note: result.state.note });
}
