import type { ApiScope } from '@/lib/api/scopes';

/**
 * ═══ تسميةُ النطاقات ═══
 *
 * **والخريطةُ تحمل تعهّدَ قائمتها** (البوابة ٥٩): نطاقٌ يُضاف بلا
 * تسمية يُعرض خامًّا — `read:dealers` لا تقول للمشغّل ما الذي يفتحه.
 */
export const API_SCOPE_LABEL: Record<ApiScope, string> = {
  'read:listings': 'قراءة الإعلانات',
  'read:dealers': 'قراءة المعارض',
};

/** ما يفتحه كل نطاق بالضبط — فالمشغّل يمنح ما يفهمه. */
export const API_SCOPE_HINT: Record<ApiScope, string> = {
  'read:listings': 'قائمة الإعلانات المنشورة وصفحة إعلان واحد.',
  'read:dealers': 'فهرس المعارض النشطة.',
};
