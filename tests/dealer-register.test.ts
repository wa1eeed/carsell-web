import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { encryptSecret } from '@/lib/crypto/secrets';
import { registerDealer, validateDealerRegistration } from '@/lib/domain/dealer-register';
import { dealerMembership, DEALER_MEMBERSHIP_SELECT } from '@/lib/domain/dealer-membership';
import { getAccountData } from '@/lib/domain/account';

/**
 * ═══ إنشاءُ المعرض — الطرفُ الذي لم يُبنَ ═══
 *
 * قِيس ٢٠٢٦-١١-٢٦ أنّ نموذج `Dealer` **بلا كاتبٍ في المنتج كلِّه**:
 * أربعُ خطواتٍ تُجمع ثمّ تُرمى. وهذه تفحص أنّ من سجّل صار **عضوًا
 * مالكًا في معرضٍ يعمل** — لا أنّ الدالّة لا ترمي.
 */

const PHONE = '+966597700001';
const CITIES = ['الرياض', 'جدة'] as const;

async function cleanup(): Promise<void> {
  const users = await db.user.findMany({
    where: { phone: { startsWith: '+9665977000' } },
    select: { id: true, dealerId: true },
  });
  const dealerIds = users.map((u) => u.dealerId).filter((id): id is string => id !== null);
  await db.dealerSession.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await db.user.updateMany({
    where: { id: { in: users.map((u) => u.id) } },
    data: { dealerId: null, dealerRole: null },
  });
  if (dealerIds.length > 0) {
    await db.auditLog.deleteMany({ where: { entity: 'Dealer', entityId: { in: dealerIds } } });
    await db.dealer.deleteMany({ where: { id: { in: dealerIds } } });
  }
  await db.dealer.deleteMany({ where: { slug: { startsWith: 'register-test' } } });
  await db.user.deleteMany({ where: { phone: { startsWith: '+9665977000' } } });
}

afterAll(cleanup);

const INPUT = {
  nameAr: 'معرض اختبار التسجيل',
  nameEn: 'Register Test Motors',
  city: 'الرياض',
  crNumber: '1010999888',
  address: 'طريق الاختبار',
  phone: PHONE,
};

describe('validateDealerRegistration', () => {
  it('يشترط السجلَّ — وبلا رقمٍ لا يُوثَّق المعرض أبدًا', () => {
    expect(validateDealerRegistration({ ...INPUT, crNumber: '  ' }, CITIES).crNumber).toBe('REQUIRED');
  });

  it('يشترط مدينةً من الجدول لا أيَّ نصّ', () => {
    expect(validateDealerRegistration({ ...INPUT, city: 'طوكيو' }, CITIES).city).toBe('UNKNOWN');
    expect(validateDealerRegistration(INPUT, CITIES).city).toBeUndefined();
  });

  /** ومنه يُشتقّ الرابط: اسمٌ عربيّ وحده يُنتج عنوانًا مُرمَّزًا. */
  it('يشترط لاتينيًّا في الاسم الإنجليزيّ', () => {
    expect(validateDealerRegistration({ ...INPUT, nameEn: 'معرض' }, CITIES).nameEn).toBe('LATIN');
  });
});

describe('registerDealer', () => {
  it('يُنشئ معرضًا يعمل، ويجعل صاحبَه مالكًا — وتفتح له اللوحة', async () => {
    await cleanup();
    const user = await db.user.create({
      data: { phone: PHONE, name: 'صاحب معرض الاختبار', accountType: 'BUSINESS' },
    });

    /** **قبل**: حسابٌ تجاريّ وليس عضوًا — فـ`accountType` ليس عضويّة. */
    const before = await db.user.findUnique({
      where: { id: user.id },
      select: DEALER_MEMBERSHIP_SELECT,
    });
    expect(dealerMembership(before).state).toBe('NOT_A_MEMBER');

    const result = await registerDealer(user.id, INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = await db.user.findUnique({
      where: { id: user.id },
      select: DEALER_MEMBERSHIP_SELECT,
    });
    const membership = dealerMembership(row);
    expect(membership.state).toBe('MEMBER');
    if (membership.state !== 'MEMBER') return;
    expect(membership.role).toBe('OWNER');
    expect(membership.dealerName).toBe(INPUT.nameAr);

    /**
     * **ويعمل غيرَ موثَّق** (قرار المالك): `status` يقول «أيعمل؟»
     * و`verified` يقول «أفحصنا سجلَّه؟» — والشارةُ تقرأ الثاني.
     */
    const dealer = await db.dealer.findUnique({
      where: { id: result.dealerId },
      select: { status: true, verified: true, crNumber: true, city: true, slug: true },
    });
    expect(dealer?.status).toBe('ACTIVE');
    expect(dealer?.verified).toBe(false);
    expect(dealer?.crNumber).toBe(INPUT.crNumber);
    expect(dealer?.slug).toBe('register-test-motors');

    /** وبابُ اللوحة يُعرض له — والشرطُ واحدٌ يقرؤه الاثنان. */
    const fresh = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect((await getAccountData(fresh, 'ar')).dealerPanel).toEqual({ name: INPUT.nameAr });

    /** وكلُّ إنشاءٍ يكتب أثرَه — ولا صفَّ معرضٍ بلا من أنشأه. */
    const log = await db.auditLog.findFirst({
      where: { entity: 'Dealer', entityId: result.dealerId, action: 'dealer.register' },
      select: { actorId: true, actorType: true },
    });
    expect(log).toEqual({ actorId: user.id, actorType: 'user' });
  });

  /** **ومن هو عضوٌ لا يُنشئ ثانيًا** — وإلّا بقي معرضُه الأوّل بلا مالك. */
  it('يرفض عضوًا قائمًا', async () => {
    const user = await db.user.findFirstOrThrow({ where: { phone: PHONE } });
    const again = await registerDealer(user.id, { ...INPUT, nameEn: 'Second Motors' });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('ALREADY_MEMBER');
  });
});

/**
 * ═══ يجهّز ولا يَعرض — قرار المالك ٢٠٢٦-١١-٢٦ ═══
 *
 * «المعرض يسجل و يدخل للوحة تحكمه مباشره»، ولا يصل السوقَ منه إعلانٌ
 * حتى يُراجع مراجعُ اللوحة سجلَّه. والحقلان منفصلان: `status` «أيعمل؟»
 * و`verified` «أفحصنا سجلَّه؟».
 */
describe('المعرض غير الموثق يجهز ولا ينشر', () => {
  const keys: string[] = [];
  const refs: string[] = [];

  afterAll(async () => {
    if (refs.length > 0) {
      const rows = await db.listing.findMany({
        where: { ref: { in: refs } },
        select: { id: true, vehicleId: true },
      });
      await db.listingImage.deleteMany({ where: { listingId: { in: rows.map((r) => r.id) } } });
      await db.listingFeature.deleteMany({ where: { listingId: { in: rows.map((r) => r.id) } } });
      await db.listing.deleteMany({ where: { ref: { in: refs } } });
      await db.vehicle.deleteMany({ where: { id: { in: rows.map((r) => r.vehicleId) } } });
    }
    if (keys.length > 0) await db.uploadedAsset.deleteMany({ where: { r2Key: { in: keys } } });
  });

  it('المسودة تُحفظ والنشر يُردّ بسببه — ثم يفتح بالتوثيق', async () => {
    const user = await db.user.findFirstOrThrow({
      where: { phone: PHONE },
      select: { id: true, dealerId: true },
    });

    /** والنشرُ يحتاج ملفًّا مكتملًا — وإلّا رُدّ بسببٍ آخر فلا يقيس شيئًا. */
    await db.user.update({
      where: { id: user.id },
      data: {
        email: 'register-test@example.com',
        identityStatus: 'VERIFIED',
        idVerified: true,
        /** **ومشفَّرًا كما يكتبه المنتج** — وصيغتان في عمودٍ واحد تُكسران قارئَه. */
        iban: encryptSecret('SA0380000000608010167519'),
        taxStatus: 'VAT_REGISTERED',
        vatNumber: '300000000000003',
      },
    });

    const model = await db.model.findFirstOrThrow({
      where: { trims: { some: { visible: true } } },
      include: { trims: { where: { visible: true }, take: 1 } },
    });
    const key = `register-test/${user.id.slice(-6)}.jpg`;
    await db.uploadedAsset.upsert({
      where: { r2Key: key },
      create: { r2Key: key, ownerId: user.id, phash: 'a1b2c3d4e5f60718', plateBlurred: true, qualityFlags: [] },
      update: { ownerId: user.id },
    });
    keys.push(key);

    const { createListing } = await import('@/lib/domain/publish');
    const input = {
      sellerId: user.id,
      type: 'DIRECT' as const,
      askPrice: 90_000,
      taxableSupply: null,
      vehicle: {
        brandId: model.brandId,
        modelId: model.id,
        trimId: model.trims[0]!.id,
        year: 2023,
        mileageKm: 40_000,
        transmission: 'AUTOMATIC' as const,
        fuel: 'PETROL' as const,
        spec: 'SAUDI' as const,
        condition: 'USED' as const,
        city: 'الرياض',
        colorExterior: 'أبيض',
        vin: null,
      },
      images: [key],
    };

    /** **المسودّة تمرّ** — التجهيزُ نصفُ القرار. */
    const draft = await createListing({ ...input, draft: true });
    expect(draft.ok).toBe(true);
    if (draft.ok) refs.push(draft.ref);

    /** **والنشرُ يُردّ بسببه لا بـ«غير مسموح»** — فلم يُخطئ في شيء. */
    const blocked = await createListing(input);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('DEALER_NOT_VERIFIED');

    /** وبالتوثيق يسقط هذا المانع وحده. */
    if (user.dealerId !== null) {
      await db.dealer.update({ where: { id: user.dealerId }, data: { verified: true } });
    }
    const after = await createListing(input);
    expect(after.ok === false && after.reason === 'DEALER_NOT_VERIFIED').toBe(false);
    if (after.ok) refs.push(after.ref);
  });
});

/**
 * ═══ وبابُ ما يفتح النشر — داخل اللوحة ═══
 *
 * أُغلقت صفحةُ الحساب على عضو المعرض (قرار المالك)، **وكانت الحقولُ
 * التي يشترطها النشر لا تُكتب إلّا فيها**. وهذه تفحص أنّ ما كان
 * يُستوفى هناك يُستوفى الآن من اللوحة، وأنّ شاشتَها موجودةٌ وللمالك
 * وحده.
 */
describe('بيانات صاحب المعرض تفتح النشر من اللوحة', () => {
  it('توثيق المنشأة يكتب الوضع الضريبي — فلا يبقى النشر مردودا به', async () => {
    const user = await db.user.findFirstOrThrow({
      where: { phone: PHONE },
      select: { id: true },
    });
    await db.user.update({
      where: { id: user.id },
      data: { taxStatus: null, taxStatusSetAt: null, idVerified: false, identityStatus: 'NONE' },
    });

    const { submitBusinessIdentity } = await import('@/lib/domain/business-identity');
    const saved = await submitBusinessIdentity(user.id, {
      signatoryName: 'صاحب معرض الاختبار',
      signatoryNationalId: '1098765432',
      businessName: 'معرض اختبار التسجيل',
      crNumber: '1010999888',
      crExpiresAt: '2030-01-01',
      vatNumber: '300000000000003',
    });
    expect(saved.ok).toBe(true);

    const after = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { taxStatus: true, vatNumber: true, accountType: true },
    });
    expect(after.taxStatus).toBe('VAT_REGISTERED');
    expect(after.accountType).toBe('BUSINESS');
  });

  /** **وبلا رقمٍ ضريبيّ منشأةٌ غيرُ مسجَّلة** — لا «بلا وضع». */
  it('وبلا رقم ضريبي يكتب غير مسجل', async () => {
    const user = await db.user.create({
      data: { phone: '+966597700002', name: 'صاحب معرض ثان' },
    });
    const { submitBusinessIdentity } = await import('@/lib/domain/business-identity');
    await submitBusinessIdentity(user.id, {
      signatoryName: 'صاحب معرض ثان',
      signatoryNationalId: '1098765433',
      businessName: 'معرض بلا ضريبة',
      crNumber: '1010999777',
      crExpiresAt: '2030-01-01',
      vatNumber: '',
    });
    const after = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { taxStatus: true, vatNumber: true },
    });
    expect(after.taxStatus).toBe('INDIVIDUAL');
    expect(after.vatNumber).toBeNull();
  });
});
