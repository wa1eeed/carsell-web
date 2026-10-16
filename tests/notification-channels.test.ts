import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { notify } from '@/lib/domain/notifications';
import { setPreference, userChannels } from '@/lib/domain/push-channels';

/**
 * ═══ مفاتيحُ الإشعار — بُنيت ولم يصلها أحد ═══
 *
 * `PushChannel` مزروعٌ بستّ قنوات، و`NotificationPreference` جدولٌ
 * قائم، و`setPreference` و`isChannelEnabled` مكتوبتان منذ A10 —
 * **ولا شاشة تضبطهما، ولا طريق من قالبٍ مُرسَل إلى قناته**. فستّةُ
 * مفاتيح لا يراها صاحبُها، وصفُّ تفضيلٍ واحد لم يُكتب قطّ.
 *
 * والطريق صار `NotificationTemplate.pushChannelKey`: الوسيلةُ شيء
 * (بريد · دفع · داخل التطبيق) والموضوعُ شيء (مزاداتي · عروضي).
 */

const made: string[] = [];

async function newUser(): Promise<string> {
  const stamp = `${String(Date.now()).slice(-9)}${String(made.length)}`;
  const user = await db.user.create({ data: { phone: `+9665307${stamp}` } });
  made.push(user.id);
  return user.id;
}

afterEach(async () => {
  if (made.length === 0) return;
  await db.notification.deleteMany({ where: { userId: { in: made } } });
  await db.notificationPreference.deleteMany({ where: { userId: { in: made } } });
  await db.user.deleteMany({ where: { id: { in: made } } });
  made.length = 0;
});

describe('مفاتيح الإشعار', () => {
  it('قناةٌ مُطفأة تمنع إشعارها', async () => {
    const userId = await newUser();

    await notify({ userId, templateKey: 'offer.received' });
    expect(await db.notification.count({ where: { userId } })).toBe(1);

    expect(await setPreference(userId, 'offers_mine', false)).toEqual({ ok: true, enabled: false });

    await notify({ userId, templateKey: 'offer.received' });
    /** **ولم يُضَف ثانٍ** — والمفتاح يُقرأ فعلًا لا يُحفظ وحسب. */
    expect(await db.notification.count({ where: { userId } })).toBe(1);
  });

  /**
   * ═══ معيار A10 ═══ **الحرِجة لا يمكن إيقافها.**
   *
   * والحراسة في المجال لا في الشاشة: مفتاحٌ معطَّل في الواجهة يُلتفّ
   * عليه بطلبٍ واحد.
   */
  it('والحرِجة لا تُطفأ ولو طُلب ذلك', async () => {
    const userId = await newUser();

    expect(await setPreference(userId, 'orders_payment', false)).toEqual({
      ok: false,
      reason: 'CRITICAL_CHANNEL',
    });

    await notify({ userId, templateKey: 'order.created' });
    expect(await db.notification.count({ where: { userId } })).toBe(1);
  });

  /**
   * **وما لم يُصنَّف يصل دائمًا.** النزاع وحالُ الحساب بلا قناة —
   * فالصمت أسلم من كتمٍ لم يُقصد.
   */
  it('وقالبٌ بلا قناة يصل دائمًا', async () => {
    const userId = await newUser();

    const template = await db.notificationTemplate.findUnique({
      where: { key: 'dispute.opened' },
      select: { pushChannelKey: true },
    });
    expect(template?.pushChannelKey).toBeNull();

    await notify({ userId, templateKey: 'dispute.opened' });
    expect(await db.notification.count({ where: { userId } })).toBe(1);
  });

  it('والشاشة تعرض الحرِجة مقفلةً لا تُخفيها', async () => {
    const userId = await newUser();
    const rows = await userChannels(userId);

    expect(rows.length).toBeGreaterThan(0);
    /** **إخفاؤها يجعل القارئ يظنّ أنّ ما يراه كلُّ ما يصله.** */
    const locked = rows.filter((row) => !row.userControllable);
    expect(locked.length).toBeGreaterThan(0);
    expect(locked.every((row) => row.enabled)).toBe(true);

    /** والتسويقيّ مغلقٌ افتراضًا — الموافقة تُطلب لا تُفترض. */
    expect(rows.find((row) => row.key === 'marketing')?.enabled).toBe(false);
  });
});
