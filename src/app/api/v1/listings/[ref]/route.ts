import type { NextResponse } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import {
  faqForListing,
  findPublishedListing,
  similarListings,
  toPublicDetail,
} from '@/lib/domain/listing-detail';

export const dynamic = 'force-dynamic';

/**
 * `GET /api/v1/listings/{ref}` — نفس المُسلسِل الذي تعرضه الشاشة.
 *
 * لو بنى المسار كائنه بنفسه لانحرف عن الصفحة، ولاحتاج حارس الأسرار
 * أن يُكتب مرّتين. الكتابة مرّتين هي كيف يتسرّب سرّ.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ref: string }> },
): Promise<NextResponse> {
  const { ref } = await params;
  const row = await findPublishedListing(ref);
  if (row === null) return fail(ERRORS.NOT_FOUND, 404);

  const [detail, faq, similar] = await Promise.all([
    toPublicDetail(row),
    faqForListing(row.type),
    similarListings(row),
  ]);

  return ok(detail, {
    faq,
    similar: similar.map(({ path, ...card }) => ({ ...card, path: path('ar') })),
  });
}
