import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { requestRouteSwitch } from '@/lib/domain/payment-routing';

export const runtime = 'nodejs';

const PURPOSES = [
  'VEHICLE_ESCROW', 'AUCTION_DEPOSIT', 'WALLET_TOPUP',
  'SERVICE_PURCHASE', 'TRANSFER_FEE', 'SUBSCRIPTION',
] as const;

const Body = z.object({
  toGatewayKey: z.string().min(1).max(40),
  toEnvironment: z.enum(['TEST', 'LIVE']),
  reason: z.string().min(10).max(400),
});

/** `POST /api/v1/admin/payments/routes/{purpose}` — **طلب** تبديل بعضوين. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ purpose: string }> },
) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const { purpose } = await params;
  if (!(PURPOSES as readonly string[]).includes(purpose)) return fail(ERRORS.NOT_FOUND, 404);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // السبب أوّل ما يُفحص: هو الحقل الوحيد الذي لا يُشتقّ
    return fail(
      { code: 'REASON_REQUIRED', messageAr: 'اكتب سببًا للتبديل.', messageEn: 'A reason is required.' },
      422,
    );
  }

  const result = await requestRouteSwitch(
    guard.admin,
    { purpose: purpose as (typeof PURPOSES)[number], ...parsed.data },
    guard.ip,
  );

  if (!result.ok) {
    const status = result.reason === 'GATEWAY_NOT_FOUND' ? 404
      : result.reason === 'NOT_ELIGIBLE' || result.reason === 'ENV_FORBIDDEN' ? 403
      : result.reason === 'REASON_REQUIRED' ? 422
      : 409;
    return fail(
      {
        code: result.reason,
        messageAr:
          result.reason === 'NOT_ELIGIBLE'
            ? 'هذه البوابة تنقصها قدرة يحتاجها الغرض.'
            : // القائم يُسمّى: «تعذّر» يدفع المشغّل يعيد المحاولة بلا فائدة
              result.reason === 'ALREADY_PENDING'
              ? 'على هذا الغرض طلب تبديل قائم — اعتمده أو انتظر انقضاءه.'
              : 'تعذّر تسجيل طلب التبديل.',
        messageEn:
          result.reason === 'NOT_ELIGIBLE'
            ? 'This gateway lacks a capability the purpose requires.'
            : result.reason === 'ALREADY_PENDING'
              ? 'A switch request is already pending for this purpose.'
              : 'Could not record the switch request.',
      },
      status,
    );
  }

  return ok(result);
}
