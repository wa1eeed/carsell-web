import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { catalogCounts, createBrand, listBrands } from '@/lib/domain/catalog';

export const runtime = 'nodejs';

const Body = z.object({
  nameAr: z.string().max(120),
  nameEn: z.string().max(120),
  slug: z.string().max(120).optional(),
  logoUrl: z.string().url().nullable().optional(),
  visible: z.boolean().optional(),
  sort: z.number().int().min(0).max(9999).optional(),
});

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request, 'catalog.manage');
  if (!guard.ok) return guard.response;

  const [brands, counts] = await Promise.all([listBrands(), catalogCounts()]);
  return ok(brands, counts);
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, 'catalog.manage');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ nameAr: 'مطلوب' }), 422);

  const result = await createBrand(guard.admin, parsed.data, guard.ip);
  if (!result.ok) {
    return fail(
      ERRORS.VALIDATION(
        Object.fromEntries(result.errors.map((e) => [e.field, e.code])),
      ),
      422,
    );
  }
  return ok(result.brand, undefined, { status: 201 });
}
