import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { deleteBrand, updateBrand } from '@/lib/domain/catalog';

export const runtime = 'nodejs';

const Body = z.object({
  nameAr: z.string().max(120).optional(),
  nameEn: z.string().max(120).optional(),
  slug: z.string().max(120).optional(),
  logoUrl: z.string().url().nullable().optional(),
  visible: z.boolean().optional(),
  sort: z.number().int().min(0).max(9999).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireAdmin(request, 'catalog.manage');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  const { id } = await params;
  const result = await updateBrand(guard.admin, id, parsed.data, guard.ip);

  if (!result.ok) {
    if ('notFound' in result) return fail(ERRORS.NOT_FOUND, 404);
    return fail(
      ERRORS.VALIDATION(Object.fromEntries(result.errors.map((e) => [e.field, e.code]))),
      422,
    );
  }
  return ok(result.brand);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const guard = await requireAdmin(request, 'catalog.manage');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const result = await deleteBrand(guard.admin, id, guard.ip);

  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(ERRORS.BRAND_HAS_CHILDREN, 409);
  }
  return ok({ deleted: true });
}
