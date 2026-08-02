import { ok } from '@/lib/api/response';
import { ERRORS, fail } from '@/lib/api/response';
import { getAuction } from '@/lib/domain/auctions';

export const dynamic = 'force-dynamic';

/**
 * `GET /api/v1/auctions/{ref}` — **اللقطة**.
 *
 * هذه هي الحقيقة التي يبني عليها العميل حاله؛ ورسائل الوقت الحقيقي
 * تقول «تغيّر شيء» ولا تحمل الحال. والاحتياطي لا يخرج منها إطلاقًا.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  const { ref } = await params;
  const auction = await getAuction(ref);
  if (auction === null) return fail(ERRORS.NOT_FOUND, 404);
  return ok(auction);
}
