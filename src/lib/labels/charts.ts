import { toArabicDigits } from '@/lib/arabic';

/**
 * تسميات الرسوم — **هنا لا في النطاق** (البوابة ١٧).
 *
 * والملف بلا `db`: تستورده الشاشات، ووحدةٌ تستورد `db` تجرّ Prisma إلى
 * حزمة المتصفّح.
 */

export const STAGE_LABEL: Record<string, string> = {
  REQUEST: 'الطلب',
  APPROVED: 'الموافقة',
  INSPECTION: 'الفحص',
  PAYMENT: 'الدفع',
  TRANSFER: 'نقل الملكية',
  DONE: 'الإنهاء',
};

/** مراحل أزمنة A2 — والمفتاح يصف الانتظار لا الحالة. */
export const STAGE_TIME_LABEL: Record<string, string> = {
  approval: 'ردّ البائع',
  payment: 'إتمام الدفع',
  transfer: 'نقل الملكية',
  release: 'الإفراج عن المبلغ',
};

const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/** علامة محورٍ ليوم — «٤ أغسطس». */
export function dayTick(iso: string): string {
  const [, month, day] = iso.split('-');
  const index = Number(month) - 1;
  return `${toArabicDigits(String(Number(day)))} ${MONTHS_AR[index] ?? ''}`;
}

/** علامة محورٍ لشهر — «أغسطس ٢٠٢٦». */
export function monthTick(iso: string, withYear = false): string {
  const [year, month] = iso.split('-');
  const index = Number(month) - 1;
  const name = MONTHS_AR[index] ?? '';
  return withYear ? `${name} ${toArabicDigits(String(year))}` : name;
}
