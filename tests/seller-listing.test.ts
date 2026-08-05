import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { setOwnListingPaused, updateOwnListing } from '@/lib/domain/seller-listing';

/**
 * ═══ البائع يتحكّم بإعلانه ═══
 *
 * العطل الذي وُلد منه هذا الملف: **لا بائع في المنصّة يستطيع تغيير
 * سعره.** `/api/v1/listings/{ref}` كان يصدّر `GET` وحده و«مركباتي»
 * قائمةٌ للقراءة — ولا اختبارٌ سقط، لأن لا اختبار كان يسأل «هل يستطيع
 * صاحب الإعلان أن يمسّه؟».
 */

const created: { listings: string[]; users: string[]; vehicles: string[]; orders: string[] } = {
  listings: [], users: [], vehicles: [], orders: [],
};

async function makeListing(status: 'PUBLISHED' | 'PAUSED' | 'SUSPENDED' | 'SOLD'): Promise<{
  ref: string;
  sellerId: string;
  otherId: string;
  listingId: string;
}> {
  const stamp = `${String(Date.now()).slice(-9)}${String(created.listings.length)}`;

  const [seller, other] = await Promise.all([
    db.user.create({ data: { phone: `+9665301${stamp}` } }),
    db.user.create({ data: { phone: `+9665302${stamp}` } }),
  ]);
  created.users.push(seller.id, other.id);

  const model = await db.model.findFirstOrThrow({ include: { brand: true } });
  const vehicle = await db.vehicle.create({
    data: {
      ownerId: seller.id, brandId: model.brandId, modelId: model.id,
      brandName: model.brand.nameAr, modelName: model.nameAr, year: 2022,
      bodyType: 'SEDAN', transmission: 'AUTOMATIC', fuel: 'PETROL', drivetrain: 'FWD',
      seats: 5, mileageKm: 60_000, colorExterior: 'أبيض', spec: 'SAUDI',
      condition: 'USED', city: 'الرياض', entryMode: 'MANUAL',
    },
  });
  created.vehicles.push(vehicle.id);

  const listing = await db.listing.create({
    data: {
      ref: `SLT${stamp}`, vehicleId: vehicle.id, sellerId: seller.id, type: 'DIRECT',
      status, askPrice: 80_000, city: 'الرياض', publishedAt: new Date(),
    },
  });
  created.listings.push(listing.id);

  return { ref: listing.ref, sellerId: seller.id, otherId: other.id, listingId: listing.id };
}

afterEach(async () => {
  // الاختبار يعيد ما صنعه — وصفٌّ يبقى يُسقط جيرانه في التشغيل التالي
  await db.order.deleteMany({ where: { id: { in: created.orders } } });
  await db.listing.deleteMany({ where: { id: { in: created.listings } } });
  await db.vehicle.deleteMany({ where: { id: { in: created.vehicles } } });
  await db.user.deleteMany({ where: { id: { in: created.users } } });
  created.orders = []; created.listings = []; created.vehicles = []; created.users = [];
});

describe('تعديل البائع لسعره', () => {
  it('يغيّر السعر وقابلية التفاوض', async () => {
    const { ref, sellerId, listingId } = await makeListing('PUBLISHED');

    const result = await updateOwnListing({ ref, sellerId, askPrice: 74_500, negotiable: true });
    expect(result).toEqual({ ok: true, status: 'PUBLISHED', askPrice: '74500' });

    const after = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(Number(after.askPrice)).toBe(74_500);
    expect(after.negotiable).toBe(true);
  });

  /** الصفر يوحي بأن المركبة بلا قيمة، والخانة الزائدة تُخفيها من كل ترشيح. */
  it('يرفض السعر خارج الحدّين', async () => {
    const { ref, sellerId } = await makeListing('PUBLISHED');
    expect(await updateOwnListing({ ref, sellerId, askPrice: 5 })).toEqual({
      ok: false, reason: 'PRICE_INVALID',
    });
    expect(await updateOwnListing({ ref, sellerId, askPrice: 99_000_000 })).toEqual({
      ok: false, reason: 'PRICE_INVALID',
    });
  });

  /**
   * **وحدُّ القبول لا يعلو السعر المعلن**: حدٌّ فوقه يرفض كل عرضٍ
   * تلقائيًّا بما فيه العرض بالسعر المطلوب، فيظنّ البائع أن لا أحد
   * يعرض عليه — والسبب رقمٌ كتبه هو ولا يراه أحد.
   */
  it('يرفض حدّ قبولٍ فوق السعر المطلوب', async () => {
    const { ref, sellerId } = await makeListing('PUBLISHED');
    expect(await updateOwnListing({ ref, sellerId, minAcceptPrice: 90_000 })).toEqual({
      ok: false, reason: 'PRICE_INVALID',
    });
    expect(await updateOwnListing({ ref, sellerId, minAcceptPrice: 70_000 })).toMatchObject({
      ok: true,
    });
  });

  it('لا يعدّل غيرُ المالك، ويراه غير موجود', async () => {
    const { ref, otherId } = await makeListing('PUBLISHED');
    expect(await updateOwnListing({ ref, sellerId: otherId, askPrice: 60_000 })).toEqual({
      ok: false, reason: 'NOT_OWNER',
    });
  });

  /** السعر لقطةٌ في الطلب — وتغييره تحته يُنتج شاشتين متناقضتين. */
  it('لا يُعدَّل إعلانٌ عليه طلبٌ قائم', async () => {
    const { ref, sellerId, listingId } = await makeListing('PUBLISHED');
    const other = await db.user.create({ data: { phone: `+9665309${String(Date.now()).slice(-8)}` } });
    created.users.push(other.id);

    const order = await db.order.create({
      data: {
        ref: `ORD-SL-${String(Date.now()).slice(-9)}`, listingId, buyerId: other.id, sellerId,
        source: 'DIRECT', stage: 'PAYMENT', status: 'ACTIVE',
        agreedPrice: 80_000, commissionPct: 0, commissionAmount: 0,
        transferFee: 350, vatAmount: 0, totalAmount: 80_350,
      },
    });
    created.orders.push(order.id);

    expect(await updateOwnListing({ ref, sellerId, askPrice: 70_000 })).toEqual({
      ok: false, reason: 'LOCKED_BY_ORDER',
    });
  });
});

describe('إيقاف البائع لإعلانه', () => {
  it('يوقف ثم يعيد', async () => {
    const { ref, sellerId, listingId } = await makeListing('PUBLISHED');

    expect(await setOwnListingPaused({ ref, sellerId, paused: true })).toMatchObject({
      ok: true, status: 'PAUSED',
    });
    expect((await db.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe('PAUSED');

    expect(await setOwnListingPaused({ ref, sellerId, paused: false })).toMatchObject({
      ok: true, status: 'PUBLISHED',
    });
    expect((await db.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe('PUBLISHED');
  });

  /**
   * ═══ الحارس الذي وُجدت `PAUSED` من أجله ═══
   *
   * `SUSPENDED` عقوبةٌ يوقعها الأدمن. ولو كانت الحالتان واحدة لرفع
   * البائع عقوبتَه بضغطة «أعِد عرضه» — والفرق بينهما غير مرئيّ للزائر،
   * فلا شيء يكشف الخلط إلّا هذا الاختبار.
   */
  it('لا يرفع البائع إيقاف الأدمن', async () => {
    const { ref, sellerId, listingId } = await makeListing('SUSPENDED');

    expect(await setOwnListingPaused({ ref, sellerId, paused: false })).toEqual({
      ok: false, reason: 'NOT_EDITABLE',
    });
    expect((await db.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe('SUSPENDED');
  });

  it('لا يُعدَّل المباع', async () => {
    const { ref, sellerId } = await makeListing('SOLD');
    expect(await updateOwnListing({ ref, sellerId, askPrice: 70_000 })).toEqual({
      ok: false, reason: 'NOT_EDITABLE',
    });
  });
});
