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
  'iban', 'phone', 'email', 'vin',
  /**
   * **والبطاقةُ الجمركية محظورةٌ بإطلاق** — بخلاف اللوحة. اللوحةُ
   * يختار صاحبُها إظهارها لأنّها تُرى في الشارع؛ والبطاقةُ مستندُ
   * استيرادٍ لا يُرى، وعرضُها لا يفيد مشتريًا ويُفيد من ينتحل.
   */
  'customsCard',
  /**
   * **وحالُ الفحص الدوريّ ورخصةِ السير لا تخرجان** (قرار المالك
   * ٢٠٢٦-١٠-١٨): شأنُ المالك ومن يفحص، لا بندٌ في إعلان. وهما
   * تُقرآن في لوحة الأدمن وفي صفحة سيارته وحدهما.
   */
  'periodicInspection',
  'licenseStatus',
  'nationalIdEncrypted', 'minAcceptPrice', 'reservePrice', 'sellerId',
];

/**
 * ═══ واللوحةُ ليست محظورةً بإطلاق — بل بإذن صاحبها ═══
 *
 * كانت `plateLetters` و`plateNumbers` في قائمة المحظور بإطلاق، ثمّ
 * قرّر المالك (٢٠٢٦-١٠-١٨) أن تُعرض **إن اختار البائع**
 * (`Listing.showPlate`). فالقاعدةُ تبدّلت، والاختبارُ يتبعها —
 * **ويشتدّ**: المحظورُ المطلق لا يقيس الحال الخطرة الجديدة، وهي
 * لوحةٌ تخرج **وقد اختار صاحبُها الإخفاء**.
 */
const CONSENTED_KEYS = ['plateNumbers', 'plateLetters'];

function walkOf(value: unknown, path: string, hits: string[], keys: string[]): void {
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const here = path === '' ? key : `${path}.${key}`;
    if (keys.includes(key)) hits.push(here);
    walkOf(child, here, hits, keys);
  }
}

function walk(value: unknown, path: string, hits: string[]): void {
  walkOf(value, path, hits, FORBIDDEN_KEYS);
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
   * **ولوحةٌ لم يأذن بها صاحبُها لا تخرج** — ولو خاليةَ القيمة في
   * الشاشة: الشرطُ يقع حيث تُجلب لا حيث تُعرض، وما يدخل الكائنَ يُسلسَل
   * في حمولة RSC ولو لم يُرسَم. وهو مسلكُ `reservePrice` نفسه.
   */
  it('ولوحةٌ اختار صاحبُها إخفاءها لا تخرج في الشكل العامّ', async () => {
    const hidden = await db.listing.findFirst({
      where: {
        status: 'PUBLISHED',
        showPlate: false,
        vehicle: { plateLetters: { not: null } },
      },
      select: { ref: true },
    });
    /** **والطقمُ يشترط ما يفترضه** — لا يمرّ بلا صفٍّ يقيسه. */
    expect(hidden, 'لا إعلانَ مخفيَّ اللوحة في القاعدة').not.toBeNull();
    if (hidden === null) return;

    const row = await findPublishedListing(hidden.ref);
    if (row === null) return;
    const detail = await toPublicDetail(row);

    const leaked: string[] = [];
    walkOf(detail, '', leaked, CONSENTED_KEYS);
    /** حاضرةٌ مفتاحًا — فارغةٌ قيمةً: لا شيءَ من اللوحة في الحمولة. */
    for (const path of leaked) {
      const value = path.split('.').reduce<unknown>(
        (acc, key) => (acc as Record<string, unknown>)[key],
        detail,
      );
      expect(value, path).toBeNull();
    }
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
