import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { saveTemplate } from '@/lib/domain/admin-notifications';

export const runtime = 'nodejs';

const Body = z.object({
  subjectAr: z.string().max(200).nullable().optional(),
  subjectEn: z.string().max(200).nullable().optional(),
  bodyAr: z.string().max(2000).nullable().optional(),
  bodyEn: z.string().max(2000).nullable().optional(),
  smsAr: z.string().max(600).nullable().optional(),
  smsEn: z.string().max(600).nullable().optional(),
  variables: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).max(20).optional(),
  channelEmail: z.boolean().optional(),
  channelSms: z.boolean().optional(),
  channelPush: z.boolean().optional(),
  channelInApp: z.boolean().optional(),
  priority: z.enum(['critical', 'high', 'normal']).optional(),
  active: z.boolean().optional(),
});

/**
 * `PATCH /api/v1/admin/notifications/{key}` — نصّ القالب ومتغيّراته.
 *
 * **الرفض يُسمّي ما رُفض**: الأسماء غير المصرَّح بها تعود في الاستجابة،
 * فيصحّح المحرّر مطبعيًّا واحدًا بدل أن يقرأ النصّ كلّه بحثًا عنه.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const guard = await requireAdmin(request, 'notifications.manage');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  const { key } = await params;
  const result = await saveTemplate(guard.admin, key, parsed.data, guard.ip);

  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    /**
     * كل اسم مرفوض حقلٌ باسمه في `fields` — لا قائمة في رسالة نصّية.
     * فالمحرّر يرى أيّها المطبعيّ بدل أن يقرأ النصّ كلّه بحثًا عنه.
     */
    return fail(
      ERRORS.VALIDATION(
        Object.fromEntries((result.variables ?? []).map((name) => [name, 'UNDECLARED'])),
      ),
      422,
    );
  }

  return ok({ changed: result.changed });
}
