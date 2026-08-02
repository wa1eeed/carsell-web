import { db } from '@/lib/db';
import type { AdminUser } from '@/generated/prisma/client';
import type { IntegrationCategory } from '@/generated/prisma/enums';
import { encryptSecret, secretHint } from '@/lib/crypto/secrets';

/**
 * A11 — التكاملات ومفاتيح الربط.
 *
 * ═══ معيار القبول ═══ **المفاتيح مشفّرة ولا تُعرض، والتدوير بموافقة
 * عضوين.**
 *
 * وثلاث قواعد تُنفّذ ذلك:
 *   ١. `secretsEncrypted` نصّ مشفَّر بـAES-256-GCM، ولا دالّة هنا تفكّه.
 *   ٢. ما يُعرض تلميحٌ **مخزَّن نصًّا عاديًا** وقت الكتابة — فالعرض لا
 *      يمرّ بالتشفير أصلًا، ولو سُرِّبت حمولة الصفحة لما خرج معها سرّ.
 *   ٣. التدوير طلبُ موافقة: من يطلبه لا يعتمده، والتنفيذ عند الثاني.
 */

export type IntegrationRow = {
  key: string;
  nameAr: string;
  provider: string;
  category: string;
  status: string;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  /** ما يُفعَل حين يتعطّل — **معلن لكل تكامل** (ترميز A11). */
  failureBehavior: string;
  /** إعدادات غير سرّية: عنوان الويب هوك، المفتاح العام… */
  publicConfig: Record<string, string>;
  /** `sk_live_········` — مشتقّ وقت الكتابة، لا فكّ تشفير هنا. */
  secretHints: Record<string, string>;
  hasSecrets: boolean;
  /** تدويرٌ ينتظر موافقة ثانية. */
  pendingRotation: { id: string; requestedBy: string; approvals: number; required: number } | null;
};

/**
 * الفئات الأربع كما في المخطّط — لا كما أتذكّرها.
 *
 * أسماءٌ من عندي (`PAYMENTS` بجمعها، و`COMMUNICATION` التي لا وجود
 * لها) تمرّ من المترجم لأن المفتاح `string`، ثم تظهر عنوانًا خامًا
 * على الشاشة. والنوع أدناه يجعل الخطأ خطأَ ترجمة لا خطأَ عرض.
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

type PublicConfig = { hints?: Record<string, string> } & Record<string, unknown>;

function readConfig(value: unknown): PublicConfig {
  return value !== null && typeof value === 'object' ? (value as PublicConfig) : {};
}

export async function listIntegrations(): Promise<IntegrationRow[]> {
  const [rows, pending] = await Promise.all([
    db.integration.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] }),
    db.approvalRequest.findMany({
      where: { kind: 'KEY_ROTATION', status: 'PENDING', entityType: 'Integration' },
    }),
  ]);

  return rows.map((row) => {
    const config = readConfig(row.configPublic);
    const hints = config.hints ?? {};
    const rotation = pending.find((request) => request.entityId === row.key);

    // التلميحات تُستبعد من الإعدادات المعروضة كي لا تتكرّر في مكانين
    const publicConfig: Record<string, string> = {};
    for (const [name, value] of Object.entries(config)) {
      if (name === 'hints') continue;
      publicConfig[name] = String(value);
    }

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
      secretHints: hints,
      hasSecrets: row.secretsEncrypted !== null && row.secretsEncrypted !== '',
      pendingRotation:
        rotation === undefined
          ? null
          : {
              id: rotation.id,
              requestedBy: rotation.requestedBy,
              approvals: rotation.approvedBy.length,
              required: rotation.requiredApprovals,
            },
    };
  });
}

export const ROTATION_WINDOW_HOURS = 48;

export type RotationResult =
  | { ok: true; state: 'PENDING'; approvals: number; required: number }
  | { ok: true; state: 'EXECUTED' }
  | {
      ok: false;
      reason: 'NOT_FOUND' | 'ALREADY_PENDING' | 'SELF_APPROVAL' | 'NOT_PENDING' | 'EXPIRED';
    };

/**
 * طلب تدوير مفتاح — **الخطوة الأولى من اثنتين**.
 *
 * السرّ الجديد يُشفَّر ويُحفظ في الطلب لا في التكامل: لو حُفظ في
 * التكامل مباشرةً لصار التدوير واقعًا قبل موافقة أحد، والموافقة بعده
 * توقيعٌ على أمر منفَّذ.
 */
export async function requestRotation(
  admin: AdminUser,
  key: string,
  secrets: Record<string, string>,
  ip: string | null,
  now = new Date(),
): Promise<RotationResult> {
  const integration = await db.integration.findUnique({ where: { key } });
  if (integration === null) return { ok: false, reason: 'NOT_FOUND' };

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
      payload: { encrypted: encryptSecret(JSON.stringify(secrets)), hints },
      requestedBy: admin.id,
      // الطالب ليس معتمِدًا — والقائمة تبدأ فارغة
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
      after: { requestId: request.id, hints },
      ip,
      createdAt: now,
    },
  });

  return { ok: true, state: 'PENDING', approvals: 0, required: 2 };
}

/**
 * موافقة على تدوير — وتنفيذُه عند اكتمال العدد.
 *
 * **الطالب لا يوافق على طلبه.** ولولا ذلك لصار «عضوان» عضوًا واحدًا
 * يضغط مرّتين، والقاعدة كلّها زينة.
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
    // الطالب يُحسب واحدًا: هو من بدأ، والموافق الثاني يُكمل النصاب
    const total = approvals.length + 1;

    if (total < request.requiredApprovals) {
      await tx.approvalRequest.update({
        where: { id: requestId },
        data: { approvedBy: approvals },
      });
      return { ok: true, state: 'PENDING', approvals: total, required: request.requiredApprovals };
    }

    const payload = request.payload as { encrypted?: string; hints?: Record<string, string> };
    const config = readConfig(
      (await tx.integration.findUnique({ where: { key: request.entityId } }))?.configPublic,
    );

    await tx.integration.update({
      where: { key: request.entityId },
      data: {
        secretsEncrypted: payload.encrypted ?? null,
        configPublic: { ...config, hints: payload.hints ?? {} },
      },
    });

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
        action: 'integration.rotated',
        before: {},
        after: { requestId, approvedBy: approvals, requestedBy: request.requestedBy },
        ip,
        createdAt: now,
      },
    });

    return { ok: true, state: 'EXECUTED' };
  });
}

/**
 * فحص الاتصال — يكتب نتيجته ولا يلمس السرّ.
 *
 * ولا مزوّد بعد، فالفحص يقول «غير مفعّل» لمن لا سرّ له و«لم يُجرَّب»
 * لمن له. **ولا يدّعي نجاحًا**: نتيجةٌ خضراء بلا اتّصال حقيقي أسوأ من
 * غياب الفحص، لأنها تُطمئن.
 */
export async function checkConnection(
  admin: AdminUser,
  key: string,
  ip: string | null,
  now = new Date(),
): Promise<{ ok: boolean; result: 'NO_SECRET' | 'UNTESTED' }> {
  const integration = await db.integration.findUnique({ where: { key } });
  if (integration === null) return { ok: false, result: 'NO_SECRET' };

  const configured = integration.secretsEncrypted !== null && integration.secretsEncrypted !== '';

  await db.integration.update({
    where: { key },
    data: { lastCheckAt: now, lastCheckOk: null },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'Integration',
      entityId: key,
      action: 'integration.checked',
      before: {},
      after: { configured },
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
};

export async function integrationSummary(): Promise<IntegrationSummary> {
  const [byStatus, rotations] = await Promise.all([
    db.integration.groupBy({ by: ['status'], _count: { _all: true } }),
    db.approvalRequest.count({
      where: { kind: 'KEY_ROTATION', status: 'PENDING', entityType: 'Integration' },
    }),
  ]);

  /**
   * الحالات ثلاث في المخطّط: `ACTIVE` و`DEGRADED` و`INACTIVE` — وهي
   * «تعمل» و«تحذير» و«غير مفعّلة» في الترميز. وأسماءٌ من عندي كانت
   * ستُرجع أصفارًا بلا خطأ نوعٍ ولا رسالة.
   */
  const of = (status: 'ACTIVE' | 'DEGRADED' | 'INACTIVE'): number =>
    byStatus.find((row) => row.status === status)?._count._all ?? 0;

  return {
    connected: of('ACTIVE'),
    warning: of('DEGRADED'),
    inactive: of('INACTIVE'),
    pendingRotations: rotations,
  };
}
