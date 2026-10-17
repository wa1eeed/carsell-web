import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentProviderUser } from '@/lib/auth/provider-session';
import { addDraftPhoto, removeDraftPhoto } from '@/lib/domain/inspection-draft';
import { MAX_UPLOAD_BYTES } from '@/lib/r2';

export const runtime = 'nodejs';

/**
 * `POST .../inspection/photos` — صورةُ بندٍ يرفعها الفاحص.
 *
 * **وتمرّ بما تمرّ به صورةُ الإعلان**: تُدار بـEXIF وتُصغَّر وتُطمَس
 * لوحتُها. فصورةٌ تُرفع من جوّالٍ عند السيارة تصل مقلوبةً بلا الأولى،
 * ولوحةُ سيارةٍ في تقريرٍ يُشارَك تُعرّف صاحبَها بلا الثالثة.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const user = await currentProviderUser();
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const itemId = form?.get('itemId');
  if (!(file instanceof File)) return fail(ERRORS.VALIDATION({ file: 'REQUIRED' }), 422);
  if (file.size > MAX_UPLOAD_BYTES) return fail(ERRORS.IMAGE_TOO_LARGE, 413);

  const { ref } = await params;
  const result = await addDraftPhoto({
    ref: decodeURIComponent(ref),
    providerId: user.providerId,
    itemId: typeof itemId === 'string' && itemId !== '' ? itemId : null,
    body: Buffer.from(await file.arrayBuffer()),
  });

  if (!result.ok) {
    if (result.reason === 'NOT_INSPECTOR') return fail(ERRORS.FORBIDDEN, 403);
    if (result.reason === 'NOT_YOURS') return fail(ERRORS.NOT_FOUND, 404);
    if (result.reason === 'STORAGE') return fail(ERRORS.STORAGE_UNAVAILABLE, 503);
    return fail(ERRORS.IMAGE_INVALID, 415);
  }

  return ok({ id: result.id, url: result.url });
}

/** `DELETE` — يحذف صورةً رفعها، ما دامت المسودّةُ تُحرَّر. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const user = await currentProviderUser();
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const body = (await request.json().catch(() => null)) as { photoId?: unknown } | null;
  if (typeof body?.photoId !== 'string') return fail(ERRORS.VALIDATION({ photoId: 'REQUIRED' }), 422);

  const { ref } = await params;
  const result = await removeDraftPhoto({
    ref: decodeURIComponent(ref),
    providerId: user.providerId,
    photoId: body.photoId,
  });

  if (!result.ok) {
    if (result.reason === 'NOT_INSPECTOR') return fail(ERRORS.FORBIDDEN, 403);
    return fail(ERRORS.NOT_FOUND, 404);
  }
  return ok({ removed: true });
}
