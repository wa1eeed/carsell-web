import { describe, expect, it } from 'vitest';
import { INTEGRATION_SECRET_FIELDS, secretFieldsFor } from '../src/lib/domain/integration-fields';
import { INTEGRATION_FIELD_LABEL } from '../src/lib/labels/admin';

/**
 * ═══ ولكلّ حقلٍ تسميةٌ عربية ═══
 *
 * شاشةُ التكاملات كانت تعرض أسماء الحقول بمفاتيحها اللاتينية
 * (`secretKey` · `clientId`)، ومن يضبط تكاملًا لأوّل مرّة لا يعرف أيَّ
 * حقلٍ تقابل في لوحة المزوّد.
 *
 * **والسقوطُ إلى الاسم الخام صامت**: `LABEL[name] ?? name` يعرض المفتاح
 * ولا يشكو، فحقلٌ جديد يمرّ بلا تسمية ولا يلاحظه أحد. وهذا يشكو.
 */
describe('تسميات حقول التكامل', () => {
  it('لكل حقل معلن تسمية عربية', () => {
    const missing: string[] = [];
    for (const fields of Object.values(INTEGRATION_SECRET_FIELDS)) {
      for (const name of fields) {
        if (INTEGRATION_FIELD_LABEL[name] === undefined) missing.push(name);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it('وحقل التكامل غير المعلن له تسمية كذلك', () => {
    /** `secretFieldsFor` تُرجع `apiKey` لما لم يُعلَن — فلا محرّر فارغ. */
    for (const name of secretFieldsFor('a_key_nobody_declared')) {
      expect(INTEGRATION_FIELD_LABEL[name], name).toBeDefined();
    }
  });

  it('ولا تسمية عربية بلا حقل يحملها — فالخريطة لا تنتفخ بما مضى', () => {
    const declared = new Set(Object.values(INTEGRATION_SECRET_FIELDS).flat());
    /** `publicKey` مرسوم في الترميز ولم يُعلَن بعد لأي مزوّد — مستثنى بنصّه. */
    declared.add('publicKey');
    const orphans = Object.keys(INTEGRATION_FIELD_LABEL).filter((k) => !declared.has(k));
    expect(orphans).toEqual([]);
  });
});
