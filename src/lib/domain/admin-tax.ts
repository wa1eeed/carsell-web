import { db } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type { AdminUser } from '@/generated/prisma/client';
import type { InvoiceIssuer, SupplyType, TaxableBase } from '@/generated/prisma/enums';
import { isVatRegistered } from './tax-profile';

/**
 * A21 — محرّك الضريبة.
 *
 * **الشاشة تعرض القواعد ولا تحسب شيئًا**: الحساب في `tax.ts` وحده،
 * وبوابةٌ تمنع غيره. وهذه نافذةٌ على صفوفٍ يديرها المشغّل.
 *
 * والقواعد المعطَّلة **تُعرض** لا تُخفى: ثلاثٌ منها تنتظر مذكرةً ضريبية،
 * وإخفاؤها يجعل أكبر انكشافٍ ماليّ في المنتج غير مرئيّ لمن يديره.
 */

export type TaxRuleRow = {
  id: string;
  sellerType: string | null;
  buyerType: string | null;
  supplyType: SupplyType;
  taxableBase: TaxableBase;
  ratePct: string | null;
  invoiceIssuer: InvoiceIssuer;
  active: boolean;
  note: string | null;
  updatedAt: string;
  /** فواتير صدرت بهذه القاعدة — تعديلها لا يمسّها، والعدد يقول كم. */
  issuedCount: number;
};

export type TaxRuleSummary = {
  total: number;
  active: number;
  /** المعطَّلة تنتظر تصنيفًا مكتوبًا — وهي ليست نقصًا في الإعداد. */
  awaiting: number;
};

export async function listTaxRules(): Promise<TaxRuleRow[]> {
  const [rows, issued] = await Promise.all([
    db.taxRule.findMany({ orderBy: [{ supplyType: 'asc' }, { active: 'desc' }] }),
    db.taxInvoice.groupBy({ by: ['ruleId'], _count: { _all: true } }),
  ]);

  return rows.map((rule) => ({
    id: rule.id,
    sellerType: rule.sellerType,
    buyerType: rule.buyerType,
    supplyType: rule.supplyType,
    taxableBase: rule.taxableBase,
    ratePct: rule.ratePct?.toString() ?? null,
    invoiceIssuer: rule.invoiceIssuer,
    active: rule.active,
    note: rule.note,
    updatedAt: rule.updatedAt.toISOString(),
    issuedCount: issued.find((row) => row.ruleId === rule.id)?._count._all ?? 0,
  }));
}

export function summarize(rules: readonly TaxRuleRow[]): TaxRuleSummary {
  const active = rules.filter((rule) => rule.active).length;
  return { total: rules.length, active, awaiting: rules.length - active };
}

export type InvoiceRow = {
  number: string;
  supplyType: SupplyType;
  supplierName: string;
  customerName: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  status: string;
  issuedAt: string;
  /** إشعارات دائنة على هذه الفاتورة — الأصل يبقى ويُقرأ معها. */
  creditNotes: number;
};

export type InvoiceTotals = {
  all: number;
  bySupply: { key: SupplyType; count: number }[];
  creditNotes: number;
};

export async function listInvoices(limit = 60): Promise<InvoiceRow[]> {
  const rows = await db.taxInvoice.findMany({
    orderBy: { sequence: 'desc' },
    take: limit,
    include: { _count: { select: { creditNotes: true } } },
  });

  return rows.map((invoice) => ({
    number: invoice.number,
    supplyType: invoice.ruleSupplyType,
    supplierName: invoice.supplierName,
    customerName: invoice.customerName,
    subtotal: invoice.subtotal.toString(),
    taxTotal: invoice.taxTotal.toString(),
    total: invoice.total.toString(),
    status: invoice.status,
    issuedAt: invoice.issuedAt.toISOString(),
    creditNotes: invoice._count.creditNotes,
  }));
}

export async function invoiceTotals(): Promise<InvoiceTotals> {
  const [all, bySupply, creditNotes] = await Promise.all([
    db.taxInvoice.count(),
    db.taxInvoice.groupBy({ by: ['ruleSupplyType'], _count: { _all: true } }),
    db.creditNote.count(),
  ]);

  return {
    all,
    bySupply: bySupply
      .map((row) => ({ key: row.ruleSupplyType, count: row._count._all }))
      .sort((a, b) => b.count - a.count),
    creditNotes,
  };
}

export type RuleEdit = {
  taxableBase: TaxableBase;
  ratePct: number | null;
  invoiceIssuer: InvoiceIssuer;
  active: boolean;
  note: string | null;
};

export type RuleChangeResult =
  | { ok: true; state: 'PENDING'; requestId: string; approvals: number; required: number }
  | { ok: true; state: 'APPLIED' }
  | { ok: false; reason: 'NOT_FOUND' | 'SELF_APPROVAL' | 'INVALID' };

const REQUIRED_APPROVALS = 2;
const REQUEST_WINDOW_HOURS = 72;

/**
 * ═══ تعديل القاعدة بنصاب عضوين ═══
 *
 * **وما يحتاج حراسةً يُبنى محروسًا**: لا يوجد مسارٌ يعدّل قاعدةً بيدٍ
 * واحدة ثم يُحرَس لاحقًا. وأثر القاعدة وثائقُ قانونية — وتفعيل صفٍّ
 * ينتظر مذكرةً قد ينقل الضريبة من ١٥٠ إلى ١٥٬٠٠٠ في صفقة واحدة.
 *
 * والفواتير الصادرة **لا تتحرّك**: لقطة القاعدة منسوخة فيها كاملةً.
 */
export async function requestRuleChange(
  admin: AdminUser,
  ruleId: string,
  edit: RuleEdit,
  ip: string | null,
  now: Date = new Date(),
): Promise<RuleChangeResult> {
  if (edit.ratePct !== null && (edit.ratePct < 0 || edit.ratePct > 100)) {
    return { ok: false, reason: 'INVALID' };
  }

  const rule = await db.taxRule.findUnique({ where: { id: ruleId } });
  if (rule === null) return { ok: false, reason: 'NOT_FOUND' };

  const existing = await db.approvalRequest.findFirst({
    where: { kind: 'TAX_RULE_CHANGE', entityId: ruleId, status: 'PENDING' },
  });
  if (existing !== null) {
    return {
      ok: true,
      state: 'PENDING',
      requestId: existing.id,
      approvals: existing.approvedBy.length,
      required: existing.requiredApprovals,
    };
  }

  const request = await db.approvalRequest.create({
    data: {
      kind: 'TAX_RULE_CHANGE',
      entityType: 'TaxRule',
      entityId: ruleId,
      payload: { ...edit } as Prisma.InputJsonValue,
      requestedBy: admin.id,
      approvedBy: [admin.id],
      requiredApprovals: REQUIRED_APPROVALS,
      expiresAt: new Date(now.getTime() + REQUEST_WINDOW_HOURS * 3600 * 1000),
    },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'TaxRule',
      entityId: ruleId,
      action: 'tax.rule_change_requested',
      before: {
        taxableBase: rule.taxableBase,
        ratePct: rule.ratePct?.toString() ?? null,
        active: rule.active,
      },
      after: { ...edit } as Prisma.InputJsonValue,
      ip,
      createdAt: now,
    },
  });

  return {
    ok: true,
    state: 'PENDING',
    requestId: request.id,
    approvals: 1,
    required: REQUIRED_APPROVALS,
  };
}

/** الموافقة الثانية تُنفّذ — **ولا يوافق الطالب على نفسه**. */
export async function approveRuleChange(
  admin: AdminUser,
  requestId: string,
  ip: string | null,
  now: Date = new Date(),
): Promise<RuleChangeResult> {
  const request = await db.approvalRequest.findUnique({ where: { id: requestId } });
  if (request === null || request.kind !== 'TAX_RULE_CHANGE') {
    return { ok: false, reason: 'NOT_FOUND' };
  }
  if (request.status !== 'PENDING') return { ok: false, reason: 'NOT_FOUND' };
  if (request.approvedBy.includes(admin.id)) return { ok: false, reason: 'SELF_APPROVAL' };

  if (request.expiresAt.getTime() <= now.getTime()) {
    await db.approvalRequest.update({ where: { id: requestId }, data: { status: 'EXPIRED' } });
    return { ok: false, reason: 'NOT_FOUND' };
  }

  const edit = request.payload as RuleEdit;

  await db.$transaction(async (tx) => {
    await tx.taxRule.update({
      where: { id: request.entityId },
      data: {
        taxableBase: edit.taxableBase,
        ratePct: edit.ratePct === null ? null : new Prisma.Decimal(edit.ratePct),
        invoiceIssuer: edit.invoiceIssuer,
        active: edit.active,
        note: edit.note,
        updatedBy: admin.id,
      },
    });
    await tx.approvalRequest.update({
      where: { id: requestId },
      data: {
        approvedBy: [...request.approvedBy, admin.id],
        status: 'EXECUTED',
        executedAt: now,
      },
    });
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'TaxRule',
      entityId: request.entityId,
      action: 'tax.rule_changed',
      before: { requestedBy: request.requestedBy },
      after: { ...edit, approvedBy: [...request.approvedBy, admin.id] } as Prisma.InputJsonValue,
      ip,
      createdAt: now,
    },
  });

  return { ok: true, state: 'APPLIED' };
}

export type MarginGrantResult =
  | { ok: true; approved: boolean }
  | { ok: false; reason: 'NOT_FOUND' | 'NOT_REGISTERED' | 'REF_REQUIRED' };

/**
 * ═══ منح هامش الربح ═══
 *
 * **بمستند من الهيئة، ولا يُطبَّق تلقائيًّا أبدًا.** ويتبع التسجيل لا
 * صفة المعرض — فردٌ مسجَّل يستحقّه.
 *
 * والمرجع إلزاميّ عند المنح: اعتمادٌ بلا مستندٍ يُشار إليه لا يُدافَع
 * عنه أمام مدقّق، وحقلٌ اختياريّ هنا يُترك فارغًا في أوّل يوم ضغط.
 */
export async function grantMarginScheme(
  admin: AdminUser,
  userId: string,
  input: { approved: boolean; ref: string | null },
  ip: string | null,
  now: Date = new Date(),
): Promise<MarginGrantResult> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (user === null) return { ok: false, reason: 'NOT_FOUND' };

  if (input.approved) {
    if (!isVatRegistered(user)) return { ok: false, reason: 'NOT_REGISTERED' };
    if (input.ref === null || input.ref.trim() === '') return { ok: false, reason: 'REF_REQUIRED' };
  }

  await db.user.update({
    where: { id: userId },
    data: {
      marginSchemeApproved: input.approved,
      marginSchemeRef: input.approved ? input.ref : null,
      marginSchemeBy: input.approved ? admin.id : null,
      marginSchemeAt: input.approved ? now : null,
    },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'User',
      entityId: userId,
      action: input.approved ? 'tax.margin_granted' : 'tax.margin_revoked',
      before: { approved: user.marginSchemeApproved, ref: user.marginSchemeRef },
      after: { approved: input.approved, ref: input.approved ? input.ref : null },
      ip,
      createdAt: now,
    },
  });

  return { ok: true, approved: input.approved };
}
