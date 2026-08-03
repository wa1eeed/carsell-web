import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { checkIdempotency, rememberIdempotency } from '@/lib/domain/idempotency';
import { buyDirect } from '@/lib/domain/orders';

export const runtime = 'nodejs';

const Body = z.object({
  listingRef: z.string().min(1).max(40),
});

/**
 * `POST /api/v1/orders` — شراء مباشر.
 *
 * **`Idempotency-Key` إلزامي**: ضغطةٌ مزدوجة أو إعادةُ إرسالٍ من الشبكة
 * تُنشئ طلبين على مركبةٍ واحدة. والحارس داخل النطاق أيضًا (طلبٌ حيٌّ
 * واحد للإعلان) — والاثنان معًا لأن أحدهما يمنع التكرار السريع والآخر
 * يمنع البطيء.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const key = request.headers.get('idempotency-key');
  if (key === null || key.length < 8 || key.length > 200) {
    return fail(ERRORS.VALIDATION({ 'idempotency-key': 'REQUIRED' }), 400);
  }

  const raw: unknown = await request.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return fail(ERRORS.VALIDATION({ listingRef: 'INVALID' }), 422);

  const seen = await checkIdempotency(key, 'order.direct', raw);
  if (seen.kind === 'conflict') {
    return fail(ERRORS.VALIDATION({ 'idempotency-key': 'REUSED_WITH_DIFFERENT_BODY' }), 409);
  }
  if (seen.kind === 'replay') return ok(seen.response, undefined, { status: seen.status });

  const result = await buyDirect({ listingRef: parsed.data.listingRef, buyerId: user.id });

  if (!result.ok) {
    /**
     * **`TAX_STATUS_REQUIRED` ليست خطأ إدخال**: الشاشة تفتح النافذة ثم
     * تعيد المحاولة. ورمزٌ يخلطها بالرفض يجعلها تعرض «تعذّر الشراء».
     */
    const status =
      result.reason === 'PROFILE_INCOMPLETE'
        ? 428
        : result.reason === 'LISTING_NOT_FOUND'
        ? 404
        : result.reason === 'OWN_LISTING'
          ? 403
          : result.reason === 'TAX_STATUS_REQUIRED'
            ? 428
            : 409;
    return fail(
      {
        code: result.reason,
        messageAr:
          result.reason === 'PROFILE_INCOMPLETE'
            ? 'أكمل بريدك وتوثيق هويتك قبل الشراء.'
            : result.reason === 'TAX_STATUS_REQUIRED'
            ? 'حدّد وضعك الضريبي قبل إتمام الشراء.'
            : result.reason === 'ORDER_EXISTS'
              ? 'على هذه المركبة طلب قائم — تابعه أو انتظر انتهاء مهلته.'
              : result.reason === 'OWN_LISTING'
                ? 'لا يمكنك شراء إعلانك.'
                : 'هذه المركبة غير متاحة للشراء المباشر.',
        messageEn:
          result.reason === 'PROFILE_INCOMPLETE'
            ? 'Complete your email and identity verification before buying.'
            : result.reason === 'TAX_STATUS_REQUIRED'
            ? 'Set your tax status before completing the purchase.'
            : result.reason === 'ORDER_EXISTS'
              ? 'This vehicle already has a live order.'
              : result.reason === 'OWN_LISTING'
                ? 'You cannot buy your own listing.'
                : 'This vehicle is not available for direct purchase.',
      },
      status,
    );
  }

  const payload = { orderRef: result.orderRef };
  await rememberIdempotency(key, 'order.direct', raw, payload, 201);
  return ok(payload, undefined, { status: 201 });
}
