import type { InspectionResultState } from '@/generated/prisma/enums';
import { gradeOf } from './inspection';
import type { PublicInspectionReport } from './inspection';

/**
 * ═══ درجةُ الفحص — تُحسب في الخادم مرّةً واحدة ═══
 *
 * **وهذه وحدةٌ خالصة بلا قاعدة**: تأخذ البنودَ وأجوبتَها وتردّ الدرجة،
 * فتُختبر بلا زرعٍ ولا تشغيل. والقارئُ من القاعدة فوقها لا فيها.
 *
 * ═══ والنقصُ متدرّج ═══
 *
 * «ملاحظة» تنقص أقلَّ من «عطل» (المواصفة): فبابٌ فيه خدشٌ وبابٌ لا
 * يُغلق ليسا سواءً، وجمعُهما في «غير سليم» يُخرج درجةً لا تفرّق
 * بينهما — ويقرؤها المشتري على أنها واحدة.
 *
 * **و«لا ينطبق» يخرج من المقام لا يُحتسب صفرًا.** سيارةٌ بلا فتحة سقف
 * ليست ناقصةً فتحةَ سقف: عدُّها عطلًا يعاقب صاحبَها على ما لم يكن في
 * سيارته قطّ.
 */

/** ما يكسبه البند من درجته الكاملة. */
const CREDIT: Readonly<Record<InspectionResultState, number | null>> = {
  PASS: 1,
  /** خدشٌ أو أثرُ استعمال — ينقص ولا يُسقط. */
  MINOR: 0.6,
  MAJOR: 0,
  /** **خارج الحساب**: لا في البسط ولا في المقام. */
  NOT_APPLICABLE: null,
};

/**
 * سقفُ التقدير حين يسقط بندٌ حرج.
 *
 * **والسقفُ على التقدير لا على الدرجة.** إسقاطُ الرقم يُخفي كم كانت
 * السيارة سليمةً فيما عدا ذلك — ومئتان وتسعةُ بنودٍ سليمة حقيقةٌ
 * تُقال. والتقديرُ هو ما يُقرأ بلمحة، فهو الذي يُسقَف.
 */
const CRITICAL_GRADE_CAP: PublicInspectionReport['grade'] = 'FAIR';

const GRADE_ORDER: readonly PublicInspectionReport['grade'][] = [
  'POOR',
  'FAIR',
  'GOOD',
  'EXCELLENT',
];

export type ScoredItem = {
  itemId: string;
  categoryKey: string;
  isCritical: boolean;
  state: InspectionResultState;
};

export type ScoredCategory = {
  key: string;
  weight: number;
};

export type CategoryScore = {
  key: string;
  /** `null` حين تكون بنودُه كلُّها «لا ينطبق» — ولا تدخل الحساب. */
  score: number | null;
  passed: number;
  minor: number;
  major: number;
  notApplicable: number;
};

export type InspectionScore = {
  /** صفرٌ إلى مئة — مُقرَّبٌ كما يُخزَّن ويُعرض. */
  score: number;
  grade: PublicInspectionReport['grade'];
  /** سقط بندٌ حرج — فالتقديرُ مسقوف والتقريرُ موسوم. */
  flagged: boolean;
  /** البنودُ الحرجة الساقطة بأسمائها — رقمٌ لا يُتصرَّف فيه. */
  criticalItemIds: string[];
  categories: CategoryScore[];
  answered: number;
  applicable: number;
};

/**
 * يحسب الدرجةَ من الأجوبة.
 *
 * **والوزنُ للقسم لا للبند**: قسمٌ بخمسةٍ وستّين بندًا لا يطغى على قسمٍ
 * بخمسةَ عشر لأن بنودَه أكثر — فالمحرّك والكهرباء يُوزنان بما يقرّره
 * المشغّل لا بعدد ما فيهما.
 *
 * **والقسمُ الذي لا ينطبق كلُّه يخرج بوزنه** — وإلّا جرّ المتوسّطَ إلى
 * صفرٍ لا أحد تسبّب فيه.
 */
export function scoreInspection(
  items: readonly ScoredItem[],
  categories: readonly ScoredCategory[],
): InspectionScore {
  const byKey = new Map<string, ScoredItem[]>();
  for (const item of items) {
    const list = byKey.get(item.categoryKey);
    if (list === undefined) byKey.set(item.categoryKey, [item]);
    else list.push(item);
  }

  const scored: CategoryScore[] = [];
  let weightedSum = 0;
  let weightTotal = 0;
  let applicable = 0;

  for (const category of categories) {
    const own = byKey.get(category.key) ?? [];
    let credit = 0;
    let counted = 0;
    const tally = { passed: 0, minor: 0, major: 0, notApplicable: 0 };

    for (const item of own) {
      if (item.state === 'PASS') tally.passed += 1;
      else if (item.state === 'MINOR') tally.minor += 1;
      else if (item.state === 'MAJOR') tally.major += 1;
      else tally.notApplicable += 1;

      const share = CREDIT[item.state];
      if (share === null) continue;
      credit += share;
      counted += 1;
    }

    applicable += counted;
    const score = counted === 0 ? null : (credit / counted) * 100;
    scored.push({ key: category.key, score, ...tally });

    if (score === null) continue;
    const weight = category.weight > 0 ? category.weight : 1;
    weightedSum += score * weight;
    weightTotal += weight;
  }

  const raw = weightTotal === 0 ? 0 : weightedSum / weightTotal;
  const score = Math.round(raw);

  const criticalItemIds = items
    .filter((item) => item.isCritical && item.state === 'MAJOR')
    .map((item) => item.itemId);
  const flagged = criticalItemIds.length > 0;

  /** والسقفُ يُطبَّق بالترتيب لا بالرقم — فلا يُخفض تقديرٌ هو دونه أصلًا. */
  const natural = gradeOf(score);
  const grade =
    flagged && GRADE_ORDER.indexOf(natural) > GRADE_ORDER.indexOf(CRITICAL_GRADE_CAP)
      ? CRITICAL_GRADE_CAP
      : natural;

  return {
    score,
    grade,
    flagged,
    criticalItemIds,
    categories: scored,
    answered: items.length,
    applicable,
  };
}
