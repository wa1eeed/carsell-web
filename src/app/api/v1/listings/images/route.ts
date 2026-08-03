import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { findDuplicate, processListingImage } from '@/lib/domain/listing-images';
import { MAX_UPLOAD_BYTES } from '@/lib/r2';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/listings/images` — صورة واحدة، تُعالَج ثم تُخزَّن.
 *
 * **الملف يمرّ بالخادم عمدًا**: الطمس شرط نشر، وصورةٌ تذهب من المتصفّح
 * إلى التخزين لا يراها الخادم فلا يطمسها.
 *
 * والحدّ والنوع يُفحصان **هنا** لا في المتصفّح: فحص العميل تجربة
 * مستخدم، وفحص الخادم هو الحماية.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return fail(ERRORS.VALIDATION({ file: 'مطلوب' }), 422);
  if (file.size > MAX_UPLOAD_BYTES) return fail(ERRORS.IMAGE_TOO_LARGE, 413);

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await processListingImage(buffer);

  if (!result.ok) {
    if (result.reason === 'TOO_LARGE') return fail(ERRORS.IMAGE_TOO_LARGE, 413);
    if (result.reason === 'STORAGE') return fail(ERRORS.STORAGE_UNAVAILABLE, 503);
    return fail(ERRORS.IMAGE_INVALID, 415);
  }

  // التكرار يُبلَّغ ولا يَرفض (قرار ٣٣) — المراجعة تكشف الناسخ
  const duplicate = await findDuplicate(result.image.phash);

  /**
   * **البصمة تبقى هنا ولا تعود إلى المتصفّح.** والنشر يقرؤها بمفتاح
   * التخزين — فلو قُبلت من العميل لصار كشف التكرار حارسًا يُطفئه من
   * يريد تجاوزه.
   */
  await db.uploadedAsset.upsert({
    where: { r2Key: result.image.key },
    create: {
      r2Key: result.image.key,
      ownerId: user.id,
      phash: result.image.phash,
      plateBlurred: result.image.plateBlurred,
      qualityFlags: result.image.qualityFlags,
    },
    update: {},
  });

  return ok({
    key: result.image.key,
    plateBlurred: result.image.plateBlurred,
    blurredRegions: result.image.regions.length,
    qualityFlags: result.image.qualityFlags,
    width: result.image.width,
    height: result.image.height,
    duplicateOf: duplicate?.listingRef ?? null,
  });
}
