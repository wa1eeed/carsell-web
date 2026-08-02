import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { requestRotation } from '@/lib/domain/admin-integrations';

export const runtime = 'nodejs';

const Body = z.object({
  secrets: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/), z.string().min(1).max(500)),
});

/**
 * `POST /api/v1/admin/integrations/{key}/rotate` — **طلب** تدوير.
 *
 * لا يكتب السرّ في التكامل: يُشفَّر ويبقى في طلب الموافقة حتى يعتمده
 * عضو ثانٍ. وكتابته الآن تجعل الموافقة توقيعًا على أمر منفَّذ.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const guard = await requireAdmin(request, 'integrations.view');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ secrets: 'INVALID' }), 422);

  const { key } = await params;
  const result = await requestRotation(guard.admin, key, parsed.data.secrets, guard.ip);

  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(
      { code: result.reason, messageAr: 'تدوير قائم على هذا المفتاح بالفعل.', messageEn: 'A rotation is already pending for this key.' },
      409,
    );
  }

  return ok(result);
}
