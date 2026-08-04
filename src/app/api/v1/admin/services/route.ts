import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { createService } from '@/lib/domain/admin-services';

export const runtime = 'nodejs';

const Body = z.object({
  // المفتاح يدخل في المسارات وفي الشيفرة — فلا حروف عربية ولا مسافات
  key: z.string().regex(/^[a-z][a-z0-9_]{2,39}$/),
  category: z.enum(['PRE_PURCHASE', 'POST_PURCHASE', 'SELLER']),
  nameAr: z.string().min(1).max(120),
  nameEn: z.string().min(1).max(120),
  descAr: z.string().max(600).default(''),
  descEn: z.string().max(600).default(''),
  price: z.number().int().min(0).max(1_000_000),
  slaHours: z.number().int().min(0).max(8760).nullable().default(null),
  placements: z.array(z.string().max(40)).max(10).default([]),
  // يُقبلان هنا كما يُقبلان في التعديل — والشاشة ترسلهما في الحالين
  adminFeeEnabled: z.boolean().default(false),
  adminFee: z.number().int().min(0).max(1_000_000).default(0),
});

/** `POST /api/v1/admin/services` — خدمة جديدة، تُنشأ مخفيّة. */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, 'services.manage');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ key: 'INVALID' }), 422);

  const result = await createService(guard.admin, parsed.data, guard.ip);
  if (!result.ok) {
    return fail(
      ERRORS.VALIDATION({ key: result.reason === 'KEY_TAKEN' ? 'TAKEN' : 'INVALID' }),
      422,
    );
  }

  return ok({ key: result.key }, undefined, { status: 201 });
}
