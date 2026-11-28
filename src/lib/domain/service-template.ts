import { Prisma } from '@/generated/prisma/client';
import type { ServiceFieldKind, ServiceFieldPurpose } from '@/generated/prisma/enums';
import { db } from '@/lib/db';

/**
 * ═══ قالبُ الخدمة — ما يُسأل عنه، وما يُملأ، وبكم ═══
 *
 * طلبُ المالك ٢٠٢٦-١١-٢٨: «قالب لكل خدمة … حقول لاسم الخدمة وحقول
 * لاتخاذ إجراء وحقول للسعر». وكان الفحصُ وحده قابلًا للتحرير، وباقي
 * الخدمات حقولُها في الشيفرة — إضافةُ حقلٍ تحتاج نشرًا.
 *
 * ═══ والسعرُ يُحسب هنا لا في المتصفّح ═══
 *
 * قرارُ المالك: حقولُ السعر **تحسب السعر قبل الدفع**. ورقمٌ يُحسب في
 * الصفحة يُرسَل من يد المستخدم — فمن عدّل الطلب دفع ما كتبه. فالصفحةُ
 * تعرض ما تحسبه هذه الدالّة، والخادمُ يعيد حسابَه عند الدفع ولا يقبل
 * مبلغًا مُرسَلًا.
 */

export type TemplateOption = {
  value: string;
  labelAr: string;
  priceDelta: string | null;
};

export type TemplateField = {
  id: string;
  key: string;
  labelAr: string;
  hintAr: string | null;
  kind: ServiceFieldKind;
  purpose: ServiceFieldPurpose;
  required: boolean;
  sort: number;
  maxLength: number | null;
  priceDelta: string | null;
  options: TemplateOption[];
};

export type ServiceTemplateView = {
  serviceId: string;
  serviceKey: string;
  nameAr: string;
  /** سعرُ الأساس — وعليه تُضاف زياداتُ الإجابات. */
  basePrice: string;
  version: number;
  fields: TemplateField[];
};

const FIELD_SELECT = {
  id: true,
  key: true,
  labelAr: true,
  hintAr: true,
  kind: true,
  purpose: true,
  required: true,
  sort: true,
  maxLength: true,
  priceDelta: true,
  options: {
    orderBy: { sort: 'asc' },
    select: { value: true, labelAr: true, priceDelta: true },
  },
} as const;

/** قالبُ خدمةٍ بمفتاحها — و`null` لخدمةٍ بلا قالبٍ بعد. */
export async function serviceTemplate(serviceKey: string): Promise<ServiceTemplateView | null> {
  const service = await db.service.findUnique({
    where: { key: serviceKey },
    select: {
      id: true,
      key: true,
      nameAr: true,
      price: true,
      template: {
        select: {
          version: true,
          fields: { orderBy: { sort: 'asc' }, select: FIELD_SELECT },
        },
      },
    },
  });
  if (service === null) return null;

  return {
    serviceId: service.id,
    serviceKey: service.key,
    nameAr: service.nameAr,
    basePrice: service.price.toFixed(2),
    version: service.template?.version ?? 0,
    fields: (service.template?.fields ?? []).map((field) => ({
      ...field,
      priceDelta: field.priceDelta?.toFixed(2) ?? null,
      options: field.options.map((option) => ({
        value: option.value,
        labelAr: option.labelAr,
        priceDelta: option.priceDelta?.toFixed(2) ?? null,
      })),
    })),
  };
}

export type QuoteLine = { key: string; labelAr: string; value: string; delta: string };

export type Quote =
  | {
      ok: true;
      base: string;
      extra: string;
      total: string;
      lines: QuoteLine[];
      version: number;
    }
  | { ok: false; fields: Record<string, 'REQUIRED' | 'UNKNOWN_OPTION' | 'NOT_A_NUMBER' | 'TOO_LONG'> };

/**
 * ═══ التسعير — ولكلّ صنفٍ معنى زيادته ═══
 *
 * `CHECKBOX` يضيفها إن أُشّر، و`NUMBER` يضيفها **لكلّ وحدة** (مسافةٌ
 * بالكيلو، سيّاراتٌ عدّة)، و`SELECT` يأخذها من **خياره** — فخيارٌ
 * أغلى من خيار. وما عداها لا يُسعّر.
 *
 * **ولا يُسعَّر حقلُ إجراء**: ما يملؤه المزوّد بعد الدفع لا يُطالَب به
 * العميل، وإلّا تبدّل السعرُ بعد أن دُفع. والشرطُ هنا لا في الشاشة.
 */
export function quoteFor(
  template: ServiceTemplateView,
  answers: Readonly<Record<string, string>>,
): Quote {
  const fields: Record<string, 'REQUIRED' | 'UNKNOWN_OPTION' | 'NOT_A_NUMBER' | 'TOO_LONG'> = {};
  const lines: QuoteLine[] = [];
  let extra = new Prisma.Decimal(0);

  for (const field of template.fields) {
    if (field.purpose !== 'REQUEST') continue;

    const raw = (answers[field.key] ?? '').trim();

    if (raw === '') {
      if (field.required && field.kind !== 'CHECKBOX') fields[field.key] = 'REQUIRED';
      continue;
    }
    if (field.maxLength !== null && raw.length > field.maxLength) {
      fields[field.key] = 'TOO_LONG';
      continue;
    }

    let delta = new Prisma.Decimal(0);
    let shown = raw;

    if (field.kind === 'SELECT') {
      const option = field.options.find((row) => row.value === raw);
      if (option === undefined) {
        fields[field.key] = 'UNKNOWN_OPTION';
        continue;
      }
      shown = option.labelAr;
      delta = new Prisma.Decimal(option.priceDelta ?? 0);
    } else if (field.kind === 'CHECKBOX') {
      const ticked = raw === 'true' || raw === '1';
      if (!ticked) continue;
      /** **والنطاقُ يعيد مفتاحًا لا جملة** (البوابة ١٧) — والصياغةُ في `labels/`. */
      shown = 'YES';
      delta = new Prisma.Decimal(field.priceDelta ?? 0);
    } else if (field.kind === 'NUMBER') {
      const count = Number(raw);
      if (!Number.isFinite(count) || count < 0) {
        fields[field.key] = 'NOT_A_NUMBER';
        continue;
      }
      /** **والزيادةُ لكلّ وحدة** — فمئةُ كيلو ليست كعشرة. */
      delta = new Prisma.Decimal(field.priceDelta ?? 0).mul(count);
    }

    extra = extra.add(delta);
    lines.push({
      key: field.key,
      labelAr: field.labelAr,
      value: shown,
      delta: delta.toFixed(2),
    });
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };

  const base = new Prisma.Decimal(template.basePrice);
  return {
    ok: true,
    base: base.toFixed(2),
    extra: extra.toFixed(2),
    total: base.add(extra).toFixed(2),
    lines,
    version: template.version,
  };
}

export type FieldInput = {
  key: string;
  labelAr: string;
  hintAr: string | null;
  kind: ServiceFieldKind;
  purpose: ServiceFieldPurpose;
  required: boolean;
  maxLength: number | null;
  priceDelta: string | null;
  options: readonly { value: string; labelAr: string; priceDelta: string | null }[];
};

export type SaveFailure =
  | 'SERVICE_NOT_FOUND'
  | 'KEY_INVALID'
  | 'LABEL_REQUIRED'
  | 'OPTIONS_REQUIRED'
  | 'PRICED_ACTION'
  | 'DELTA_INVALID';

export function validateField(input: FieldInput): SaveFailure | null {
  /** **والمفتاحُ لاتينيّ** — يُخزَّن في الإجابات ويُقرأ في التصدير. */
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(input.key)) return 'KEY_INVALID';
  if (input.labelAr.trim().length < 2) return 'LABEL_REQUIRED';
  if (input.kind === 'SELECT' && input.options.length === 0) return 'OPTIONS_REQUIRED';

  const priced =
    input.priceDelta !== null || input.options.some((option) => option.priceDelta !== null);
  /**
   * **ولا يُسعَّر حقلُ إجراء** — وهو شرطٌ في الخادم لا تلميحٌ في
   * الشاشة: حقلٌ يملؤه المزوّد بعد الدفع ويحمل زيادةً يعني سعرًا
   * يتبدّل بعد أن دُفع.
   */
  if (priced && input.purpose === 'ACTION') return 'PRICED_ACTION';

  for (const value of [input.priceDelta, ...input.options.map((option) => option.priceDelta)]) {
    if (value === null) continue;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) return 'DELTA_INVALID';
  }

  return null;
}

/**
 * يحفظ حقلًا — **ويرفع إصدارَ القالب**، فيُعرف أيُّ نصٍّ قرأه من طلب.
 */
export async function saveTemplateField(
  actor: { adminId: string },
  serviceKey: string,
  input: FieldInput,
  now: Date = new Date(),
): Promise<{ ok: true; fieldId: string } | { ok: false; reason: SaveFailure }> {
  const invalid = validateField(input);
  if (invalid !== null) return { ok: false, reason: invalid };

  const service = await db.service.findUnique({
    where: { key: serviceKey },
    select: { id: true, template: { select: { id: true } } },
  });
  if (service === null) return { ok: false, reason: 'SERVICE_NOT_FOUND' };

  const fieldId = await db.$transaction(async (tx) => {
    const template =
      service.template ??
      (await tx.serviceTemplate.create({
        data: { serviceId: service.id },
        select: { id: true },
      }));

    const saved = await tx.serviceTemplateField.upsert({
      where: { templateId_key: { templateId: template.id, key: input.key } },
      create: {
        templateId: template.id,
        key: input.key,
        labelAr: input.labelAr.trim(),
        hintAr: input.hintAr,
        kind: input.kind,
        purpose: input.purpose,
        required: input.required,
        maxLength: input.maxLength,
        priceDelta: input.priceDelta === null ? null : new Prisma.Decimal(input.priceDelta),
        sort: await tx.serviceTemplateField.count({ where: { templateId: template.id } }),
      },
      update: {
        labelAr: input.labelAr.trim(),
        hintAr: input.hintAr,
        kind: input.kind,
        purpose: input.purpose,
        required: input.required,
        maxLength: input.maxLength,
        priceDelta: input.priceDelta === null ? null : new Prisma.Decimal(input.priceDelta),
      },
      select: { id: true },
    });

    /** **والخياراتُ تُستبدل لا تُدمج** — فخيارٌ حُذف من الشاشة يُحذف. */
    await tx.serviceTemplateOption.deleteMany({ where: { fieldId: saved.id } });
    if (input.options.length > 0) {
      await tx.serviceTemplateOption.createMany({
        data: input.options.map((option, index) => ({
          fieldId: saved.id,
          value: option.value,
          labelAr: option.labelAr,
          sort: index,
          priceDelta: option.priceDelta === null ? null : new Prisma.Decimal(option.priceDelta),
        })),
      });
    }

    await tx.serviceTemplate.update({
      where: { id: template.id },
      data: { version: { increment: 1 } },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.adminId,
        actorType: 'admin',
        entity: 'Service',
        entityId: service.id,
        action: 'service.template.field',
        before: {},
        after: { key: input.key, purpose: input.purpose, kind: input.kind },
        ip: null,
        createdAt: now,
      },
    });

    return saved.id;
  });

  return { ok: true, fieldId };
}

/** يحذف حقلًا — **ولا يمسّ إجاباتِ طلبٍ مضى**: لقطتُها محفوظةٌ معها. */
export async function removeTemplateField(
  actor: { adminId: string },
  serviceKey: string,
  key: string,
  now: Date = new Date(),
): Promise<boolean> {
  const service = await db.service.findUnique({
    where: { key: serviceKey },
    select: { id: true, template: { select: { id: true } } },
  });
  if (service?.template == null) return false;

  const templateId = service.template.id;
  const removed = await db.serviceTemplateField.deleteMany({ where: { templateId, key } });
  if (removed.count === 0) return false;

  await db.serviceTemplate.update({
    where: { id: templateId },
    data: { version: { increment: 1 } },
  });
  await db.auditLog.create({
    data: {
      actorId: actor.adminId,
      actorType: 'admin',
      entity: 'Service',
      entityId: service.id,
      action: 'service.template.removed',
      before: { key },
      after: {},
      ip: null,
      createdAt: now,
    },
  });
  return true;
}
