import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requirePublicKey } from '@/lib/api/public-guard';
import { publicListing } from '@/lib/domain/public-api';

export const runtime = 'nodejs';

/** `GET /api/public/v1/listings/{ref}` — إعلان واحد. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const guard = await requirePublicKey(request);
  if (!guard.ok) return guard.response;

  const { ref } = await params;
  const listing = await publicListing(decodeURIComponent(ref));
  if (listing === null) return fail(ERRORS.NOT_FOUND, 404);

  return ok(listing);
}
