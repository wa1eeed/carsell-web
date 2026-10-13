import { db } from '@/lib/db';
import { APP_ENV } from '@/lib/env';
import { encryptSecret } from '@/lib/crypto/secrets';
import { recordTrialVerification, submitIdentity } from './identity-state';
import { normalizeDigits } from './profile-edit';

/**
 * ═══ توثيقُ المنشأة — KYB ═══
 *
 * `identityMethod` يحمل `commercial_register` منذ المخطّط الأوّل **ولا
 * كاتب له**: لا شيء في المنتج يعرّف حسابًا بأنه منشأة، فتوثيقُ وكالةٍ
 * يمرّ بمسار الفرد ويُسأل صاحبُها عن رقم هويّته وحده — ولا يُعرَف من
 * الحساب أنه معرضٌ ولا باسم مَن تُصدَر فاتورته.
 *
 * ═══ والشخصُ والمنشأة يُقدَّمان معًا ═══
 *
 * KYB لا يكتفي بالكيان: من يتصرّف عنه يُعرَف أيضًا. وتقسيمُهما طلبين
 * يجعل المحرّر يقرّر مرّتين على نصف صورة، ويترك حسابًا موثَّقَ الشخص
 * غيرَ موثَّق المنشأة يشتري باسم نفسه ويبيع باسمها.
 *
 * فهما طلبٌ واحد وقرارٌ واحد.
 *
 * ═══ والنفاذ مؤجَّل ═══
 *
 * التعاقد مع مزوّده يحتاج وقتًا (قرار المالك ١٣ أكتوبر ٢٠٢٦)، فالمسار
 * كلُّه يدويّ اليوم: الإنتاج يُقدِّم إلى المراجعة، والتطوير وstaging
 * يوثّقان ذاتيًّا وإلّا لم تُجرَّب رحلة.
 */

export type BusinessIdentityInput = {
  /** الاسم كما في الهوية — لمن يتصرّف عن المنشأة. */
  signatoryName: string;
  signatoryNationalId: string;
  /** اسم المنشأة كما في السجلّ التجاريّ لا الاسم التجاريّ المعروف. */
  businessName: string;
  crNumber: string;
  /** `YYYY-MM-DD` — وسجلٌّ منتهٍ لا يُوثَّق به. */
  crExpiresAt: string;
  /** اختياريّ: منشأةٌ دون حدّ التسجيل لا رقم ضريبيّ لها. */
  vatNumber?: string | null;
};

export type BusinessIdentityFailure =
  | 'ALREADY_VERIFIED'
  | 'USER_NOT_FOUND'
  | 'VALIDATION';

export type BusinessIdentityResult =
  | { ok: true; pending: boolean }
  | { ok: false; reason: 'ALREADY_VERIFIED' | 'USER_NOT_FOUND' }
  | { ok: false; reason: 'VALIDATION'; fields: Record<string, string> };

const SAUDI_ID_LENGTH = 10;
const CR_LENGTH = 10;
const VAT_LENGTH = 15;

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/** يعيد مفاتيح لا جُملًا — والصياغة في الشاشة (البوابة ١٧). */
function validate(input: BusinessIdentityInput, now: Date): Record<string, string> {
  const fields: Record<string, string> = {};

  if (clean(input.signatoryName).length < 4) fields.signatoryName = 'REQUIRED';

  const id = normalizeDigits(input.signatoryNationalId);
  if (id.length !== SAUDI_ID_LENGTH || !/^[12]/.test(id)) fields.signatoryNationalId = 'INVALID';

  if (clean(input.businessName).length < 2) fields.businessName = 'REQUIRED';

  const cr = normalizeDigits(input.crNumber);
  if (cr === '') fields.crNumber = 'REQUIRED';
  else if (cr.length !== CR_LENGTH) fields.crNumber = 'LENGTH';

  /**
   * **والسجلّ المنتهي يُردّ عند التقديم لا عند المراجعة.** محرّرٌ يفتح
   * طلبًا ليجد سجلًّا انتهى الشهر الماضي يردّه، وقد انتظر صاحبُه يومين.
   */
  const expiry = clean(input.crExpiresAt);
  const at = expiry === '' ? null : new Date(`${expiry}T00:00:00.000Z`);
  if (at === null || Number.isNaN(at.getTime())) fields.crExpiresAt = 'REQUIRED';
  else if (at.getTime() <= now.getTime()) fields.crExpiresAt = 'EXPIRED';

  const vat = clean(input.vatNumber);
  if (vat !== '' && normalizeDigits(vat).length !== VAT_LENGTH) fields.vatNumber = 'LENGTH';

  return fields;
}

export async function submitBusinessIdentity(
  userId: string,
  input: BusinessIdentityInput,
  now: Date = new Date(),
): Promise<BusinessIdentityResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, idVerified: true },
  });
  if (user === null) return { ok: false, reason: 'USER_NOT_FOUND' };
  if (user.idVerified) return { ok: false, reason: 'ALREADY_VERIFIED' };

  const fields = validate(input, now);
  if (Object.keys(fields).length > 0) return { ok: false, reason: 'VALIDATION', fields };

  const vat = clean(input.vatNumber);
  const business = {
    businessName: clean(input.businessName),
    crNumber: normalizeDigits(input.crNumber),
    crExpiresAt: new Date(`${clean(input.crExpiresAt)}T00:00:00.000Z`),
    vatNumber: vat === '' ? null : normalizeDigits(vat),
  };
  const identity = {
    name: clean(input.signatoryName),
    // الرقم مشفَّر — يُقارن ولا يُعرض
    nationalIdEncrypted: encryptSecret(normalizeDigits(input.signatoryNationalId)),
  };

  const pending = APP_ENV === 'production';
  if (pending) {
    await submitIdentity(db, userId, 'commercial_register', identity, now, business);
  } else {
    await recordTrialVerification(db, userId, identity, now, business);
  }

  await db.auditLog.create({
    data: {
      actorId: userId,
      actorType: 'user',
      entity: 'User',
      entityId: userId,
      action: 'identity.business.submitted',
      before: undefined,
      // **ولا يُكتب الرقم في السجلّ** — السجلّ يُقرأ ولا يُشفَّر
      after: {
        businessName: business.businessName,
        crNumber: business.crNumber,
        hasVat: business.vatNumber !== null,
        pending,
      },
      ip: null,
      createdAt: now,
    },
  });

  return { ok: true, pending };
}
