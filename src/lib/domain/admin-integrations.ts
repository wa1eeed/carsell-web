import { db } from '@/lib/db';
import { APP_URL } from '@/lib/env';
import type { AdminUser } from '@/generated/prisma/client';
import type { IntegrationEnv } from '@/generated/prisma/enums';
import { encryptSecret, secretHint } from '@/lib/crypto/secrets';
import { effectiveEnvironment, environmentIsForced } from './integration-env';
import { REQUIRED_APPROVALS, selfApprovalBlocked, soloQuorum } from './approvals';

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
  /** الحال المحسوبة — وهي التي تُعرض؛ و`status` نيّةٌ مخزَّنة */
  connection: ConnectionState;
  /**
   * الوجهة التي يُنادينا المزوّد عليها — `null` لمن لا يُنادي.
   *
   * **ولم تكن تُعرض في مكان.** ومن يضبط بوابة الدفع يحتاجها حرفًا
   * بحرف في لوحة المزوّد، فكان يفتح شجرة المسارات ليجدها — أو
   * يكتبها من حفظه فيخطئ حرفًا ولا يصل تأكيدُ دفعةٍ واحدة.
   */
  webhookUrl: string | null;
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

/**
 * ═══ حالُ التكامل تُحسب، ولا تُقرأ من حقلٍ لا يكتبه أحد ═══
 *
 * `Integration.status` معرَّفٌ في المخطّط ومفهرَسٌ ومقروء — **ولا
 * شيء يكتبه بعد البذرة**. فصفٌّ زُرع `ACTIVE` يبقى `ACTIVE` ولو لم
 * يُضبط له مفتاحٌ قطّ، وبطاقةُ «تعمل» في صدر الشاشة تعدّ ما زرعتْه
 * البذرة. وأسوأ منها: السطر نفسه كان يعرض «بلا مفاتيح» لبيئته
 * الفعّالة **وبجانبه شارةٌ تقول متّصل** — تناقضٌ في سطرٍ واحد.
 *
 * والحال الحقيقية تُركَّب من اثنين:
 *
 * · **النيّة** — `status === 'INACTIVE'` تعني مؤجَّلًا عن عمد، وهي
 *   حالٌ صحيحة لا عطل (`r2` اليوم).
 * · **والمفاتيح** — أثمّة سرٌّ لبيئته **الفعّالة**؟ ولا يُسأل عن
 *   المخزَّنة: خارج الإنتاج القراءةُ مثبَّتة على `TEST`، فمفتاحُ
 *   الإنتاج موجودًا لا يجعله عاملًا.
 *
 * وهي الوحيدة التي يملكها الفحص أصلًا: `checkConnection` **لا تنادي
 * المزوّد** (نداءٌ حقيقيّ معاملةٌ بمالٍ حيّ)، فكلُّ ما تعرفه هو هذا.
 *
 * **ودالّةٌ واحدة تخدم الشارة والبطاقة** — ونسختان تتباعدان أوّل
 * تغيير، فتقول البطاقة «١١ تعمل» والصفوف تعرض تسعة.
 */
export type ConnectionState = 'OFF' | 'NO_KEYS' | 'READY';

/**
 * المسارات التي يُنادينا عليها المزوّدون — **من المسار الحقيقيّ**.
 *
 * ومن أضاف ويبهوك ولم يُدرجه هنا لا يكسر شيئًا، لكنّ ضابطه يبقى
 * يفتّش عن وجهته في الشيفرة.
 */
const WEBHOOK_PATH: Record<string, string> = {
  payments: '/api/v1/webhooks/payments',
};

export function connectionState(
  status: string,
  activeEnv: IntegrationEnv,
  credentials: readonly { env: IntegrationEnv; configured: boolean }[],
): ConnectionState {
  if (status === 'INACTIVE') return 'OFF';
  const active = credentials.find((entry) => entry.env === activeEnv);
  return active !== undefined && active.configured ? 'READY' : 'NO_KEYS';
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
      connection: connectionState(row.status, effectiveEnvironment(row.activeEnv), credentials),
      webhookUrl: WEBHOOK_PATH[row.key] === undefined ? null : `${APP_URL}${WEBHOOK_PATH[row.key]}`,
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
      requiredApprovals: REQUIRED_APPROVALS,
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

  /**
   * **والطالبُ هو النصاب حين يكون النصاب واحدًا** (قرار المالك
   * ٢٠٢٦-١٠-١٤) — ولا صفَّ معلَّق ينتظر الشخصَ نفسَه.
   */
  if (soloQuorum()) return approveRotation(admin, request.id, ip, now);

  return { ok: true, state: 'PENDING', approvals: 1, required: REQUIRED_APPROVALS };
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
    if (selfApprovalBlocked(request, admin.id) || request.approvedBy.includes(admin.id)) {
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

  const request = await db.approvalRequest.create({
    data: {
      kind: 'INTEGRATION_ENV',
      entityType: 'Integration',
      entityId: key,
      payload: { to },
      requestedBy: admin.id,
      approvedBy: [],
      requiredApprovals: REQUIRED_APPROVALS,
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

  /**
   * **ونصابُ الواحد يُنفّذ هنا أيضًا** — و`approveRotation` تعالج
   * الصنفين (`KEY_ROTATION` و`INTEGRATION_ENV`)، فلا مسارَ ثانٍ.
   */
  if (soloQuorum()) return approveRotation(admin, request.id, ip, now);

  return { ok: true, state: 'PENDING', approvals: 1, required: REQUIRED_APPROVALS };
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
): Promise<{ ok: boolean; result: 'NO_SECRET' | 'UNTESTED' | 'LIVE_OK' | 'LIVE_FAILED' }> {
  const secret = await activeSecret(key);
  const integration = await db.integration.findUnique({ where: { key } });
  if (integration === null) return { ok: false, result: 'NO_SECRET' };

  const configured = secret !== null && secret !== '';

  /**
   * ═══ والفحصُ نداءٌ حين تكون له وصلة ═══
   *
   * كان الزرُّ يقرأ «أثمّة سرٌّ محفوظ؟» ويردّ «غير مُختبَر» — **فالنصّ
   * المعروض وعدٌ لا وصف**: من ضغطه ظنّ مفتاحه صالحًا وهو لم يُجرَّب،
   * ولا يُعرف خطؤه إلّا عند أوّل عميلٍ يدفع.
   *
   * وما لا وصلةَ له يبقى «غير مُختبَر» صراحةً — حالٌ صادقة، بخلاف
   * «متّصل» تُقال عن مفتاحٍ لم يلمسه أحد.
   */
  const { probeIntegration } = await import('./integration-probes');
  const probe = await probeIntegration(key, secret);
  const live = probe.state === 'NO_PROBE' ? null : probe.state === 'OK';

  await db.integration.update({ where: { key }, data: { lastCheckAt: now, lastCheckOk: live } });
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'Integration',
      entityId: key,
      action: 'integration.checked',
      before: {},
      after: {
        configured,
        env: effectiveEnvironment(integration.activeEnv),
        /** **وتفصيلُ الفشل يُسجَّل** — «فشل» وحدها لا تُصلَح */
        probe: probe.state,
        ...(probe.state === 'NO_PROBE' || probe.detail === null ? {} : { detail: probe.detail }),
      },
      ip,
      createdAt: now,
    },
  });

  if (!configured) return { ok: true, result: 'NO_SECRET' };
  if (probe.state === 'NO_PROBE') return { ok: true, result: 'UNTESTED' };
  return { ok: true, result: probe.state === 'OK' ? 'LIVE_OK' : 'LIVE_FAILED' };
}

export type IntegrationSummary = {
  connected: number;
  warning: number;
  inactive: number;
  pendingRotations: number;
  /**
   * **وتبديل البيئة يُعدّ وحده.** كان الاثنان في عدّادٍ واحدٍ تحت
   * عنوان «مفاتيح تنتظر الاستبدال» — فطلبُ نقلٍ إلى الإنتاج، وهو
   * أخطر ما يُطلب هنا، يُعرض على أنه مفتاحٌ ينتظر تدويرًا.
   */
  pendingEnvSwitches: number;
  /** مخزَّنة `LIVE` وتعمل على `TEST` — حالٌ تُقال لا تُخفى. */
  forcedToTest: number;
};

export async function integrationSummary(): Promise<IntegrationSummary> {
  const [rows, rotations, envSwitches, live] = await Promise.all([
    db.integration.findMany({
      select: { status: true, activeEnv: true, credentials: { select: { env: true, secretsEncrypted: true } } },
    }),
    db.approvalRequest.count({
      where: { kind: 'KEY_ROTATION', status: 'PENDING', entityType: 'Integration' },
    }),
    db.approvalRequest.count({
      where: { kind: 'INTEGRATION_ENV', status: 'PENDING', entityType: 'Integration' },
    }),
    db.integration.count({ where: { activeEnv: 'LIVE' } }),
  ]);

  // البطاقات من الدالّة نفسها التي تُعطي الشارة — فلا تتباعدان
  const states = rows.map((row) =>
    connectionState(
      row.status,
      effectiveEnvironment(row.activeEnv),
      row.credentials.map((entry) => ({
        env: entry.env,
        configured: entry.secretsEncrypted != null && entry.secretsEncrypted !== '',
      })),
    ),
  );
  const of = (state: ConnectionState): number =>
    states.filter((value) => value === state).length;

  return {
    connected: of('READY'),
    warning: of('NO_KEYS'),
    inactive: of('OFF'),
    pendingRotations: rotations,
    pendingEnvSwitches: envSwitches,
    forcedToTest: effectiveEnvironmentIsStored() ? 0 : live,
  };
}
