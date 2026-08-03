import { db } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto/secrets';
import type { IntegrationEnv, PaymentPurpose } from '@/generated/prisma/enums';
import { effectiveEnvironment } from '@/lib/domain/integration-env';
import { createMoyasarAdapter } from './adapters/moyasar';
import { pendingGateway, readCapabilities, type PaymentGatewayPort } from './gateway';

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

  if (secrets.secretKey === undefined || secrets.webhookSecret === undefined) {
    return {
      gateway: pendingGateway(route.gatewayKey, environment),
      gatewayKey: route.gatewayKey,
      environment,
      enabled: route.enabled,
    };
  }

  const gateway =
    route.gatewayKey === 'moyasar'
      ? createMoyasarAdapter(secrets.secretKey, secrets.webhookSecret)
      : // بوابةٌ لا مُهايئ لها **لا تُشتقّ من قدراتها**: القدرات تصف ما
        // تستطيع، لا كيف تُنادى. وتاب والمصرفية بلا مُهايئ بعد.
        pendingGateway(route.gatewayKey, environment);

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

  if (gatewayKey === 'moyasar' && secrets.secretKey !== undefined && secrets.webhookSecret !== undefined) {
    return createMoyasarAdapter(secrets.secretKey, secrets.webhookSecret);
  }
  return pendingGateway(gatewayKey, environment);
}
