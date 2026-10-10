import { describe, expect, it } from 'vitest';
import { citySlug, latinSlug, modelSlug } from '@/lib/domain/slugs';
import { canonicalPath } from '@/lib/domain/listing-detail';

/**
 * ═══ الروابط لاتينيةٌ كاملة ═══
 *
 * كان المسار `/ar/cars/الخبر/hyundai/ستاريا/ADS…`: الماركة لاتينية
 * والمدينة والطراز عربيّان، لأن `toSlug` تُبقي `\p{Letter}` وهي تشمل
 * العربية. والتصميم يعرضه `riyadh/toyota/camry`.
 */
describe('مقاطع المدن', () => {
  it('تُترجم المدن المعروفة', () => {
    expect(citySlug('الرياض')).toBe('riyadh');
    expect(citySlug('جدة')).toBe('jeddah');
    expect(citySlug('الخبر')).toBe('khobar');
    expect(citySlug('المدينة المنورة')).toBe('madinah');
  });

  /** الهمزات تُكتب بصورٍ عدّة، فلا تُطلب دقّةٌ إملائية من الكاتب. */
  it('تتحمّل اختلاف الهمزة والتاء المربوطة', () => {
    expect(citySlug('ابها')).toBe('abha');
    expect(citySlug('أبها')).toBe('abha');
    expect(citySlug('  الرياض  ')).toBe('riyadh');
  });

  /** مدينةٌ غير مذكورة تعمل بلا تعطيل — والصمت أهون من ٤٠٤. */
  it('تسقط إلى العربية حين لا جدول', () => {
    const out = citySlug('قريةٌ صغيرة');
    expect(out).not.toBe('');
    expect(out).toContain('قرية');
  });
});

describe('مقاطع الطرازات', () => {
  it('تُبنى من الاسم الإنجليزيّ', () => {
    expect(modelSlug({ nameAr: 'كامري', nameEn: 'Camry' })).toBe('camry');
    expect(modelSlug({ nameAr: 'لاندكروزر', nameEn: 'Land Cruiser' })).toBe('land-cruiser');
  });

  it('تسقط إلى العربية حين لا إنجليزية', () => {
    expect(modelSlug({ nameAr: 'سيراتو', nameEn: null })).toBe('سيراتو');
  });
});

describe('المسار المعياريّ', () => {
  it('لاتينيٌّ كاملًا حين تتوفّر الأسماء', () => {
    const { path, city, model } = canonicalPath('ar', {
      ref: 'ADS2026A0005',
      city: 'الرياض',
      vehicle: {
        brandName: 'تويوتا',
        modelName: 'كامري',
        brand: { slug: 'toyota' },
        model: { nameEn: 'Camry' },
      },
    });
    expect(city).toBe('riyadh');
    expect(model).toBe('camry');
    expect(path).toBe('/ar/cars/riyadh/toyota/camry/ADS2026A0005');
    // ولا ترميز نسبة مئوية — وهو ما كان يشوّه الرابط المنسوخ
    expect(path).not.toContain('%');
  });

  /**
   * **والعلاقة اختيارية عمدًا**: سبعة عشر استعلامًا تبني هذا الشكل،
   * وغيابُها يسقط إلى العربية كما كان ولا يُسقط شيئًا.
   */
  it('يسقط إلى العربية حين لا تُنتقى العلاقة', () => {
    const { model } = canonicalPath('ar', {
      ref: 'ADS2026A0005',
      city: 'الرياض',
      vehicle: { brandName: 'تويوتا', modelName: 'كامري', brand: { slug: 'toyota' } },
    });
    expect(model).toBe('كامري');
  });
});

describe('latinSlug', () => {
  it('يُنظّف ولا يترك شرطاتٍ متتالية أو طرفية', () => {
    expect(latinSlug('  Land   Cruiser  ')).toBe('land-cruiser');
    expect(latinSlug('CX-5')).toBe('cx-5');
    expect(latinSlug('كامري')).toBe('');
  });
});
