import { db } from '@/lib/db';
import type { TrustMarkKind } from '@/generated/prisma/enums';

/**
 * ═══ علاماتُ الموثوقية — دعوى لا زينة ═══
 *
 * طلب المالك ٢٠٢٦-١٠-١٨: شعاراتُ الجهات ووسائلُ الدفع في التذييل
 * «بذكاء واحترافيه».
 *
 * **ووسمُ جهةٍ نظامية دعوى**: «مسجَّلون للضريبة»، «سجلُّنا التجاريّ
 * قائم». والمنصّاتُ التي تُحسن هذا تطبع الرقمَ تحت الوسم وتربطه
 * بصفحة التحقّق — وبه وحده يُساوي الوسمُ شيئًا، وبدونه صورةٌ لا
 * تُراجَع. فالقراءةُ تُخرج الرقمَ والرابط، والشاشةُ تعرض «موثَّق»
 * لمن له رقم و«مسجَّل» لمن لم يُملأ بعد.
 */

export type TrustMarkView = {
  key: string;
  nameAr: string;
  nameEn: string;
  logoPath: string;
  registrationNo: string | null;
  verifyUrl: string | null;
};

/**
 * علاماتُ صنفٍ واحد، مرتَّبة — **والمطفأةُ لا تخرج**.
 *
 * فالإطفاءُ هو كيف يسحب المالكُ دعوى لم تعد قائمة: شهادةٌ انقضت أو
 * وسيلةُ دفعٍ أُوقفت. وعلامةٌ تبقى معروضةً بعد انقضائها أسوأ من ألّا
 * تكون — لأنها تُقرأ ساريةً.
 */
export async function trustMarks(kind: TrustMarkKind): Promise<TrustMarkView[]> {
  const rows = await db.trustMark.findMany({
    where: { kind, active: true },
    orderBy: { sort: 'asc' },
    select: {
      key: true,
      nameAr: true,
      nameEn: true,
      logoPath: true,
      registrationNo: true,
      verifyUrl: true,
    },
  });
  return rows;
}
