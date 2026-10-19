import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { classifyModels, frozenModels, untouchedModels } from '../scripts/model-writers.mjs';

const ROOT = process.cwd();
const REGISTER = join(ROOT, 'docs/architecture/editability.md');

const declared = (text: string): string[] =>
  [...text.matchAll(/^\|\s*`(\w+)`\s*\|/gm)].map((m) => m[1] ?? '');

/**
 * ═══ نموذجٌ بلا محرّرٍ له سببٌ معلَن ═══
 *
 * **وأخطرُ تعفّنٍ في التوثيق جملةٌ لم تصحّ يوم كُتبت**: «يُضبط من
 * اللوحة» تُكتب وقت التخطيط تصف نيّةً، وتُقرأ وصفًا لواقع. وثلاثٌ
 * منها كانت كاذبةً في جلسةٍ واحدة.
 *
 * **وفحصُ النثر لا يفرّق بين دعوى ووصفِ دعوى** — قِيس فكان أكثرُ
 * الجمل اقتباسًا لطلبٍ أو سردًا أو وصفًا للعطل. فتُفحص القدرةُ في
 * الشيء لا في الكلام.
 */
describe('سجل ما لا يُعدَّل', () => {
  it('كل نموذج بلا محرر مذكور فيه', () => {
    const text = readFileSync(REGISTER, 'utf8');
    const listed = new Set(declared(text));
    const stuck = [...frozenModels(ROOT), ...untouchedModels(ROOT)];

    expect(stuck.length).toBeGreaterThan(0);
    expect(stuck.filter((model) => !listed.has(model))).toEqual([]);
  });

  /** **والسجلُّ يُفحص في الاتّجاهين** — وإلّا كذب هو نفسُه. */
  it('ولا يذكر نموذجا صار له محرر', () => {
    const text = readFileSync(REGISTER, 'utf8');
    const stuck = new Set([...frozenModels(ROOT), ...untouchedModels(ROOT)]);
    expect(declared(text).filter((model) => !stuck.has(model))).toEqual([]);
  });

  /** ولكلّ مذكورٍ سببٌ مكتوب، لا خانةٌ فارغة. */
  it('ولكل مذكور سبب', () => {
    const rows = [...readFileSync(REGISTER, 'utf8').matchAll(/^\|\s*`(\w+)`\s*\|([^|]*)\|/gm)];
    const bare = rows.filter(([, , reason]) => (reason ?? '').trim().length < 20);
    expect(bare.map(([, model]) => model)).toEqual([]);
  });

  /**
   * **والبوابةُ تُقاس بكسرِ ما تحرسه** — ولولاه مرّت خضراءَ عمياء،
   * وهو ما وقع للبوابات ٥٠ و٥٢ و١٩ قبل أن تُقاس.
   */
  it('والبوابة ٦٣ ترد الحذف والزيادة معا', () => {
    const original = readFileSync(REGISTER, 'utf8');
    const run = (): string => {
      try {
        execFileSync('node', ['scripts/check-tokens.mjs'], {
          cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        });
        return '';
      } catch (error) {
        return String((error as { stderr?: string }).stderr ?? '');
      }
    };

    try {
      /** حذفُ مذكور ⇒ «لا يُنشئه المنتج ولا يعدّله». */
      writeFileSync(REGISTER, original.replace('| `SeoTemplate` |', '| `SeoTemplateX` |'), 'utf8');
      expect(run()).toContain('SeoTemplate');

      /** وإعلانُ ما له محرّرٌ ⇒ «يُرفع من السجلّ». */
      writeFileSync(
        REGISTER,
        original.replace('| `DeviceToken` |', '| `Listing` | سببٌ للقياس وحده |\n| `DeviceToken` |'),
        'utf8',
      );
      expect(run()).toContain('Listing');
    } finally {
      writeFileSync(REGISTER, original, 'utf8');
    }
  }, 90_000);

  /** **والتصنيفُ مصدرٌ واحد** — تقرؤه الأداةُ والبوابة معًا. */
  it('والأداة والبوابة تقرآن تصنيفا واحدا', () => {
    expect(classifyModels(ROOT).length).toBeGreaterThan(50);
    for (const file of ['scripts/dead-ends.mjs', 'scripts/check-tokens.mjs']) {
      expect(readFileSync(join(ROOT, file), 'utf8')).toContain("from './model-writers.mjs'");
    }
  });
});
