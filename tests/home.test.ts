import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  PAYMENT_BANDS,
  getHomeData,
  priceBoundsForPayment,
} from '@/lib/domain/home';
import { monthlyPayment } from '@/lib/domain/listing-detail';

afterAll(async () => {
  await db.$disconnect();
});

describe('كل رقم على الرئيسية محسوب', () => {
  /**
   * صفحةٌ تعِد بموثوقية الملكية وتقارير الفحص ثم تفتتح بعدد مؤلَّف
   * تنقض وعدها في أول سطر يقرؤه الزائر.
   */
  it('الإحصاءات تطابق `count` في القاعدة', async () => {
    const home = await getHomeData('ar');

    expect(home.stats.listings).toBe(await db.listing.count({ where: { status: 'PUBLISHED' } }));
    expect(home.stats.dealers).toBe(
      await db.dealer.count({ where: { verified: true, status: 'ACTIVE' } }),
    );
    expect(home.stats.financeProviders).toBe(
      await db.financeProvider.count({ where: { active: true } }),
    );
    expect(home.summary.used + home.summary.newCars).toBe(home.stats.listings);
  });

  it('لا رقم من أرقام التصميم المؤلَّفة', async () => {
    const home = await getHomeData('ar');
    // ١٨٬٤٠٠ و٣١٦ و١١ أرقام عرض في ترميز التصميم لا بيانات
    expect(home.stats.listings).not.toBe(18_400);
    expect(home.stats.dealers).not.toBe(316);
  });
});

describe('شرائح القسط', () => {
  /**
   * القسط مشتقّ من السعر بمعادلة خطّية، فعكسها إلى حدّي سعر يُبقي
   * الفلترة على عمود مفهرس. والعكس يجب أن يطابق الأصل.
   */
  it('عكس المعادلة يعطي سعرًا قسطه داخل الشريحة', async () => {
    const settings = await db.financeSetting.findUniqueOrThrow({ where: { id: 'default' } });
    const finance = {
      downPaymentPct: Number(settings.downPaymentPct),
      months: settings.months,
      profitRatePct: Number(settings.profitRatePct),
    };

    for (const band of PAYMENT_BANDS) {
      if (band.max === Number.MAX_SAFE_INTEGER) continue;
      const bounds = priceBoundsForPayment(band, finance);
      const low = monthlyPayment(bounds.gte, finance.downPaymentPct, finance.months, finance.profitRatePct);
      const high = monthlyPayment(bounds.lte, finance.downPaymentPct, finance.months, finance.profitRatePct);

      // التقريب إلى أقرب عشرة في حساب القسط يسمح بهامش ضيّق
      expect(low, band.key).toBeGreaterThanOrEqual(band.min - 10);
      expect(high, band.key).toBeLessThanOrEqual(band.max + 10);
    }
  });

  it('كل سيارة معروضة في شريحة قسطها فعلًا داخلها', async () => {
    const home = await getHomeData('ar', { band: '2000_2500' });
    for (const car of home.finance.cars) {
      expect(car.monthly, car.ref).not.toBeNull();
      expect(car.monthly!, car.ref).toBeGreaterThanOrEqual(2000 - 10);
      expect(car.monthly!, car.ref).toBeLessThanOrEqual(2500 + 10);
    }
  });

  it('الشرائح تجمع إلى غير المزادات — لا إعلان يسقط ولا يُعدّ مرّتين', async () => {
    const home = await getHomeData('ar');
    const sum = home.finance.bands.reduce((total, band) => total + band.count, 0);
    const financeable = await db.listing.count({
      where: { status: 'PUBLISHED', type: { not: 'AUCTION' } },
    });
    expect(sum).toBe(financeable);
  });
});

describe('الأقسام لا تكذب', () => {
  it('كل ماركة معروضة لها إعلان منشور', async () => {
    const home = await getHomeData('ar');
    expect(home.brands.top.length).toBeGreaterThan(0);
    for (const brand of home.brands.top) {
      expect(brand.count, brand.nameAr).toBeGreaterThan(0);
      const real = await db.listing.count({
        where: { status: 'PUBLISHED', vehicle: { brandId: brand.id } },
      });
      expect(real, brand.nameAr).toBe(brand.count);
    }
  });

  it('«أُضيفت حديثًا» من المدينة المذكورة ومن بائع موثّق', async () => {
    const home = await getHomeData('ar');
    for (const car of home.recent.cars) {
      expect(car.city).toBe(home.recent.city);
      expect(car.sellerVerified, car.ref).toBe(true);
    }
  });

  it('شريط المزادات لا يعرض إلا مزادًا حيًّا أو مجدولًا', async () => {
    const home = await getHomeData('ar');
    for (const auction of home.auctions) {
      const row = await db.auction.findFirstOrThrow({
        where: { listing: { ref: auction.ref } },
        select: { status: true },
      });
      expect(['LIVE', 'SCHEDULED'], auction.ref).toContain(row.status);
      expect(auction.endsAt).not.toBe('');
    }
  });

  it('العنوان بلا سنة، والرابط أساسيّ', async () => {
    const home = await getHomeData('ar');
    for (const car of [...home.recent.cars, ...home.finance.cars]) {
      expect(car.title).not.toContain(String(car.year));
      expect(car.href.startsWith('/ar/cars/')).toBe(true);
      expect(car.href.endsWith(car.ref)).toBe(true);
    }
  });

  it('عدّاد المزادات الحيّة واحد في الشريط والبطاقة', async () => {
    const home = await getHomeData('ar');
    expect(home.summary.auctions).toBe(home.live.auctions);
  });
});
