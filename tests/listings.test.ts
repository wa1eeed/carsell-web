import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  EMPTY_FILTERS,
  activeFilterCount,
  buildWhere,
  parseFilters,
  searchListings,
  serializeFilters,
  type Filters,
} from '@/lib/domain/listings';
import { isVerifiedSeller, sellerBadge } from '@/lib/domain/seller';

afterAll(async () => {
  await db.$disconnect();
});

const of = (query: string): Filters => parseFilters(new URLSearchParams(query));

describe('فكّ الفلاتر من الرابط', () => {
  it('يفكّ كل بُعد', () => {
    const f = of(
      'type=AUCTION&brandId=b1&modelId=m1&yearFrom=2020&yearTo=2024&priceMin=50000' +
        '&priceMax=200000&mileageMax=80000&city=الرياض&condition=USED&spec=SAUDI' +
        '&transmission=CVT&fuel=HYBRID&bodyType=SUV&drivetrain=AWD&inspected=true' +
        '&scoreMin=80&paintStatus=ORIGINAL&verifiedSeller=true&financing=true' +
        '&features=sunroof&features=abs&sort=price_asc&page=3&limit=40',
    );
    expect(f.type).toBe('AUCTION');
    expect(f.yearFrom).toBe(2020);
    expect(f.city).toBe('الرياض');
    expect(f.features).toEqual(['sunroof', 'abs']);
    expect(f.sort).toBe('price_asc');
    expect(f.page).toBe(3);
    expect(f.limit).toBe(40);
  });

  it('قيمة غير صالحة تُهمَل ولا تُفشِل الطلب — رابط قديم يعرض نتائج لا خطأ', () => {
    const f = of('type=BOGUS&yearFrom=abc&sort=nope&page=-5&scoreMin=999&inspected=maybe');
    expect(f.type).toBeNull();
    expect(f.yearFrom).toBeNull();
    expect(f.sort).toBe('newest');
    expect(f.page).toBe(1);
    expect(f.scoreMin).toBeNull();
    expect(f.inspected).toBeNull();
  });

  it('الحدّ الأقصى للصفحة مقيَّد — لا طلب يجرّ ألف صفّ', () => {
    expect(of('limit=9999').limit).toBe(60);
    expect(of('features=a&features=b&features=c'.repeat(20)).features.length).toBeLessThanOrEqual(20);
  });
});

describe('الرابط يعيد بناء الحالة', () => {
  it('الفكّ والتسلسل متعاكسان — الرابط المشترَك يعيد نفس الشاشة', () => {
    const query =
      'type=DIRECT&brandId=b1&city=جدة&condition=USED&inspected=true&sort=price_desc&page=2';
    const first = of(query);
    const round = parseFilters(serializeFilters(first));
    expect(round).toEqual(first);
  });

  it('الافتراضيات لا تُكتب في الرابط', () => {
    const params = serializeFilters({ ...EMPTY_FILTERS, city: 'جدة' });
    expect(params.get('city')).toBe('جدة');
    expect(params.get('sort')).toBeNull();
    expect(params.get('page')).toBeNull();
    expect(params.get('limit')).toBeNull();
  });

  it('عدّاد الفلاتر يطابق ما يظهر رقائق', () => {
    expect(activeFilterCount(of(''))).toBe(0);
    expect(activeFilterCount(of('type=DIRECT&city=جدة'))).toBe(2);
    expect(activeFilterCount(of('features=a&features=b&type=DIRECT'))).toBe(3);
    // الفرز والصفحة ليسا فلترين
    expect(activeFilterCount(of('sort=price_asc&page=4'))).toBe(0);
  });
});

describe('شرط الاستعلام', () => {
  it('المنشور وحده يظهر — لا مسودّة ولا قيد مراجعة', () => {
    const where = buildWhere(of(''), 0);
    expect(JSON.stringify(where)).toContain('PUBLISHED');
  });

  it('كل ميزة شرط مستقل — «فتحة سقف وجلد» لا «أو»', () => {
    const where = buildWhere(of('features=sunroof&features=leather_seats'), 0);
    const conditions = (where.AND as unknown[]).filter((c) =>
      JSON.stringify(c).includes('featureKey'),
    );
    expect(conditions).toHaveLength(2);
  });

  it('عدّاد البُعد يستثني بُعده هو', () => {
    const filters = of('city=جدة&type=DIRECT');
    const full = JSON.stringify(buildWhere(filters, 0));
    const skipCity = JSON.stringify(buildWhere(filters, 0, 'city'));

    expect(full).toContain('جدة');
    expect(skipCity).not.toContain('جدة');
    // بقية الفلاتر باقية
    expect(skipCity).toContain('DIRECT');
  });

  it('التقسيط مشتقّ لا مخزَّن', () => {
    const where = JSON.stringify(buildWhere(of('financing=true'), 30000));
    expect(where).toContain('AUCTION');
    expect(where).toContain('30000');
  });
});

describe('بائع موثّق — مصدر واحد', () => {
  it('الفرد بالتوثيق والتاجر بالسجل، والمعيار واحد', () => {
    expect(isVerifiedSeller({ idVerified: true })).toBe(true);
    expect(isVerifiedSeller({ idVerified: false, dealer: { verified: true } })).toBe(true);
    expect(isVerifiedSeller({ idVerified: false })).toBe(false);
    expect(isVerifiedSeller({ idVerified: false, dealer: { verified: false } })).toBe(false);
  });

  it('الشارة تصف الطرف والمعيار لا يتغيّر', () => {
    expect(sellerBadge({ idVerified: true })).toBe('USER_VERIFIED');
    expect(sellerBadge({ idVerified: false, dealer: { verified: true } })).toBe('DEALER_VERIFIED');
    expect(sellerBadge({ idVerified: false })).toBeNull();
  });
});

describe('البحث على بيانات حقيقية', () => {
  it('بلا فلتر يعيد المنشور وحده', async () => {
    const result = await searchListings(of(''));
    const published = await db.listing.count({ where: { status: 'PUBLISHED' } });
    expect(result.total).toBe(published);
  });

  it('كل فلتر يضيّق النتيجة', async () => {
    const all = await searchListings(of(''));
    for (const query of ['type=AUCTION', 'condition=NEW', 'inspected=true', 'fuel=HYBRID']) {
      const narrowed = await searchListings(of(query));
      expect(narrowed.total, query).toBeLessThan(all.total);
    }
  });

  it('عدّادات النوع تجمع إلى الإجمالي', async () => {
    const result = await searchListings(of(''));
    const sum = Object.values(result.facets.type).reduce((a, b) => a + b, 0);
    expect(sum).toBe(result.total);
  });

  it('الترقيم لا يكرّر ولا يُسقط', async () => {
    const first = await searchListings(of('limit=5&page=1'));
    const second = await searchListings(of('limit=5&page=2'));
    const refs = new Set([...first.items, ...second.items].map((i) => i.ref));
    expect(refs.size).toBe(first.items.length + second.items.length);
  });

  it('الفرز بالسعر تصاعديًا فعلًا', async () => {
    const result = await searchListings(of('sort=price_asc&limit=10'));
    const prices = result.items.map((i) => Number(i.price));
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  it('لا يسرّب minAcceptPrice ولا reservePrice', async () => {
    const result = await searchListings(of('limit=60'));
    const json = JSON.stringify(result);
    expect(json).not.toContain('minAcceptPrice');
    expect(json).not.toContain('reservePrice');

    // ولا قيمة تساويهما
    const secrets = await db.listing.findMany({
      where: { minAcceptPrice: { not: null } },
      select: { minAcceptPrice: true },
      take: 5,
    });
    for (const row of secrets) {
      expect(json).not.toContain(row.minAcceptPrice?.toString() ?? '__none__');
    }
  });

  it('القسط لا يُحسب للمزاد — التقسيط لا يظهر على المزادات', async () => {
    const result = await searchListings(of('type=AUCTION&limit=20'));
    expect(result.items.every((i) => i.monthly === null)).toBe(true);
  });
});

describe('الفلاتر المتدرّجة — حدود الشرائط', () => {
  it('حدود كل شريط تُحسب من دون قيده هو — وإلا انهار تحت الإصبع', async () => {
    const wide = await searchListings(of(''));
    const narrow = await searchListings(of('priceMin=50000&priceMax=60000'));

    // النتائج ضاقت…
    expect(narrow.total).toBeLessThan(wide.total);
    // …وطرفا شريط السعر لم يضيقا معها
    expect(narrow.facets.price).toEqual(wide.facets.price);
  });

  it('حدود السنة تتأثّر بفلتر آخر ولا تتأثّر بنفسها', async () => {
    const all = await searchListings(of(''));
    const capped = await searchListings(of('yearFrom=2024'));
    expect(capped.facets.year).toEqual(all.facets.year);

    const oneBrand = await searchListings(of(`brandId=${await someBrandId()}`));
    expect(oneBrand.facets.year).not.toBeNull();
  });

  it('الممشى مدى لا سقفًا — الطرفان يضيّقان معًا', async () => {
    const all = await searchListings(of(''));
    const band = await searchListings(of('mileageMin=100000&mileageMax=150000'));
    expect(band.total).toBeLessThan(all.total);
    for (const item of band.items) {
      expect(item.mileageKm).toBeGreaterThanOrEqual(100_000);
      expect(item.mileageKm).toBeLessThanOrEqual(150_000);
    }
  });

  it('أعمدة المدرَّج تجمع إلى إجمالي غير المقيَّد بالسعر', async () => {
    const result = await searchListings(of(''));
    const sum = result.facets.priceBars.reduce((a, b) => a + b, 0);
    expect(sum).toBe(result.total);
  });

  /**
   * الرقم داخل «مازدا CX-5» و«كيا K5» جزء من اسم عَلَم لا كمّية،
   * فلا يُحوَّل. الممنوع سنة الصنع ملصوقة في العنوان — رقم يُعرض
   * ويجب أن يمرّ بـ`ArabicNumber`.
   */
  it('العنوان بلا سنة — السنة رقم يُصاغ لا نصّ يُلصق', async () => {
    const result = await searchListings(of('limit=20'));
    for (const item of result.items) {
      expect(item.title, item.title).not.toMatch(/(^|\s)(19|20)\d{2}(\s|$)/);
      expect(item.title).not.toContain(String(item.year));
      expect(item.year).toBeGreaterThan(1970);
    }
  });
});

async function someBrandId(): Promise<string> {
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });
  return brand.id;
}

describe('عدّاد المدّة', () => {
  /**
   * «٤ أيام ولا ساعات» صحيحة نحويًا وسخيفة قراءةً. صيغة الصفر تخدم
   * عدًّا مستقلًّا («لا مزايدين») لا جزءًا ثانيًا من مدّة مركّبة.
   */
  it('يفصل الأيام والساعات، ويصمت عن الصفر', async () => {
    const { splitDuration } = await import('@/lib/arabic');

    const fourDays = splitDuration(4 * 86_400);
    expect(fourDays.isLong).toBe(true);
    expect(fourDays.days).toBe(4);
    expect(fourDays.hours).toBe(0);

    const mixed = splitDuration(4 * 86_400 + 3600);
    expect(mixed.days).toBe(4);
    expect(mixed.hours).toBe(1);

    // دون ٢٤ ساعة: ساعة واحدة لا يوم صفر
    const short = splitDuration(5 * 3600 + 62);
    expect(short.isLong).toBe(false);
    expect(short.clock).toBe('05:01:02');
  });
});
