import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  EDITOR_SECTION,
  READER_SECTION,
  classifyModels,
  declaredModels,
  frozenModels,
  unreadModels,
  untouchedModels,
} from '../scripts/model-writers.mjs';

const ROOT = process.cwd();
const REGISTER = join(ROOT, 'docs/architecture/editability.md');

/**
 * **والاختبارُ يقرأ قائمةَ البوابة لا نسخةً منها.** صار للسجلّ
 * جدولان — ما لا يُعدَّل وما لا يُقرأ — فقراءةُ الملفّ كلّه تجعل كلَّ
 * فحصٍ يُنذر بصفوف الآخر. (وقع: `WebhookEvent` معلَنٌ في جدول القارئ
 * فأُنذِر بأنّه «صار له محرّر».)
 */
const declared = (text: string): string[] => declaredModels(text, EDITOR_SECTION);

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
      writeFileSync(REGISTER, original.replace('| `LegalDocument` |', '| `LegalDocumentX` |'), 'utf8');
      expect(run()).toContain('LegalDocument');

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

  /**
   * ═══ وسجلُّ القارئ — البوابة ٦٤ ═══
   *
   * **وصفٌّ لا يقرؤه أحد أسوأ من صفٍّ لا يعدّله أحد**: `SeoTemplate`
   * مرّ «مزروعًا» شهورًا ولا استعلامَ في `src/` يلمس جدوله، فنصُّ
   * السيو لم يُوصَل من طرفيه. وفحصُ الكاتب لا يراه.
   */
  it('وكل نموذج بلا قارئ معلَن في جدوله', () => {
    const text = readFileSync(REGISTER, 'utf8');
    const listed = new Set(declaredModels(text, READER_SECTION));
    const unread = unreadModels(ROOT);

    expect(unread.filter((model: string) => !listed.has(model))).toEqual([]);
    expect([...listed].filter((model) => !unread.includes(model))).toEqual([]);
  });

  /**
   * **والعلائقيُّ يُقرأ باسم حقله**: `TaxInvoiceLine` عبر
   * `taxInvoice.include: { lines: true }` لا باسمه. ولولا ذلك أنذرت
   * البوابةُ على ستّةٍ من ثمانية — **وإنذارٌ كاذبٌ متكرّر يُعطّل
   * القياس أشدَّ من غيابه**.
   */
  it('ولا تُنذر على ما يُقرأ عبر علاقته', () => {
    const unread = unreadModels(ROOT);
    for (const model of ['TaxInvoiceLine', 'SettlementStatement', 'ListingFeature', 'PlanEntitlement']) {
      expect(unread, `${model} يُقرأ عبر والده`).not.toContain(model);
    }
  });

  /** **والبوابةُ تُقاس بكسرِ ما تحرسه** — في الاتّجاهين. */
  it('والبوابة ٦٤ ترد الحذف والزيادة معا', () => {
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
      writeFileSync(REGISTER, original.replace('| `WebhookEvent` |', '| `WebhookEventX` |'), 'utf8');
      expect(run()).toContain('WebhookEvent');

      writeFileSync(
        REGISTER,
        original.replace('| `WebhookEvent` |', '| `Listing` | سببٌ للقياس وحده |\n| `WebhookEvent` |'),
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
