import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { approveSettle, requestSettle } from '@/lib/domain/payments';

export const runtime = 'nodejs';

const Body = z.object({ requestId: z.string().min(1).max(60).optional() });

/**
 * `POST /api/v1/admin/orders/{ref}/settle` — **القاعدة ١٢**.
 *
 * بلا `requestId` طلبٌ أوّل، ومعه موافقةٌ ثانية تُنفّذ. والمسار واحد
 * لأنهما خطوتا فعلٍ واحد: من يقرأ الشاشة يرى «اطلب» ثم «اعتمد».
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const { ref } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ requestId: 'INVALID' }), 422);

  const result =
    parsed.data.requestId === undefined
      ? await requestSettle(guard.admin.id, ref)
      : await approveSettle(guard.admin.id, parsed.data.requestId, guard.ip);

  if (!result.ok) {
    const status = result.reason === 'ORDER_NOT_FOUND' ? 404
      : result.reason === 'SELF_APPROVAL' ? 403
      : result.reason === 'GATEWAY_FAILED' ? 502
      : 409;
    return fail(
      {
        code: result.reason,
        messageAr:
          result.reason === 'SELF_APPROVAL'
            ? 'طالب الإفراج لا يوافق على طلبه — يلزم عضو ثانٍ.'
            : result.reason === 'RETURN_WINDOW_OPEN'
              ? 'نافذة الاسترجاع ما زالت مفتوحة — لا إفراج قبل انقضائها.'
              : 'تعذّر الإفراج.',
        messageEn:
          result.reason === 'SELF_APPROVAL'
            ? 'The requester cannot approve their own release.'
            : 'Could not release the funds.',
        ...(result.until === undefined ? {} : { fields: { until: result.until } }),
      },
      status,
    );
  }

  return ok(result);
}
