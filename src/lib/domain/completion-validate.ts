import type { ProviderType } from '@/generated/prisma/enums';
import { toLatinDigits } from '@/lib/arabic';
import {
  MIN_COMPLETION_SUMMARY,
  MIN_COMPLETION_TEXT,
  type CompletionField,
  visibleFieldsOf,
} from './completion-schema';

/**
 * ═══ تحقّقُ حقول الإنجاز — دالّةٌ نقيّة يقرؤها الطرفان ═══
 *
 * **والشاشة والخادم يقرآن هذه الدالّة نفسها.** قاعدةٌ تُكتب مرّتين
 * تتباعد أوّل تعديل، وشاشةٌ تُجيز ما يرفضه الخادم تُشعر المزوّد أنه
 * أخطأ وهو لم يخطئ — والعكسُ أسوأ: **حارسٌ في العميل ليس حارسًا**.
 *
 * وبلا `db` ولا `Date.now()`: الزمنُ يُمرَّر، فالاختبار يُثبّته.
 */

/** العطبُ مفتاحٌ لا جملة — والصياغة في الشاشة (البوابة ١٧) */
export type CompletionIssueCode =
  | 'REQUIRED'
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'NOT_A_NUMBER'
  | 'NEGATIVE'
  | 'NOT_A_DATE'
  | 'FUTURE_DATE'
  | 'PAST_DATE'
  | 'BEFORE_OTHER'
  | 'NOT_AN_OPTION';

export type CompletionIssue = { key: string; code: CompletionIssueCode };

/** القيمةُ المُطبَّعة كما تُخزَّن — عمودٌ واحدٌ بحسب النوع */
export type NormalisedValue =
  | { kind: 'TEXT'; text: string }
  | { kind: 'NUMBER'; number: string }
  | { kind: 'DATE'; date: Date };

export type CompletionCheck =
  | { ok: true; values: Map<string, NormalisedValue> }
  | { ok: false; issues: CompletionIssue[] };

function minLengthOf(field: CompletionField): number {
  return field.type === 'TEXTAREA' ? MIN_COMPLETION_SUMMARY : MIN_COMPLETION_TEXT;
}

function checkOne(
  field: CompletionField,
  raw: string,
  now: Date,
): { value?: NormalisedValue; code?: CompletionIssueCode } {
  switch (field.type) {
    case 'TEXT':
    case 'LATIN':
    case 'TEXTAREA': {
      if (raw.length < minLengthOf(field)) return { code: 'TOO_SHORT' };
      if (field.maxLength !== undefined && raw.length > field.maxLength) return { code: 'TOO_LONG' };
      return { value: { kind: 'TEXT', text: raw } };
    }

    case 'SELECT': {
      if (field.options === undefined || !field.options.includes(raw)) {
        return { code: 'NOT_AN_OPTION' };
      }
      return { value: { kind: 'TEXT', text: raw } };
    }

    case 'NUMBER':
    case 'MONEY': {
      /**
       * **والحقلُ يقبل كل صيغة لصق ويطبّعها** — و`toLatinDigits` تملك
       * القاعدة: الأرقام العربية-الهندية والفارسية، وفاصلةُ الآلاف
       * العربية، والفاصلةُ العشرية. **ولا نسخةٌ هنا** — كتبتُ واحدةً
       * وأعادت البوابةُ ١٧ إليّ التكرار، وكان الأصل أسبقَ وأشمل.
       */
      const cleaned = toLatinDigits(raw).replace(/[,\s]/g, '');
      if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return { code: 'NOT_A_NUMBER' };
      if (cleaned.startsWith('-')) return { code: 'NEGATIVE' };
      /** و`Decimal` نصًّا حتى تكتبه Prisma — فلا يمرّ المال بـ`number` */
      return { value: { kind: 'NUMBER', number: cleaned } };
    }

    case 'DATE': {
      const at = new Date(toLatinDigits(raw));
      if (Number.isNaN(at.getTime())) return { code: 'NOT_A_DATE' };
      /** واليومُ نفسه مقبولٌ في الطرفين — المقارنة على اليوم لا اللحظة */
      const endOfDay = new Date(at.getTime() + 86_399_999);
      if (field.when === 'PAST' && at.getTime() > now.getTime() && endOfDay.getTime() > now.getTime()) {
        return { code: 'FUTURE_DATE' };
      }
      if (field.when === 'FUTURE' && endOfDay.getTime() < now.getTime()) return { code: 'PAST_DATE' };
      return { value: { kind: 'DATE', date: at } };
    }
  }
}

/**
 * ═══ الفحصُ كلُّه، وكلُّ العطب يُعاد ═══
 *
 * **ولا يُتوقَّف عند أوّل خطأ**: نموذجٌ يقول «أصلح حقلًا» ستَّ مرّات
 * متتابعة هو ستُّ رحلاتٍ إلى الخادم لعملٍ واحد.
 */
export function checkCompletion(
  type: ProviderType,
  raw: Readonly<Record<string, string>>,
  now: Date,
): CompletionCheck {
  const trimmed: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) trimmed[key] = value.trim();

  const fields = visibleFieldsOf(type, trimmed);
  const issues: CompletionIssue[] = [];
  const values = new Map<string, NormalisedValue>();

  for (const field of fields) {
    const entry = trimmed[field.key] ?? '';
    if (entry === '') {
      if (field.required) issues.push({ key: field.key, code: 'REQUIRED' });
      continue;
    }
    const { value, code } = checkOne(field, entry, now);
    if (code !== undefined) issues.push({ key: field.key, code });
    else if (value !== undefined) values.set(field.key, value);
  }

  /**
   * **والترتيبُ بين تاريخين يُفحص بعد صحّتهما** — فحقلٌ لم يُقرأ لا
   * يُقارَن، وإلّا أُنتج عطبٌ ثانٍ لعطبٍ واحد.
   */
  for (const field of fields) {
    if (field.notBefore === undefined) continue;
    const mine = values.get(field.key);
    const other = values.get(field.notBefore);
    if (mine?.kind !== 'DATE' || other?.kind !== 'DATE') continue;
    if (mine.date.getTime() < other.date.getTime()) {
      issues.push({ key: field.key, code: 'BEFORE_OTHER' });
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, values };
}
