/**
 * نصّ القوالب — **بلا قاعدة بيانات**.
 *
 * هذه الدوالّ يحتاجها المحرّر في المتصفّح (ليقيس أثناء الكتابة)
 * ويحتاجها الخادم (ليحرس قبل الحفظ). ولو سكنت مع `db` لجرّت Prisma
 * إلى حزمة المتصفّح — والحدّ يمرّ عبر الاستيرادات لا عبر التوجيهات.
 */

/** `{variable_name}` — حروف صغيرة وشرطة سفلية، ليطابق ما يُرسله المجال. */
const PLACEHOLDER = /\{([a-z][a-z0-9_]*)\}/g;

export function usedVariables(...texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    if (text === null || text === undefined) continue;
    for (const match of text.matchAll(PLACEHOLDER)) {
      const name = match[1];
      if (name !== undefined) found.add(name);
    }
  }
  return [...found].sort();
}

export type TemplateTexts = {
  subjectAr?: string | null;
  subjectEn?: string | null;
  bodyAr?: string | null;
  bodyEn?: string | null;
  smsAr?: string | null;
  smsEn?: string | null;
};

/**
 * ═══ معيار A8 ═══ **متغيّر غير مصرَّح به يمنع الحفظ.**
 *
 * والفحص على النصوص الستّة كلّها — العربي والإنجليزي، العنوان والمتن
 * والرسالة القصيرة — لأن الخطأ المطبعي يقع في اللغة التي يراجعها
 * المحرّر أقلّ.
 */
export function undeclaredVariables(
  texts: TemplateTexts,
  declared: readonly string[],
): string[] {
  const used = usedVariables(
    texts.subjectAr, texts.subjectEn,
    texts.bodyAr, texts.bodyEn,
    texts.smsAr, texts.smsEn,
  );
  return used.filter((name) => !declared.includes(name));
}

/**
 * الرسالة القصيرة — **الطول والتكلفة يُحسبان أثناء الكتابة** (ترميز A8).
 *
 * العربية تُرسَل بترميز UCS-2: ٧٠ حرفًا في المقطع الواحد و٦٧ حين
 * تتعدّد المقاطع (ثلاثة أحرف تذهب لترويسة التجميع). واللاتينية ١٦٠
 * و١٥٣. والخلط بينهما يجعل رسالةً تُقدَّر بمقطع فتُحاسَب بثلاثة.
 */
export const SMS_COST_PER_SEGMENT = 0.04;

export type SmsMetrics = { characters: number; segments: number; unicode: boolean; cost: string };

export function smsMetrics(text: string, costPerSegment = SMS_COST_PER_SEGMENT): SmsMetrics {
  // نقطة الرمز لا وحدة UTF-16: الرموز خارج المستوى الأساسي تُحسب واحدة
  const characters = [...text].length;
  const unicode = /[^ -~]/.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;

  const segments =
    characters === 0 ? 0 : characters <= single ? 1 : Math.ceil(characters / multi);

  return {
    characters,
    segments,
    unicode,
    cost: (segments * costPerSegment).toFixed(2),
  };
}

/**
 * المجموعة مشتقّة من بادئة المفتاح — لا عمود لها، ولا حاجة إليه.
 *
 * وكلّ بادئة موجودة مسمّاة: بادئتان بلا اسم تصيران مرشِّحَين متجاورين
 * مكتوبٌ عليهما «أخرى»، فيبدو الاثنان واحدًا مكرّرًا.
 */
const GROUP_LABEL: Record<string, string> = {
  auth: 'الدخول',
  account: 'الحساب',
  listing: 'الإعلان',
  offer: 'العروض',
  auction: 'المزاد',
  order: 'الطلب والدفع',
  escrow: 'الضمان',
  deposit: 'العربون',
  dispute: 'النزاعات',
  service: 'الخدمات',
};

export function groupOf(key: string): string {
  return key.split('.')[0] ?? 'other';
}

export function groupLabel(group: string): string {
  // البادئة نفسها لا «أخرى»: مجموعةٌ جديدة تظهر باسمها الخام فتُلاحَظ وتُسمَّى
  return GROUP_LABEL[group] ?? group;
}

/**
 * معاينة القالب بقيَم — **ما يراه المستخدم لا ما كتبه المحرّر**.
 *
 * والمتغيّر بلا قيمة يبقى كما هو ظاهرًا في المعاينة عمدًا: إخفاؤه
 * يجعل النصّ يبدو سليمًا وهو ناقص.
 */
export function renderTemplate(text: string, values: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => values[name] ?? whole);
}
