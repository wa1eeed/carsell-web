import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { signUpload } from '@/lib/r2';

export const runtime = 'nodejs';

const Body = z.object({
  kind: z.enum(['brand-logo', 'dealer-logo', 'listing-image']),
  contentType: z.string().min(1).max(120),
  contentLength: z.number().int().positive(),
  fileName: z.string().min(1).max(200),
});

/** رابط رفع موقَّع — الملف يذهب من المتصفح إلى R2 مباشرةً، لا عبر Next. */
export async function POST(request: NextRequest) {
  // رفع شعار الماركة لـSUPER_ADMIN وCONTENT وحدهما (قرار ٣٤)
  const guard = await requireAdmin(request, 'catalog.uploadLogo');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.UPLOAD_REJECTED, 422);

  const result = await signUpload(parsed.data);
  if (!result.ok) {
    return result.reason === 'NOT_CONFIGURED'
      ? fail(ERRORS.UPLOAD_NOT_CONFIGURED, 503)
      : fail(ERRORS.UPLOAD_REJECTED, 422);
  }
  return ok(result.upload);
}
