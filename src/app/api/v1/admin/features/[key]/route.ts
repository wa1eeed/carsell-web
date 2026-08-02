import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { deleteFeature, updateFeature } from '@/lib/domain/catalog';

export const runtime = 'nodejs';

const PLACEMENT = z.enum(['trim_editor', 'search_filter', 'listing_page', 'card_badge']);

/** لا `key` هنا — المفتاح ثابت ولا يُعدَّل بعد الإنشاء (قرار A19 بند ١). */
const Body = z.object({
  nameAr: z.string().max(120).optional(),
  nameEn: z.string().max(120).optional(),
  group: z.enum(['SAFETY', 'COMFORT', 'TECH']).optional(),
  sort: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
  placements: z.array(PLACEMENT).optional(),
});

type Params = { params: Promise<{ key: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireAdmin(request, 'catalog.manage');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  const { key } = await params;
  const result = await updateFeature(guard.admin, key, parsed.data, guard.ip);
  if (!result.ok) {
    if (result.notFound === true) return fail(ERRORS.NOT_FOUND, 404);
    return fail(
      ERRORS.VALIDATION(Object.fromEntries(result.errors.map((e) => [e.field, e.code]))),
      422,
    );
  }
  return ok(result.feature);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const guard = await requireAdmin(request, 'catalog.manage');
  if (!guard.ok) return guard.response;

  const { key } = await params;
  const result = await deleteFeature(guard.admin, key, guard.ip);
  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(ERRORS.FEATURE_LINKED, 409);
  }
  return ok({ deleted: true });
}
