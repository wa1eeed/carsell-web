import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/v1/trims?modelId=` — فئات طرازٍ للاختيار.
 *
 * وتُعاد بقيَمها الموروثة: البائع يرى «فل كامل · دفع رباعي · ٧ مقاعد»
 * فيتعرّف على فئته بها لا بالاسم وحده.
 */
export async function GET(request: NextRequest) {
  const modelId = request.nextUrl.searchParams.get('modelId');
  if (modelId === null || modelId === '') {
    return fail(ERRORS.VALIDATION({ modelId: 'REQUIRED' }), 422);
  }

  const trims = await db.trim.findMany({
    where: { modelId, visible: true },
    orderBy: [{ yearFrom: 'desc' }, { nameAr: 'asc' }],
    select: {
      id: true, nameAr: true, nameEn: true,
      bodyType: true, drivetrain: true, seats: true, yearFrom: true, yearTo: true,
    },
  });

  return ok(trims);
}
