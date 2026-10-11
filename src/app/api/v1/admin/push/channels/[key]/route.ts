import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { updateChannel } from '@/lib/domain/push-channels';

export const runtime = 'nodejs';

/**
 * **و`userControllable` ليست في الجسد.** جعلُ قناةٍ حرجة قابلةً
 * للإطفاء قرارُ منتَج لا إعدادُ تشغيل، وحقلٌ هنا يجعله يقع بضغطة في
 * اجتماع. والنطاق لا يقبله أصلًا — وهذا يمنعه قبل أن يصله.
 */
const Body = z.object({
  defaultOn: z.boolean().optional(),
  nameAr: z.string().min(1).max(60).optional(),
  sort: z.number().int().min(0).max(999).optional(),
});

/**
 * `PATCH /api/v1/admin/push/channels/{key}` — تعديل قناة.
 *
 * **ولم يكن له باب.** `updateChannel` مبنيّةٌ بأثرها ولا ينادِيها شيء،
 * وشاشةُ الإشعارات تعرض القنوات قراءةً — فـ«مفتوحة افتراضيًّا» حالٌ
 * تُعرض ولا تُبدَّل، وتبديلُها يحتاج صفًّا في القاعدة بيد.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const guard = await requireAdmin(request, 'notifications.manage');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return fail(ERRORS.VALIDATION({ [typeof field === 'string' ? field : 'body']: 'INVALID' }), 422);
  }

  const { key } = await params;
  const result = await updateChannel(guard.admin, key, parsed.data, guard.ip);

  if (!result.ok) {
    return fail(
      { code: 'CHANNEL_NOT_FOUND', messageAr: 'لا قناة بهذا المفتاح.', messageEn: 'No such channel.' },
      404,
    );
  }

  return ok({ key, ...parsed.data });
}
