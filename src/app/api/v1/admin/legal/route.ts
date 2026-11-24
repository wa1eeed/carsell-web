import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { createDocument } from '@/lib/domain/admin-legal';
import { REACCEPT_NOTICE_DAYS } from '@/lib/domain/legal';

export const runtime = 'nodejs';

/**
 * ═══ `POST /api/v1/admin/legal` — مستندٌ جديد (A34) ═══
 *
 * زرُّ «مستند جديد» في الترميز، **وما يُنشئه مسوّدةٌ لا منشورًا**: نصٌّ
 * قانونيّ يظهر للزائر لحظةَ كتابته يظهر بلا مراجعة.
 */
const Section = z.object({
  titleAr: z.string().max(300),
  titleEn: z.string().max(300).nullable().optional(),
  bodyAr: z.string().max(20000),
  bodyEn: z.string().max(20000).nullable().optional(),
});

const Body = z.object({
  key: z.string().max(40),
  titleAr: z.string().max(200),
  titleEn: z.string().max(200),
  summaryAr: z.string().max(2000).nullable().optional(),
  summaryEn: z.string().max(2000).nullable().optional(),
  sections: z.array(Section).max(120),
  material: z.boolean(),
  effectiveAt: z.string().max(40).nullable().optional(),
  requiredAtSignup: z.boolean(),
});

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, 'notifications.manage');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ titleAr: 'REQUIRED' }), 422);

  const result = await createDocument({
    ...parsed.data,
    adminId: guard.admin.id,
    ip: guard.ip,
    noticeDays: REACCEPT_NOTICE_DAYS,
  });

  if (!result.ok) {
    return result.reason === 'VALIDATION'
      ? fail(ERRORS.VALIDATION(result.fields), 422)
      : fail(ERRORS.VALIDATION({ key: 'TAKEN' }), 409);
  }

  return ok({ key: result.key });
}
