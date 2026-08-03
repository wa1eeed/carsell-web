import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import {
  changeServiceAdminFee,
  changeServicePrice,
  editService,
  moveService,
  setServiceActive,
} from '@/lib/domain/admin-services';

export const runtime = 'nodejs';

const Body = z.object({
  price: z.number().int().min(0).max(1_000_000).optional(),
  active: z.boolean().optional(),
  move: z.enum(['up', 'down']).optional(),
  nameAr: z.string().min(1).max(120).optional(),
  nameEn: z.string().min(1).max(120).optional(),
  descAr: z.string().max(600).optional(),
  descEn: z.string().max(600).optional(),
  slaHours: z.number().int().min(0).max(8760).nullable().optional(),
  placements: z.array(z.string().max(40)).max(10).optional(),
  /** الرسم الإداريّ — الرايةُ والقيمة معًا، فلا تُفعَّل بلا مبلغ */
  adminFeeEnabled: z.boolean().optional(),
  adminFee: z.number().int().min(0).max(100_000).optional(),
});

/**
 * `PATCH /api/v1/admin/services/{key}` — السعر أو الظهور.
 *
 * الاستجابة تعيد **عدد الطلبات التي لم تُمَسّ**: التأكيد الذي يقول «تمّ»
 * وحده يخبر أن الكتابة نجحت، وهذا يخبر ماذا بقي على حاله.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const guard = await requireAdmin(request, 'services.manage');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ price: 'INVALID' }), 422);

  const { key } = await params;

  if (parsed.data.active !== undefined) {
    const result = await setServiceActive(guard.admin, key, parsed.data.active, guard.ip);
    if (!result.ok) return fail(ERRORS.NOT_FOUND, 404);
    return ok({ active: parsed.data.active });
  }

  if (parsed.data.move !== undefined) {
    const result = await moveService(guard.admin, key, parsed.data.move, guard.ip);
    if (!result.ok) return fail(ERRORS.NOT_FOUND, 404);
    return ok({ moved: parsed.data.move });
  }

  /**
   * الرسم الإداريّ قبل السعر — وكلاهما يمرّ إن أُرسلا معًا، فلا يُبتلع
   * أحدهما بالآخر (كما `editService` مع `price` أدناه).
   */
  if (parsed.data.adminFeeEnabled !== undefined || parsed.data.adminFee !== undefined) {
    const fee = await changeServiceAdminFee(
      guard.admin,
      key,
      {
        enabled: parsed.data.adminFeeEnabled ?? false,
        adminFee: parsed.data.adminFee ?? 0,
      },
      guard.ip,
    );
    if (!fee.ok) {
      return fail(
        fee.reason === 'NOT_FOUND' ? ERRORS.NOT_FOUND : ERRORS.VALIDATION({ adminFee: 'INVALID' }),
        fee.reason === 'NOT_FOUND' ? 404 : 422,
      );
    }
  }

  const {
    price,
    active: _a,
    move: _m,
    adminFeeEnabled: _fe,
    adminFee: _fa,
    ...edit
  } = parsed.data;
  if (Object.keys(edit).length > 0) {
    const result = await editService(guard.admin, key, edit, guard.ip);
    if (!result.ok) return fail(ERRORS.NOT_FOUND, 404);
    // السعر يمرّ بعدها إن أُرسل معها — ولا يُبتلع
  }

  if (price === undefined) {
    if (Object.keys(edit).length > 0 || _fe !== undefined || _fa !== undefined) {
      return ok({ edited: true });
    }
    return fail(ERRORS.VALIDATION({ price: 'REQUIRED' }), 422);
  }

  const result = await changeServicePrice(guard.admin, key, price, guard.ip);
  if (!result.ok) {
    return fail(result.reason === 'NOT_FOUND' ? ERRORS.NOT_FOUND : ERRORS.VALIDATION({ price: 'INVALID' }), result.reason === 'NOT_FOUND' ? 404 : 422);
  }

  return ok({ price: result.price, untouchedRequests: result.untouchedRequests });
}
