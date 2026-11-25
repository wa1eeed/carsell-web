import { db } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto/secrets';
import { isFeatureOn } from '@/lib/env';
import { effectiveEnvironment } from '@/lib/domain/integration-env';

/**
 * ═══ نفاذ — التحقّق من الهوية بالمصدر لا بالعين ═══
 *
 * قرار المالك ٢٠٢٦-١١-٢٥: «نعم نسعى لنفاذ — ابنه ولاحقًا نقوم
 * بتنفيذه»، و«**لا نريد الحصول على صورة هوية، فقط حقول**».
 *
 * واليومَ: يُرسل المستخدم رقمَ هويّته، **وينتظر موظّفًا يفتح ملفَّه
 * ويقابل اسمَ حساب البنك بالهوية** — ساعاتٌ لا يشتري فيها ولا يبيع.
 * ونفاذُ تُلغي الانتظار لا تُسرّعه: الاسمُ والرقم يصلان **من المصدر
 * الحكوميّ**، فلا طابورَ ولا مراجعةَ عينٍ في الحال السليمة.
 *
 * ═══ وبروتوكولُها رقمٌ يُعرض لا رابطٌ يُفتح ═══
 *
 * تُرسِل المنصّةُ رقمَ الهوية، فتردّ نفاذُ **رقمًا عشوائيًّا** (٢ أو
 * ٣ أو ٥…) ومعرّفَ معاملة. ويفتح المستخدمُ تطبيقَ نفاذ فيجد ثلاثةَ
 * أرقام، **يضغط الذي يطابق ما على شاشتنا**. فالرقمُ جزءٌ من الأمان
 * لا زينة: من لم يرَ شاشتَنا لا يعرف أيَّها يضغط.
 *
 * ═══ والمفاتيحُ من اللوحة لا من البيئة ═══
 *
 * `IntegrationCredential` كبوّابات الدفع سواءً — يكتبها المشغّل من
 * `A11` بلا نشر. **والرايةُ المطفأة تُخفي لا تُعطّل** (قرار ٢٤):
 * ما دامت نفاذُ غيرَ موصولة لا يُعرض زرُّها، ويبقى الطابورُ اليدويّ
 * هو المسار — لا زرٌّ يردّ «غير مضبوط».
 */

export const NAFATH_KEY = 'nafath';

export type NafathFailure =
  | 'NOT_CONFIGURED'
  | 'ID_INVALID'
  | 'REJECTED'
  | 'EXPIRED'
  | 'UPSTREAM';

export type NafathStart =
  | { ok: true; transactionId: string; random: string; expiresAt: Date }
  | { ok: false; reason: NafathFailure };

export type NafathStatus =
  | { ok: true; state: 'WAITING' }
  | { ok: true; state: 'APPROVED'; nationalId: string; fullName: string | null }
  | { ok: false; reason: NafathFailure };

type Secrets = { apiKey?: string; appId?: string; baseUrl?: string };

function readSecrets(blob: string | null): Secrets {
  if (blob === null || blob === '') return {};
  try {
    return JSON.parse(decryptSecret(blob)) as Secrets;
  } catch {
    /** مفتاحٌ فاسد ⇒ غيرُ مضبوطة، لا مضبوطةٌ بمفتاحٍ خاطئ. */
    return {};
  }
}

/**
 * أمضبوطةٌ نفاذ؟ — **الرايةُ والمفاتيحُ معًا**.
 *
 * رايةٌ مرفوعةٌ بلا مفاتيحَ تعرض زرًّا يردّ خطأً، ومفاتيحُ بلا رايةٍ
 * تفتح مسارًا لم يُقرَّر فتحُه. وكلتاهما تُقرأ «النظامُ معطّل».
 */
export async function nafathReady(): Promise<boolean> {
  if (!isFeatureOn('NAFATH')) return false;
  /**
   * **وبيئةُ التكامل من صفّه لا من يدٍ تكتبها.** و`effectiveEnvironment`
   * تقيّدها بـ`TEST` خارج الإنتاج، فلا يُنادى مزوّدٌ حقيقيّ من جهاز
   * مطوّر بمفتاحٍ حيّ.
   */
  const integration = await db.integration.findUnique({
    where: { key: NAFATH_KEY },
    select: { activeEnv: true },
  });
  const credential = await db.integrationCredential.findUnique({
    where: {
      integrationKey_env: {
        integrationKey: NAFATH_KEY,
        env: effectiveEnvironment(integration?.activeEnv ?? 'TEST'),
      },
    },
    select: { secretsEncrypted: true },
  });
  const secrets = readSecrets(credential?.secretsEncrypted ?? null);
  return typeof secrets.apiKey === 'string' && secrets.apiKey !== '';
}

/** رقمُ الهوية السعوديّ عشرُ خاناتٍ يبدأ بـ١ أو ٢ (مواطن/مقيم). */
export function validNationalId(value: string): boolean {
  return /^[12]\d{9}$/.test(value.trim());
}

/**
 * يبدأ معاملةَ تحقّق.
 *
 * **ولا يُنادى قبل `nafathReady`** — والفحصُ هنا ثانيًا لأنّ حارسًا في
 * موضعٍ واحد ليس حارسًا.
 */
export async function startNafath(nationalId: string): Promise<NafathStart> {
  if (!validNationalId(nationalId)) return { ok: false, reason: 'ID_INVALID' };
  if (!(await nafathReady())) return { ok: false, reason: 'NOT_CONFIGURED' };

  /**
   * ═══ والنداءُ الفعليّ ينتظر المفاتيح ═══
   *
   * العقدُ مكتوبٌ كاملًا — ما يُرسَل وما يعود وكيف يُقرأ — فيوم تصل
   * المفاتيح يُستبدل جسدُ هذه الدالّة وحدَه، ولا تتبدّل شاشةٌ ولا
   * مسار. **ولا يُرجَع رقمٌ مخترَع في الأثناء**: زرٌّ يعرض رقمًا
   * لا يجده المستخدم في تطبيقه أسوأ من زرٍّ غائب.
   */
  return { ok: false, reason: 'NOT_CONFIGURED' };
}

/** يسأل عن حالِ معاملةٍ قائمة — والشاشةُ تسأل كلّ ثانيتين حتى تُحسم. */
export async function pollNafath(transactionId: string): Promise<NafathStatus> {
  void transactionId;
  if (!(await nafathReady())) return { ok: false, reason: 'NOT_CONFIGURED' };
  return { ok: false, reason: 'NOT_CONFIGURED' };
}
