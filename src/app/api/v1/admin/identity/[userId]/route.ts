import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { decideIdentity } from '@/lib/domain/admin-identity';
import { MIN_IDENTITY_NOTE } from '@/lib/domain/identity-rules';
import { toArabicDigits } from '@/lib/arabic';

export const runtime = 'nodejs';

const Body = z.object({
  decision: z.enum(['VERIFY', 'CLARIFY', 'REJECT']),
  note: z.string().max(2000).nullable().optional(),
});

const STATUS: Record<string, number> = {
  USER_NOT_FOUND: 404,
  NOT_IN_QUEUE: 409,
  NOTE_REQUIRED: 422,
};

const MESSAGE: Record<string, string> = {
  USER_NOT_FOUND: 'لا حساب بهذا المعرّف.',
  NOT_IN_QUEUE: 'الحساب لم يعد في الطابور — راجعه غيرك.',
  NOTE_REQUIRED: `الملاحظة أقصر من الحدّ (${toArabicDigits(String(MIN_IDENTITY_NOTE))}) — صاحبها يقرؤها ليُصلح.`,
};

/**
 * `POST /api/v1/admin/identity/{userId}` — قرار التوثيق (A18).
 *
 * و`identity.review` لا `users.viewIdentity`: **القرار غير الاطّلاع**.
 * من يوثّق يقرأ الاسم والطريقة، ومن يكشف الرقم يفعلها بمسارٍ آخر
 * بسببٍ مكتوب — فلا يمرّ الكشف عرَضًا مع كل قرار.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const guard = await requireAdmin(request, 'identity.review');
  if (!guard.ok) return guard.response;

  const { userId } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ decision: 'INVALID' }), 422);

  const result = await decideIdentity({
    userId,
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
        messageEn: 'Could not apply the identity decision.',
      },
      STATUS[result.reason] ?? 409,
    );
  }

  return ok({ status: result.status });
}
