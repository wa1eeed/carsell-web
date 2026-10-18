import { db } from '@/lib/db';
import type { InspectionInputType, InspectionResultState } from '@/generated/prisma/enums';

/**
 * ═══ مسودّةُ الفحص — يملؤها الفاحص، وتُجمَّد لقطةً ═══
 *
 * قرار المالك (٢٠٢٦-١٠-١٧): صفوفٌ تُحرَّر أثناء العمل، ولقطةٌ تُحفظ
 * عند الإرسال في `InspectionReport.sections` — وهي ما يقرؤه العرضُ
 * العامّ منذ بُني.
 *
 * ═══ والحراسةُ في الخادم لا في القائمة ═══
 *
 * المواصفة تُلزم بذلك صراحةً، والقاعدةُ عندنا مكتوبة: **حارسٌ في
 * العميل ليس حارسًا**. فثلاثةُ شروطٍ تُفحص في كل نداء:
 *
 *   ١. المزوّدُ نوعُه `INSPECTION` — وغيرُه لا يرى المسودّة ولا يكتبها.
 *   ٢. الطلبُ لهذا المزوّد — ومعرّفٌ مخمَّن لا يفتح طلبَ سواه.
 *   ٣. المسودّةُ قابلةٌ للتحرير — فالمُرسَلة لا يعدّلها الفاحص.
 */

export type DraftGate =
  | { ok: true; draftId: string; templateId: string }
  | { ok: false; reason: 'NOT_INSPECTOR' | 'NOT_YOURS' | 'NOT_EDITABLE' | 'NO_TEMPLATE' };

/** الحالاتُ التي يملك فيها الفاحصُ التعديل. */
const EDITABLE = new Set(['DRAFT', 'RETURNED']);

/**
 * يفتح مسودّةَ الطلب أو يُنشئها — **ومرّةً واحدة**.
 *
 * والإنشاءُ كسولٌ لا عند القبول: طلبٌ قُبل ولم يُفتح لا يحتاج صفًّا،
 * وطلبٌ صار `IN_PROGRESS` قبل بناء هذه الشاشة يجد مسودّتَه حين تُفتح.
 */
export async function ensureDraft(
  input: { ref: string; providerId: string; providerUserId: string | null },
  now: Date = new Date(),
): Promise<DraftGate> {
  const provider = await db.serviceProvider.findUnique({
    where: { id: input.providerId },
    select: { type: true },
  });
  if (provider === null || provider.type !== 'INSPECTION') {
    return { ok: false, reason: 'NOT_INSPECTOR' };
  }

  const request = await db.serviceRequest.findUnique({
    where: { ref: input.ref },
    select: {
      id: true,
      providerId: true,
      vehicleId: true,
      status: true,
      inspectionDraft: { select: { id: true, templateId: true, status: true } },
    },
  });
  if (request === null || request.providerId !== input.providerId) {
    return { ok: false, reason: 'NOT_YOURS' };
  }

  if (request.inspectionDraft !== null) {
    if (!EDITABLE.has(request.inspectionDraft.status)) {
      return { ok: false, reason: 'NOT_EDITABLE' };
    }
    return {
      ok: true,
      draftId: request.inspectionDraft.id,
      templateId: request.inspectionDraft.templateId,
    };
  }

  /** **والقالبُ الفعّال وقتَ الفتح** — ويُثبَّت في المسودّة فلا يتبدّل تحتها. */
  const template = await db.inspectionTemplate.findFirst({
    where: { isActive: true },
    orderBy: { version: 'desc' },
    select: { id: true },
  });
  if (template === null) return { ok: false, reason: 'NO_TEMPLATE' };

  const draft = await db.inspectionDraft.create({
    data: {
      serviceRequestId: request.id,
      templateId: template.id,
      vehicleId: request.vehicleId ?? '',
      providerId: input.providerId,
      providerUserId: input.providerUserId,
      status: 'DRAFT',
      createdAt: now,
    },
    select: { id: true },
  });

  return { ok: true, draftId: draft.id, templateId: template.id };
}

export type DraftItem = {
  id: string;
  key: string;
  nameAr: string;
  inputType: InspectionInputType;
  unit: string | null;
  isCritical: boolean;
  state: InspectionResultState | null;
  value: string | null;
  note: string | null;
  /** صورُ البند بروابطها — **لا عددُها**: الفاحصُ يحتاج أن يراها ليحذف الخطأ منها. */
  photos: { id: string; url: string | null }[];
};

export type DraftCategory = {
  id: string;
  key: string;
  nameAr: string;
  icon: string | null;
  items: DraftItem[];
  /** كم بندًا أُجيب من كم — والتقدّمُ يُعرض بالقسم لا بالمجموع وحده. */
  answered: number;
};

export type DraftView = {
  ref: string;
  status: string;
  returnNote: string | null;
  odometerKm: number | null;
  summaryAr: string | null;
  editable: boolean;
  categories: DraftCategory[];
  panels: { panel: string; condition: string; microns: number | null; note: string | null }[];
  total: number;
  answered: number;
};

/**
 * المسودّةُ كما تُعرض: بنودُ القالب وعليها ما أُجيب.
 *
 * **والبنودُ من القالب لا من الأجوبة** — فبندٌ لم يُجَب بعد يجب أن
 * يَظهر، وإلّا لم يعرف الفاحصُ ما بقي عليه.
 */
export async function draftView(
  ref: string,
  providerId: string,
): Promise<DraftView | null> {
  const request = await db.serviceRequest.findUnique({
    where: { ref },
    select: {
      providerId: true,
      inspectionDraft: {
        select: {
          id: true,
          templateId: true,
          status: true,
          returnNote: true,
          odometerKm: true,
          summaryAr: true,
          results: { select: { itemId: true, state: true, value: true, note: true } },
          panels: {
            select: { panel: true, condition: true, paintThicknessMicrons: true, note: true },
          },
          photos: { select: { id: true, itemId: true, r2Key: true }, orderBy: { sort: 'asc' } },
        },
      },
    },
  });

  if (request === null || request.providerId !== providerId) return null;
  const draft = request.inspectionDraft;
  if (draft === null) return null;

  const categories = await db.inspectionCategory.findMany({
    where: { templateId: draft.templateId },
    orderBy: { sort: 'asc' },
    select: {
      id: true,
      key: true,
      nameAr: true,
      icon: true,
      items: {
        orderBy: { sort: 'asc' },
        select: {
          id: true,
          key: true,
          nameAr: true,
          inputType: true,
          unit: true,
          isCritical: true,
        },
      },
    },
  });

  const byItem = new Map(draft.results.map((row) => [row.itemId, row]));
  const { publicUrl } = await import('@/lib/r2');
  const photos = new Map<string, { id: string; url: string | null }[]>();
  for (const photo of draft.photos) {
    if (photo.itemId === null) continue;
    const list = photos.get(photo.itemId) ?? [];
    list.push({ id: photo.id, url: publicUrl(photo.r2Key) });
    photos.set(photo.itemId, list);
  }

  let total = 0;
  let answered = 0;
  const shaped = categories.map((category) => {
    const items = category.items.map((item) => {
      const saved = byItem.get(item.id) ?? null;
      return {
        id: item.id,
        key: item.key,
        nameAr: item.nameAr,
        inputType: item.inputType,
        unit: item.unit,
        isCritical: item.isCritical,
        state: saved?.state ?? null,
        value: saved?.value ?? null,
        note: saved?.note ?? null,
        photos: photos.get(item.id) ?? [],
      };
    });
    const done = items.filter((item) => item.state !== null).length;
    total += items.length;
    answered += done;
    return {
      id: category.id,
      key: category.key,
      nameAr: category.nameAr,
      icon: category.icon,
      items,
      answered: done,
    };
  });

  return {
    ref,
    status: draft.status,
    returnNote: draft.returnNote,
    odometerKm: draft.odometerKm,
    summaryAr: draft.summaryAr,
    editable: EDITABLE.has(draft.status),
    categories: shaped,
    panels: draft.panels.map((row) => ({
      panel: row.panel,
      condition: row.condition,
      microns: row.paintThicknessMicrons,
      note: row.note,
    })),
    total,
    answered,
  };
}

export type SaveResult =
  | { ok: true; answered: number; total: number }
  | {
      ok: false;
      reason: 'NOT_INSPECTOR' | 'NOT_YOURS' | 'NOT_EDITABLE' | 'UNKNOWN_ITEM' | 'NOTE_REQUIRED';
    };

/**
 * يحفظ جوابَ بندٍ واحد — وهو الحفظُ التلقائيّ.
 *
 * **والملاحظةُ إلزاميّةٌ مع الملاحظة والعطل** (المواصفة): «ملاحظة»
 * بلا كلمةٍ تُخرج تقريرًا يقول «فيه شيء» ولا يقول ما هو — ولا يُصلحها
 * قارئُه بعد شهر.
 */
export async function saveDraftResult(
  input: {
    ref: string;
    providerId: string;
    itemId: string;
    state: InspectionResultState;
    value: string | null;
    note: string | null;
  },
): Promise<SaveResult> {
  const gate = await ensureDraft({
    ref: input.ref,
    providerId: input.providerId,
    providerUserId: null,
  });
  if (!gate.ok) return { ok: false, reason: gate.reason === 'NO_TEMPLATE' ? 'NOT_YOURS' : gate.reason };

  const note = input.note?.trim() ?? null;
  /**
   * **وكلُّ حالٍ غير «سليم» تُفسَّر.** الملاحظةُ والعطلُ والصبغُ تقول
   * للمشتري **ماذا** وجد الفاحص، و«لا ينطبق» تقول **لماذا** لم يُفحَص
   * — و«لم يُفحَص» بلا سببٍ تُقرأ تقصيرًا من الفاحص لا وصفًا للمركبة.
   */
  if (input.state !== 'PASS' && (note === null || note === '')) {
    return { ok: false, reason: 'NOTE_REQUIRED' };
  }

  /** **والبندُ من قالب هذه المسودّة** — ومعرّفٌ من قالبٍ آخر لا يُقبل. */
  const item = await db.inspectionItem.findFirst({
    where: { id: input.itemId, category: { templateId: gate.templateId } },
    select: { id: true },
  });
  if (item === null) return { ok: false, reason: 'UNKNOWN_ITEM' };

  await db.inspectionDraftResult.upsert({
    where: { draftId_itemId: { draftId: gate.draftId, itemId: input.itemId } },
    create: {
      draftId: gate.draftId,
      itemId: input.itemId,
      state: input.state,
      value: input.value,
      note,
    },
    update: { state: input.state, value: input.value, note },
  });

  const [answered, total] = await Promise.all([
    db.inspectionDraftResult.count({ where: { draftId: gate.draftId } }),
    db.inspectionItem.count({ where: { category: { templateId: gate.templateId } } }),
  ]);

  return { ok: true, answered, total };
}

/** حالُ قطعةٍ في خريطة الهيكل — والمفتاحُ كما تعرفه `PaintMap`. */
export async function saveDraftPanel(input: {
  ref: string;
  providerId: string;
  panel: string;
  condition: string;
  microns: number | null;
  note: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const gate = await ensureDraft({
    ref: input.ref,
    providerId: input.providerId,
    providerUserId: null,
  });
  if (!gate.ok) return { ok: false, reason: gate.reason };

  await db.inspectionDraftPanel.upsert({
    where: { draftId_panel: { draftId: gate.draftId, panel: input.panel } },
    create: {
      draftId: gate.draftId,
      panel: input.panel,
      condition: input.condition,
      paintThicknessMicrons: input.microns,
      note: input.note,
    },
    update: {
      condition: input.condition,
      paintThicknessMicrons: input.microns,
      note: input.note,
    },
  });

  return { ok: true };
}

/** رأسُ المسودّة — العدّاد والخلاصة، ويُحفظان تلقائيًّا كالبنود. */
export async function saveDraftHeader(input: {
  ref: string;
  providerId: string;
  odometerKm: number | null;
  summaryAr: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const gate = await ensureDraft({
    ref: input.ref,
    providerId: input.providerId,
    providerUserId: null,
  });
  if (!gate.ok) return { ok: false, reason: gate.reason };

  await db.inspectionDraft.update({
    where: { id: gate.draftId },
    data: { odometerKm: input.odometerKm, summaryAr: input.summaryAr?.trim() || null },
  });
  return { ok: true };
}


export type PhotoResult =
  | { ok: true; id: string; url: string | null }
  | { ok: false; reason: 'NOT_INSPECTOR' | 'NOT_YOURS' | 'NOT_EDITABLE' | 'STORAGE' | 'INVALID' };

/**
 * ═══ صورةُ بندٍ — دليلٌ لا زينة ═══
 *
 * «ملاحظة» تقول إنّ شيئًا وُجد، والصورةُ تقول **ما هو**. ومن يقرأ
 * التقرير بعد شهرٍ لا يسأل الفاحصَ، فما لم يُصوَّر لا يُراجَع.
 *
 * **وتمرّ بما تمرّ به صورةُ الإعلان**: تُدار بـEXIF وتُصغَّر وتُطمَس
 * لوحتُها — فلوحةُ سيارةٍ في تقريرٍ يُشارَك تُعرّف صاحبَها.
 */
export async function addDraftPhoto(input: {
  ref: string;
  providerId: string;
  itemId: string | null;
  body: Buffer;
}): Promise<PhotoResult> {
  const gate = await ensureDraft({
    ref: input.ref,
    providerId: input.providerId,
    providerUserId: null,
  });
  if (!gate.ok) {
    return { ok: false, reason: gate.reason === 'NO_TEMPLATE' ? 'NOT_YOURS' : gate.reason };
  }

  /** **والبندُ من قالب هذه المسودّة** — ومعرّفٌ غريب لا يُعلَّق عليه صورة. */
  if (input.itemId !== null) {
    const item = await db.inspectionItem.findFirst({
      where: { id: input.itemId, category: { templateId: gate.templateId } },
      select: { id: true },
    });
    if (item === null) return { ok: false, reason: 'INVALID' };
  }

  const { processListingImage } = await import('./listing-images');
  const processed = await processListingImage(input.body);
  if (!processed.ok) {
    return { ok: false, reason: processed.reason === 'STORAGE' ? 'STORAGE' : 'INVALID' };
  }

  const last = await db.inspectionDraftPhoto.findFirst({
    where: { draftId: gate.draftId },
    orderBy: { sort: 'desc' },
    select: { sort: true },
  });

  const photo = await db.inspectionDraftPhoto.create({
    data: {
      draftId: gate.draftId,
      itemId: input.itemId,
      r2Key: processed.image.key,
      sort: (last?.sort ?? -1) + 1,
    },
    select: { id: true },
  });

  const { publicUrl } = await import('@/lib/r2');
  return { ok: true, id: photo.id, url: publicUrl(processed.image.key) };
}

/** يحذف صورةً — **وما دامت المسودّةُ تُحرَّر**: المُرسَلةُ دليلٌ لا مسوّدة. */
export async function removeDraftPhoto(input: {
  ref: string;
  providerId: string;
  photoId: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const gate = await ensureDraft({
    ref: input.ref,
    providerId: input.providerId,
    providerUserId: null,
  });
  if (!gate.ok) return { ok: false, reason: gate.reason };

  const photo = await db.inspectionDraftPhoto.findFirst({
    where: { id: input.photoId, draftId: gate.draftId },
    select: { id: true },
  });
  if (photo === null) return { ok: false, reason: 'NOT_FOUND' };

  await db.inspectionDraftPhoto.delete({ where: { id: photo.id } });
  return { ok: true };
}
