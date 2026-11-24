import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { sendLog } from '@/lib/domain/push-delivery';

/**
 * ═══ سجلّ الإرسال (A10) ═══
 *
 * البطاقاتُ الأربع فوق الشاشة تقول **كم**، ولا شيء كان يقول **لمن**:
 * `PushSend` يُكتب منذ بُني و**لا شيء يقرأ صفوفَه** — القراءةُ كلُّها
 * `count` و`groupBy`. فالصفُّ يُكتب ولا يُرى.
 *
 * والمقيسُ هنا ثلاثةٌ، كلُّها حدٌّ **يُعبَر لا يُنتظَر**: الاقتطاعُ
 * يُقال مقامُه، والمرشِّحُ يضيّق الاثنين معًا، والمفتاحُ لا يُعرض خامًا.
 */

const made: string[] = [];
let madeUserId: string | null = null;

afterAll(async () => {
  if (made.length > 0) await db.pushSend.deleteMany({ where: { id: { in: made } } });
  if (madeUserId !== null) await db.user.deleteMany({ where: { id: madeUserId } });
  await db.$disconnect();
});

async function owner() {
  if (madeUserId !== null) return madeUserId;
  const row = await db.user.create({
    data: { phone: `+96657${String(Date.now()).slice(-7)}`, name: null },
  });
  madeUserId = row.id;
  return row.id;
}

async function send(status: string, templateKey: string | null, sentAt: Date) {
  const row = await db.pushSend.create({
    data: {
      channelKey: 'offers_mine',
      userId: await owner(),
      templateKey,
      platform: 'ios',
      status,
      sentAt,
    },
    select: { id: true },
  });
  made.push(row.id);
  return row.id;
}

describe('سجلُّ إرسال الدفع', () => {
  it('الاقتطاع يُقال مقامُه — والمعروض ليس المجموع', async () => {
    const base = new Date('2026-07-01T10:00:00.000Z');
    for (let i = 0; i < 3; i += 1) {
      await send('queued', null, new Date(base.getTime() + i * 60_000));
    }

    /**
     * **والحدُّ يُختبَر بتجاوزه.** `take: 2` على ثلاثة صفوف: فلو
     * ساوى `total` طولَ المعروض لقرأ المشغّل «٢ من ٢» وفي القاعدة
     * ثلاثة — وهو اقتطاعٌ صامت.
     */
    const log = await sendLog(null, 2);
    expect(log.rows.length).toBe(2);
    expect(log.total).toBeGreaterThanOrEqual(3);
    expect(log.total).toBeGreaterThan(log.rows.length);
  });

  it('والأحدثُ أوّلًا — فالسجلّ يُقرأ من رأسه', async () => {
    const log = await sendLog(null, 3);
    const stamps = log.rows.map((row) => Date.parse(row.sentAt));
    expect([...stamps]).toEqual([...stamps].sort((a, b) => b - a));
  });

  /**
   * **والمرشِّح يضيّق البسط والمقام معًا.** مرشِّحٌ يضيّق الصفوف
   * ويترك المجموع كما هو يقول «٢ من ٨٠» على شريحةٍ فيها اثنان —
   * فيُقرأ اقتطاعًا وهو كلُّ ما في الشريحة.
   */
  it('والمرشّح يضيّق المجموع كما يضيّق الصفوف', async () => {
    const base = new Date('2026-07-02T10:00:00.000Z');
    await send('failed', null, base);

    const all = await sendLog(null, 100);
    const failed = await sendLog('failed', 100);

    expect(failed.total).toBeLessThan(all.total);
    expect(failed.rows.every((row) => row.status === 'failed')).toBe(true);
    expect(failed.total).toBe(failed.rows.length);
  });

  /**
   * **والقالبُ بعنوانه لا بمفتاحه**: `viewing.requested` يُقرأ شيفرةً
   * لا خبرًا. ومفتاحٌ لا قالبَ له يبقى كما هو — فالصفُّ يُقرأ ولا يختفي.
   */
  it('والقالب يُعرض بعنوانه، والمفقود بمفتاحه', async () => {
    const template = await db.notificationTemplate.findFirst({
      where: { channelPush: true, active: true, subjectAr: { not: null } },
      select: { key: true, subjectAr: true },
    });
    expect(template, 'لا قالب دفع مزروع').not.toBeNull();
    if (template === null) return;

    const base = new Date('2026-07-03T10:00:00.000Z');
    await send('delivered', template.key, base);
    await send('delivered', 'no.such.template', new Date(base.getTime() - 60_000));

    const log = await sendLog(null, 100);
    const known = log.rows.find((row) => row.templateKey === template.key);
    const unknown = log.rows.find((row) => row.templateKey === 'no.such.template');

    expect(known?.templateTitleAr).toBe(template.subjectAr);
    expect(unknown?.templateTitleAr).toBeNull();
    expect(unknown?.templateKey).toBe('no.such.template');
  });

  /** **وصاحبُ الإشعار باسمه، وبجوّاله حين لا اسم** — لا بمعرّفٍ داخليّ. */
  it('والمستخدم باسمه أو جواله لا بمعرّفه', async () => {
    const log = await sendLog(null, 100);
    const mine = log.rows.find((row) => row.userId === madeUserId);
    expect(mine, 'صفُّ القياس يجب أن يُدرَج').toBeDefined();
    expect(mine?.userName).not.toBeNull();
    expect(mine?.userName).not.toBe(madeUserId);
    expect(mine?.userName?.startsWith('+966')).toBe(true);
  });

  /** وقناةُ الصفّ باسمها العربيّ — والمفتاح بجواره للربط لا للقراءة. */
  it('والقناة باسمها العربي', async () => {
    const channel = await db.pushChannel.findUniqueOrThrow({
      where: { key: 'offers_mine' },
      select: { nameAr: true },
    });
    const log = await sendLog(null, 100);
    const mine = log.rows.find((row) => row.userId === madeUserId);
    expect(mine?.channelNameAr).toBe(channel.nameAr);
  });
});
