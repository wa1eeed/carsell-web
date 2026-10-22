/**
 * ═══ ثوابتُ الشريحة — بلا `db` ═══
 *
 * **حدُّ الخادم/العميل يمرّ عبر الاستيرادات لا عبر التوجيهات**: خريطةُ
 * التسميات في `labels/` تحتاج مفاتيحَ هذه القائمة لتتعهّد بها، ولو
 * أخذتها من `domain/admin-campaigns.ts` لجرّت Prisma إلى حزمة
 * المتصفّح وأسقطت البناء. فالمشترك في ملفّه، والنطاقُ يعيد تصديره.
 */

export const SEGMENT_FIELDS = [
  { key: 'hasFavorites', kind: 'bool' },
  { key: 'hasCompletedOrder', kind: 'bool' },
  { key: 'hasActiveOrder', kind: 'bool' },
  { key: 'hasListing', kind: 'bool' },
  { key: 'hasVehicle', kind: 'bool' },
  { key: 'hasBid', kind: 'bool' },
  { key: 'isDealer', kind: 'bool' },
  { key: 'activeWithinDays', kind: 'number' },
] as const;

export type SegmentFieldKey = (typeof SEGMENT_FIELDS)[number]['key'];

export type SegmentRule = { field: string; negate?: boolean; value?: number };

const FIELD_KEYS: readonly string[] = SEGMENT_FIELDS.map((entry) => entry.key);

export function validRules(rules: unknown): rules is SegmentRule[] {
  if (!Array.isArray(rules) || rules.length === 0) return false;
  return rules.every(
    (rule: unknown) =>
      rule !== null &&
      typeof rule === 'object' &&
      typeof (rule as SegmentRule).field === 'string' &&
      FIELD_KEYS.includes((rule as SegmentRule).field),
  );
}

/** سقفُ الرسائل التسويقية لكلّ مستخدمٍ في الشهر. */
export const MARKETING_CAP_PER_MONTH = 4;

/** المهلةُ بين حملتين على المستخدم نفسه. */
export const COOLDOWN_HOURS = 72;
