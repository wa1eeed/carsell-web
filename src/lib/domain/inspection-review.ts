import type { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import type { InspectionSection, PaintPanelState, PointState } from './inspection';
import { inspectorCodeFor, publishOnIssue } from './inspection';
import { scoreInspection, type ScoredItem } from './inspection-score';

/**
 * ═══ الإرسالُ يُجمّد، والاعتمادُ يُصدِر ═══
 *
 * قرار المالك (٢٠٢٦-١٠-١٧): اللقطةُ تُبنى عند الإرسال وتبقى كما هي.
 * فمن يعدّل القالب بين الإرسال والاعتماد لا يُغيّر ما رآه الفاحصُ
 * ووقّع عليه — وهو مسلكُ `TaxInvoice` و`VehicleSaleAgreement`.
 *
 * **ولا يُنشأ `InspectionReport` إلّا بالاعتماد.** صفٌّ يُنشأ عند
 * الإرسال يُرى قبل أن يراجعه أحد — و«المنشور لا يُسترجَع» (قرار ٤)،
 * فإصدارُه قبل المراجعة يجعل الخطأ غيرَ قابلٍ للسحب.
 */

export type SubmitResult =
  | { ok: true; score: number; grade: string; flagged: boolean }
  | {
      ok: false;
      reason: 'NOT_YOURS' | 'NOT_EDITABLE' | 'INCOMPLETE';
      /** كم بندًا بقي بلا جواب — رقمٌ يُتصرَّف فيه لا «غير مكتمل». */
      missing?: number;
    };

/**
 * يُرسل المسودّة بعد أن يتحقّق أنّ **كلّ بندٍ أُجيب**.
 *
 * والمواصفة تشترطه، وسببُه أنّ بندًا بلا جواب يُقرأ على أنه سليم —
 * فتخرج درجةٌ مبنيّةٌ على ما لم يُفحَص.
 */
/**
 * ═══ اللقطةُ بالشكل الذي يقرؤه العرضُ العامّ ═══
 *
 * `parseSections` مبنيّةٌ منذ بُني العرض وتقرأ هذا الشكل بعينه —
 * فالتجميدُ إليه لا إلى شكلٍ جديد، وإلّا بُني عارضٌ ثانٍ يتباعد.
 *
 * **ومصدَّرةٌ نقيّةً لتُقاس**: فرعُ «بندٌ بلا جواب» لا يبلغه مسارُ
 * الإرسال (الاكتمالُ شرطٌ قبله)، ودالّةٌ تقرأ القاعدة لا تُقاس إلّا
 * بزرعِ حالٍ لا يسمح بها المنتج. فالقاعدةُ هنا، وتُستدعى من هناك.
 */
export function freezeSections(
  categories: readonly {
    key: string;
    nameAr: string;
    items: readonly { id: string; key: string; nameAr: string }[];
  }[],
  answers: ReadonlyMap<string, { state: string; note: string | null }>,
  scores: ReadonlyMap<string, { score: number | null }>,
): InspectionSection[] {
  return categories.map((category) => ({
    key: category.key,
    name: category.nameAr,
    score: Math.round(scores.get(category.key)?.score ?? 0),
    note: null,
    points: category.items.map((item) => {
      const answer = answers.get(item.id);
      /**
       * ═══ والسكوتُ لا يُترجَم إجازةً ═══
       *
       * كان كلُّ ما ليس `MAJOR` ولا `MINOR` يُجمَّد «سليمًا». وذلك
       * بابان لا باب:
       *
       *   · **بندٌ بلا جواب** — يمنعه شرطُ الاكتمال اليوم، لكنّ
       *     الافتراضيّ يقول ما سيقع حين يصير بندٌ اختياريًّا أو
       *     يُضاف إلى الكتالوج بعد أن فُتحت المسودّة.
       *   · **و`NOT_APPLICABLE`** — وهو **حالٌ حيّ**: التعداد يحمله
       *     منذ بُني، والحاسبةُ تُخرجه من البسط والمقام معًا. فكان
       *     بندٌ أعلن الفاحصُ أنه لا ينطبق يُنشر «سليمًا».
       */
      const state: PointState =
        answer === undefined || answer.state === 'NOT_APPLICABLE'
          ? 'NOT_INSPECTED'
          : answer.state === 'MAJOR'
            ? 'FAIL'
            : answer.state === 'MINOR'
              ? 'NOTE'
              : answer.state === 'REPAINT'
                ? 'PAINT'
                : 'OK';
      return {
        id: item.key,
        label: item.nameAr,
        state,
        note: answer?.note ?? null,
        photos: [],
      };
    }),
  }));
}

export async function submitInspection(
  input: { ref: string; providerId: string },
  now: Date = new Date(),
): Promise<SubmitResult> {
  const request = await db.serviceRequest.findUnique({
    where: { ref: input.ref },
    select: {
      providerId: true,
      inspectionDraft: {
        select: {
          id: true,
          templateId: true,
          status: true,
          results: { select: { itemId: true, state: true, note: true, value: true } },
          panels: { select: { panel: true, condition: true, paintThicknessMicrons: true } },
        },
      },
    },
  });

  if (request === null || request.providerId !== input.providerId) {
    return { ok: false, reason: 'NOT_YOURS' };
  }
  const draft = request.inspectionDraft;
  if (draft === null || (draft.status !== 'DRAFT' && draft.status !== 'RETURNED')) {
    return { ok: false, reason: 'NOT_EDITABLE' };
  }

  const categories = await db.inspectionCategory.findMany({
    where: { templateId: draft.templateId },
    orderBy: { sort: 'asc' },
    select: {
      key: true,
      nameAr: true,
      weight: true,
      items: {
        orderBy: { sort: 'asc' },
        select: { id: true, key: true, nameAr: true, isCritical: true },
      },
    },
  });

  const answers = new Map(draft.results.map((row) => [row.itemId, row]));
  const total = categories.reduce((sum, category) => sum + category.items.length, 0);
  if (answers.size < total) {
    return { ok: false, reason: 'INCOMPLETE', missing: total - answers.size };
  }

  const scored: ScoredItem[] = [];
  for (const category of categories) {
    for (const item of category.items) {
      const answer = answers.get(item.id);
      if (answer === undefined) continue;
      scored.push({
        itemId: item.id,
        categoryKey: category.key,
        isCritical: item.isCritical,
        state: answer.state,
      });
    }
  }

  const result = scoreInspection(
    scored,
    categories.map((category) => ({ key: category.key, weight: category.weight })),
  );
  const perCategory = new Map(result.categories.map((row) => [row.key, row]));

  const sections = freezeSections(categories, answers, perCategory);

  const paintMap: Record<string, PaintPanelState | string> = {};
  for (const panel of draft.panels) {
    paintMap[panel.panel] = panel.condition;
  }

  await db.inspectionDraft.update({
    where: { id: draft.id },
    data: {
      status: 'SUBMITTED',
      submittedAt: now,
      returnNote: null,
      frozenSections: sections as unknown as Prisma.InputJsonValue,
      frozenPaintMap: paintMap as unknown as Prisma.InputJsonValue,
      frozenScore: result.score,
      frozenGrade: result.grade,
      frozenFlagged: result.flagged,
    },
  });

  return { ok: true, score: result.score, grade: result.grade, flagged: result.flagged };
}

export type ReviewResult =
  | { ok: true; reportRef?: string; published?: boolean }
  | {
      ok: false;
      reason: 'NOT_FOUND' | 'NOT_SUBMITTED' | 'NO_SNAPSHOT' | 'NOTE_REQUIRED' | 'NO_PROVIDER';
    };

/** يُعيدها إلى الفاحص بملاحظة — **والملاحظةُ إلزاميّة**: «أعِدها» بلا سببٍ لا تُعلِّمه شيئًا. */
export async function returnInspection(
  input: { draftId: string; adminId: string; note: string; ip: string | null },
  now: Date = new Date(),
): Promise<ReviewResult> {
  const note = input.note.trim();
  if (note.length < 10) return { ok: false, reason: 'NOTE_REQUIRED' };

  const draft = await db.inspectionDraft.findUnique({
    where: { id: input.draftId },
    select: { id: true, status: true, serviceRequest: { select: { ref: true } } },
  });
  if (draft === null) return { ok: false, reason: 'NOT_FOUND' };
  if (draft.status !== 'SUBMITTED') return { ok: false, reason: 'NOT_SUBMITTED' };

  await db.inspectionDraft.update({
    where: { id: draft.id },
    data: { status: 'RETURNED', returnNote: note, reviewedAt: now, reviewedBy: input.adminId },
  });

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'InspectionDraft',
      entityId: draft.id,
      action: 'inspection.returned',
      before: {},
      after: { ref: draft.serviceRequest.ref, note },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true };
}

/**
 * يعتمدها ويُصدر التقرير.
 *
 * **والنشرُ على الإعلان يتبع قرار المالك ٤ لا قرارَ المراجع**: تقريرُ
 * البائع عامٌّ، وتقريرُ المشتري خاصٌّ به حتى يشاركه. والقاعدةُ في
 * `publishOnIssue` وحدها — لا تُكتب هنا ثانيةً.
 */
export async function approveInspection(
  input: { draftId: string; adminId: string; ip: string | null },
  now: Date = new Date(),
): Promise<ReviewResult> {
  const draft = await db.inspectionDraft.findUnique({
    where: { id: input.draftId },
    select: {
      id: true,
      status: true,
      vehicleId: true,
      serviceRequestId: true,
      frozenSections: true,
      frozenPaintMap: true,
      frozenScore: true,
      providerId: true,
      providerUserId: true,
      serviceRequest: {
        select: {
          ref: true,
          userId: true,
          vehicle: { select: { ownerId: true } },
          provider: { select: { nameAr: true } },
        },
      },
    },
  });
  if (draft === null) return { ok: false, reason: 'NOT_FOUND' };
  if (draft.status !== 'SUBMITTED') return { ok: false, reason: 'NOT_SUBMITTED' };
  if (draft.frozenSections === null || draft.frozenScore === null) {
    return { ok: false, reason: 'NO_SNAPSHOT' };
  }
  /**
   * **ولا يُختلق اسمُ فاحص.** `inspectorName` يُكتب في وثيقةٍ تُقرأ
   * ويُحتجّ بها، واسمٌ افتراضيّ فيها أسوأ من رفضٍ يُصلَح: الطلبُ
   * مُسنَدٌ أصلًا، فغيابُ المزوّد حالٌ لا تقع إلّا بخللٍ يُكشف.
   */
  const inspectorName = draft.serviceRequest.provider?.nameAr ?? null;
  if (inspectorName === null) return { ok: false, reason: 'NO_PROVIDER' };

  /**
   * **والرمزُ من الشخص متى عُرف، ومن المركز وإلّا.** `providerUserId`
   * هو من ملأ المسودّة فعلًا — فرمزُه يتكرّر على تقاريره هو، ومن قرأ
   * تقريرين يعرف أنهما لفاحصٍ واحد. ومسودّةٌ فُتحت بلا مستخدم (مسارٌ
   * إداريّ) تُنسب إلى مركزها، فلا يبقى الحقل فارغًا.
   */
  const inspectorCode = inspectorCodeFor(draft.providerUserId ?? draft.providerId);

  /** **والتسلسلُ من الأعلى لا من العدد** — فجوةٌ واحدة تجعل التالي يصطدم بمرجعٍ قائم. */
  const last = await db.inspectionReport.findFirst({
    where: { ref: { startsWith: 'INS-' } },
    orderBy: { ref: 'desc' },
    select: { ref: true },
  });
  const next = Number.parseInt(last?.ref.split('-').at(-1) ?? '0', 10) + 1;
  const reportRef = `INS-${String(now.getUTCFullYear())}-${String(next).padStart(5, '0')}`;

  const published = publishOnIssue(
    draft.serviceRequest.userId,
    draft.serviceRequest.vehicle?.ownerId ?? '',
  );

  await db.$transaction(async (tx) => {
    await tx.inspectionReport.create({
      data: {
        ref: reportRef,
        serviceRequestId: draft.serviceRequestId,
        vehicleId: draft.vehicleId,
        score: draft.frozenScore ?? 0,
        sections: draft.frozenSections as Prisma.InputJsonValue,
        paintMap: (draft.frozenPaintMap ?? {}) as Prisma.InputJsonValue,
        inspectorName,
        inspectorCode,
        inspectedAt: now,
        publishedAt: published ? now : null,
      },
    });
    await tx.inspectionDraft.update({
      where: { id: draft.id },
      data: { status: 'APPROVED', reviewedAt: now, reviewedBy: input.adminId },
    });
  });

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'InspectionDraft',
      entityId: draft.id,
      action: 'inspection.approved',
      before: {},
      after: { ref: draft.serviceRequest.ref, reportRef, published },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true, reportRef, published };
}
