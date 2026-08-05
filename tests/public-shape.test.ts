import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { findPublishedListing, toPublicDetail } from '@/lib/domain/listing-detail';

/**
 * ═══ الشكل العامّ لا يحمل ما لا يخرج ═══
 *
 * صفحة السيارة عامّة، وحمولتها تُقرأ بـ«عرض المصدر» بلا أدوات. فكل
 * حقلٍ في `PublicListingDetail` يصل إلى الإنترنت — والحارس ليس في نيّة
 * من يكتب الشاشة بل في **شكل ما تعطيه إيّاه**.
 *
 * والفحص على القيم لا على المفاتيح: مفتاحٌ يُعاد تسميته يتخطّى فحص
 * الأسماء، والقيمة نفسها تبقى.
 */
const FORBIDDEN_KEYS = [
  'iban', 'phone', 'email', 'vin', 'plateNumbers', 'plateLetters',
  'nationalIdEncrypted', 'minAcceptPrice', 'reservePrice', 'sellerId',
];

function walk(value: unknown, path: string, hits: string[]): void {
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const here = path === '' ? key : `${path}.${key}`;
    if (FORBIDDEN_KEYS.includes(key)) hits.push(here);
    walk(child, here, hits);
  }
}

describe('الشكل العامّ لصفحة السيارة', () => {
  it('لا يحمل هاتفًا ولا بريدًا ولا آيبانًا ولا رقم هيكل ولا احتياطيًّا', async () => {
    const listing = await db.listing.findFirst({
      where: { status: 'PUBLISHED' },
      select: { ref: true },
    });
    expect(listing).not.toBeNull();
    if (listing === null) return;

    const row = await findPublishedListing(listing.ref);
    expect(row).not.toBeNull();
    if (row === null) return;

    const detail = await toPublicDetail(row);

    const hits: string[] = [];
    walk(detail, '', hits);
    expect(hits).toEqual([]);
  });

  /**
   * **والقيم تُفحص نصًّا أيضًا.** حقلٌ يُنسخ إلى اسمٍ بريء (`contact`)
   * يتخطّى فحص المفاتيح، والرقم نفسه يبقى في الحمولة.
   */
  it('لا تظهر قيمة هاتف البائع ولا آيبانه في الشكل المُسلسَل', async () => {
    const seller = await db.user.findFirst({
      where: { listings: { some: { status: 'PUBLISHED' } }, iban: { not: null } },
      select: { phone: true, iban: true, listings: { where: { status: 'PUBLISHED' }, take: 1, select: { ref: true } } },
    });
    if (seller === null || seller.listings[0] === undefined) return;

    const row = await findPublishedListing(seller.listings[0].ref);
    if (row === null) return;

    const json = JSON.stringify(await toPublicDetail(row));
    expect(json).not.toContain(seller.phone);
    if (seller.iban !== null) expect(json).not.toContain(seller.iban);
  });
});
