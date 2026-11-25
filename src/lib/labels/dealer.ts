import type { DealerRole } from '@/generated/prisma/enums';

/**
 * أدوارُ فريق المعرض بالعربية — ومصفوفةُ صلاحياتها في `D9`.
 *
 * **وتعهّدُ `Record` يفرض الاكتمال**: دورٌ يُضاف إلى التعداد بلا
 * تسمية يُعرض مفتاحًا لاتينيًّا في شاشةٍ عربية. (البوابة ٥٩.)
 */
export const DEALER_ROLE_AR: Record<DealerRole, string> = {
  OWNER: 'مالك',
  MANAGER: 'مدير',
  SALES: 'مبيعات',
  ACCOUNTANT: 'محاسب',
};
