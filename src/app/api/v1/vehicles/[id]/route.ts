import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { editVehicle, removeVehicle } from '@/lib/domain/garage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ═══ `PATCH` و`DELETE /api/v1/vehicles/[id]` ═══
 *
 * **والملكية تُفحص في النطاق لا هنا**: `editVehicle` يشترطها داخل
 * الاستعلام نفسه، فلا نافذةَ بين فحصٍ وكتابة. والمسار يمرّر `userId`
 * ولا يُقرّر.
 */
const Body = z.object({
  mileageKm: z.number().int().min(0).max(2_000_000),
  colorExterior: z.string().min(1).max(40),
  city: z.string().min(1).max(60),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ mileageKm: 'INVALID' }), 422);

  const result = await editVehicle({ userId: user.id, vehicleId: id, ...parsed.data });
  if (!result.ok) {
    return result.reason === 'NOT_YOURS'
      ? fail(ERRORS.NOT_FOUND, 404)
      : fail(ERRORS.VALIDATION({ mileageKm: 'INVALID' }), 422);
  }

  return ok({ id });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const { id } = await params;
  const result = await removeVehicle({ userId: user.id, vehicleId: id });

  if (!result.ok) {
    /**
     * **والسبب يُسمَّى**: «لا يمكن الحذف» وحدها تترك صاحبها يحاول مرّة
     * بعد مرّة. فالمعروضة تُسحب من العرض أوّلًا، والمفحوصة لها تقريرٌ
     * يقرؤه غيرُه.
     */
    return result.reason === 'NOT_YOURS'
      ? fail(ERRORS.NOT_FOUND, 404)
      : fail(ERRORS.VALIDATION({ vehicle: result.reason }), 409);
  }

  return ok({ id });
}
