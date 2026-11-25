import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentDealer } from '@/lib/auth/dealer-session';
import { dealerTeam, inviteMember, revokeInvite } from '@/lib/domain/dealer-team';

export const runtime = 'nodejs';

const Invite = z.object({
  phone: z.string().min(9).max(20),
  role: z.enum(['MANAGER', 'SALES', 'ACCOUNTANT']),
  branchId: z.string().min(1).nullable().optional(),
});
const Revoke = z.object({ inviteId: z.string().min(1) });

const MESSAGES: Record<string, string> = {
  PHONE_INVALID: 'رقم الجوال غير صالح.',
  ALREADY_MEMBER: 'هذا الرقم عضو في فريقك بالفعل.',
  ALREADY_INVITED: 'له دعوة معلقة — اسحبها أو انتظر قبوله.',
  NO_SEATS: 'استنفدت مقاعد باقتك. ارفع الباقة أو اسحب دعوة معلقة.',
  OWNER_NOT_INVITABLE: 'الملكية تنتقل ولا تمنح بدعوة.',
  BRANCH_NOT_FOUND: 'لم يعد هذا الفرع موجودا أو أنه معطل.',
  SALES_NEEDS_BRANCH: 'اختر فرع البائع — وبلا فرع يرى مخزون المعرض كله.',
  NOT_FOUND: 'لم تعد هذه الدعوة موجودة.',
};

/** **والفريقُ للمالك والمدير** — ومصفوفةُ `D9` تضع «الفريق: تعديل» عندهما. */
function may(role: string): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

export async function GET() {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);
  if (!may(actor.role)) return fail(ERRORS.FORBIDDEN, 403);
  return ok(await dealerTeam(actor.dealerId));
}

export async function POST(request: NextRequest) {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);
  if (!may(actor.role)) return fail(ERRORS.FORBIDDEN, 403);

  const parsed = Invite.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ phone: 'INVALID' }), 422);

  const result = await inviteMember({
    dealerId: actor.dealerId,
    phone: parsed.data.phone,
    role: parsed.data.role,
    branchId: parsed.data.branchId ?? null,
    invitedById: actor.userId,
  });
  if (!result.ok) {
    return fail(
      { code: result.reason, messageAr: MESSAGES[result.reason] ?? 'تعذرت الدعوة.', messageEn: 'Could not invite.' },
      result.reason === 'NO_SEATS' ? 402 : 409,
    );
  }
  return ok(await dealerTeam(actor.dealerId), undefined, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);
  if (!may(actor.role)) return fail(ERRORS.FORBIDDEN, 403);

  const parsed = Revoke.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ inviteId: 'REQUIRED' }), 422);

  const result = await revokeInvite({ dealerId: actor.dealerId, inviteId: parsed.data.inviteId });
  if (!result.ok) {
    return fail({ code: result.reason, messageAr: MESSAGES[result.reason] ?? 'تعذر السحب.', messageEn: 'Could not revoke.' }, 404);
  }
  return ok(await dealerTeam(actor.dealerId));
}
