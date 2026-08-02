import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { createFeature, featureCounts, listFeatures } from '@/lib/domain/catalog';

export const runtime = 'nodejs';

const PLACEMENT = z.enum(['trim_editor', 'search_filter', 'listing_page', 'card_badge']);

const Body = z.object({
  key: z.string().max(40),
  nameAr: z.string().max(120),
  nameEn: z.string().max(120),
  group: z.enum(['SAFETY', 'COMFORT', 'TECH']),
  sort: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
  placements: z.array(PLACEMENT).optional(),
});

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request, 'catalog.manage');
  if (!guard.ok) return guard.response;
  const [features, counts] = await Promise.all([listFeatures(), featureCounts()]);
  return ok(features, counts);
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, 'catalog.manage');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ key: 'INVALID' }), 422);

  const result = await createFeature(guard.admin, parsed.data, guard.ip);
  if (!result.ok) {
    return fail(
      ERRORS.VALIDATION(Object.fromEntries(result.errors.map((e) => [e.field, e.code]))),
      422,
    );
  }
  return ok(result.feature, undefined, { status: 201 });
}
