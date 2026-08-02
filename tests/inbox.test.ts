import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getOfferInbox, fileReport } from '@/lib/domain/offer-inbox';
import { createOffer } from '@/lib/domain/offers';

const T0 = new Date('2026-06-01T10:00:00Z');
const hours = (n: number): Date => new Date(T0.getTime() + n * 3600 * 1000);

afterAll(async () => {
  await db.$disconnect();
});

async function fixture() {
  const stamp = String(Date.now()).slice(-9);
  const [seller, buyer] = await Promise.all([
    db.user.create({ data: { phone: `+9665301${stamp}` } }),
    db.user.create({ data: { phone: `+9665302${stamp}` } }),
  ]);
  const model = await db.model.findFirstOrThrow({ include: { brand: true } });
  const vehicle = await db.vehicle.create({
    data: {
      ownerId: seller.id, brandId: model.brandId, modelId: model.id,
      brandName: model.brand.nameAr, modelName: model.nameAr, year: 2022,
      bodyType: 'SEDAN', transmission: 'AUTOMATIC', fuel: 'PETROL', drivetrain: 'FWD',
      seats: 5, mileageKm: 20_000, colorExterior: 'أبيض', spec: 'SAUDI',
      condition: 'USED', city: 'الرياض', entryMode: 'MANUAL',
    },
  });
  const listing = await db.listing.create({
    data: {
      ref: `INB${stamp}`, vehicleId: vehicle.id, sellerId: seller.id,
      type: 'NEGOTIATION', status: 'PUBLISHED', askPrice: 90_000,
      negotiable: true, city: 'الرياض', publishedAt: T0,
    },
  });

  const cleanup = async (): Promise<void> => {
    await db.order.deleteMany({ where: { listingId: listing.id } });
    await db.report.deleteMany({ where: { reporterId: { in: [seller.id, buyer.id] } } });
    await db.notification.deleteMany({ where: { userId: { in: [seller.id, buyer.id] } } });
    await db.offer.deleteMany({ where: { listingId: listing.id } });
    await db.listing.deleteMany({ where: { id: listing.id } });
    await db.vehicle.deleteMany({ where: { id: vehicle.id } });
    await db.user.deleteMany({ where: { id: { in: [seller.id, buyer.id] } } });
  };

  return { seller, buyer, listing, vehicle, cleanup };
}

describe('Wl — لا عرض مرفوض في «نشطة»', () => {
  it('المرفوض تلقائيًّا يذهب إلى «منتهية» لا «واردة»', async () => {
    const f = await fixture();
    await db.listing.update({ where: { id: f.listing.id }, data: { minAcceptPrice: 85_000 } });

    await createOffer({ listingRef: f.listing.ref, buyerId: f.buyer.id, amount: 50_000 }, T0);

    const inbox = await getOfferInbox(f.seller.id, 'ar', hours(1));
    expect(inbox.active).toHaveLength(0);
    expect(inbox.closed).toHaveLength(1);
    expect(inbox.closed[0]?.autoRejected).toBe(true);
    await f.cleanup();
  });

  /**
   * «نشط» شرطان: حالة مخزَّنة نشطة **ومهلة لم تنتهِ**. الاكتفاء
   * بالحالة يُدخل عرضًا فات وقته بين مرور الوظيفة الدورية والتالية.
   */
  it('عرض فاتت مهلته ليس نشطًا وإن بقيت حالته PENDING', async () => {
    const f = await fixture();
    const created = await createOffer(
      { listingRef: f.listing.ref, buyerId: f.buyer.id, amount: 88_000 },
      T0,
    );
    expect(created.ok).toBe(true);

    // قبل الانتهاء: وارد
    const before = await getOfferInbox(f.seller.id, 'ar', hours(1));
    expect(before.active).toHaveLength(1);

    // بعده — والحالة المخزَّنة ما زالت PENDING
    const after = await getOfferInbox(f.seller.id, 'ar', hours(49));
    const stored = await db.offer.findFirstOrThrow({ where: { listingId: f.listing.id } });
    expect(stored.status).toBe('PENDING');
    expect(after.active).toHaveLength(0);
    expect(after.closed[0]?.lapsed).toBe(true);
    await f.cleanup();
  });

  it('الوارد والمُرسَل مفصولان بحسب الدور', async () => {
    const f = await fixture();
    await createOffer({ listingRef: f.listing.ref, buyerId: f.buyer.id, amount: 88_000 }, T0);

    const seller = await getOfferInbox(f.seller.id, 'ar', hours(1));
    const buyer = await getOfferInbox(f.buyer.id, 'ar', hours(1));

    expect(seller.active).toHaveLength(1);
    expect(seller.sent).toHaveLength(0);
    expect(buyer.active).toHaveLength(0);
    expect(buyer.sent).toHaveLength(1);
    await f.cleanup();
  });
});

describe('البلاغات', () => {
  /**
   * ═══ قرار ٥ ═══ **بلاغ واحد لا يُدخل المراجعة**: نقرة واحدة تُزيل
   * إعلان منافس أرخص من أيّ إعلان مدفوع. والمفرد يظهر في الطابور بلا
   * أثر على الإعلان.
   */
  it('بلاغ واحد يُسجَّل ولا يمسّ الإعلان', async () => {
    const f = await fixture();
    const filed = await fileReport({
      reporterId: f.buyer.id, targetType: 'listing', targetId: f.listing.id, reason: 'fraud',
    });

    expect(filed.ok && filed.underReview).toBe(false);
    expect((await db.listing.findUniqueOrThrow({ where: { id: f.listing.id } })).status).toBe('PUBLISHED');
    expect(await db.report.count({ where: { targetId: f.listing.id } })).toBe(1);
    await f.cleanup();
  });

  it('بلاغان مستقلّان يُدخلان المراجعة', async () => {
    const f = await fixture();
    const second = await db.user.create({
      data: { phone: `+96657${String(Date.now()).slice(-7)}` },
    });

    await fileReport({
      reporterId: f.buyer.id, targetType: 'listing', targetId: f.listing.id, reason: 'fraud',
    });
    const filed = await fileReport({
      reporterId: second.id, targetType: 'listing', targetId: f.listing.id, reason: 'wrong_data',
    });

    expect(filed.ok && filed.underReview).toBe(true);
    const listing = await db.listing.findUniqueOrThrow({ where: { id: f.listing.id } });
    expect(listing.status).toBe('PENDING_REVIEW');
    expect(listing.reviewReason).toBe('USER_REPORT');

    await db.report.deleteMany({ where: { reporterId: second.id } });
    await db.user.delete({ where: { id: second.id } });
    await f.cleanup();
  });

  /** مشترٍ له طلب رأى المركبة بعقد — وليس منافسًا يستطيع أن يكون. */
  it('بلاغ مشترٍ له طلب يكفي وحده', async () => {
    const f = await fixture();
    await db.order.create({
      data: {
        ref: `ORD-RPT-${String(Date.now()).slice(-8)}`,
        listingId: f.listing.id, buyerId: f.buyer.id, sellerId: f.seller.id,
        source: 'DIRECT', stage: 'PAYMENT', agreedPrice: 90_000,
        commissionPct: 0, commissionAmount: 0, totalAmount: 90_350,
      },
    });

    const filed = await fileReport({
      reporterId: f.buyer.id, targetType: 'listing', targetId: f.listing.id, reason: 'wrong_data',
    });
    expect(filed.ok && filed.underReview).toBe(true);

    await db.order.deleteMany({ where: { listingId: f.listing.id } });
    await f.cleanup();
  });

  it('لا بلاغ على إعلان صاحبه', async () => {
    const f = await fixture();
    const own = await fileReport({
      reporterId: f.seller.id, targetType: 'listing', targetId: f.listing.id, reason: 'other',
    });
    expect(own.ok).toBe(false);
    if (!own.ok) expect(own.reason).toBe('OWN_TARGET');
    await f.cleanup();
  });

  /** تكرار الشخص نفسه لا يزيد وزن البلاغ ويُغرق الطابور. */
  it('بلاغ واحد لكل مبلِّغ وهدف', async () => {
    const f = await fixture();
    await fileReport({
      reporterId: f.buyer.id, targetType: 'listing', targetId: f.listing.id, reason: 'fraud',
    });
    const again = await fileReport({
      reporterId: f.buyer.id, targetType: 'listing', targetId: f.listing.id, reason: 'duplicate',
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('ALREADY_REPORTED');
    await f.cleanup();
  });

  it('هدف غير موجود يُرفض', async () => {
    const f = await fixture();
    const missing = await fileReport({
      reporterId: f.buyer.id, targetType: 'listing', targetId: 'nope', reason: 'fraud',
    });
    expect(missing.ok).toBe(false);
    await f.cleanup();
  });
});

describe('A5 — كل اطّلاع مسجَّل', () => {
  /**
   * التسجيل **قبل الإرجاع**: لو سُجِّل بعده لأمكن أن يُقرأ ثم يفشل
   * التسجيل، فيقع اطّلاع بلا أثر — وهو ما يُفرغ السجلّ من معناه.
   */
  it('الاطّلاع يُكتب في سجلّ التدقيق ويحمل سببه', async () => {
    const { viewIdentity, identityAccessLog } = await import('@/lib/domain/admin-orders');
    const f = await fixture();

    const admin = await db.adminUser.create({
      data: {
        email: `id${String(Date.now()).slice(-9)}@carsell.one`,
        name: 'مراجع', role: 'SUPPORT', passwordHash: 'x',
      },
    });

    const before = await identityAccessLog(f.buyer.id);
    const identity = await viewIdentity(admin, f.buyer.id, '10.0.0.1', 'معالجة نزاع ORD-1');

    expect(identity).not.toBeNull();
    const after = await identityAccessLog(f.buyer.id);
    expect(after.length).toBe(before.length + 1);
    expect((after[0]?.after as { reason?: string })?.reason).toBe('معالجة نزاع ORD-1');
    expect(after[0]?.actorId).toBe(admin.id);
    expect(after[0]?.ip).toBe('10.0.0.1');

    await db.auditLog.deleteMany({ where: { actorId: admin.id } });
    await db.adminUser.delete({ where: { id: admin.id } });
    await f.cleanup();
  });

  /** الآيبان بأربعة أرقام: تكفي للمطابقة ولا تكفي للتحويل. */
  it('لا يُعاد الآيبان كاملًا', async () => {
    const { viewIdentity } = await import('@/lib/domain/admin-orders');
    const f = await fixture();
    await db.user.update({ where: { id: f.buyer.id }, data: { iban: 'SA0380000000608010167519' } });

    const admin = await db.adminUser.create({
      data: {
        email: `ib${String(Date.now()).slice(-9)}@carsell.one`,
        name: 'مراجع', role: 'SUPPORT', passwordHash: 'x',
      },
    });

    const identity = await viewIdentity(admin, f.buyer.id, null, 'مطابقة حساب');
    expect(identity?.ibanTail).toBe('7519');
    expect(JSON.stringify(identity)).not.toContain('SA0380000000608010167519');

    await db.auditLog.deleteMany({ where: { actorId: admin.id } });
    await db.adminUser.delete({ where: { id: admin.id } });
    await f.cleanup();
  });
});

describe('A4 — تنبيه تجاوز الضعف', () => {
  it('التنبيه من ضعف هدف المرحلة لا من رقم موحّد', async () => {
    const { STAGE_TARGET_HOURS, listAdminOrders } = await import('@/lib/domain/admin-orders');

    // الفحص هدفه ٧٢ ساعة والدفع ٢٤ — فرقم موحّد يظلم أحدهما
    expect(STAGE_TARGET_HOURS.INSPECTION).toBeGreaterThan(STAGE_TARGET_HOURS.PAYMENT);

    const rows = await listAdminOrders();
    for (const row of rows) {
      expect(row.targetHours).toBe(STAGE_TARGET_HOURS[row.stage]);
      if (row.critical) expect(row.dwellHours).toBeGreaterThan(row.targetHours * 2);
      if (row.late) expect(row.dwellHours).toBeGreaterThan(row.targetHours);
    }
  });
});
