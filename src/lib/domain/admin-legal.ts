import { db } from '@/lib/db';
import type { Prisma, LegalVersionStatus } from '@/generated/prisma/client';
import { surfacesFor, type LegalSurface } from './legal';

/**
 * ═══ نسخٌ موقّتة لا تحريرٌ حيّ ═══
 *
 * عنوانُ ترميز A34 حرفيًّا، وهو قاعدةُ عملٍ لا شكلُ شاشة: **من قبِل
 * الشروط قبِل نصًّا بعينه**، فتحريرُه في مكانه يجعل موافقتَه على ما لم
 * يقرأه — وسجلُّ قبوله يشير إلى نسخةٍ صار نصُّها شيئًا آخر.
 *
 * فكلُّ تعديلٍ **مسوّدةٌ جديدة**، ونشرُها يُسلّم السابقةَ إلى
 * `SUPERSEDED` وتبقى. والمستندُ نفسُه يحمل نصَّ المنشور ليقرأه الزائر
 * في استعلامٍ واحد.
 *
 * ═══ ولا نصاب — بقرار المالك ═══
 *
 * الترميزُ يقول «والنشر يحتاج موافقة عضوين». **وقد أُلغي ذلك**
 * (قرار المالك ٢٠٢٦-١٠-١٤، وأُعيد تأكيدُه صنفًا في ٢٠٢٦-١١-٢٤:
 * ROADMAP §٣٥ و§٤١) — فالنشرُ يقع بضغطةِ من يملك الصلاحية، ويبقى له
 * صفٌّ في `AuditLog` يسمّي فاعلَه. والسجلُّ أثرٌ لا بوّابةُ سلطة.
 */

/** النسخةُ المسوّدة — واحدةٌ لكل مستند، أو لا شيء. */
export type DraftVersion = {
  id: string;
  version: string;
  titleAr: string;
  titleEn: string;
  summaryAr: string | null;
  summaryEn: string | null;
  sections: LegalSection[];
  material: boolean;
  effectiveAt: string | null;
  updatedAt: string;
};

export type LegalSection = {
  n: number;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
};

export type LegalRow = {
  key: string;
  titleAr: string;
  version: string;
  effectiveAt: string;
  active: boolean;
  requiredAtSignup: boolean;
  surfaces: LegalSurface[];
  sectionCount: number;
  hasSummary: boolean;
  updatedAt: string;
  /** رقمُ المسوّدة إن كانت — والشاشةُ تعرضه «v3 — مسوّدة». */
  draftVersion: string | null;
};

export type VersionRow = {
  id: string;
  documentKey: string;
  documentTitleAr: string;
  version: string;
  status: LegalVersionStatus;
  material: boolean;
  effectiveAt: string | null;
  publishedAt: string | null;
  publishedByName: string | null;
  createdAt: string;
  acceptances: number;
};

function readSections(value: unknown): LegalSection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw, index): LegalSection[] => {
    if (typeof raw !== 'object' || raw === null) return [];
    const row = raw as Record<string, unknown>;
    const titleAr = typeof row.titleAr === 'string' ? row.titleAr : '';
    const bodyAr = typeof row.bodyAr === 'string' ? row.bodyAr : '';
    if (titleAr === '' && bodyAr === '') return [];
    return [
      {
        n: typeof row.n === 'number' ? row.n : index + 1,
        titleAr,
        titleEn: typeof row.titleEn === 'string' ? row.titleEn : titleAr,
        bodyAr,
        bodyEn: typeof row.bodyEn === 'string' ? row.bodyEn : bodyAr,
      },
    ];
  });
}

export type LegalSummary = {
  total: number;
  unpublished: number;
  sections: number;
  /** نسخٌ مسوّدة تنتظر النشر — بطاقةُ الترميز «نسخة مسوّدة · بانتظار المراجعة». */
  drafts: number;
  /** آخر مستندٍ مُسّ — والتاريخ وحده لا يقول أيّه. */
  latest: { titleAr: string; updatedAt: string } | null;
};

/**
 * عدّادات الشاشة — **من الصفوف لا من طول القائمة المعروضة**.
 *
 * الشاشة تعرض المستندات كلَّها اليوم، فالعدّ من القائمة يتفق معها
 * صدفةً. وأوّلُ ترشيحٍ يُضاف (حالة أو بحث) يجعل «٨ مستندات» تعني
 * «٨ معروضة» — وهو عدّادٌ يكذب بلا أن يتغيّر سطرُه.
 */
export async function legalSummary(): Promise<LegalSummary> {
  const [docs, drafts] = await Promise.all([
    db.legalDocument.findMany({
      select: { titleAr: true, active: true, sections: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    db.legalVersion.count({ where: { status: 'DRAFT' } }),
  ]);

  const newest = docs[0];

  return {
    total: docs.length,
    unpublished: docs.filter((doc) => !doc.active).length,
    sections: docs.reduce((sum, doc) => sum + readSections(doc.sections).length, 0),
    drafts,
    latest:
      newest === undefined
        ? null
        : { titleAr: newest.titleAr, updatedAt: newest.updatedAt.toISOString() },
  };
}

export async function legalDocuments(): Promise<LegalRow[]> {
  const docs = await db.legalDocument.findMany({
    orderBy: { sort: 'asc' },
    include: {
      versions: {
        where: { status: 'DRAFT' },
        select: { version: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  return docs.map((doc) => ({
    key: doc.key,
    titleAr: doc.titleAr,
    version: doc.version,
    effectiveAt: doc.effectiveAt.toISOString(),
    active: doc.active,
    requiredAtSignup: doc.requiredAtSignup,
    surfaces: surfacesFor(doc),
    sectionCount: readSections(doc.sections).length,
    hasSummary: doc.summaryAr !== null && doc.summaryAr.trim() !== '',
    updatedAt: doc.updatedAt.toISOString(),
    draftVersion: doc.versions[0]?.version ?? null,
  }));
}

/**
 * سجلُّ النسخ — **كلُّ ما نُشر وما لم يُنشر، بعدد من قبِله**.
 *
 * وعددُ القبول بالنسخة هو ما يجعل الأرشيف مفيدًا: نسخةٌ قبِلها ألفٌ لا
 * تُحذف ولا تُمسّ، وأخرى بصفرٍ مسوّدةٌ لم تخرج.
 */
export async function legalVersions(): Promise<VersionRow[]> {
  const rows = await db.legalVersion.findMany({
    orderBy: [{ documentKey: 'asc' }, { createdAt: 'desc' }],
    include: { document: { select: { titleAr: true } } },
  });

  const counts = await db.legalAcceptance.groupBy({
    by: ['documentKey', 'version'],
    _count: { id: true },
  });
  const tally = new Map(
    counts.map((row) => [`${row.documentKey}@${row.version}`, row._count.id] as const),
  );

  /** **واسمُ الناشر يُقرأ من جدول الأدمن** — والفارغُ يعرضه الترميز «مع المنصة». */
  const ids = [...new Set(rows.flatMap((row) => (row.publishedBy === null ? [] : [row.publishedBy])))];
  const admins =
    ids.length === 0
      ? []
      : await db.adminUser.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const names = new Map(admins.map((admin) => [admin.id, admin.name] as const));

  return rows.map((row) => ({
    id: row.id,
    documentKey: row.documentKey,
    documentTitleAr: row.document.titleAr,
    version: row.version,
    status: row.status,
    material: row.material,
    effectiveAt: row.effectiveAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    publishedByName: row.publishedBy === null ? null : (names.get(row.publishedBy) ?? null),
    createdAt: row.createdAt.toISOString(),
    acceptances: tally.get(`${row.documentKey}@${row.version}`) ?? 0,
  }));
}

/**
 * مدخلُ المحرّر — **وموضعُه هنا لا في ملفّ `'use client'`**.
 *
 * كان `toDraft` مُصدَّرًا من `DraftEditor.tsx`، فنادتها صفحةُ المستند
 * وهي مكوّنُ خادم — **فردّت الشاشةُ ٥٠٠ كاملة**: «Attempted to call
 * toDraft() from the server but toDraft is on the client». ولم يكشفه
 * اختبار؛ كشفه فتحُ الشاشة بالنقر.
 */
export type EditorDraft = {
  titleAr: string;
  titleEn: string;
  summaryAr: string;
  summaryEn: string;
  material: boolean;
  effectiveAt: string;
  sections: LegalSection[];
};

export function toDraft(source: {
  titleAr: string;
  titleEn: string;
  summaryAr: string | null;
  summaryEn: string | null;
  sections: LegalSection[];
  material?: boolean;
  effectiveAt?: string | null;
}): EditorDraft {
  return {
    titleAr: source.titleAr,
    titleEn: source.titleEn,
    summaryAr: source.summaryAr ?? '',
    summaryEn: source.summaryEn ?? '',
    material: source.material ?? false,
    /** `datetime` من القاعدة و`date` في الحقل — فيُقتطع اليوم. */
    effectiveAt: (source.effectiveAt ?? '').slice(0, 10),
    sections: source.sections,
  };
}

export type EditorState = {
  key: string;
  titleAr: string;
  published: {
    version: string;
    effectiveAt: string;
    sectionCount: number;
    acceptances: number;
  } | null;
  draft: DraftVersion | null;
  requiredAtSignup: boolean;
  active: boolean;
  /** نصُّ المنشور — تُبنى منه المسوّدةُ الأولى فلا يُعاد كتابةُ المستند. */
  current: {
    titleAr: string;
    titleEn: string;
    summaryAr: string | null;
    summaryEn: string | null;
    sections: LegalSection[];
    version: string;
  };
};

export async function legalEditor(key: string): Promise<EditorState | null> {
  const doc = await db.legalDocument.findUnique({
    where: { key },
    include: {
      versions: { where: { status: 'DRAFT' }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (doc === null) return null;

  const acceptances = await db.legalAcceptance.count({
    where: { documentKey: key, version: doc.version },
  });

  const draft = doc.versions[0];

  return {
    key: doc.key,
    titleAr: doc.titleAr,
    active: doc.active,
    requiredAtSignup: doc.requiredAtSignup,
    published: doc.active
      ? {
          version: doc.version,
          effectiveAt: doc.effectiveAt.toISOString(),
          sectionCount: readSections(doc.sections).length,
          acceptances,
        }
      : null,
    draft:
      draft === undefined
        ? null
        : {
            id: draft.id,
            version: draft.version,
            titleAr: draft.titleAr,
            titleEn: draft.titleEn,
            summaryAr: draft.summaryAr,
            summaryEn: draft.summaryEn,
            sections: readSections(draft.sections),
            material: draft.material,
            effectiveAt: draft.effectiveAt?.toISOString() ?? null,
            updatedAt: draft.updatedAt.toISOString(),
          },
    current: {
      titleAr: doc.titleAr,
      titleEn: doc.titleEn,
      summaryAr: doc.summaryAr,
      summaryEn: doc.summaryEn,
      sections: readSections(doc.sections),
      version: doc.version,
    },
  };
}

/**
 * ═══ رقمُ النسخة التالية — **من الأعلى لا من العدد** ═══
 *
 * `count() + 1` يصطدم بأوّل فجوة. والنسخ نصوصٌ («1.0» · «1.1»)، فيُقرأ
 * أعلى رقمٍ قائمٍ ويُزاد كسرُه.
 */
export function nextVersion(existing: readonly string[]): string {
  let major = 1;
  let minor = 0;
  for (const raw of existing) {
    const match = /^(\d+)(?:\.(\d+))?/.exec(raw.trim());
    if (match === null) continue;
    const high = Number(match[1]);
    const low = match[2] === undefined ? 0 : Number(match[2]);
    if (high > major || (high === major && low >= minor)) {
      major = high;
      minor = low;
    }
  }
  return `${String(major)}.${String(minor + 1)}`;
}

export type DraftInput = {
  titleAr: string;
  titleEn: string;
  summaryAr?: string | null;
  summaryEn?: string | null;
  sections: { titleAr: string; titleEn?: string | null; bodyAr: string; bodyEn?: string | null }[];
  material: boolean;
  /** `YYYY-MM-DD` — ويُشترط مستقبلًا للجوهريّ. */
  effectiveAt?: string | null;
};

export type SaveResult =
  | { ok: true; version: string }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'VALIDATION'; fields: Record<string, string> };

const trimmed = (value: string | null | undefined): string => (value ?? '').trim();

/** مفاتيحُ تُظلّلها مساراتٌ ثابتة بجوار `/admin/legal/[key]`. */
const RESERVED_KEYS = new Set(['new', 'history']);

/** يعيد مفاتيح لا جُملًا (البوابة ١٧) — والصياغة في الشاشة. */
export function validateDraft(
  input: DraftInput,
  noticeDays: number,
  now: Date,
): Record<string, string> {
  const fields: Record<string, string> = {};

  if (trimmed(input.titleAr) === '') fields.titleAr = 'REQUIRED';

  const sections = input.sections.filter(
    (section) => trimmed(section.titleAr) !== '' || trimmed(section.bodyAr) !== '',
  );
  if (sections.length === 0) fields.sections = 'REQUIRED';
  else if (sections.some((section) => trimmed(section.titleAr) === '')) {
    fields.sections = 'SECTION_TITLE';
  } else if (sections.some((section) => trimmed(section.bodyAr) === '')) {
    fields.sections = 'SECTION_BODY';
  }

  const date = trimmed(input.effectiveAt);
  if (date === '') {
    /**
     * **والجوهريُّ لا يسري بلا تاريخ.** الترميز يَعِد بإخطارٍ قبل
     * أربعةَ عشرَ يومًا، وإخطارٌ بلا موعدِ نفاذٍ لا يُحتسب منه شيء.
     */
    if (input.material) fields.effectiveAt = 'REQUIRED';
  } else if (Number.isNaN(Date.parse(date))) {
    fields.effectiveAt = 'INVALID';
  } else if (input.material) {
    const notice = (Date.parse(date) - now.getTime()) / 86_400_000;
    if (notice < noticeDays) fields.effectiveAt = 'TOO_SOON';
  }

  return fields;
}

function toJson(
  sections: DraftInput['sections'],
): Prisma.InputJsonValue {
  return sections
    .filter((section) => trimmed(section.titleAr) !== '' || trimmed(section.bodyAr) !== '')
    .map((section, index) => ({
      n: index + 1,
      titleAr: trimmed(section.titleAr),
      titleEn: trimmed(section.titleEn) === '' ? trimmed(section.titleAr) : trimmed(section.titleEn),
      bodyAr: trimmed(section.bodyAr),
      bodyEn: trimmed(section.bodyEn) === '' ? trimmed(section.bodyAr) : trimmed(section.bodyEn),
    })) as unknown as Prisma.InputJsonValue;
}

async function writeAudit(
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
  actor: { adminId: string; ip: string | null },
  now: Date,
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: actor.adminId,
      actorType: 'admin',
      entity: 'LegalDocument',
      entityId,
      action,
      before: before as Prisma.InputJsonValue,
      after: after as Prisma.InputJsonValue,
      ip: actor.ip,
      createdAt: now,
    },
  });
}

/**
 * يحفظ مسوّدةً لمستندٍ قائم — **ويُنشئها إن لم تكن**.
 *
 * ومسوّدةٌ واحدة لكل مستند: ثانيةٌ تعني نصّين يتنافسان على نشرةٍ
 * واحدة، ولا يقول أحدٌ أيُّهما سيسري.
 */
export async function saveDraft(
  input: DraftInput & { key: string; adminId: string; ip: string | null; noticeDays: number },
  now: Date = new Date(),
): Promise<SaveResult> {
  const fields = validateDraft(input, input.noticeDays, now);
  if (Object.keys(fields).length > 0) return { ok: false, reason: 'VALIDATION', fields };

  const doc = await db.legalDocument.findUnique({
    where: { key: input.key },
    include: { versions: { select: { version: true, status: true, id: true } } },
  });
  if (doc === null) return { ok: false, reason: 'NOT_FOUND' };

  const draft = doc.versions.find((row) => row.status === 'DRAFT');
  const version =
    draft?.version ?? nextVersion([doc.version, ...doc.versions.map((row) => row.version)]);

  const data = {
    titleAr: trimmed(input.titleAr),
    titleEn: trimmed(input.titleEn) === '' ? trimmed(input.titleAr) : trimmed(input.titleEn),
    summaryAr: trimmed(input.summaryAr) === '' ? null : trimmed(input.summaryAr),
    summaryEn: trimmed(input.summaryEn) === '' ? null : trimmed(input.summaryEn),
    sections: toJson(input.sections),
    material: input.material,
    effectiveAt: trimmed(input.effectiveAt) === '' ? null : new Date(trimmed(input.effectiveAt)),
  };

  if (draft === undefined) {
    await db.legalVersion.create({
      data: { documentKey: input.key, version, status: 'DRAFT', createdBy: input.adminId, ...data },
    });
  } else {
    await db.legalVersion.update({ where: { id: draft.id }, data });
  }

  await writeAudit(
    draft === undefined ? 'legal.draft_created' : 'legal.draft_saved',
    input.key,
    draft === undefined ? null : { version },
    { version, material: input.material },
    input,
    now,
  );

  return { ok: true, version };
}

export type PublishResult =
  | { ok: true; version: string; material: boolean }
  | { ok: false; reason: 'NOT_FOUND' | 'NO_DRAFT' | 'NOT_EFFECTIVE' };

/**
 * ═══ النشر — **نقلةٌ واحدة في معاملةٍ واحدة** ═══
 *
 * المسوّدةُ تصير `PUBLISHED`، والسابقةُ `SUPERSEDED`، ونصُّها يُنسخ على
 * المستند ليقرأه الزائر. وثلاثُ كتباتٍ بلا معاملةٍ تُنتج مستندًا يحمل
 * نصًّا لا نسخةَ له في الأرشيف إن سقط بينها شيء.
 */
export async function publishDraft(
  input: { key: string; adminId: string; ip: string | null },
  now: Date = new Date(),
): Promise<PublishResult> {
  const doc = await db.legalDocument.findUnique({
    where: { key: input.key },
    include: { versions: { where: { status: 'DRAFT' }, orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (doc === null) return { ok: false, reason: 'NOT_FOUND' };

  const draft = doc.versions[0];
  if (draft === undefined) return { ok: false, reason: 'NO_DRAFT' };

  const effectiveAt = draft.effectiveAt ?? now;

  await db.$transaction(async (tx) => {
    await tx.legalVersion.updateMany({
      where: { documentKey: input.key, status: 'PUBLISHED' },
      data: { status: 'SUPERSEDED' },
    });

    await tx.legalVersion.update({
      where: { id: draft.id },
      data: {
        status: 'PUBLISHED',
        publishedBy: input.adminId,
        publishedAt: now,
        effectiveAt,
      },
    });

    await tx.legalDocument.update({
      where: { key: input.key },
      data: {
        titleAr: draft.titleAr,
        titleEn: draft.titleEn,
        summaryAr: draft.summaryAr,
        summaryEn: draft.summaryEn,
        sections: draft.sections as Prisma.InputJsonValue,
        version: draft.version,
        effectiveAt,
        active: true,
      },
    });
  });

  await writeAudit(
    'legal.published',
    input.key,
    { version: doc.version },
    { version: draft.version, material: draft.material, effectiveAt: effectiveAt.toISOString() },
    input,
    now,
  );

  return { ok: true, version: draft.version, material: draft.material };
}

export type DiscardResult = { ok: true } | { ok: false; reason: 'NO_DRAFT' };

/** يُسقط المسوّدة — **وهي الوحيدةُ التي تُحذف**، إذ لم يقبلها أحد. */
export async function discardDraft(
  input: { key: string; adminId: string; ip: string | null },
  now: Date = new Date(),
): Promise<DiscardResult> {
  const draft = await db.legalVersion.findFirst({
    where: { documentKey: input.key, status: 'DRAFT' },
    select: { id: true, version: true },
  });
  if (draft === null) return { ok: false, reason: 'NO_DRAFT' };

  await db.legalVersion.delete({ where: { id: draft.id } });
  await writeAudit('legal.draft_discarded', input.key, { version: draft.version }, null, input, now);

  return { ok: true };
}

export type CreateResult =
  | { ok: true; key: string }
  | { ok: false; reason: 'KEY_TAKEN' }
  | { ok: false; reason: 'VALIDATION'; fields: Record<string, string> };

/**
 * مستندٌ جديد — **ويُولد مسوّدةً لا منشورًا**.
 *
 * فمستندٌ قانونيّ يظهر للزائر في اللحظة التي يُكتب فيها يظهر بنصٍّ لم
 * يُراجَع. والزرُّ في الترميز اسمُه «مستند جديد»، وما يُنشئه نسخةٌ
 * أولى تنتظر النشر.
 */
export async function createDocument(
  input: DraftInput & {
    key: string;
    requiredAtSignup: boolean;
    adminId: string;
    ip: string | null;
    noticeDays: number;
  },
  now: Date = new Date(),
): Promise<CreateResult> {
  const fields = validateDraft(input, input.noticeDays, now);

  const key = trimmed(input.key).toLowerCase();
  if (key === '') fields.key = 'REQUIRED';
  else if (!/^[a-z][a-z0-9-]{1,30}$/.test(key)) fields.key = 'INVALID';
  /**
   * **ومفتاحٌ يُظلّله مسارٌ ثابت لا يُقبل.** شاشةُ المستند
   * `/admin/legal/[key]`، وبجوارها `/new` و`/history` ثابتتان —
   * ومستندٌ مفتاحُه `new` يُنشأ ثمّ لا تُفتح شاشتُه أبدًا.
   */
  else if (RESERVED_KEYS.has(key)) fields.key = 'RESERVED';

  if (Object.keys(fields).length > 0) return { ok: false, reason: 'VALIDATION', fields };

  const taken = await db.legalDocument.findUnique({ where: { key }, select: { key: true } });
  if (taken !== null) return { ok: false, reason: 'KEY_TAKEN' };

  const sort = await db.legalDocument.aggregate({ _max: { sort: true } });

  await db.legalDocument.create({
    data: {
      key,
      titleAr: trimmed(input.titleAr),
      titleEn: trimmed(input.titleEn) === '' ? trimmed(input.titleAr) : trimmed(input.titleEn),
      version: '1.0',
      effectiveAt: trimmed(input.effectiveAt) === '' ? now : new Date(trimmed(input.effectiveAt)),
      summaryAr: trimmed(input.summaryAr) === '' ? null : trimmed(input.summaryAr),
      summaryEn: trimmed(input.summaryEn) === '' ? null : trimmed(input.summaryEn),
      sections: toJson(input.sections),
      /** **غيرُ سارٍ حتى يُنشر** — ولا يراه زائر قبل ذلك. */
      active: false,
      requiredAtSignup: input.requiredAtSignup,
      sort: (sort._max.sort ?? 0) + 1,
      versions: {
        create: {
          version: '1.0',
          status: 'DRAFT',
          createdBy: input.adminId,
          titleAr: trimmed(input.titleAr),
          titleEn:
            trimmed(input.titleEn) === '' ? trimmed(input.titleAr) : trimmed(input.titleEn),
          summaryAr: trimmed(input.summaryAr) === '' ? null : trimmed(input.summaryAr),
          summaryEn: trimmed(input.summaryEn) === '' ? null : trimmed(input.summaryEn),
          sections: toJson(input.sections),
          material: input.material,
          effectiveAt:
            trimmed(input.effectiveAt) === '' ? null : new Date(trimmed(input.effectiveAt)),
        },
      },
    },
  });

  await writeAudit('legal.document_created', key, null, { key, version: '1.0' }, input, now);

  return { ok: true, key };
}

export type RequiredResult = { ok: true } | { ok: false; reason: 'NOT_FOUND' };

/**
 * يبدّل «إلزاميّ للتسجيل» — **وهو الحقلُ الذي يقرؤه التسجيل نفسُه**،
 * فعمودُ «يظهر في» في الشاشة والشرطُ في `recordAcceptance` مصدرُهما
 * واحد ولا يتباعدان.
 */
export async function setRequiredAtSignup(
  input: { key: string; required: boolean; adminId: string; ip: string | null },
  now: Date = new Date(),
): Promise<RequiredResult> {
  const doc = await db.legalDocument.findUnique({
    where: { key: input.key },
    select: { requiredAtSignup: true },
  });
  if (doc === null) return { ok: false, reason: 'NOT_FOUND' };

  await db.legalDocument.update({
    where: { key: input.key },
    data: { requiredAtSignup: input.required },
  });

  await writeAudit(
    'legal.required_changed',
    input.key,
    { requiredAtSignup: doc.requiredAtSignup },
    { requiredAtSignup: input.required },
    input,
    now,
  );

  return { ok: true };
}
