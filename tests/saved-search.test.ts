import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  SAVED_SEARCH_LIMIT,
  isSaved,
  markSeen,
  removeSearch,
  saveSearch,
  savedSearches,
  setNotify,
} from '@/lib/domain/saved-search';

/**
 * ═══ البحث المحفوظ ═══
 *
 * العطل الذي وُلد منه هذا الملف: **نموذجٌ في المخطّط بلا كاتبٍ ولا
 * قارئ** — وقرار المصمّم ١٨ يضعه في المرحلة الأولى مع المفضّلة.
 * بُنيت المفضّلة وبقي هذا.
 */

const MADE: string[] = [];

afterAll(async () => {
  if (MADE.length > 0) await db.savedSearch.deleteMany({ where: { id: { in: MADE } } });
  await db.$disconnect();
});

async function user(): Promise<string> {
  const row = await db.user.findFirstOrThrow({
    where: { savedSearches: { none: {} } },
    select: { id: true },
  });
  return row.id;
}

const keep = (result: { ok: true; id: string } | { ok: false; reason: string }): string => {
  if (!result.ok) throw new Error(result.reason);
  MADE.push(result.id);
  return result.id;
};

describe('حفظ البحث', () => {
  it('يحفظ ثم يُقرأ بنفس الرابط', async () => {
    const userId = await user();
    keep(await saveSearch(userId, { query: 'condition=USED&priceMax=100000' }));

    const rows = await savedSearches(userId);
    expect(rows).toHaveLength(1);
    // والفلاتر تُخزَّن سلسلةَ رابط — فما يُحفظ هو ما يُفتح
    expect(rows[0]?.query).toContain('condition=USED');
    expect(rows[0]?.query).toContain('priceMax=100000');
    expect(rows[0]?.notify).toBe(true);
  });

  /**
   * **وبحثٌ بلا فلتر ليس بحثًا.** حفظ «كل السيارات» يُنتج تنبيهًا عند
   * كل إعلانٍ في المنصّة — فيُطفئ صاحبه التنبيهات كلّها.
   */
  it('يرفض بحثًا بلا فلتر', async () => {
    const userId = await user();
    expect(await saveSearch(userId, { query: '' })).toEqual({ ok: false, reason: 'EMPTY_FILTERS' });
    expect(await saveSearch(userId, { query: 'sort=newest' })).toEqual({
      ok: false,
      reason: 'EMPTY_FILTERS',
    });
    // والصفحة ليست فلترًا — `page=3` وحدها بحثٌ فارغ
    expect(await saveSearch(userId, { query: 'page=3' })).toEqual({
      ok: false,
      reason: 'EMPTY_FILTERS',
    });
  });

  /** **والترتيب لا يفرّق بحثًا عن بحث** — فالتطبيع قبل المقارنة. */
  it('يرفض المكرَّر ولو اختلف ترتيب معاملاته', async () => {
    const userId = await user();
    keep(await saveSearch(userId, { query: 'city=الرياض&condition=NEW' }));

    expect(await saveSearch(userId, { query: 'condition=NEW&city=الرياض' })).toEqual({
      ok: false,
      reason: 'DUPLICATE',
    });
    /** والصفحة تُطرح قبل الحفظ — فصفحةٌ ثانية ليست بحثًا ثانيًا. */
    expect(await saveSearch(userId, { query: 'city=الرياض&condition=NEW&page=4' })).toEqual({
      ok: false,
      reason: 'DUPLICATE',
    });
  });

  it('يقول للزرّ إن البحث محفوظ', async () => {
    const userId = await user();
    keep(await saveSearch(userId, { query: 'bodyType=SUV' }));

    expect(await isSaved(userId, 'bodyType=SUV')).toBe(true);
    expect(await isSaved(userId, 'bodyType=SEDAN')).toBe(false);
    /** وزائرٌ بلا حساب لا يُستعلم له — ولا يرمي. */
    expect(await isSaved(null, 'bodyType=SUV')).toBe(false);
  });

  it('يحترم سقف المحفوظات', async () => {
    const userId = await user();
    for (let at = 0; at < SAVED_SEARCH_LIMIT; at += 1) {
      keep(await saveSearch(userId, { query: `priceMax=${String(50_000 + at * 1_000)}` }));
    }
    expect(await saveSearch(userId, { query: 'priceMax=999000' })).toEqual({
      ok: false,
      reason: 'LIMIT_REACHED',
    });
  });

  it('يبدّل التنبيه ويحذف — ولا يمسّ بحث غيره', async () => {
    const userId = await user();
    const id = keep(await saveSearch(userId, { query: 'fuel=HYBRID' }));

    expect(await setNotify(userId, id, false)).toBe(true);
    expect((await savedSearches(userId))[0]?.notify).toBe(false);

    /** **والحذف بـ`userId` معًا** — فلا يحذف أحدٌ بحث غيره بمعرّفٍ مُخمَّن. */
    const other = await db.user.findFirstOrThrow({
      where: { id: { not: userId } },
      select: { id: true },
    });
    expect(await removeSearch(other.id, id)).toBe(false);
    expect(await setNotify(other.id, id, true)).toBe(false);

    expect(await removeSearch(userId, id)).toBe(true);
    expect(await savedSearches(userId)).toHaveLength(0);
  });
});

describe('«كم جدّ منذ زيارتك»', () => {
  /**
   * **و«الجديد» يُحسب من لحظة الحفظ لا من الصفر** — وإلّا فتح صاحبه
   * القائمة فوجد خمسةً وأربعين جديدًا عن بحثٍ حفظه قبل ثانية.
   */
  it('يبدأ صفرًا عند الحفظ', async () => {
    const userId = await user();
    keep(await saveSearch(userId, { query: 'condition=USED' }));
    expect((await savedSearches(userId))[0]?.fresh).toBe(0);
  });

  it('يعدّ ما نُشر بعد آخر زيارة', async () => {
    const userId = await user();
    const id = keep(await saveSearch(userId, { query: 'condition=USED' }));

    /** إرجاعُ «آخر زيارة» يجعل كل المنشور قبلها جديدًا — بلا زرع صفّ. */
    await db.savedSearch.update({ where: { id }, data: { lastSeenAt: new Date('2000-01-01') } });

    const published = await db.listing.count({
      where: { status: 'PUBLISHED', vehicle: { condition: 'USED' } },
    });
    expect((await savedSearches(userId))[0]?.fresh).toBe(published);

    /** و«رأيتُه» يُصفّره. */
    await markSeen(userId, id);
    expect((await savedSearches(userId))[0]?.fresh).toBe(0);
  });
});
