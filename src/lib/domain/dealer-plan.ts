import { db } from '@/lib/db';

/**
 * ═══ باقةُ المعرض — الموديولُ لا يصل بلا اشتراك ═══
 *
 * قرارُ المالك ٢٠٢٦-١١-٢٦: أقسامُ اللوحة موديولزُ يمنحها السوبر أدمن
 * حسب الباقة. وبُني المحرّك (افتراضيّ ← باقةُ الشخص ← باقةُ المعرض ←
 * تجاوز)، وبُنيت الموديولز، **ولم يُبنَ ما بينهما**:
 *
 * ١. مفاتيحُ `dealer_pos` و`dealer_installments` و`dealer_landing`
 *    افتراضُها `false` — كُتبت ساعةَ لم تكن مبنيّة، **وبُنيت في اليوم
 *    نفسِه ولم تُقلب**. وهي رايةٌ بيدٍ تصف قدرةً تتقادم يوم تُبنى
 *    القدرة، والقاعدةُ مكتوبةٌ في `NOTES` عن رايةٍ أخرى.
 * ٢. **ولا باقةٍ تمنح واحدًا منها**: صفرُ صفوفٍ في `PlanEntitlement`
 *    لكلّ مفتاحٍ يبدأ بـ`dealer_`.
 * ٣. **ولا معرضَ له اشتراكٌ أصلًا**: صفرُ صفوفٍ في `Subscription`
 *    بـ`dealerId` — فطبقةُ المعرض في المحرّك لا تقرأ شيئًا أبدًا.
 * ٤. **ولا شاشةَ تُسند باقةً إلى معرض**: `/admin/dealers/[id]` بلا
 *    أثرٍ للاشتراك. فحتّى من عرف العلّة لا يملك بابًا لإصلاحها.
 *
 * فالنتيجة: نقطةُ البيع والتقسيطُ وموقعُ المعرض **مبنيّةٌ ومنشورة
 * وغائبةٌ عن كلّ شاشة** — وهو الصنفُ المسجَّل «قفلٌ بلا مفتاح»، وقد
 * وقع هنا في أربع حلقاتٍ متّصلة.
 */

/** الباقاتُ المعروضة للمعارض — والباقةُ الشخصية لا تُسند إلى منشأة. */
export async function dealerPlans() {
  return db.plan.findMany({
    where: { audience: 'dealer' },
    orderBy: { price: 'asc' },
    select: { id: true, key: true, nameAr: true, price: true, visible: true },
  });
}

/**
 * باقةُ هذا المعرض اليوم — و`null` لمعرضٍ بلا اشتراك.
 *
 * **والسؤالُ عن الاشتراك النافذ لا عن آخرِ ما كُتب**: اشتراكٌ انتهى
 * أمسِ يقرؤه المحرّكُ لا شيءَ، فعرضُه في الشاشة يقول للمشغّل إنّ
 * المعرضَ على باقةٍ وهو على الافتراضيّات.
 */
export async function dealerSubscription(dealerId: string, now: Date = new Date()) {
  return db.subscription.findFirst({
    where: {
      dealerId,
      status: 'active',
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    },
    orderBy: { startsAt: 'desc' },
    include: { plan: { select: { key: true, nameAr: true, price: true } } },
  });
}

export type AssignResult =
  | { ok: true; planKey: string }
  | { ok: false; reason: 'PLAN_NOT_FOUND' | 'NOT_A_DEALER_PLAN' | 'DEALER_NOT_FOUND' };

/**
 * يُسند باقةً إلى معرض — **ويُنهي ما قبلها في المعاملة نفسِها**.
 *
 * واشتراكان نافذان لمعرضٍ واحد يجعلان المحرّك يقرأ «الأحدث بدءًا»،
 * فترقيةٌ تُقرأ أو لا تُقرأ بحسب تاريخين — والقراءةُ لا تُترك للحظّ.
 */
export async function assignDealerPlan(
  input: { adminId: string; dealerId: string; planKey: string },
  now: Date = new Date(),
): Promise<AssignResult> {
  const [dealer, plan] = await Promise.all([
    db.dealer.findUnique({ where: { id: input.dealerId }, select: { id: true } }),
    db.plan.findUnique({
      where: { key: input.planKey },
      select: { id: true, key: true, audience: true },
    }),
  ]);

  if (dealer === null) return { ok: false, reason: 'DEALER_NOT_FOUND' };
  if (plan === null) return { ok: false, reason: 'PLAN_NOT_FOUND' };
  /** **وباقةُ فردٍ لا تُسند إلى منشأة** — والشرطُ في الخادم لا في القائمة. */
  if (plan.audience !== 'dealer') return { ok: false, reason: 'NOT_A_DEALER_PLAN' };

  await db.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { dealerId: input.dealerId, status: 'active' },
      data: { status: 'ended', endsAt: now },
    });

    await tx.subscription.create({
      data: {
        dealerId: input.dealerId,
        planId: plan.id,
        startsAt: now,
        status: 'active',
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.adminId,
        actorType: 'admin',
        entity: 'Dealer',
        entityId: input.dealerId,
        action: 'dealer.plan.assigned',
        before: {},
        after: { planKey: plan.key },
        ip: null,
        createdAt: now,
      },
    });
  });

  return { ok: true, planKey: plan.key };
}

/**
 * **والمعرضُ الجديد يُولد بباقة.** تسجيلٌ بلا اشتراكٍ يجعل طبقةَ المعرض
 * فارغة، فيعمل بالافتراضيّات — أي بلا موديولٍ مدفوع، **ولا شيء يقول
 * ذلك لصاحبه ولا للمشغّل**. وأرخصُ باقةٍ معروضة هي المبدئيّة.
 */
export async function startingDealerPlanId(): Promise<string | null> {
  const plan = await db.plan.findFirst({
    where: { audience: 'dealer', visible: true },
    orderBy: { price: 'asc' },
    select: { id: true },
  });
  return plan?.id ?? null;
}
