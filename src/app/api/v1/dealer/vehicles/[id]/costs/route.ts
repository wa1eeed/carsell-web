import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentDealer } from '@/lib/auth/dealer-session';
import { db } from '@/lib/db';
import { costBook, recordCost } from '@/lib/domain/vehicle-costs';

export const runtime = 'nodejs';

const Body = z.object({
  kind: z.enum(['PURCHASE', 'TRANSPORT', 'INSPECTION', 'MAINTENANCE', 'DETAILING', 'CUSTOMS', 'OTHER']),
  amount: z.number().int().positive().max(100_000_000),
  note: z.string().max(200).optional(),
  incurredAt: z.string().datetime().optional(),
});

const MESSAGES: Record<string, string> = {
  PURCHASE_EXISTS: 'لهذه المركبة سعر شراء مسجل. احذف السطر القديم قبل تسجيل غيره.',
  AMOUNT_INVALID: 'المبلغ غير صالح.',
  VEHICLE_NOT_FOUND: 'لم تعد هذه المركبة موجودة.',
};

/**
 * ═══ كلفةُ المركبة — مُدخَلُ محاسبة المعرض ═══
 *
 * **والملكيّةُ تُفحص في الخادم لا في الشاشة**: اللوحة لا تعرض إلا
 * مركباتِ المعرض، والنداءُ المباشر بمعرّفِ مركبةِ معرضٍ آخر يكشف
 * كلفتَه — وهي أخصُّ أرقامه.
 *
 * **والمبيعاتُ يسجّل في فرعه وحده** (مصفوفة `D9`): بائعُ فرعٍ يسجّل
 * كلفةَ مركبةٍ في فرعٍ آخر يفسد حسابَ ذاك الفرع.
 */
async function reachable(dealerId: string, branchId: string | null, vehicleId: string) {
  return db.vehicle.findFirst({
    where: { id: vehicleId, dealerId, ...(branchId === null ? {} : { branchId }) },
    select: { id: true },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const { id } = await params;
  if ((await reachable(actor.dealerId, actor.branchId, id)) === null) {
    return fail(ERRORS.NOT_FOUND, 404);
  }
  return ok(await costBook(id));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);
  /** والمحاسبُ يرى المخزونَ قراءةً — فلا يكتب كلفة (مصفوفة `D9`). */
  if (actor.role === 'ACCOUNTANT') return fail(ERRORS.FORBIDDEN, 403);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ amount: 'INVALID' }), 422);

  const { id } = await params;
  if ((await reachable(actor.dealerId, actor.branchId, id)) === null) {
    return fail(ERRORS.NOT_FOUND, 404);
  }

  const result = await recordCost({
    vehicleId: id,
    kind: parsed.data.kind,
    amount: parsed.data.amount,
    note: parsed.data.note ?? null,
    incurredAt: parsed.data.incurredAt === undefined ? undefined : new Date(parsed.data.incurredAt),
    recordedById: actor.userId,
  });

  if (!result.ok) {
    return fail(
      { code: result.reason, messageAr: MESSAGES[result.reason] ?? 'تعذر التسجيل.', messageEn: 'Could not record the cost.' },
      result.reason === 'VEHICLE_NOT_FOUND' ? 404 : 409,
    );
  }
  return ok(await costBook(id), undefined, { status: 201 });
}
