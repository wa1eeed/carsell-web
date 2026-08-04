import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { checkApiKey, mintKey } from '@/lib/api/public-key';
import { publicListing, publicListings } from '@/lib/domain/public-api';

let raw = '';
let keyId = '';

beforeAll(async () => {
  const minted = mintKey();
  raw = minted.raw;
  const row = await db.apiKey.create({
    data: {
      name: 'اختبار',
      prefix: minted.prefix,
      keyHash: minted.keyHash,
      scopes: [],
      createdBy: 'test',
    },
  });
  keyId = row.id;
});

afterAll(async () => {
  await db.apiKey.deleteMany({ where: { id: keyId } });
  await db.$disconnect();
});

describe('مفتاح الوصول', () => {
  /**
   * **مجزّأ لا خام**: قاعدةٌ مسروقة تُعطي السارق مفاتيح عملاء يعملون
   * بها فورًا. والمخزَّن لا يُشبه المُرسَل.
   */
  it('لا يُخزَّن المفتاح خامًا', async () => {
    const row = await db.apiKey.findUniqueOrThrow({ where: { id: keyId } });
    expect(row.keyHash).not.toBe(raw);
    expect(row.keyHash).not.toContain(raw.slice(8));
    // والبادئة للتعرّف وحدها ولا تكفي للاستعمال
    expect(raw.startsWith(row.prefix)).toBe(true);
    expect(await checkApiKey(row.prefix)).toEqual({ ok: false, reason: 'INVALID' });
  });

  it('يقبل الصحيح بصيغتيه، ويرفض غيره', async () => {
    expect((await checkApiKey(raw)).ok).toBe(true);
    expect((await checkApiKey(`Bearer ${raw}`)).ok).toBe(true);
    expect(await checkApiKey(null)).toEqual({ ok: false, reason: 'MISSING' });
    expect(await checkApiKey('')).toEqual({ ok: false, reason: 'MISSING' });
    expect(await checkApiKey('csk_wrongwrongwrong')).toEqual({ ok: false, reason: 'INVALID' });
  });

  /** المسحوب **غير** غير الموجود: الأوّل قرارٌ اتُّخذ والثاني خطأ إعداد. */
  it('المسحوب يُميَّز عن غير الموجود', async () => {
    await db.apiKey.update({ where: { id: keyId }, data: { active: false } });
    expect(await checkApiKey(raw)).toEqual({ ok: false, reason: 'REVOKED' });
    await db.apiKey.update({ where: { id: keyId }, data: { active: true } });
  });
});

describe('الـAPI العام لا يُسرّب سرًّا تجاريًّا', () => {
  /**
   * **الحقلان لا يخرجان بحال.** والمُسلسِل يجعل ذلك بنيويًّا: `select`
   * لا يذكرهما أصلًا، فلا يكفي أن ينساهما مراجع.
   */
  it('لا reservePrice ولا minAcceptPrice في أي استجابة', async () => {
    const page = await publicListings({ limit: 50 });
    const text = JSON.stringify(page);
    expect(text).not.toContain('reservePrice');
    expect(text).not.toContain('minAcceptPrice');

    const first = page.items[0];
    if (first !== undefined) {
      const one = await publicListing(first.ref);
      expect(JSON.stringify(one)).not.toContain('reservePrice');
      expect(JSON.stringify(one)).not.toContain('minAcceptPrice');
    }
  });

  it('لا يعيد إلا المنشور', async () => {
    const page = await publicListings({ limit: 100 });
    const refs = page.items.map((item) => item.ref);
    const rows = await db.listing.findMany({
      where: { ref: { in: refs } },
      select: { status: true },
    });
    expect(rows.every((row) => row.status === 'PUBLISHED')).toBe(true);
  });

  /**
   * الترقيم بمؤشّر: صفحةٌ رقمية تُكرّر عنصرًا وتُسقط آخر حين يُنشَر
   * إعلانٌ بينهما، والمستهلِك لا يعرف أنه فقد شيئًا.
   */
  it('المؤشّر يتقدّم بلا تكرار', async () => {
    const first = await publicListings({ limit: 2 });
    if (first.nextCursor === null) return;
    const second = await publicListings({ limit: 2, cursor: first.nextCursor });
    const overlap = first.items
      .map((item) => item.ref)
      .filter((ref) => second.items.some((item) => item.ref === ref));
    expect(overlap).toEqual([]);
  });

  it('السقف مئة — فلا يصير الفهرس كشطةً واحدة', async () => {
    const page = await publicListings({ limit: 100 });
    expect(page.items.length).toBeLessThanOrEqual(100);
  });
});
