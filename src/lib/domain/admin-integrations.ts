import { db } from '@/lib/db';
import type { AdminUser } from '@/generated/prisma/client';
import type { IntegrationCategory, IntegrationEnv } from '@/generated/prisma/enums';
import { encryptSecret, secretHint } from '@/lib/crypto/secrets';
import { effectiveEnvironment, environmentIsForced } from './integration-env';

/**
 * A11 — التكاملات ومفاتيح الربط.
 *
 * ═══ معيار القبول ═══ **المفاتيح مشفّرة ولا تُعرض، والتدوير بموافقة
 * عضوين.**
 * ═══ قرار ٣٣ ═══ **بيئتان منفصلتان، وstaging مقيَّد بـ`test` في الكود.**
 *
 * وأربع قواعد تُنفّذ ذلك:
 *   ١. `secretsEncrypted` نصّ مشفَّر بـAES-256-GCM، ولا دالّة هنا تفكّه.
 *   ٢. ما يُعرض تلميحٌ **مخزَّن نصًّا عاديًا** وقت الكتابة.
 *   ٣. التدوير طلبُ موافقة: من يطلبه لا يعتمده.
 *   ٤. لكل بيئة صفّها — فتجربةُ دفعٍ لا تكتب فوق مفتاح الإنتاج.
 */

/**
 * الفئات الأربع كما في المخطّط — لا كما أتذكّرها.
 * والنوع يجعل الاسم الخاطئ خطأَ ترجمة لا عنوانًا خامًا على الشاشة.
 */
const CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  IDENTITY: 'الهوية والتحقّق',
  PAYMENT: 'المدفوعات والضمان',
  GOVERNMENT: 'البيانات الحكومية والخدمات',
  INFRASTRUCTURE: 'الاتصال والبنية',
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category as IntegrationCategory] ?? category;
}

export type CredentialView = {
  env: IntegrationEnv;
  hints: Record<string, string>;
  configured: boolean;
  updatedAt: string | null;
};

export type IntegrationRow = {
  key: string;
  nameAr: string;
  provider: string;
  category: string;
  status: string;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  failureBehavior: string;
  publicConfig: Record<string, string>;
  /** البيئة المخزَّنة — قد لا تكون المستعملة. */
  storedEnv: IntegrationEnv;
  /** المستعملة فعلًا — وخارج الإنتاج هي `TEST` دائمًا. */
  activeEnv: IntegrationEnv;
  /** المخزَّنة `LIVE` والمستعملة `TEST` — تُقال للمحرّر لا تُخفى عنه. */
  envForced: boolean;
  credentials: CredentialView[];
  pendingRotation: {
    id: string;
    env: IntegrationEnv;
    requestedBy: string;
    approvals: number;
    required: number;
  } | null;
  pendingEnvSwitch: { id: string; to: IntegrationEnv; requestedBy: string } | null;
};

type PublicConfig = Record<string, unknown>;

function readConfig(value: unknown): PublicConfig {
  return value !== null && typeof value === 'object' ? (value as PublicConfig) : {};
}

function readHints(value: unknown): Record<string, string> {
  if (value === null || typeof value !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [name, hint] of Object.entries(value)) out[name] = String(hint);
  return out;
}

export async function listIntegrations(): Promise<IntegrationRow[]> {
  const [rows, pending] = await Promise.all([
    db.integration.findMany({
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
      include: { credentials: true },
    }),
    db.approvalRequest.findMany({
      where: {
        kind: { in: ['KEY_ROTATION', 'INTEGRATION_ENV'] },
        status: 'PENDING',
        entityType: 'Integration',
      },
    }),
  ]);

  return rows.map((row) => {
    const config = readConfig(row.configPublic);
    const rotation = pending.find(
      (request) => request.entityId === row.key && request.kind === 'KEY_ROTATION',
    );
    const envSwitch = pending.find(
      (request) => request.entityId === row.key && request.kind === 'INTEGRATION_ENV',
    );

    const publicConfig: Record<string, string> = {};
    for (const [name, value] of Object.entries(config)) {
      if (name === 'hints') continue;
      publicConfig[name] = String(value);
    }

    const credentials: CredentialView[] = (['TEST', 'LIVE'] as const).map((env) => {
      const stored = row.credentials.find((entry) => entry.env === env);
      return {
        env,
        hints: readHints(stored?.hints ?? null),
        configured: stored?.secretsEncrypted != null && stored.secretsEncrypted !== '',
        updatedAt: stored?.updatedAt.toISOString() ?? null,
      };
    });

    return {
      key: row.key,
      nameAr: row.nameAr,
      provider: row.provider,
      category: row.category,
      status: row.status,
      lastCheckAt: row.lastCheckAt?.toISOString() ?? null,
      lastCheckOk: row.lastCheckOk,
      failureBehavior: row.failureBehavior,
      publicConfig,
      storedEnv: row.activeEnv,
      activeEnv: effectiveEnvironment(row.activeEnv),
      envForced: environmentIsForced(row.activeEnv),
      credentials,
      pendingRotation:
        rotation === undefined
          ? null
          : {
              id: rotation.id,
              env: ((rotation.payload as { env?: IntegrationEnv } | null)?.env ?? 'TEST'),
              requestedBy: rotation.requestedBy,
              approvals: rotation.approvedBy.length + 1,
              required: rotation.requiredApprovals,
            },
      pendingEnvSwitch:
        envSwitch === undefined
          ? null
          : {
              id: envSwitch.id,
              to: ((envSwitch.payload as { to?: IntegrationEnv } | null)?.to ?? 'TEST'),
              requestedBy: envSwitch.requestedBy,
            },
    };
  });
}

/**
 * السرّ المستعمل الآن — **المدخل الوحيد لأي مسار تشغيلي**.
 *
 * ولا تأخذ البيئة وسيطًا: لو أخذتها لصار كل مستدعٍ قادرًا على طلب
 * `LIVE` من staging، والقيد الذي في الكود يصير قيدًا في آداب الاستدعاء.
 */
export async function activeSecret(key: string): Promise<string | null> {
  const integration = await db.integration.findUnique({
    where: { key },
    include: { credentials: true },
  });
  if (integration === null) return null;

  const env = effectiveEnvironment(integration.activeEnv);
  const credential = integration.credentials.find((entry) => entry.env === env);
  return credential?.secretsEncrypted ?? null;
}

export const ROTATION_WINDOW_HOURS = 48;

export type RotationResult =
  | { ok: true; state: 'PENDING'; approvals: number; required: number }
  | { ok: true; state: 'EXECUTED' }
  | {
      ok: false;
      reason:
        | 'NOT_FOUND'
        | 'ALREADY_PENDING'
        | 'SELF_APPROVAL'
        | 'NOT_PENDING'
        | 'EXPIRED'
        | 'ENV_FORBIDDEN';
    };

/**
 * طلب تدوير مفتاح في بيئة بعينها — **الخطوة الأولى من اثنتين**.
 *
 * والسرّ الجديد يُشفَّر ويبقى في الطلب لا في التكامل: كتابته الآن تجعل
 * التدوير واقعًا قبل موافقة أحد، والموافقة بعده توقيعًا على أمر منفَّذ.
 */
export async function requestRotation(
  admin: AdminUser,
  key: string,
  env: IntegrationEnv,
  secrets: Record<string, string>,
  ip: string | null,
  now = new Date(),
): Promise<RotationResult> {
  const integration = await db.integration.findUnique({ where: { key } });
  if (integration === null) return { ok: false, reason: 'NOT_FOUND' };

  /**
   * **مفاتيح الإنتاج لا تُكتب من خارج الإنتاج.** لوحةُ staging تصل
   * قاعدةَ staging، لكن مفتاحًا حيًّا يُكتب فيها هو مفتاح حيّ في ملف
   * نسخ احتياطي أقلّ حراسة.
   */
  if (env === 'LIVE' && effectiveEnvironment('LIVE') !== 'LIVE') {
    return { ok: false, reason: 'ENV_FORBIDDEN' };
  }

  const existing = await db.approvalRequest.findFirst({
    where: { kind: 'KEY_ROTATION', entityType: 'Integration', entityId: key, status: 'PENDING' },
  });
  if (existing !== null) return { ok: false, reason: 'ALREADY_PENDING' };

  const hints: Record<string, string> = {};
  for (const [name, value] of Object.entries(secrets)) hints[name] = secretHint(value);

  const request = await db.approvalRequest.create({
    data: {
      kind: 'KEY_ROTATION',
      entityType: 'Integration',
      entityId: key,
      payload: { env, encrypted: encryptSecret(JSON.stringify(secrets)), hints },
      requestedBy: admin.id,
      approvedBy: [],
      requiredApprovals: 2,
      status: 'PENDING',
      expiresAt: new Date(now.getTime() + ROTATION_WINDOW_HOURS * 3600 * 1000),
    },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'Integration',
      entityId: key,
      action: 'integration.rotation_requested',
      before: {},
      // التلميحات وحدها — لا السرّ ولا المشفَّر
      after: { requestId: request.id, env, hints },
      ip,
      createdAt: now,
    },
  });

  return { ok: true, state: 'PENDING', approvals: 1, required: 2 };
}

/**
 * موافقة على تدوير — وتنفيذُه عند اكتمال العدد.
 * **الطالب لا يوافق على طلبه**، وإلّا صار «عضوان» عضوًا يضغط مرّتين.
 */
export async function approveRotation(
  admin: AdminUser,
  requestId: string,
  ip: string | null,
  now = new Date(),
): Promise<RotationResult> {
  return db.$transaction(async (tx) => {
    const request = await tx.approvalRequest.findUnique({ where: { id: requestId } });
    if (request === null) return { ok: false, reason: 'NOT_FOUND' };
    if (request.status !== 'PENDING') return { ok: false, reason: 'NOT_PENDING' };
    if (request.expiresAt.getTime() <= now.getTime()) {
      await tx.approvalRequest.update({ where: { id: requestId }, data: { status: 'EXPIRED' } });
      return { ok: false, reason: 'EXPIRED' };
    }
    if (request.requestedBy === admin.id || request.approvedBy.includes(admin.id)) {
      return { ok: false, reason: 'SELF_APPROVAL' };
    }

    const approvals = [...request.approvedBy, admin.id];
    // الطالب يُحسب واحدًا، والموافق الثاني يُكمل النصاب
    const total = approvals.length + 1;

    if (total < request.requiredApprovals) {
      await tx.approvalRequest.update({ where: { id: requestId }, data: { approvedBy: approvals } });
      return { ok: true, state: 'PENDING', approvals: total, required: request.requiredApprovals };
    }

    const payload = request.payload as {
      env?: IntegrationEnv;
      encrypted?: string;
      hints?: Record<string, string>;
      to?: IntegrationEnv;
    };

    if (request.kind === 'INTEGRATION_ENV') {
      await tx.integration.update({
        where: { key: request.entityId },
        data: { activeEnv: payload.to ?? 'TEST' },
      });
    } else {
      const env = payload.env ?? 'TEST';
      await tx.integrationCredential.upsert({
        where: { integrationKey_env: { integrationKey: request.entityId, env } },
        create: {
          integrationKey: request.entityId,
          env,
          secretsEncrypted: payload.encrypted ?? null,
          hints: payload.hints ?? {},
        },
        update: { secretsEncrypted: payload.encrypted ?? null, hints: payload.hints ?? {} },
      });
    }

    await tx.approvalRequest.update({
      where: { id: requestId },
      data: { approvedBy: approvals, status: 'APPROVED', executedAt: now },
    });

    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        actorType: 'admin',
        entity: 'Integration',
        entityId: request.entityId,
        action: request.kind === 'INTEGRATION_ENV' ? 'integration.env_switched' : 'integration.rotated',
        before: {},
        after: {
          requestId,
          env: payload.env ?? payload.to ?? 'TEST',
          approvedBy: approvals,
          requestedBy: request.requestedBy,
        },
        ip,
        createdAt: now,
      },
    });

    return { ok: true, state: 'EXECUTED' };
  });
}

/**
 * ═══ قرار ٣٣ ═══ **تبديل البيئة يحتاج عضوين أيضًا.**
 *
 * وهو أخطر من التدوير لا أهون: تدويرٌ خاطئ يُعطّل تكاملًا، وتبديلٌ
 * خاطئ يُشغّله على أموال حقيقية بمفاتيح تجربة — أو العكس، فتمرّ
 * مدفوعات حقيقية على حساب اختبار ولا يصل شيء.
 */
export async function requestEnvSwitch(
  admin: AdminUser,
  key: string,
  to: IntegrationEnv,
  ip: string | null,
  now = new Date(),
): Promise<RotationResult> {
  const integration = await db.integration.findUnique({
    where: { key },
    include: { credentials: true },
  });
  if (integration === null) return { ok: false, reason: 'NOT_FOUND' };

  // خارج الإنتاج لا معنى للتبديل: القراءة مقيَّدة بـTEST في الكود
  if (!effectiveEnvironmentIsStored()) return { ok: false, reason: 'ENV_FORBIDDEN' };

  const existing = await db.approvalRequest.findFirst({
    where: { kind: 'INTEGRATION_ENV', entityType: 'Integration', entityId: key, status: 'PENDING' },
  });
  if (existing !== null) return { ok: false, reason: 'ALREADY_PENDING' };

  await db.approvalRequest.create({
    data: {
      kind: 'INTEGRATION_ENV',
      entityType: 'Integration',
      entityId: key,
      payload: { to },
      requestedBy: admin.id,
      approvedBy: [],
      requiredApprovals: 2,
      status: 'PENDING',
      expiresAt: new Date(now.getTime() + ROTATION_WINDOW_HOURS * 3600 * 1000),
    },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'Integration',
      entityId: key,
      action: 'integration.env_switch_requested',
      before: { activeEnv: integration.activeEnv },
      after: { to },
      ip,
      createdAt: now,
    },
  });

  return { ok: true, state: 'PENDING', approvals: 1, required: 2 };
}

function effectiveEnvironmentIsStored(): boolean {
  return effectiveEnvironment('LIVE') === 'LIVE';
}

/**
 * فحص الاتصال — يكتب نتيجته ولا يلمس السرّ، **ولا يدّعي نجاحًا**.
 * نتيجةٌ خضراء بلا اتّصال حقيقي أسوأ من غياب الفحص، لأنها تُطمئن.
 */
export async function checkConnection(
  admin: AdminUser,
  key: string,
  ip: string | null,
  now = new Date(),
): Promise<{ ok: boolean; result: 'NO_SECRET' | 'UNTESTED' }> {
  const secret = await activeSecret(key);
  const integration = await db.integration.findUnique({ where: { key } });
  if (integration === null) return { ok: false, result: 'NO_SECRET' };

  const configured = secret !== null && secret !== '';

  await db.integration.update({ where: { key }, data: { lastCheckAt: now, lastCheckOk: null } });
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'Integration',
      entityId: key,
      action: 'integration.checked',
      before: {},
      after: { configured, env: effectiveEnvironment(integration.activeEnv) },
      ip,
      createdAt: now,
    },
  });

  return { ok: true, result: configured ? 'UNTESTED' : 'NO_SECRET' };
}

export type IntegrationSummary = {
  connected: number;
  warning: number;
  inactive: number;
  pendingRotations: number;
  /** مخزَّنة `LIVE` وتعمل على `TEST` — حالٌ تُقال لا تُخفى. */
  forcedToTest: number;
};

export async function integrationSummary(): Promise<IntegrationSummary> {
  const [byStatus, rotations, live] = await Promise.all([
    db.integration.groupBy({ by: ['status'], _count: { _all: true } }),
    db.approvalRequest.count({
      where: {
        kind: { in: ['KEY_ROTATION', 'INTEGRATION_ENV'] },
        status: 'PENDING',
        entityType: 'Integration',
      },
    }),
    db.integration.count({ where: { activeEnv: 'LIVE' } }),
  ]);

  const of = (status: 'ACTIVE' | 'DEGRADED' | 'INACTIVE'): number =>
    byStatus.find((row) => row.status === status)?._count._all ?? 0;

  return {
    connected: of('ACTIVE'),
    warning: of('DEGRADED'),
    inactive: of('INACTIVE'),
    pendingRotations: rotations,
    forcedToTest: effectiveEnvironmentIsStored() ? 0 : live,
  };
}
