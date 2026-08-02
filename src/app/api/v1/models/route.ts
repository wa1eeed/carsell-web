import type { NextRequest } from 'next/server';
import { ok } from '@/lib/api/response';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

/** `GET /api/v1/models?brandId=…` — طرازات ماركة، عامّ وللقراءة. */
export async function GET(request: NextRequest) {
  const brandId = request.nextUrl.searchParams.get('brandId');
  if (brandId === null || brandId === '') return ok([]);

  const models = await db.model.findMany({
    where: { brandId, visible: true },
    orderBy: { nameAr: 'asc' },
    select: { id: true, nameAr: true, nameEn: true },
  });
  return ok(models);
}
