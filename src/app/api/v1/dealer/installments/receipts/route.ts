import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentDealer } from '@/lib/auth/dealer-session';
import { DEALER_MODULE, dealerHasModule } from '@/lib/domain/dealer-modules';
import { recordReceipt } from '@/lib/domain/installments';
import { InstallmentMethod } from '@/generated/prisma/enums';

export const runtime = 'nodejs';

const Body = z.object({
  planId: z.string().min(1),
  /** **والقسطُ يُسمّى** — ومبلغٌ بلا قسطٍ يحمله يجعل «الباقي» بلا سند. */
  dueId: z.string().min(1),
  amount: z.number().positive(),
  method: z.nativeEnum(InstallmentMethod),
  note: z.string().max(200).nullable().optional(),
});

const MESSAGES: Record<string, { ar: string; en: string; status: number }> = {
  PLAN_NOT_FOUND: { ar: 'العقد ليس من عقود معرضك.', en: 'Not your contract.', status: 404 },
  DUE_NOT_FOUND: { ar: 'القسط ليس من هذا العقد.', en: 'That instalment is not on this contract.', status: 404 },
  OVERPAID: {
    ar: 'المبلغ أكثر من الباقي على هذا القسط — سجل الزائد على القسط التالي بسند آخر.',
    en: 'More than this instalment’s balance — record the excess against the next one.',
    status: 422,
  },
  INVALID: { ar: 'مبلغ غير صالح.', en: 'Invalid amount.', status: 422 },
};

/** `POST /api/v1/dealer/installments/receipts` — سندُ قبضٍ على قسط. */
export async function POST(request: NextRequest) {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);
  if (!(await dealerHasModule(actor, DEALER_MODULE.installments))) {
    return fail(ERRORS.FORBIDDEN, 403);
  }
  if (actor.role === 'SALES') return fail(ERRORS.FORBIDDEN, 403);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  const result = await recordReceipt(
    { userId: actor.userId, dealerId: actor.dealerId },
    {
      planId: parsed.data.planId,
      dueId: parsed.data.dueId,
      amount: parsed.data.amount,
      method: parsed.data.method,
      /** **ووقتُ القبض وقتُ التسجيل** — ومن قبض أمس يكتبه في الملاحظة. */
      receivedAt: new Date(),
      note: parsed.data.note ?? null,
    },
  );

  if (!result.ok) {
    const text = MESSAGES[result.reason];
    return fail(
      {
        code: result.reason,
        messageAr: text?.ar ?? 'تعذر تسجيل السند.',
        messageEn: text?.en ?? 'Could not record the receipt.',
      },
      text?.status ?? 422,
    );
  }

  return ok(result);
}
