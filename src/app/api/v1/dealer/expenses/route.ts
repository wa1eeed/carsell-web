import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentDealer } from '@/lib/auth/dealer-session';
import { addDealerExpense, removeDealerExpense } from '@/lib/domain/dealer-expenses';
import { DealerExpenseKind } from '@/generated/prisma/enums';

export const runtime = 'nodejs';

const Body = z.object({
  kind: z.nativeEnum(DealerExpenseKind),
  amount: z.number().positive(),
  /** `YYYY-MM-DD` — تاريخُ الصرف لا تاريخُ الإدخال. */
  spentAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: z.string().nullable().optional(),
  note: z.string().max(200).nullable().optional(),
});

/**
 * `POST /api/v1/dealer/expenses` — يسجّل مصروفًا على المعرض.
 *
 * **والمحاسبُ يُدخل هنا** بخلاف المخزون: هذا عملُه، ومن حصره بالمالك
 * جعل الدفترَ يُملأ في آخر الشهر بالذاكرة.
 */
export async function POST(request: NextRequest) {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);
  if (actor.role === 'SALES') return fail(ERRORS.FORBIDDEN, 403);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  const result = await addDealerExpense(
    { userId: actor.userId, dealerId: actor.dealerId },
    {
      kind: parsed.data.kind,
      amount: parsed.data.amount,
      /** **وظهرُ اليوم بتوقيت الرياض** — فمصروفُ اليوم لا يقع في أمس. */
      spentAt: new Date(`${parsed.data.spentAt}T12:00:00.000+03:00`),
      branchId: actor.branchId ?? parsed.data.branchId ?? null,
      note: parsed.data.note ?? null,
    },
  );

  if (!result.ok) {
    if (result.reason === 'VALIDATION') return fail(ERRORS.VALIDATION(result.fields), 422);
    return fail(
      {
        code: result.reason,
        messageAr: 'الفرع ليس من فروع معرضك.',
        messageEn: 'That branch is not yours.',
      },
      422,
    );
  }

  return ok({ id: result.id });
}

/** `DELETE /api/v1/dealer/expenses?id=…` — يحذف صفًّا أُدخل خطأً. */
export async function DELETE(request: NextRequest) {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);
  if (actor.role === 'SALES') return fail(ERRORS.FORBIDDEN, 403);

  const id = request.nextUrl.searchParams.get('id');
  if (id === null || id === '') return fail(ERRORS.VALIDATION({ id: 'REQUIRED' }), 422);

  const gone = await removeDealerExpense({ dealerId: actor.dealerId }, id);
  if (!gone) return fail(ERRORS.NOT_FOUND, 404);
  return ok({ removed: true });
}
