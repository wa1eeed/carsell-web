import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { MIN_DEALER_NOTE, decideDealer } from '@/lib/domain/admin-dealers';
import { toArabicDigits } from '@/lib/arabic';

export const runtime = 'nodejs';

const Body = z.object({
  decision: z.enum(['VERIFY', 'SUSPEND', 'REINSTATE']),
  note: z.string().max(2000).nullable().optional(),
});

const STATUS: Record<string, number> = {
  DEALER_NOT_FOUND: 404,
  CR_REQUIRED: 422,
  NOTE_REQUIRED: 422,
  ALREADY: 409,
};

const MESSAGE: Record<string, string> = {
  DEALER_NOT_FOUND: 'لا معرض بهذا المعرّف.',
  CR_REQUIRED: 'لا شارة بلا سجل تجاريّ — الشارة تقول إن المنشأة مسجَّلة.',
  NOTE_REQUIRED: `الملاحظة أقصر من الحدّ (${toArabicDigits(String(MIN_DEALER_NOTE))}).`,
  ALREADY: 'المعرض موثّق ونشط سلفًا.',
};

/** `POST /api/v1/admin/dealers/{id}` — توثيق أو إيقاف (A26). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request, 'users.view');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ decision: 'INVALID' }), 422);

  const result = await decideDealer({
    dealerId: id,
    decision: parsed.data.decision,
    note: parsed.data.note ?? null,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) {
    return fail(
      {
        code: result.reason,
        messageAr: MESSAGE[result.reason] ?? 'تعذّر تنفيذ القرار.',
        messageEn: 'Could not apply the dealer decision.',
      },
      STATUS[result.reason] ?? 409,
    );
  }

  return ok({ status: result.status, verified: result.verified });
}
