import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
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
