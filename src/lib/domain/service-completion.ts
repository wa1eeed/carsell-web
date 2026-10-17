import { db } from '@/lib/db';
import type { ProviderType } from '@/generated/prisma/enums';
import {
  COMPLETION_FIELDS,
  completionFormFor,
  type CompletionField,
} from './completion-schema';
import { checkCompletion, type CompletionIssue } from './completion-validate';

/**
 * ═══ إنجازُ الطلب — ما يُسأل عنه المزوّد قبل أن يقول «أُنجز» ═══
 *
 * طلبُ المالك (٢٠٢٦-١٠-١٧): «وإذا كان المزوّد نقل ملكيّة هناك حقول
 * تناسبه لتنفيذ الطلب **وهكذا لباقي المزوّدين**».
 *
 * والمخطّطُ في `completion-schema.ts` والتحقّقُ في `completion-validate.ts`
 * — **وكلاهما بلا `db`** ليقرأهما النموذج في المتصفّح، فلا تُجيز الشاشة
 * ما يرفضه الخادم.
 */

/** ما يُخزَّن فعلًا لحقلٍ — عمودٌ واحد بحسب النوع */
export type SavedCompletionValue = {
  key: string;
  text: string | null;
  number: string | null;
  date: string | null;
};

export type CompletionFormView = {
  ref: string;
  type: ProviderType;
  fields: readonly CompletionField[];
  /** ما كُتب سابقًا — فنموذجٌ يُفتح ثانيةً لا يبدأ فارغًا */
  saved: SavedCompletionValue[];
  /** أُنجز الطلب فعلًا؟ فالحقول تُقرأ ولا تُكتب */
  locked: boolean;
};

/**
 * ═══ النموذج كما يراه المزوّد ═══
 *
 * **ولا يراه مزوّدٌ لا شأن له به**: `providerRequestView` تحرس الإسناد
 * والمدينة والسداد، فيُقرأ منها لا يُعاد الشرطُ هنا ثانيةً.
 */
export async function completionFormView(
  ref: string,
  providerId: string,
  now: Date = new Date(),
): Promise<CompletionFormView | null> {
  const { providerRequestView } = await import('./provider-queue');
  const view = await providerRequestView(ref, providerId, now);
  if (view === null || !view.mine) return null;

  const row = await db.serviceRequest.findUnique({
    where: { ref },
    select: {
      status: true,
      service: { select: { providerType: true } },
      completion: {
        select: { key: true, valueText: true, valueNumber: true, valueDate: true },
      },
    },
  });
  if (row === null || row.service.providerType === null) return null;

  const type = row.service.providerType;
  if (completionFormFor(type) !== 'FIELDS') return null;

  return {
    ref,
    type,
    fields: COMPLETION_FIELDS[type],
    saved: row.completion.map((field) => ({
      key: field.key,
      text: field.valueText,
      number: field.valueNumber === null ? null : field.valueNumber.toString(),
      date: field.valueDate === null ? null : field.valueDate.toISOString(),
    })),
    /** و«أُنجز» و«تعذّر» كلتاهما نهاية — فلا يُعدَّل إثباتٌ بعد قبوله */
    locked: row.status !== 'IN_PROGRESS',
  };
}

export type SaveCompletionFailure =
  | 'REQUEST_NOT_FOUND'
  | 'NO_FORM'
  | 'LOCKED'
  | 'INVALID';

export type SaveCompletionResult =
  | { ok: true }
  | { ok: false; reason: SaveCompletionFailure; issues?: CompletionIssue[] };

/**
 * ═══ حفظُ الإثبات — ولا يُقدّم الحال ═══
 *
 * **والحالةُ تمرّ بمدخلها الوحيد دائمًا** (`applyStep`): فالحفظُ يكتب
 * الحقول وحدها، ثمّ تُنادي الشاشةُ الخطوةَ — و`applyStep` ترفض
 * الإنجاز ما لم يكن الإثبات مكتملًا. فلو انقطع الاتّصال بين
 * النداءين بقي الإثبات محفوظًا والطلبُ قيد التنفيذ، لا طلبًا
 * «مُنجَزًا» بلا إيرادٍ مُعترَفٍ به ولا العكس.
 */
export async function saveCompletion(
  input: { ref: string; providerId: string; values: Readonly<Record<string, string>> },
  now: Date = new Date(),
): Promise<SaveCompletionResult> {
  const view = await completionFormView(input.ref, input.providerId, now);
  if (view === null) return { ok: false, reason: 'NO_FORM' };
  if (view.locked) return { ok: false, reason: 'LOCKED' };

  const check = checkCompletion(view.type, input.values, now);
  if (!check.ok) return { ok: false, reason: 'INVALID', issues: check.issues };

  const row = await db.serviceRequest.findUnique({
    where: { ref: input.ref },
    select: { id: true },
  });
  if (row === null) return { ok: false, reason: 'REQUEST_NOT_FOUND' };

  /**
   * **والحقلُ الذي أُفرِغ يُحذف لا يُترك.** مزوّدٌ بدّل قرار التمويل من
   * «موافقة» إلى «رفض» يترك `approvedAmount` قديمًا في الصفوف — فتُقرأ
   * وثيقةٌ تقول «رُفض» و«المبلغ المعتمد ٨٠٬٠٠٠».
   */
  await db.$transaction(async (tx) => {
    await tx.serviceCompletionField.deleteMany({ where: { requestId: row.id } });
    const data = [...check.values.entries()].map(([key, value]) => ({
      requestId: row.id,
      key,
      valueText: value.kind === 'TEXT' ? value.text : null,
      valueNumber: value.kind === 'NUMBER' ? value.number : null,
      valueDate: value.kind === 'DATE' ? value.date : null,
    }));
    if (data.length > 0) await tx.serviceCompletionField.createMany({ data });
  });

  return { ok: true };
}

/**
 * ═══ أمكتملٌ إثبات الإنجاز؟ — وهذا هو الحارس ═══
 *
 * `form` كان **مكتوبًا في `STEPS_BY_TYPE` ولا يُفرَض**: الفاحص يضغط
 * «أنهِ» بلا أن يفتح النموذج، فيُعترف بالإيراد وتخرج الفاتورة ويُقبض
 * المال **على فحصٍ لا وجود له**. وستّةُ أصناف تُنهي بلا حقلٍ واحد.
 *
 * فالشرط يُفحص هنا، و`applyStep` تردّ `FORM_INCOMPLETE` — واسمُ العطب
 * يقول للمزوّد ما ينقص لا «تعذّرت الخطوة».
 */
export async function completionComplete(
  requestId: string,
  type: ProviderType,
  now: Date = new Date(),
): Promise<boolean> {
  const kind = completionFormFor(type);
  if (kind === null) return true;

  if (kind === 'INSPECTION') {
    /**
     * **والمُقدَّم يكفي، والمعتمَد أكفى.** مراجعةُ الأدمن تأتي بعد
     * الإنجاز لا قبله — فانتظارُ الاعتماد يُجمّد الطلب عند المزوّد
     * ولا يُفرِج عن مستحقّه.
     */
    const draft = await db.inspectionDraft.findUnique({
      where: { serviceRequestId: requestId },
      select: { status: true },
    });
    return draft !== null && (draft.status === 'SUBMITTED' || draft.status === 'APPROVED');
  }

  const rows = await db.serviceCompletionField.findMany({
    where: { requestId },
    select: { key: true, valueText: true, valueNumber: true, valueDate: true },
  });

  /**
   * **ويُعاد الفحصُ على المخزَّن لا على ما وصل.** حقولٌ حُفظت ثمّ
   * تبدّل المخطّط — أو حُفظت بنداءٍ مباشر — تُفحص بقاعدة اليوم.
   */
  const raw: Record<string, string> = {};
  for (const field of rows) {
    raw[field.key] =
      field.valueText ??
      field.valueNumber?.toString() ??
      field.valueDate?.toISOString() ??
      '';
  }
  return checkCompletion(type, raw, now).ok;
}

/**
 * ═══ ما يُقرأ من الإثبات — للأدمن ولصاحب الطلب ═══
 *
 * **والطرف الثاني يُبنى مع الأوّل**: مزوّدٌ يكتب رقم البوليصة ولا يراه
 * من دفع هو نصفُ ميزة. وصفحةُ الطلب كانت تقول «اكتمل» ولا شيء غيره.
 *
 * ويُعاد بالترتيب الذي في المخطّط لا بترتيب الكتابة — فشاشتان تقرآن
 * الحقول بترتيبين تُربكان من يقابل بينهما.
 */
export async function completionOf(
  requestId: string,
): Promise<{ type: ProviderType; values: SavedCompletionValue[] } | null> {
  const row = await db.serviceRequest.findUnique({
    where: { id: requestId },
    select: {
      service: { select: { providerType: true } },
      completion: {
        select: { key: true, valueText: true, valueNumber: true, valueDate: true },
      },
    },
  });
  if (row === null || row.service.providerType === null) return null;
  if (row.completion.length === 0) return null;

  const type = row.service.providerType;
  const order = COMPLETION_FIELDS[type].map((field) => field.key);
  const values = row.completion
    .map((field) => ({
      key: field.key,
      text: field.valueText,
      number: field.valueNumber === null ? null : field.valueNumber.toString(),
      date: field.valueDate === null ? null : field.valueDate.toISOString(),
    }))
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

  return { type, values };
}
