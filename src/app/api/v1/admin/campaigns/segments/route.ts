import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { SEGMENT_FIELDS, saveSegment } from '@/lib/domain/admin-campaigns';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/admin/campaigns/segments` — تعريف شريحة.
 *
 * **و`saveSegment` كانت مبنيّةً كاملةً ولا ينادیها أحد**: تتحقّق من
 * القواعد، وتمنع تكرار المفتاح، وتكتب الأثر — ولا مسارَ يبلغها ولا
 * زرّ. فشاشةُ الحملات تعرض الشرائح ولا تستطيع إنشاء واحدة، والحملة
 * بلا شريحة لا تُرسَل.
 */
const Rule = z.object({
  field: z.enum(SEGMENT_FIELDS.map((entry) => entry.key) as [string, ...string[]]),
  negate: z.boolean().optional(),
  value: z.number().int().min(1).max(3650).optional(),
});

const Body = z.object({
  /** مفتاحٌ لاتينيّ يُكتب في التقارير — فلا يُقبل بالعربية. */
  key: z.string().regex(/^[a-z][a-z0-9_]{2,39}$/),
  nameAr: z.string().min(2).max(80),
  rules: z.array(Rule).min(1).max(8),
});

const MESSAGE: Record<string, string> = {
  INVALID_RULES: 'القواعد غير صحيحة — اختر شرطا واحدا على الأقل.',
  KEY_TAKEN: 'هذا المفتاح مستعمل في شريحة أخرى.',
};

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, 'notifications.manage');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ segment: 'INVALID' }), 422);

  const result = await saveSegment(guard.admin, parsed.data, guard.ip);

  if (!result.ok) {
    return fail(
      {
        code: result.reason,
        messageAr: MESSAGE[result.reason] ?? 'تعذر الحفظ.',
        messageEn: 'Could not save the segment.',
      },
      422,
    );
  }

  return ok({ id: result.id });
}
