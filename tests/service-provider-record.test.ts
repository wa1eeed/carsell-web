import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { serviceByKey } from '@/lib/domain/content';

/**
 * ═══ سجلُّ المزوّد في `Wx` ═══
 *
 * ترميز `Wx` يكتب في سطر المزوّد «٤٫٦ من ٥ · ١٬٢٤٠ فحصًا · التزام ٤٨
 * ساعة». والتقييمُ بلا مصدر (سؤالٌ معلَّق)، **والعددُ له مصدر**:
 * طلباتٌ أُنجزت باسمه.
 *
 * والمقيسُ أنّ العدّ **على المُنجَز وحده** — وطلبٌ جارٍ أو فاشل ليس
 * سجلًّا يُطمئن من يوشك أن يدفع خمسَ مئة ريال.
 */

const made: string[] = [];

afterAll(async () => {
  if (made.length > 0) await db.serviceRequest.deleteMany({ where: { id: { in: made } } });
  await db.$disconnect();
});

async function plant(providerId: string, status: 'DONE' | 'IN_PROGRESS' | 'FAILED') {
  const user = await db.user.findFirstOrThrow({ select: { id: true } });
  const service = await db.service.findFirstOrThrow({
    where: { key: 'inspection' },
    select: { id: true },
  });
  const row = await db.serviceRequest.create({
    data: {
      ref: `SRVT-${String(Date.now()).slice(-9)}-${String(made.length)}`,
      serviceId: service.id,
      userId: user.id,
      providerId,
      status,
      amount: 450,
      vatAmount: 67.5,
    },
    select: { id: true },
  });
  made.push(row.id);
}

describe('سجلُّ المزوّد المعروض قبل الدفع', () => {
  it('يُعدّ المنجَز وحده — ويُعبَر الحدُّ بزرع الحالين', async () => {
    const before = await serviceByKey('inspection');
    expect(before, 'خدمةُ الفحص يجب أن تُفتح').not.toBeNull();
    if (before === null) return;

    const provider = await db.service.findFirstOrThrow({
      where: { key: 'inspection' },
      select: { providerId: true },
    });
    expect(provider.providerId, 'لا مزوّد لخدمة الفحص — فلا سجلّ يُقاس').not.toBeNull();
    if (provider.providerId === null) return;

    /** ① جارٍ وفاشل — لا يرفعان السجلّ. */
    await plant(provider.providerId, 'IN_PROGRESS');
    await plant(provider.providerId, 'FAILED');
    expect((await serviceByKey('inspection'))?.providerCompleted).toBe(before.providerCompleted);

    /** ② ومنجَزٌ يرفعه واحدًا. */
    await plant(provider.providerId, 'DONE');
    expect((await serviceByKey('inspection'))?.providerCompleted).toBe(
      before.providerCompleted + 1,
    );
  });

  /**
   * **والعدُّ لمزوّدِ هذه الخدمة لا لكلّ المزوّدين.** خدمةٌ تعرض سجلّ
   * غيرِ من سيؤدّيها تَعِد بخبرةٍ ليست له — وهو عينُ ما وقع في زرع
   * ردود المعارض حين سقط إلى «أيّ إعلان».
   */
  it('ولا يُحسب له ما أنجزه غيرُه', async () => {
    const other = await db.serviceProvider.findFirst({
      where: { services: { none: { key: 'inspection' } } },
      select: { id: true },
    });
    if (other === null) return;

    const before = (await serviceByKey('inspection'))?.providerCompleted ?? 0;
    await plant(other.id, 'DONE');
    expect((await serviceByKey('inspection'))?.providerCompleted).toBe(before);
  });

  /**
   * **والصفرُ لا يُعرض رقمًا.** «٠ خدمة منجزة» تحت اسم مزوّدٍ تُقرأ
   * اتّهامًا وهو لم يبدأ بعد — والشاشة تُسقط السطر، فالنطاق يُعيد صفرًا
   * صريحًا لا `null` يلتبس بـ«لا مزوّد».
   */
  it('والصفر يُعاد رقمًا صريحًا لتُسقطه الشاشة', async () => {
    const fresh = await db.serviceProvider.findFirst({
      where: { requests: { none: { status: 'DONE' } } },
      select: { id: true, services: { select: { key: true }, take: 1 } },
    });
    if (fresh === null || fresh.services[0] === undefined) return;

    const detail = await serviceByKey(fresh.services[0].key);
    if (detail === null) return;
    expect(detail.providerCompleted).toBe(0);
  });
});
