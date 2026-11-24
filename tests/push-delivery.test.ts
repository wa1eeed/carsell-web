import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import {
  OPT_OUT_WINDOW_HOURS,
  channelImpact,
  queueSend,
  ratePct,
  recordEvent,
  recordPermission,
} from '../src/lib/domain/push-delivery';

/**
 * ═══ أثرُ الإشعار — ولا نسبةَ بلا مقام ═══
 *
 * بطاقاتُ A10 الأربع كانت غائبةً، والشاشة تعرض عدد الأجهزة وحده.
 * وهذه تفحص ما يجعلها صادقة: أنّ «لا بيانات» ليست صفرًا، وأنّ كلَّ
 * مقامٍ يستثني ما لا يخصّه، وأنّ مرجعًا من الخارج لا يُعلّم إرسالةَ
 * غيره.
 *
 * **والحكمُ على القناة المعنيّة لا على عدّادٍ عامّ**: `pushImpact`
 * تمرّ على كل الصفوف، فاختبارٌ يحكم عليها يسقط بما لا يقيسه.
 */

const CHANNEL = 'offers_mine';
const PHONE = '+966500000911';
const created: { sends: string[]; users: string[] } = { sends: [], users: [] };

async function testUser(): Promise<string> {
  const user = await db.user.upsert({
    where: { phone: PHONE },
    create: { phone: PHONE, name: 'فحص الدفع' },
    update: {},
    select: { id: true },
  });
  if (!created.users.includes(user.id)) created.users.push(user.id);
  return user.id;
}

async function send(userId: string | null, status: string): Promise<string> {
  const id = await queueSend({ channelKey: CHANNEL, userId, templateKey: 'offer.received' });
  if (status !== 'queued') {
    await db.pushSend.update({ where: { id }, data: { status } });
  }
  created.sends.push(id);
  return id;
}

/**
 * **والاختبار يعيد ما غيّره.** صفُّ إرسالٍ يبقى يدخل كلَّ مقامٍ في كل
 * تشغيلٍ تالٍ، فتقرأ الشاشة نسبةً صنعها اختبار.
 */
afterAll(async () => {
  await db.pushSend.deleteMany({ where: { id: { in: created.sends } } });
  await db.pushPermission.deleteMany({ where: { userId: { in: created.users } } });
  await db.deviceToken.deleteMany({ where: { userId: { in: created.users } } });
  await db.notificationPreference.deleteMany({ where: { userId: { in: created.users } } });
  await db.user.deleteMany({ where: { id: { in: created.users } } });
});

describe('أثر الإشعار', () => {
  it('«لا قياس» ليست صفرًا — والمقام هو الفرق', () => {
    expect(ratePct({ numerator: 0, denominator: 0, measured: false })).toBeNull();
    expect(ratePct({ numerator: 0, denominator: 4, measured: true })).toBe(0);
  });

  it('وتُقرَّب إلى خانةٍ عشرية واحدة — فرقُ ٩٤٫٨ و٩٥٫٢ قرارُ تشغيل', () => {
    expect(ratePct({ numerator: 948, denominator: 1000, measured: true })).toBe(94.8);
    expect(ratePct({ numerator: 952, denominator: 1000, measured: true })).toBe(95.2);
  });

  it('والطابور خارج مقام التسليم — وإلّا قُرئ ازدحامُه انهيارًا', async () => {
    const userId = await testUser();

    const before = (await channelImpact()).find((row) => row.channelKey === CHANNEL);
    const baseDen = before?.delivery.denominator ?? 0;

    await send(userId, 'queued');
    const queued = (await channelImpact()).find((row) => row.channelKey === CHANNEL);
    expect(queued?.delivery.denominator ?? 0).toBe(baseDen);

    /** والفاشل يدخل المقام — فشلُ التسليم هو ما تقيسه البطاقة. */
    await send(userId, 'failed');
    const failed = (await channelImpact()).find((row) => row.channelKey === CHANNEL);
    expect(failed?.delivery.denominator ?? 0).toBe(baseDen + 1);
  });

  it('والفتحُ يثبّت التسليمَ معه — فما لم يصل لا يُفتح', async () => {
    const userId = await testUser();
    const id = await send(userId, 'sent');

    const result = await recordEvent(id, 'opened', { ownerId: userId });
    expect(result.ok).toBe(true);

    const row = await db.pushSend.findUniqueOrThrow({
      where: { id },
      select: { status: true, deliveredAt: true, openedAt: true },
    });
    expect(row.status).toBe('delivered');
    expect(row.deliveredAt).not.toBeNull();
    expect(row.openedAt).not.toBeNull();
  });

  it('وأوّلُ فتحٍ هو الفتح — فلا ينمو الصفّ بعدد ما يُرسله الجهاز', async () => {
    const userId = await testUser();
    const id = await send(userId, 'sent');

    await recordEvent(id, 'opened', { ownerId: userId, at: new Date('2026-11-01T10:00:00Z') });
    await recordEvent(id, 'opened', { ownerId: userId, at: new Date('2026-11-02T10:00:00Z') });

    const row = await db.pushSend.findUniqueOrThrow({
      where: { id },
      select: { openedAt: true },
    });
    expect(row.openedAt?.toISOString()).toBe('2026-11-01T10:00:00.000Z');
  });

  it('ومرجعٌ ليس لصاحبه يُردّ — وإلّا عُلِّمت إرسالةُ غيره «فُتحت»', async () => {
    const userId = await testUser();
    const id = await send(userId, 'sent');

    const result = await recordEvent(id, 'opened', { ownerId: 'someone-else' });
    expect(result.ok).toBe(false);

    const row = await db.pushSend.findUniqueOrThrow({
      where: { id },
      select: { openedAt: true },
    });
    expect(row.openedAt).toBeNull();
  });

  it('ومرجعٌ لا وجود له يُردّ ولا يُنشئ شيئًا', async () => {
    const before = await db.pushSend.count();
    expect((await recordEvent('no-such-send', 'delivered')).ok).toBe(false);
    expect(await db.pushSend.count()).toBe(before);
  });

  it('والإذنُ يُكتب عند السؤال وعند الجواب — وإلّا كان المقام هو البسط', async () => {
    const userId = await testUser();

    await recordPermission(userId, 'provisional', 'ios');
    const asked = await db.pushPermission.findUniqueOrThrow({ where: { userId } });
    expect(asked.status).toBe('provisional');
    expect(asked.answeredAt).toBeNull();

    await recordPermission(userId, 'denied');
    const answered = await db.pushPermission.findUniqueOrThrow({ where: { userId } });
    expect(answered.status).toBe('denied');
    expect(answered.answeredAt).not.toBeNull();
    /** **والمنصّة لا تنسى ما ردّ به**: الرفض صفٌّ كالقبول، وهو المقام. */
    expect(answered.platform).toBe('ios');
  });

  it('ونافذةُ الإيقاف ساعةٌ وعشرون كما في الترميز', () => {
    expect(OPT_OUT_WINDOW_HOURS).toBe(24);
  });

  /**
   * ═══ والطرفُ الآخر يُفحص: من يفتح الصفّ؟ ═══
   *
   * جدولٌ تملؤه الاختباراتُ وحدها يبدو عاملًا، والسؤال ليس «أفيه
   * صفوف؟» بل **«مَن يكتب الصفّ؟»**. وكاتبُه `notify` حين يحمل القالبُ
   * قناةَ دفعٍ ويكون لصاحبه جهاز.
   */
  it('وإشعارٌ لصاحب جهازٍ يفتح صفَّ دفع — ومن لا جهازَ له لا يفتح شيئًا', async () => {
    const { notify } = await import('../src/lib/domain/notifications');
    const template = await db.notificationTemplate.findFirst({
      where: { pushChannelKey: { not: null }, active: true },
      select: { key: true, pushChannelKey: true },
    });
    expect(template, 'لا قالب إشعارٍ بقناة دفع — الفحص بلا شرطه').not.toBeNull();
    if (template === null) return;

    const userId = await testUser();
    await db.pushSend.deleteMany({ where: { userId } });
    await db.deviceToken.deleteMany({ where: { userId } });

    /** بلا جهاز: لا صفّ — فلا يضخّم مستخدمُ ويبٍّ كلَّ مقام. */
    await notify({ userId, templateKey: template.key });
    expect(await db.pushSend.count({ where: { userId } })).toBe(0);

    /** وبجهاز: صفٌّ `queued` على قناة القالب. */
    const token = await db.deviceToken.create({
      data: { userId, token: `push-test-${userId}`, platform: 'ios' },
      select: { id: true },
    });
    await notify({ userId, templateKey: template.key });

    const queued = await db.pushSend.findMany({
      where: { userId },
      select: { id: true, status: true, channelKey: true, platform: true },
    });
    created.sends.push(...queued.map((row) => row.id));
    expect(queued).toHaveLength(1);
    expect(queued[0]?.status).toBe('queued');
    expect(queued[0]?.channelKey).toBe(template.pushChannelKey);
    expect(queued[0]?.platform).toBe('ios');

    await db.deviceToken.delete({ where: { id: token.id } });
    await db.notification.deleteMany({ where: { userId } });
  });

  it('وصفُّ الإرسال يسقط مع صاحبه — فلا يبقى في مقامٍ بلا من يقيسه', async () => {
    const user = await db.user.create({
      data: { phone: '+966500000912', name: 'يسقط مع صاحبه' },
      select: { id: true },
    });
    const id = await queueSend({ channelKey: CHANNEL, userId: user.id });

    await db.user.delete({ where: { id: user.id } });
    expect(await db.pushSend.findUnique({ where: { id } })).toBeNull();
  });
});
