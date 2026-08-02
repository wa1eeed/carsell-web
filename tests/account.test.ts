import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getAccountData } from '@/lib/domain/account';
import { profileCompletion } from '@/lib/domain/profile';
import { requestOtp } from '@/lib/domain/auth';

afterAll(async () => {
  await db.$disconnect();
});

const anyUser = async () => db.user.findFirstOrThrow();

describe('Wm — لا تسريب وجود الحساب', () => {
  /**
   * من يعرف أن رقمًا مسجَّل عندنا يعرف أن صاحبه يبيع سيارة. فالمسار
   * يعطي **نفس الشكل ونفس النتيجة** للمسجَّل والجديد، والفرق يظهر بعد
   * التحقّق لا قبله.
   */
  /**
   * رقمان **جديدان** لا رقم مزروع: الأخير تتراكم عليه محاولات من
   * تشغيلات سابقة فيصطدم بالحدّ الساعي، ويفشل الاختبار لسبب لا
   * علاقة له بما يقيسه. اختبارٌ يعتمد على حالة متراكمة يكذب مرّتين:
   * يسقط وهو سليم، وقد يمرّ وهو مكسور.
   */
  it('الشكل واحد للرقم المسجَّل والجديد', async () => {
    const stamp = String(Date.now()).slice(-6);
    const known = `0553${stamp}`;
    const fresh = `0554${stamp}`;
    await db.user.create({ data: { phone: known } });

    const base = new Date();
    const first = await requestOtp(known, base);
    const second = await requestOtp(fresh, base);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(Object.keys(first).sort()).toEqual(Object.keys(second).sort());
    }

    await db.user.delete({ where: { phone: known } });
  });
});

describe('Wm — حدود الإرسال', () => {
  /**
   * التهدئة (٣٠ ثانية) والحدّ الساعي (٥) قيدان مختلفان يعطيان الحالة
   * نفسها (٤٢٩)، ويجب أن يبقيا مميَّزين بالرمز — وإلا ظُنّ الأوّل
   * الثاني وقيس الحدّ خطأً.
   */
  it('السادس في الساعة يُرفض، والخامس يمرّ', async () => {
    const phone = `05551${String(Date.now()).slice(-5)}`;
    const start = Date.now();

    for (let i = 1; i <= 5; i += 1) {
      const result = await requestOtp(phone, new Date(start + i * 60_000));
      expect(result.ok, `الإرسال ${i}`).toBe(true);
    }

    const sixth = await requestOtp(phone, new Date(start + 6 * 60_000));
    expect(sixth.ok).toBe(false);
    if (!sixth.ok) expect(sixth.reason).toBe('RATE_LIMITED');
  });

  it('التهدئة رمز مختلف عن الحدّ الساعي', async () => {
    const phone = `05552${String(Date.now()).slice(-5)}`;
    const at = new Date();

    expect((await requestOtp(phone, at)).ok).toBe(true);
    const immediate = await requestOtp(phone, new Date(at.getTime() + 1000));
    expect(immediate.ok).toBe(false);
    if (!immediate.ok) expect(immediate.reason).toBe('COOLDOWN');
  });
});

describe('Wf — الحقول الناقصة بارزة', () => {
  it('الناقص يُحسب، وما يمنعه يُشتقّ منه', () => {
    const base = {
      email: null, idVerified: false, iban: null,
    } as unknown as Parameters<typeof profileCompletion>[0];

    const empty = profileCompletion(base);
    expect(empty.missing).toEqual(['email', 'idVerification', 'iban']);
    expect(empty.canBuy).toBe(false);
    expect(empty.canSell).toBe(false);

    // الآيبان لاستلام المال لا لدفعه — فلا يمنع الشراء
    const buyer = profileCompletion({
      ...base, email: 'a@b.co', idVerified: true,
    } as unknown as Parameters<typeof profileCompletion>[0]);
    expect(buyer.missing).toEqual(['iban']);
    expect(buyer.canBuy).toBe(true);
    expect(buyer.canSell).toBe(false);
  });

  it('لوحة الحساب تُبنى من بيانات المستخدم وحده', async () => {
    const user = await anyUser();
    const data = await getAccountData(user, 'ar');

    for (const listing of data.listings) {
      const row = await db.listing.findUniqueOrThrow({
        where: { ref: listing.ref },
        select: { sellerId: true },
      });
      expect(row.sellerId, listing.ref).toBe(user.id);
    }

    // «العروض الواردة» عروض الآخرين على مركباته لا عروضه هو
    for (const offer of data.offers) {
      const row = await db.offer.findUniqueOrThrow({
        where: { id: offer.id },
        select: { buyerId: true, listing: { select: { sellerId: true } } },
      });
      expect(row.listing.sellerId).toBe(user.id);
      expect(row.buyerId).not.toBe(user.id);
    }

    expect(data.stats.find((s) => s.key === 'listings')?.value).toBe(data.listings.length);
  });

  it('تقرير فحصٍ لمركبة بلا إعلان منشور يبقى بلا رابط لا أن يختفي', async () => {
    const user = await anyUser();
    const data = await getAccountData(user, 'ar');
    for (const report of data.reports) {
      expect(report.ref).not.toBe('');
      if (report.path !== null) expect(report.path.endsWith('/inspection')).toBe(true);
    }
  });
});
