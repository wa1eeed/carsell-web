import { decryptSecret } from '@/lib/crypto/secrets';

/**
 * ═══ فحصُ الاتصال — **ونداءٌ حقيقيّ لا سؤالٌ عن وجود مفتاح** ═══
 *
 * زرُّ «افحص الاتصال» كان يقرأ: «أثمّة سرٌّ محفوظ؟» ويردّ «غير مُختبَر».
 * **فالنصّ المعروض وعدٌ لا وصف**: من ضغطه ظنّ أن مفتاحه صالح، وهو لم
 * يُجرَّب — ولا يُعرف خطؤه إلّا عند أوّل عميلٍ يدفع.
 *
 * وقِيس على البيئة التجريبية فظهر ما لا يكشفه إلّا النداء: مفتاحٌ صالح
 * يفتح `/platform` **ويُرفض على `/balance`** — شكلٌ صحيح ومسارٌ موجود
 * وردٌّ رفض.
 *
 * ═══ ولمن لا وصلةَ له لا يُدَّعى فحص ═══
 *
 * تكاملٌ بلا مُهايئ يبقى «غير مُختبَر» صراحةً — وهي حالٌ صادقة، بخلاف
 * «متّصل» تُقال عن مفتاحٍ لم يلمسه أحد.
 */

export type ProbeResult =
  | { state: 'OK'; detail: string | null }
  | { state: 'FAILED'; detail: string | null }
  | { state: 'NO_PROBE' };

type Probe = (secrets: Record<string, string>) => Promise<ProbeResult>;

const PROBES: Record<string, Probe> = {
  /**
   * بوّابة المزوّدين: `GET /platform` أخفُّ نداءٍ يُثبت المفتاح —
   * يقرأ ولا يكتب، ويُعيد معرّف المنصّة الذي يُوزَّع إليه نصيبُنا.
   */
  moyasar_platform: async (secrets) => {
    const key = secrets.platformKey ?? '';
    /** **ومفتاحٌ لا جملة** (البوابة ١٧) — والصياغة في الشاشة. */
    if (key === '') return { state: 'FAILED', detail: 'MISSING_platformKey' };

    const { createMoyasarPlatformAdapter } = await import(
      '@/lib/payments/adapters/moyasar-platform'
    );
    const result = await createMoyasarPlatformAdapter(key).platformPayoutRef();
    return result.ok
      ? { state: 'OK', detail: result.value }
      : { state: 'FAILED', detail: result.message ?? result.reason };
  },
};

export async function probeIntegration(
  key: string,
  encrypted: string | null,
): Promise<ProbeResult> {
  const probe = PROBES[key];
  if (probe === undefined) return { state: 'NO_PROBE' };
  if (encrypted === null || encrypted === '') return { state: 'FAILED', detail: null };

  let secrets: Record<string, string>;
  try {
    secrets = JSON.parse(decryptSecret(encrypted)) as Record<string, string>;
  } catch {
    /** مفتاحٌ لا يُفكّ = غير مضبوط، لا مزوّدٌ معطَّل */
    return { state: 'FAILED', detail: null };
  }

  /** وشبكةٌ لا تردّ فشلٌ في الفحص لا انهيارٌ في الشاشة. */
  return probe(secrets).catch(() => ({ state: 'FAILED', detail: null }) as ProbeResult);
}

/** أللتكامل وصلةٌ تُجرَّب؟ — سؤالُ الشاشة قبل أن تَعِد بفحص. */
export function hasProbe(key: string): boolean {
  return PROBES[key] !== undefined;
}
