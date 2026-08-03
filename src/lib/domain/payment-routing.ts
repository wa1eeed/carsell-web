import { db } from '@/lib/db';
import type { AdminUser } from '@/generated/prisma/client';
import type { IntegrationEnv, PaymentPurpose } from '@/generated/prisma/enums';
import {
  PURPOSE_REQUIREMENTS,
  eligibility,
  readCapabilities,
  type GatewayCapabilities,
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
  labelAr: string;
  gatewayKey: string;
  gatewayNameAr: string;
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
  warning: string | null;
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
      labelAr: PURPOSE_REQUIREMENTS[purpose].labelAr,
      gatewayKey: route?.gatewayKey ?? '',
      gatewayNameAr: gateway?.nameAr ?? 'معطّل',
      storedEnv: route?.environment ?? 'TEST',
      activeEnv: effectiveEnvironment(route?.environment ?? 'TEST'),
      enabled: route?.enabled ?? false,
      settledThisMonth: (
        settled.find((row) => row.purpose === purpose)?._sum.settledAmount ?? 0
      ).toString(),
      heldNow: (held.find((row) => row.purpose === purpose)?._sum.amount ?? 0).toString(),
      inFlight: inFlight.find((row) => row.purpose === purpose)?._count._all ?? 0,
      warning: check.eligible ? check.warning : null,
    };
  });
}

export type GatewayChoice = {
  key: string;
  nameAr: string;
  capabilities: GatewayCapabilities;
  warning: string | null;
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
      warning: check.warning,
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
