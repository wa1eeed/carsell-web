import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requirePublicKey } from '@/lib/api/public-guard';
import { publicListings } from '@/lib/domain/public-api';

export const runtime = 'nodejs';

const Query = z.object({
  city: z.string().max(60).optional(),
  brand: z.string().max(60).optional(),
  type: z.enum(['DIRECT', 'NEGOTIATION', 'AUCTION']).optional(),
  minPrice: z.number().int().min(0).max(100_000_000).optional(),
  maxPrice: z.number().int().min(0).max(100_000_000).optional(),
  cursor: z.string().max(40).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

/**
 * `GET /api/public/v1/listings` — الإعلانات المنشورة.
 *
 * **قراءةٌ فقط، ولا يخرج منها `reservePrice` ولا `minAcceptPrice`** —
 * والمُسلسِل يجعل ذلك بنيويًّا لا يقظةً.
 *
 * والسقف مئة: طلبٌ بلا سقف يُنزل الفهرس كلّه في نداء واحد فيصير أداة
 * كشطٍ لا واجهة تكامل.
 */
export async function GET(request: NextRequest) {
  const guard = await requirePublicKey(request);
  if (!guard.ok) return guard.response;

  const params = request.nextUrl.searchParams;
  const numeric = (key: string): number | undefined => {
    const value = params.get(key);
    return value === null || value === '' ? undefined : Number(value);
  };

  const parsed = Query.safeParse({
    city: params.get('city') ?? undefined,
    brand: params.get('brand') ?? undefined,
    type: params.get('type') ?? undefined,
    minPrice: numeric('minPrice'),
    maxPrice: numeric('maxPrice'),
    cursor: params.get('cursor') ?? undefined,
    limit: numeric('limit'),
  });
  if (!parsed.success) return fail(ERRORS.VALIDATION({ limit: 'INVALID' }), 422);

  const page = await publicListings({ ...parsed.data, limit: parsed.data.limit ?? 20 });
  return ok(page.items, { nextCursor: page.nextCursor });
}
