import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  adsFor,
  createCampaign,
  recordClick,
  recordImpression,
  setCampaignPaused,
} from '@/lib/domain/ads';

/**
 * ═══ الإعلان المموّل — بندُ إيرادٍ لا يمكن أن يوجد ═══
 *
 * `AdSlot` مزروعةٌ بسبع مساحات وأسعارها، و`AdCampaign` مقروءٌ في أربعة
 * مواضع **منها إيراد الإعلانات في شاشة المالية** — ولا شيء يكتب حملةً
 * ولا مسار يعرض إعلانًا. وهو الصنف الحادي عشر لـ«قيمةٌ في المخطّط بلا
 * كاتب»، والجديد فيه أن الأدمن يرى جدولًا فارغًا فيقرؤه «لا حملات
 * الآن» وصوابُه «لا سبيل إلى حملة».
 */

const T0 = new Date('2026-10-11T09:00:00Z');
const stamp = String(Date.now()).slice(-9);
const NAME = `معلن ${stamp}`;

async function actor() {
  return db.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
}

async function cleanup(): Promise<void> {
  const rows = await db.adCampaign.findMany({
    where: { advertiserName: { contains: stamp } },
    select: { id: true },
  });
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return;
  await db.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await db.adCampaign.deleteMany({ where: { id: { in: ids } } });
}

afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

const BASE = {
  advertiserName: NAME,
  slotKey: 'search_inline',
  creativeUrl: 'https://cdn.example.com/a.jpg',
  targetUrl: 'https://example.com/landing',
  startsAt: new Date('2026-10-10T00:00:00Z'),
  endsAt: new Date('2026-10-20T00:00:00Z'),
  budget: '1500.00',
};

describe('الإعلان — الإنشاء', () => {
  it('يُنشئ حملةً جارية ويكتب أثرًا', async () => {
    const admin = await actor();
    const result = await createCampaign(admin, BASE, T0);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = await db.adCampaign.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.status).toBe('live');
    expect(row.impressions).toBe(0);

    const audit = await db.auditLog.findFirst({
      where: { entityId: result.id, action: 'ad.campaign.created' },
    });
    expect(audit).not.toBeNull();
  });

  it('وحملةٌ تبدأ غدًا تُكتب «مجدولة» لا «جارية»', async () => {
    /**
     * **والحالة تُشتقّ من النافذة لا تُؤخذ من المُدخِل.** حملةٌ
     * حالتُها `live` وتبدأ غدًا تُعرض في شريحة «نشطة» ولا يراها أحد —
     * ومن أنشأها يقرأ أنها تعمل.
     */
    const admin = await actor();
    const result = await createCampaign(
      admin,
      { ...BASE, startsAt: new Date('2026-10-12T00:00:00Z') },
      T0,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = await db.adCampaign.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.status).toBe('scheduled');
  });

  it('ورابطٌ غير http يُرفض عند الكتابة', async () => {
    /**
     * **والفحص عند الإنشاء لا عند النقر.** مسارُ النقر يُحوّل إلى
     * `targetUrl` كما هو — فقبولُ `javascript:` هنا يجعل لوحة الأدمن
     * بابًا لتحويلٍ مفتوح.
     */
    const admin = await actor();
    for (const bad of ['javascript:alert(1)', '/relative', 'ftp://x.com/a']) {
      const result = await createCampaign(admin, { ...BASE, targetUrl: bad }, T0);
      expect(result.ok, bad).toBe(false);
      if (!result.ok) expect(result.reason).toBe('BAD_URL');
    }
  });

  it('ونافذةٌ مقلوبة وميزانيةٌ صفرٌ تُرفضان', async () => {
    const admin = await actor();
    const flipped = await createCampaign(
      admin,
      { ...BASE, startsAt: BASE.endsAt, endsAt: BASE.startsAt },
      T0,
    );
    expect(flipped.ok).toBe(false);
    if (!flipped.ok) expect(flipped.reason).toBe('BAD_WINDOW');

    const free = await createCampaign(admin, { ...BASE, budget: '0' }, T0);
    expect(free.ok).toBe(false);
    if (!free.ok) expect(free.reason).toBe('BAD_BUDGET');
  });

  it('ومساحةٌ لا وجود لها تُرفض', async () => {
    const admin = await actor();
    const result = await createCampaign(admin, { ...BASE, slotKey: 'no_such_slot' }, T0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('SLOT_NOT_FOUND');
  });
});

describe('الإعلان — العرض', () => {
  it('الجارية تُعرض والمجدولة لا', async () => {
    const admin = await actor();
    await createCampaign(admin, BASE, T0);
    await createCampaign(
      admin,
      { ...BASE, advertiserName: `${NAME} غدًا`, startsAt: new Date('2026-10-12T00:00:00Z') },
      T0,
    );

    const served = await adsFor('search_inline', {}, T0, 10);
    const mine = served.filter((ad) => ad.advertiserName.includes(stamp));
    expect(mine).toHaveLength(1);
    expect(mine[0]?.advertiserName).toBe(NAME);
  });

  it('والاستهداف يُضيِّق ولا يُوسِّع', async () => {
    const admin = await actor();
    const result = await createCampaign(admin, { ...BASE, city: 'الرياض' }, T0);
    expect(result.ok).toBe(true);

    const inRiyadh = await adsFor('search_inline', { city: 'الرياض' }, T0, 10);
    expect(inRiyadh.some((ad) => ad.advertiserName === NAME)).toBe(true);

    const inJeddah = await adsFor('search_inline', { city: 'جدة' }, T0, 10);
    expect(inJeddah.some((ad) => ad.advertiserName === NAME)).toBe(false);

    /**
     * **ولا تُعرض حين لا نعرف المدينة.** عرضُ حملةٍ مستهدِفةٍ للرياض
     * على بحثٍ بلا مدينة بيعُ استهدافٍ لم يقع.
     */
    const anywhere = await adsFor('search_inline', {}, T0, 10);
    expect(anywhere.some((ad) => ad.advertiserName === NAME)).toBe(false);
  });

  it('والموقوفة لا تُعرض — وتعود بالاستئناف', async () => {
    const admin = await actor();
    const result = await createCampaign(admin, BASE, T0);
    if (!result.ok) throw new Error('setup');

    await setCampaignPaused(admin, result.id, true, T0);
    expect(
      (await adsFor('search_inline', {}, T0, 10)).some((ad) => ad.advertiserName === NAME),
    ).toBe(false);

    await setCampaignPaused(admin, result.id, false, T0);
    expect(
      (await adsFor('search_inline', {}, T0, 10)).some((ad) => ad.advertiserName === NAME),
    ).toBe(true);
  });

  it('ولا يُعطى الرابط للشاشة — بل مسارٌ يَعُدّ ثمّ يُحوّل', async () => {
    /**
     * `search_inline` تُسعَّر `cpc` — فالنقرة بندُ فاتورة، ورابطٌ
     * يذهب إلى المعلن بلا مرورٍ بنا يجعلنا نبيع ما لا نَعُدّ.
     */
    const admin = await actor();
    const result = await createCampaign(admin, BASE, T0);
    if (!result.ok) throw new Error('setup');

    const served = await adsFor('search_inline', {}, T0, 10);
    const ad = served.find((row) => row.advertiserName === NAME);
    expect(ad?.clickPath).toBe(`/api/v1/ads/${result.id}/click`);
    expect(JSON.stringify(ad)).not.toContain('example.com/landing');
  });
});

describe('الإعلان — العدّادان', () => {
  it('الظهور والنقرة يُعدّان، والنقرة تعيد الوجهة', async () => {
    const admin = await actor();
    const result = await createCampaign(admin, BASE, T0);
    if (!result.ok) throw new Error('setup');

    await recordImpression(result.id);
    await recordImpression(result.id);
    const target = await recordClick(result.id);

    expect(target).toBe(BASE.targetUrl);
    const row = await db.adCampaign.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.impressions).toBe(2);
    expect(row.clicks).toBe(1);
  });

  it('وحملةٌ لا وجود لها لا تُسقط شيئًا', async () => {
    // من نقر يريد الوجهة — وخسارةُ عدّةٍ أهون من صفحة خطأ على نقرة
    await expect(recordImpression('no-such-id')).resolves.toBeUndefined();
    await expect(recordClick('no-such-id')).resolves.toBeNull();
  });
});
