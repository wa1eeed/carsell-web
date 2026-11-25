import { describe, expect, it } from 'vitest';
import { AUDIT_LENSES, AUDIT_LENS_KEYS, AUDIT_SENSITIVE } from '@/lib/domain/admin-monitors';
import { AUDIT_ACTION_LABEL } from '@/lib/labels/audit';

/**
 * ═══ عدسةُ «الحسّاسة» قائمةٌ بأعيانها — فتُحرَس ═══
 *
 * العدساتُ الثلاث ببادئات، فإجراءٌ جديد تحت `escrow.` يدخل «مالية»
 * وحده. و«حسّاسة» مكتوبةٌ باسم كلّ إجراء، **فإعادةُ تسميةِ إجراءٍ
 * تُسقطه منها صامتًا** — ويبقى التاب يعرض عددًا ناقصًا لا يشكو منه أحد.
 */
describe('عدسات سجل التدقيق', () => {
  it('كل إجراء حسّاس له تسمية — فلا اسمَ ميّتًا في القائمة', () => {
    for (const action of AUDIT_SENSITIVE) {
      expect(
        AUDIT_ACTION_LABEL[action],
        `«${action}» في عدسة الحسّاسة ولا تسمية له — أعيدت تسميتُه أو حُذف`,
      ).toBeDefined();
    }
  });

  it('والقائمة ليست فارغة ولا مكرّرة', () => {
    expect(AUDIT_SENSITIVE.length).toBeGreaterThan(5);
    expect(new Set(AUDIT_SENSITIVE).size).toBe(AUDIT_SENSITIVE.length);
  });

  /**
   * **والمفاتيحُ المقبولة تشمل الحسّاسة** — كانت الشاشة تحمل قائمتها
   * بيدٍ، فعدسةٌ تُضاف في النطاق تُردّ في الشاشة وتُقرأ «الكل».
   */
  it('ومفاتيح العدسات تشمل كل عدسة معرَّفة', () => {
    for (const key of Object.keys(AUDIT_LENSES)) {
      expect(AUDIT_LENS_KEYS).toContain(key);
    }
    expect(AUDIT_LENS_KEYS).toContain('sensitive');
  });
});
