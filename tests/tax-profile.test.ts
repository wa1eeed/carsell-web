import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  buyerTypeFor,
  checkVatNumber,
  isVatRegistered,
  normalizeVatNumber,
  sellerTypeFor,
  setTaxStatus,
  taxProfileOf,
  vehicleIsTaxable,
} from '@/lib/domain/tax-profile';

afterAll(async () => {
  await db.$disconnect();
});

const VALID = '300000000000003';

describe('الرقم الضريبي — الحقل يقبل كل صيغة لصق ويطبّعها', () => {
  it('المسافات والشرطات والسابقة والأرقام العربية-الهندية كلّها تُطبَّع', () => {
    expect(normalizeVatNumber('3000 0000 0000 003')).toBe(VALID);
    expect(normalizeVatNumber('3000-0000-0000-003')).toBe(VALID);
    expect(normalizeVatNumber('VAT 300000000000003')).toBe(VALID);
    expect(normalizeVatNumber('٣٠٠٠٠٠٠٠٠٠٠٠٠٠٣')).toBe(VALID);
  });

  /**
   * السبب يُفصَل: من أدخل أربعة عشر رقمًا لا تنفعه رسالةٌ عن النمط،
   * ورسالةٌ واحدة لكل الأخطاء تجعله يعيد المحاولة عشوائيًّا.
   */
  it('سبب الرفض مفصَّل لا واحد', () => {
    expect(checkVatNumber('')).toEqual({ ok: false, reason: 'EMPTY' });
    expect(checkVatNumber('30000000000000')).toEqual({ ok: false, reason: 'LENGTH' });
    expect(checkVatNumber('100000000000001')).toEqual({ ok: false, reason: 'PATTERN' });
    expect(checkVatNumber(`  ${VALID}  `)).toEqual({ ok: true, value: VALID });
  });
});

describe('فئتان لا ثلاث', () => {
  const individual = { taxStatus: 'INDIVIDUAL' as const, vatNumber: null, dealerId: null };
  const registered = { taxStatus: 'VAT_REGISTERED' as const, vatNumber: VALID, dealerId: null };
  const dealerReg = { taxStatus: 'VAT_REGISTERED' as const, vatNumber: VALID, dealerId: 'd1' };
  const follow = { taxableSupply: null };

  it('المسجَّل مسجَّل فردًا كان أو معرضًا — والأثر واحد', () => {
    expect(sellerTypeFor(registered, follow)).toBe(sellerTypeFor(dealerReg, follow));
    expect(vehicleIsTaxable(sellerTypeFor(registered, follow))).toBe(true);
    expect(vehicleIsTaxable(sellerTypeFor(dealerReg, follow))).toBe(true);
  });

  /**
   * **«مسجَّل بلا رقم» دعوى لا حالة.** والرقم شرطُ التحقّق، فبدونه
   * تُصدر فواتير بوصفٍ لا سند له.
   */
  it('حالةٌ بلا رقم ليست تسجيلًا', () => {
    expect(isVatRegistered({ taxStatus: 'VAT_REGISTERED', vatNumber: null })).toBe(false);
    expect(isVatRegistered({ taxStatus: 'VAT_REGISTERED', vatNumber: '' })).toBe(false);
    expect(isVatRegistered({ taxStatus: 'VAT_REGISTERED', vatNumber: VALID })).toBe(true);
  });

  it('غير المسجَّل: لا ضريبة على المركبة', () => {
    expect(vehicleIsTaxable(sellerTypeFor(individual, follow))).toBe(false);
    expect(
      vehicleIsTaxable(
        sellerTypeFor({ taxStatus: 'INDIVIDUAL', vatNumber: null, dealerId: 'd1' }, follow),
      ),
    ).toBe(false);
  });

  it('استثناء الإعلان يتقدّم على وضع البائع — في الاتّجاهين', () => {
    // فردٌ غير مسجَّل يبيع مركبة نشاطٍ تجاريّ
    expect(vehicleIsTaxable(sellerTypeFor(individual, { taxableSupply: true }))).toBe(true);
    // ومسجَّلٌ يبيع مركبته الشخصية — و`false` لا تُقلَب بحجّة أنه مسجَّل
    expect(vehicleIsTaxable(sellerTypeFor(registered, { taxableSupply: false }))).toBe(false);
  });

  it('المشتري المسجَّل منشأة — لتحمل فاتورته رقمه', () => {
    expect(buyerTypeFor({ ...registered })).toBe('COMPANY');
    expect(buyerTypeFor({ ...individual })).toBe('INDIVIDUAL');
    expect(buyerTypeFor({ taxStatus: null, vatNumber: null, dealerId: 'd1' })).toBe('DEALER');
  });
});

describe('التأجيل — لم يُسأل ليست «فرد»', () => {
  it('null تفتح النافذة، والاختزال إلى «فرد» يجعل التصنيف اختيارنا', () => {
    expect(taxProfileOf({ taxStatus: null, vatNumber: null }).needsAnswer).toBe(true);
    expect(taxProfileOf({ taxStatus: 'INDIVIDUAL', vatNumber: null }).needsAnswer).toBe(false);
    // و«لم يُسأل» لا تُنتج بائعًا خاضعًا بحال
    expect(
      vehicleIsTaxable(
        sellerTypeFor({ taxStatus: null, vatNumber: null, dealerId: null }, { taxableSupply: null }),
      ),
    ).toBe(false);
  });

  it('الحفظ يُطبّع، والعودة إلى «فرد» تمحو الرقم', async () => {
    const user = await db.user.create({
      data: { phone: `+96650${String(Date.now()).slice(-7)}`, name: 'اختبار ضريبي' },
    });
    try {
      const saved = await setTaxStatus(user.id, {
        status: 'VAT_REGISTERED',
        vatNumber: '3000 0000 0000 003',
      });
      expect(saved.ok).toBe(true);
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).vatNumber).toBe(VALID);

      const back = await setTaxStatus(user.id, { status: 'INDIVIDUAL' });
      expect(back.ok).toBe(true);
      /**
       * صفٌّ يقول «غير مسجَّل» ويحمل رقم تسجيل فخٌّ: يومًا ما يقرأ أحدهم
       * الرقم لا الحالة.
       */
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).vatNumber).toBeNull();

      const bad = await setTaxStatus(user.id, { status: 'VAT_REGISTERED', vatNumber: '123' });
      expect(bad).toEqual({ ok: false, reason: 'LENGTH' });
      // والرفض لا يترك حالةً نصف محفوظة
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).taxStatus).toBe(
        'INDIVIDUAL',
      );
    } finally {
      await db.user.delete({ where: { id: user.id } });
    }
  });
});
