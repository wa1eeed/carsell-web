import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { discardDraft, saveDraft } from '@/lib/domain/admin-legal';
import { REACCEPT_NOTICE_DAYS } from '@/lib/domain/legal';

export const runtime = 'nodejs';

const Section = z.object({
  titleAr: z.string().max(300),
  titleEn: z.string().max(300).nullable().optional(),
  bodyAr: z.string().max(20000),
  bodyEn: z.string().max(20000).nullable().optional(),
});

const Body = z.object({
  titleAr: z.string().max(200),
  titleEn: z.string().max(200),
  summaryAr: z.string().max(2000).nullable().optional(),
  summaryEn: z.string().max(2000).nullable().optional(),
  sections: z.array(Section).max(120),
  material: z.boolean(),
  effectiveAt: z.string().max(40).nullable().optional(),
});

/** `PUT /api/v1/admin/legal/{key}` — يحفظ المسوّدة، ويُنشئها إن لم تكن. */
export async function PUT(request: NextRequest, context: { params: Promise<{ key: string }> }) {
  const guard = await requireAdmin(request, 'notifications.manage');
  if (!guard.ok) return guard.response;

  const { key } = await context.params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ titleAr: 'REQUIRED' }), 422);

  const result = await saveDraft({
    ...parsed.data,
    key,
    adminId: guard.admin.id,
    ip: guard.ip,
    noticeDays: REACCEPT_NOTICE_DAYS,
  });

  if (!result.ok) {
    return result.reason === 'VALIDATION'
      ? fail(ERRORS.VALIDATION(result.fields), 422)
      : fail(ERRORS.NOT_FOUND, 404);
  }

  return ok({ version: result.version });
}

/**
 * `DELETE /api/v1/admin/legal/{key}` — يُسقط المسوّدة.
 *
 * **ولا يحذف المستند.** مستندٌ قانونيّ قبِله مستخدمون لا يُحذف من
 * شاشة؛ والذي يُسقط هنا نصٌّ لم يخرج ولم يقبله أحد.
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ key: string }> }) {
  const guard = await requireAdmin(request, 'notifications.manage');
  if (!guard.ok) return guard.response;

  const { key } = await context.params;
  const result = await discardDraft({ key, adminId: guard.admin.id, ip: guard.ip });
  if (!result.ok) return fail(ERRORS.NOT_FOUND, 404);

  return ok({ discarded: true });
}
