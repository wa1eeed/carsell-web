import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { API_SCOPES, type ApiScope } from '@/lib/api/scopes';
import { RATE_LIMIT_RANGE } from '@/lib/api/keys';
import { issueApiKey } from '@/lib/domain/api-keys';

export const runtime = 'nodejs';

const Body = z.object({
  name: z.string().min(1).max(60),
  scopes: z.array(z.enum(API_SCOPES as unknown as [ApiScope, ...ApiScope[]])).default([]),
  rateLimit: z.number().int().min(RATE_LIMIT_RANGE.min).max(RATE_LIMIT_RANGE.max),
});

const MESSAGE: Record<string, string> = {
  INVALID_NAME: 'اسم المفتاح مطلوب ولا يتجاوز ستين حرفا.',
  INVALID_SCOPE: 'نطاق لا تعرفه المنصة: ',
  INVALID_LIMIT: 'حد الطلبات خارج المدى المسموح.',
};

/**
 * `POST /api/v1/admin/api-keys` — إصدارُ مفتاح.
 *
 * **والسرُّ في الرد مرّةً واحدة.** لا يُخزَّن خامًّا ولا يُسترجَع، فإن
 * ضاع فالبديل مفتاحٌ جديد — و«أرني مفتاحي» بابٌ خلفيّ على كلّ تكامل.
 */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, 'integrations.rotateKeys');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ apiKey: 'INVALID' }), 422);

  const result = await issueApiKey(guard.admin, parsed.data, guard.ip);
  if (!result.ok) {
    const base = MESSAGE[result.reason] ?? 'تعذر الإصدار.';
    return fail(
      {
        code: result.reason,
        messageAr: result.reason === 'INVALID_SCOPE' ? `${base}${result.detail ?? ''}` : base,
        messageEn: 'Could not issue the key.',
      },
      422,
    );
  }

  return ok({ key: result.key, raw: result.raw });
}
