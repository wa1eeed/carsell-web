/**
 * تنظيف ما تركه تشغيل فاشل — **مرّة قبل كل تشغيل**.
 *
 * `afterAll` لا يجري حين يرمي التأكيد قبله، فأدمنُ اختبارٍ يبقى في
 * قاعدة التطوير ويظهر في «الفريق والصلاحيات» كأنه موظّف. وهذا وقع
 * فعلًا: ستّة حسابات باسم «محرّر» من تشغيلات فشلت.
 *
 * والمسح مقصور على النمط `<بادئة><طابع زمني>@carsell.one` — والحسابات
 * المزروعة أسماؤها كلمات بلا أرقام، فلا تُمَسّ.
 */
/**
 * النمط لا القائمة: **حروف ثم طابع زمني** هو شكل كل بريد يولّده اختبار،
 * أيًّا كانت بادئته. وقائمة بادئات تُنسى واحدةٌ منها فتتراكم عشرات
 * الحسابات بلا أن يلاحظها أحد — وقد تراكمت ثمانية عشر فعلًا.
 *
 * والحسابات المزروعة كلماتٌ بلا أرقام (`super` · `ops` · `finance`).
 */
const TEST_EMAIL = /^[a-z]{1,8}\d{6,}@carsell\.one$/;

export default async function globalSetup(): Promise<void> {
  // `globalSetup` يسبق `setupFiles` — فالبيئة تُحمَّل هنا أيضًا لا هناك وحدها
  try {
    process.loadEnvFile();
  } catch {
    // المتغيّرات من البيئة نفسها
  }

  const { db } = await import('@/lib/db');

  const candidates = await db.adminUser.findMany({ select: { id: true, email: true } });
  const ids = candidates.filter((row) => TEST_EMAIL.test(row.email)).map((row) => row.id);

  /**
   * والتحقّق الحيّ يكتب صفوفًا أيضًا — **فيُنظَّف آليًّا لا انضباطًا**.
   *
   * طلب تبديل بوابة تركتُه معلّقًا في تحقّقٍ يدويّ أسقط اختبارين في
   * التشغيل التالي: الاختبار كان محقًّا، والبيانات هي المتّسخة.
   */
  const stalePending = await db.approvalRequest.deleteMany({
    where: { kind: { in: ['PAYMENT_ROUTE', 'KEY_ROTATION', 'INTEGRATION_ENV'] }, status: 'PENDING' },
  });
  if (stalePending.count > 0) {
    console.log(`  نُظّف ${String(stalePending.count)} طلب موافقة معلّق من تحقّق سابق`);
  }

  if (ids.length > 0) {
    await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await db.adminSession.deleteMany({ where: { adminUserId: { in: ids } } });
    await db.adminUser.deleteMany({ where: { id: { in: ids } } });
    console.log(`  نُظّف ${String(ids.length)} حساب اختبار من تشغيل سابق`);
  }

  await db.$disconnect();
}
