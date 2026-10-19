import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { API_SCOPES, type ApiScope } from '@/lib/api/scopes';
import { RATE_LIMIT_RANGE } from '@/lib/api/keys';
import { revokeApiKey, updateApiKey } from '@/lib/domain/api-keys';

export const runtime = 'nodejs';

const Body = z.object({
  name: z.string().min(1).max(60).optional(),
  scopes: z.array(z.enum(API_SCOPES as unknown as [ApiScope, ...ApiScope[]])).optional(),
  rateLimit: z.number().int().min(RATE_LIMIT_RANGE.min).max(RATE_LIMIT_RANGE.max).optional(),
});

const MESSAGE: Record<string, string> = {
  NOT_FOUND: 'لا مفتاح بهذا المعرف.',
  REVOKED: 'المفتاح مسحوب، ولا يعدل مسحوب.',
  ALREADY_REVOKED: 'المفتاح مسحوب أصلا.',
  INVALID_NAME: 'اسم المفتاح مطلوب ولا يتجاوز ستين حرفا.',
  INVALID_SCOPE: 'نطاق لا تعرفه المنصة: ',
  INVALID_LIMIT: 'حد الطلبات خارج المدى المسموح.',
};

const say = (reason: string, detail?: string) => ({
  code: reason,
  messageAr:
    reason === 'INVALID_SCOPE'
      ? `${MESSAGE[reason] ?? ''}${detail ?? ''}`
      : (MESSAGE[reason] ?? 'تعذر الحفظ.'),
  messageEn: 'Could not change the key.',
});

/** `PATCH /api/v1/admin/api-keys/{id}` — الاسم والنطاقات والحدّ. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, 'integrations.rotateKeys');
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ apiKey: 'INVALID' }), 422);

  const result = await updateApiKey(guard.admin, id, parsed.data, guard.ip);
  if (!result.ok) {
    return fail(say(result.reason, result.detail), result.reason === 'NOT_FOUND' ? 404 : 422);
  }
  return ok(result.key);
}

/**
 * `DELETE /api/v1/admin/api-keys/{id}` — سحبُ المفتاح.
 *
 * **ولا رجعةَ فيه**: مفتاحٌ سُحب سُحب لأنّه تسرّب أو انتهى عقدُ صاحبه،
 * وإعادتُه تُعيد سرًّا يعرفه من لا يجوز أن يعرفه.
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, 'integrations.rotateKeys');
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const result = await revokeApiKey(guard.admin, id, guard.ip);
  if (!result.ok) {
    return fail(say(result.reason), result.reason === 'NOT_FOUND' ? 404 : 422);
  }
  return ok(result.key);
}
