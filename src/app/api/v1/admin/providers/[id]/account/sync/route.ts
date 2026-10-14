import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { syncProviderAccount } from '@/lib/domain/provider-account';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/admin/providers/{id}/account/sync` — حالُ الحساب من البوّابة.
 *
 * فالشريك يرفع مستنداته في لوحة البوّابة لا عندنا، وما لم تُقرأ حالُه
 * بقيت صفحتُه تقول «ينتظر مستندًا» بعد أن فعل.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, 'services.manage');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const result = await syncProviderAccount(guard.admin, id, guard.ip);
  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(ERRORS.VALIDATION({ account: result.reason }), 422);
  }

  return ok({
    status: result.state.status,
    note: result.state.note,
    documentsComplete: result.state.documentsComplete,
    requiredDocuments: result.state.requiredDocuments,
  });
}
