import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { proposeResolution } from '@/lib/domain/disputes';

export const runtime = 'nodejs';

const Body = z.object({
  resolution: z.enum(['FULL_REFUND', 'PARTIAL_SETTLEMENT', 'RELEASE_TO_SELLER']),
  /** للتسوية الجزئية وحدها — والنطاق يرفض ما يساوي الكلّ أو يتجاوزه */
  amount: z.number().int().min(1).max(100_000_000).optional(),
});

/**
 * `POST /api/v1/admin/disputes/{id}/propose` — **اقتراح** قرار.
 *
 * ولا يُنفَّذ هنا: يُنشأ طلب موافقةٍ بعضوين، والتنفيذ يقع حين تكتمل.
 * وفصلُ الاقتراح عن التنفيذ هو ما يجعل «عضوين» شرطًا حقيقيًّا — ولو
 * نفّذ المقترِح ثم طُلبت الموافقة لصارت الموافقة توثيقًا لما وقع.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // القرار يحرّك مال الضمان — فحارسه حارس الإفراج نفسه
  const guard = await requireAdmin(request, 'escrow.release');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ resolution: 'INVALID' }), 422);

  const { id } = await params;
  const result = await proposeResolution({
    disputeId: id,
    adminId: guard.admin.id,
    resolution: parsed.data.resolution,
    ...(parsed.data.amount === undefined ? {} : { amount: parsed.data.amount }),
  });

  if (!result.ok) {
    if (result.reason === 'DISPUTE_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(
      {
        code: result.reason,
        messageAr:
          result.reason === 'NOT_OPEN'
            ? 'النزاع لم يعد مفتوحًا.'
            : result.reason === 'AMOUNT_REQUIRED'
              ? 'التسوية الجزئية تحتاج مبلغًا.'
              : 'المبلغ لا يصلح تسويةً جزئية — لا يساوي الإجمالي ولا يتجاوزه.',
        messageEn:
          result.reason === 'NOT_OPEN'
            ? 'This dispute is no longer open.'
            : result.reason === 'AMOUNT_REQUIRED'
              ? 'A partial settlement needs an amount.'
              : 'The amount cannot equal or exceed the order total.',
      },
      result.reason === 'NOT_OPEN' ? 409 : 422,
    );
  }

  return ok(result);
}
