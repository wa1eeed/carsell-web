import type { InstallmentMethod, InstallmentStatus } from '@/generated/prisma/enums';

/**
 * تسمياتُ التقسيط — **بتعهّدٍ للمُصرِّف** (البوابة ٥٩): قيمةٌ تُضاف إلى
 * التعداد بلا تسميةٍ تُعرض خامًا، والفهرسةُ بنصٍّ تُعيد `undefined` بلا
 * شكوى.
 */
export const INSTALLMENT_STATUS_AR = {
  ACTIVE: 'قائم',
  SETTLED: 'مسدد',
  DEFAULTED: 'متعثر',
  CANCELLED: 'ملغى',
} satisfies Record<InstallmentStatus, string>;

export const INSTALLMENT_METHOD_AR = {
  CASH: 'نقدا',
  CARD: 'شبكة',
  TRANSFER: 'حوالة',
} satisfies Record<InstallmentMethod, string>;
