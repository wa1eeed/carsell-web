/**
 * البيانات الأولية — BUILD-WEB-ADMIN.md القسم ٩.
 *
 * لماذا هذا الحجم: لا يمكن الحكم على صفحة نتائج البحث بأربعة إعلانات.
 * الشاشات صُمِّمت على كثافة حقيقية، فالزرع يبني كثافة حقيقية.
 *
 * السكربت **حتمي**: نفس المدخلات تعطي نفس المخرجات في كل تشغيل
 * (مولّد أرقام ببذرة ثابتة، ولا `Date.now()` ولا `Math.random`).
 * وهو **يمسح ويعيد البناء**، فلا يعمل إلا في تطوير أو staging.
 *
 * التشغيل: npm run db:seed
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { devPut, devStoreAllowed } from '../src/lib/storage/dev-store';
import { publicUrl } from '../src/lib/r2';
import { placeholderPng } from './placeholder-image';
import { hashPassword } from '../src/lib/auth/password';
import { encryptSecret } from '../src/lib/crypto/secrets';
import { mintKey } from '../src/lib/api/key-mint';
import { checkIban, ibanLast4 } from '../src/lib/domain/iban';
/** **ونقيّةٌ بلا `db`** — فالاستيرادُ الساكن لا يجرّ عميلًا قبل تحميل البيئة. */
import { inspectorCodeFor } from '../src/lib/domain/inspector-code';
import { BASE_FEATURES, FROM_2020_FEATURE, plantReference } from './reference';
import { Prisma } from '../src/generated/prisma/client';
import type { ProviderType } from '../src/generated/prisma/enums';

try {
  process.loadEnvFile();
} catch {
  // المتغيّرات من البيئة نفسها
}

// ═══════════════════════════════════════════════════════════
//  الحارس — لا زرع في الإنتاج بأي حال
// ═══════════════════════════════════════════════════════════

const APP_ENV = process.env.APP_ENV ?? 'development';

if (APP_ENV === 'production') {
  console.error(
    [
      '',
      '✗ رفض التشغيل: APP_ENV=production',
      '',
      '  سكربت الزرع يمسح كل الجداول ويعيد بناءها ببيانات وهمية.',
      '  تشغيله على الإنتاج يعني فقدان بيانات حقيقية لا تستعاد.',
      '',
      '  الإنتاج يرحل بـ`prisma migrate deploy` فقط — لا زرع ولا `db push`.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString === '') {
  console.error('✗ DATABASE_URL غير مضبوط — راجع .env.example');
  process.exit(1);
}

/**
 * ═══ ووحدةُ الدفتر تُحمَّل كسولًا ═══
 *
 * `ledger-events` تجرّ `ledger.ts` التي تبني عميل التطبيق **وقت
 * تحميل الوحدة**، وهو يقرأ `DATABASE_URL` عندها. والبذرة تُحمّل
 * بيئتها بنفسها في أعلى الملفّ — لكنّ استيرادًا ساكنًا يسبقها،
 * فيسقط الزرع بـ«DATABASE_URL غير مضبوط» وهو مضبوط.
 */
type LedgerEvents = Awaited<ReturnType<typeof loadLedger>>;
const loadLedger = () => import('../src/lib/domain/ledger-events');

type Documents = Awaited<ReturnType<typeof loadDocuments>>;
const loadDocuments = () => import('../src/lib/domain/documents');

let documentsModule: Documents | null = null;
async function documents(): Promise<Documents> {
  documentsModule ??= await loadDocuments();
  return documentsModule;
}

let ledgerModule: LedgerEvents | null = null;
async function ledgerEvents(): Promise<LedgerEvents> {
  ledgerModule ??= await loadLedger();
  return ledgerModule;
}

/** **وأرقامُ الطلب تُحسب بحاسبة المنتج** — ولو زُرعت بيدٍ ناقضت قاعدةَ العمولة. */
type Amounts = Awaited<ReturnType<typeof loadAmounts>>;
const loadAmounts = () => import('../src/lib/domain/order-amounts');

type Money = Awaited<ReturnType<typeof loadMoney>>;
const loadMoney = () => import('../src/lib/domain/money');

let moneyModule: Money | null = null;
async function money(): Promise<Money> {
  moneyModule ??= await loadMoney();
  return moneyModule;
}

let amountsModule: Amounts | null = null;
async function computeOrderAmounts(
  ...args: Parameters<Amounts['computeOrderAmounts']>
): ReturnType<Amounts['computeOrderAmounts']> {
  amountsModule ??= await loadAmounts();
  return amountsModule.computeOrderAmounts(...args);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
  log: ['error'],
});

const D = Prisma.Decimal;

/**
 * بصمة إدراكية مزروعة — **متباعدةٌ عن غيرها فعلًا**.
 *
 * كانت `${ref}-${n}`، فتختلف بصمتان بحرفٍ واحد ومسافة هامينغ بينهما ١
 * — والحدّ ٦. **فكل صورة مزروعة نسخةٌ من كل أخرى**، وأيّ إعلان جديد
 * يُحال إلى المراجعة بتهمة التكرار. وليست هذه علّة اختبار: هي حالُ
 * المنتج على هذه البيانات.
 *
 * والبصمة الحقيقية ستّ عشرة خانة سداسية عشرية (٦٤ بت). فتُولَّد هنا
 * بتجزئةٍ ثابتة — تتكرّر مع كل زرع، وتتباعد فيما بينها.
 */
function seedPhash(ref: string, index: number): string {
  const seed = `${ref}#${String(index)}`;
  let hash = 0x811c9dc5;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  // ستّ عشرة خانة من أربع جولات — فتتوزّع البتّات ولا تتشابه الرؤوس
  let out = '';
  for (let round = 0; round < 4; round += 1) {
    hash = Math.imul(hash ^ (hash >>> 15), 0x2545f491) >>> 0;
    out += hash.toString(16).padStart(8, '0').slice(0, 4);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════
//  أدوات حتمية
// ═══════════════════════════════════════════════════════════

/** mulberry32 — مولّد ببذرة ثابتة، فالزرع يعيد نفس النتيجة دائمًا. */
function makeRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = makeRandom(20260802);
const pick = <T,>(items: readonly T[]): T =>
  items[Math.floor(rnd() * items.length)] as T;
const between = (min: number, max: number): number =>
  Math.floor(rnd() * (max - min + 1)) + min;

/** لحظة مرجعية ثابتة — التخزين UTC والعرض بتوقيت الرياض في الواجهة. */
/**
 * ═══ لحظة البذرة — اليوم لا تاريخ مكتوب ═══
 *
 * كانت مثبتة على يوم كُتبت فيه، **فكل ما تزرعه يشيخ يومًا كل يوم**.
 * ومضى عليها شهران، فصار كل ما في المنصة أقدم من سبعين يومًا — وكل
 * شاشة تقيس «آخر ثلاثين يومًا» تُعرض أصفارًا.
 *
 * ولا شيء يسقط: البيانات صحيحة والاستعلام صحيح، **والمدى وحده خارجها**.
 * ومن يفتح لوحة القيادة يقرأ منصة ميتة وهي عامرة.
 *
 * فاللحظة اليوم عند التاسعة — **حتمية داخل اليوم الواحد** فلا يتغير
 * الزرع بين تشغيلين متتابعين، وتتحرك مع الأيام فلا تشيخ.
 * و`SEED_NOW` تثبّتها لمن يحتاج زرعًا مطابقًا لزرع سابق.
 */
const NOW = (() => {
  const fixed = process.env.SEED_NOW;
  if (fixed !== undefined && fixed !== '') return new Date(fixed);
  const today = new Date();
  today.setUTCHours(9, 0, 0, 0);
  return today;
})();
const days = (n: number): Date => new Date(NOW.getTime() + n * 86_400_000);

/**
 * ═══ والمزاد الحيّ يُقاس بالساعة الحقيقية لا بالمرساة ═══
 *
 * `NOW` مثبَّتةٌ عند التاسعة صباحًا UTC ليستقرّ ما يُزرع. **ونافذةُ
 * المزاد الحيّ لا تحتمل ذلك**: `hours(-6)` تساوي الثالثة فجرًا، فبذرةٌ
 * تُشغَّل قبلها تكتب `LIVE` ببدايةٍ **في المستقبل**؛ و`hours(2)` تساوي
 * الحادية عشرة، فبذرةٌ بعدها تكتب `LIVE` بنهايةٍ **منقضية**.
 *
 * وفي الحالين صفٌّ متناقض: الشاشة تحسبه غير حيٍّ (بحقّ) وحالتُه تقول
 * `LIVE` — فيسقط اختبارٌ لا علاقة له بما غُيّر، ويبدو تقطّعًا وهو
 * ساعةُ التشغيل. و`SEED_NOW` تظلّ مُطاعة فيبقى الزرع قابلًا للتثبيت.
 */
const REAL_NOW = (() => {
  const fixed = process.env.SEED_NOW;
  return fixed !== undefined && fixed !== '' ? new Date(fixed) : new Date();
})();
const realHours = (n: number): Date => new Date(REAL_NOW.getTime() + n * 3_600_000);
const hours = (n: number): Date => new Date(NOW.getTime() + n * 3_600_000);

/**
 * ═══ آيبانٌ يقبله فحصُ المنتج نفسه ═══
 *
 * كان البائعون يُبذرون بـ`SA03` + ١٨ خانة عشوائية: **٢٢ خانة لا ٢٤**،
 * وخانتا تحقّقٍ لا تطابقان شيئًا — فصفٌّ يرفضه `checkIban` يسكن عمودًا
 * يكتبه المنتج عبرها. و`ibanLast4` تقبله (تشترط ٨ خانات فقط) فلا يشتكي
 * أحد، حتى يُلصق في استمارةٍ فتردّه بـ«خانتا التحقّق».
 *
 * **والخانتان تُشتقّان بالفحص لا بحسابٍ ثانٍ**: `checkIban` هي مُطبِّقة
 * mod-97 الوحيدة، وتجربةُ تسعٍ وتسعين قيمةً عليها أرخصُ من نسخها.
 */
/**
 * رقمُ حسابٍ من ١٨ خانة — **بالتجزيء لا برقمٍ واحد**: `10 ** 17`
 * يتجاوز `MAX_SAFE_INTEGER`، فالعشوائيُّ فوقه يفقد خاناته الأخيرة
 * ويُطبَع أُسًّا — فيخرج آيبانٌ فيه حرف `e`.
 */
function seedAccountDigits(): string {
  const half = (): string => String(between(100_000_000, 999_999_999));
  return `${half()}${half()}`;
}

function seedIban(bank: string, account: string): string {
  for (let check = 0; check < 100; check += 1) {
    const candidate = `SA${String(check).padStart(2, '0')}${bank}${account}`;
    if (checkIban(candidate).ok) return candidate;
  }
  throw new Error(`لا خانتي تحقق صحيحتين لـ${bank}${account}`);
}

/**
 * وسمُ ما زرعته البذرة من صفوفٍ يحذفها تنظيفُ الاختبارات بالشكل —
 * ويُقرأ في `tests/global-setup.ts` بالاسم نفسه.
 */
const SEED_NOTE = 'seed';

/**
 * كلمةُ التطوير — **تُكتب مرّة**.
 *
 * كانت مكتوبةً في موضع التجزئة، والسطرُ الذي يطبعها يطبع `?? ''` —
 * فيقول «كلمة المرور: » ولا شيء بعدها، والحساب له كلمةٌ تعمل. ومن
 * قرأ السطرَ حسب الزرعَ ناقصًا وهو تامّ.
 */
const DEV_PASSWORD = 'CarSell!dev2026';

/**
 * لوحاتٌ مزروعة — بحروفٍ عريضة وضيّقة وبعددٍ مختلف، فتُقاس اللوحة في
 * حالاتها لا في حالةٍ واحدة. والحروفُ من السبعة عشر المعتمدة وحدها.
 */
const PLATES = [
  'ا ب ح',
  'ص ص ص', // أعرضُ ثلاثةٍ — تُفيض الخانة لو حُسبت بمتوسّط
  'ا ا ا', // أضيقُها
  'ر ط ع',
  'ك ل م',
  'س ع د',
  'ن ه و',
  'ق د ى',
  'ط ا ل',
  'ب ح', // حرفان
  'د', // حرفٌ واحد — الحدّ الأدنى
] as const;

/**
 * ═══ مدنُ البيانات المزروعة ═══
 *
 * **وتُحاكي توزيعَ السوق لا تُقسَّم بالتساوي**: ثلثُ مبيعات السيارات
 * في المملكة في الرياض، ولا يُشبه سوقًا أن تتساوى عرعرُ بها. فالأوائلُ
 * تتكرّر في المصفوفة — والاختيارُ العشوائيّ منها يرجّحها بلا وزنٍ
 * يُكتب.
 *
 * وأربعَ عشرةَ مدينةً لا ثماني: مرشِّحُ المدن يعرض ما له نتيجة (وهو
 * الصواب)، فمدنٌ لا إعلانَ فيها تختفي منه — **وبيئةٌ بثمانٍ تجعل
 * صفحاتِ الهبوط المدنيّةَ كلَّها فارغةً إلّا ثماني**.
 */
const CITIES = [
  'الرياض',
  'الرياض',
  'الرياض',
  'جدة',
  'جدة',
  'الدمام',
  'الدمام',
  'الخبر',
  'مكة المكرمة',
  'المدينة المنورة',
  'الطائف',
  'أبها',
  'تبوك',
  'بريدة',
  'الأحساء',
  'خميس مشيط',
  'حائل',
  'الجبيل',
  'ينبع',
  'نجران',
] as const;

const COLORS = [
  'أبيض',
  'أسود',
  'فضي',
  'رمادي',
  'أزرق',
  'بني',
  'أحمر',
] as const;

const SEED_DIR = join(process.cwd(), 'prisma', 'seed-data');
const load = <T,>(name: string): T =>
  JSON.parse(readFileSync(join(SEED_DIR, name), 'utf8')) as T;

// ═══════════════════════════════════════════════════════════
//  المسح — بترتيب يحترم المفاتيح الأجنبية
// ═══════════════════════════════════════════════════════════

async function reset(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "CreditNote","TaxInvoiceLine","TaxInvoice","TaxRule",
      "VehicleSaleAgreement","SettlementStatement",
      -- **و WebhookEvent يسمى ولا يترك للتتابع**: مفتاحه إلى الدفعة
      -- SET NULL، فلولا التسمية لبقي صف يتيم يصف دفعة لا وجود لها.
      -- (والعلامة الخلفية تنهي القالب النصي هنا، فلا تكتب فيه.)
      "WebhookEvent","PaymentEvent","Payment","PaymentRouteChange","PaymentRoute","PaymentGateway",
      "DeviceToken","NotificationPreference","PushChannel","CampaignSend","Campaign","Segment",
      "ApprovalRequest","AuditLog","Report","PriceStat","SeoTemplate","Integration",
      "AdCampaign","AdSlot","NotificationTemplate","FaqPlacement","FaqItem",
      "SavedSearch","Favorite","FinanceInput","CommissionRule","PlatformSetting",
      "Subscription","PlanEntitlement","Entitlement","Plan","EntitlementOverride",
      "FinanceSetting","FinanceProvider","InspectionReport","ServiceRequest","Service",
      "ServiceProvider","Invoice","Dispute","Escrow","OrderEvent","Order",
      "DealerSession","VehicleCost","Deposit","CancelledBid","Bid","Auction","Offer","ListingFeature","ListingImage","Listing",
      "VehicleHistoryItem","Vehicle","Branch","TrimFeature","Feature","Trim","Model","Brand",
      "OtpChallenge","AdminUser","User","Dealer",
      -- **والدفتر ليس له مفتاح خارجي إلى الطلب، فلا يفرغ بالتعاقب.**
      -- فكان يتراكم عبر كل تشغيل اختبار ولا يمسح أبدا: قرأت فيه
      -- ٢٠٧٬٧٥٠ «لدى مزود الدفع» والمال الفعلي ٣٤٤٬٥٧٠ — ورقم في
      -- دفتر لا يطابق ما في الصناديق ليس خطأ عرض بل دفتر غير موثوق.
      "LedgerEntry",
      -- **ودفتر التجريبية مثله**: مرجع الحجز فيه فريد، وصف باق من
      -- تشغيل سابق يسقط البذرة بـ"Unique constraint failed on ref"
      -- والرسالة تتهم الإنشاء لا البقية.
      "SandboxTransaction",
      -- **و ReconciliationRun مثله**: مفتاح البوابة فيه نص لا علاقة،
      -- فلا يفرغ بالتعاقب ولا يمسحه شيء. وقيس: ثلاثة صفوف لكل بوابة
      -- و"اثنا عشر" للمصرفية — تسعة من تشغيلات سابقة، تقرأها اللوحة
      -- فتقول "طوبقت" عن يوم لا بيانات له في هذه البيئة.
      "ReconciliationRun"
    RESTART IDENTITY CASCADE;
  `);
}

// ═══════════════════════════════════════════════════════════
//  الزرع
// ═══════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log(`زرع البيانات الأولية · APP_ENV=${APP_ENV}`);
  await reset();

  // ————— ٣ حسابات أدمن بالأدوار —————
  //
  // كلمة مرور واحدة معروفة للتطوير — والدخول بها وحدها
  // يمكن الدخول بلا مسح رمز QR في كل إعادة زرع. السرّ يُطبع أدناه.
  // لا يعمل هذا إلا خارج الإنتاج — الحارس أعلى الملف يمنعه.
  /**
   * **والافتراضيّ للتطوير وحده.** الحارس أعلى الملف يمنع الإنتاج، لكنّ
   * **staging ليست إنتاجًا** — فكانت تُنشَر بحسابِ أدمن كلمتُه مكتوبة
   * في المستودع، على عنوانٍ عامّ. ومن قرأ الشيفرة دخل اللوحة.
   *
   * فالسقوط الآن **مُغلَق**: خارج التطوير لا زرع بلا كلمة صريحة.
   */
  const seedPassword = process.env.ADMIN_PASSWORD ?? null;
  if (seedPassword === null && APP_ENV !== 'development') {
    console.error(
      `\n✗ رفض التشغيل: APP_ENV=${APP_ENV} بلا ADMIN_PASSWORD.\n` +
        '  الافتراضي مكتوب في المستودع، ونشره على عنوان عام يفتح اللوحة لمن قرأه.\n' +
        '  اضبط كلمة قوية واحتفظ بها:  openssl rand -base64 24\n',
    );
    process.exit(1);
  }
  const seedPasswordHash = await hashPassword(seedPassword ?? DEV_PASSWORD);

  /**
   * بريد السوبر أدمن من البيئة — فلا يُشحن نطاقٌ ثابت إلى كل نشر،
   * ومن ينشر على نطاقه يدخل ببريده هو.
   */
  const superEmail = process.env.ADMIN_EMAIL ?? 'super@carsell.one';

  const admins = await Promise.all(
    (
      [
        [superEmail, 'وليد — سوبر أدمن', 'SUPER_ADMIN'],
        ['ops@carsell.one', 'نورة — التشغيل', 'OPS'],
        ['finance@carsell.one', 'سلطان — المالية', 'FINANCE'],
      ] as const
    ).map(([email, name, role]) => {
      return prisma.adminUser.create({
        data: {
          email,
          name,
          role,
          passwordHash: seedPasswordHash,
          // المصادقة الثنائية أُلغيت بقرار المصمّم — الدخول بالكلمة وحدها
          mustChangePassword: false,
        },
      });
    }),
  );
  const superAdmin = admins[0] as (typeof admins)[number];

  /**
   * ═══ المُمهِّد أوّلًا — ثم ما لا يصل الإنتاجَ ═══
   *
   * كلُّ ما تحتاجه قاعدةٌ لتعمل — الإعداداتُ والباقاتُ والكتالوج
   * والخدماتُ وقواعدُ الضريبة والقوالبُ والبوّابات — في
   * `prisma/reference.ts`، **يقرؤه هذا ويقرؤه الإقلاع**. ولو نُسخ
   * هنا لتباعدت النسختان أوّلَ تغيير: صفٌّ يُضاف للبذرة فلا يصل
   * نشرًا، أو العكس.
   *
   * **وأوّلًا لأن البذرةَ تبني عليه**: الفئاتُ تصنع المركبات، والخدماتُ
   * تُطلب، وقاعدةُ الضريبة تُحسب بها أرقامُ كلّ طلب.
   *
   * و`activeFrom` يسبق «الآن» سنةً: الطلباتُ المزروعة مؤرَّخةٌ في
   * الماضي، و`supplyVatPct` تنتقي القاعدةَ السارية في تاريخها.
   */
  const reference = await plantReference(prisma, {
    adminId: superAdmin.id,
    now: NOW,
    activeFrom: days(-365),
  });
  /**
   * ═══ قنواتُ الدعم — في البذرة لا في المُمهِّد ═══
   *
   * كتلةُ «عندك استفسار؟» في الرئيسية تُرسَم بما في الإعدادات، وما لم
   * يُضبط لا يُرسَم (رابطُ واتساب بلا رقمٍ يفتح على خطأ) — **فلا بيئةَ
   * تُريها**، والزائرُ الأوّل لا يجد قناةً في الصفحة التي يصلها أوّلًا.
   *
   * **ولا تُوضع في `reference.ts`**: ذاك يصل الإنتاج، ورقمُ دعمٍ
   * مخترَعٌ على موقعٍ حيّ أسوأ من غيابه — يتّصل به أحد. فهذه للتطوير
   * والتجريب، ويكتب المالكُ أرقامَه من `/admin/contact` قبل الإطلاق.
   */
  await prisma.platformSetting.update({
    where: { id: 'default' },
    data: { supportPhone: '920001234', supportWhatsapp: '+966500000000' },
  });

  const allTrims = reference.trims;
  type TrimRef = (typeof allTrims)[number];
  const freePlan = await prisma.plan.findUniqueOrThrow({ where: { key: 'free' } });
  const featureKeys = (await prisma.feature.findMany({ select: { key: true } })).map((f) => f.key);

  /**
   * ═══ وما تضعه البذرةُ فوق المُمهِّد ═══
   *
   * **العمولةُ في التطوير وحده.** المُمهِّد يزرع القاعدتين صفرًا
   * معطَّلتين — قيمتُهما قرارُ المالك، والصفُّ مقبضُه. وصفرٌ في
   * التطوير **يُخفي كلَّ عطبٍ في مسار العمولة**: صفرٌ من أيّ أساسٍ
   * صفر، ومن أيّ طرفٍ صفر — فعاشت ثلاثُ فجوات شهورًا ولم يكشفها
   * اختبار، كشفها ضبطُ نسبةٍ حقيقية من اللوحة.
   *
   * **وعلى المشتري لا على البائع** (قرار المالك ٢٠٢٦-١٠-١٧): عمولةُ
   * بائعٍ مفعَّلة تُكذّب وعدَ «صفر عمولة على البيع» المكتوب في أربعة
   * مواضع، فتُرفع الجملةُ في كل بيئة تطوير وهي صادقةٌ أصلًا.
   */
  if (APP_ENV === 'development') {
    await prisma.commissionRule.updateMany({
      where: { scope: 'global', side: 'BUYER' },
      data: { enabled: true, pct: new D('2.50') },
    });
  }

  /** **ومزوّدُ الخدمة يُربط بعد زرعه** — والمُمهِّد لا يعرف مزوّدًا. */

  // ————— المزوّدون وربطُ خدماتهم —————
  const providerDefs = [
    ['مركز فحص المستقبل', 'Mustaqbal Inspection Centre', 'INSPECTION', 48],
    ['ناقل للشحن', 'Naqil Transport', 'SHIPPING', 96],
    ['تأمين الراجحي', 'Al Rajhi Takaful', 'INSURANCE', 1],
    /**
     * ═══ ومزوّدُ نقل الملكية — وكانت خدمتُه تُعرض ولا تُطلب ═══
     *
     * قِيس: `ownership_transfer` معروضةٌ في **الصفحة الرئيسية**
     * بـ٣٥٠ ريالًا و`providerType = NULL`، فـ`cityPool(null)` تُعيد
     * فراغًا و`requestService` تردّ `CITY_NOT_COVERED` **دائمًا**.
     * فصار لها صنفٌ (ترحيل `20261017160100`) — **ولا يكفي**: صنفٌ
     * بلا مزوّدٍ في أيّ مدينة يردّ الردَّ نفسه.
     */
    ['وكيل نقل الملكية', 'Tamleek Transfer Agent', 'TRANSFER', 72],
    ['ديتيل برو', 'Detail Pro', 'DETAILING', 48],
    ['عدسة للتصوير', 'Adasa Studio', 'PHOTOGRAPHY', 48],
  ] as const;

  const providers = new Map<ProviderType, string>();
  for (const [nameAr, nameEn, type, sla] of providerDefs) {
    const p = await prisma.serviceProvider.create({
      data: {
        nameAr,
        nameEn,
        type,
        slaHours: sla,
        contactPhone: '+966112000000',
        commissionPct: new D('15.00'),
        cities: [...CITIES].slice(0, 4),
        active: true,
        /**
         * ═══ وحسابُ دفعٍ مفعَّل — وإلّا فالبيئة لا تفحص ═══
         *
         * طابورُ المدينة يستبعد من لا حساب له: يُسنَد إليه طلبٌ فيؤدّيه
         * ثمّ لا سبيل إلى دفع مستحقّه. **وبلا هذا السطر الطابورُ صفرٌ
         * دائمًا**، فكل طلبِ فحصٍ يُردّ بـ«لا تغطية» — واختبارٌ يقيس
         * الرحلة يمرّ على فرع الرفض ويبدو أخضر.
         *
         * والمعرّفان شكلُ ما يردّه المزوّد لا قيمةٌ حقيقية — والربط
         * الحيّ يستبدلهما بما يُنشئه.
         */
        accountStatus: 'ACTIVE',
        accountRef: `seed-merchant-${type.toLowerCase()}`,
        payoutRef: `seed-entity-${type.toLowerCase()}`,
        accountSyncAt: NOW,
        /**
         * ═══ وأين يُحوَّل مستحقُّه ═══
         *
         * `PROVIDER_PAYABLE` يُقيَّد له عند كل خدمةٍ تُنجَز، والصرف
         * يردّ `NO_IBAN` بلا هذا الحقل — **فبيئةٌ بلا آيبانٍ مزروع
         * لا يُصرف فيها لأحد**، وطابورُ الصرف يُعرض كلُّه معطَّلًا.
         *
         * ومشفَّرٌ كما يكتبه المنتج، وبخانتَي تحقّقٍ صحيحتين.
         */
        iban: encryptSecret(seedIban(String(between(10, 99)), seedAccountDigits())),
      },
    });
    providers.set(type, p.id);

    /**
     * ═══ ولكلّ مزوّدٍ حسابُ دخول ═══
     *
     * قرار المالك: لوحةُ مزوّدين موحَّدة يُسنَد فيها الطلب ويُعالَج
     * ويُؤكَّد. **وبلا حسابٍ لا يدخلها أحد**، فتبقى اللوحة شاشةً لا
     * يراها إنسان — والبيئة لا تُنهي طلبًا.
     *
     * والبريد مشتقٌّ من الصنف فلا يُكتب بيد، والكلمة تُغيَّر عند أوّل
     * دخول (`mustChangePassword`).
     */
    await prisma.providerUser.create({
      data: {
        providerId: p.id,
        email: `${type.toLowerCase()}@provider.example`,
        name: `مشغل ${nameAr}`,
        /**
         * **ولا كلمةَ ثابتة هنا.** الحارس أعلى الملف يرفض الزرع خارج
         * التطوير بلا `ADMIN_PASSWORD` صريحة، وكلمةٌ أكتبها هنا تتجاوزه
         * — فيُنشَر مزوّدٌ كلمتُه في المستودع على عنوانٍ عامّ. وهو
         * الخطأ الذي أُغلق مرّةً في حساب الأدمن.
         */
        passwordHash: seedPasswordHash,
      },
    });
  }

  /**
   * ═══ وربطُ المزوّد — والمُمهِّد لا يعرف مزوّدًا ═══
   *
   * الخدماتُ التسع زرعها المُمهِّد بأسمائها وأسعارها وبنودها، و`providerId`
   * **فارغةٌ عنده بحقّ**: المزوّدون كياناتٌ يُنشئها التشغيل لا بياناتٌ
   * مرجعية، ومُمهِّدٌ يربط خدمةً بمزوّدٍ وهميّ يشحنه إلى الإنتاج.
   *
   * فالبذرةُ تربط ما زرعته من مزوّدين، والصنفُ يُقرأ من الصفّ نفسه —
   * فطابورُ المدينة يُشتقّ من `providerType`، وفراغُها يردّ كلَّ طلبِ
   * فحصٍ بـ«لا تغطية».
   */
  const services = new Map<string, string>();
  /** سعرُ كلِّ خدمة — فطلبُ الخدمة لا يُسعَّر برقمٍ مكتوبٍ بيد. */
  const servicePrices = new Map<string, Prisma.Decimal>();
  for (const row of await prisma.service.findMany({
    select: { id: true, key: true, price: true, providerType: true },
  })) {
    const provider = row.providerType === null ? null : (providers.get(row.providerType) ?? null);
    if (provider !== null) {
      await prisma.service.update({ where: { id: row.id }, data: { providerId: provider } });
    }
    services.set(row.key, row.id);
    servicePrices.set(row.key, row.price);
  }

  // ————— المعارض (Wg مرحلة أولى) —————
  /**
   * **والعنوان وساعات العمل من صلب بيانات المعرض.** زائر صفحة المعرض
   * يسأل «أين ومتى أزوره؟» — وكانا غائبَين عن البذرة كلّها، فبطاقة
   * «الموقع وساعات العمل» في التصميم تفتح على فراغٍ دائم.
   */
  const dealerDefs = [
    ['al-safwa', 'معرض الصفوة', 'Al Safwa Motors', 'الرياض', true, '4.80', 142, 'طريق الملك عبدالعزيز، حي الملقا'],
    ['al-nokhba', 'معرض النخبة', 'Al Nokhba Cars', 'الرياض', true, '4.60', 98, 'طريق الملك فهد، حي النرجس'],
    ['jeddah-auto', 'جدة أوتو', 'Jeddah Auto', 'جدة', true, '4.40', 61, 'شارع الأمير سلطان، حي الروضة'],
    ['sharq-motors', 'معرض الشرق', 'Sharq Motors', 'الدمام', false, null, 0, 'طريق الكورنيش، حي الشاطئ'],
  ] as const;

  /** أيام الأسبوع السعوديّ: الجمعة مساءً وحده. */
  const DEALER_HOURS = [
    { day: 'السبت – الخميس', open: '09:00', close: '22:00' },
    { day: 'الجمعة', open: '16:00', close: '22:00' },
  ];

  const dealers = await Promise.all(
    dealerDefs.map(([slug, nameAr, nameEn, city, verified, rating, count, address]) =>
      prisma.dealer.create({
        data: {
          slug,
          nameAr,
          nameEn,
          city,
          verified,
          ratingAvg: rating === null ? null : new D(rating),
          ratingCount: count,
          status: verified ? 'ACTIVE' : 'PENDING',
          phone: '+966112345678',
          address: `${address}، ${city}`,
          hours: DEALER_HOURS,
          aboutAr: `${nameAr} — بيع وشراء السيارات المستعملة والجديدة في ${city}.`,
          aboutEn: `${nameEn} — buying and selling used and new cars in ${city}.`,
          crNumber: `10${between(10000000, 99999999)}`,
          /**
           * ═══ والمعرضُ المعتمَد مسجَّلٌ ضريبيًّا ═══
           *
           * **وبلا رقمٍ ضريبيّ لا تصدر له فاتورة بيعٍ واحدة.**
           * `sellerTypeFor` تقرأ `DEALER_NO_VAT` لمن لا تسجيلَ له،
           * وقاعدتُها تنتظر إقرارَ المشغّل — فكلُّ بيعٍ في البيئة
           * المزروعة يُحجب بـ`RULE_AWAITING_APPROVAL` بلا أن يشكو
           * أحد: المالُ يُسوَّى والوثيقةُ لا تخرج.
           *
           * وهو «البذرة تُنتج بيئةً لا تبيع» في موضعٍ ثانٍ. والرقم
           * السعوديّ خمسةَ عشرَ رقمًا يبدأ بـ٣ وينتهي بـ٣.
           */
          vatNumber: verified ? `3${between(10000000, 99999999)}${between(100000, 999999)}3`.slice(0, 15) : null,
          createdAt: days(-between(200, 900)),
        },
      }),
    ),
  );

  // ————— المستخدمون —————
  const individualNames = [
    'خالد العتيبي',
    'فهد الدوسري',
    'سعود العنزي',
    'ريم القحطاني',
    'عبدالله الشهري',
    'منى الحربي',
    'ماجد الغامدي',
    'نوف السبيعي',
  ] as const;

  const sellers = await Promise.all(
    individualNames.map((name, i) =>
      prisma.user.create({
        data: {
          phone: `+9665${String(10000000 + i).padStart(8, '0')}`,
          name,
          email: `seller${i + 1}@example.com`,
          /**
           * **والحقلان يتبعان بعضهما.** `identityStatus` هي الحقيقة
           * و`idVerified` مشتقٌّ منها (`identity-state.ts`). وكانت
           * البذرة تكتب الراية وحدها، فيصير ٥٣ مستخدمًا «موثَّقين»
           * يشترون، وشاشة توثيق الهوية تقول «موثّق ٠» وطابورُها فارغ.
           */
          identityStatus: 'VERIFIED',
          idVerified: true,
          idVerifiedAt: days(-between(30, 400)),
          /**
           * **مشفَّرًا كما يكتبه المنتج** — لا صريحًا. وكان صريحًا،
           * فصار في العمود صيغتان: قارئٌ يفكّ وقارئٌ يقصّ، وكلٌّ
           * يصيب على نصف الصفوف. والبيانات المزروعة تُحاكي شكل
           * الحقيقيّ لا اسمه فقط.
           */
          iban: encryptSecret(seedIban(String(between(10, 99)), seedAccountDigits())),
          createdAt: days(-between(60, 700)),
        },
      }),
    ),
  );

  const dealerUsers = await Promise.all(
    dealers.map((d, i) =>
      prisma.user.create({
        data: {
          phone: `+9665${String(20000000 + i).padStart(8, '0')}`,
          name: `مدير ${d.nameAr}`,
          email: `dealer${i + 1}@example.com`,
          role: 'DEALER',
          dealerId: d.id,
          /**
           * **ومن سجّل المعرض مالكُه.** دورٌ داخل المعرض غيرُ دور
           * المنصّة: `role: 'DEALER'` يقول «حسابٌ تجاريّ»،
           * و`dealerRole: 'OWNER'` يقول «صاحبُ هذا المعرض» — ولوحةُ
           * المعرض تقرأ الثاني، فبلا زرعِه لا يدخلها أحدٌ في أيّ بيئة.
           */
          dealerRole: 'OWNER',
          /**
           * **والوضعُ الضريبيّ للمالك من رقمِ معرضه.** الفاتورة تُصدَر
           * باسم المنشأة ورقمِها، و`sellerTypeFor` تقرؤهما **من
           * المستخدم البائع** لا من صفّ المعرض — فمالكٌ بلا تسجيل
           * يجعل كلَّ بيعٍ `DEALER_NO_VAT` فتُحجب فاتورتُه.
           */
          ...(d.vatNumber === null
            ? {}
            : { taxStatus: 'VAT_REGISTERED' as const, vatNumber: d.vatNumber, taxStatusSetAt: days(-300) }),
          identityStatus: 'VERIFIED',
          idVerified: true,
          idVerifiedAt: days(-300),
          /**
           * **وبلا آيبانٍ لا يُحوَّل إلى المعرض ريال.** البذرةُ تكتبه
           * لكلّ بائعٍ فرد وتنساه لمالكي المعارض، فتُنتج معرضًا يبيع
           * ولا يُقبض — وشاشةُ تسوياته تقول «لا آيبان» عن كلّ معرضٍ
           * في البيئة.
           */
          iban: encryptSecret(seedIban(String(between(10, 99)), seedAccountDigits())),
          createdAt: days(-between(200, 900)),
        },
      }),
    ),
  );

  /**
   * ═══ فروعٌ وفريقٌ لمعرضٍ واحد — `D9` ═══
   *
   * **وواحدٌ يكفي**: ثلاثةُ فروعٍ لكل معرضٍ تجعل الشاذَّ قاعدةً،
   * ومعرضٌ بفرعٍ واحد هو الحالُ الشائع. فأوّلُ معرضٍ له ثلاثة —
   * فتُرى مصفوفةُ الأدوار وحصرُ البائع بفرعه — والباقي بلا فروع.
   */
  const leadDealer = dealers[0] as (typeof dealers)[number];
  const leadOwner = dealerUsers[0] as (typeof dealerUsers)[number];
  const branches = await Promise.all(
    [
      ['الملقا', 'الرياض'],
      ['العليا', 'الرياض'],
      ['الخرج', 'الخرج'],
    ].map(([name, city], i) =>
      prisma.branch.create({
        data: {
          dealerId: leadDealer.id,
          name: name as string,
          city: city as string,
          address: `شارع ${name as string}`,
          phone: '+966112345678',
          createdAt: days(-between(100, 400) - i),
        },
      }),
    ),
  );

  /** فريقُ المعرض — مديرٌ ومبيعاتٌ ومحاسب، ولكلٍّ موضعُه من المصفوفة. */
  const dealerTeam = await Promise.all(
    (
      [
        { name: 'خالد مدير الفرع', dealerRole: 'MANAGER', branchId: null },
        { name: 'نورة المبيعات', dealerRole: 'SALES', branchId: branches[0]?.id ?? null },
        { name: 'سعد المبيعات', dealerRole: 'SALES', branchId: branches[1]?.id ?? null },
        { name: 'ريم المحاسبة', dealerRole: 'ACCOUNTANT', branchId: null },
      ] as const
    ).map(({ name, dealerRole, branchId }, i) =>
      prisma.user.create({
        data: {
          phone: `+9665${String(21000000 + i).padStart(8, '0')}`,
          name,
          email: `team${i + 1}@example.com`,
          role: 'DEALER',
          dealerId: leadDealer.id,
          dealerRole,
          branchId,
          /**
           * ═══ وعضوُ المعرض يرث وضعَه الضريبيّ ═══
           *
           * `sellerTypeFor` تقرأ الوضعَ **من المستخدم البائع**، وكنتُ
           * أكتبه للمالك وحده — فإعلانٌ نشره بائعٌ في المعرض يُقرأ
           * `DEALER_NO_VAT`، وقاعدتُه تنتظر الإقرار، **فتُسوّى صفقتُه
           * ولا تخرج فاتورة**. والفاتورةُ باسم المنشأة ورقمِها أيًّا
           * كان من أدخل المركبة.
           */
          ...(leadDealer.vatNumber === null
            ? {}
            : {
                taxStatus: 'VAT_REGISTERED' as const,
                vatNumber: leadDealer.vatNumber,
                taxStatusSetAt: days(-200),
              }),
          identityStatus: 'VERIFIED',
          idVerified: true,
          idVerifiedAt: days(-200),
          createdAt: days(-between(50, 180)),
        },
      }),
    ),
  );
  /** ومديرُ الفرع يُسنَد إليه — فعمودُ «المدير» لا يبقى فارغًا كلَّه. */
  if (branches[0] !== undefined && dealerTeam[1] !== undefined) {
    await prisma.branch.update({
      where: { id: branches[0].id },
      data: { managerId: dealerTeam[1].id },
    });
  }
  void leadOwner;

  const buyers = await Promise.all(
    Array.from({ length: 14 }, (_, i) =>
      prisma.user.create({
        data: {
          phone: `+9665${String(30000000 + i).padStart(8, '0')}`,
          name: `مشتري ${i + 1}`,
          // الثلث غير موثَّق — وحالتُه تتبع رايته، فيصير الطابور واقعيًّا
          identityStatus: i % 3 !== 0 ? 'VERIFIED' : i % 3 === 0 && i % 2 === 0 ? 'PENDING' : 'NONE',
          idVerified: i % 3 !== 0,
          ...(i % 3 === 0 && i % 2 === 0
            ? {
                identitySubmittedAt: days(-between(1, 4)),
                /**
                 * ═══ ومن قدّم هويّته أدخل حسابَه البنكيّ ═══
                 *
                 * مراجعةُ `A18` كلُّها **مقابلةُ اسم حساب البنك باسم
                 * الهوية** — وملاحظةُ الترميز عن ذلك وحده. وكان المنتظرون
                 * بلا `bankName` ولا `iban`، فكتلةُ «البيانات المُدخَلة»
                 * لا تُرسَم في أيّ بيئة والمراجعُ يقرّر بلا ما يقابله.
                 *
                 * **والاسمُ مختصرٌ عمدًا** («مشتري ١» ← «م. ١»): حالةُ
                 * الاختصار هي التي تشرحها الملاحظة، وبيئةٌ كلُّ أسمائها
                 * متطابقة لا تُري المراجعَ القرارَ الذي يُراجَع لأجله.
                 */
                bankName: `${(['الراجحي', 'الأهلي', 'البلاد', 'الإنماء'] as const)[i % 4]}`,
                iban: encryptSecret(seedIban(String(between(10, 99)), seedAccountDigits())),
              }
            : {}),
          /**
           * ═══ ومشترٍ مكتملُ الملفّ — وإلّا فالبيئة لا تشتري ═══
           *
           * حارسُ الشراء يفحص **البريد والهوية والوضع الضريبيّ** معًا
           * (`profileCompletion`). والبذرة كانت تترك `taxStatus` فارغًا
           * للجميع — **فصفرُ مستخدمين يستطيعون الشراء** في كل بيئةٍ
           * مزروعة، ولا مشي رحلةٍ يكتمل.
           *
           * ولا يُجعل الكلُّ مكتملًا: طابور «أكمل ملفّك» جزءٌ من المنتج،
           * فالثلث الأوّل مكتمل وما بقي على حاله.
           */
          ...(i % 3 === 1
            ? {
                email: `buyer${String(i + 1)}@example.com`,
                taxStatus: 'INDIVIDUAL' as const,
                taxStatusSetAt: days(-between(5, 60)),
              }
            : {}),
          createdAt: days(-between(5, 300)),
        },
      }),
    ),
  );

  /**
   * ═══ وباقةُ المعرض الأوّل غيرُ المجّانية ═══
   *
   * `team_seats` في المجّانية **صفر** — فمعرضٌ عليها لا يدعو أحدًا،
   * وشاشةُ `D9` تُفتح على «لا مقاعد شاغرة» في كلّ بيئة. والترميز يرسم
   * «٦ من ٨ مقاعد»، وهي باقةُ `dealer_pro`.
   *
   * **وواحدٌ يكفي**: ترقيةُ كلّ المعارض تجعل الشاذَّ قاعدةً، ومعرضٌ
   * على المجّانية هو الحالُ الأوّل لكلّ من يسجّل.
   */
  const proPlan = await prisma.plan.findUnique({ where: { key: 'dealer_pro' } });
  await prisma.subscription.createMany({
    data: [...sellers, ...dealerUsers].map((u) => ({
      userId: u.id,
      planId:
        proPlan !== null && u.id === (dealerUsers[0]?.id ?? '') ? proPlan.id : freePlan.id,
      startsAt: u.createdAt,
      status: 'active',
    })),
  });

  // ————— ٦٠ إعلانًا على الأنواع والمدن والحالات —————
  /**
   * **والسوقُ المعروض يُبنى من الفئات الموصوفة كاملةً وحدها.**
   * الكتالوج العريض يحمل فئةً «قياسية» لكل طراز بلا سعةِ محرّكٍ ولا
   * سلندرات — صادقةً عن قصد — وإعلانٌ تجريبيّ يُبنى منها يعرض مركبةً
   * ناقصةَ الوصف في واجهةٍ يُقاس عليها الشكل. فالبذرةُ تعرض ما يكتمل.
   */
  /**
   * ═══ والكهربائيّةُ بلا سعةِ محرّك — وهو صوابُها ═══
   *
   * كان الشرطُ `engineL !== null` وحده، **فلا فئةً كهربائيةً واحدة
   * تُزرع أبدًا**: أربعٌ وعشرون في الكتالوج وكلُّها بلا سعة، لأنّ
   * الكهربائيةَ لا محرّكَ احتراقٍ لها. فالشرطُ الذي وُضع ليستبعد
   * بياناتٍ ناقصة كان يستبعد **صنفًا كاملًا بياناتُه تامّة**.
   *
   * وأثرُه يُقرأ في الرئيسية: شريحةُ «كهربائية» التي يرسمها الترميز
   * مبنيّةٌ ومشتقّةٌ من المخزون — ولا تظهر في أيّ بيئة لأنّ المخزون
   * لا يحمل كهربائيةً واحدة. وكذلك ترشيحُ الوقود في البحث.
   */
  const buildableTrims = allTrims.filter(
    (t) => t.row.yearTo === null && (t.row.engineL !== null || t.row.fuel === 'ELECTRIC'),
  );

  /** أوصافٌ بلغة السوق — لا جملًا تسويقية. */
  const DESCRIPTIONS: readonly string[] = [
    'سيارة بحالة ممتازة، صيانة دورية في الوكالة ومالك واحد منذ الشراء. الصبغ في الرفرف الأيمن من خدش في موقف، ومثبت في تقرير الفحص. الإطارات الأمامية مغيرة قبل ستة أشهر. قابلة للفحص في أي مركز يختاره المشتري.',
    'ممشى قليل والاستعمال داخل المدينة فقط. الصيانة كلها في الوكالة وفواتيرها موجودة. لا حوادث ولا صبغ. السعر قابل للتفاوض للجاد.',
    'نظيفة جدا من الداخل والخارج، بصمة كاملة وشاشة أصلية. غيرت البطارية والمكابح الأمامية هذا العام. الرخصة والتأمين ساريان حتى نهاية السنة.',
    'مستخدمة في مشاوير العمل والطريق السريع، لذلك الممشى أعلى من مثيلاتها والمحرك بحالة ممتازة. آخر صيانة على عشرة آلاف كيلو. جاهزة للنقل فورا.',
    'ثاني مالك، والأول اشتراها من الوكالة. يوجد خدش بسيط على المصد الخلفي موضح في الصور ولم يصبغ. تسلم بعد فحص المشتري ولا مانع من الفحص قبل الشراء.',
  ];

  type ListingRef = {
    id: string;
    ref: string;
    type: 'DIRECT' | 'NEGOTIATION' | 'AUCTION';
    askPrice: Prisma.Decimal;
    vehicleId: string;
    sellerId: string;
    city: string;
  };
  const listings: ListingRef[] = [];
  const vehicleIds: string[] = [];

  // ٣٠ مباشر · ٢٠ تفاوض · ١٠ مزاد
  const plan: ('DIRECT' | 'NEGOTIATION' | 'AUCTION')[] = [
    ...Array.from({ length: 30 }, () => 'DIRECT' as const),
    ...Array.from({ length: 20 }, () => 'NEGOTIATION' as const),
    ...Array.from({ length: 10 }, () => 'AUCTION' as const),
  ];

  /**
   * ═══ وثلاثةٌ من مدينةٍ وطرازٍ واحد — عمدًا ═══
   *
   * صفحةُ الهبوط «طراز في مدينة» تُولَّد عند ثلاثة إعلانات، والاختيار
   * العشوائيّ للمدينة والطراز لا يبلغها إلّا مصادفةً: قِيس على الزرع
   * فكان **أكبرُ تركيبةٍ اثنين**. فالصفحة موجودةٌ في المنتج ولا تُفتح
   * في أي بيئة تطوير — **وما لا يُزرع لا يُرى**، وقد بقي فيها عيبٌ
   * أُصلح في أختها (الشبكة الغائبة) حتى قِيست بالبحث عن الصفحة نفسها.
   *
   * فتُثبَّت الثلاثة الأولى على مدينةٍ وطرازٍ واحد.
   *
   * ═══ **والفئةُ تتنوّع بينها** ═══
   *
   * كانت الثلاثةُ على `buildableTrims[0]` نفسِها — فئةً واحدة. وصفحةُ
   * الطراز تعرض شرائحَ فئاتِه («كل الفئات · LE · XLE»)، **ولا تُعرض
   * عند فئةٍ واحدة** لأنّ قسمةً بقاسمٍ واحد ليست قسمة. فبقيت الشرائح
   * مبنيّةً لا تظهر في أيّ بيئة.
   *
   * وثلاثُ كامري في الرياض كلُّها «LE» ليست حالًا واقعيًّا أصلًا —
   * **والبيانات المزروعة تُحاكي شكل الحقيقيّ**.
   */
  const PLANTED = 3;
  /** فئاتُ الطراز المثبَّت — تُدار عليها الثلاثة الأولى. */
  const plantedTrims = buildableTrims.filter(
    (entry) => entry.modelId === buildableTrims[0]?.modelId,
  );

  /**
   * ═══ وطابورُ المراجعة يُزرع بأسبابه الأربعة ═══
   *
   * كانت البذرة تكتب `DUPLICATE_IMAGE` لكلّ مرشَّح، **وللتعداد أربعُ
   * قيم**: فتابا «سعر شاذّ» و«حساب جديد» و«بلاغ» في A15 أصفارٌ أبدًا،
   * وثلاثةٌ من أربعة أشكالِ الدليل لا تُفتح في أيّ بيئة. وهو نمطُ «ما
   * لا يُزرع لا يُرى» في موضعٍ يقرؤه المشغّل كلَّ يوم.
   *
   * و`reviewQueuedAt` لم تُكتب أصلًا — فالترتيب «الأقدم أوّلًا» بلا
   * مفتاح، وبطاقةُ «أقدمها منذ ٥١ دقيقة» تقرأ `null`.
   */
  /** بترتيب جدول الترميز: مكرّرة ثمّ حساب جديد ثمّ سعر ثمّ بلاغ */
  const QUEUE_REASONS = [
    'DUPLICATE_IMAGE',
    'NEW_ACCOUNT_BURST',
    'PRICE_OUTLIER',
    'USER_REPORT',
  ] as const;
  let queuedSoFar = 0;

  /**
   * لحظةٌ **داخل اليوم الجاري** — فعدّادات «اليوم» تُقاس بالساعة
   * الحقيقية، ومرساةُ `NOW` عند التاسعة قد تسبق لحظةَ القراءة فتُنتج
   * «منذ ‎-٣٠‎ دقيقة».
   */
  const earlierToday = (hoursBack: number): Date => {
    const start = new Date(REAL_NOW);
    start.setHours(0, 5, 0, 0);
    const back = realHours(-hoursBack);
    return back.getTime() < start.getTime() ? start : back;
  };

  for (let i = 0; i < plan.length; i += 1) {
    const type = plan[i] as 'DIRECT' | 'NEGOTIATION' | 'AUCTION';
    const t =
      i < PLANTED
        ? ((plantedTrims[i % plantedTrims.length] ?? buildableTrims[0]) as (typeof buildableTrims)[number])
        : pick(buildableTrims);
    const year = between(Math.max(t.row.yearFrom ?? 2018, 2018), 2026);
    const age = 2026 - year;
    const mileageKm = age === 0 ? between(500, 8000) : between(8000, 45000) * age;
    const city = i < PLANTED ? (CITIES[0] as string) : pick(CITIES);

    // بائع تاجر في ثلث الإعلانات — البطاقات في Wa وWb تعرض شارة المعرض
    const asDealer = i % 3 === 0;
    const dealerIdx = i % dealers.length;
    const seller = asDealer
      ? (dealerUsers[dealerIdx] as (typeof dealerUsers)[number])
      : pick(sellers);
    const dealerId = asDealer ? (dealers[dealerIdx]?.id ?? null) : null;

    const base = 45_000 + (t.row.horsepower ?? 150) * 260;
    const askPrice = new D(
      String(
        Math.round(
          Math.max(28_000, base * (1 - age * 0.07) - mileageKm * 0.12) / 500,
        ) * 500,
      ),
    );

    const vehicle = await prisma.vehicle.create({
      data: {
        ownerId: seller.id,
        dealerId,
        brandId: t.brandId,
        modelId: t.modelId,
        trimId: t.id,
        brandName: t.brandNameAr,
        modelName: t.modelNameAr,
        trimName: t.row.nameAr,
        year,
        bodyType: t.row.bodyType,
        transmission: t.row.transmission,
        fuel: t.row.fuel,
        drivetrain: t.row.drivetrain,
        seats: t.row.seats,
        mileageKm,
        colorExterior: pick(COLORS),
        colorInterior: pick(['بيج', 'أسود']),
        paintStatus: age <= 1 ? 'ORIGINAL' : pick(['ORIGINAL', 'PARTIAL', 'UNKNOWN']),
        spec: pick(['SAUDI', 'SAUDI', 'GCC', 'AGENT_IMPORT']),
        condition: age === 0 ? 'NEW' : 'USED',
        city,
        entryMode: i % 4 === 0 ? 'MANUAL' : 'VIN_LOOKUP',
        vin: `SEED${String(i).padStart(4, '0')}${between(100000000, 999999999)}`,
        /**
         * **ولوحةٌ واحدة لكلّ المركبات تُخفي ما يُرى في المتفرّقة.**
         * كانت «أ ب ح» في اثنتين وستّين مركبة — فلا يظهر حرفٌ عريض
         * يفيض خانته، ولا تُقاس لوحةٌ بحرفٍ واحد، ولا يُرى أثرُ
         * اختلاف الحروف في المقاس. والبيانات المزروعة تُحاكي شكل
         * الحقيقيّ لا اسمه فقط.
         *
         * و«أ» تُطبَّع إلى «ا» عند العرض — وهي ترد في البيانات
         * الحقيقية كذلك، فتُزرع كما ترد.
         */
        plateLetters: PLATES[i % PLATES.length] ?? 'ا ب ح',
        plateNumbers: String(between(1000, 9999)),
        createdAt: days(-between(2, 120)),
      },
    });
    vehicleIds.push(vehicle.id);

    /**
     * ═══ حالات متنوّعة — **و«مُباع» ليست منها** ═══
     *
     * `SOLD` لا يكتبها في المنتج إلا `closeListingSold` عند اكتمال
     * طلب، بـ`closeReason: 'order.completed'`. وبذرةٌ تعلنها بعدّاد
     * (`i % 20 === 13`) تُنتج **إعلانًا مباعًا بلا مشترٍ ولا طلب** —
     * وهي حالةٌ لا يبلغها المنتج.
     *
     * وأثرُها ليس تجميليًّا: مؤشّر «نسبة البيع من المعروض» يقسم
     * المباع على المنشور، فإعلانان بلا طلب **يضخّمانه بلا بيعة**.
     * فالبيع يُكتب بعد الطلبات، من الطلبات نفسها.
     */
    const status =
      i % 20 === 5
        ? 'DRAFT'
        : i % 20 === 9
          ? 'PENDING_REVIEW'
          : /*
               رابعُ الأسباب يحتاج صفًّا رابعًا — **ويُؤخذ من الموقوفة لا
               من المنشورة**: إنقاصُ المنشور يحرّك عتبةَ صفحات الهبوط
               (ثلاثةٌ لكل مدينة·طراز) وكلَّ عدّاد سوق.
            */
            i % 40 === 37
            ? 'PENDING_REVIEW'
            : i % 20 === 17
              ? 'SUSPENDED'
              : 'PUBLISHED';

    /** قرارُ اليوم — ليقرأ المشغّل بطاقاته غيرَ صفرية */
    const decidedToday = status === 'PUBLISHED' && i % 20 === 11;
    const returnedToday = status === 'DRAFT';
    const queueReason =
      status === 'PENDING_REVIEW'
        ? (QUEUE_REASONS[queuedSoFar % QUEUE_REASONS.length] ?? 'DUPLICATE_IMAGE')
        : null;
    /** **وصورٌ مكرّرة غالبًا** — فسببُ الإعادة يُحسب من المُعاد اليوم */
    const returnReason: 'PRICE_OUTLIER' | 'DUPLICATE_IMAGE' | null = !returnedToday
      ? null
      : i % 40 === 25
        ? 'PRICE_OUTLIER'
        : 'DUPLICATE_IMAGE';
    /**
     * ٥١ · ٣٩ · ٢٦ · ١٤ دقيقة — مدى الترميز، وكلُّها دون الساعة فتُقرأ
     * بالدقائق. **والأقدمُ أوّلُ الأسباب**: الطابور يُرتَّب بالانتظار،
     * ولوحةُ «لماذا رُشّح» تفتح على أقدمِ صفّ — فترميزُ A15 يضع الصورة
     * المكرّرة في رأس الجدول وفي اللوحة معًا. وتصاعديًّا كانت المكرّرة
     * آخرَ الصفوف، فلا تُفتح لوحتُها إلّا بنقرة.
     */
    const waitingHours =
      status === 'PENDING_REVIEW' ? Math.max(4, 51 - queuedSoFar * 12.4) / 60 : 0;
    if (status === 'PENDING_REVIEW') queuedSoFar += 1;

    const ref = `ADS2026A${String(i + 1).padStart(4, '0')}`;
    const listing = await prisma.listing.create({
      data: {
        ref,
        vehicleId: vehicle.id,
        sellerId: seller.id,
        type,
        status,
        askPrice,
        minAcceptPrice:
          type === 'NEGOTIATION'
            ? new D(String(Math.round(Number(askPrice) * 0.92)))
            : null,
        negotiable: type === 'NEGOTIATION',
        city,
        /**
         * ═══ وصف البائع — ولم يكن لأيّ إعلان ═══
         *
         * `description` بقي `null` في كل إعلانٍ مزروع، **وتابُ «وصف
         * البائع» لا يظهر إلّا بوصف** — فالكتلة التي يرسمها التصميم
         * ويكتب فيها البائع ما لا يظهر في جدول المواصفات لا تُرى في
         * أيّ بيئة.
         *
         * وهي أهمّ ما يُقرأ بعد الصور: ما سبب الصبغ، ومتى غُيّرت
         * الإطارات، وهل تُفحص عند من يختاره المشتري.
         */
        description: DESCRIPTIONS[i % DESCRIPTIONS.length] ?? null,
        viewCount: between(12, 2400),
        publishedAt:
          status === 'DRAFT' ? null : decidedToday ? earlierToday(3) : days(-between(1, 90)),
        /* الإغلاق يُكتب مع البيعة، بعد الطلبات — لا هنا بعدّاد */
        closedAt: null,
        closeReason: null,
        reviewReason: queueReason ?? returnReason,
        reviewQueuedAt: status === 'PENDING_REVIEW' ? realHours(-waitingHours) : null,
        /**
         * **والمعتمَد اليوم والمُعاد اليوم كلاهما مُراجَع** — وبطاقاتُ
         * A15 الثلاث تُحسب من `reviewedAt`: بلا صفٍّ واحد تقرأ أصفارًا
         * ونسبةً من لا شيء.
         */
        reviewedAt: decidedToday
          ? earlierToday(3)
          : returnedToday
            ? earlierToday(5)
            : null,
        reviewNote: returnedToday
          ? 'الصور لا تُظهر المقدمة ولا لوحة العدّاد — ارفع صورًا أوضح للمركبة نفسها.'
          : null,
        featuredUntil: i % 12 === 0 ? days(between(1, 7)) : null,
      },
    });

    // الصور: أربع على الأقل (قرار ٣٣)، اللوحة مطموسة دائمًا (القاعدة ١٤)
    const imageCount = between(4, 10);
    /**
     * ═══ وتُكتب الملفّات التي تدّعيها ═══
     *
     * كانت الصفوف تُكتب بمفاتيح لا ملفّ خلفها، فكلُّ كرتٍ في اللوحة
     * وكلُّ معرضٍ في الموقع صندوقٌ فارغ — **والعدّاد يقول «٦ صور»
     * ولا تُفتح واحدة**. ولا شيء يسقط: الصفّ مكتوب والاختبار يعدّه.
     *
     * **وفي التطوير وحده**: `devPut` ترمي خارجه، والتخزين هناك R2.
     */
    const imageKeys = Array.from(
      { length: imageCount },
      (_, n) => `staging/listings/${ref}/${n + 1}.png`,
    );
    if (devStoreAllowed()) {
      await Promise.all(
        imageKeys.map((key, n) => devPut(key, placeholderPng(ref.charCodeAt(ref.length - 1) + n))),
      );
    }
    await prisma.listingImage.createMany({
      data: Array.from({ length: imageCount }, (_, n) => ({
        listingId: listing.id,
        r2Key: imageKeys[n] as string,
        sort: n,
        isCover: n === 0,
        plateBlurred: true,
        phash: seedPhash(ref, n),
        qualityFlags: n === 3 && i % 9 === 0 ? ['BLURRY'] : [],
      })),
    });

    // لقطة المميّزات وقت النشر — لا قراءة حيّة من الفئة
    const extra = new Set<string>(BASE_FEATURES);
    if (year >= 2020) extra.add(FROM_2020_FEATURE);
    for (let k = 0; k < between(2, 7); k += 1) extra.add(pick(featureKeys));
    await prisma.listingFeature.createMany({
      data: [...extra].map((featureKey) => ({ listingId: listing.id, featureKey })),
    });

    if (status === 'PUBLISHED') {
      listings.push({
        id: listing.id,
        ref,
        type,
        askPrice,
        vehicleId: vehicle.id,
        sellerId: seller.id,
        city,
      });
    }
  }

  /**
   * ═══ ولكلِّ رايةٍ سببُها — لا رايةٌ بلا دليل ═══
   *
   * كانت البذرة تكتب `reviewReason` وحدَه، **ولا شيء يُنشئ ما رفعه**:
   * فطابور A15 أربعةُ صفوفٍ كلٌّ منها يقول «رُشّح لكذا» ودليلُه يقول
   * «ولا كذا» — «بلغ عنه مستخدمون: لا بلاغات»، و«سعر شاذّ ولا إحصاء
   * سوق»، و«صورة مكرّرة والمطابق لم يعد قائمًا»، و«حساب جديد» عمره
   * مئةٌ وثمانيةٌ وعشرون يومًا. والمنتج لا يكتب الراية إلّا من سببها
   * (`publish.ts`)، فبذرةٌ تكتبها بيدها تُنتج حالًا لا يبلغها.
   *
   * وكشفَه فتحُ الشاشة لا اختبار: الأرقام كلُّها صحيحة والجُمل متناقضة.
   */
  const queuedRows = await prisma.listing.findMany({
    where: { status: 'PENDING_REVIEW' },
    select: { id: true, ref: true, sellerId: true, askPrice: true, reviewReason: true,
      vehicle: { select: { modelId: true, year: true } } },
  });

  for (const row of queuedRows) {
    if (row.reviewReason === 'USER_REPORT') {
      const reporter = buyers[0];
      if (reporter !== undefined) {
        await prisma.report.create({
          data: {
            ref: `RPT-2026-${row.ref.slice(-4)}`,
            // **المفتاح `id` لا `ref`** — كما يكتبه `reportListing`
            targetType: 'listing',
            targetId: row.id,
            reporterId: reporter.id,
            reason: 'صور لا تخص المركبة',
            details: 'المقاعد في الوصف جلد وفي الصور قماش، والصور لسيارة أخرى.',
            status: 'open',
          },
        });
      }
    }

    if (row.reviewReason === 'PRICE_OUTLIER') {
      /**
       * إحصاءُ سوقٍ **فوق** المطلوب — فالنسبة تُحسب ولا تُقال «لا إحصاء
       * لهذا الطراز». و`upsert` لأنّ الطراز·السنة قد يكون مزروعًا أصلًا.
       */
      const ask = Number(row.askPrice);
      const at = (factor: number) => new D(String(Math.round(ask * factor)));
      await prisma.priceStat.upsert({
        where: {
          modelId_year_trimId_mileageBucket_city: {
            modelId: row.vehicle.modelId,
            year: row.vehicle.year,
            trimId: '*',
            mileageBucket: 80,
            city: '*',
          },
        },
        update: { p25: at(1.85), p50: at(2.1), p75: at(2.4) },
        create: {
          modelId: row.vehicle.modelId,
          year: row.vehicle.year,
          mileageBucket: 80,
          p10: at(1.6),
          p25: at(1.85),
          p50: at(2.1),
          p75: at(2.4),
          p90: at(2.7),
          sampleSize: 17,
          computedAt: NOW,
        },
      });
    }

    if (row.reviewReason === 'NEW_ACCOUNT_BURST') {
      // الحساب يصير جديدًا فعلًا — وإلّا فالوسم يكذب على عمرٍ يعرضه بجواره
      await prisma.user.update({
        where: { id: row.sellerId },
        data: { createdAt: days(-3) },
      });
    }

    if (row.reviewReason === 'DUPLICATE_IMAGE') {
      /**
       * بصمةٌ من إعلان **بائعٍ آخر** — وهو شرطُ القرار ٣٣: صورةُ البائع
       * في إعلانه الثاني ليست تكرارًا. وتُنسخ كما هي (مسافة صفر) فيقرأ
       * المراجع «١٠٠٪» ويرى الصورتين.
       */
      const source = await prisma.listingImage.findFirst({
        where: {
          phash: { not: null },
          listing: { sellerId: { not: row.sellerId }, status: 'PUBLISHED' },
        },
        select: { phash: true },
        orderBy: { id: 'asc' },
      });
      const cover = await prisma.listingImage.findFirst({
        where: { listingId: row.id },
        orderBy: { sort: 'asc' },
        select: { id: true },
      });
      if (source?.phash != null && cover !== null) {
        await prisma.listingImage.update({
          where: { id: cover.id },
          data: { phash: source.phash },
        });
      }
    }
  }

  /**
   * ═══ ومشاهداتُ الأسبوع تُزرع بأيّامها ═══
   *
   * `viewCount` تراكميّ مزروع، و`ListingViewDay` جديد — فبلا زرعٍ تقرأ
   * بطاقةُ «مشاهدات هذا الأسبوع» صفرًا لكلّ بائع فوق مجموعٍ بالمئات،
   * وهو تناقضٌ في صفٍّ واحد يقرؤه صاحبُ الإعلان.
   *
   * والتوزيعُ يُحاكي الحال: **ثلثُ التراكميّ في آخر سبعة أيّام**،
   * موزَّعًا تنازليًّا — الأحدثُ أكثر، كما يُرى الإعلانُ بعد نشره.
   */
  const viewDayRows: { listingId: string; day: Date; count: number }[] = [];
  for (const listing of listings) {
    const total = await prisma.listing
      .findUnique({ where: { id: listing.id }, select: { viewCount: true } })
      .then((row) => row?.viewCount ?? 0);
    const week = Math.round(total / 3);
    if (week === 0) continue;

    for (let back = 0; back < 7; back += 1) {
      const day = new Date(REAL_NOW.getTime() + 3 * 3_600_000);
      day.setUTCHours(0, 0, 0, 0);
      day.setUTCDate(day.getUTCDate() - back);
      // تنازليًّا: اليومُ أكثرُ من أمس
      const share = Math.round((week * (7 - back)) / 28);
      if (share > 0) viewDayRows.push({ listingId: listing.id, day, count: share });
    }
  }
  if (viewDayRows.length > 0) {
    await prisma.listingViewDay.createMany({ data: viewDayRows, skipDuplicates: true });
  }

  // ————— تاريخ المركبة: ما تملكه المنصة فقط (قرار ١٥) —————
  await prisma.vehicleHistoryItem.createMany({
    data: vehicleIds.slice(0, 24).flatMap((vehicleId, i) => [
      {
        vehicleId,
        type: 'owner',
        titleAr: 'مالك واحد منذ الشراء',
        titleEn: 'One owner since purchase',
        detailAr: 'لم تنقل الملكية داخل المنصة منذ الإضافة.',
        detailEn: 'Ownership has not changed inside the platform since it was added.',
        source: 'PLATFORM' as const,
        occurredAt: days(-between(200, 800)),
      },
      {
        vehicleId,
        type: 'service',
        titleAr: 'صيانة دورية في الوكالة',
        titleEn: 'Scheduled service at the dealership',
        detailAr: `آخر صيانة على ${between(10, 60) * 1000} كم.`,
        detailEn: `Last service at ${between(10, 60) * 1000} km.`,
        source: 'SELLER' as const,
        occurredAt: days(-between(30, 200) - i),
      },
    ]),
  });

  /**
   * ═══ كلُّ إعلانٍ نوعُه مزاد له مزاد ═══
   *
   * كانت `.slice(0, 3)` تترك **سبعة** إعلاناتٍ نوعُها `AUCTION` بلا
   * صفّ `Auction` — وهي حالةٌ يمنعها المنتج نفسه (`publish` تُنشئ
   * المزاد في معاملة النشر). والأثر مقيس: `/browse/tabuk/lexus`
   * تردّ **٥٠٠**، وصفحة المزاد ٤٠٤، والبطاقة تعرض عدّادًا بلا موعد.
   *
   * والثلاثةُ الأولى بحالاتها المقصودة (جارٍ · قادم · منتهٍ)، وما
   * بعدها يدور عليها — فلا يبقى إعلانٌ بلا مزاده.
   */
  const auctionListings = listings.filter((l) => l.type === 'AUCTION');
  /**
   * ═══ ونافذةُ المزاد الجاري تطول بما يكفي لتُستعمل ═══
   *
   * كانت `endsAt: hours(4)`، **فيموت كلُّ مزادٍ جارٍ بعد ظهر يوم
   * الزرع**. وبعدها لا مزادَ يُزايَد عليه في البيئة كلّها: صفحةُ
   * المزاد تقول «انتهى»، والمزايدةُ تردّ `ENDED`، والبثّ اللحظيّ
   * وشريطُ «تُغلق قريبًا» لا يُرى أيٌّ منهما عاملًا.
   *
   * فثلاثةُ أيّام لمن يُراد تصفّحه، **وساعتان لواحدٍ** — فالعدّاد
   * يُرى في حالته العاجلة أيضًا، وشريطُ «تُغلق قريبًا» يجد ما يعرضه.
   */
  /** إلغاءٌ واحد في الشجرة كلّها — والشاذُّ لا يُزرع في كل صفّ. */
  let cancelledSeeded = false;

  const auctionSpecs = [
    { status: 'LIVE' as const, startsAt: realHours(-6), endsAt: days(3) },
    { status: 'SCHEDULED' as const, startsAt: days(2), endsAt: days(4) },
    { status: 'ENDED_MET' as const, startsAt: days(-6), endsAt: days(-3) },
    { status: 'LIVE' as const, startsAt: realHours(-20), endsAt: realHours(2) },
  ];

  for (let i = 0; i < auctionListings.length; i += 1) {
    const l = auctionListings[i] as ListingRef;
    const spec = auctionSpecs[i % auctionSpecs.length] as (typeof auctionSpecs)[number];
    const start = new D(String(Math.round(Number(l.askPrice) * 0.75)));
    const increment = new D('500.00');

    const auction = await prisma.auction.create({
      data: {
        listingId: l.id,
        startPrice: start,
        reservePrice: new D(String(Math.round(Number(l.askPrice) * 0.9))),
        bidIncrement: increment,
        buyNowPrice: new D(String(Math.round(Number(l.askPrice) * 1.05))),
        depositAmount: new D('5000.00'),
        startsAt: spec.startsAt,
        endsAt: spec.endsAt,
        status: spec.status,
        extendedCount: spec.status === 'ENDED_MET' ? 2 : 0,
        viewingCity: l.city,
      },
    });

    if (spec.status !== 'SCHEDULED') {
      const bidderPool = buyers.slice(0, 6);
      const reserve = Number(auction.reservePrice);
      let amount = Number(start);
      const total = between(8, 18);
      for (let n = 0; n < total; n += 1) {
        amount += Number(increment) * between(1, 4);
        /**
         * ═══ ومزادٌ «رسا» بلغ احتياطيَه بالتعريف ═══
         *
         * المزايدات تتصاعد بمقدارٍ عشوائيّ والحالة مكتوبةٌ `ENDED_MET`
         * سلفًا، فقد تنتهي أعلى مزايدةٍ **دون الاحتياطي** — فيعرض
         * الكرت «رسا» و«لم يُبلغ» معًا: حالةٌ لا يبلغها المنتج، لأن
         * `closeEndedAuctions` لا تكتب `ENDED_MET` إلّا ببلوغه.
         *
         * فآخرُ مزايدةٍ في المزاد الراسي تتجاوز الاحتياطيَ يقينًا.
         */
        if (spec.status === 'ENDED_MET' && n === total - 1 && amount <= reserve) {
          amount = reserve + Number(increment);
        }
        const bidder = bidderPool[n % bidderPool.length] as (typeof buyers)[number];
        /**
         * ═══ والآليّةُ تُزرع بسببها لا بنتيجتها ═══
         *
         * كان الزرعُ يكتب `isAuto` بلا سقف — **ومزايدةٌ آليةٌ بلا سقف
         * لا يبلغها المنتج**: النظام لا ينوب عن أحد إلّا بسقفٍ كتبه.
         * فصفٌّ يقول «تلقائية» ولا شيء وراءه، والشاشة تعرض وسمًا
         * لحالةٍ مستحيلة. (قاعدةٌ مسجَّلة: ما يُشتقّ في المنتج يُزرع
         * بمصدره.)
         */
        const auto = n % 5 === 0;
        await prisma.bid.create({
          data: {
            auctionId: auction.id,
            bidderId: bidder.id,
            amount: new D(String(amount)),
            isAuto: auto,
            maxAmount: auto ? new D(String(amount + Number(increment) * between(2, 6))) : null,
            createdAt: new Date(spec.startsAt.getTime() + n * 900_000),
          },
        });
      }

      /**
       * ═══ ومزايدةٌ ملغاة في مزادٍ واحد ═══
       *
       * الترميزُ يرسم بطاقةَ «مزايدات ملغاة» وسطرًا مشطوبًا بسببه،
       * **وما لا يُزرع لا يُرى**: لا شاشةَ تفتح الحال فلا يكشف أحدٌ
       * عطلًا فيها. وواحدةٌ تكفي — إلغاءٌ في كلّ مزاد يجعل الشاذَّ
       * قاعدةً ويُربك قارئ البيانات.
       */
      if (spec.status === 'LIVE' && cancelledSeeded === false) {
        const victim = bidderPool[1] as (typeof buyers)[number];
        const at = new Date(spec.startsAt.getTime() + 3 * 900_000 + 60_000);
        await prisma.cancelledBid.create({
          data: {
            auctionId: auction.id,
            bidderId: victim.id,
            amount: new D(String(Number(start) + Number(increment) * 3)),
            isAuto: false,
            placedAt: at,
            cancelledAt: new Date(at.getTime() + 180_000),
            cancelledById: superAdmin.id,
            reason: 'إخلال بشروط المزاد',
          },
        });
        await prisma.auctionEvent.create({
          data: {
            auctionId: auction.id,
            kind: 'BID_CANCELLED',
            createdAt: new Date(at.getTime() + 180_000),
          },
        });
        cancelledSeeded = true;
      }
      await prisma.deposit.createMany({
        data: bidderPool.map((b) => ({
          auctionId: auction.id,
          userId: b.id,
          amount: new D('5000.00'),
          status: spec.status === 'ENDED_MET' ? ('RELEASED' as const) : ('HELD' as const),
          releasedAt: spec.status === 'ENDED_MET' ? spec.endsAt : null,
        })),
      });
    }
  }

  // ————— ١٢ طلبًا في مراحل مختلفة —————
  const STAGES = [
    'REQUEST',
    'APPROVED',
    'INSPECTION',
    'PAYMENT',
    'TRANSFER',
    'DONE',
  ] as const;

  /**
   * ═══ وطلبٌ ملغى في البذرة ═══
   *
   * **لم يكن في القاعدة طلبٌ `CANCELLED` واحد** — والحالة معرَّفةٌ في
   * المخطّط ويكتبها `cancelOrder`. فكلُّ شاشةٍ تعرض طلبًا لم تُجرَّب
   * قطُّ في هذه الحال، ومرّ عطلٌ في ثمانية مواضع بلا أن يراه أحد:
   * بنرٌ أخضر يقول «طلبٌ ينتظر الدفع» عن طلبٍ أُلغي، ووسمان
   * متجاوران يتناقضان، وزرُّ دفعٍ يعمل.
   *
   * **والإلغاء قبل الدفع**، فلا دفعةَ له ولا ضمان — وهو الشكل الذي
   * ينتجه `cancelOrder` حين يُلغى الطلب في مرحلة الدفع.
   */
  const CANCELLED_INDEX = 12;
  /**
   * ═══ والطلباتُ على أنواعِ الإعلانات الثلاثة ═══
   *
   * كان المأخوذُ أوّلَ ثلاثةَ عشرَ إعلانًا، **والقائمةُ مرتَّبةٌ
   * بالنوع** — فكلُّها `DIRECT`، و`OrderSource.OFFER` و`AUCTION`
   * بلا صفّ. وشريحةُ «مصدر الطلب» في `A14` و`D11` تقول «مباشر
   * ١٠٠٪» عن سوقٍ أكثرُ بيعه بالتفاوض.
   *
   * فتُؤخذ بالتناوب على الأنواع: ما يصفه الشكلُ يُزرع بشكله.
   */
  const byType = (want: string): ListingRef[] => listings.filter((row) => row.type === want);
  const pools = [byType('DIRECT'), byType('NEGOTIATION'), byType('AUCTION')];
  const orderListings: ListingRef[] = [];
  for (let round = 0; orderListings.length <= CANCELLED_INDEX; round += 1) {
    let added = false;
    for (const pool of pools) {
      const pick = pool[round];
      if (pick === undefined) continue;
      orderListings.push(pick);
      added = true;
      if (orderListings.length > CANCELLED_INDEX) break;
    }
    if (!added) break;
  }
  /**
   * **والأشكالُ النادرة تُعلَّق على أوّل دفعةٍ توجد، لا على أوّل دورة.**
   * علّقتُها أوّلًا على `i === 0` فلم تُزرع واحدةٌ منها: المرحلة عند
   * الدورة الأولى قبل «دفع»، فلا دفعةَ أصلًا — شرطٌ صامت يُخرج صفرًا
   * ولا يشكو.
   */
  let rareHooksPlanted = false;
  /**
   * **وواحدٌ يكفي**: شريحةُ «تنتظر الإفراج» تُفتح بصفٍّ، وزرُّها يُضغط.
   *
   * ويُحفظ مرجعُه لا رايةٌ وحدها: **زرعُ النزاع يأخذ أوّلَ طلبين عند
   * `TRANSFER` أو `DONE`** فأخذ هذا الطلبَ نفسَه وجعل ضمانَه
   * `PARTIAL_REFUND` — فصفٌّ يقول «تنتظر الإفراج» وضمانُه مردودٌ
   * جزئيًّا. **والطقمُ يشترط ما يفترضه**، فيُستثنى بمرجعه.
   */
  let releaseRef: string | null = null;

  for (let i = 0; i < orderListings.length; i += 1) {
    const l = orderListings[i] as ListingRef;
    const cancelled = i === CANCELLED_INDEX;
    const stage = cancelled
      ? ('PAYMENT' as const)
      : (STAGES[i % STAGES.length] as (typeof STAGES)[number]);
    /**
     * ═══ وواحدٌ يبيع ويشتري — وإلّا لم تُرَ شاشةٌ في حالها ═══
     *
     * قِيس: من مئتي حساب **لا واحد** له إعلانٌ وطلبٌ معًا — البائعون
     * يبيعون والمشترون يشترون. وهي حالُ البذرة لا حالُ السوق: من باع
     * سيارةً يشتري أخرى.
     *
     * وأثرُها أنّ صفحة الحساب لا تُفتح قطّ على ما يرسمه التصميم —
     * «طلباتي» و«العروض الواردة على مركباتك» في شاشةٍ واحدة. وكلُّ
     * فحصٍ لها يقع على نصفها.
     *
     * فأوّلُ طلبٍ يشتريه **بائع** — ولا يشتري إعلانَ نفسه.
     */
    const seller = sellers.find((person) => person.id !== l.sellerId);
    const buyer =
      i === 0 && seller !== undefined
        ? seller
        : (buyers[i % buyers.length] as (typeof buyers)[number]);
    const agreed = new D(String(Math.round(Number(l.askPrice) * 0.97)));

    /**
     * ═══ وأرقامُ الطلب تُحسب بحاسبة المنتج لا بيد ═══
     *
     * كانت مكتوبةً هنا: عمولةٌ صفر وضريبةٌ صفر وإجماليٌّ = الثمن +
     * الرسم. **فكانت تناقض قاعدة العمولة النافذة**: تُضبط ٢٫٥٪ من
     * اللوحة ويبقى كلُّ طلبٍ مزروعٍ على صفر، **فبطاقةُ «إيراد
     * المنصّة» صفرٌ في كل بيئة** ولا شاشةَ ماليّةٍ تُجرَّب على رقمٍ
     * حقيقيّ.
     *
     * و`computeOrderAmounts` هي التي يحسب بها الشراءُ والعرضُ
     * والمزاد — فالمزروعُ يُشبه ما يُنتجه المنتج، لا شكلَه وحده.
     */
    const amounts = await computeOrderAmounts(prisma, Number(agreed));
    const transferFee = amounts.transferFee;
    const total = amounts.totalAmount;
    const vat = amounts.vatAmount;

    /**
     * ═══ والطلبُ يُولد قبل أحداثه ═══
     *
     * كان `createdAt` متروكًا لافتراضيّه (**الآن**) و`stageEnteredAt`
     * مؤرَّخًا قبل أسبوعين وأحداثُه قبل أربعةَ عشر يومًا — **فالإنشاء
     * يقع بعد ما نشأ عنه**. وخطُّ زمن الطلب يعرض «أُنشئ طلب» آخرَ
     * سطرٍ، ونزاعٌ عليه يسبق مولدَه.
     *
     * ولا شيء يسقط: الصفوف صحيحةٌ كلٌّ على حدة، **والتناقض بينها**.
     */
    const bornAt = days(-between(16, 30));
    const enteredAt = days(-between(1, 14));

    const order = await prisma.order.create({
      data: {
        ref: `ORD-2026-${String(1000 + i)}`,
        listingId: l.id,
        buyerId: buyer.id,
        sellerId: l.sellerId,
        source:
          l.type === 'AUCTION'
            ? 'AUCTION'
            : l.type === 'NEGOTIATION'
              ? 'OFFER'
              : 'DIRECT',
        stage,
        status: cancelled ? 'CANCELLED' : stage === 'DONE' ? 'COMPLETED' : 'ACTIVE',
        /** **ومن ألغى يُكتب ولماذا** — «أُلغي» وحدها لا تقول شيئًا. */
        ...(cancelled
          ? { cancelReason: 'انسحب المشتري قبل الدفع', cancelledBy: buyer.id }
          : {}),
        agreedPrice: agreed,
        commissionPct: amounts.commissionPct,
        commissionAmount: amounts.commissionAmount,
        buyerCommission: amounts.buyerCommission,
        sellerCommission: amounts.sellerCommission,
        /** **ولقطةُ ضريبة كلّ طرف** — فوق الرسم لا داخله (قرار «فوقها») */
        buyerVat: amounts.buyerVat,
        sellerVat: amounts.sellerVat,
        transferFee,
        vatAmount: vat,
        totalAmount: total,
        createdAt: bornAt,
        stageEnteredAt: enteredAt,
        paymentDueAt: stage === 'PAYMENT' ? hours(between(2, 22)) : null,
        transferAppointmentAt: stage === 'TRANSFER' ? days(between(1, 5)) : null,
      },
    });

    await prisma.orderEvent.createMany({
      data: STAGES.slice(0, STAGES.indexOf(stage) + 1).map((s, n, all) => ({
        orderId: order.id,
        // نفس اسم `advanceStage` — واسمان لحدث واحد أسوأ من اسم غير مثالي
        type: 'stage.advanced',
        fromStage: n === 0 ? null : (STAGES[n - 1] ?? null),
        toStage: s,
        actorType: 'system',
        /* موزَّعةٌ بين المولد ودخول المرحلة — فالتسلسل يُقرأ كما وقع */
        createdAt: new Date(
          bornAt.getTime() +
            ((enteredAt.getTime() - bornAt.getTime()) * (n + 1)) / all.length,
        ),
      })),
    });

    /**
     * **ولا ضمانَ لملغًى قبل الدفع** — لا دفعةَ وقعت فلا شيء يُحجز.
     *
     * ═══ و«عند الدفع» ليست «بعد الدفع» ═══
     *
     * كان الشرط `>=`، فطلبٌ **عند** مرحلة الدفع يُزرع بضمانٍ `HELD`
     * — وهي حالٌ **لا يُنتجها المنتج أصلًا**: `startHold` تحجز
     * بـ`applyState` التي تُقدّم المرحلة معها.
     *
     * وأثرُها شاشةٌ كاملة. `canPay` تشترط `escrow === null` بحقّ،
     * فلم يُعرض «ادفع الآن» لطلبٍ عند الدفع قطّ — **والمشتري يصل
     * ولا يجد ما يضغطه**. وبطاقةُ الضمان تقول له «المبلغ محجوز ولم
     * يصل البائع» وهو لم يدفع ريالًا.
     *
     * فما يُزرع خطأً يُرى خطأً — والشاشة تُبنى على ما تراه.
     */
    if (!cancelled && STAGES.indexOf(stage) > STAGES.indexOf('PAYMENT')) {
      const heldAt = days(-between(2, 10));

      /**
       * ═══ ولا ضمانَ بلا دفعته ═══
       *
       * `applyState` تُنشئ `Escrow` **من دفعةٍ محجوزة** — لا تُكتب
       * واحدةٌ بلا الأخرى. والبذرة كانت تكتب الضمان وحده، وجدولُ
       * `Payment` **فارغٌ تمامًا**.
       *
       * والأثر شاشةٌ كاملة: `/admin/settlements` تقرأ الطلبات التي
       * لها دفعةٌ `HELD`، فتقول «لا مبالغ محجوزة» بينما يقول الدفتر
       * «٢٠٧٬٧٥٠ لدى مزوّد الدفع» والماليةُ «١٦٩٬٨٣٠ محتجزًا» —
       * **ثلاث شاشات وثلاثة أرقام عن المال نفسه**، وطابورُ الإفراج
       * الذي بُني بنصاب عضوين لا يُرى عاملًا في أيّ بيئة.
       */
      /**
       * ═══ وطلبٌ واحد ينتظر الإفراج فعلًا ═══
       *
       * كلُّ دفعةٍ مزروعة على `bank_escrow` **ولا مُهايئ لها**، فكلُّ
       * طلبٍ عند `DONE` إمّا سُوّي أو يُحجب بـ`GATEWAY_UNAVAILABLE`:
       * فشريحةُ «تنتظر الإفراج» في A25 صفرٌ في كلّ بيئةٍ مزروعة،
       * **وزرُّ «اعتمد» — الفعلُ الوحيد في الشاشة — لم يُضغط قطّ**.
       * وهو الشكلُ الذي أُصلح في غيره مرّاتٍ: ميزةٌ مبنيّةٌ لا تصلها
       * بيانات.
       *
       * فأوّلُ طلبٍ مكتمل يُزرع في الحال الذي يُنتجه المنتج بين تأكيد
       * النقل والإفراج: الدفعةُ `HELD` والضمانُ `HELD` وعقدُ البيع
       * صادر (`advanceStage` تُصدره عند `DONE`)، **ولا كشفَ تسويةٍ ولا
       * اعترافَ بإيراد** — فهما في مسار `SETTLED` وحده.
       *
       * **وعلى التجريبية لأنّ لها مُهايئًا**: ودفترُها المستقلّ يحمل
       * صفَّ الحجز، فالضغطةُ تُنادي `settle` فعلًا ولا تردّ
       * `HOLD_NOT_FOUND`.
       */
      const awaitingRelease = stage === 'DONE' && releaseRef === null;
      if (awaitingRelease) releaseRef = order.ref;

      const settled = stage === 'DONE' && !awaitingRelease;
      const gatewayKey = awaitingRelease ? 'sandbox' : 'bank_escrow';
      const holdRef = awaitingRelease
        ? `sbx_hold_seed_${String(1000 + i)}`
        : `hold_seed_${String(1000 + i)}`;
      const payment = await prisma.payment.create({
        data: {
          orderId: order.id,
          purpose: 'VEHICLE_ESCROW',
          gatewayKey,
          amount: total,
          method: 'mada',
          status: settled ? 'SETTLED' : 'HELD',
          holdRef,
          ...(settled ? { settleRef: `stl_seed_${String(1000 + i)}`, settledAmount: total, settledAt: days(-1) } : {}),
          heldAt,
          createdAt: heldAt,
        },
      });

      /**
       * ═══ وأثرُ الدفعة يُزرع معها ═══
       *
       * `PaymentEvent` كان **صفرَ صفوفٍ أمام ثلاث عشرة دفعة**: البذرة
       * تكتب الحالَ النهائيّ بلا الطريق إليه، وشاشةُ النشاط تقرأ هذا
       * الجدول — فلا انتقالَ دفعةٍ واحد يظهر فيها في أيّ بيئة.
       */
      await prisma.paymentEvent.create({
        data: {
          paymentId: payment.id,
          type: 'payment_authorized',
          fromStatus: 'PENDING',
          toStatus: 'HELD',
          source: 'gateway',
          createdAt: heldAt,
        },
      });
      if (awaitingRelease) {
        /**
         * **ودفترُ التجريبية مستقلّ** — `settle` تقرأ `holdRef` منه،
         * فحجزٌ بلا صفٍّ فيه يردّ `HOLD_NOT_FOUND` عند الضغط: زرٌّ
         * يُرى عاملًا ويفشل، وهو أسوأ من زرٍّ غائب.
         */
        await prisma.sandboxTransaction.create({
          data: {
            ref: holdRef,
            kind: 'HOLD',
            state: 'HELD',
            amount: total,
            method: 'mada',
            createdAt: heldAt,
          },
        });
      }

      if (settled) {
        await prisma.paymentEvent.create({
          data: {
            paymentId: payment.id,
            type: 'payment_captured',
            fromStatus: 'HELD',
            toStatus: 'SETTLED',
            source: 'gateway',
            createdAt: days(-1),
          },
        });
      }

      /**
       * ═══ وردُّ البوّابة يُزرع بكلّ أشكاله ═══
       *
       * `WebhookEvent` كان **صفرَ صفوفٍ** كذلك، فشاشةُ الردود كانت
       * ستُشحن حالةً فارغة لا يملؤها أحد: البوّابة التجريبية تؤكّد
       * فورًا بلا استدعاء. **وما لا يُزرع لا يُرى** — وتسعةُ عيوبٍ
       * سكنت حالَ طلبٍ لم تفتحه شاشةٌ قطّ قبل هذا.
       *
       * فتُزرع الأشكال الخمسة التي يكتبها المنتج: طُبّق، ونوعٌ بلا
       * مقابل، ورفضٌ لانتقالٍ متأخّر، وتوقيعٌ لا يطابق، وواحدٌ لم
       * تكتمل معالجتُه.
       */
      const hook = (
        suffix: string,
        type: string,
        extra: Partial<Prisma.WebhookEventUncheckedCreateInput>,
        at: Date,
      ) =>
        prisma.webhookEvent.create({
          data: {
            id: `evt_seed_${String(1000 + i)}_${suffix}`,
            provider: gatewayKey,
            type,
            signatureOk: true,
            paymentId: payment.id,
            payload: { id: `evt_seed_${String(1000 + i)}_${suffix}`, type, data: { id: holdRef } },
            receivedAt: at,
            processedAt: at,
            ...extra,
          },
        });

      await hook('auth', 'payment_authorized', { outcome: 'APPLIED', appliedStatus: 'HELD' }, heldAt);
      if (settled) {
        await hook('cap', 'payment_captured', { outcome: 'APPLIED', appliedStatus: 'SETTLED' }, days(-1));
        // ردٌّ متأخّر بعد التحصيل — يُرفض انتقالُه، والرفضُ يُسجَّل
        await hook(
          'late',
          'payment_authorized',
          { outcome: 'REFUSED', note: 'INVALID_TRANSITION', repeats: 2 },
          days(-1),
        );
      }
      if (!rareHooksPlanted) {
        rareHooksPlanted = true;
        // نوعٌ ترسله البوّابة ولا يقابله حالٌ في دفتر الضمان
        await hook('pend', 'payment_pending', { outcome: 'UNMAPPED' }, heldAt);
        // توقيعٌ لا يطابق — ومرجعُه مع ذلك دفعةٌ عندنا
        await hook(
          'forged',
          'payment_captured',
          { outcome: 'BAD_SIGNATURE', signatureOk: false },
          days(-2),
        );
        // سُجّل قبل المعالجة ولم يُغلق — أي أنّ المعالجة توقّفت
        await hook('half', 'payment_refunded', { outcome: 'RECEIVED', processedAt: null }, days(-2));
      }

      await prisma.escrow.create({
        data: {
          orderId: order.id,
          amount: total,
          status: settled ? 'RELEASED' : 'HELD',
          heldAt,
          releasedAt: settled ? days(-1) : null,
          gatewayRef: gatewayKey,
        },
      });
      /**
       * ═══ والدفتر يُكتب مع المال لا بعده ═══
       *
       * البذرة كانت تُنشئ ضمانًا وعرابين وحوالات **ولا قيدًا واحدًا**،
       * فصفحة `/admin/ledger` تعرض ما تركته الاختبارات لا ما في
       * المنتج. ومحاسبٌ يفتحها يجد دفترًا لا يطابق الصناديق.
       *
       * والقيد يمرّ بـ`recordOrderPaid` و`recordOrderEarned` —
       * مدخلُه الوحيد الذي يفحص التوازن (البوابة ٢٠) — لا بكتابةٍ
       * مباشرة تُنتج معاملةً لا تتوازن.
       */
      const { recordOrderCaptured, recordOrderEarned, recordOrderPaid } = await ledgerEvents();

      await recordOrderPaid(
        prisma,
        { orderId: order.id, paymentId: payment.id, buyerId: buyer.id, total },
        heldAt,
      );

      if (awaitingRelease) {
        /**
         * **وعقدُ البيع عند تأكيد النقل لا عند الإفراج** —
         * `advanceStage` تُصدره عند `DONE` (`orders.ts`)، وكشفُ
         * التسوية والفاتورة في مسار `SETTLED`. فالمنتظِرُ له عقدُه
         * وحده، وزرعُ الثلاثة له يصف حالًا لا يُنتجها المنتج.
         */
        const { issueSaleAgreement } = await documents();
        await issueSaleAgreement(order.id, enteredAt);
      }

      if (settled) {
        /**
         * ═══ والمستندات الثلاثة تُصدَر كما يُصدرها المنتج ═══
         *
         * إتمامُ البيع في `applyState` يُصدر **عقد بيع** و**كشف
         * تسوية** و**فاتورة ضريبية** على عمولتنا. والبذرة كانت
         * تُنشئ `Invoice` البسيط وحده — فصفر فاتورةٍ ضريبية وصفر
         * كشفٍ وصفر عقد في كل بيئة.
         *
         * والأثر: عمود «فواتير صدرت» في شاشة الضرائب صفرٌ أبدًا،
         * **وفرعُ الجدول الذي يعرضها لم يُصيَّر قطّ** — وهو الفرع
         * الذي سقط فيه تمريرُ دالّةٍ عبر حدّ الخادم من قبل، فلم
         * يكشفه إلّا `curl`. وتنزيلاتُ المشتري والبائع فارغة كذلك.
         */
        const { issueSaleAgreement, issueSettlementDocuments } = await documents();
        await issueSaleAgreement(order.id, enteredAt);
        await issueSettlementDocuments(order.id, enteredAt);

        await recordOrderEarned(
          prisma,
          {
            orderId: order.id,
            paymentId: payment.id,
            buyerId: buyer.id,
            sellerId: l.sellerId,
            total,
            commission: amounts.commissionAmount,
            vat,
            govtFee: transferFee,
          },
          days(-1),
        );

        /**
         * ═══ والتحصيل يُزرع مع الاستحقاق ═══
         *
         * قرار المالك (٢٠٢٦-١٠-١٧): ما حُصِّل ولم يُحوَّل **مالٌ لنا**.
         * و`applyState` تكتب القيدين معًا — فالبذرةُ تكتبهما معًا،
         * وإلّا عرضت لوحةُ الدفتر حالًا لا يُنتجها المنتج: صفقةٌ
         * مكتملة ومالُها «محجوز» أبدًا.
         *
         * **وما لا يُزرع لا يُرى**: بطاقةُ «ما وصلنا فعلًا» كانت صفرًا
         * في كل بيئة.
         */
        await recordOrderCaptured(
          prisma,
          { orderId: order.id, paymentId: payment.id, amount: total },
          days(-1),
        );
      }

      await prisma.invoice.create({
        data: {
          ref: `INV-2026-${String(2000 + i)}`,
          orderId: order.id,
          userId: buyer.id,
          type: 'SALE',
          subtotal: total.minus(vat),
          vatAmount: vat,
          total,
          issuedAt: days(-between(1, 9)),
        },
      });
    }

    /**
     * **والإعلان يُغلق ببيعه لا بعدّاد** — وبالسبب نفسه الذي يكتبه
     * `closeListingSold`، فما في القاعدة هو ما ينتجه المنتج.
     */
    if (stage === 'DONE') {
      await prisma.listing.update({
        where: { id: l.id },
        data: { status: 'SOLD', closedAt: enteredAt, closeReason: 'order.completed' },
      });
    }
  }

  /**
   * ═══ ومركبتان في المرآب ═══
   *
   * **مركبةٌ بلا إعلان لم تكن تُزرع قطّ** — ولا يمكن أن توجد أصلًا:
   * الطريق الوحيد لإنشاء مركبة كان النشر، وهو يكتب إعلانًا معها
   * دائمًا حتى في المسودّة. فشريحة `garage` في لوحة الأدمن كانت صفرًا
   * بنيويًّا، وبطاقة الحساب التي يرسمها التصميم («٢ معروضة · ١ في
   * المرآب») لا تصل إلى شطرها الثاني.
   *
   * وهي الحال الطبيعية لمن أضاف سيارته ليطلب عليها فحصًا أو تأمينًا
   * ولا يريد بيعها.
   */
  for (const [n, owner] of buyers.slice(0, 2).entries()) {
    const trim = buildableTrims[(n * 7) % buildableTrims.length] as TrimRef;
    await prisma.vehicle.create({
      data: {
        ownerId: owner.id,
        brandId: trim.brandId,
        modelId: trim.modelId,
        trimId: trim.id,
        brandName: trim.brandNameAr,
        modelName: trim.modelNameAr,
        trimName: trim.row.nameAr,
        year: 2024 - n,
        bodyType: trim.row.bodyType,
        drivetrain: trim.row.drivetrain,
        seats: trim.row.seats,
        transmission: 'AUTOMATIC',
        fuel: 'PETROL',
        mileageKm: between(8_000, 60_000),
        colorExterior: pick(COLORS),
        spec: 'GCC',
        condition: 'USED',
        city: pick(CITIES),
        entryMode: 'MANUAL',
      },
    });
  }

  // ————— العروض والنزاعات والبلاغات —————
  /**
   * ═══ وثلاثُ شاشاتٍ كانت فارغةً دائمًا ═══
   *
   * البذرة تُنشئ إعلاناتٍ ومزاداتٍ وطلبات، **ولا عرضًا ولا نزاعًا ولا
   * بلاغًا واحدًا**. فـ`/admin/offers` و`/admin/disputes` و
   * `/admin/reports` تُفتح فارغةً في كل بيئةٍ مزروعة — وصفحاتُ
   * تفاصيلها لا شيء يُفتح فيها.
   *
   * ولا شيء يسقط: الشاشة تُصيَّر والاختبار يمرّ (يصنع صفوفه بنفسه) —
   * **والفراغ يُقرأ «لم يُبنَ» لا «لا بيانات»**.
   *
   * **والحالاتُ تُغطّى كلُّها**: شاشةٌ فيها `PENDING` وحدها لا تُظهر
   * نبراتِ الشارات ولا فروعَ العرض — ومراجعةُ التصميم عليها تُخطئ.
   */
  const negotiables = listings.filter((l) => l.type === 'NEGOTIATION').slice(0, 6);
  const offerPlan = [
    { status: 'PENDING' as const, autoRejected: false, ratio: 0.93 },
    { status: 'COUNTERED' as const, autoRejected: false, ratio: 0.96 },
    { status: 'ACCEPTED' as const, autoRejected: false, ratio: 0.98 },
    { status: 'REJECTED' as const, autoRejected: true, ratio: 0.62 },
    { status: 'REJECTED' as const, autoRejected: false, ratio: 0.88 },
    { status: 'WITHDRAWN' as const, autoRejected: false, ratio: 0.9 },
    { status: 'EXPIRED' as const, autoRejected: false, ratio: 0.85 },
  ];

  /**
   * **وأوّلُ عرضٍ ينتظر الردّ يقع على إعلان البائع الذي يشتري أيضًا.**
   *
   * `Wf` يرسم صفحةً فيها «طلباتي» و«العروض الواردة على مركباتك»
   * و«تقارير الفحص» معًا. ومن لا يجتمع له الثلاثة لا تُفتح شاشتُه
   * على ما رُسم، فيُقاس نصفُها ويُقرأ الباقي نقصَ بناء.
   */
  const dualSeller = sellers[0];
  const firstNegotiable =
    negotiables.find((l) => l.sellerId === dualSeller?.id) ?? negotiables[0];

  for (const [n, plan] of offerPlan.entries()) {
    const listing = n === 0 ? firstNegotiable : negotiables[n % negotiables.length];
    if (listing === undefined) break;
    const offerBuyer = buyers[n % buyers.length];
    if (offerBuyer === undefined || offerBuyer.id === listing.sellerId) continue;

    /**
     * ═══ والحيُّ يُزرع حيًّا لا بالحظّ ═══
     *
     * كان `days(-between(2, 20))` ومهلةُ العرض ٩٦ ساعة، **فعرضٌ
     * «ينتظر الرد» يُولد منتهيًا متى وقع الرقم فوق أربعة**. وقِيس:
     * صفرُ عروضٍ حيّة في القاعدة كلِّها — فزرُّ «اقبل» و«عرض مقابل»
     * لا يُعرضان في أيّ شاشة، ورحلةُ التفاوض لا تُمشى.
     *
     * فالنشطُ يُولد داخل مهلته، والمغلقُ خارجها.
     */
    const active = plan.status === 'PENDING' || plan.status === 'COUNTERED';
    const madeAt = active ? hours(-between(2, 40)) : days(-between(5, 20));
    await prisma.offer.create({
      data: {
        listingId: listing.id,
        buyerId: offerBuyer.id,
        amount: new Prisma.Decimal(Math.round(Number(listing.askPrice) * plan.ratio)),
        status: plan.status,
        autoRejected: plan.autoRejected,
        createdAt: madeAt,
        /**
         * ═══ ومتى رُدّ — وإلّا بقيت بطاقتا المعرض غائبتين ═══
         *
         * `Wg` يعرض «معدل الرد» و«متوسط زمن الرد» من `respondedAt`،
         * ولا يعرضهما دون عتبة الثقة. فبلا زرعٍ لها **لا تُفتح
         * البطاقتان في أيّ شاشة** ولا يعرف أحدٌ أتعملان أم لا.
         *
         * والردُّ لمن رُدّ عليه وحده: المقبولُ والمقابَلُ والمرفوضُ
         * بيد. و`PENDING` و`EXPIRED` و`WITHDRAWN` بلا ردّ — والأخيران
         * هما ما يجعل المعدَّل دون المئة، فيُقرأ رقمًا لا زينة.
         */
        ...(plan.status === 'ACCEPTED' ||
        plan.status === 'COUNTERED' ||
        (plan.status === 'REJECTED' && !plan.autoRejected)
          ? { respondedAt: new Date(madeAt.getTime() + between(12, 300) * 60_000) }
          : {}),
        /* **والمنتهي مهلتُه في الماضي** — وإلّا قُرئ نشطًا رغم حالته */
        expiresAt: new Date(madeAt.getTime() + (plan.status === 'EXPIRED' ? 1 : 96) * 3600 * 1000),
      },
    });
  }

  /**
   * ═══ تاريخُ ردٍّ لمعرضٍ واحد — وإلّا بقيت بطاقتا `Wg` غائبتين ═══
   *
   * صفحةُ المعرض تعرض «معدل الرد» و«متوسط زمن الرد» **فوق عتبة ثقةٍ
   * قدرُها ثماني عروضٍ محسومة**. وخطّةُ العروض أعلاه سبعةٌ موزّعةٌ على
   * بائعين مختلفين، فلا معرضَ يبلغ العتبة — **والبطاقتان لا تُفتحان
   * في أيّ شاشة**، ولا يعرف أحدٌ أتعملان أم لا.
   *
   * فيُزرع لكلّ معرضٍ تاريخٌ محسوم: **كلُّه مغلقٌ وفي الماضي**، فلا
   * يُضاف إلى صندوق عروضٍ ينتظر أحدٌ الردَّ فيه، ولا يُحسب عملًا
   * قائمًا في اللوحة.
   *
   * **وفيه ما لم يُردّ عليه** (منتهٍ بلا ردّ) — وإلّا خرج المعدَّل
   * مئةً في المئة دائمًا، وهو رقمٌ لا يُقرأ قياسًا.
   */
  /**
   * **ولكلّ معرضٍ تاريخُه** — ومعدَّلٌ لواحدٍ من أربعة يجعل ثلاثَ صفحاتٍ
   * من أربع تُفتح بلا البطاقتين، فيُقرأ غيابُهما عطلًا. وأربعةُ
   * معدَّلاتٍ مختلفة أصدقُ من واحد: المعارض تتفاوت.
   */
  const RESPONSE_PROFILE = [
    { answered: 11, missed: 2 },
    { answered: 13, missed: 1 },
    { answered: 8, missed: 5 },
    { answered: 12, missed: 0 },
  ];

  for (const [d, manager] of dealerUsers.entries()) {
    const profile = RESPONSE_PROFILE[d % RESPONSE_PROFILE.length];
    if (profile === undefined) continue;

    /**
     * **ولا احتياطيَّ من مخزون غيره.** كان يسقط إلى أيّ إعلانٍ
     * تفاوضيّ حين لا يملك المعرضُ واحدًا — فتُكتب العروضُ على إعلانات
     * بائعٍ آخر **وتُحسب له هو**، والمعرضُ يبقى بلا بطاقة. فظهر
     * «معرض الشرق» بلا ردٍّ وأنا أحسب أنّي زرعتُ له ثلاثةَ عشر.
     *
     * ومعرضٌ بلا مخزونٍ تفاوضيّ **لا تاريخَ ردٍّ له حقًّا** — وصفحتُه
     * بلا البطاقتين هي الحال الصحيحة، وفيها فائدةٌ أخرى: واحدةٌ من
     * أربع تُري كيف تبدو الشاشة قبل أن يصل المعرضَ عرضٌ واحد.
     */
    const stock = listings.filter(
      (l) => l.sellerId === manager.id && l.type === 'NEGOTIATION',
    );
    if (stock.length === 0) continue;

    const history = [
      ...Array.from({ length: profile.answered }, () => true),
      ...Array.from({ length: profile.missed }, () => false),
    ];

    for (const [n, answered] of history.entries()) {
      const listing = stock[n % stock.length];
      const historyBuyer = buyers[(n + d) % buyers.length];
      if (listing === undefined || historyBuyer === undefined) continue;
      if (historyBuyer.id === listing.sellerId) continue;

      const madeAt = days(-between(10, 150));
      await prisma.offer.create({
        data: {
          listingId: listing.id,
          buyerId: historyBuyer.id,
          amount: new Prisma.Decimal(Math.round(Number(listing.askPrice) * 0.9)),
          status: answered ? 'REJECTED' : 'EXPIRED',
          autoRejected: false,
          createdAt: madeAt,
          /** **والوسيطُ يقع في الدقائق** — ومعرضٌ يردّ بعد يومين يُقرأ بطيئًا. */
          ...(answered
            ? { respondedAt: new Date(madeAt.getTime() + between(8, 90 + d * 40) * 60_000) }
            : {}),
          expiresAt: new Date(madeAt.getTime() + 96 * 3600 * 1000),
        },
      });
    }
  }

  /** نزاعان: واحدٌ مفتوحٌ ينتظر، وواحدٌ حُسم — فالشاشة تُظهر الطرفين. */
  const disputable = await prisma.order.findMany({
    where: {
      stage: { in: ['TRANSFER', 'DONE'] },
      /**
       * **وليس الطلبَ المزروع للإفراج.** النزاعُ المحسوم يردّ جزءًا
       * فيصير ضمانُه `PARTIAL_REFUND`، فلو وقع عليه لقال الطابور
       * «تنتظر الإفراج» وضمانُه مردود — وهو الحال الذي يحجبه
       * `canSettle` الآن، فتخلو الشريحةُ ويبقى الزرُّ بلا بيانات.
       */
      ...(releaseRef === null ? {} : { ref: { not: releaseRef } }),
    },
    select: { id: true, buyerId: true, createdAt: true },
    take: 2,
  });
  for (const [n, order] of disputable.entries()) {
    const resolved = n === 1;
    /** **والنزاع يُفتح بعد طلبه** — ومرساه تاريخُ الطلب لا «الآن». */
    const openedAt = new Date(order.createdAt.getTime() + 3 * 24 * 3600 * 1000);
    await prisma.dispute.create({
      data: {
        orderId: order.id,
        openedBy: order.buyerId,
        reason: resolved ? 'تأخر نقل الملكية عن الموعد' : 'المركبة بحالة غير الموصوفة في الإعلان',
        /* **والتعدادُ يُقرأ لا يُتذكَّر**: لا `RESOLVED` فيه — بل بمن حُسم لصالحه */
        status: resolved ? 'RESOLVED_BUYER' : 'OPEN',
        slaDueAt: new Date(openedAt.getTime() + 48 * 3600 * 1000),
        openedAt,
        ...(resolved
          ? {
              resolution: 'PARTIAL_SETTLEMENT',
              resolutionAmount: new Prisma.Decimal(1500),
              resolvedAt: new Date(openedAt.getTime() + 36 * 3600 * 1000),
            }
          : {}),
        messages: [
          { at: new Date(openedAt.getTime() + 3600 * 1000).toISOString(), by: 'buyer', text: 'أرفقت صور الحالة.' },
          { at: new Date(openedAt.getTime() + 7200 * 1000).toISOString(), by: 'seller', text: 'الوصف مطابق، والصور بعد التسليم.' },
        ],
      },
    });

    /**
     * **والضمان يتبع القرار.** `resolveDispute` تكتب `PARTIAL_REFUND`
     * مع التسوية الجزئية، وبذرةٌ تترك الضمان `RELEASED` تُنتج حالةً
     * **لا يستطيع المنتج إنتاجها**: «حُسم للمشتري» فوق «أُفرج للبائع».
     * والشاشة تعرضهما معًا فيبدو العطل فيها وهو في البيانات.
     */
    if (resolved) {
      await prisma.escrow.updateMany({
        where: { orderId: order.id },
        data: { status: 'PARTIAL_REFUND' },
      });

      /**
       * **وما وقع فعلًا يُكتب في `settlementAmount`.** البذرةُ كانت
       * تردّ ألفًا وخمسَ مئة في الدفتر وتترك الحقلَ فارغًا — و
       * `netToSeller` تقرأ `settlementAmount ?? agreedPrice`، فيقرأ
       * **السعرَ كاملًا** كلُّ من يحسب: دفترُ البائع، وبطاقةُ المستحقّ
       * في لوحة المعرض، وكشفُ التسوية، والفاتورة. فالمنصّة تَعِد
       * البائع بما ردّت نصفَه للمشتري.
       *
       * و`resolvePartial` في `disputes.ts` تكتبه منذ بُنيت
       * (`totalAmount − refund`) — **فالبذرةُ تُنتج حالًا لا يبلغها
       * المنتج**، وهو الصنف الذي يذكره التعليق فوقه عن الضمان نفسِه.
       */
      const paid = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        select: { totalAmount: true },
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { settlementAmount: paid.totalAmount.minus(new D('1500.00')) },
      });

      /**
       * **وردُّ المال يُقيَّد.** الضمان يصير `PARTIAL_REFUND` والدفتر
       * لا يعلم — فيقول «لدى مزوّد الدفع» مبلغًا خرج نصفُه. والردّ
       * هنا **قبل الاستحقاق**: الطلب لم يُكمَل، فلا إيرادَ يُعكَس.
       */
      const { recordRefund } = await ledgerEvents();
      await recordRefund(
        prisma,
        {
          orderId: order.id,
          buyerId: order.buyerId,
          amount: new D('1500.00'),
          afterEarning: false,
        },
        new Date(openedAt.getTime() + 36 * 3600 * 1000),
      );
    } else {
      /**
       * ═══ والطلب يدخل `DISPUTED` بفتح النزاع ═══
       *
       * `openDispute` تكتبها في المعاملة نفسها، والبذرة كانت تترك
       * الطلب `ACTIVE`. والأثر **ماليّ لا تجميليّ**: لوحة المالية
       * تقرأ «المجمَّد بنزاع» من `escrow HELD AND order DISPUTED`،
       * فكانت تقول صفرًا وفي الضمان أربعةٌ وثمانون ألفًا مجمَّدة.
       *
       * ورقمٌ يُعرض على مستثمر ويقول صفرًا عن مالٍ مجمَّد أسوأ من
       * غيابه.
       */
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'DISPUTED' },
      });
    }
  }

  /** بلاغان على إعلانين — أحدهما مفتوحٌ والآخر مُغلق. */
  for (const [n, listing] of listings.slice(0, 2).entries()) {
    const reporter = buyers[n % buyers.length];
    if (reporter === undefined) continue;
    await prisma.report.create({
      data: {
        ref: `RPT-2026-${String(100 + n)}`,
        reporterId: reporter.id,
        targetType: 'listing',
        targetId: listing.id,
        reason: n === 0 ? 'سعر مضلل' : 'صور لا تخص المركبة',
        details: n === 0 ? 'السعر المعروض أقل مما يطلبه البائع عند التواصل.' : null,
        status: n === 0 ? 'open' : 'closed',
        createdAt: days(-between(1, 12)),
      },
    });
  }

  // ————— تقريرا فحص كاملان — ٢١٠ نقطة لكلٍّ منهما —————
  /**
   * النقاط أسماء حقيقية لا معرّفات مصطنعة: تقرير فحص يقرؤه مشترٍ
   * ليقرّر شراءً، و«الهيكل والصبغ-١٧» لا يقول له شيئًا. الأسماء في
   * `prisma/seed-data/inspection-points.json` ومجموعها ٢١٠ بالضبط.
   */
  const POINTS = load<Record<string, { name: string; points: string[] }>>('inspection-points.json');

  /** الملاحظات المحدَّدة — الفاحص لا يكتب على كل نقطة، بل على ما يستحق. */
  const FINDINGS: Record<string, { state: string; note: string; photos: string[] }> = {
    'سماكة طلاء المصد الخلفي': {
      state: 'PAINT',
      note: 'سماكة الطلاء ١٨٠ ميكرون مقابل ١١٥ للقطع المجاورة — صبغ إصلاحي لا استبدال.',
      photos: ['inspection/rear-bumper-1.jpg'],
    },
    'مساعد أمامي أيسر': {
      state: 'NOTE',
      note: 'بداية ترشيح زيت دون تأثير على الأداء. ينصح بالمتابعة خلال ١٠٬٠٠٠ كم.',
      photos: ['inspection/front-left-strut.jpg'],
    },
    'عمق نقشة الإطار الأمامي الأيمن': {
      state: 'NOTE',
      note: 'عمق النقشة ٥٫٤ ملم مقابل ٦٫٢ لبقية الإطارات.',
      photos: ['inspection/front-right-tyre.jpg'],
    },
    'سماكة طلاء الرفرف الأمامي الأيمن': {
      state: 'PAINT',
      note: 'صبغ في الرفرف الأيمن — ٢٤٠ ميكرون.',
      photos: ['inspection/right-fender.jpg'],
    },
    /**
     * ═══ وبندٌ لا ينطبق — وما لا يُزرع لا يُرى ═══
     *
     * العلامةُ الثالثة («لم يُفحَص») مبنيّةٌ في الشاشة ومفتاحُها في
     * المفتاح، **ولا صفَّ يحملها في أيّ تقرير مزروع** — فعدّادُها صفرٌ
     * دائمًا وشكلُها لا يراه أحد. وهذان بندان يقعان فعلًا على سيارةٍ
     * عادية: لا توربو فيها ولا شاحن كهربائيّ.
     *
     * **والسببُ يُكتب**: «لم يُفحَص» بلا سببٍ تُقرأ تقصيرًا من الفاحص.
     */
    'توربو (إن وجد)': {
      state: 'NOT_INSPECTED',
      note: 'المركبة بمحرك تنفس طبيعي — لا شاحن توربيني فيها.',
      photos: [],
    },
    'الشاحن الكهربائي (إن وجد)': {
      state: 'NOT_INSPECTED',
      note: 'المركبة بنزين — لا نظام شحن كهربائي فيها.',
      photos: [],
    },
  };

  const SECTION_SCORES: Record<string, number> = {
    engine: 96,
    transmission: 94,
    brakes: 89,
    tyres: 91,
    body: 86,
    electric: 95,
  };

  const SECTION_NOTES: Record<string, string> = {
    engine: 'ضغط متساو على الأسطوانات، لا تسريب زيت.',
    transmission: 'تعشيق سلس، لا اهتزاز عند التسارع.',
    brakes: 'الأقراص الأمامية ٧٢٪ من العمر، ومساعد أمامي أيسر بداية ترشيح.',
    tyres: 'الإطارات الأمامية بعمر سنتين، والخلفية بثلاث.',
    body: 'هيكل سليم بلا حوادث مسجلة. صبغ على المصد الخلفي فقط.',
    electric: 'جميع الأنظمة تعمل، وشحن البطارية ضمن المدى.',
  };

  const inspectionServiceId = services.get('inspection') as string;

  /** أسماءُ الفاحصين — تبقى في القاعدة، ويُعرض رمزُها وحده. */
  const INSPECTORS = ['م. تركي الشمري', 'م. بدر المطيري', 'م. عبدالعزيز الحربي'] as const;

  /**
   * ═══ ودفترُ الخدمة يُكتب كما يكتبه المنتج ═══
   *
   * البذرة كانت تكتب `status: 'DONE'` مباشرةً، و`applyStep` تشترط
   * `paymentId !== null` لتقيّد — **فلا قيدَ خدمةٍ واحد في الدفتر**:
   * قِيس فكان `PROVIDER_PAYABLE` **صفر صفوف**. والأثر شاشاتٌ كاملة:
   * رصيدُ كل مزوّد ٠٫٠٠ في صفحته، وكشفُه فارغ، **وطابورُ الصرف لا
   * يعرض أحدًا** — فميزةٌ تُبنى ولا تُرى عاملةً في أيّ بيئة.
   *
   * والأرقام بحاسبة المنتج (`serviceTotal`): السعرُ للمزوّد، ورسمُنا
   * فوقه، والضريبة على المجموع — ولو كُتبت بيدٍ ناقضت قاعدةَ الرسم.
   */
  async function settleServiceRequest(input: {
    requestId: string;
    ref: string;
    requesterId: string;
    providerId: string | null;
    price: Prisma.Decimal;
    paidAt: Date;
    doneAt: Date;
  }): Promise<void> {
    const { serviceTotal } = await money();
    const amounts = serviceTotal(input.price, new D('15.00'), null);

    const payment = await prisma.payment.create({
      data: {
        purpose: 'SERVICE_PURCHASE',
        gatewayKey: 'bank_escrow',
        amount: amounts.total,
        method: 'mada',
        status: 'SETTLED',
        holdRef: `hold_${input.ref.toLowerCase()}`,
        settleRef: `stl_${input.ref.toLowerCase()}`,
        settledAmount: amounts.total,
        settledAt: input.doneAt,
        heldAt: input.paidAt,
        createdAt: input.paidAt,
      },
    });

    await prisma.serviceRequest.update({
      where: { id: input.requestId },
      data: {
        amount: amounts.total,
        adminFee: amounts.platformFee,
        vatAmount: amounts.vat,
        paymentId: payment.id,
      },
    });

    const { recordServiceEarned, recordServicePaid } = await ledgerEvents();
    await recordServicePaid(
      prisma,
      {
        ref: input.ref,
        paymentId: payment.id,
        requesterId: input.requesterId,
        total: amounts.total,
      },
      input.paidAt,
    );
    await recordServiceEarned(
      prisma,
      {
        ref: input.ref,
        paymentId: payment.id,
        requesterId: input.requesterId,
        total: amounts.total,
        platformFee: amounts.platformFee,
        vat: amounts.vat,
        providerId: input.providerId,
      },
      input.doneAt,
    );
  }

  /**
   * ═══ تقريرُ فحصٍ في كل نوع بيع ═══
   *
   * كان التقريران كلاهما على `listings[0]` و`listings[1]`، **وهما
   * بيعٌ مباشر**. فشاشةُ تقرير الفحص — وهي من أثقل ما في المنتج:
   * درجةٌ وأقسامٌ ومخطّط هيكلٍ وملاحظات — **لا تُرى في مزادٍ ولا في
   * مساومة** في أيّ بيئة مزروعة. وشارةُ «مفحوصة» لا تظهر على كرت
   * مزادٍ قطّ، والمزاد أحوجُ ما يكون إليها: من يحجز عربونًا على
   * مركبةٍ لم يرَها يشتري التقرير قبل السيارة.
   *
   * فواحدٌ من كل نوع — ومن أوائل القائمة، فالطلبات تُبنى عليها
   * فتظهر البطاقة بشارتها في الرئيسية والبحث معًا.
   */
  const inspectables: ListingRef[] = (['DIRECT', 'NEGOTIATION', 'AUCTION'] as const)
    .map((type) => listings.find((row) => row.type === type))
    .filter((row): row is ListingRef => row !== undefined);

  for (let i = 0; i < inspectables.length; i += 1) {
    const l = inspectables[i] as ListingRef;
    const request = await prisma.serviceRequest.create({
      data: {
        ref: `SRV-2026-${String(3000 + i)}`,
        serviceId: inspectionServiceId,
        userId: l.sellerId,
        listingId: l.id,
        vehicleId: l.vehicleId,
        providerId: providers.get('INSPECTION') ?? null,
        status: 'DONE',
        amount: new D('450.00'),
        dueAt: days(-between(5, 20)),
        createdAt: days(-between(21, 40)),
      },
    });

    /** فارقُ هذا التقرير عن الأساس — صفرٌ للأوّل، ثم أعمقُ فأعمق. */
    const SECTION_DROP = [0, 14, 28][i] ?? 0;

    const sections = Object.entries(POINTS).map(([key, section]) => ({
      key,
      name: section.name,
      /**
       * ═══ والدرجة الكلّية من أقسامها ═══
       *
       * كانت درجاتُ الأقسام ثابتةً للتقارير الثلاثة والدرجةُ الكلّية
       * مكتوبةً بيد، فخرج تقريرٌ **كلّيُّه ٦٤ وكلُّ أقسامه ٨٦ فأعلى**
       * — ومتوسّطُها ٩٢. وتقريرٌ كهذا لا يُنتجه فاحص، والقارئ يرى
       * الرقمين فلا يصدّق أيًّا منهما.
       *
       * فالأقسام تهبط بفارقٍ واحد عن الأساس، والكلّيّة متوسّطُها.
       */
      score: Math.max(35, (SECTION_SCORES[key] ?? 90) - SECTION_DROP),
      note: SECTION_NOTES[key] ?? null,
      points: section.points.map((label, n) => {
        /**
         * الملاحظات لكل تقرير لا للأوّل وحده.
         *
         * وكان الثاني يحمل درجة ٨٧ **بلا ملاحظة واحدة** — تقريرٌ يقول
         * «٨٧ من ١٠٠» ثم لا يذكر ما نقص. والمشتري يقرأ الرقم ويبحث عن
         * سببه فلا يجده.
         */
        const finding = FINDINGS[label];
        return {
          id: `${key}-${n + 1}`,
          label,
          state: finding?.state ?? 'OK',
          note: finding?.note ?? null,
          photos: finding?.photos ?? [],
        };
      }),
    }));

    await prisma.inspectionReport.create({
      data: {
        ref: `INS-2026-${String(41800 + i)}`,
        serviceRequestId: request.id,
        vehicleId: l.vehicleId,
        /**
         * **منشورٌ لأن طالبه مالكُ المركبة** (قرار المالك ٤). والشرط
         * واحدٌ مع ما يقرؤه المنتج — لا رايةٌ تُكتب هنا بيد.
         */
        publishedAt: days(-between(5, 20)),
        /**
         * **ودرجاتٌ متباعدة** — فالشاشة تُرى في حالاتها: ممتازٌ
         * أخضر، ومقبولٌ أصفر، ودونه. ودرجةٌ واحدة لا تُظهر إلّا حالًا.
         */
        score: Math.round(
          sections.reduce((total, section) => total + section.score, 0) / sections.length,
        ),
        /**
         * **والاسمُ يبقى في القاعدة ولا يُعرض** (قرار المالك
         * ٢٠٢٦-١٠-١٨): أثرٌ يُحتجّ به عند نزاع، ورمزُه هو المنشور.
         * ويُشتقّ هنا بالدالّة نفسها التي يكتب بها المنتج — لا برمزٍ
         * يُكتب بيد فيختلف عن اشتقاقه.
         */
        inspectorName: INSPECTORS[i] ?? 'م. فاحص',
        inspectorCode: inspectorCodeFor(INSPECTORS[i] ?? 'م. فاحص'),
        inspectedAt: days(-between(5, 20)),
        sections,
        paintMap: {
          summary:
            'هيكل سليم بلا حوادث مسجلة. صبغ على المصد الخلفي فقط بسماكة ١٨٠ ميكرون. لا آثار لحام أو استبدال في أي قطعة أساسية.',
          frontBumper: 'original',
          hood: 'original',
          roof: 'original',
          trunk: 'original',
          rearBumper: i === 0 ? 'repainted' : 'original',
          frontRightFender: i === 0 ? 'repainted' : 'original',
          frontLeftFender: 'original',
          rightFrontDoor: 'original',
          leftFrontDoor: 'original',
          rightRearDoor: 'original',
          leftRearDoor: 'original',
        },
      },
    });

    /** **والمال يُقيَّد مع الإنجاز** — فحقُّ الفاحص يظهر في طابور الصرف. */
    await settleServiceRequest({
      requestId: request.id,
      ref: request.ref,
      requesterId: l.sellerId,
      providerId: providers.get('INSPECTION') ?? null,
      price: new D('450.00'),
      paidAt: days(-between(21, 40)),
      doneAt: days(-between(5, 20)),
    });
  }

  /**
   * ═══ وتقريرٌ دفع ثمنَه مشترٍ — خاصٌّ به ═══
   *
   * قرار المالك ٤: «تقرير البائع عامٌّ على الإعلان، وتقرير المشتري
   * خاصٌّ به حتى يشاركه أو يشتريه البائع». والثلاثة أعلاه كلُّها
   * طلبها بائعُها — **فالحالُ الخاصّ لم يُزرع قطّ**، وقد بقي الشرط
   * غائبًا من الاستعلام حتى قِيس: أيُّ زائر يرى تقريرَ من دفع.
   *
   * **وما لا يُزرع لا يُرى.**
   */
  const buyerInspected = listings.find(
    (row) => !inspectables.some((other) => other.id === row.id),
  );
  const reportBuyer = sellers.find((row) => row.id !== buyerInspected?.sellerId);
  if (buyerInspected !== undefined && reportBuyer !== undefined) {
    const request = await prisma.serviceRequest.create({
      data: {
        /**
         * **ولكلِّ عائلةِ مراجعَ كتلتُها المئوية.** كان هذا `3100`
         * وطابورُ المزوّد يبدأ من `3100 + n` — **فاصطدما عند `n = 0`
         * و`npm run db:seed` يسقط منذ `bac2d43`**: بيئةٌ جديدة لا
         * تُزرع أصلًا، ولا شيء في `verify` يمرّ بالبذرة فيقول.
         * والبوابة ٥٧ تمنع تقاطع الكتل.
         */
        ref: 'SRV-2026-3200',
        serviceId: inspectionServiceId,
        userId: reportBuyer.id,
        sellerId: buyerInspected.sellerId,
        listingId: buyerInspected.id,
        vehicleId: buyerInspected.vehicleId,
        providerId: providers.get('INSPECTION') ?? null,
        status: 'DONE',
        amount: new D('450.00'),
        dueAt: days(-4),
        createdAt: days(-12),
      },
    });

    await prisma.inspectionReport.create({
      data: {
        ref: 'INS-2026-41900',
        serviceRequestId: request.id,
        vehicleId: buyerInspected.vehicleId,
        score: 78,
        inspectorName: 'م. تركي الشمري',
        inspectorCode: inspectorCodeFor('م. تركي الشمري'),
        inspectedAt: days(-4),
        /** **خاصٌّ**: طالبُه ليس مالكَ المركبة. */
        publishedAt: null,
        sections: Object.entries(POINTS).map(([key, section]) => ({
          key,
          name: section.name,
          score: Math.max(35, (SECTION_SCORES[key] ?? 90) - 12),
          note: SECTION_NOTES[key] ?? null,
          points: section.points.map((label, n) => {
            const finding = FINDINGS[label];
            return {
              id: `${key}-${n + 1}`,
              label,
              state: finding?.state ?? 'OK',
              note: finding?.note ?? null,
              photos: finding?.photos ?? [],
            };
          }),
        })),
        paintMap: {
          summary: 'هيكل سليم. صبغ على الباب الخلفي الأيمن بسماكة ١٦٠ ميكرون.',
          frontBumper: 'original',
          hood: 'original',
          roof: 'original',
          trunk: 'original',
          rearBumper: 'original',
          frontRightFender: 'original',
          frontLeftFender: 'original',
          rightFrontDoor: 'original',
          leftFrontDoor: 'original',
          rightRearDoor: 'repainted',
          leftRearDoor: 'original',
        },
      },
    });

    await settleServiceRequest({
      requestId: request.id,
      ref: request.ref,
      requesterId: reportBuyer.id,
      providerId: providers.get('INSPECTION') ?? null,
      price: new D('450.00'),
      paidAt: days(-12),
      doneAt: days(-4),
    });
  }

  /**
   * ═══ وطابورٌ فيه عمل ═══
   *
   * الطلبان أعلاه **منجَزان كلاهما**، فشاشة طلبات الخدمات تُفتح وكلُّ
   * شريحةٍ فيها صفر عدا «مكتملة» — والطابور الذي بُني لإسناد الطلبات
   * وملاحقة مهلها لا يُرى عاملًا في أيّ بيئة.
   *
   * فهذه خمسةٌ تملأ الحالات التي يُدار بها: جديدٌ بلا مزوّد ينتظر
   * الإسناد، ومُسنَدٌ في مهلته، وقيد تنفيذٍ **تجاوز مهلته**، وفاشلٌ،
   * ومستردّ. وكلُّها على خدماتٍ مختلفة فتُقرأ الشرائح بالنوع أيضًا.
   */
  const QUEUE: readonly {
    service: string;
    status: 'NEW' | 'ASSIGNED' | 'IN_PROGRESS' | 'DONE' | 'FAILED' | 'REFUNDED';
    provider: 'INSPECTION' | 'SHIPPING' | 'DETAILING' | 'TRANSFER' | null;
    /** ساعاتٌ من الآن — سالبٌ يعني أن المهلة فاتت. */
    dueInHours: number;
    scheduledInHours: number | null;
    /**
     * ساعاتٌ من المهلة إلى الإنجاز — موجبٌ تأخّرٌ وسالبٌ التزام.
     * والافتراضيّ `-6`: أُنجز قبل مهلته بستّ ساعات.
     */
    lateHours?: number;
  }[] = [
    { service: 'inspection', status: 'NEW', provider: null, dueInHours: 20, scheduledInHours: 28 },
    { service: 'shipping', status: 'ASSIGNED', provider: 'SHIPPING', dueInHours: 44, scheduledInHours: 50 },
    /**
     * **ومُسنَدٌ إلى مزوّده** — كان `provider: null` وحالُه
     * `IN_PROGRESS`: طلبٌ «قيد التنفيذ» لا مزوّدَ له، فلا يراه أحدٌ في
     * طابوره ولا يُنهيه أحد. وهو متأخّرٌ بتسع ساعات في لوحة المهل إلى
     * الأبد.
     */
    { service: 'ownership_transfer', status: 'IN_PROGRESS', provider: 'TRANSFER', dueInHours: -9, scheduledInHours: -2 },
    /**
     * **وفحصٌ مُسنَدٌ وآخرُ جارٍ** — وكانا ناقصين، فشاشةُ نموذج الفحص
     * لا تُفتح على بياناتٍ مزروعة أصلًا: كلُّ فحصٍ في الزرع منتهٍ.
     * وهو نمطُ «ما لا يُزرع لا يُرى» المسجَّل: كلُّ قيمةِ تعدادٍ
     * يكتبها المنتج تُزرع.
     */
    { service: 'inspection', status: 'ASSIGNED', provider: 'INSPECTION', dueInHours: 30, scheduledInHours: 36 },
    { service: 'inspection', status: 'IN_PROGRESS', provider: 'INSPECTION', dueInHours: 18, scheduledInHours: 6 },
    { service: 'inspection', status: 'FAILED', provider: 'INSPECTION', dueInHours: -60, scheduledInHours: -72 },
    { service: 'detailing', status: 'REFUNDED', provider: 'DETAILING', dueInHours: -96, scheduledInHours: -100 },
    /**
     * ═══ ومُنجَزٌ لغير الفاحص — وإلّا فطابورُ الصرف مزوّدٌ واحد ═══
     *
     * كلُّ ما يُنجَز في الزرع فحصٌ، فـ`PROVIDER_PAYABLE` كلُّه لمركز
     * الفحص: شاشةُ الصرف صفٌّ واحد، وخمسةُ مزوّدين أرصدتُهم ٠٫٠٠ في
     * صفحاتهم. فواحدٌ لكلّ من الشحن والنقل والتلميع — وهي أصنافٌ لها
     * نماذجُ إنجازٍ مختلفة، فيُرى الكشفُ بحركاتٍ من مصادر.
     */
    { service: 'shipping', status: 'DONE', provider: 'SHIPPING', dueInHours: -220, scheduledInHours: -240 },
    /** **وواحدٌ يتأخّر** — وإلّا قرأ التزامُ المزوّدين ١٠٠٪ أبدًا. */
    { service: 'ownership_transfer', status: 'DONE', provider: 'TRANSFER', dueInHours: -190, scheduledInHours: -200, lateHours: 14 },
    { service: 'detailing', status: 'DONE', provider: 'DETAILING', dueInHours: -150, scheduledInHours: -160 },
    /**
     * ═══ وخدمةٌ آليّة — «موجز» ═══
     *
     * `mojaz` مزروعةٌ في الكتالوج `isAutomated` منذ اليوم الأوّل،
     * **ولا طلبَ واحد عليها**. وترميز A6 يجعلها شريحةً ثانية بعد
     * الفحص، ويكتب لها لوحةً كاملة («تقرير موجز يُجلب من النظام
     * مباشرة بلا مزوّد بشري»).
     *
     * فالشريحةُ لا تظهر أصلًا — الشرائحُ تُشتقّ ممّا له طلبات —
     * والمسارُ الآليُّ لم يُمشَ في أيّ بيئة. **وبلا مزوّد**: هذا
     * معناها.
     */
    { service: 'mojaz', status: 'DONE', provider: null, dueInHours: -36, scheduledInHours: null },
  ];

  /**
   * **وصاحبُ الصفقة المكتملة هو من يُعطى طلبَ الخدمة.** فحسابٌ واحد
   * يجمع طلبَ شراءٍ بوثائقه وطلبَ خدمةٍ بتقريره — ومشيُ السطح يدخل
   * بحسابٍ واحد، فإن تفرّقا بقيت إحدى الشاشتين بلا قياسٍ قطّ:
   * `/account/orders/[ref]/documents/[kind]` أو `/account/reports/[ref]`.
   */
  const docBuyer = prisma.order.findFirst({
    where: { agreement: { isNot: null } },
    select: { buyerId: true },
  });

  for (const [n, plan] of QUEUE.entries()) {
    const serviceId = services.get(plan.service);
    const l = listings[n + 2] as ListingRef | undefined;
    if (serviceId === undefined || l === undefined) continue;
    const price = servicePrices.get(plan.service) ?? new D('450.00');

    /**
     * ═══ وطلبٌ يطلبه مشترٍ له طلبُ شراء — وكان الصنفان منفصلين ═══
     *
     * كلُّ طلبِ خدمةٍ هنا `userId: l.sellerId`، وكلُّ طلبِ شراءٍ
     * لمشترٍ — **فلا حسابَ في البيئة يجمع الاثنين**. ومشيُ السطح
     * يدخل بحسابٍ واحد، فإن اختار مشتريًا بقيت `/account/reports/[ref]`
     * **بلا قياسٍ قطّ**، وإن اختار بائعًا بقيت صفحات الطلبات.
     *
     * والشكلُ صحيحٌ في النطاق أصلًا: مشترٍ يفحص سيارة غيره —
     * `userId` من طلب، و`sellerId` صاحبُ المركبة.
     */
    const asBuyer = n === 0 ? ((await docBuyer)?.buyerId ?? l.sellerId) : l.sellerId;

    const created = await prisma.serviceRequest.create({
      data: {
        ref: `SRV-2026-${String(3100 + n)}`,
        serviceId,
        userId: asBuyer,
        listingId: l.id,
        vehicleId: l.vehicleId,
        /** و`null` تعني طلبًا على مركبةِ صاحبه — فلا إذنَ يلزم */
        sellerId: asBuyer === l.sellerId ? null : l.sellerId,
        providerId: plan.provider === null ? null : (providers.get(plan.provider) ?? null),
        status: plan.status,
        amount: price,
        city: l.city,
        dueAt: hours(plan.dueInHours),
        scheduledAt: plan.scheduledInHours === null ? null : hours(plan.scheduledInHours),
        /**
         * **ولحظةُ الإنجاز تُزرع مع الحال.** بطاقتا A6 «متوسط زمن
         * التنفيذ» و«التزام المزوّدين» تُقاسان منها، وبلا زرعٍ تقرآن
         * «لا منجَز مقيس» في كلّ بيئة — والعمودُ جديد فلا صفَّ قديمًا
         * يحمله.
         *
         * **وبعضُها يتجاوز مهلتَه وبعضُها لا**، وإلّا قرأ التزامُ
         * المزوّدين ١٠٠٪ أو ٠٪ — ورقمٌ لا يتحرّك لا يُقاس عليه.
         */
        ...(plan.status === 'DONE'
          ? { completedAt: hours(plan.dueInHours + (plan.lateHours ?? -6)) }
          : {}),
        createdAt: hours(plan.dueInHours - 48),
      },
    });

    /** **والمُنجَز وحده يُقيَّد** — وما قبله لم يقع توريدُه بعد. */
    if (plan.status === 'DONE') {
      await settleServiceRequest({
        requestId: created.id,
        ref: created.ref,
        requesterId: asBuyer,
        providerId: plan.provider === null ? null : (providers.get(plan.provider) ?? null),
        price,
        paidAt: hours(plan.dueInHours - 48),
        doneAt: hours(plan.dueInHours + 2),
      });
    }
  }

  // ————— مواعيد المعاينة —————
  /**
   * ═══ وكلُّ حالٍ تُزرع ═══
   *
   * **ما لا يُزرع لا يُرى**: حالٌ لا تفتحها شاشةٌ قطّ تسكن فيها عيوبٌ
   * شهورًا — وقعت في الطلب الملغى فكشفت تسعة مواضع. فالستُّ كلُّها
   * هنا: ينتظر، ومؤكَّد، ومعتذَرٌ عنه، وملغًى بكلا الطرفين، ومنقضٍ،
   * وتامّ.
   *
   * **والمشتري من له طلبُ شراءٍ وطلبُ خدمة** — فحسابٌ واحد يجمع
   * الثلاثة، ومشيُ السطح يدخل بحسابٍ واحد.
   */
  const viewingBuyer = (await docBuyer)?.buyerId ?? buyers[0]?.id ?? null;
  const viewable = listings.filter((row) => row.sellerId !== viewingBuyer).slice(0, 7);

  if (viewingBuyer !== null && viewable.length >= 7) {
    const PLAN = [
      { status: 'REQUESTED', days: 2, period: 'AFTERNOON', meeting: null, reason: null, by: null },
      /**
       * **واقترح البائع موعدًا آخر** — والدورُ على المشتري. ونقطةُ
       * اللقاء مكتوبةٌ ومخفيّةٌ حتى يقبل، فالاقتراحُ كاملٌ لا نصفُه.
       */
      {
        status: 'COUNTERED',
        days: 4,
        period: 'NOON',
        meeting: 'مواقف مجمع العثيم، مخرج ٩، الرياض.',
        reason: null,
        by: null,
      },
      {
        status: 'CONFIRMED',
        days: 3,
        period: 'EVENING',
        meeting: 'محطة بترومين، تقاطع طريق الملك عبدالعزيز مع الأمير سلطان، حي الملقا.',
        reason: null,
        by: null,
      },
      {
        status: 'DECLINED',
        days: 1,
        period: 'MORNING',
        meeting: null,
        reason: 'السيارة عند وكالة الصيانة هذا الأسبوع. أقترح بعد العصر يوم السبت.',
        by: null,
      },
      { status: 'CANCELLED', days: 1, period: 'NOON', meeting: null, reason: null, by: 'BUYER' },
      { status: 'EXPIRED', days: -4, period: 'EVENING', meeting: null, reason: null, by: null },
      {
        status: 'COMPLETED',
        days: -7,
        period: 'AFTERNOON',
        meeting: 'مواقف نادي الحي، شارع الأمير ماجد.',
        reason: null,
        by: null,
      },
    ] as const;

    for (const [n, plan] of PLAN.entries()) {
      const l = viewable[n] as ListingRef;
      const day = new Date(NOW.getTime() + plan.days * 86_400_000);
      await prisma.viewing.create({
        data: {
          ref: `VIW-2026-${String(9100 + n)}`,
          listingId: l.id,
          buyerId: viewingBuyer,
          sellerId: l.sellerId,
          status: plan.status,
          onDate: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())),
          period: plan.period,
          buyerNote: n === 0 ? 'أصل من الدمام نهاية الأسبوع — أفضل بعد العصر.' : null,
          /** وما طلبه المشتري قبل الاقتراح — فيُقرأ الفرق لا الموعدُ وحده */
          originalDate:
            plan.status === 'COUNTERED'
              ? new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() - 2))
              : null,
          originalPeriod: plan.status === 'COUNTERED' ? 'EVENING' : null,
          meetingPoint: plan.meeting,
          declineReason: plan.reason,
          cancelledBy: plan.by,
          respondedAt: plan.status === 'REQUESTED' ? null : hours(-6),
          createdAt: hours(plan.days * 24 - 48),
        },
      });
    }
  }

  // ————— مفضّلات وبحوث محفوظة — بلاها لا تُقاس شريحة ولا تُختبر —————
  const buyerPool = await prisma.user.findMany({
    where: { dealerId: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  const publishedListings = await prisma.listing.findMany({
    where: { status: 'PUBLISHED' },
    select: { id: true },
    orderBy: { ref: 'asc' },
  });

  /**
   * ═══ ومزادٌ مباشر بين المفضّلات ═══
   *
   * ترميز `Wu` يضع تحت المركبة «في مزاد · ينتهي بعد …» — وهي أعجلُ ما
   * في الشاشة: مزادٌ يغلق غدًا على مركبةٍ حفظها صاحبُها. **والتوزيعُ
   * بالدوران قد لا يقع على إعلانِ مزادٍ حيّ أصلًا**، فتبقى الحالُ
   * مبنيّةً بلا بياناتٍ تُظهرها في أيّ بيئةٍ مزروعة.
   *
   * فتُدسّ واحدةٌ في أوّل مفضّلةٍ لنصف من يُفضّلون — لا لحسابٍ بعينه:
   * **زرعٌ يُرضي أداةَ قياسٍ يُفسد البيانات**، وزرعٌ يُحاكي الواقع
   * تراه الأداةُ وغيرُها.
   */
  const liveAuctions = await prisma.listing.findMany({
    where: { status: 'PUBLISHED', auction: { status: 'LIVE', endsAt: { gt: NOW } } },
    select: { id: true },
    orderBy: { ref: 'asc' },
  });

  for (const [index, buyer] of buyerPool.entries()) {
    // ثلثا المشترين لهم مفضّلة — والباقي بلاها ليبقى للشريحة معنًى
    if (index % 3 === 2 || publishedListings.length === 0) continue;
    const count = between(1, 3);
    for (let n = 0; n < count; n += 1) {
      const auction = liveAuctions[(index / 2) % liveAuctions.length];
      const listing =
        n === 0 && index % 2 === 0 && auction !== undefined
          ? auction
          : publishedListings[(index * 3 + n) % publishedListings.length];
      if (listing === undefined) continue;
      await prisma.favorite.upsert({
        where: { userId_listingId: { userId: buyer.id, listingId: listing.id } },
        create: { userId: buyer.id, listingId: listing.id, createdAt: days(-between(1, 40)) },
        update: {},
      });
    }
  }

  // ————— شرائح وحملة — القواعد تُحوسَب وقت الإرسال لا الآن —————
  const superAdminId = (await prisma.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } })).id;
  const favouriteSegment = await prisma.segment.create({
    data: {
      key: 'has_favourites',
      nameAr: 'لديه مفضلة نشطة',
      rules: [{ field: 'hasFavorites' }],
      createdBy: superAdminId,
      createdAt: days(-20),
    },
  });
  await prisma.segment.create({
    data: {
      key: 'added_no_listing',
      nameAr: 'أضاف مركبة ولم يعلن',
      rules: [{ field: 'hasVehicle' }, { field: 'hasListing', negate: true }],
      createdBy: superAdminId,
      createdAt: days(-14),
    },
  });
  /**
   * **والنصُّ يُزرع مع الصفّ**: `subjectAr` و`bodyAr` عمودان يقرؤهما
   * المشغّل قبل أن يُمضي رسالةً لا رجعة فيها، وحملةٌ مزروعة بلا نصّ
   * تُري شاشتَها في حالها النادرة وحدها.
   */
  await prisma.campaign.create({
    data: {
      nameAr: 'عاد سعر سيارة في مفضلتك',
      channels: ['push'],
      segmentId: favouriteSegment.id,
      status: 'DRAFT',
      subjectAr: 'انخفض سعر سيارة تتابعها',
      bodyAr:
        'السيارة التي أضفتها إلى مفضلتك نزل سعرها. افتح الإعلان لترى السعر الجديد قبل أن يسبقك غيرك.',
      createdBy: superAdminId,
      createdAt: days(-6),
    },
  });

  /**
   * **ومجدولةٌ تُزرع لأنّ لها الآن مُرسِلًا.** `SCHEDULED` كانت قيمةً في
   * التعداد بلا كاتبٍ ولا قارئ: لا بذرةٌ تكتبها ولا وظيفةٌ تُرسلها، فتابُ
   * «مجدولة» في `A9` صفرٌ أبدًا و`scheduledAt` عمودٌ لا يُقرأ. ومع
   * `sendDueCampaigns` صار للطرفين كاتب — فتُزرع لتُرى.
   *
   * وموعدُها بعد يومين: قريبٌ يُقرأ في الشاشة، وبعيدٌ عن أوّل تشغيلٍ
   * للمُجدوِل فلا تُرسَل قبل أن يراها أحد.
   */
  await prisma.campaign.create({
    data: {
      nameAr: 'مزاد الجمعة — لاندكروزر',
      channels: ['push', 'email'],
      segmentId: favouriteSegment.id,
      status: 'SCHEDULED',
      scheduledAt: days(2),
      subjectAr: 'مزاد الجمعة يفتح على لاندكروزر ٢٠٢٣',
      bodyAr:
        'مزاد الجمعة يفتح على لاندكروزر ٢٠٢٣ بسعر افتتاح أقل من السوق. سجل تنبيهك قبل أن يبدأ.',
      createdBy: superAdminId,
      createdAt: days(-1),
    },
  });

  // موافقة التسويق — تُطلب ولا تُفترض، فثلث المستخدمين وافقوا
  const consenting = await prisma.user.findMany({ select: { id: true } });
  await prisma.user.updateMany({
    where: { id: { in: consenting.filter((_, i) => i % 3 === 0).map((u) => u.id) } },
    data: { marketingConsent: true, marketingConsentAt: days(-30) },
  });

  /**
   * ═══ وحملةٌ أُرسلت — وإلّا بقي نصفُ الشاشة غيرَ مرئيّ ═══
   *
   * الصفحةُ تعرض «من وصلتهم» ومعدّلات الفتح والنقر والتحويل، ولم يكن
   * في البذرة صفُّ `CampaignSend` واحد — **فما لا يُزرع لا يُرى**،
   * والشاشةُ التي لا تُفتح على بياناتها لا يُقاس عليها شيء.
   *
   * **وتاريخُها أقدمُ من التهدئة** (`COOLDOWN_HOURS`): لو أُرسلت
   * اليوم لحُجب كلُّ من وصلته عن كلّ حملةٍ أخرى، فتقول شاشةُ المسودّة
   * «سيصلهم صفر» وهي حالٌ صحيحة تُقرأ عطلًا في بيئةٍ للعرض.
   */
  const sentSegment = await prisma.segment.findFirstOrThrow({ where: { key: 'added_no_listing' } });
  const recipients = await prisma.user.findMany({
    where: { marketingConsent: true },
    select: { id: true },
    take: 6,
  });
  if (recipients.length > 0) {
    const blast = await prisma.campaign.create({
      data: {
        nameAr: 'أكمل إعلانك وابدأ البيع',
        channels: ['email'],
        segmentId: sentSegment.id,
        status: 'SENT',
        subjectAr: 'مركبتك جاهزة — ينقصها إعلان',
        bodyAr:
          'أضفت مركبة إلى حسابك ولم تنشر إعلانها بعد. أكمل الخطوات الباقية وستكون أمام المشترين اليوم.',
        createdBy: superAdminId,
        createdAt: days(-21),
        sentAt: days(-18),
      },
    });

    /** أثرٌ متدرّج: فتح أكثرُهم، ونقر بعضُهم، وحوّل واحد. */
    await prisma.campaignSend.createMany({
      data: recipients.map((user, i) => ({
        campaignId: blast.id,
        userId: user.id,
        channel: 'email',
        sentAt: days(-18),
        openedAt: i < 4 ? days(-18) : null,
        clickedAt: i < 2 ? days(-17) : null,
        convertedAt: i === 0 ? days(-16) : null,
      })),
      skipDuplicates: true,
    });
  }
  /**
   * ═══ حملاتٌ إعلانية وأثرُها — وإلّا بقيت الشاشة على حالها الفارغ ═══
   *
   * المساحاتُ السبع مزروعة و**لا حملةَ واحدة**، فجدولُ الحملات يقول
   * «لا حملات بعد» وأعمدةُ الظهور والنقر والـCTR لا تُرى — ومن فتح
   * الشاشة لا يعرف أتعمل الميزة أم لا. **وما لا يُزرع لا يُرى.**
   *
   * ═══ وكانت واحدةً من ستّ، وصورتُها ٤٠٤ ═══
   *
   * زُرعت `home_banner` وحدها بـ`creativeUrl: '/uploads/seed/ad-banner.png'`
   * — **ولا ملفّ خلفه ولا مجلّد**. فالرئيسية تعرض **صندوقًا مكسورًا**
   * تحت كلمة «إعلان» لكل زائر، وهو يُقرأ عطلًا لا إعلانًا. وهو الصنفُ
   * المسجَّل نفسُه: صفٌّ يُكتب وملفُّه لا يُكتب معه، فالعطل في عين من
   * ينظر وحده ولا اختبارَ يراه.
   *
   * وخمسُ مساحاتٍ لها موضعُ عرضٍ مبنيّ ولا حملةَ لها: بطاقةُ المموّل في
   * نتائج البحث، وشريطُ صفحة المركبة، وخانةُ الماركة، وما بعد النشر،
   * وصدرُ دليل الخدمات. **فستّةُ مواضعَ مبنيّة لم يرَ أحدٌ خمسةً منها.**
   *
   * والصورةُ تُولَّد كصور الإعلانات ولا تُنتحَل، وتُخزَّن بالمفتاح نفسه
   * فيخدمها مسارُ التطوير — فالرابطُ يفتح.
   */
  const adCreative = async (key: string, seed: number, w: number, h: number): Promise<string> => {
    const full = `staging/ads/${key}.png`;
    if (devStoreAllowed()) await devPut(full, placeholderPng(seed, w, h));
    return publicUrl(full) ?? `/api/dev/media/${full}`;
  };

  /**
   * حملةٌ لكل مساحةٍ لها موضعُ عرض — **بلا استهداف**، فتظهر لكل زائر.
   * واستهدافُ مدينةٍ يجعلها تختفي عن أكثر الناس فتبقى غيرَ مرئية كما كانت.
   */
  const AD_CAMPAIGNS: readonly {
    slot: string;
    advertiser: string;
    width: number;
    height: number;
    budget: string;
    impressions: number;
    clicks: number;
  }[] = [
    { slot: 'home_banner', advertiser: 'تأمين الراجحي', width: 1200, height: 300, budget: '3500', impressions: 18_420, clicks: 174 },
    { slot: 'search_inline', advertiser: 'تويوتا عبداللطيف جميل', width: 480, height: 360, budget: '6200', impressions: 32_140, clicks: 611 },
    { slot: 'vehicle_inline', advertiser: 'تمويل الإنماء', width: 960, height: 240, budget: '4800', impressions: 12_905, clicks: 142 },
    { slot: 'brand_featured', advertiser: 'لكزس السعودية', width: 480, height: 360, budget: '9000', impressions: 7_410, clicks: 96 },
    { slot: 'empty_state', advertiser: 'فحص موتور', width: 960, height: 300, budget: '2200', impressions: 3_180, clicks: 58 },
    { slot: 'service_featured', advertiser: 'ورشة الخليج', width: 640, height: 400, budget: '2800', impressions: 5_640, clicks: 83 },
  ];

  for (const [index, row] of AD_CAMPAIGNS.entries()) {
    const slot = await prisma.adSlot.findUnique({ where: { key: row.slot } });
    if (slot === null) continue;

    await prisma.adCampaign.create({
      data: {
        advertiserName: row.advertiser,
        slotKey: slot.key,
        creativeUrl: await adCreative(row.slot, index + 3, row.width, row.height),
        targetUrl: 'https://example.sa/offer',
        startsAt: days(-10),
        endsAt: days(18),
        budget: new D(row.budget),
        status: 'LIVE',
        priority: 10 - index,
        /** أثرٌ واقعيّ: نسبةُ نقرٍ قريبةٌ من الواقع لا رقمٌ مستدير. */
        impressions: row.impressions,
        clicks: row.clicks,
      },
    });
  }

  /** وحملةٌ منتهية — فعمودُ «انتهت» في اللوحة لا يُفتح على فراغ. */
  const bannerSlot = await prisma.adSlot.findUnique({ where: { key: 'home_banner' } });
  if (bannerSlot !== null) {
    await prisma.adCampaign.create({
      data: {
        advertiserName: 'معرض النخبة',
        slotKey: bannerSlot.key,
        creativeUrl: await adCreative('home_banner_past', 2, 1200, 300),
        targetUrl: 'https://example.sa/elite',
        startsAt: days(-60),
        endsAt: days(-32),
        budget: new D('3500'),
        status: 'ENDED',
        impressions: 41_902,
        clicks: 388,
      },
    });
  }

  /**
   * ═══ ومفتاحُ واجهةٍ عامّة — الشاشةُ كانت تُفتح على فراغها وحده ═══
   *
   * **والمفتاحُ الخامّ لا يُزرع**: يُعرض مرّةً عند إصداره ولا يُسترجع،
   * فالمخزَّن مُجزَّأ. وبذرةٌ تكتب مفتاحًا يعمل تُسلّم كلَّ بيئةٍ
   * مفتاحًا معروفًا — فيُزرع المجزَّأ وحده، ولا أحد يملك أصلَه.
   */
  const publicKey = mintKey();
  await prisma.apiKey.create({
    data: {
      name: 'موقع شريك — قراءة الإعلانات',
      prefix: publicKey.prefix,
      keyHash: publicKey.keyHash,
      scopes: ['read:listings'],
      rateLimit: 120,
      createdBy: superAdminId,
      createdAt: days(-24),
      lastUsedAt: hours(-3),
    },
  });
  const revokedKey = mintKey();
  await prisma.apiKey.create({
    data: {
      name: 'تطبيق تجريبي — سحب',
      prefix: revokedKey.prefix,
      keyHash: revokedKey.keyHash,
      scopes: ['read:listings', 'read:dealers'],
      rateLimit: 60,
      active: false,
      createdBy: superAdminId,
      createdAt: days(-52),
      revokedAt: days(-9),
      lastUsedAt: days(-10),
    },
  });

  /**
   * ═══ التكاملات وجهات التمويل — انتقلتا إلى `reference.ts` ═══
   *
   * كانتا تُزرعان هنا وحدَهما، **والبذرةُ ترفض الإنتاج عمدًا** —
   * فسجلُّ التبعيّات الخارجية وقائمةُ المموّلين في قاعدةٍ جديدة
   * فارغان. و`plantReference` يزرعهما الآن، فيصلان كلَّ بيئة.
   */
  // ————— قوالب نصوص SEO (قرار ٢٦) —————
  /**
   * ثلاثةُ أسطح لأنّ الصفحات ثلاث — `SEO_SURFACES` تسمّيها، وسطحٌ بلا
   * صفحةٍ تَصيّره قيمةٌ بلا باب. **والنصُّ نفسُه في الترحيل**: البذرة
   * لقاعدةٍ فارغة، والترحيلُ لبيئةٍ تعمل.
   */
  await prisma.seoTemplate.createMany({
    data: [
      {
        key: 'search_results',
        surface: 'search',
        titleAr:
          'سيارات مستعملة للبيع في السعودية',
        titleEn:
          'Used cars for sale in Saudi Arabia',
        introAr:
          'السيارات المعروضة الآن على كارز: {count}. موثقة الملكية ومفحوصة قبل العرض، مع نقل ملكية ودفع محفوظ.',
        introEn:
          'Cars listed on CARZ right now: {count}. Verified ownership, inspected before listing, with ownership transfer and protected payment.',
        outroAr:
          '',
        outroEn:
          '',
      },
      {
        key: 'landing_city_brand',
        surface: 'landing_brand',
        titleAr:
          'سيارات {brand} للبيع في {city}',
        titleEn:
          '{brand} cars for sale in {city}',
        introAr:
          'سيارات {brand} المعروضة الآن في {city}: {count}. وأسعارها من {priceMin} إلى {priceMax} ريال وأوسطها {priceMid}، وكلها موثقة الملكية على كارز.',
        introEn:
          '{brand} cars listed in {city} right now: {count}. Priced from {priceMin} to {priceMax} SAR with the middle one at {priceMid}, all with verified ownership on CARZ.',
        outroAr:
          'تقارير الفحص المنشورة في هذه الصفحة: {inspected}. تقرؤها قبل أن تتواصل مع البائع، والدفع محفوظ حتى تنقل الملكية باسمك.',
        outroEn:
          'Published inspection reports on this page: {inspected}. Read them before contacting the seller, and payment is held until ownership moves to your name.',
      },
      {
        key: 'landing_city_brand_model',
        surface: 'landing_model',
        titleAr:
          '{brand} {model} للبيع في {city}',
        titleEn:
          '{brand} {model} for sale in {city}',
        introAr:
          '{brand} {model} المعروضة الآن في {city}: {count}. وأسعارها من {priceMin} إلى {priceMax} ريال وأوسطها {priceMid}، مع نقل ملكية ودفع محفوظ على كارز.',
        introEn:
          '{brand} {model} listed in {city} right now: {count}. Priced from {priceMin} to {priceMax} SAR with the middle one at {priceMid}, with ownership transfer and protected payment on CARZ.',
        outroAr:
          'تقارير الفحص المنشورة في هذه الصفحة: {inspected}. تذكر حالة الهيكل والمحرك وقطع الغيار المستبدلة، وتقرأ قبل أن تتواصل مع البائع.',
        outroEn:
          'Published inspection reports on this page: {inspected}. They cover body, engine and replaced parts, and are read before you contact the seller.',
      },
    ],
  });

  // ————— إحصاءات السعر (RangeBar — المئينات ١٠/٢٥/٥٠/٧٥/٩٠) —————
  /**
   * ═══ إحصاءُ السوق ليس متوسطَ مخزوننا ═══
   *
   * كانت تُجمَّع من إعلانات البذرة بمفتاح `model|year|bucket` — مفتاحٌ
   * ضيّق حتى إن أكثر مجموعاته **إعلانٌ واحد**. فتخرج مئيناتٌ متساوية
   * بحجم عيّنةٍ ١، ويرفضها `PRICE_STAT_MIN_SAMPLE = 8` كلَّها —
   * **فبطاقة «موقع السعر في السوق» لا تظهر على إعلانٍ واحد في المنتج**
   * وهي مبنيّةٌ بكاملها.
   *
   * وقِيس: أربعةٌ وخمسون إعلانًا ⇒ خمسون مجموعة، أكبرُها اثنان. فلا
   * مفتاحَ أضيقُ ولا أوسعُ يُنتج ثمانيةً — العيب في المصدر لا في المفتاح.
   *
   * **والأعمق أن الاشتقاق من مخزوننا دائريّ**: أن نقول لبائعٍ إن سعره
   * دون المتوسط ونعني متوسطَ *إعلاناتنا* ليس خبرًا عن السوق. وفي
   * الإنتاج تأتي هذه من وظيفةٍ تقرأ مبيعاتٍ منفَّذة في السوق — فتُزرع
   * هنا **مرجعًا مستقلًّا** بشكل الحقيقيّ: عيّنةٌ ذاتُ حجم، ومئيناتٌ
   * متباعدة.
   */
  const anchorByModel = new Map<string, number[]>();
  /** **والسنة جزءٌ من مفتاح البحث** — فيُكتب صفٌّ لكل (طراز، سنة) يقع. */
  const modelYears = new Set<string>();
  for (const l of listings) {
    const v = await prisma.vehicle.findUniqueOrThrow({
      where: { id: l.vehicleId },
      select: { modelId: true, year: true },
    });
    anchorByModel.set(v.modelId, [...(anchorByModel.get(v.modelId) ?? []), Number(l.askPrice)]);
    modelYears.add(`${v.modelId}|${String(v.year)}`);
  }

  /** تجزئةٌ ثابتة — فالزرع يُعيد الانحراف نفسه في كل تشغيل. */
  const hashOf = (value: string): number => {
    let total = 0;
    for (let n = 0; n < value.length; n += 1) total = (total * 31 + value.charCodeAt(n)) % 100_003;
    return total;
  };

  for (const key of modelYears) {
    const [modelId, yearText] = key.split('|');
    const prices = anchorByModel.get(modelId as string) ?? [];
    // الوسيط مرساةُ السوق، والتباعد حولها بنسبٍ معقولة لسوق السيارات
    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    if (median <= 0) continue;

    /**
     * ═══ ووسيطُ السوق ليس وسيطَ أسعارنا ═══
     *
     * كان الوسيط يُشتقّ من أسعار إعلاناتنا نفسها، وأكثرُ طرازٍ-سنة
     * له إعلانٌ واحد — **فالوسيط يساوي سعرَ الإعلان بالضبط**، وتقول
     * الشاشة «عند متوسّط السوق» لكلّ سيارة في المنتج. فمؤشّرٌ بُني
     * ليقول «أقلّ بسبعة آلاف» لا يقول شيئًا أبدًا.
     *
     * ووسيطُ السوق في الحقيقة من **صفقاتٍ مكتملة** لدى مزوّد بيانات،
     * لا من أسعار طلبنا. فينحرف عنها انحرافًا ثابتًا لكل طراز-سنة —
     * فتقع إعلاناتُنا فوقه وتحته كما تقع في السوق.
     */
    const drift = 0.9 + ((hashOf(`${modelId as string}|${yearText as string}`) % 21) / 100);
    const anchor = median * drift;

    const at = (ratio: number) => new D(String(Math.round((anchor * ratio) / 500) * 500));

    await prisma.priceStat.create({
      data: {
        modelId: modelId as string,
        year: Number(yearText),
        mileageBucket: 0,
        p10: at(0.82),
        p25: at(0.91),
        p50: at(1),
        p75: at(1.09),
        p90: at(1.18),
        /** حجمُ عيّنةٍ يشبه ما يأتي من مصدر سوق — لا عددَ إعلاناتنا. */
        sampleSize: between(14, 52),
        daysToSellMedian: between(12, 45),
        computedAt: NOW,
      },
    });
  }

  // ————— حالاتٌ لم تكن تُزرع — وما لا يُزرع لا يُرى —————
  /**
   * ═══ كلُّ قيمةِ تعدادٍ يكتبها المنتج تُزرع ═══
   *
   * قاعدةٌ مكتوبة في هذا المستودع، وُلدت من تسع عللٍ سكنت حالًا لم
   * تفتحها شاشةٌ قطّ: **لم يكن في البذرة طلبٌ ملغى واحد**، فبقيت
   * تسعةُ مواضع تقرأ مرحلتَه بلا حاله.
   *
   * وقِيس بـ`npm run seed:coverage` فخرجت **تسعٌ وعشرون قيمة** بلا
   * صفّ: إعلانٌ موقوف مؤقّتًا، ومزادٌ لم يبلغ احتياطيَه، ونزاعٌ قيد
   * النظر، وحسابٌ موقوف، وهويّةٌ تنتظر توضيحًا… كلُّها شاشاتٌ في
   * اللوحة تُفتح على فراغٍ لا يكشف عطلًا فيها.
   */
  const spare = await prisma.listing.findMany({
    where: { status: 'PUBLISHED', orders: { none: {} }, auction: null },
    orderBy: { createdAt: 'desc' },
    take: 4,
    select: { id: true, vehicleId: true },
  });

  if (spare.length >= 3) {
    /** **موقوفٌ مؤقّتًا بيد صاحبه** — يعود بضغطة، ولا يظهر في البحث. */
    await prisma.listing.update({ where: { id: spare[0]!.id }, data: { status: 'PAUSED' } });
    /**
     * **و`ListingStatus.EXPIRED` لا تُزرع — ولا كاتبَ لها.**
     *
     * زرعتُها أوّلًا فأسقطت «مجموعُ الشرائح يساوي الكلّ»: حالٌ بلا
     * شريحةٍ لا تُرى. ثمّ قِيس المنتج فإذا **لا شيء يكتبها** — لا
     * وظيفةٌ دورية تُنهي مدّةَ إعلان ولا مسار. فزرعُها اختراعُ حالٍ،
     * وشريحةٌ لها تبقى صفرًا إلى الأبد.
     */
    /** **ومركبةٌ واردةٌ من أمريكا وأخرى من كوريا** — المواصفةُ تُرشَّح بها. */
    await prisma.vehicle.update({ where: { id: spare[0]!.vehicleId }, data: { spec: 'AMERICAN' } });
    await prisma.vehicle.update({ where: { id: spare[1]!.vehicleId }, data: { spec: 'KOREAN' } });
  }

  /**
   * **ومزادٌ انتهى دون احتياطيه ينتظر قرارَ بائعه** — وهو ثلثُ شاشة
   * `D4` في لوحة المعرض، وفرعُ القبول فيها لم يكن يبلغه نادٍ قطّ.
   */
  const closable = await prisma.auction.findMany({
    where: { status: 'LIVE' },
    orderBy: { endsAt: 'asc' },
    take: 2,
    select: { id: true, reservePrice: true },
  });

  if (closable.length >= 2) {
    const unmet = closable[0]!;
    const bidder = buyers[0];
    if (bidder !== undefined && unmet.reservePrice !== null) {
      await prisma.auction.update({
        where: { id: unmet.id },
        data: {
          status: 'ENDED_UNMET',
          endsAt: hours(-2),
          /** **والمهلةُ قائمةٌ** — فالشاشة تعرض القرار لا سجلًّا منتهيًا. */
          sellerDecisionDueAt: hours(22),
        },
      });
      await prisma.bid.create({
        data: {
          auctionId: unmet.id,
          bidderId: bidder.id,
          amount: unmet.reservePrice.minus(new D('8500')),
          createdAt: hours(-3),
        },
      });
    }

    /** **ومزادٌ أُلغي قبل إغلاقه** — يسحبه المشغّل أو صاحبه. */
    await prisma.auction.update({
      where: { id: closable[1]!.id },
      data: { status: 'CANCELLED', endsAt: hours(-6) },
    });
  }

  /**
   * **والنزاعُ المفتوح يبقى مفتوحًا.**
   *
   * حوّلتُ أوّلَ مرّةٍ الوحيدَ المفتوح إلى «قيد النظر» — فأُغلقت
   * حالٌ لأفتح أخرى، وخرج الطابورُ فارغًا. **والتغطيةُ تُضيف ولا
   * تُبدّل**: صفٌّ لكلّ حال.
   */
  const disputedOrders = await prisma.order.findMany({
    /** **والمرشِّحُ يتّسع لعدد الحالات** — ضيّقتُه على مرحلتين فوجد اثنين. */
    where: { disputes: { none: {} } },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { id: true, buyerId: true },
  });

  const DISPUTE_STATES = [
    { status: 'INVESTIGATING' as const, resolution: null, reason: 'الممشى في الإعلان أقل من العداد.' },
    { status: 'RESOLVED_SELLER' as const, resolution: 'RELEASE_TO_SELLER', reason: 'تأخر الاستلام عن الموعد.' },
    { status: 'CLOSED' as const, resolution: null, reason: 'سحب المشتري بلاغه.' },
  ];

  for (const [index, order] of disputedOrders.entries()) {
    const state = DISPUTE_STATES[index];
    if (state === undefined) break;
    await prisma.dispute.create({
      data: {
        orderId: order.id,
        openedBy: order.buyerId,
        reason: state.reason,
        status: state.status,
        ...(state.resolution === null ? {} : { resolution: state.resolution }),
        openedAt: days(-between(3, 12)),
        slaDueAt: days(between(1, 4)),
      },
    });

    /**
     * **وحالُ الطلب تتبع حالَ نزاعه.** `openDispute` تكتب
     * `status: 'DISPUTED'` في المعاملة نفسِها، و`resolveDispute`
     * تعيده. وبذرةٌ تكتب النزاعَ وحده تُنتج طلبًا «نشطًا» عليه نزاعٌ
     * قائم — **ولوحةُ المالية تقرأ «المجمَّد بنزاع» من الحالين
     * معًا**، فتقول صفرًا والمالُ مجمَّد.
     */
    if (state.status === 'INVESTIGATING') {
      await prisma.order.update({ where: { id: order.id }, data: { status: 'DISPUTED' } });
    }

    /**
     * **وقرارُ النزاع يتبعه مالُه.** `resolveDispute` بـ
     * `RELEASE_TO_SELLER` تُفرج الضمان — ونزاعٌ «حُسم للبائع» وضمانُه
     * ما زال محجوزًا يجعل شاشةَ التسويات تقول «ينتظر» عن مالٍ حُسم
     * أمرُه، فينتظر البائعُ ما وصله.
     */
    if (state.resolution === 'RELEASE_TO_SELLER') {
      await prisma.escrow.updateMany({
        where: { orderId: order.id, status: 'HELD' },
        data: { status: 'RELEASED', releasedAt: days(-1) },
      });
    }
  }

  /**
   * **وحساباتٌ في حالاتها الثلاث غير النشطة.**
   *
   * وكلُّها تُعرض في `A18`، وتُغيّر ما يراه صاحبُها: الموقوفُ يدخل
   * ولا يعامل، والمحظورُ لا يدخل، والمغلقُ أغلقه هو.
   */
  /**
   * **والمختارُ من لا أثرَ له** — فحسابٌ موقوفٌ عليه إعلاناتٌ منشورة
   * يُنتج حالًا متناقضة: اللوحةُ تقول «موقوف» والسوقُ يعرض بضاعتَه.
   * ويُؤخذ ما وُجد، ولا يُشترط عددٌ بعينه: شرطٌ لا يتحقّق يُسقط
   * التغطيةَ كلَّها صامتًا — وهو ما وقع في أوّل تشغيل.
   */
  /**
   * **وتُصنع لها حساباتُها** — ولا تُنتقى من القائمين.
   *
   * انتقيتُ أوّلًا «من لا إعلانَ له ولا طلب» فوجدتُ ثلاثةً حيث أحتاج
   * خمسة، **فسقطت حالان صامتتين**: شرطٌ لا يتحقّق يُسقط التغطيةَ ولا
   * يقول. وحسابٌ مخصَّصٌ لحالٍ أصدقُ أيضًا: الموقوفُ له إعلاناتٌ
   * منشورة يُنتج تناقضًا — اللوحةُ تقول «موقوف» والسوقُ يعرض بضاعتَه.
   */
  const STATE_ACCOUNTS = [
    ['موقوف · بلاغات متكررة', 'suspended', { status: 'SUSPENDED' as const }],
    ['محظور · احتيال مثبت', 'banned', { status: 'BANNED' as const }],
    ['أغلق حسابه', 'closed', { status: 'CLOSED' as const, closedAt: days(-20) }],
    [
      'هوية تنتظر توضيحا',
      'clarify',
      {
        identityStatus: 'CLARIFICATION' as const,
        idVerified: false,
        identityNote: 'الاسم في الهوية لا يطابق الاسم المسجل — صححه ثم أعد الإرسال.',
      },
    ],
    [
      'هوية مرفوضة',
      'rejected',
      {
        identityStatus: 'REJECTED' as const,
        idVerified: false,
        identityNote: 'رقم الهوية غير صالح.',
      },
    ],
  ] as const;

  for (const [index, [name, tag, data]] of STATE_ACCOUNTS.entries()) {
    await prisma.user.create({
      data: {
        phone: `+9665399000${String(index).padStart(2, '0')}`,
        name,
        email: `${tag}@example.com`,
        role: 'USER',
        createdAt: days(-between(40, 200)),
        ...data,
      },
    });
  }



  /**
   * **ومعرضٌ موقوف** — يظهر في `A20` ولا تُعرض إعلاناتُه.
   *
   * واشترطتُ أوّلًا «بلا مركبات» فلم يوجد واحد، فسقطت الحال. والشرطُ
   * الصحيح **ألّا يكون الذي تُفتح به اللوحة**: معرضٌ موقوفٌ له مخزون
   * حالٌ حقيقية — بضاعتُه تختفي من السوق وتبقى في لوحته.
   */
  const toSuspend = await prisma.dealer.findFirst({
    /**
     * **ولا يكون المعرضَ الذي تُفتح به اللوحة.**
     *
     * أخذتُ أوّلًا «أحدثَ معرضٍ نشط» فوقع على المعرض القياديّ —
     * صاحبِ الفروع والفريق والباقة — **فأسقط ستّةَ اختبارات** تبحث
     * عن معرضٍ فيه مقعدٌ شاغر. والمعرضُ ذو الفروع هو مسرحُ `D1`–`D11`
     * كلِّها، وتعطيلُه يُفرغ اللوحة من بياناتها.
     */
    where: { status: 'ACTIVE', branches: { none: {} } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (toSuspend !== null) {
    await prisma.dealer.update({ where: { id: toSuspend.id }, data: { status: 'SUSPENDED' } });
  }

  /**
   * **وضمانٌ لم يُقبض بعد، وآخرُ رُدّ كاملًا.**
   *
   * `PENDING` حالُ من بدأ الدفع ولم تؤكّد البوّابة، و`REFUNDED` حالُ
   * نزاعٍ حُسم للمشتري — وكلتاهما تغيّران بطاقةَ المال في كلّ شاشة.
   */
  /**
   * ═══ و`EscrowStatus.PENDING` لا تُزرع — ولا كاتبَ لها ═══
   *
   * زرعتُها أوّلًا على طلبٍ عند مرحلة الدفع، **فأسقطت اختبارين**
   * كلاهما محقّ: طلبٌ عند الدفع بضمانٍ **يُخفي زرَّ الدفع**، وضمانٌ
   * بلا دفعةٍ يُفرغ شاشةَ التسويات.
   *
   * وقِيس المنتج: `applyState` **تُنشئ الضمانَ `HELD` دائمًا**، ولا
   * شيء يكتب `PENDING` — وفي `payments.ts` فرعٌ يقرؤها
   * (`existing.status === 'PENDING'`) **لا ينتجه أحد**. فهي قيمةٌ
   * بلا كاتب، وزرعُها اختراعُ حالٍ لا يبلغها المنتج.
   */

  /**
   * **وضمانٌ رُدَّ كاملًا — بدفعته.** `Escrow` لا يُكتب بلا `Payment`:
   * الشاشةُ تقرأ الدفعةَ والدفترَ والضمان، وثلاثتُها عن مالٍ واحد.
   */
  const refundedOrder = await prisma.order.findFirst({
    where: { status: 'CANCELLED', escrow: null },
    select: { id: true, totalAmount: true },
  });
  if (refundedOrder !== null) {
    await prisma.payment.create({
      data: {
        orderId: refundedOrder.id,
        purpose: 'VEHICLE_ESCROW',
        gatewayKey: 'bank_escrow',
        amount: refundedOrder.totalAmount,
        method: 'mada',
        /** **و«رُجّع» لا «رُدّ»**:  ما خرج من حسابنا بعد دخوله. */
        status: 'RETURNED',
        holdRef: 'hold_seed_refund',
        heldAt: days(-9),
        createdAt: days(-9),
      },
    });
    await prisma.escrow.create({
      data: {
        orderId: refundedOrder.id,
        amount: refundedOrder.totalAmount,
        status: 'REFUNDED',
        heldAt: days(-9),
        releasedAt: days(-6),
      },
    });
  }

  /**
   * **وطلباتُ خدمةٍ في حالاتها التي لم تُزرع.**
   *
   * `AWAITING_SELLER` فحصٌ طلبه **مشترٍ** على مركبةِ غيره فينتظر إذن
   * صاحبها، و`AWAITING_PAYMENT` أذِن ولم يُدفع، و`DECLINED` رفض.
   * وثلاثتُها دورةُ «اطلب فحصًا لسيارةٍ تريد شراءها» — وهي الدورة
   * التي بُني الإذنُ لأجلها، ولم يكن في البيئة صفٌّ واحد منها.
   */
  const serviceTargets = await prisma.listing.findMany({
    where: { status: 'PUBLISHED', serviceRequests: { none: {} } },
    take: 3,
    select: { id: true, vehicleId: true, sellerId: true },
  });
  const inspection = await prisma.service.findFirst({
    where: { category: 'PRE_PURCHASE' },
    select: { id: true, price: true },
  });

  if (inspection !== null) {
    const PENDING_STATES = ['AWAITING_SELLER', 'AWAITING_PAYMENT', 'DECLINED'] as const;
    for (const [index, target] of serviceTargets.entries()) {
      const state = PENDING_STATES[index];
      const asker = buyers[index % buyers.length];
      if (state === undefined || asker === undefined) break;
      await prisma.serviceRequest.create({
        data: {
          ref: `SRV-SEED-${String(index + 1)}`,
          serviceId: inspection.id,
          userId: asker.id,
          vehicleId: target.vehicleId,
          listingId: target.id,
          status: state,
          amount: inspection.price,
          city: 'الرياض',
          createdAt: days(-between(1, 6)),
          ...(state === 'DECLINED' ? { declineReason: 'المركبة محجوزة لمشترٍ آخر.' } : {}),
        },
      });
    }
  }

  /** **وإعلانٌ محجوزٌ بطلبٍ قائم** — البنرُ عليه يمنع عرضًا جديدًا. */
  const reservable = await prisma.order.findFirst({
    where: { status: 'ACTIVE', stage: { in: ['APPROVED', 'INSPECTION', 'PAYMENT'] } },
    select: { listingId: true },
  });
  if (reservable !== null) {
    await prisma.listing.update({
      where: { id: reservable.listingId },
      data: { status: 'RESERVED' },
    });
  }

  /**
   * ═══ وصفقةٌ مكتملة لمعرضٍ مسجَّلٍ ضريبيًّا ═══
   *
   * **وبدونها لا تخرج فاتورةٌ واحدة في البيئة.** الطلباتُ المكتملة
   * تقع حيث يقع ترتيبُ الإعلانات، فوقعت على معرضٍ **قيد الاعتماد**
   * بلا رقمٍ ضريبيّ — وبائعٌ غيرُ مسجَّل لا تُصدر له فاتورة بحقّ.
   * فجدولُ الضريبة و`A25` و`D7` تفتح على فراغ، **ولا يكشف الفراغُ
   * أنّ السببَ بياناتٌ لا شيفرة**.
   *
   * فتُزرع صفقةٌ واحدة على بائعٍ مسجَّل: هي الحالُ الأكثر في سوقٍ
   * أكثرُ بيعه من المعارض.
   */
  /**
   * **وثلاثُ صفقاتٍ لا واحدة**: حالاتُ الفاتورة لدى الهيئة ثلاث
   * (صدرت · أُبلغت · تعذّر إبلاغها)، وفاتورةٌ واحدةٌ تُبدَّل حالُها
   * تترك اثنتين بلا صفّ — فتُقرأ الشاشةُ ناقصةً وهي سليمة.
   *
   * **والبحثُ عبر كلّ البائعين المسجَّلين لا أوّلِهم**: قصرتُه على
   * الأوّل فوجد إعلانًا واحدًا بلا طلب، فخرجت فاتورةٌ واحدة وبقيت
   * حالتان بلا صفّ. **وشرطٌ يضيق عن عدد الحالات يُسقطها صامتًا** —
   * وهو ثالثُ موضعٍ يقع فيه هذا في الجلسة.
   */
  const vatListings = await prisma.listing.findMany({
    where: {
      status: 'PUBLISHED',
      orders: { none: {} },
      seller: { taxStatus: 'VAT_REGISTERED' },
    },
    take: 3,
    select: { id: true, askPrice: true, sellerId: true },
  });
  const vatBuyer = buyers[0];

  for (const [vatIndex, vatListing] of vatListings.entries()) {
    const vatSeller = { id: vatListing.sellerId };
    if (vatBuyer === undefined) break;
    const agreed = new D(String(Math.round(Number(vatListing.askPrice) * 0.96)));
    const amounts = await computeOrderAmounts(prisma, Number(agreed));
    const soldAt = days(-between(8, 20));

    const vatOrder = await prisma.order.create({
      data: {
        ref: `ORD-2026-11${String(vatIndex).padStart(2, '0')}`,
        listingId: vatListing.id,
        buyerId: vatBuyer.id,
        sellerId: vatSeller.id,
        /**
         * **و«اشترِ الآن» مصدرٌ له كاتب** (`buyNow`) ولا صفَّ له —
         * فشريحةُ المصدر في `A14` تقول صفرًا عن بابٍ مفتوح.
         */
        source: vatIndex === 0 ? 'OFFER' : vatIndex === 1 ? 'BUY_NOW' : 'DIRECT',
        stage: 'DONE',
        status: 'COMPLETED',
        agreedPrice: agreed,
        commissionPct: amounts.commissionPct,
        commissionAmount: amounts.commissionAmount,
        buyerCommission: amounts.buyerCommission,
        sellerCommission: amounts.sellerCommission,
        buyerVat: amounts.buyerVat,
        sellerVat: amounts.sellerVat,
        vatAmount: amounts.vatAmount,
        transferFee: amounts.transferFee,
        transferAdminFee: amounts.transferAdminFee,
        processingFee: amounts.processingFee,
        totalAmount: amounts.totalAmount,
        createdAt: soldAt,
        stageEnteredAt: days(-between(1, 5)),
      },
      select: { id: true },
    });

    /**
     * **والدفعةُ تُكتب مع الضمان** — `applyState` تُنشئ `Escrow` **من
     * دفعةٍ محجوزة**، وضمانٌ بلا دفعة يُفرغ `/admin/settlements`:
     * تقول «لا مبالغ محجوزة» والدفترُ يقول مئتي ألفٍ لدى المزوّد.
     */
    await prisma.payment.create({
      data: {
        orderId: vatOrder.id,
        purpose: 'VEHICLE_ESCROW',
        gatewayKey: 'bank_escrow',
        amount: amounts.totalAmount,
        method: 'mada',
        status: 'SETTLED',
        holdRef: `hold_seed_vat_${String(vatIndex)}`,
        settleRef: `stl_seed_vat_${String(vatIndex)}`,
        settledAmount: amounts.totalAmount,
        settledAt: days(-1),
        heldAt: soldAt,
        createdAt: soldAt,
      },
    });

    /** **والضمانُ يُفرَج معها** — فالتسويةُ لا تُصدَر على مالٍ لم يُقبض. */
    await prisma.escrow.create({
      data: {
        orderId: vatOrder.id,
        amount: amounts.totalAmount,
        status: 'RELEASED',
        heldAt: soldAt,
        releasedAt: days(-1),
      },
    });
    await prisma.listing.update({ where: { id: vatListing.id }, data: { status: 'SOLD' } });
  }

  /**
   * ═══ ووثائقُ الطلبات المكتملة تُصدَر بالكاتب نفسِه ═══
   *
   * كانت البذرةُ تُنهي طلباتٍ **ولا تُصدر لها وثيقة**: لا كشفَ تسويةٍ
   * ولا فاتورةَ ضريبية. فتفتح شاشةُ الفواتير (`A25`) ولوحةُ المعرض
   * (`D7`) على فراغٍ لا يكشف عطلًا فيهما، **وجدولُ الضريبة كلُّه بلا
   * صفّ** — وهو أهمّ ما يُراجَع قبل الإقرار.
   *
   * و`issueSettlementDocuments` هي الكاتبُ الذي يناديه `applyState`
   * عند الإفراج — لا نسخةٌ منه. فما يخرج هنا هو ما يخرج في الإنتاج،
   * **بما في ذلك ما يُحجب وسببُه**.
   */
  const { issueSettlementDocuments } = await import('../src/lib/domain/documents');
  const completed = await prisma.order.findMany({
    where: { status: 'COMPLETED', stage: 'DONE' },
    select: { id: true, ref: true },
  });

  /**
   * **والمحجوبُ يُطبع كما يُطبع المُصدَر.** أحصيتُه أوّلًا ولم أطبعه،
   * فأمسكه اللينت — وهو محقّ: **عددٌ يُحسب ولا يُقرأ ليس قياسًا**.
   * والمحجوبُ هنا ليس عطلًا دائمًا: بائعٌ فردٌ غيرُ مسجَّل لا تُصدر
   * له فاتورةُ قيمةٍ مضافة بحقّ — والرقمُ يقول كم مرّةً وقع ذلك.
   */
  const docs = { issued: 0, blocked: 0 };
  for (const order of completed) {
    const result = await issueSettlementDocuments(order.id, NOW);
    docs.issued += result.invoices.length;
    docs.blocked += result.blocked.length;
  }

  /**
   * **وفاتورةٌ أُبلغت وأخرى أُلغيت** — حالتان تُعرضان في `A25` ولم
   * يكن لهما صفّ. والإلغاءُ **بإشعارٍ دائن** في المنتج، وهنا حالٌ
   * تُعرض لا دورةٌ تُحاكى.
   */
  const invoices = await prisma.taxInvoice.findMany({
    orderBy: { sequence: 'asc' },
    select: { id: true },
  });
  /**
   * **والأولى تبقى «صدرت»** — وهي الحالُ التي تفتح عليها كلُّ فاتورةٍ
   * جديدة. وتبديلُ الجميع يترك الحالَ الأشيع بلا صفّ.
   */
  if (invoices[1] !== undefined) {
    await prisma.taxInvoice.update({
      where: { id: invoices[1].id },
      data: { status: 'REPORTED', reportedAt: days(-1) },
    });
  }
  if (invoices[2] !== undefined) {
    await prisma.taxInvoice.update({
      where: { id: invoices[2].id },
      data: { status: 'REPORT_FAILED', reportError: 'تعذر الاتصال ببوابة فاتورة — يعاد الإرسال.' },
    });
  }

  // ————— سجلّ التدقيق: كل إجراء أدمن يُكتب —————
  await prisma.auditLog.create({
    data: {
      actorId: superAdmin.id,
      actorType: 'system',
      entity: 'Database',
      entityId: 'seed',
      action: 'seed.run',
      after: { appEnv: APP_ENV, at: NOW.toISOString() },
    },
  });

  // ————— التقرير —————
  /**
   * ═══ أرقام العملاء — بترتيب الانضمام ═══
   *
   * وبلا هذه الخطوة يخرج نشرٌ جديد بعملاءَ **بلا رقمٍ يُعرفون به**:
   * الترحيل عبّأ الصفوف القائمة يومَ كُتب، ولا يمسّ ما يُزرع بعده.
   * فالزرع يمنحها كما يمنحها التسجيل.
   */
  const unnumbered = await prisma.user.findMany({
    where: { ref: null },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const perYear = new Map<number, number>();
  for (const user of unnumbered) {
    const year = user.createdAt.getFullYear();
    const taken = perYear.get(year) ?? (
      await prisma.user.count({ where: { ref: { startsWith: `CUS-${year}-` } } })
    );
    const next = taken + 1;
    perYear.set(year, next);
    await prisma.user.update({
      where: { id: user.id },
      data: { ref: `CUS-${year}-${String(next).padStart(4, '0')}` },
    });
  }

  /**
   * ═══ وصرفُ المستحقّات بحالَيه — المُرسَل والمنتظِر ═══
   *
   * `PROVIDER_PAYABLE` صار له خاصمٌ، **وبلا صفٍّ مزروع لا يُرى**:
   * شاشةُ الصرف تُفتح وقسمُ «ينتظر اعتماد عضوٍ ثانٍ» فارغٌ دائمًا،
   * وبطاقةُ المزوّد تقول «لم تخرج حوالةٌ بعد» في كل بيئة — فالنصابُ
   * الذي بُني وطابورُه لا يُقاسان بالنقر قطّ.
   *
   * **وكلُّ قيمةِ تعدادٍ يكتبها المنتج تُزرع**: فواحدٌ `SENT` بقيده في
   * الدفتر (فيُقرأ الخصمُ في الكشف)، وواحدٌ `PENDING` بطلب موافقته
   * (فتظهر شارةُ المِلاحة ويُعتمد بالنقر).
   */
  const financeAdmin = admins.find((row) => row.role === 'FINANCE') ?? admins[0];
  const opsAdmin = admins.find((row) => row.role === 'OPS') ?? admins[0];

  if (financeAdmin !== undefined && opsAdmin !== undefined) {
    const { providerBalance } = await import('../src/lib/domain/provider-ledger');
    const { recordProviderPayout } = await ledgerEvents();

    const inspectionId = providers.get('INSPECTION');
    const shippingId = providers.get('SHIPPING');

    /** ① حوالةٌ خرجت فعلًا — ومرجعُها هو ما يُطابَق بكشف البنك. */
    if (inspectionId !== undefined) {
      const sentAt = days(-3);
      const amount = new D('450.00');
      const bankRef = 'TRF-2026-104417';
      const payout = await prisma.providerPayout.create({
        data: {
          providerId: inspectionId,
          amount,
          status: 'SENT',
          ibanLast4: ibanLast4(
            (
              await prisma.serviceProvider.findUniqueOrThrow({
                where: { id: inspectionId },
                select: { iban: true },
              })
            ).iban,
          ),
          bankRef,
          requestedBy: opsAdmin.id,
          sentBy: financeAdmin.id,
          createdAt: days(-4),
          sentAt,
        },
      });

      /** **والقيد مع الصفّ لا بعده**: حوالةٌ بلا قيدٍ تُصرف مرّتين. */
      await recordProviderPayout(
        prisma,
        { providerId: inspectionId, amount, note: `payout ${payout.id} · ${bankRef}` },
        sentAt,
      );
    }

    /** ② وطلبٌ ينتظر الثانيَ — بمهلته، فيُعتمد أو ينقضي. */
    if (shippingId !== undefined) {
      const payable = new D(await providerBalance(shippingId));
      if (payable.greaterThan(0)) {
        const request = await prisma.approvalRequest.create({
          data: {
            kind: 'PROVIDER_PAYOUT',
            entityType: 'ServiceProvider',
            entityId: shippingId,
            payload: { amount: payable.toFixed(2) },
            requestedBy: opsAdmin.id,
            approvedBy: [],
            requiredApprovals: 2,
            status: 'PENDING',
            expiresAt: hours(60),
          },
        });

        await prisma.providerPayout.create({
          data: {
            providerId: shippingId,
            amount: payable,
            status: 'PENDING',
            ibanLast4: ibanLast4(
              (
                await prisma.serviceProvider.findUniqueOrThrow({
                  where: { id: shippingId },
                  select: { iban: true },
                })
              ).iban,
            ),
            approvalRequestId: request.id,
            requestedBy: opsAdmin.id,
            createdAt: hours(-12),
            /**
             * **ووسمُ البذرة يُنجّيه من التنظيف بالشكل.** `global-setup`
             * يحذف كل تحويلٍ `PENDING` — وهو محقٌّ في بقايا المشي
             * اليدويّ — فصفٌّ مزروع يختفي بعد أوّل `npm run verify`،
             * فتعود الشاشة التي زُرع ليُرى فيها فارغةً. والوسمُ صريحٌ
             * في الطرفين.
             */
            note: SEED_NOTE,
          },
        });
      }
    }
  }

  /**
   * ═══ وتحويلاتُ البائعين تُزرع كما تُزرع تحويلاتُ المزوّدين ═══
   *
   * `Payout` كان **صفرَ صفوفٍ** وحساب `SELLER_PAYABLE` موجبًا لبائعين —
   * فشاشةُ «تحويل مستحقات البائعين» تعرض من يستحقّ ولا تعرض حوالةً
   * واحدة، وصفحةُ تفاصيل التحويل تُشحن بلا ما يملؤها. **وما لا يُزرع
   * لا يُرى.**
   */
  if (financeAdmin !== undefined && opsAdmin !== undefined) {
    const { payableSellers } = await import('../src/lib/domain/payouts');
    const { recordSellerPayout } = await ledgerEvents();
    const owed = await payableSellers();

    /**
     * **والمزروعُ يُحاكي ما يُنتجه المنتج**: `requestPayout` يرفض بائعًا
     * بلا آيبان، **فحوالةٌ مزروعة لبائعٍ بلا آيبان حالٌ لا يبلغها
     * المنتج** — وتُقرأ في الشاشة «آيبان مسجل: لا» فوق حوالةٍ أُرسلت.
     */
    const withIban = owed.filter((row) => row.ibanLast4 !== null);

    /** ① حوالةٌ خرجت — ومرجعُها هو ما يُطابَق بكشف البنك. */
    const first = withIban[0];
    if (first !== undefined) {
      const amount = new D(first.payable).dividedBy(2).toDecimalPlaces(2);
      if (amount.greaterThan(0)) {
        const bankRef = 'TRF-2026-900318';
        const sent = await prisma.payout.create({
          data: {
            sellerId: first.sellerId,
            amount,
            status: 'SENT',
            ibanLast4: first.ibanLast4,
            bankRef,
            requestedBy: opsAdmin.id,
            sentBy: financeAdmin.id,
            createdAt: days(-5),
            sentAt: days(-4),
          },
        });
        /**
         * **والقيد مع الصفّ لا بعده** — حوالةٌ بلا قيدٍ تُصرف مرّتين.
         *
         * **وصياغةُ ملاحظته صياغةُ المنتج** (`approvePayout`): صفحةُ
         * التحويل تقرأ المعرّف من هذا النصّ لتعرض المرجع البنكيّ، فنصٌّ
         * مزروعٌ بصيغةٍ أخرى يجعل سطرَ الخصم «—» في بيانةِ العرض وحدها
         * — عطلٌ يراه من يفتح الشاشة ولا يراه اختبار.
         */
        await recordSellerPayout(
          prisma,
          { sellerId: first.sellerId, amount, note: `payout ${sent.id} · ${bankRef}` },
          days(-4),
        );
      }
    }

    /** ② وطلبٌ مفتوح ينتظر مرجع حوالته. */
    const second = withIban[1] ?? withIban[0];
    if (second !== undefined) {
      const amount = new D(second.payable).dividedBy(3).toDecimalPlaces(2);
      if (amount.greaterThan(0)) {
        await prisma.payout.create({
          data: {
            sellerId: second.sellerId,
            amount,
            status: 'PENDING',
            ibanLast4: second.ibanLast4,
            requestedBy: opsAdmin.id,
            createdAt: hours(-9),
            /** ووسمُ البذرة يُنجّيه من تنظيف `global-setup` بالشكل. */
            note: SEED_NOTE,
          },
        });
      }
    }
  }

  /**
   * ═══ المطابقة اليومية — وما لا يُزرع لا يُرى ═══
   *
   * `reconcileYesterday` مسجَّلةٌ في المُجدوِل ولا تُطابق إلّا بوّابةً
   * مرّت بها دفعةٌ في يومها — ودفعاتُ البذرة أقدمُ من أمسِ، فكلُّ بيئةٍ
   * مزروعة تفتح لوحةَ A25 على **«لم تطابق بعد» في كلّ سطر**، ولا يعرف
   * أحدٌ أتعمل المطابقة أم لا.
   *
   * **والصفوف تُنتَج بدالّة المنتج لا تُكتب بيد**: `reconcileGateway`
   * تقرأ دفترَنا وتسأل البوّابةَ كشفَها، فيخرج ما يخرج — `UNAVAILABLE`
   * لمن لا مُهايئ لها («بانتظار ملف التسوية»)، و`MATCHED` للتجريبية
   * التي تردّ كشفًا حقيقيًّا من `SandboxTransaction`. وصفٌّ مكتوبٌ بيدي
   * يقول «مطابق» عن مقارنةٍ لم تقع.
   */
  const { reconcileAll } = await import('../src/lib/domain/reconciliation');
  for (const back of [1, 2, 3]) {
    await reconcileAll(days(-back), hours(-back * 2));
  }

  const counts = {
    ماركة: await prisma.brand.count(),
    'نوع هيكل': await prisma.bodyTypeDisplay.count(),
    'مستند قانوني': await prisma.legalDocument.count(),
    طراز: await prisma.model.count(),
    فئة: await prisma.trim.count(),
    ميزة: await prisma.feature.count(),
    'ربط ميزة بفئة': await prisma.trimFeature.count(),
    معرض: await prisma.dealer.count(),
    مستخدم: await prisma.user.count(),
    'حساب أدمن': await prisma.adminUser.count(),
    مركبة: await prisma.vehicle.count(),
    إعلان: await prisma.listing.count(),
    صورة: await prisma.listingImage.count(),
    مزاد: await prisma.auction.count(),
    مزايدة: await prisma.bid.count(),
    "مزايدة ملغاة": await prisma.cancelledBid.count(),
    طلب: await prisma.order.count(),
    فاتورة: await prisma.invoice.count(),
    'تقرير فحص': await prisma.inspectionReport.count(),
    خدمة: await prisma.service.count(),
    'سؤال شائع': await prisma.faqItem.count(),
    'قالب إشعار': await prisma.notificationTemplate.count(),
    'قناة دفع': await prisma.pushChannel.count(),
    'بوابة دفع': await prisma.paymentGateway.count(),
    'قاعدة ضريبية': await prisma.taxRule.count(),
    مفضلة: await prisma.favorite.count(),
    'مساحة إعلانية': await prisma.adSlot.count(),
    'جهة تمويل': await prisma.financeProvider.count(),
    تكامل: await prisma.integration.count(),
    'إحصاء سعر': await prisma.priceStat.count(),
    /** **والتسرّب الصامت يُقاس لا يُلاحَظ** — فكلُّ كيانٍ يُزرع يُعدّ. */
    'قيد دفتر': await prisma.ledgerEntry.count(),
    'تحويل مزود': await prisma.providerPayout.count(),
    'مطابقة بوابة': await prisma.reconciliationRun.count(),
    'حجز تجريبي': await prisma.sandboxTransaction.count(),
    'فاتورة ضريبية': await prisma.taxInvoice.count(),
    'توريد محجوب عن الفوترة': docs.blocked,
    مدينة: await prisma.city.count(),
  };

  console.log('');
  /**
   * **كلمة المرور لا تُطبع حين تأتي من البيئة.**
   *
   * سجلّ الحاوية يقرؤه كل من يملك لوحة النشر، ويبقى محفوظًا فيها —
   * فطباعتها هناك تجعل سرًّا ضبطتَه بعناية مقروءًا لكل من يفتح
   * السجلّات، وإلى الأبد. ومن ضبطها يعرفها أصلًا.
   *
   * وفي التطوير تُطبع: الافتراضيّ معروفٌ في المستودع، وإخفاؤه إخفاءُ
   * ما لا يخفى.
   */
  console.log(
    process.env.ADMIN_PASSWORD === undefined
      ? `  حسابات الأدمن — كلمة المرور: ${seedPassword ?? DEV_PASSWORD}`
      : '  حسابات الأدمن — كلمة المرور: (من ADMIN_PASSWORD)',
  );
  console.log('');
  for (const [label, n] of Object.entries(counts)) {
    console.log(`  ${String(n).padStart(5)}  ${label}`);
  }
  console.log('');

  await prisma.$disconnect();
}

void main().catch(async (error: unknown) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
