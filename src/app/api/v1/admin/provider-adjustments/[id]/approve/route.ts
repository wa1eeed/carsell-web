import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { approveProviderAdjustment } from '@/lib/domain/provider-ledger';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/admin/provider-adjustments/{id}/approve` — الموافقة الثانية.
 *
 * **وطالبُه لا يوافق على نفسه** — يُفحص في النطاق لا هنا، فالحارس
 * يبقى واحدًا حيث يقع الأثر.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, 'providers.adjust');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const result = await approveProviderAdjustment({
    requestId: id,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) {
    if (result.reason === 'REQUEST_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(ERRORS.VALIDATION({ approval: result.reason }), 422);
  }

  return ok({ balance: result.balance });
}
