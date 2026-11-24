import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * ═══ ولا يُستثنى من القياس شيءٌ بلا سببٍ مكتوب ═══
 *
 * `DECIDED_AGAINST` في `design-audit.mjs` تُخرج إشاراتٍ من المقام لأنّ
 * قرارًا قضى ألّا تُبنى. **وقائمةٌ كهذه تصير مخبأً** إن لم يُشترط لكلّ
 * مُدخَلٍ فيها سطرٌ في `docs/DESIGN-DEVIATIONS.md`: من أراد رفع النسبة
 * يضيف سطرًا ويرتفع الرقم بلا أن يُبنى شيء.
 *
 * فيُفحص الاتّجاهان: كلُّ مستثنًى له سببٌ في السجلّ، والسجلُّ يُقرأ.
 */
const AUDIT = readFileSync('scripts/design-audit.mjs', 'utf8');
const REGISTER = readFileSync('docs/DESIGN-DEVIATIONS.md', 'utf8');

/** يقرأ `A35: [['إشارة', 'سبب'], …]` من مصدر الأداة. */
function decidedAgainst(): { tag: string; signal: string; reason: string }[] {
  const block = AUDIT.match(/const DECIDED_AGAINST = \{([\s\S]*?)\n\};/);
  if (block === null) throw new Error('DECIDED_AGAINST غير موجودة — تغيّر شكلها؟');

  const out: { tag: string; signal: string; reason: string }[] = [];
  let tag = '';
  for (const line of block[1]?.split('\n') ?? []) {
    const head = /^\s*(\w+):\s*\[/.exec(line);
    if (head?.[1] !== undefined) tag = head[1];
    const entry = /\['([^']+)',\s*'([^']+)'\]/.exec(line);
    if (entry?.[1] !== undefined && entry[2] !== undefined) {
      out.push({ tag, signal: entry[1], reason: entry[2] });
    }
  }
  return out;
}

/** التشكيل يُمسح من الطرفين — السجلّ يكتبه والأداة قد لا تكتبه. */
const bare = (value: string): string => value.replace(/[ً-ْٰ]/g, '');

describe('ما قُرّر ألّا يُبنى — مستثنًى بسبب مكتوب', () => {
  const rows = decidedAgainst();

  it('القائمة ليست فارغة — وإلّا فالفحص بلا مقام', () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it('كل إشارة مستثناة مذكورة في سجلّ الانحرافات', () => {
    const register = bare(REGISTER);
    for (const row of rows) {
      expect(
        register.includes(bare(row.signal)),
        `${row.tag}: «${row.signal}» مستثناةٌ من القياس ولا سطرَ لها في DESIGN-DEVIATIONS`,
      ).toBe(true);
    }
  });

  it('ولكل مُدخَلٍ سببٌ مكتوب في الأداة نفسها', () => {
    for (const row of rows) {
      expect(row.reason.trim().length, `${row.tag}: «${row.signal}» بلا سبب`).toBeGreaterThan(8);
    }
  });
});
