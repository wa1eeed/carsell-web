import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { updateBodyType } from '@/lib/domain/catalog';

export const runtime = 'nodejs';

/**
 * `PATCH` وحده — **لا `POST` ولا `DELETE`**.
 * المفاتيح من تعداد `BodyType`، فإضافة نوع ترحيلٌ لا صفّ، وحذفه
 * يترك مركبات تشير إلى نوع لا اسم له.
 */
const Body = z.object({
  nameAr: z.string().max(60).optional(),
  nameEn: z.string().max(60).optional(),
  imageUrl: z.string().url().nullable().optional(),
  sort: z.number().int().min(0).max(999).optional(),
  visible: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const guard = await requireAdmin(request, 'catalog.manage');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  const { key } = await params;
  const result = await updateBodyType(guard.admin, key, parsed.data, guard.ip);

  if (!result.ok) {
    if ('notFound' in result) return fail(ERRORS.NOT_FOUND, 404);
    return fail(
      ERRORS.VALIDATION(Object.fromEntries(result.errors.map((e) => [e.field, e.code]))),
      422,
    );
  }
  return ok(result.bodyType);
}
