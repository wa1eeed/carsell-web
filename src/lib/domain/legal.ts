import { db } from '@/lib/db';

/**
 * ═══ القبولُ يُسجَّل — ولم يكن يُسجَّل ═══
 *
 * شاشةُ الدخول تعرض مربّعًا إلزاميًّا: «أوافق على الشروط والأحكام
 * وسياسة الخصوصية»، ولا يمضي الزرُّ قبل تأشيره. **ولا صفَّ في القاعدة
 * كلِّها يقول إنّ أحدًا قبِل شيئًا** — لا حقلٌ في `User` ولا جدول،
 * و`agreed` حالةٌ في المتصفّح تموت بإغلاق التبويب.
 *
 * فالمنصّة تشترط موافقةً ثمّ لا تملك دليلًا عليها: نزاعٌ واحد يسأل «على
 * أيّ نصٍّ وافق؟» يجدنا بلا جواب. وهو **الشرطُ المعروض الذي لا يُفرَض**
 * في أخطر صوره — إذ غيرُه يُكلّف صاحبَه ضغطةً، وهذا يُكلّف المنصّة
 * حجّتَها.
 *
 * ═══ والقبولُ بالنسخة لا بالمستند ═══
 *
 * من وافق في أغسطس وافق على نصِّ أغسطس. فالصفُّ يحمل `version` لحظتَه،
 * لا مرجعًا إلى مستندٍ يتغيّر بعده — وإلّا كان سجلُّ القبول يتحرّك مع
 * كل تصحيحٍ مطبعيّ.
 */

/**
 * إخطارُ التعديل الجوهريّ — **وأربعةَ عشرَ يومًا نصُّ الترميز حرفيًّا**
 * («تعديل جوهريّ يُخطَر قبل ١٤ يومًا»).
 */
export const REACCEPT_NOTICE_DAYS = 14;

/**
 * ═══ «يظهر في» — يُشتقّ ولا يُكتب ═══
 *
 * ترميز A34 يضع عمودًا يقول أين يُعرض كلُّ مستند. **وحقلٌ يكتبه
 * المشغّل بيده يكذب أوّلَ تغييرٍ في الشيفرة**: يقول «قبل أوّل مزايدة»
 * ولا شيء يعرضه هناك، فيقرؤه مَن يقرؤه وعدًا.
 *
 * فالسطحان المشتقّان وحدهما: `SIGNUP` من `requiredAtSignup` — وهو
 * **الحقلُ نفسُه** الذي يقرؤه التسجيل ليطلب القبول، فلا يتباعدان —
 * و`LEGAL` من `active`، إذ كلُّ مستندٍ سارٍ يبلغه الزائر من التذييل
 * ومن الشريط الجانبيّ في أيّ صفحةٍ قانونية.
 */
export type LegalSurface = 'SIGNUP' | 'LEGAL';

export function surfacesFor(doc: { active: boolean; requiredAtSignup: boolean }): LegalSurface[] {
  const surfaces: LegalSurface[] = [];
  if (doc.requiredAtSignup) surfaces.push('SIGNUP');
  if (doc.active) surfaces.push('LEGAL');
  return surfaces;
}

export type RequiredDocument = {
  key: string;
  titleAr: string;
  version: string;
};

/** المستنداتُ التي يشترط التسجيلُ قبولَها — سارية، بترتيب العرض. */
export async function requiredDocuments(): Promise<RequiredDocument[]> {
  const docs = await db.legalDocument.findMany({
    where: { active: true, requiredAtSignup: true },
    orderBy: { sort: 'asc' },
    select: { key: true, titleAr: true, version: true },
  });
  return docs;
}

/**
 * ما لم يقبله هذا المستخدم من المشترط — **بنسخته الحالية**.
 *
 * فمن قبِل `terms@1.0` ثمّ نُشرت `1.1` جوهريّةً يظهر هنا، وهو ما يبني
 * عليه البنرُ طلبَ القبول الجديد.
 */
export async function pendingAcceptance(userId: string): Promise<RequiredDocument[]> {
  const required = await requiredDocuments();
  if (required.length === 0) return [];

  const held = await db.legalAcceptance.findMany({
    where: {
      userId,
      OR: required.map((doc) => ({ documentKey: doc.key, version: doc.version })),
    },
    select: { documentKey: true, version: true },
  });

  const key = (documentKey: string, version: string): string => `${documentKey}@${version}`;
  const have = new Set(held.map((row) => key(row.documentKey, row.version)));

  return required.filter((doc) => !have.has(key(doc.key, doc.version)));
}

/**
 * يكتب صفَّ قبولٍ لكل مستندٍ مشترط — **ولا يرمي إن كان مكتوبًا**.
 *
 * فإعادةُ الطلب على نسخةٍ قبِلها المستخدم لا تُنشئ صفًّا ثانيًا
 * (`@@unique([userId, documentKey, version])`)، ولا تُفشل الطلبَ الذي
 * جاءت فيه.
 *
 * ويعيد **ما كُتب فعلًا**: صفرًا إن لم يكن ناقصًا شيء، وهو ما يميّز
 * «قُبِل الآن» من «كان مقبولًا» في الشاشة.
 */
export async function recordAcceptance(
  userId: string,
  context: 'signup' | 'reaccept',
): Promise<number> {
  const required = await requiredDocuments();
  if (required.length === 0) return 0;

  const result = await db.legalAcceptance.createMany({
    data: required.map((doc) => ({
      userId,
      documentKey: doc.key,
      version: doc.version,
      context,
    })),
    skipDuplicates: true,
  });

  return result.count;
}

export type AcceptanceStats = {
  /** من يلزمه قبولٌ — كلُّ مَن له حساب. */
  users: number;
  /** من يحمل قبولًا على **كل** المشترط بنسخته الحالية. */
  accepted: number;
  /** النسبة صحيحةً — و`100` حين لا مستندَ مشترطًا (لا شرطَ فلا نقص). */
  pct: number;
  /** عددُ المستندات المشترطة — تقرؤه الشاشة لتقول «إلزاميّ للتسجيل». */
  required: number;
};

/**
 * ═══ نسبةُ القبول — **ومعناها أنّها تنقص** ═══
 *
 * بطاقةُ الترميز تقول «١٠٠٪ · إلزاميّ للتسجيل»، وهي حين تكون مئةً لا
 * تقول شيئًا — وذلك صوابُها: **قيمتُها في نقصانها.** فنقصُها يعني
 * نسخةً جوهريّةً نفذت ولم يقبلها الجميع بعد، أو حساباتٍ لا سجلَّ قبولٍ
 * لها أصلًا.
 *
 * والثاني حالُنا اليوم: ستّةٌ وعشرون حسابًا سابقًا للسجلّ. **ولا
 * يُختلَق لها صفّ** — تاريخُ قبولٍ نكتبه بأنفسنا سجلٌّ مُفتعَل، وهو
 * أسوأ من رقمٍ ناقصٍ صادق. فتُسأل موافقتُها بالبنر، ويرتفع الرقم بما
 * يقع لا بما نكتب.
 */
export async function acceptanceStats(): Promise<AcceptanceStats> {
  const required = await requiredDocuments();
  const users = await db.user.count();

  if (required.length === 0 || users === 0) {
    return { users, accepted: users, pct: 100, required: required.length };
  }

  /**
   * **والعدُّ على المجموعات لا على المستخدمين.** استعلامٌ لكل مستخدم
   * يصير ألفًا على ألف حساب؛ وهذا واحدٌ يجمع قبولاتِ النسخ الحالية
   * ويُحصي من بلغ عددُه عددَ المشترط.
   */
  const groups = await db.legalAcceptance.groupBy({
    by: ['userId'],
    where: { OR: required.map((doc) => ({ documentKey: doc.key, version: doc.version })) },
    _count: { documentKey: true },
  });

  const accepted = groups.filter((row) => row._count.documentKey >= required.length).length;

  return {
    users,
    accepted,
    pct: Math.round((accepted / users) * 100),
    required: required.length,
  };
}
