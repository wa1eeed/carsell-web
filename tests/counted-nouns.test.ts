import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';

const ROOT = process.cwd();
const ar = JSON.parse(readFileSync(join(ROOT, 'src/messages/ar.json'), 'utf8')) as {
  units: Record<string, string>;
  counted: Record<string, string>;
};

/**
 * **ويُصاغ بالمُصرِّف الذي يشحن لا بمكتبةٍ تحته.** `intl-messageformat`
 * تبعيّةٌ عابرة لا نعلنها، فاختبارٌ يستوردها يسقط يوم يتبدّل القفل
 * برسالةٍ لا تذكر الجمع. و`createTranslator` هي عينُ ما تناديه
 * `Quantity` و`Counted`، فما يمرّ هنا هو ما يُعرض.
 */
const say = (space: 'units' | 'counted', key: string, count: number): string => {
  const t = createTranslator({ locale: 'ar', messages: { [space]: ar[space] }, namespace: space });
  return t(key, { count, n: String(count) });
};

/**
 * ═══ العددُ يحكم المعدود — ولو كان في عنصرٍ شقيق ═══
 *
 * قاعدةُ اللينت تفحص نصًّا عربيًّا **يجاور** `<ArabicNumber>` في الموضع
 * نفسِه، وبطاقةُ `<dd>` رقمٌ و`<dt>` اسمٌ لا يجاوران في النصّ. فمرّت
 * «٨ جهة تمويل» على الرئيسية شهورًا، ثمّ قِيس الشكلُ في ٢٠٢٦-١١-٢٥
 * فخرجت **ستُّ صيغٍ مجمَّدة** في ورقة التقرير والمعارض ومركباتي ولوحة
 * التشغيل: «بندا سليما» صوابٌ عند ١١–٩٩ وحدها، و«مبيعة مكتملة» عند
 * واحدة، و«طلبا في المرحلة» عند ١١–٩٩.
 *
 * **ولم تُبنَ لها بوابة**: قِيس الشكلُ على الشجرة فخرج **٥٦ موضعًا**،
 * أكثرُها تسمياتٌ صحيحة («مجموع البنود» · «القرار» · «دفتر الحركات»)
 * — ولا يفرّق فحصٌ نصّيّ بين معدودٍ وتسمية، فبوابةٌ عليه تُنذر على
 * الصواب وتُعطَّل في يومها. والحارسُ هنا: كلُّ صيغةٍ تُقرأ عند كلّ
 * عددٍ يبلغه المنتج.
 *
 * **والبيانات لا تبلغ الحدّ**: أغنى معرضٍ في البذرة له **مبيعةٌ
 * واحدة**، وسائرُهم صفر — فلا تمرّ الشجرةُ قطّ على صيغة ٣–١٠، وهي
 * التي كانت خطأً. فالحدُّ يُعبَر هنا لا يُنتظَر.
 */
describe('المعدودُ يتبع عددَه في كلّ صيغة', () => {
  const CASES: Array<{ key: string; space: 'units' | 'counted'; expect: Record<number, string> }> = [
    {
      key: 'inspectedOk',
      space: 'units',
      expect: { 0: 'بنود سليمة', 1: 'بند سليم', 2: 'بندان سليمان', 3: 'بنود سليمة', 11: 'بندا سليما', 207: 'بنود سليمة' },
    },
    {
      key: 'inspectedFlagged',
      space: 'units',
      expect: { 1: 'بند عليه ملاحظة', 2: 'بندان عليهما ملاحظات', 3: 'بنود عليها ملاحظات', 11: 'بندا عليه ملاحظة' },
    },
    {
      key: 'inspectedNone',
      space: 'units',
      expect: { 1: 'بند غير مفحوص', 2: 'بندان غير مفحوصين', 4: 'بنود غير مفحوصة', 11: 'بندا غير مفحوص' },
    },
    {
      key: 'stageOrders',
      space: 'units',
      expect: { 1: 'طلب في المرحلة', 2: 'طلبان في المرحلة', 5: 'طلبات في المرحلة', 11: 'طلبا في المرحلة' },
    },
    {
      key: 'dealerSales',
      space: 'units',
      expect: { 0: 'مبيعات مكتملة', 1: 'مبيعة مكتملة', 2: 'مبيعتان مكتملتان', 4: 'مبيعات مكتملة', 11: 'مبيعة مكتملة' },
    },
    {
      key: 'biddersLabel',
      space: 'units',
      expect: { 1: 'المزايد', 2: 'المزايدان', 6: 'المزايدون', 19: 'المزايدون' },
    },
    {
      key: 'openServices',
      space: 'counted',
      expect: { 1: 'خدمة قائمة', 2: 'خدمتان قائمتان', 3: '3 خدمات قائمة', 11: '11 خدمة قائمة' },
    },
  ];

  for (const row of CASES) {
    it(`${row.key} — ${Object.keys(row.expect).length} أعداد`, () => {
      expect(ar[row.space][row.key], `${row.space}.${row.key} غائبة`).toBeTypeOf('string');
      for (const [count, want] of Object.entries(row.expect)) {
        expect(say(row.space, row.key, Number(count)), `عند ${count}`).toBe(want);
      }
    });
  }

  /**
   * **والصيغةُ المجمَّدة تُكشف بتبدّل العدد.** لو عاد أحدُها نصًّا
   * ثابتًا لأعطى الجوابَ نفسَه عند واحدٍ وأربعة — فيُفحص أنّهما
   * يختلفان، لا أنّ كلًّا منهما يساوي ما كُتب له.
   */
  it('لا صيغةَ واحدة لعددين مختلفين', () => {
    for (const row of CASES) {
      expect(say(row.space, row.key, 1), `${row.key}: الواحد والأربعة سواء`).not.toBe(
        say(row.space, row.key, 4),
      );
    }
  });
});
