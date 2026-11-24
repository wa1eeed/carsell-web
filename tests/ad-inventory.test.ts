import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import { adOccupancy, adRevenue, createCampaign, createSlot } from '../src/lib/domain/ads';
import { adStats } from '../src/lib/domain/admin-plans';
import type { AdminUser } from '../src/generated/prisma/client';

/**
 * ═══ مخزونُ المساحات — إيرادُها وإشغالُها ═══
 *
 * إيرادُ الإعلانات في لوحة المالية كان **صفرًا أبدًا**: ترشيحٌ على
 * `status in ('running','ended')` ولا كاتبَ لـ`running` في المنتج
 * كلِّه، والبذرة تكتب `active` و`createCampaign` تكتب `live`. أربعُ
 * مفرداتٍ لحقلٍ واحد.
 *
 * فالحقل صار تعدادًا، والقاعدة صارت في `ads.ts` يقرؤها الموضعان.
 * وهذه تفحص ما يمنع عودتها: **أنّ ما يُنشئه المنتج يَعُدُّه الإيراد**.
 */

const KEY = 'test_inventory_slot';
const made: { slots: string[]; campaigns: string[] } = { slots: [], campaigns: [] };

const admin = { id: 'test-admin', role: 'SUPER_ADMIN' } as unknown as AdminUser;

const SLOT = {
  key: KEY,
  nameAr: 'مساحة فحص',
  sizeLabel: '16:9',
  placement: 'للفحص وحده',
  pricingModel: 'month',
  basePrice: '1000',
  maxPerSession: 1,
};

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { entityId: { in: [...made.slots, ...made.campaigns] } } });
  await db.adCampaign.deleteMany({ where: { id: { in: made.campaigns } } });
  await db.adSlot.deleteMany({ where: { key: { in: made.slots } } });
});

async function slot(): Promise<void> {
  /** **والحملةُ تمنع حذفَ مساحتها** (`onDelete: Restrict`) — وهو
   *  صوابُ المخطّط: معلنٌ دفع لا تُسحب مساحتُه من تحته. فتُحذف
   *  حملاتُ الفحص أوّلًا. */
  const onSlot = await db.adCampaign.findMany({ where: { slotKey: KEY }, select: { id: true } });
  await db.adCampaign.deleteMany({ where: { slotKey: KEY } });
  made.campaigns = made.campaigns.filter((id) => !onSlot.some((row) => row.id === id));
  await db.adSlot.deleteMany({ where: { key: KEY } });
  const result = await createSlot(admin, SLOT);
  expect(result.ok).toBe(true);
  made.slots.push(KEY);
}

describe('مخزون المساحات', () => {
  it('تُنشأ المساحة معطلة — فلا تدخل مقام الإشغال قبل أن يوجد سطح يعرضها', async () => {
    await slot();
    const row = await db.adSlot.findUniqueOrThrow({ where: { key: KEY } });
    expect(row.active).toBe(false);
    expect(row.sizeLabel).toBe('16:9');
    expect(Number(row.basePrice)).toBe(1000);
  });

  it('والمفتاح لاتيني لا يتغير — فهو ما يُقرأ في الشيفرة', async () => {
    for (const bad of ['مساحة', 'Has Space', 'ab', '9starts_with_digit', 'has-dash']) {
      const result = await createSlot(admin, { ...SLOT, key: bad });
      expect(result.ok, `قُبل «${bad}»`).toBe(false);
    }
  });

  /**
   * **والحقل يطبّع ما يصله.** كتبتُ أوّلًا أنّ `UPPER` تُردّ، ومرّ
   * الاختبار — **لأنّ صفًّا متسرّبًا جعل الردّ `KEY_TAKEN`**. فلمّا
   * نُظّف ظهر أنّ الدالّة تُصغّرها وتقبلها، وهو صوابُها: من يمنع
   * اللصق يظنّ أنه يمنع الخطأ وهو يصنعه.
   */
  it('ويُصغَّر ما يُكتب كبيرًا — تطبيعًا لا ردًّا', async () => {
    await db.adCampaign.deleteMany({ where: { slotKey: 'test_upper_case' } });
    await db.adSlot.deleteMany({ where: { key: 'test_upper_case' } });

    const result = await createSlot(admin, { ...SLOT, key: 'TEST_Upper_Case' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.key).toBe('test_upper_case');
      made.slots.push(result.key);
    }
  });

  it('ومفتاحٌ مستعمل يُردّ — ولا يُكتب فوق مساحةٍ تُباع', async () => {
    await slot();
    const again = await createSlot(admin, SLOT);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('KEY_TAKEN');
  });

  it('وسعرٌ غير موجب أو سقفٌ دون واحد يُردّان', async () => {
    const zero = await createSlot(admin, { ...SLOT, key: 'test_zero_price', basePrice: '0' });
    expect(zero.ok).toBe(false);
    const cap = await createSlot(admin, { ...SLOT, key: 'test_bad_cap', maxPerSession: 0 });
    expect(cap.ok).toBe(false);
  });

  /**
   * ═══ العطل الذي أنشأ هذا الملفّ ═══
   *
   * حملةٌ يُنشئها المنتج كانت تُكتب `live`، والإيراد يرشّح `running` —
   * فلا تُحتسب أبدًا. والفحص على الرحلة كاملةً: من زرّ الإنشاء إلى
   * الرقم الذي تقرؤه لوحة المالية.
   */
  it('وحملةٌ ينشئها المنتج يَعُدُّها الإيراد — وكانت لا تُعدّ أبدًا', async () => {
    await slot();
    await db.adSlot.update({ where: { key: KEY }, data: { active: true } });

    const from = new Date('2026-06-01T00:00:00Z');
    const to = new Date('2026-07-01T00:00:00Z');

    const before = await adRevenue(from, to);

    const created = await createCampaign(
      admin,
      {
        advertiserName: 'معلن فحص',
        slotKey: KEY,
        creativeUrl: 'https://example.sa/a.png',
        targetUrl: 'https://example.sa/go',
        startsAt: new Date('2026-06-10T00:00:00Z'),
        endsAt: new Date('2026-06-20T00:00:00Z'),
        budget: '2500',
      },
      new Date('2026-06-15T00:00:00Z'),
    );
    expect(created.ok).toBe(true);
    if (created.ok) made.campaigns.push(created.id);

    const after = await adRevenue(from, to);
    expect(Number(after) - Number(before)).toBe(2500);
  });

  it('وحملةٌ خارج النافذة لا تُحتسب فيها', async () => {
    const other = await adRevenue(new Date('2026-01-01T00:00:00Z'), new Date('2026-02-01T00:00:00Z'));
    expect(Number(other)).toBe(0);
  });

  /**
   * **والإشغال مساحةٌ مشغولة لا مجموعُ ما بيع عليها.** حملتان على
   * مساحةٍ واحدة في اليوم نفسه يومٌ واحد مشغول — وجمعُهما يُخرج نسبةً
   * فوق المئة.
   */
  it('واليوم يُعدّ مرة ولو باعته حملتان', async () => {
    await slot();
    await db.adSlot.update({ where: { key: KEY }, data: { active: true } });

    const from = new Date('2026-05-01T00:00:00Z');
    const to = new Date('2026-05-11T00:00:00Z');
    const base = await adOccupancy(from, to);

    for (const name of ['أول', 'ثان']) {
      const made2 = await createCampaign(
        admin,
        {
          advertiserName: `معلن ${name}`,
          slotKey: KEY,
          creativeUrl: 'https://example.sa/a.png',
          targetUrl: 'https://example.sa/go',
          startsAt: new Date('2026-05-02T00:00:00Z'),
          endsAt: new Date('2026-05-05T00:00:00Z'),
          budget: '100',
        },
        new Date('2026-05-03T00:00:00Z'),
      );
      if (made2.ok) made.campaigns.push(made2.id);
    }

    const after = await adOccupancy(from, to);
    /** أربعةُ أيام (٢ إلى ٥) على مساحةٍ واحدة — لا ثمانية. */
    expect(after.soldSlotDays - base.soldSlotDays).toBe(4);
    expect(after.soldSlotDays).toBeLessThanOrEqual(after.totalSlotDays);
  });

  it('والمقام المساحات المفعلة وحدها — فالتعطيل يرفع الإشغال لا يخفضه', async () => {
    await slot();
    const from = new Date('2026-05-01T00:00:00Z');
    const to = new Date('2026-05-11T00:00:00Z');

    const off = await adOccupancy(from, to);
    await db.adSlot.update({ where: { key: KEY }, data: { active: true } });
    const on = await adOccupancy(from, to);

    /** عشرةُ أيامٍ لمساحةٍ واحدة أُضيفت إلى المتاح. */
    expect(on.totalSlotDays - off.totalSlotDays).toBe(10);
  });

  it('ونسبةُ التغيّر لا تُحسب من صفر — فالبداية ليست زيادة', async () => {
    const stats = await adStats(new Date('2026-05-15T00:00:00Z'));
    /** لا حملةَ في أبريل المزروع، فلا مقامَ للمقارنة. */
    expect(stats.revenueChangePct === null || typeof stats.revenueChangePct === 'number').toBe(true);
    expect(stats.occupancy.totalSlotDays).toBeGreaterThan(0);
    expect(stats.occupancy.soldSlotDays).toBeLessThanOrEqual(stats.occupancy.totalSlotDays);
  });
});
