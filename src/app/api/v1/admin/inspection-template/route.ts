import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import {
  addItem,
  removeItem,
  updateCategory,
  updateItem,
} from '@/lib/domain/admin-inspection-template';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/admin/inspection-template` — تحريرُ القالب.
 *
 * **وكلُّ تغييرٍ يرفع إصدار القالب**: `version` كان حقلًا بلا كاتب،
 * وبه يُعرف أيُّ نصٍّ رآه الفاحصُ يوم ملأ تقريره.
 */
const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('category'),
    categoryId: z.string().min(1).max(40),
    nameAr: z.string().min(1).max(120).optional(),
    nameEn: z.string().min(1).max(120).optional(),
    icon: z.string().max(40).nullable().optional(),
    weight: z.number().int().min(1).max(100).optional(),
  }),
  z.object({
    action: z.literal('item'),
    itemId: z.string().min(1).max(40),
    nameAr: z.string().min(1).max(200).optional(),
    nameEn: z.string().min(1).max(200).optional(),
    unit: z.string().max(40).nullable().optional(),
    isCritical: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('add'),
    categoryId: z.string().min(1).max(40),
    nameAr: z.string().min(1).max(200),
    nameEn: z.string().max(200).optional(),
    inputType: z.enum(['STATUS', 'NUMBER', 'TEXT', 'SELECT']).optional(),
    unit: z.string().max(40).nullable().optional(),
    isCritical: z.boolean().optional(),
  }),
  z.object({ action: z.literal('remove'), itemId: z.string().min(1).max(40) }),
]);

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, 'services.manage');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ template: 'INVALID' }), 422);

  const body = parsed.data;
  const audit = { adminId: guard.admin.id, ip: guard.ip };

  const result =
    body.action === 'category'
      ? await updateCategory({ ...body, ...audit })
      : body.action === 'item'
        ? await updateItem({ ...body, ...audit })
        : body.action === 'add'
          ? await addItem({
              ...audit,
              categoryId: body.categoryId,
              nameAr: body.nameAr,
              nameEn: body.nameEn ?? body.nameAr,
              inputType: body.inputType ?? 'STATUS',
              unit: body.unit ?? null,
              isCritical: body.isCritical ?? false,
            })
          : await removeItem({ ...audit, itemId: body.itemId });

  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    /** **والمانعُ بعدده** — «عليه ١٢ جوابًا» لا «لا يمكن الحذف». */
    return fail(
      ERRORS.VALIDATION({
        template: result.reason,
        ...(result.count === undefined ? {} : { count: String(result.count) }),
      }),
      422,
    );
  }

  return ok({ saved: true });
}
