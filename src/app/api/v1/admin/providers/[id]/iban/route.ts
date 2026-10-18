import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { setProviderIban } from '@/lib/domain/provider-payouts';

export const runtime = 'nodejs';

/**
 * `PUT /api/v1/admin/providers/{id}/iban` — حسابُ المزوّد البنكيّ.
 *
 * **ومسارٌ مفرد لا حقلٌ في استمارة التعديل**: العمود مشفَّر فلا يُقرأ
 * إلى الشاشة، واستمارةٌ تحفظ كل حقولها كانت ستُرسله فارغًا فتمحوه
 * بالسهو. والكتابةُ وحدها تعبر، والقراءةُ آخرُ أربعٍ.
 *
 * **وصلاحيتُه `payouts.send`** لا `services.manage`: من يبدّل وجهة
 * المال يبدّل المال. ومحرّرُ بياناتِ مزوّدٍ ليس بالضرورة من يصرف له.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, 'payouts.send');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body: unknown = await request.json().catch(() => null);
  const iban =
    body !== null && typeof body === 'object' && typeof (body as { iban?: unknown }).iban === 'string'
      ? (body as { iban: string }).iban
      : '';

  const result = await setProviderIban({
    providerId: id,
    iban,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) {
    if (result.reason === 'PROVIDER_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(ERRORS.VALIDATION({ iban: result.reason }), 422);
  }

  return ok({ ibanLast4: result.last4 });
}
