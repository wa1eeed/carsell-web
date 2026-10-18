import { BodyType, Drivetrain, FuelType, Transmission } from '@/generated/prisma/enums';

/**
 * ═══ خياراتُ المواصفة — ثابتٌ مشترك بين الخادم والعميل ═══
 *
 * **وموضعُه ملفٌّ بذاته لأنّ الحدّ يمرّ عبر الاستيرادات لا التوجيهات.**
 * كان `ALL_SPECS` في `catalog-options.ts`، وهي تستورد `db` — فمكوّنٌ
 * `'use client'` يستوردها يجرّ Prisma إلى حزمة المتصفّح ويُسقط البناء.
 * (وقع مرّتين قبله: `CategoryFilter` ومحرّر القوالب.)
 *
 * ═══ ولا تُكتب القائمةُ بيد ═══
 *
 * كُتبت مرّةً بيد فحملت `WAGON` و`FOURWD` **ولا وجود لهما في المخطّط**
 * — ومن اختار أحدهما أرسل قيمةً يردّها الخادم — ثمّ اكتسب التعدادُ
 * `CROSSOVER` و`CONVERTIBLE` و`PLUGIN_HYBRID` ولم تكتسبها هي.
 *
 * وأثرُ النقص لم يكن تجميليًّا: شجرةُ الوقود في الاستمارة تعرف الهجين
 * القابل للشحن وتفتح له البطارية والمدى ومنفذ الشحن، **ولا سبيل إلى
 * اختياره** — طرازٌ بلا فئاتٍ منشورة يعود بأربعة أنواعٍ ليس فيها هو.
 * قيمةٌ في المخطّط بلا بابٍ يصلها.
 *
 * فالاشتقاقُ من التعداد المولَّد: ما يحتاج حراسةً يُبنى محروسًا، ولا
 * بوابةَ تحرس نسخةً يدويّة إن لم تكن هناك نسخة.
 */
export type SpecOptions = {
  bodyTypes: string[];
  transmissions: string[];
  fuels: string[];
  drivetrains: string[];
  seats: number[];
  /** كم فئةً بُني منها الحصر — وصفرٌ يعني أن التعداد كاملٌ عن قصد */
  fromTrims: number;
};

export const ALL_SPECS: Omit<SpecOptions, 'fromTrims'> = {
  bodyTypes: Object.values(BodyType),
  transmissions: Object.values(Transmission),
  fuels: Object.values(FuelType),
  drivetrains: Object.values(Drivetrain),
  /** وعددُ المقاعد ليس تعدادًا — مجموعةٌ معقولة يختار منها البائع. */
  seats: [2, 4, 5, 7, 8],
};

export const ALL_OPTIONS: SpecOptions = { ...ALL_SPECS, fromTrims: 0 };
