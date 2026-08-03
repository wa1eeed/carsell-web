import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { choicesFor } from '@/lib/domain/payment-routing';

export const runtime = 'nodejs';

const PURPOSES = [
  'VEHICLE_ESCROW', 'AUCTION_DEPOSIT', 'WALLET_TOPUP',
  'SERVICE_PURCHASE', 'TRANSFER_FEE', 'SUBSCRIPTION',
] as const;

/**
 * `GET …/choices` — البوابات الصالحة لهذا الغرض.
 *
 * **الناقصة قدرةً لا تُعاد أصلًا** — لا تُعاد ثم تُرفض عند الضغط.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ purpose: string }> },
) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const { purpose } = await params;
  if (!(PURPOSES as readonly string[]).includes(purpose)) return fail(ERRORS.NOT_FOUND, 404);

  return ok(await choicesFor(purpose as (typeof PURPOSES)[number]));
}
