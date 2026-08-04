import type { NextRequest } from 'next/server';
import { ok } from '@/lib/api/response';
import { requirePublicKey } from '@/lib/api/public-guard';
import { listPublicDealers } from '@/lib/domain/dealer-page';

export const runtime = 'nodejs';

/** `GET /api/public/v1/dealers` — المعارض النشطة. */
export async function GET(request: NextRequest) {
  const guard = await requirePublicKey(request);
  if (!guard.ok) return guard.response;

  return ok(await listPublicDealers('ar'));
}
