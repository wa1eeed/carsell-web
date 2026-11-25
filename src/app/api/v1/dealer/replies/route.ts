import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentDealer } from '@/lib/auth/dealer-session';
import { createReply, dealerReplies, removeReply } from '@/lib/domain/dealer-replies';

export const runtime = 'nodejs';

const Create = z.object({ body: z.string().min(1).max(1000) });
const Remove = z.object({ id: z.string().min(1) });

const MESSAGES: Record<string, string> = {
  TOO_SHORT: 'الرد قصير جدا — اكتب جملة مفيدة.',
  TOO_LONG: 'الرد طويل — اختصره دون أربع مئة حرف.',
  UNKNOWN_VARIABLE: 'متغير غير معروف — المتاح {price} و{branch} و{score}.',
  NOT_FOUND: 'لم يعد هذا الرد موجودا.',
};

/** **والردودُ لمن يفاوض** — المالك والمدير والمبيعات (مصفوفة `D9`). */
function may(role: string): boolean {
  return role === 'OWNER' || role === 'MANAGER' || role === 'SALES';
}

export async function GET() {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);
  if (!may(actor.role)) return fail(ERRORS.FORBIDDEN, 403);
  return ok(await dealerReplies(actor.dealerId));
}

export async function POST(request: NextRequest) {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);
  if (!may(actor.role)) return fail(ERRORS.FORBIDDEN, 403);

  const parsed = Create.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'REQUIRED' }), 422);

  const result = await createReply({
    dealerId: actor.dealerId,
    body: parsed.data.body,
    actorId: actor.userId,
  });

  if (!result.ok) {
    return fail(
      { code: result.reason, messageAr: MESSAGES[result.reason] ?? '', messageEn: result.reason },
      422,
    );
  }
  return ok({ id: result.id });
}

export async function DELETE(request: NextRequest) {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);
  if (!may(actor.role)) return fail(ERRORS.FORBIDDEN, 403);

  const parsed = Remove.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ id: 'REQUIRED' }), 422);

  const result = await removeReply(actor.dealerId, parsed.data.id);
  if (!result.ok) {
    return fail(
      { code: result.reason, messageAr: MESSAGES[result.reason] ?? '', messageEn: result.reason },
      404,
    );
  }
  return ok({ removed: true });
}
