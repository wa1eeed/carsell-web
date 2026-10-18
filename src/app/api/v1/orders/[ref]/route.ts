import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { advanceStage } from '@/lib/domain/orders';
import { cancelOrder, type CancelFailure } from '@/lib/domain/order-cancel';

export const runtime = 'nodejs';

/**
 * `DONE` وحدها — و`PAYMENT → TRANSFER` يقع تلقائيًّا عند تأكيد الحجز
 * (`applyState`)، فلا يُفتح له مسارٌ يدويّ يسبق المال.
 */
const Body = z.object({ to: z.literal('DONE') });

const MESSAGES: Record<string, { ar: string; en: string }> = {
  NOT_PARTY: { ar: 'لست طرفا في هذا الطلب.', en: 'You are not a party to this order.' },
  INVALID_TRANSITION: {
    ar: 'لا يمكن الانتقال إلى هذه المرحلة الآن.',
    en: 'That stage cannot be entered right now.',
  },
  ORDER_FROZEN: {
    ar: 'الطلب متنازع عليه — مجمد حتى يحسم.',
    en: 'This order is disputed and frozen until resolved.',
  },
  ORDER_CLOSED: { ar: 'الطلب مغلق.', en: 'This order is closed.' },
};

/**
 * `PATCH /api/v1/orders/{ref}` — تقدّم المرحلة.
 *
 * **ولم يكن له وجود.** `advanceStage` مبنيّة ومختبَرة، و`/v1/orders`
 * يقبل الإنشاء وحده — فالطلب يصل إلى «دفع» ثم **لا شيء في المنتج كلّه
 * يحرّكه**. لا نقل ملكية ولا إتمام ولا تسوية ولا مستندات: المنصّة تأخذ
 * المال ولا تُسلّم.
 *
 * ═══ والمراحل الأولى ليست هنا ═══
 *
 * `REQUEST → APPROVED → INSPECTION` مراحلُ ما قبل الدفع، وتُدار من
 * الأدمن. وما يخصّ الطرفين هو ما بعد المال: النقل ثم الإتمام. فالحدّ
 * هنا `TRANSFER` و`DONE` وحدهما، ولا يُترك مفتوحًا لتعداد المراحل كلّه.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ to: 'INVALID' }), 422);

  const { ref } = await params;

  /**
   * ═══ ومَن يؤكّد أيّ مرحلة؟ ═══
   *
   * `advanceStage` تفحص العضوية وحدها، فأيّ طرفٍ يستطيع كل انتقال —
   * **والبائع يستطيع أن يعلن الإتمام بنفسه**، فيُفرَج عن المال نحوه
   * بإقراره هو. وهذا تصرّفٌ في مالٍ لصالح المُقِرّ.
   *
   * // DESIGN-Q: المواصفة تذكر المراحل الستّ ولا تذكر من ينقلها.
   * نفّذتُ الأسلم: **النقل يبدؤه البائع** (هو من يذهب بالاستمارة)،
   * **والإتمام يؤكّده المشتري** (هو من استلم). ولو كان القصد غير ذلك
   * فالتعديل شرطان في هذا الموضع.
   *
   * والفحص هنا لا في الشاشة: حارسٌ في العميل ليس حارسًا.
   */
  const order = await db.order.findUnique({
    where: { ref },
    select: { buyerId: true, sellerId: true },
  });
  if (order === null) return fail(ERRORS.NOT_FOUND, 404);

  if (order.buyerId !== user.id) {
    return fail(
      {
        code: 'WRONG_PARTY',
        messageAr: 'المشتري هو من يؤكد استلام المركبة ونقلها.',
        messageEn: 'The buyer confirms receipt and transfer.',
      },
      403,
    );
  }

  const result = await advanceStage({ orderRef: ref, actorId: user.id, to: parsed.data.to });

  if (!result.ok) {
    if (result.reason === 'ORDER_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    const text = MESSAGES[result.reason];
    return fail(
      {
        code: result.reason,
        messageAr: text?.ar ?? 'تعذر تحديث المرحلة.',
        messageEn: text?.en ?? 'Could not update the stage.',
      },
      result.reason === 'NOT_PARTY' ? 403 : 409,
    );
  }

  return ok(result);
}

const CancelBody = z.object({ reason: z.string().min(3).max(500) });

const CANCEL_MESSAGES: Record<CancelFailure, { ar: string; en: string; status: number }> = {
  NOT_FOUND: { ar: 'الطلب غير موجود.', en: 'Order not found.', status: 404 },
  NOT_PARTY: {
    ar: 'لست طرفا في هذا الطلب.',
    en: 'You are not a party to this order.',
    status: 403,
  },
  ALREADY_CLOSED: { ar: 'الطلب مغلق بالفعل.', en: 'This order is already closed.', status: 409 },
  TRANSFER_DONE: {
    ar: 'نقلت الملكية وأفرج عن المبلغ — ولا إلغاء بعدها. افتح نزاعا إن كان ثمة خلاف.',
    en: 'Ownership transferred and funds released — cancellation is no longer possible. Open a dispute if something is wrong.',
    status: 409,
  },
  DISPUTED: {
    ar: 'الطلب متنازع عليه — مجمد حتى يحسم.',
    en: 'This order is disputed and frozen until resolved.',
    status: 409,
  },
  REASON_REQUIRED: { ar: 'اكتب سبب الإلغاء.', en: 'Write a reason for cancelling.', status: 422 },
  GATEWAY_FAILED: {
    ar: 'تعذر إلغاء الحجز لدى بوابة الدفع — لم يتغير شيء، أعد المحاولة.',
    en: 'The payment hold could not be released — nothing changed, please try again.',
    status: 502,
  },
};

/**
 * `DELETE /api/v1/orders/{ref}` — إلغاء الطلب.
 *
 * **ولم يكن له وجود.** `OrderStatus.CANCELLED` في المخطّط، واللوحة
 * تعدّه، و`cancelReason` تُقرأ — ولا كاتب. **وشروطُنا المنشورة تَعِد
 * به**: «الإلغاء قبل الدفع بلا رسوم… وبعد الدفع تُطبَّق رسوم الإلغاء
 * المعلنة في صفحة الطلب». فمن دفع ثم احتاج الإلغاء كان يفتح نزاعًا
 * على ما ليس خلافًا.
 *
 * و`DELETE` لا `PATCH`: الإلغاء ليس مرحلةً تالية في المسار، بل خروجٌ
 * منه — و`PATCH { to }` محصورةٌ في `DONE` عمدًا.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = CancelBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ reason: 'REQUIRED' }), 422);

  const { ref } = await params;
  const result = await cancelOrder({
    orderRef: ref,
    actorId: user.id,
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    const message = CANCEL_MESSAGES[result.reason];
    return fail(
      { code: result.reason, messageAr: message.ar, messageEn: message.en },
      message.status,
    );
  }

  return ok({ cancelled: true, refunded: result.refunded, stage: result.stage });
}
