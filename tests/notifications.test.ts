import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  listNotifications,
  markAllRead,
  markRead,
  notify,
  notifyMany,
  unreadCount,
} from '@/lib/domain/notifications';

/**
 * ═══ مركز الإشعارات ═══
 *
 * الجدول كان يُكتب من خمسة مواضع ولا يقرؤه شيء، فأُضيف المدخل الواحد
 * والقراءة. وهذه تحرس ثلاثًا: **الملكية** (لا يقرأ أحدٌ إشعار غيره)،
 * و**النصّ من القالب**، و**الوجهة تُستعلَم ولا تُخمَّن**.
 */

const T0 = new Date('2026-06-01T10:00:00Z');
const stamp = String(Date.now()).slice(-9);

let mine: string;
let theirs: string;
const orderRef = `ORD-TST-N1-${stamp}`;
const otherOrderRef = `ORD-TST-N2-${stamp}`;

beforeAll(async () => {
  const [a, b] = await Promise.all([
    db.user.create({ data: { phone: `+9665201${stamp}` } }),
    db.user.create({ data: { phone: `+9665202${stamp}` } }),
  ]);
  mine = a.id;
  theirs = b.id;

  await db.notificationTemplate.upsert({
    where: { key: 'test.greeting' },
    create: {
      key: 'test.greeting',
      subjectAr: 'مرحبًا {name}',
      bodyAr: 'لديك {count} شيءٌ ينتظر.',
      channelInApp: true,
      variables: ['name', 'count'],
    },
    update: { subjectAr: 'مرحبًا {name}', bodyAr: 'لديك {count} شيءٌ ينتظر.', channelInApp: true },
  });

  /* طلبٌ لكلٍّ — أحدهما لصاحب الإشعارات والآخر لغيره */
  const listing = await db.listing.findFirstOrThrow({ select: { id: true } });
  await Promise.all(
    [
      { ref: orderRef, buyerId: mine, sellerId: theirs },
      { ref: otherOrderRef, buyerId: theirs, sellerId: theirs },
    ].map((row) =>
      db.order.create({
        data: {
          ref: row.ref,
          listingId: listing.id,
          buyerId: row.buyerId,
          sellerId: row.sellerId,
          source: 'DIRECT',
          agreedPrice: 1,
          commissionPct: 0,
          commissionAmount: 0,
          totalAmount: 1,
          createdAt: T0,
        },
        select: { ref: true },
      }),
    ),
  );
});

afterAll(async () => {
  /* ما يُكتب في اختبارٍ يُحذف فيه — والإشعار يتبع المستخدم بـCascade */
  await db.order.deleteMany({ where: { ref: { in: [orderRef, otherOrderRef] } } });
  await db.user.deleteMany({ where: { id: { in: [mine, theirs] } } });
  await db.notificationTemplate.deleteMany({ where: { key: 'test.greeting' } });
  await db.$disconnect();
});

describe('مركز الإشعارات', () => {
  it('يكتب من المدخل الواحد ويصوغ من القالب', async () => {
    await notify({
      userId: mine,
      templateKey: 'test.greeting',
      payload: { name: 'سارة', count: '3' },
    });

    const rows = await listNotifications(mine);
    const row = rows.find((item) => item.key === 'test.greeting');

    expect(row).toBeDefined();
    expect(row?.title).toBe('مرحبًا سارة');
    expect(row?.body).toBe('لديك 3 شيءٌ ينتظر.');
  });

  it('المفتاح بلا قالب يُعرض خامًا لا فارغًا', async () => {
    await notify({ userId: mine, templateKey: 'test.absent' });

    const rows = await listNotifications(mine);
    const row = rows.find((item) => item.key === 'test.absent');

    /* سطرٌ يقول مفتاحه أوضح من سطرٍ أبيض — والبوابة ٣٧ تمنع وقوعه أصلًا */
    expect(row?.title).toBe('test.absent');
  });

  it('لا يقرأ أحدٌ إشعار غيره ولو ملك معرّفه', async () => {
    await notify({ userId: theirs, templateKey: 'test.greeting', payload: { name: 'ن' } });

    const target = await db.notification.findFirstOrThrow({
      where: { userId: theirs },
      select: { id: true },
    });

    const marked = await markRead(mine, [target.id]);

    expect(marked).toBe(0);
    const still = await db.notification.findUniqueOrThrow({
      where: { id: target.id },
      select: { readAt: true },
    });
    expect(still.readAt).toBeNull();
  });

  it('يعدّ غير المقروء ويضع العلامة على الكلّ', async () => {
    const before = await unreadCount(mine);
    expect(before).toBeGreaterThan(0);

    await markAllRead(mine);

    expect(await unreadCount(mine)).toBe(0);
    /* وعلى صاحبها وحدها — جارُه لا يُمسّ */
    expect(await unreadCount(theirs)).toBeGreaterThan(0);
  });

  describe('الوجهة', () => {
    it('تُبنى لطلبٍ المستلم طرفٌ فيه', async () => {
      await notify({
        userId: mine,
        templateKey: 'test.greeting',
        entityType: 'Order',
        entityId: orderRef,
      });

      const row = (await listNotifications(mine)).find((item) => item.href !== null);
      expect(row?.href).toBe(`/ar/account/orders/${orderRef}`);
    });

    it('تُترك فارغةً لطلبٍ لا وجود له', async () => {
      await notify({
        userId: mine,
        templateKey: 'test.greeting',
        entityType: 'Order',
        entityId: `ORD-TST-GONE-${stamp}`,
      });

      const rows = await listNotifications(mine);
      const row = rows.find((item) => item.key === 'test.greeting');
      /*
        **الاسم ليس الوجود.** بُني الرابط من المرجع بلا استعلام فوصل
        النقرُ إلى «لا توجد هذه الصفحة» — والمرجع كان صحيحًا والطلب محذوفًا.
      */
      expect(rows.filter((item) => item.href?.includes('GONE')).length).toBe(0);
      expect(row).toBeDefined();
    });

    it('تُترك فارغةً لطلبٍ المستلم ليس طرفًا فيه', async () => {
      await notify({
        userId: mine,
        templateKey: 'test.greeting',
        entityType: 'Order',
        entityId: otherOrderRef,
      });

      const rows = await listNotifications(mine);
      /* صفحة الطلب لطرفيه — فرابطٌ إلى طلب غيرهما يفتح ٤٠٤ كذلك */
      expect(rows.filter((item) => item.href?.includes(otherOrderRef)).length).toBe(0);
    });

    it('لا وجهة للنزاع — ولا شاشةَ مستخدمٍ له', async () => {
      await notify({
        userId: mine,
        templateKey: 'test.greeting',
        entityType: 'Dispute',
        entityId: 'any',
      });

      const rows = await listNotifications(mine);
      expect(rows.filter((item) => item.href?.includes('dispute')).length).toBe(0);
    });
  });

  it('يكتب لعدّة مستلمين صفًّا لكلٍّ', async () => {
    const before = await db.notification.count({ where: { userId: { in: [mine, theirs] } } });

    await notifyMany([
      { userId: mine, templateKey: 'test.greeting', payload: { name: 'أ' } },
      { userId: theirs, templateKey: 'test.greeting', payload: { name: 'ب' } },
    ]);

    const after = await db.notification.count({ where: { userId: { in: [mine, theirs] } } });
    expect(after - before).toBe(2);
  });
});
