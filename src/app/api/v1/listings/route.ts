import type { NextRequest } from 'next/server';
import { ok } from '@/lib/api/response';
import { parseFilters, searchListings } from '@/lib/domain/listings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/v1/listings` — القسم ٦.
 *
 * عام بلا مصادقة. الفلاتر تُفكّ بنفس الدالة التي تستعملها الشاشة،
 * فالرابط المشترَك يعطي النتيجة نفسها في الاثنين.
 *
 * `data` بطاقات مُسلسَلة — لا كائن Prisma: `Listing` يحمل
 * `minAcceptPrice` و`Auction` يحمل `reservePrice`، وإرجاع الكائن
 * خامًا يسرّب سرًّا تجاريًا بسطر واحد لا يلتقطه مراجع بثبات.
 */
export async function GET(request: NextRequest) {
  const filters = parseFilters(request.nextUrl.searchParams);
  const result = await searchListings(filters);

  return ok(result.items, {
    total: result.total,
    page: result.page,
    totalPages: result.totalPages,
    nextCursor: result.nextCursor,
    facets: result.facets,
    priceRange: result.priceRange,
  });
}
