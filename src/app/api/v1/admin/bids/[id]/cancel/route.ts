import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { cancelBid } from '@/lib/domain/bid-cancellation';

export const runtime = 'nodejs';

const Body = z.object({ reason: z.string().min(6).max(200) });

const MESSAGES: Record<string, string> = {
  BID_NOT_FOUND: 'لم تعد هذه المزايدة موجودة.',
  AUCTION_CLOSED: 'المزاد أغلق — الإلغاء بعده يمر بالنزاع لا بهذه الشاشة.',
  REASON_REQUIRED: 'اكتب سببا يقرؤه المزايد.',
};

/**
 * `POST /api/v1/admin/bids/{id}/cancel` — إلغاء مزايدة.
 *
 * **وحارسٌ في الشاشة ليس حارسًا**: الزرّ مخفيٌّ عمّن لا يملك
 * `bids.cancel`، والنداءُ المباشر يُفحص هنا بالصلاحية نفسها.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await currentAdmin();
  if (admin === null) return fail(ERRORS.UNAUTHORIZED, 401);
  if (!can(admin.role, 'bids.cancel')) return fail(ERRORS.FORBIDDEN, 403);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ reason: 'REQUIRED' }), 422);

  const { id } = await params;
  const result = await cancelBid({
    bidId: id,
    adminId: admin.id,
    reason: parsed.data.reason,
    ip: request.headers.get('x-forwarded-for'),
  });

  if (!result.ok) {
    return fail(
      {
        code: result.reason,
        messageAr: MESSAGES[result.reason] ?? 'تعذر الإلغاء.',
        messageEn: 'Could not cancel the bid.',
      },
      result.reason === 'BID_NOT_FOUND' ? 404 : 409,
    );
  }

  return ok(result);
}
