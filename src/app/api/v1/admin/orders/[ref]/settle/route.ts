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
  /**
   * **`escrow.release` لا `finance.view`.** الدوران يتطابقان اليوم،
   * فلم يظهر أثر — لكن الصلاحية المسمّاة في `DUAL_APPROVAL` لم تكن
   * تُفحص في موضع، فأيّ فصلٍ لهما لاحقًا كان يسقط مفتوحًا بلا إنذار.
   */
  const guard = await requireAdmin(request, 'escrow.release');
  if (!guard.ok) return guard.response;

  const { ref } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ requestId: 'INVALID' }), 422);

  const result =
    parsed.data.requestId === undefined
      ? await requestSettle(guard.admin.id, ref, guard.ip)
      : await approveSettle(guard.admin.id, parsed.data.requestId, guard.ip);

  if (!result.ok) {
    const status = result.reason === 'ORDER_NOT_FOUND' ? 404
      : result.reason === 'SELF_APPROVAL' ? 403
      : result.reason === 'GATEWAY_FAILED' ? 502
      : 409;
    return fail(
      {
        code: result.reason,
        /*
          **ورسائلُ المسار نصُّ شاشةٍ أيضًا.** كانت `SELF_APPROVAL` تقول
          «يلزم عضو ثاني» بعد إلغاء النصاب بأربعين يومًا (§٣٥ · §٤١) —
          والبوابة ١٩ لا تقرأ `src/app/api`، فأفلتت. وهي تقرؤها الآن.
        */
        messageAr:
          result.reason === 'SELF_APPROVAL'
            ? 'هذا الطلب اعتمد باسمك فعلا.'
            : result.reason === 'NOT_TRANSFERRED'
              ? 'لم تؤكد ملكية المركبة بعد — لا إفراج قبلها.'
              : result.reason === 'ESCROW_NOT_HELD'
                ? 'الضمان لم يبق محجوزا — رد أو رد جزء منه. راجع التسوية قبل الإفراج.'
                : 'تعذر الإفراج.',
        messageEn:
          result.reason === 'SELF_APPROVAL'
            ? 'This request was already approved under your name.'
            : result.reason === 'ESCROW_NOT_HELD'
              ? 'The escrow is no longer held — review the settlement first.'
              : 'Could not release the funds.',
      },
      status,
    );
  }

  return ok(result);
}
