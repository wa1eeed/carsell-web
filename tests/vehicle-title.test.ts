import { describe, expect, it } from 'vitest';
import { brandLabel, modelLabel, vehicleTitle } from '@/lib/domain/vehicle-title';
import { cityLabel } from '@/lib/labels/cities';
import { colourLabel } from '@/lib/labels/colours';

/**
 * ═══ اسم المركبة بلغة القارئ ═══
 *
 * `Vehicle` يحفظ لقطةً عربية (`brandName` · `modelName` · `trimName`)
 * ولا يقرأ الكتالوج بعدها — وهو صحيح: اسمٌ يتغيّر في الكتالوج لا
 * يغيّر ما بِيع تحت اسمه القديم. **لكنّ اللقطة لغةٌ واحدة**، فصفحة
 * `/en` كانت تعرض «جي إم سي سييرا SLE» تحت «Home › Browse cars».
 */
const SIERRA = {
  brandName: 'جي إم سي',
  modelName: 'سييرا',
  trimName: 'SLE',
  brand: { nameEn: 'GMC' },
  model: { nameEn: 'Sierra' },
};

describe('اسم المركبة يتبع لغة الصفحة', () => {
  it('العربية تقرأ اللقطة', () => {
    expect(vehicleTitle(SIERRA, 'ar')).toBe('جي إم سي سييرا SLE');
  });

  it('والإنجليزية تقرأ الكتالوج', () => {
    expect(vehicleTitle(SIERRA, 'en')).toBe('GMC Sierra SLE');
  });

  /**
   * **وغيابُ العلاقة لا يُسقط شاشة.** استعلامٌ لم يُضف إليه `select`
   * يعيد اللقطة — لا فراغًا ولا رميًا.
   */
  it('وبلا علاقةٍ ترجع اللقطة', () => {
    const bare = { brandName: 'تويوتا', modelName: 'كامري', trimName: null };
    expect(vehicleTitle(bare, 'en')).toBe('تويوتا كامري');
    expect(vehicleTitle(bare, 'ar')).toBe('تويوتا كامري');
  });

  /** واسمٌ إنجليزيٌّ فارغ يسقط إلى اللقطة لا إلى فراغ. */
  it('واسمٌ إنجليزيٌّ فارغ يسقط إلى اللقطة', () => {
    expect(vehicleTitle({ ...SIERRA, brand: { nameEn: '' } }, 'en')).toBe('جي إم سي Sierra SLE');
  });

  /**
   * **والفئة مثلُهما.** ظُنّت رمزًا لاتينيًّا دائمًا (`SLE` · `AT4`)
   * فتُركت — ثم ظهر «GMC Yukon دينالي» في الصفحة الإنجليزية.
   */
  it('والفئة تُترجَم حين يكون لها اسم', () => {
    const yukon = {
      brandName: 'جي إم سي', modelName: 'يوكن', trimName: 'دينالي',
      brand: { nameEn: 'GMC' }, model: { nameEn: 'Yukon' }, trim: { nameEn: 'Denali' },
    };
    expect(vehicleTitle(yukon, 'en')).toBe('GMC Yukon Denali');
    expect(vehicleTitle(yukon, 'ar')).toBe('جي إم سي يوكن دينالي');
  });

  it('والماركة والطراز يُقرآن منفردين', () => {
    expect(brandLabel(SIERRA, 'en')).toBe('GMC');
    expect(brandLabel(SIERRA, 'ar')).toBe('جي إم سي');
    expect(modelLabel(SIERRA, 'en')).toBe('Sierra');
  });
});

describe('المدينة واللون', () => {
  it('المدينة تُشتقّ من المقطع لا من جدولٍ ثانٍ', () => {
    expect(cityLabel('الرياض', 'en')).toBe('Riyadh');
    expect(cityLabel('المدينة المنورة', 'en')).toBe('Madinah');
    expect(cityLabel('الرياض', 'ar')).toBe('الرياض');
  });

  /** وما لا مقطع له يسقط إلى العربية — كما يسقط المقطع نفسه. */
  it('ومدينةٌ لا مقطع لها تبقى عربية', () => {
    expect(cityLabel('مدينة لم تُضف', 'en')).toBe('مدينة لم تُضف');
  });

  it('واللون جدولٌ بسقوطٍ إلى المخزَّن', () => {
    expect(colourLabel('رمادي', 'en')).toBe('Grey');
    expect(colourLabel('أبيض', 'en')).toBe('White');
    expect(colourLabel('رمادي', 'ar')).toBe('رمادي');
    expect(colourLabel('لونٌ حرّ', 'en')).toBe('لونٌ حرّ');
  });
});
