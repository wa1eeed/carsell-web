import { db } from '@/lib/db';
import { toSlug } from './listing-detail';
import { cityNames } from './cities';
import { startingDealerPlanId } from './dealer-plan';

/**
 * ═══ إنشاءُ المعرض — الطرفُ الذي لم يُبنَ ═══
 *
 * قِيس ٢٠٢٦-١١-٢٦: **لا كاتبَ لنموذج `Dealer` في المنتج كلِّه**. رحلةُ
 * `/ar/auth/dealer` أربعُ خطوات تجمع الاسمَ والسجلَّ والعنوانَ
 * والآيبان، ثمّ تحفظ **اثنين منها في ملفّ المستخدم** وتذهب إلى
 * «حسابي» — فلا معرضَ يُنشأ، ولا يصير أحدٌ عضوًا، ويعود الزرُّ إلى
 * «سجل معرضك» أبدًا. ولا أحدَ صار صاحبَ معرضٍ إلّا بصفٍّ كُتب بيدٍ في
 * القاعدة.
 *
 * و`accountType: 'BUSINESS'` الذي يكتبه التسجيل **ليس عضويّة**: هو
 * وصفُ الحساب، والعضويّةُ `dealerId` و`dealerRole` (انظر
 * `dealer-membership.ts`).
 *
 * ═══ وينشأ `ACTIVE` غيرَ موثَّق — قرار المالك ٢٠٢٦-١١-٢٦ ═══
 *
 * «المفترض المعرض يسجل و يدخل للوحة تحكمه مباشره». والحقلان
 * **منفصلان في المخطّط منذ بُني**: `status` يقول «أيعمل؟»،
 * و`verified` يقول «أفحصنا سجلَّه؟» — وشارةُ «تاجر موثّق» تقرأ الثاني
 * وحده. فيعمل من أوّل دقيقة، وتنتظر الشارةُ مراجعَ اللوحة
 * (`decideDealer`).
 *
 * **والسجلُّ شرطٌ هنا** رغم ذلك: `decideDealer` ترفض التوثيق بلا رقم
 * سجلّ، فمعرضٌ يُنشأ بلا رقم **لا يمكن توثيقُه أبدًا** — بابٌ يُفتح
 * على طابورٍ لا يخرج منه.
 */

export type DealerRegistrationInput = {
  nameAr: string;
  nameEn: string;
  city: string;
  crNumber: string;
  address: string | null;
  phone: string | null;
};

export type DealerRegistrationResult =
  | { ok: true; dealerId: string; slug: string }
  | { ok: false; reason: 'ALREADY_MEMBER' }
  | { ok: false; reason: 'USER_NOT_FOUND' }
  | { ok: false; reason: 'VALIDATION'; fields: Record<string, string> };

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export function validateDealerRegistration(
  input: DealerRegistrationInput,
  cities: readonly string[],
): Record<string, string> {
  const fields: Record<string, string> = {};
  if (clean(input.nameAr).length < 2) fields.nameAr = 'REQUIRED';
  /**
   * **والاسمُ الإنجليزيّ منه يُشتقّ الرابط.** فبلا لاتينيٍّ يصير
   * عنوانُ صفحة المعرض عربيًّا مُرمَّزًا، ويُقارَن مُرمَّزًا بمفكوك
   * فيردّ ٤٠٤ صامتًا — وهو الصنف المسجَّل في هذا المستودع ثلاثًا.
   */
  if (clean(input.nameEn).length < 2) fields.nameEn = 'REQUIRED';
  else if (toSlug(clean(input.nameEn)).replace(/[^a-z0-9-]/g, '') === '') fields.nameEn = 'LATIN';
  /** والمدينةُ من الجدول: صفحةُ المعارض ومرشِّحُها يصفّيان بها. */
  if (clean(input.city) === '') fields.city = 'REQUIRED';
  else if (!cities.includes(clean(input.city))) fields.city = 'UNKNOWN';
  if (clean(input.crNumber) === '') fields.crNumber = 'REQUIRED';
  return fields;
}

/**
 * **والرابطُ يُضمن فريدًا بالقراءة لا بالأمل.** اسمان متشابهان واردان
 * («معرض الرياض» في مدينتين)، و`slug` فريدٌ في المخطّط — فاصطدامُه
 * يرمي «Unique constraint failed» ويتّهم الإنشاء.
 */
async function freeSlug(base: string): Promise<string> {
  const root = toSlug(base).replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '') || 'dealer';
  for (let suffix = 0; suffix < 50; suffix += 1) {
    const candidate = suffix === 0 ? root : `${root}-${String(suffix + 1)}`;
    const taken = await db.dealer.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (taken === null) return candidate;
  }
  return `${root}-${String(Date.now())}`;
}

export async function registerDealer(
  userId: string,
  input: DealerRegistrationInput,
  now: Date = new Date(),
): Promise<DealerRegistrationResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true, dealerId: true, dealerRole: true },
  });
  if (user === null) return { ok: false, reason: 'USER_NOT_FOUND' };
  /**
   * **ومن هو عضوٌ لا يُنشئ معرضًا ثانيًا.** العضويّةُ عمودٌ واحد على
   * المستخدم، فإنشاءُ الثاني يُخرجه من الأوّل صامتًا — ومعرضُه الأوّل
   * يبقى بمخزونه وفريقه بلا مالك.
   */
  if (user.dealerRole !== null || user.dealerId !== null) {
    return { ok: false, reason: 'ALREADY_MEMBER' };
  }

  const cities = await cityNames();
  const fields = validateDealerRegistration(input, cities);
  if (Object.keys(fields).length > 0) return { ok: false, reason: 'VALIDATION', fields };

  const slug = await freeSlug(input.nameEn);
  const planId = await startingDealerPlanId();

  const dealer = await db.$transaction(async (tx) => {
    const created = await tx.dealer.create({
      data: {
        slug,
        nameAr: clean(input.nameAr),
        nameEn: clean(input.nameEn),
        city: clean(input.city),
        address: clean(input.address) === '' ? null : clean(input.address),
        phone: clean(input.phone) === '' ? user.phone : clean(input.phone),
        crNumber: clean(input.crNumber),
        status: 'ACTIVE',
        verified: false,
        createdAt: now,
      },
      select: { id: true, slug: true },
    });

    /**
     * **ومن سجّل المعرض مالكُه** — و`role: 'DEALER'` وصفُ الحساب،
     * و`dealerRole: 'OWNER'` هو ما تقرؤه اللوحة.
     */
    await tx.user.update({
      where: { id: user.id },
      data: { role: 'DEALER', dealerId: created.id, dealerRole: 'OWNER', branchId: null },
    });

    /**
     * ═══ والمعرضُ يُولد بباقة ═══
     *
     * طبقةُ المعرض في محرّك الاستحقاقات تقرأ اشتراكَه، **ومعرضٌ بلا
     * اشتراكٍ يعمل بالافتراضيّات أبدًا** — أي بلا موديولٍ مدفوع، ولا
     * شيء يقول ذلك لصاحبه ولا للمشغّل. وقِيس ٢٠٢٦-١١-٢٦: أربعةُ
     * معارض مسجَّلة، **ولا اشتراكَ لواحدٍ منها**.
     *
     * **وغيابُ باقةٍ مبدئيّة لا يمنع التسجيل**: المعرضُ يُنشأ ويعمل
     * بالافتراضيّات، وإسنادُ الباقة بيد المشغّل — وردُّ تسجيلٍ لأنّ
     * جدولَ الباقات ناقصٌ عطلٌ عندنا يدفع ثمنَه من سجّل.
     */
    if (planId !== null) {
      await tx.subscription.create({
        data: { dealerId: created.id, planId, startsAt: now, status: 'active' },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorType: 'user',
        entity: 'Dealer',
        entityId: created.id,
        action: 'dealer.register',
        before: {},
        after: {
          slug: created.slug,
          city: clean(input.city),
          crNumber: clean(input.crNumber),
          planId,
        },
        ip: null,
        createdAt: now,
      },
    });

    return created;
  });

  return { ok: true, dealerId: dealer.id, slug: dealer.slug };
}
