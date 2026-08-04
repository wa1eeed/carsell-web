import { db } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type { AdminUser } from '@/generated/prisma/client';
import type { FeeBearer, IntegrationEnv, PaymentPurpose } from '@/generated/prisma/enums';
import {
  PURPOSE_REQUIREMENTS,
  eligibility,
  readCapabilities,
  type GatewayCapabilities,
  type HoldShortfall,
} from '@/lib/payments/gateway';
import { effectiveEnvironment } from './integration-env';

/**
 * A20 — إعدادات الدفع والتوجيه (قرار ٣٤).
 *
 * **لكل غرض بوابته**، والسوبر أدمن يبدّل بلا نشر. وأربع قواعد تحكم
 * التبديل، أهمّها الأولى: المعاملات الجارية تبقى على بوابتها، والحجز
 * يُفرَج **من حيث أُنشئ** — لا نقل أرصدة بين بوابتين أبدًا.
 */

export type GatewayRow = {
  key: string;
  nameAr: string;
  nameEn: string;
  status: string;
  capabilities: GatewayCapabilities;
};

export type RouteRow = {
  purpose: PaymentPurpose;
  gatewayKey: string;
  gatewayNameAr: string | null;
  /** المخزَّنة — وقد لا تكون المستعملة. */
  storedEnv: IntegrationEnv;
  activeEnv: IntegrationEnv;
  enabled: boolean;
  /** **مُسوّى هذا الشهر** — `settle` مؤكَّد خلال الشهر (قرار ٣٥). */
  settledThisMonth: string;
  /** **محجوز الآن** — `hold` قائم لم يُسوَّ ولم يُلغَ. */
  heldNow: string;
  /** معاملات جارية تمنع التعطيل (قاعدة ٣). */
  inFlight: number;
  shortfall: HoldShortfall | null;
};

const HELD_STATUSES = ['PENDING', 'HELD', 'REQUIRES_ACTION'] as const;
const SETTLED_STATUSES = ['SETTLED', 'PARTIALLY_SETTLED'] as const;

export async function listGateways(): Promise<GatewayRow[]> {
  const rows = await db.paymentGateway.findMany({ orderBy: [{ sort: 'asc' }, { key: 'asc' }] });
  return rows.map((row) => ({
    key: row.key,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    status: row.status,
    capabilities: readCapabilities(row.capabilities),
  }));
}

export async function listRoutes(now: Date = new Date()): Promise<RouteRow[]> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [routes, gateways, settled, held, inFlight] = await Promise.all([
    db.paymentRoute.findMany(),
    db.paymentGateway.findMany(),
    db.payment.groupBy({
      by: ['purpose'],
      where: { status: { in: [...SETTLED_STATUSES] }, settledAt: { gte: monthStart } },
      _sum: { settledAmount: true },
    }),
    db.payment.groupBy({
      by: ['purpose'],
      where: { status: { in: [...HELD_STATUSES] } },
      _sum: { amount: true },
    }),
    db.payment.groupBy({
      by: ['purpose'],
      where: { status: { in: [...HELD_STATUSES] } },
      _count: { _all: true },
    }),
  ]);

  return (Object.keys(PURPOSE_REQUIREMENTS) as PaymentPurpose[]).map((purpose) => {
    const route = routes.find((entry) => entry.purpose === purpose);
    const gateway = gateways.find((entry) => entry.key === route?.gatewayKey);
    const capabilities = readCapabilities(gateway?.capabilities ?? null);
    const check = eligibility(purpose, capabilities);

    return {
      purpose,
      gatewayKey: route?.gatewayKey ?? '',
      // اسم البوابة بيانٌ من قاعدة البيانات — و`null` يعني «معطّل» تقوله الشاشة
      gatewayNameAr: gateway?.nameAr ?? null,
      storedEnv: route?.environment ?? 'TEST',
      activeEnv: effectiveEnvironment(route?.environment ?? 'TEST'),
      enabled: route?.enabled ?? false,
      settledThisMonth: (
        settled.find((row) => row.purpose === purpose)?._sum.settledAmount ?? 0
      ).toString(),
      heldNow: (held.find((row) => row.purpose === purpose)?._sum.amount ?? 0).toString(),
      inFlight: inFlight.find((row) => row.purpose === purpose)?._count._all ?? 0,
      shortfall: check.eligible ? check.shortfall : null,
    };
  });
}

export type GatewayChoice = {
  key: string;
  nameAr: string;
  capabilities: GatewayCapabilities;
  shortfall: HoldShortfall | null;
};

/**
 * البوابات الصالحة لغرضٍ ما.
 *
 * **الناقصة قدرةً لا تظهر أصلًا** — لا تُعرض ثم تُرفض. وعرضُ خيارٍ
 * يُرفض عند الضغط يعلّم المشغّل أن القائمة غير موثوقة.
 */
export async function choicesFor(purpose: PaymentPurpose): Promise<GatewayChoice[]> {
  const gateways = await db.paymentGateway.findMany({
    where: { status: { not: 'INACTIVE' } },
    orderBy: [{ sort: 'asc' }, { key: 'asc' }],
  });

  const choices: GatewayChoice[] = [];
  for (const gateway of gateways) {
    const capabilities = readCapabilities(gateway.capabilities);
    const check = eligibility(purpose, capabilities);
    if (!check.eligible) continue;
    choices.push({
      key: gateway.key,
      nameAr: gateway.nameAr,
      capabilities,
      shortfall: check.shortfall,
    });
  }
  return choices;
}

export type SwitchResult =
  | { ok: true; state: 'PENDING' }
  | {
      ok: false;
      reason: 'ROUTE_NOT_FOUND' | 'GATEWAY_NOT_FOUND' | 'NOT_ELIGIBLE' | 'REASON_REQUIRED'
        | 'ALREADY_PENDING' | 'HAS_IN_FLIGHT' | 'ENV_FORBIDDEN';
    };

export const SWITCH_WINDOW_HOURS = 48;

/**
 * طلب تبديل بوابة غرض — **بعضوين** (قاعدة ٤ من قرار ٣٤).
 *
 * و`reason` إلزاميّ ونصّ حرّ: بعد سنة لن يتذكّر أحد لماذا تغيّر،
 * **والقرار بلا سببه يُعاد نقضه** (قرار ٣٦).
 */
export async function requestRouteSwitch(
  admin: AdminUser,
  input: {
    purpose: PaymentPurpose;
    toGatewayKey: string;
    toEnvironment: IntegrationEnv;
    reason: string;
  },
  ip: string | null,
  now: Date = new Date(),
): Promise<SwitchResult> {
  if (input.reason.trim().length < 10) return { ok: false, reason: 'REASON_REQUIRED' };

  const gateway = await db.paymentGateway.findUnique({ where: { key: input.toGatewayKey } });
  if (gateway === null) return { ok: false, reason: 'GATEWAY_NOT_FOUND' };

  // الناقصة قدرةً لا تُقبل ولو أُرسلت مباشرةً — الشاشة تُخفي والخادم يمنع
  const check = eligibility(input.purpose, readCapabilities(gateway.capabilities));
  if (!check.eligible) return { ok: false, reason: 'NOT_ELIGIBLE' };

  // بيئة الإنتاج لا تُطلب من خارجها — نفس قيد المفاتيح (قرار ٣٣)
  if (input.toEnvironment === 'LIVE' && effectiveEnvironment('LIVE') !== 'LIVE') {
    return { ok: false, reason: 'ENV_FORBIDDEN' };
  }

  const existing = await db.approvalRequest.findFirst({
    where: {
      kind: 'PAYMENT_ROUTE',
      entityType: 'PaymentRoute',
      entityId: input.purpose,
      status: 'PENDING',
    },
  });
  if (existing !== null) return { ok: false, reason: 'ALREADY_PENDING' };

  const current = await db.paymentRoute.findUnique({ where: { purpose: input.purpose } });

  await db.approvalRequest.create({
    data: {
      kind: 'PAYMENT_ROUTE',
      entityType: 'PaymentRoute',
      entityId: input.purpose,
      payload: {
        toGatewayKey: input.toGatewayKey,
        toEnvironment: input.toEnvironment,
        fromGatewayKey: current?.gatewayKey ?? null,
        fromEnvironment: current?.environment ?? null,
        reason: input.reason.trim(),
      },
      requestedBy: admin.id,
      approvedBy: [],
      requiredApprovals: 2,
      status: 'PENDING',
      expiresAt: new Date(now.getTime() + SWITCH_WINDOW_HOURS * 3600 * 1000),
    },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'PaymentRoute',
      entityId: input.purpose,
      action: 'route.switch_requested',
      before: { gatewayKey: current?.gatewayKey ?? null },
      after: { toGatewayKey: input.toGatewayKey, reason: input.reason.trim() },
      ip,
      createdAt: now,
    },
  });

  return { ok: true, state: 'PENDING' };
}

/** طلب معلَّق على غرض — تقرؤه الشاشة لتعرض «ينتظر عضوًا ثانيًا». */
export type PendingSwitch = {
  id: string;
  purpose: PaymentPurpose;
  toGatewayKey: string;
  toEnvironment: IntegrationEnv;
  fromGatewayKey: string | null;
  reason: string;
  requestedBy: string;
  requestedByName: string | null;
  approvals: number;
  required: number;
  expiresAt: Date;
};

/**
 * الطلبات المعلَّقة — **والشاشة التي لا تعرضها تخفي ما تنتظره.**
 *
 * كانت الشاشة تقول «ينتظر موافقة عضو ثانٍ» ثم لا تعرض شيئًا ينتظر،
 * فلا يعرف العضو الثاني أن عليه شيئًا ولا يجد أين يوافق.
 */
export async function pendingSwitches(now: Date = new Date()): Promise<PendingSwitch[]> {
  const rows = await db.approvalRequest.findMany({
    where: {
      kind: 'PAYMENT_ROUTE',
      entityType: 'PaymentRoute',
      status: 'PENDING',
      expiresAt: { gt: now },
    },
    // لا `createdAt` في الجدول — والمهلة واحدة فترتيبها ترتيب الطلب
    orderBy: { expiresAt: 'desc' },
  });

  const actors = await db.adminUser.findMany({
    where: { id: { in: rows.map((row) => row.requestedBy) } },
    select: { id: true, name: true },
  });

  return rows.map((row) => {
    const payload = row.payload as {
      toGatewayKey?: string;
      toEnvironment?: IntegrationEnv;
      fromGatewayKey?: string | null;
      reason?: string;
    };
    return {
      id: row.id,
      purpose: row.entityId as PaymentPurpose,
      toGatewayKey: payload.toGatewayKey ?? '',
      toEnvironment: payload.toEnvironment ?? 'TEST',
      fromGatewayKey: payload.fromGatewayKey ?? null,
      reason: payload.reason ?? '',
      requestedBy: row.requestedBy,
      requestedByName: actors.find((actor) => actor.id === row.requestedBy)?.name ?? null,
      // الطالب يُحسب واحدًا — كما في التدوير، فلا نصابان مختلفان
      approvals: row.approvedBy.length + 1,
      required: row.requiredApprovals,
      expiresAt: row.expiresAt,
    };
  });
}

export type ApproveSwitchResult =
  | { ok: true; state: 'PENDING' | 'APPLIED'; approvals: number; required: number }
  | { ok: false; reason: 'NOT_FOUND' | 'NOT_PENDING' | 'EXPIRED' | 'SELF_APPROVAL' | 'GATEWAY_NOT_FOUND' };

/**
 * ═══ الموافقة الثانية على تبديل البوابة — ولم تكن موجودة ═══
 *
 * `requestRouteSwitch` كان يكتب الطلب بـ`requiredApprovals: 2`، والشاشة
 * تقول «ينتظر موافقة عضو ثانٍ» — **ولا دالّة موافقةٍ في الملف كلّه.**
 * فكان كل طلبٍ يبقى معلَّقًا حتى ينقضي، ولا تُبدَّل بوابةُ غرضٍ أبدًا.
 *
 * ووعدٌ في الشاشة لا يقابله مسار ليس نقصَ ميزة: هو نظامٌ يقول إنه فعل
 * ما لم يفعله، والمشغّل ينتظر موافقةً لا موضع لها.
 *
 * **والطالب لا يوافق على طلبه** — وإلّا صار «عضوان» عضوًا يضغط مرّتين.
 */
export async function approveRouteSwitch(
  admin: AdminUser,
  requestId: string,
  ip: string | null,
  now: Date = new Date(),
): Promise<ApproveSwitchResult> {
  return db.$transaction(async (tx): Promise<ApproveSwitchResult> => {
    const request = await tx.approvalRequest.findUnique({ where: { id: requestId } });
    if (request === null || request.kind !== 'PAYMENT_ROUTE') {
      return { ok: false, reason: 'NOT_FOUND' };
    }
    if (request.status !== 'PENDING') return { ok: false, reason: 'NOT_PENDING' };
    if (request.expiresAt.getTime() <= now.getTime()) {
      await tx.approvalRequest.update({ where: { id: requestId }, data: { status: 'EXPIRED' } });
      return { ok: false, reason: 'EXPIRED' };
    }
    if (request.requestedBy === admin.id || request.approvedBy.includes(admin.id)) {
      return { ok: false, reason: 'SELF_APPROVAL' };
    }

    const approvals = [...request.approvedBy, admin.id];
    const total = approvals.length + 1;

    if (total < request.requiredApprovals) {
      await tx.approvalRequest.update({
        where: { id: requestId },
        data: { approvedBy: approvals },
      });
      return { ok: true, state: 'PENDING', approvals: total, required: request.requiredApprovals };
    }

    const payload = request.payload as {
      toGatewayKey?: string;
      toEnvironment?: IntegrationEnv;
    };
    const toGatewayKey = payload.toGatewayKey ?? '';
    const purpose = request.entityId as PaymentPurpose;

    /**
     * **الأهلية تُعاد قراءتها عند التنفيذ لا عند الطلب وحده.** بين
     * الطلب والموافقة قد تُسحب قدرةٌ من البوابة، فتوجيهٌ يُطبَّق على
     * بوابةٍ فقدت `hold` يقبل طلبات لا يستطيع حجزها.
     */
    const gateway = await tx.paymentGateway.findUnique({ where: { key: toGatewayKey } });
    if (gateway === null) return { ok: false, reason: 'GATEWAY_NOT_FOUND' };
    if (!eligibility(purpose, readCapabilities(gateway.capabilities)).eligible) {
      return { ok: false, reason: 'GATEWAY_NOT_FOUND' };
    }

    const before = await tx.paymentRoute.findUnique({ where: { purpose } });

    /**
     * **القائم يبقى على بوابته** (قاعدة ١). التبديل يغيّر وجهة الجديد
     * وحده، والحجز المفتوح يُفرَج من حيث أُنشئ — ولذلك لا يُلمس هنا
     * أيّ `Payment`، ولا تُنقل قيمة بين بوابتين.
     */
    await tx.paymentRoute.update({
      where: { purpose },
      data: { gatewayKey: toGatewayKey, environment: payload.toEnvironment ?? 'TEST' },
    });

    await tx.approvalRequest.update({
      where: { id: requestId },
      data: { approvedBy: approvals, status: 'APPROVED', executedAt: now },
    });

    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        actorType: 'admin',
        entity: 'PaymentRoute',
        entityId: purpose,
        action: 'route.switched',
        before: {
          gatewayKey: before?.gatewayKey ?? null,
          environment: before?.environment ?? null,
        },
        after: { gatewayKey: toGatewayKey, environment: payload.toEnvironment ?? 'TEST' },
        ip,
        createdAt: now,
      },
    });

    return { ok: true, state: 'APPLIED', approvals: total, required: request.requiredApprovals };
  });
}

/**
 * تعطيل غرض — **يمنع الجديد ولا يمسّ القائم** (قاعدة ٣).
 * وغرضٌ له معاملات جارية لا يُعطَّل: القائم يبقى حتى ينتهي.
 */
export async function setRouteEnabled(
  admin: AdminUser,
  purpose: PaymentPurpose,
  enabled: boolean,
  ip: string | null,
  now: Date = new Date(),
): Promise<SwitchResult> {
  const route = await db.paymentRoute.findUnique({ where: { purpose } });
  if (route === null) return { ok: false, reason: 'ROUTE_NOT_FOUND' };

  if (!enabled) {
    const inFlight = await db.payment.count({
      where: { purpose, status: { in: [...HELD_STATUSES] } },
    });
    if (inFlight > 0) return { ok: false, reason: 'HAS_IN_FLIGHT' };
  }

  await db.paymentRoute.update({ where: { purpose }, data: { enabled, updatedBy: admin.id } });
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'PaymentRoute',
      entityId: purpose,
      action: enabled ? 'route.enabled' : 'route.disabled',
      before: { enabled: route.enabled },
      after: { enabled },
      ip,
      createdAt: now,
    },
  });

  return { ok: true, state: 'PENDING' };
}

export const EXPIRY_ALERT_HOURS = 48;

export type ExpiringHold = {
  paymentId: string;
  purpose: PaymentPurpose;
  gatewayKey: string;
  amount: string;
  orderRef: string | null;
  heldAt: string;
  expiresAt: string;
  hoursLeft: number;
};

/**
 * حجوزات تقترب من الانقضاء ولم تُسوَّ — **تنبيهٌ قبل ٤٨ ساعة**.
 *
 * حجزٌ ينقضي صامتًا يعني أن المال عاد للمشتري والمركبة عند البائع
 * والطلب يظنّ نفسه مضمونًا. وهذه أسوأ حال ممكنة: لا أحد يعلم أن
 * الضمان انتهى، والثلاثة أطراف يتصرّفون على أنه قائم.
 *
 * والمدّة تُقرأ من **قدرات بوابة المعاملة نفسها** لا من الإعداد الجاري:
 * الحجز أُنشئ ببوابةٍ قد تكون بُدِّلت بعده.
 */
export async function expiringHolds(now: Date = new Date()): Promise<ExpiringHold[]> {
  const [payments, gateways] = await Promise.all([
    db.payment.findMany({
      where: { status: 'HELD', heldAt: { not: null } },
      select: {
        id: true, purpose: true, gatewayKey: true, amount: true, heldAt: true,
        order: { select: { ref: true } },
      },
    }),
    db.paymentGateway.findMany(),
  ]);

  const out: ExpiringHold[] = [];
  for (const payment of payments) {
    if (payment.heldAt === null) continue;
    const gateway = gateways.find((entry) => entry.key === payment.gatewayKey);
    const maxDays = readCapabilities(gateway?.capabilities ?? null).maxHoldDays;
    if (maxDays <= 0) continue;

    const expiresAt = new Date(payment.heldAt.getTime() + maxDays * 86_400_000);
    const hoursLeft = Math.floor((expiresAt.getTime() - now.getTime()) / 3_600_000);
    // المنقضي فعلًا يبقى في القائمة: السكوت عنه بعد فواته أسوأ من التنبيه قبله
    if (hoursLeft > EXPIRY_ALERT_HOURS) continue;

    out.push({
      paymentId: payment.id,
      purpose: payment.purpose,
      gatewayKey: payment.gatewayKey,
      amount: payment.amount.toString(),
      orderRef: payment.order?.ref ?? null,
      heldAt: payment.heldAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      hoursLeft,
    });
  }

  return out.sort((a, b) => a.hoursLeft - b.hoursLeft);
}

/**
 * ═══ سياسة رسوم المعالجة ═══
 *
 * وموضعها هنا لا في إعدادٍ عامّ: هي **قرارُ تسعيرٍ يرافق البوابات**،
 * والمشغّل الذي يبدّل بوابةً هو من يراجع ما يُحمَّل مقابلها.
 *
 * وهي غير `capabilities.feePct`: تلك ما تأخذه البوابة منّا (تكلفتنا)،
 * وهذه ما نأخذه نحن (سياستنا). ولا تُشتقّ إحداهما من الأخرى — فتغييرُ
 * عقدٍ مع مزوّد لا يغيّر ما يستلمه البائعون صمتًا.
 */
export type ProcessingFeeRow = {
  enabled: boolean;
  bearer: FeeBearer;
  pct: string;
  fixed: string;
};

export async function getProcessingFee(): Promise<ProcessingFeeRow> {
  const row = await db.platformSetting.findUnique({ where: { id: 'default' } });
  return {
    enabled: row?.processingFeeEnabled ?? false,
    bearer: row?.processingFeeBearer ?? 'SELLER',
    pct: (row?.processingFeePct ?? new Prisma.Decimal(0)).toString(),
    fixed: (row?.processingFeeFixed ?? new Prisma.Decimal(0)).toString(),
  };
}

export type ProcessingFeeResult =
  | { ok: true; row: ProcessingFeeRow; openOrders: number }
  | { ok: false; reason: 'INVALID' };

/**
 * الحفظ **لا يمسّ طلبًا قائمًا** — `Order.processingFee` لقطةٌ وقت
 * الإنشاء، والعدد المُعاد يُري المشغّل ما بقي على سياسته القديمة قبل أن
 * يسأل عنه.
 */
export async function setProcessingFee(
  admin: AdminUser,
  input: { enabled: boolean; bearer: FeeBearer; pct: number; fixed: number },
  ip: string | null,
  now: Date = new Date(),
): Promise<ProcessingFeeResult> {
  const sane =
    Number.isFinite(input.pct) &&
    Number.isFinite(input.fixed) &&
    input.pct >= 0 &&
    input.pct <= 100 &&
    input.fixed >= 0;
  if (!sane) return { ok: false, reason: 'INVALID' };

  const before = await getProcessingFee();

  await db.platformSetting.update({
    where: { id: 'default' },
    data: {
      processingFeeEnabled: input.enabled,
      processingFeeBearer: input.bearer,
      processingFeePct: new Prisma.Decimal(input.pct),
      processingFeeFixed: new Prisma.Decimal(input.fixed),
    },
  });

  const openOrders = await db.order.count({ where: { status: 'ACTIVE' } });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'PlatformSetting',
      entityId: 'default',
      action: 'payments.processing_fee_changed',
      before: { ...before },
      after: { ...input, openOrders },
      ip,
      createdAt: now,
    },
  });

  return { ok: true, row: await getProcessingFee(), openOrders };
}
