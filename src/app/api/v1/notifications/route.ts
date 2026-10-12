import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { listNotifications, unreadCount } from '@/lib/domain/notifications';
import { isLocale } from '@/i18n/routing';

export const runtime = 'nodejs';

/**
 * `GET /api/v1/notifications` — إشعارات صاحب الجلسة.
 *
 * **والعدّاد يُعاد مع القائمة.** طلبان لرسم جرسٍ واحد يجعلان الرقم
 * والقائمة من لحظتين، فيُرى «٣» فوق قائمةٍ فيها أربعة.
 *
 * و`unread` عدد **كلّ** غير المقروء لا عدد ما في هذه الصفحة: الجرس
 * يقول كم ينتظرك، والقائمة تعرض آخرها.
 */
export async function GET(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const url = new URL(request.url);
  const localeParam = url.searchParams.get('locale') ?? 'ar';
  const locale = isLocale(localeParam) ? localeParam : 'ar';
  const limitRaw = Number(url.searchParams.get('limit') ?? '30');
  const limit = Number.isFinite(limitRaw) ? limitRaw : 30;

  const [items, unread] = await Promise.all([
    listNotifications(user.id, {
      locale,
      limit,
      unreadOnly: url.searchParams.get('unread') === '1',
    }),
    unreadCount(user.id),
  ]);

  return ok({ items, unread });
}
