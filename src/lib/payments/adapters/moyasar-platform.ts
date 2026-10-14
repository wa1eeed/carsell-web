/**
 * ⚠️ **لم يُختبَر مقابل المزوّد — بُني على وثائقه الخاصّة.**
 *
 * مفتاح المنصّة لم يصل بعد (وصل فارغًا في رسالة المالك)، فما تحته لم
 * يلمس الخدمة قطّ. واختباراته تجري على خادمٍ وهميّ يطبّق الواجهة نفسها،
 * فتُغطّى المسارات بلا اتصال — **ومطابقة الحقول تبقى غير مُثبَتة** حتى
 * يصل المفتاح.
 *
 * ═══ وهذا الملف وحده يترجم ═══
 *
 * البوابة ١٥ تستثني `adapters/`، فمفردات المزوّد مسموحة هنا:
 *
 *   حساب → merchant · معرّف التحويل → entity_id · التوزيع → splits
 *   فتحُ حساب → create merchant · التقديم للمراجعة → submit
 *
 * ولا تخرج واحدةٌ منها إلى النطاق ولا إلى الشاشة.
 *
 * ═══ والمصادقة Basic بكلمةِ مرورٍ فارغة ═══
 *
 * اسمُ المستخدم هو مفتاح المنصّة، **والكلمة فارغة بنصّ الوثيقة**. وهو
 * شكلٌ غير مألوف يُغري بوضع المفتاح في الكلمة — فيردّ المزوّد ٤٠١ بلا
 * ما يقول إن الحقلين مقلوبان.
 */

import type { ProviderAccountStatus } from '@/generated/prisma/enums';
import {
  checkShares,
  halalas,
  type AccountBalance,
  type AccountDraft,
  type AccountState,
  type PlatformResult,
  type ProviderPlatformPort,
  type Share,
} from '../provider-platform';

export const MOYASAR_PLATFORM_KEY = 'moyasar_platform';

/** قاعدةُ المنصّة — وهي غيرُ قاعدة بوّابة الدفع العادية. */
const BASE_URL = 'https://apimig.moyasar.com/v1';

/**
 * أي بيئةٍ نعمل عليها — **و`APP_ENV` لا `NODE_ENV`**: الثاني يساوي
 * `production` في staging أيضًا، فالحراسة به تُخطئ في الاتّجاهين.
 */
const IS_LIVE = process.env.APP_ENV === 'production';

/** أحوالُ الحساب كما يسمّيها المزوّد ← كما نسمّيها. */
const STATE: Record<string, ProviderAccountStatus> = {
  pending: 'PENDING',
  missing_docs: 'MISSING_DOCS',
  under_review: 'UNDER_REVIEW',
  semi_active: 'SEMI_ACTIVE',
  active: 'ACTIVE',
  hold: 'HOLD',
  rejected: 'REJECTED',
  disabled: 'DISABLED',
};

const KIND: Record<AccountDraft['kind'], string> = {
  FREELANCER: 'freelancer',
  ESTABLISHMENT: 'establishment',
  COMPANY: 'company',
  GOVERNMENT: 'government',
  CHARITY: 'charity',
};

const SIGNATORY: Record<AccountDraft['signatory'], string> = {
  OWNER: 'owner',
  COMMERCIAL_CONTRACT: 'commercial_contract',
  POWER_OF_ATTORNEY: 'power_of_attorney',
};

type Json = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * ردُّ المزوّد ← حالُ الحساب عندنا.
 *
 * **والحقلان مفصولان**: `id` يُدار به الحساب، و`entity_id` يُوجَّه إليه
 * التوزيع. وأخذُ الأوّل للتوزيع يُرسل المال إلى عدم، والمزوّد يقبله
 * شكلًا لأنّ كليهما UUID.
 */
function toState(body: Json): AccountState {
  const signature = (body.signature ?? {}) as Json;
  const documents = Array.isArray(body.required_documents) ? body.required_documents : [];
  return {
    accountRef: String(body.id ?? ''),
    requiredDocuments: documents
      .filter((row): row is Json => row !== null && typeof row === 'object')
      .map((row) => ({
        type: String(row.type ?? ''),
        requiresUpload: row.requires_upload === true,
        count: Number(row.required_count ?? 1),
      })),
    payoutRef: str(body.entity_id),
    status: STATE[String(body.status ?? '')] ?? 'PENDING',
    /** أسبابُ النقص كما ردّها — تُعرض بلا ترجمةٍ تخمينية */
    note: Array.isArray(body.reasons) && body.reasons.length > 0
      ? body.reasons.map((reason) => String(reason)).join(' · ')
      : null,
    signatureUrl: str(signature.url),
    documentsComplete: body.documents_complete === true,
    /**
     * **ويُؤخذ من البيئة التي نعمل عليها.** `api_keys.test.secret_key`
     * في التجريب و`live` في الإنتاج — وخلطُهما يقرأ رصيد بيئةٍ أخرى
     * أو يفشل صامتًا.
     */
    secretKey: entitySecret(body),
  };
}

/**
 * المفتاح السرّيّ للحساب من ردّ الإنشاء — **للبيئة الجارية وحدها**.
 *
 * ولا يُسجَّل ولا يُطبع: التقاطُه هنا هو الموضع الوحيد الذي يمرّ به،
 * ومن بعده مُعمّى في القاعدة.
 */
function entitySecret(body: Json): string | null {
  const keys = body.api_keys;
  if (keys === null || typeof keys !== 'object' || Array.isArray(keys)) return null;
  const env = (keys as Json)[IS_LIVE ? 'live' : 'test'];
  if (env === null || typeof env !== 'object' || Array.isArray(env)) return null;
  return str((env as Json).secret_key);
}

function failureOf(status: number, body: Json | null): PlatformResult<never> {
  const message = str(body?.message);
  if (status === 401 || status === 403) return { ok: false, reason: 'UNAUTHORIZED', message };
  if (status === 404) return { ok: false, reason: 'NOT_FOUND', message };
  if (status === 422 || status === 400) return { ok: false, reason: 'INVALID', message };
  return { ok: false, reason: 'UPSTREAM', message };
}

function basic(key: string): string {
  /** المفتاح اسمَ مستخدم والكلمة **فارغة** — بنصّ الوثيقة، وأُثبت بنداء. */
  return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
}

export function createMoyasarPlatformAdapter(platformKey: string): ProviderPlatformPort {
  async function call(
    path: string,
    init?: { method: string; body?: Json; key?: string },
  ): Promise<PlatformResult<Json>> {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method: init?.method ?? 'GET',
        headers: {
          authorization: basic(init?.key ?? platformKey),
          ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
    } catch {
      /** شبكةٌ لم تردّ — وهي حالٌ متوقّعة تُعرض سطرًا لا تُرمى خطأً. */
      return { ok: false, reason: 'UPSTREAM', message: null };
    }

    const body = (await response.json().catch(() => null)) as Json | null;
    if (!response.ok) return failureOf(response.status, body);
    return { ok: true, value: body ?? {} };
  }

  return {
    key: MOYASAR_PLATFORM_KEY,

    async platformPayoutRef(): Promise<PlatformResult<string>> {
      const result = await call('/platform');
      if (!result.ok) return result;
      const id = str(result.value.id);
      return id === null
        ? { ok: false, reason: 'UPSTREAM', message: 'NO_PLATFORM_ID' }
        : { ok: true, value: id };
    },

    async openAccount(draft: AccountDraft): Promise<PlatformResult<AccountState>> {
      const result = await call('/merchants', {
        method: 'POST',
        body: {
          type: KIND[draft.kind],
          name: draft.slug,
          public_name: draft.publicName,
          country: 'SA',
          website: draft.website,
          email: draft.email,
          admin_email: draft.adminEmail,
          owners_count: draft.ownersCount,
          signatory: SIGNATORY[draft.signatory],
          /** يُرسَل حين لا يكون التوقيع للمالك — وإرسالُه دائمًا يُرفض */
          ...(draft.signatory === 'OWNER' || draft.signatoryCount === null
            ? {}
            : { signatory_count: draft.signatoryCount }),
          activity_license_required: draft.licenceRequired,
          time_zone: 'Asia/Riyadh',
          /**
           * **و`fees` إلزاميّة** — قِيس: إغفالُها يردّ ٤٠٠
           * `{"fees":["This field is missing."]}`. ولم يذكرها جدولُ
           * «المعلومات المطلوبة» في صفحة النظرة العامّة، وتذكرها
           * صفحةٌ أخرى — **فما يرفضه المزوّد يُعرَف بالنداء لا
           * بالقراءة**.
           */
          fees: {
            tax_inclusive: draft.fees.taxInclusive === true,
            mada_charge_rate: draft.fees.madaRate,
            mada_charge_fixed: draft.fees.madaFixed,
            ...(draft.fees.madaCap === undefined ? {} : { mada_charge_cap: draft.fees.madaCap }),
            mada_refund_fixed: draft.fees.madaRefundFixed,
            cc_charge_rate: draft.fees.cardRate,
            cc_charge_fixed: draft.fees.cardFixed,
            cc_refund_fixed: draft.fees.cardRefundFixed,
          },
        },
      });
      return result.ok ? { ok: true, value: toState(result.value) } : result;
    },

    async accountState(accountRef: string): Promise<PlatformResult<AccountState>> {
      const result = await call(`/merchants/${encodeURIComponent(accountRef)}`);
      return result.ok ? { ok: true, value: toState(result.value) } : result;
    },

    async submitForReview(accountRef: string): Promise<PlatformResult<AccountState>> {
      const result = await call(`/merchants/${encodeURIComponent(accountRef)}/submit`, {
        method: 'POST',
      });
      return result.ok ? { ok: true, value: toState(result.value) } : result;
    },

    async listAccounts(): Promise<PlatformResult<AccountState[]>> {
      const result = await call('/merchants');
      if (!result.ok) return result;
      /**
       * **والردّ مغلَّف بصفحات**: `{merchants: [...], meta: {...}}` لا
       * مصفوفةً عارية — قِيس على البيئة التجريبية. وقراءتُه مصفوفةً
       * تُعيد لا شيء بلا خطأ.
       */
      const list = result.value.merchants;
      if (!Array.isArray(list)) return { ok: false, reason: 'UPSTREAM', message: 'NO_LIST' };
      return { ok: true, value: list.map((row) => toState(row as Json)) };
    },

    async balance(entityKey: string | null): Promise<PlatformResult<AccountBalance>> {
      /**
       * **ولا يُنادى بمفتاح المنصّة**: قِيس فردّ ٤٠٣. ومن لا مفتاح
       * لحسابه لا رصيدَ يُقرأ — حالٌ تُعرض سطرًا لا خطأً.
       */
      if (entityKey === null || entityKey === '') {
        return { ok: false, reason: 'NOT_CONFIGURED', message: null };
      }
      const result = await call('/balance', { method: 'GET', key: entityKey });
      if (!result.ok) return result;
      /** يردّ بأصغر وحدة — والعرض بالريال، فالقسمة هنا لا في الشاشة. */
      const major = (value: unknown): string => (Number(value ?? 0) / 100).toFixed(2);
      return {
        ok: true,
        value: {
          currency: str(result.value.currency) ?? 'SAR',
          total: major(result.value.total),
          available: major(result.value.available),
          transferred: major(result.value.transferred),
        },
      };
    },

    checkShares(total: string, shares: readonly Share[]): PlatformResult<true> {
      return checkShares(total, shares);
    },
  };
}

/**
 * الحصص بالشكل الذي يقبله المزوّد — **وهنا تُحوَّل إلى قروش**.
 *
 * والتحويل في المُهايئ لا في النطاق: وحدةُ المبلغ تفصيلُ مزوّدٍ، ونطاقٌ
 * يحسب بالقروش يفرض شكل مزوّدٍ على كل حسابٍ فيه.
 */
export function toMoyasarSplits(shares: readonly Share[]): Json[] {
  return shares.map((share) => ({
    recipient_id: share.payoutRef,
    amount: halalas(share.amount),
    ...(share.reference === undefined ? {} : { reference: share.reference }),
    ...(share.description === undefined ? {} : { description: share.description }),
    ...(share.bearsGatewayFee === true ? { fee_source: true } : {}),
  }));
}
