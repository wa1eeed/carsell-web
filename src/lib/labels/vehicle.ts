import type {
  AccidentStatus,
  ChargePort,
  DocumentStatus,
  PaintStatus,
  PreviousOwners,
  RegistrationType,
} from '@/generated/prisma/enums';

/**
 * ═══ تسمياتُ صفات المركبة — للوحة الأدمن وصفحة صاحبها ═══
 *
 * موضعُها `labels` لا شاشة: تقرؤها لوحةُ الأدمن وصفحةُ المستخدم،
 * ونسختان تتباعدان أوّل تسميةٍ تُعدَّل.
 *
 * **وكلُّها بتعهّدٍ للمُصرِّف** (البوابة ٥٩): قيمةُ تعدادٍ تُضاف بلا
 * تسمية تُعرض بمفتاحها الخام — وقد وقع ثلاث مرّات قبل أن تُعقد.
 */
export const REGISTRATION_TYPE_LABEL = {
  PRIVATE: 'خصوصي',
  PRIVATE_TRANSPORT: 'نقل خاص',
  PUBLIC_TRANSPORT: 'نقل عام',
  MINIBUS: 'حافلة صغيرة',
  TAXI: 'أجرة',
  MOTORCYCLE: 'دراجة نارية',
  HEAVY_EQUIPMENT: 'أشغال عامة',
} as const satisfies Record<RegistrationType, string>;

export const DOCUMENT_STATUS_LABEL = {
  VALID: 'ساري',
  EXPIRED: 'منتهي',
} as const satisfies Record<DocumentStatus, string>;

export const PAINT_STATUS_LABEL = {
  ORIGINAL: 'كامل الوكالة',
  PARTIAL: 'رش جزئي',
  REPAINTED: 'مرشوش بالكامل',
  UNKNOWN: 'غير محدد',
} as const satisfies Record<PaintStatus, string>;

export const CHARGE_PORT_LABEL = {
  CCS2: 'CCS2',
  GBT: 'GB/T',
  TYPE2: 'Type 2',
} as const satisfies Record<ChargePort, string>;

/** **والغائبُ يُقال «لم يحدد» لا يُترك فراغًا** — الفراغُ يُقرأ عطلًا. */
export function labelOf(
  map: Record<string, string>,
  value: string | null,
  fallback = 'لم يحدد',
): string {
  if (value === null || value === '') return fallback;
  return map[value] ?? value;
}

export const ACCIDENT_STATUS_LABEL = {
  NONE: 'بدون حوادث',
  REPORTED: 'يوجد حوادث مسجلة',
  UNREPORTED: 'يوجد حوادث غير مسجلة',
} as const satisfies Record<AccidentStatus, string>;

export const PREVIOUS_OWNERS_LABEL = {
  FIRST: 'مالك أول',
  SECOND: 'مالك ثاني',
  THREE: '٣ ملاك سابقين',
  FOUR: '٤ ملاك سابقين',
  MORE_THAN_FOUR: 'أكثر من ٤ ملاك',
} as const satisfies Record<PreviousOwners, string>;
