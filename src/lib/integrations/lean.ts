import { db } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto/secrets';
import { effectiveEnvironment } from '@/lib/domain/integration-env';

/**
 * ═══ لين — جلبُ السجلّ التجاريّ ومن يُفوَّض عنه ═══
 *
 * معرضٌ يكتب سجلَّه بيده يكتبه كما يحفظه: اسمًا مختصرًا ورقمًا من
 * ذاكرته وعنوانًا تقريبيًّا — فيُراجَع طلبُه بما كتبه لا بما في
 * السجلّ، ويُردّ على فرقِ حرف. والجلب من المصدر يجعل الملفّ **نسخةً
 * من الوزارة** لا إفادةَ صاحبه.
 *
 * ═══ والمعرّف هو الرقم الموحَّد لا رقم السجلّ ═══
 *
 * لين تقبل `UNIFIED_NUMBER` وحده (عشر خانات)، وتُعيد فيما تُعيد
 * `commercial_registry`. فالشاشة تسأل الموحَّد وتملأ به السجلّ — لا
 * العكس. وسؤالُه عن السجلّ ثمّ نداءٌ بالموحَّد يُرجع «غير معروف» دائمًا.
 *
 * ═══ وكل تكامل خلف راية يسقط بصمت ═══
 *
 * ما دامت المفاتيح لم تصل فالفشل هو الحال المتوقَّع — فتُعاد
 * `NOT_CONFIGURED` ولا يُرمى خطأ، والشاشة تُبقي الإدخال اليدويّ
 * مفتوحًا بسطرٍ رمادي واحد.
 */

export const LEAN_KEY = 'lean';

const AUTH_HOST = { TEST: 'https://auth.sandbox.leantech.me', LIVE: 'https://auth.leantech.me' };
const API_HOST = { TEST: 'https://sandbox.sa.leantech.me', LIVE: 'https://api2.sa.leantech.me' };

/** عشر خاناتٍ — ومن يلصقها بفواصل لا يُردّ. */
export function normalizeUnifiedNumber(raw: string): string {
  return raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[^0-9]/g, '');
}

export type CorporateRecord = {
  companyName: string | null;
  crNumber: string | null;
  unifiedNumber: string;
  issueDate: string | null;
  status: string | null;
  address: string | null;
  /** من يُفوَّض عن المنشأة — اسمًا وصفةً، كما يعيدها السجلّ. */
  managers: { name: string; role: string | null }[];
  /** الحمولة كما وصلت — تُعرض للمراجع دليلًا ولا تُفسَّر هنا. */
  raw: unknown;
};

export type LeanLookup =
  | { ok: true; record: CorporateRecord }
  | { ok: false; reason: 'NOT_CONFIGURED' | 'NOT_FOUND' | 'UPSTREAM' | 'INVALID' };

type Secrets = { clientId?: string; clientSecret?: string };

function readSecrets(blob: string | null): Secrets {
  if (blob === null || blob === '') return {};
  try {
    return JSON.parse(decryptSecret(blob)) as Secrets;
  } catch {
    // مفتاحٌ فاسد ⇒ تكاملٌ غير مضبوط، لا تكاملٌ بمفتاح خاطئ
    return {};
  }
}

async function accessToken(env: 'TEST' | 'LIVE', secrets: Secrets): Promise<string | null> {
  if (secrets.clientId === undefined || secrets.clientSecret === undefined) return null;

  const response = await fetch(`${AUTH_HOST[env]}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: secrets.clientId,
      client_secret: secrets.clientSecret,
      grant_type: 'client_credentials',
      scope: 'api',
    }),
  }).catch(() => null);

  if (response === null || !response.ok) return null;
  const body = (await response.json().catch(() => null)) as { access_token?: string } | null;
  return typeof body?.access_token === 'string' ? body.access_token : null;
}

/** أوّلُ نصٍّ غير فارغ في مسارٍ من الحمولة — والشكل قد يتغيّر فلا يُفترض. */
function text(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

function readRecord(unified: string, payload: unknown): CorporateRecord {
  const root = (payload ?? {}) as Record<string, unknown>;
  const v = (root.verifications ?? {}) as Record<string, unknown>;

  const headquarters = (v.headquarters ?? {}) as Record<string, unknown>;
  const addresses = Array.isArray(v.addresses) ? (v.addresses as Record<string, unknown>[]) : [];
  const first = addresses[0] ?? headquarters;

  const management = Array.isArray(v.management) ? (v.management as Record<string, unknown>[]) : [];

  return {
    companyName: text(v.company_name),
    crNumber: text(v.commercial_registry) ?? text(v.main_commercial_registry),
    unifiedNumber: unified,
    issueDate: text(v.issue_date),
    status: text(v.status),
    address:
      [text(first.street), text(first.district), text(first.city)].filter((x) => x !== null).join('، ') ||
      null,
    managers: management
      .map((row) => ({ name: text(row.name) ?? '', role: text(row.position) ?? text(row.role) }))
      .filter((row) => row.name !== ''),
    raw: payload,
  };
}

/**
 * يجلب سجلَّ المنشأة بالرقم الموحَّد.
 *
 * **ولا يُلمس إلّا بعد أن يُفحص الشكل**: نداءٌ خارجيّ برقمٍ من ثلاث
 * خانات يُنفق مهلةً ويعود بخطأٍ معروفٍ سلفًا.
 */
export async function lookupCorporate(rawNumber: string): Promise<LeanLookup> {
  const unified = normalizeUnifiedNumber(rawNumber);
  if (unified.length !== 10) return { ok: false, reason: 'INVALID' };

  const integration = await db.integration.findUnique({
    where: { key: LEAN_KEY },
    select: { status: true, activeEnv: true },
  });
  if (integration === null || integration.status !== 'ACTIVE') {
    return { ok: false, reason: 'NOT_CONFIGURED' };
  }

  const env = effectiveEnvironment(integration.activeEnv);
  const credential = await db.integrationCredential.findUnique({
    where: { integrationKey_env: { integrationKey: LEAN_KEY, env } },
    select: { secretsEncrypted: true },
  });

  const token = await accessToken(env, readSecrets(credential?.secretsEncrypted ?? null));
  if (token === null) return { ok: false, reason: 'NOT_CONFIGURED' };

  const response = await fetch(`${API_HOST[env]}/verifications/v1/corporates`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      // `FULL` تُعيد الشركاء والإدارة وعقد التأسيس — وهو المطلوب للملفّ
      type: 'FULL',
      identifications: [{ type: 'UNIFIED_NUMBER', value: unified }],
      language: 'ar',
    }),
  }).catch(() => null);

  if (response === null) return { ok: false, reason: 'UPSTREAM' };
  if (response.status === 404) return { ok: false, reason: 'NOT_FOUND' };
  if (!response.ok) return { ok: false, reason: 'UPSTREAM' };

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (payload === null) return { ok: false, reason: 'UPSTREAM' };

  /**
   * **و`status` في الجسم غيرُ رمز HTTP.** لين تردّ ٢٠٠ ومعها
   * `FAILED` أو `PENDING` — فقراءةُ الرمز وحده تُدخل حمولةً فارغة إلى
   * الاستمارة على أنها سجلٌّ مجلوب.
   */
  const state = text(payload.status);
  if (state !== 'OK') return { ok: false, reason: state === 'FAILED' ? 'NOT_FOUND' : 'UPSTREAM' };

  return { ok: true, record: readRecord(unified, payload) };
}
