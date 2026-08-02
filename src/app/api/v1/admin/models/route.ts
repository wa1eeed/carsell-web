import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { createModel, listModels } from '@/lib/domain/catalog';

export const runtime = 'nodejs';

const BODY_TYPE = z.enum(['SEDAN', 'SUV', 'PICKUP', 'HATCHBACK', 'COUPE', 'VAN']);

const Body = z.object({
  brandId: z.string().min(1),
  nameAr: z.string().max(120),
  nameEn: z.string().max(120),
  yearFrom: z.number().int(),
  yearTo: z.number().int().nullable().optional(),
  bodyType: BODY_TYPE.nullable().optional(),
  visible: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request, 'catalog.manage');
  if (!guard.ok) return guard.response;

  const brandId = request.nextUrl.searchParams.get('brandId');
  if (brandId === null) return fail(ERRORS.VALIDATION({ brandId: 'REQUIRED' }), 422);

  return ok(await listModels(brandId));
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, 'catalog.manage');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  const result = await createModel(guard.admin, parsed.data, guard.ip);
  if (!result.ok) {
    return fail(
      ERRORS.VALIDATION(Object.fromEntries(result.errors.map((e) => [e.field, e.code]))),
      422,
    );
  }
  return ok(result.model, undefined, { status: 201 });
}
