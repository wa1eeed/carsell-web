import { db } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto/secrets';
import type { IntegrationEnv, PaymentPurpose } from '@/generated/prisma/enums';
import { effectiveEnvironment } from '@/lib/domain/integration-env';
import { createMoyasarAdapter } from './adapters/moyasar';
import { SANDBOX_KEY, createSandboxAdapter } from './adapters/sandbox';

import { pendingGateway, readCapabilities, type PaymentGatewayPort } from './gateway';

const MOYASAR_KEY = 'moyasar';

/**
 * يبني بوابة الغرض — **من التوجيه لا من إعدادٍ عامّ**.
 *
 * ولا تأخذ البيئة وسيطًا: `effectiveEnvironment` تقيّدها بـ`TEST` خارج
 * الإنتاج، ولو أخذتها لصار كل مستدعٍ قادرًا على طلب `LIVE` من staging.
 */

export type Resolved = {
  gateway: PaymentGatewayPort;
  gatewayKey: string;
  environment: IntegrationEnv;
  enabled: boolean;
};

/** أسرار البوابة — تُفكّ هنا وحدها ولا تخرج. */
type Secrets = { secretKey?: string; webhookSecret?: string };

/**
 * ═══ سجلُّ المُهايئات — ومنه تُشتقّ القائمة ═══
 *
 * ما ليس فيه يُحَلّ إلى `pendingGateway`، فيُردّ كلُّ دفعٍ بـ
 * `GATEWAY_NOT_CONFIGURED`. وكان هذا معروفًا **في تعليقٍ وحده**: أربع
 * بوّابات في القاعدة كلُّها `ACTIVE` ومُهايئان في الشيفرة، و`/admin/payments`
 * يقول «٤ بوابات مربوطة» ويضع «بيع المركبات — الضمان» على المصرفية
 * ويعرض «٢٥٤٬٥٧٠ ريال محجوز الآن» — وهي لا تستطيع تحصيل ريال.
 *
 * **والقائمة تُشتقّ ولا تُكتب.** كتبتُها أوّلًا بيدٍ واختبارًا يقابلها
 * بالسلوك، فأضفتُ `tap` إليها كذبًا **ومرّ الاختبار**: من يفحص «ما
 * خارج القائمة» لا يرى ما دخلها زورًا. ومصدرٌ واحد لا يحتاج حارسًا.
 *
 * والبنّاء يعيد `null` حين ينقص سرٌّ — فالبوابة مُنفَّذةٌ وتنتظر مفتاحًا،
 * وهي حالٌ غيرُ «لا وصلة لها».
 */
const ADAPTERS: Record<string, (secrets: Secrets) => PaymentGatewayPort | null> = {
  [MOYASAR_KEY]: (secrets) =>
    secrets.secretKey === undefined || secrets.webhookSecret === undefined
      ? null
      : createMoyasarAdapter(secrets.secretKey, secrets.webhookSecret),
  /**
   * والتجريبية بلا أسرار تُفكّ — فبنّاؤها لا يقرأ `secrets`. وهي ترمي
   * في الإنتاج من داخلها، فلا يحرسها هذا الموضع وحده.
   */
  [SANDBOX_KEY]: () => createSandboxAdapter(readCapabilities(null)),
};

/** البوّابات التي للمنتج وصلةٌ إليها — مشتقّةٌ من السجلّ نفسه. */
export const IMPLEMENTED_GATEWAYS: readonly string[] = Object.keys(ADAPTERS);

/** أللمنتج وصلةٌ إلى هذه البوابة؟ — سؤالُ الشاشة قبل أن تَعِد. */
export function gatewayImplemented(key: string): boolean {
  return IMPLEMENTED_GATEWAYS.includes(key);
}

function readSecrets(blob: string | null): Secrets {
  if (blob === null || blob === '') return {};
  try {
    return JSON.parse(decryptSecret(blob)) as Secrets;
  } catch {
    // مفتاحٌ فاسد ⇒ بوابةٌ غير مضبوطة، لا بوابةٌ بمفتاح خاطئ
    return {};
  }
}

export async function resolveGateway(purpose: PaymentPurpose): Promise<Resolved | null> {
  const route = await db.paymentRoute.findUnique({
    where: { purpose },
    include: { gateway: { include: {} } },
  });
  if (route === null) return null;

  const environment = effectiveEnvironment(route.environment);
  const credential = await db.integrationCredential.findUnique({
    where: { integrationKey_env: { integrationKey: route.gatewayKey, env: environment } },
  });

  const secrets = readSecrets(credential?.secretsEncrypted ?? null);
  const capabilities = readCapabilities(route.gateway.capabilities);

  /**
   * **التجريبية بلا أسرار** — لا مفتاح لها تُفكّه، فلا تمرّ بشرط
   * الأسرار أدناه وإلّا لصارت `pendingGateway` وهي مضبوطة.
   * وهي ترمي في الإنتاج من داخلها، فلا يحرسها هذا الموضع وحده.
   */
  if (route.gatewayKey === SANDBOX_KEY) {
    return {
      gateway: createSandboxAdapter(capabilities),
      gatewayKey: route.gatewayKey,
      environment,
      enabled: route.enabled,
    };
  }

  if (secrets.secretKey === undefined || secrets.webhookSecret === undefined) {
    return {
      gateway: pendingGateway(route.gatewayKey, environment),
      gatewayKey: route.gatewayKey,
      environment,
      enabled: route.enabled,
    };
  }

  // بوابةٌ لا وصلة لها **لا تُشتقّ من قدراتها**: القدرات تصف ما تستطيع،
  // لا كيف تُنادى. وتاب والمصرفية بلا وصلةٍ بعد.
  const gateway =
    ADAPTERS[route.gatewayKey]?.(secrets) ?? pendingGateway(route.gatewayKey, environment);

  return {
    // القدرات من الصفّ لا من المُهايئ: المشغّل يعدّلها بلا نشر
    gateway: { ...gateway, capabilities },
    gatewayKey: route.gatewayKey,
    environment,
    enabled: route.enabled,
  };
}

/** بوابة معاملةٍ قائمة — **من لقطتها لا من التوجيه الجاري**. */
export async function resolveForPayment(
  gatewayKey: string,
  environment: IntegrationEnv,
): Promise<PaymentGatewayPort> {
  const credential = await db.integrationCredential.findUnique({
    where: { integrationKey_env: { integrationKey: gatewayKey, env: environment } },
  });
  const secrets = readSecrets(credential?.secretsEncrypted ?? null);

  // معاملةٌ أُنشئت على التجريبية تُفرَج من التجريبية — من حيث أُنشئت
  if (gatewayKey === SANDBOX_KEY) {
    const gateway = await db.paymentGateway.findUnique({ where: { key: SANDBOX_KEY } });
    return createSandboxAdapter(readCapabilities(gateway?.capabilities ?? null));
  }

  if (gatewayKey === MOYASAR_KEY && secrets.secretKey !== undefined && secrets.webhookSecret !== undefined) {
    return createMoyasarAdapter(secrets.secretKey, secrets.webhookSecret);
  }
  return pendingGateway(gatewayKey, environment);
}
