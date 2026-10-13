import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { ListingType } from '@/generated/prisma/enums';
import { setFaqPlacements, toggleFaq } from '@/lib/domain/admin-content';

export const runtime = 'nodejs';

/**
 * **والطلب أحدُ أمرين لا كليهما**: إمّا سحبُ سؤالٍ من الظهور، وإمّا
 * ضبطُ مواضعه. وخلطُهما في طلبٍ واحد يجعل «أخفِ السؤال» تمسح مواضعه
 * معه، فيعود ظاهرًا بلا موضع.
 */
const Body = z.union([
  z.object({ active: z.boolean() }),
  z.object({
    placements: z
      .array(
        z.object({
          surface: z.string().min(1).max(40),
          listingType: z.enum(ListingType).nullable(),
        }),
      )
      .max(12),
  }),
]);

/** `PATCH /api/v1/admin/faq/{id}` — إظهار سؤال أو إخفاؤه (A33). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request, 'notifications.manage');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ active: 'INVALID' }), 422);

  if ('placements' in parsed.data) {
    const placed = await setFaqPlacements({
      id,
      placements: parsed.data.placements,
      adminId: guard.admin.id,
      ip: guard.ip,
    });
    if (!placed.ok) {
      return placed.reason === 'NOT_FOUND'
        ? fail(ERRORS.NOT_FOUND, 404)
        : fail(ERRORS.VALIDATION({ surface: 'INVALID' }), 422);
    }
    return ok({ placements: placed.count });
  }

  const result = await toggleFaq({
    id,
    active: parsed.data.active,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) return fail(ERRORS.NOT_FOUND, 404);
  return ok({ active: result.active });
}
