import { getLocale } from 'next-intl/server';
import { NotificationMenu } from './NotificationMenu';
import { currentUserFromCookies } from '@/lib/domain/account';
import { listNotifications, unreadCount } from '@/lib/domain/notifications';

/**
 * ═══ الجرس — والصفّ الذي كان يُكتب ولا يُقرأ ═══
 *
 * `Notification` كان يُكتب من خمسة مواضع ولا يقرؤه شيء في المنتج: لا
 * جرس ولا قائمة ولا نقطة. فالبائع يصله عرضٌ ولا يعلم، والمشتري
 * يُصادَر عربونه بإشعارٍ «حرج» يعرفه من كشف بطاقته.
 *
 * **ويُصيَّر على الخادم أوّلًا.** جرسٌ يبدأ فارغًا ثم يقفز إلى «٣» بعد
 * نداءٍ يجعل الصفحة ترتجف عند كل فتح — والعدّ معروفٌ وقت التصيير.
 *
 * **ولا جرسَ لمن لا جلسة له**: إشعاراتٌ بلا حساب لا معنى لها، وزرٌّ
 * يفتح فارغًا دائمًا هو زرٌّ ميّت.
 */
export async function NotificationBell() {
  const user = await currentUserFromCookies();
  if (user === null) return null;

  const locale = await getLocale();
  const [items, unread] = await Promise.all([
    listNotifications(user.id, { locale, limit: 8 }),
    unreadCount(user.id),
  ]);

  return <NotificationMenu initialItems={items} initialUnread={unread} now={new Date().toISOString()} />;
}
