import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { addDisputeMessage, openDispute } from '@/lib/domain/disputes';

export const runtime = 'nodejs';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('open'), reason: z.string().min(20).max(2000) }),
  z.object({ action: z.literal('message'), disputeId: z.string().min(1).max(60), body: z.string().min(1).max(2000) }),
]);

const MESSAGES: Record<string, { ar: string; en: string }> = {
  NOT_BUYER: {
    ar: 'المشتري وحده يفتح نزاعًا على الطلب.',
    en: 'Only the buyer can open a dispute on an order.',
  },
  ALREADY_OPEN: { ar: 'على هذا الطلب نزاعٌ مفتوح.', en: 'This order already has an open dispute.' },
  ORDER_CLOSED: { ar: 'الطلب مغلق.', en: 'This order is closed.' },
  BEFORE_PAYMENT: {
    ar: 'لا نزاع قبل الدفع — ألغِ الطلب بدلًا من ذلك.',
    en: 'No dispute before payment — cancel the order instead.',
  },
};

/**
 * `POST /api/v1/orders/{ref}/disputes` — فتح نزاع أو إضافة رسالة.
 *
 * **والنزاع كان مبنيًّا بلا باب.** `openDispute` و`addDisputeMessage`
 * و`proposeResolution` و`approveResolution` كلّها مبنيّة ومختبَرة، ولا
 * مسار ولا زرّ في المنتج كلّه — وشاشة الطلب تعرض النزاع إن وُجد ولا
 * سبيل لفتحه.
 *
 * فالمشتري الذي استلم مركبةً بعيبٍ جوهريّ يجد الشاشة تحدّثه عن النزاع
 * ولا تعطيه بابًا إليه.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ reason: 'TOO_SHORT' }), 422);

  const { ref } = await params;

  if (parsed.data.action === 'message') {
    const result = await addDisputeMessage({
      disputeId: parsed.data.disputeId,
      authorId: user.id,
      body: parsed.data.body,
    });
    if (!result.ok) return fail(ERRORS.FORBIDDEN, 403);
    return ok(result, undefined, { status: 201 });
  }

  const result = await openDispute({
    orderRef: ref,
    openedBy: user.id,
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    if (result.reason === 'ORDER_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    const text = MESSAGES[result.reason];
    return fail(
      {
        code: result.reason,
        messageAr: text?.ar ?? 'تعذّر فتح النزاع.',
        messageEn: text?.en ?? 'Could not open the dispute.',
      },
      result.reason === 'NOT_BUYER' ? 403 : 409,
    );
  }

  return ok(result, undefined, { status: 201 });
}
