import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentDealer } from '@/lib/auth/dealer-session';
import { createBranch, dealerBranches, setBranchActive } from '@/lib/domain/dealer-branches';

export const runtime = 'nodejs';

const Create = z.object({
  name: z.string().min(1).max(60),
  city: z.string().min(1).max(40),
  address: z.string().max(140).optional(),
  phone: z.string().max(24).optional(),
});
const Toggle = z.object({ branchId: z.string().min(1), active: z.boolean() });

const MESSAGES: Record<string, string> = {
  NAME_REQUIRED: 'اكتب اسم الفرع.',
  CITY_REQUIRED: 'اختر مدينة الفرع.',
  NOT_FOUND: 'لم يعد هذا الفرع موجودا.',
  HAS_VEHICLES: 'في هذا الفرع مركبات — انقلها إلى فرع آخر قبل تعطيله، وإلا اختفت من كل مرشح.',
};

/** **والفروعُ للمالك والمدير** — ومصفوفةُ `D9` تضع «الفريق» عندهما. */
function may(role: string): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

export async function GET() {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);
  return ok(await dealerBranches(actor.dealerId));
}

export async function POST(request: NextRequest) {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);
  if (!may(actor.role)) return fail(ERRORS.FORBIDDEN, 403);

  const parsed = Create.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ name: 'REQUIRED' }), 422);

  const result = await createBranch({ dealerId: actor.dealerId, ...parsed.data });
  if (!result.ok) {
    return fail({ code: result.reason, messageAr: MESSAGES[result.reason] ?? 'تعذر الإنشاء.', messageEn: 'Could not create the branch.' }, 409);
  }
  return ok(await dealerBranches(actor.dealerId), undefined, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);
  if (!may(actor.role)) return fail(ERRORS.FORBIDDEN, 403);

  const parsed = Toggle.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ branchId: 'REQUIRED' }), 422);

  const result = await setBranchActive({ dealerId: actor.dealerId, ...parsed.data });
  if (!result.ok) {
    return fail({ code: result.reason, messageAr: MESSAGES[result.reason] ?? 'تعذر التعديل.', messageEn: 'Could not update the branch.' }, result.reason === 'NOT_FOUND' ? 404 : 409);
  }
  return ok(await dealerBranches(actor.dealerId));
}
