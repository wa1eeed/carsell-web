/**
 * ═══ مقياس المطابقة — التصميم مقابل المبنيّ ═══
 *
 * **الجرد اليدويّ يتعفّن.** قائمةٌ تُكتب اليوم تصف الفروق يوم كُتبت،
 * ثم تُقرأ بعد شهرٍ وقد أُغلق نصفُها وفُتح غيره. فالقياس أمرٌ يُعاد.
 *
 * ═══ وماذا يقيس ═══
 *
 * من ترميز كل شاشةٍ في `design/*.dc.html` تُستخرج **إشاراتُها**:
 * عناوين الأقسام، ونصوص الأزرار، ورؤوس الجداول. ثم تُطلب الشاشة
 * المقابلة من الخادم ويُبحث عن كلٍّ منها في نصّها.
 *
 * **وهو مقياسُ وجودٍ لا مقياسُ شكل**: يقول «قسم ما يشمله الفحص غائب»
 * ولا يقول «الحشو ١٢ بدل ١٤». والأوّل هو ما يُفقد المستخدمَ شيئًا،
 * والثاني يُقاس بالعين على لقطة.
 *
 * الاستعمال:
 *   node scripts/design-audit.mjs            # الكلّ
 *   node scripts/design-audit.mjs A4 Wc      # شاشاتٌ بعينها
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.cwd();

/** مدنٌ تُذكر في التصميم بياناتٍ لا بنية — والشريط يُبنى من القاعدة. */
const CITY_NAMES = new Set([
  'الرياض', 'جدة', 'الدمام', 'مكة', 'المدينة', 'الخبر', 'تبوك', 'أبها',
  'الطائف', 'بريدة', 'حائل', 'نجران', 'جازان', 'الظهران',
]);
const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3002';
let ADMIN_COOKIE = process.env.AUDIT_ADMIN ?? '';
let USER_COOKIE = process.env.AUDIT_USER ?? '';

/**
 * ═══ والقياس يدخل بنفسه ═══
 *
 * ثلاثٌ وثلاثون شاشة أدمن كانت تُقرأ **صفرًا** في كل تقرير — وكلُّها
 * تردّ ٣٠٧ إلى صفحة الدخول. فالرقم لم يقل «لوحة الأدمن لا تطابق
 * التصميم»، قال «لم أدخل» — ولا شيء في التقرير يفرّق.
 *
 * وتمريرُ الكوكي بيدٍ في متغيّر بيئة يُنسى، فأوّلُ قياسٍ بعد النسيان
 * يُظهر انهيارًا في نصف المنتج. فيُؤخذ الدخول من المسار نفسه الذي
 * يسلكه الأدمن — وفشلُه يُعلَن ولا يُبتلع.
 *
 * ولا يعمل إلّا على مضيفٍ محلّي: القياس أداةُ تطوير، ودخولٌ آليّ
 * بكلمةِ بذرةٍ إلى عنوانٍ بعيد ليس منها.
 */
async function signIn() {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(BASE)) {
    console.log('⬜ القياس على مضيفٍ غير محلّي — لا دخول آليّ، وشاشات الأدمن لن تُقاس.');
    return;
  }
  if (ADMIN_COOKIE !== '') return;

  try {
    const res = await fetch(`${BASE}/api/v1/admin/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL ?? 'super@carsell.one',
        password: process.env.ADMIN_PASSWORD ?? 'CarSell!dev2026',
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const raw = res.headers.getSetCookie?.() ?? [];
    const found = raw
      .map((line) => /(?:^|;\s*)carsell_admin=([^;]+)/.exec(line)?.[1])
      .find((value) => value !== undefined);

    if (found === undefined) {
      console.log(`⬜ تعذّر دخول الأدمن (HTTP ${String(res.status)}) — شاشاته لن تُقاس.`);
      return;
    }
    ADMIN_COOKIE = found;
  } catch (error) {
    console.log(`⬜ تعذّر دخول الأدمن (${error instanceof Error ? error.name : 'fetch'}).`);
  }

  await signInUser();
}

/**
 * ═══ والنصف الآخر: اثنتا عشرة شاشة حساب ═══
 *
 * أصلحتُ دخول الأدمن وتركتُ المستخدم، فبقيت `Wf` و`Wl` و`Wt` و`Wu`
 * و`Wv` و`Wy` ومعالج البيع كلُّه **صفرًا** — بالسبب نفسه الذي أصلحتُه
 * للتوّ. ونصفُ الإصلاح يُنتج رقمًا يبدو صالحًا وهو يقيس نصف المنتج.
 *
 * والدخول بالمسار الذي يسلكه المشتري: رمزٌ يُطلب ويُتحقّق. و`devCode`
 * لا يُعاد إلّا في التطوير، فالقياس على غيره لا يدخل أصلًا.
 */
/**
 * ملفُّ الجلسة المحفوظة — **ومهلةُ الرمز تمنع قياسين متتاليين**.
 *
 * `requestOtp` تفرض مهلةً بين طلبين، فقياسٌ يتلو قياسًا يسقط دخولُه
 * ويُخرج اثنتي عشرة شاشة من المقام. والجلسة صالحةٌ شهرًا، فحفظُها
 * يجعل الطلب مرّةً واحدة — وهي جلسةٌ نالها المسار نفسه لا التفافًا
 * عليه.
 */
const SESSION_FILE = join(tmpdir(), 'carsell-design-audit-session');

async function signInUser() {
  if (USER_COOKIE !== '') return;

  try {
    const cached = readFileSync(SESSION_FILE, 'utf8').trim();
    if (cached !== '') {
      /** تُجرَّب قبل أن يُوثَق بها: جلسةٌ منتهية أسوأ من غيابها. */
      const probe = await fetch(`${BASE}/ar/account`, {
        headers: { cookie: `carsell_session=${cached}` },
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      });
      if (probe.status === 200) {
        USER_COOKIE = cached;
        return;
      }
    }
  } catch {
    /* لا جلسة محفوظة — يُطلب رمزٌ جديد */
  }

  const phone = process.env.AUDIT_PHONE ?? '+966510000003';

  try {
    const asked = await fetch(`${BASE}/api/v1/auth/otp/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
      signal: AbortSignal.timeout(30_000),
    });

    const body = await asked.json();
    const challengeId = body?.data?.challengeId;
    const code = body?.data?.devCode;

    if (typeof challengeId !== 'string' || typeof code !== 'string') {
      /**
       * **والمهلة بين طلبين سببٌ متوقَّع لا عطل.** قياسٌ يتلو قياسًا
       * يصطدم بها، فيُقال باسمه ولا يُقرأ «الشاشات لا تطابق».
       */
      const reason = body?.error?.code ?? `HTTP ${String(asked.status)}`;
      console.log(`⬜ تعذّر دخول المستخدم (${String(reason)}) — شاشات الحساب لن تُقاس.`);
      return;
    }

    const verified = await fetch(`${BASE}/api/v1/auth/otp/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId, code }),
      signal: AbortSignal.timeout(30_000),
    });

    const found = (verified.headers.getSetCookie?.() ?? [])
      .map((line) => /(?:^|;\s*)carsell_session=([^;]+)/.exec(line)?.[1])
      .find((value) => value !== undefined);

    if (found === undefined) {
      console.log(`⬜ تعذّر دخول المستخدم (HTTP ${String(verified.status)}).`);
      return;
    }
    USER_COOKIE = found;
    try {
      writeFileSync(SESSION_FILE, found, 'utf8');
    } catch {
      /* الحفظ تحسينٌ لا شرط — والقياس يمضي بلا ملفّ */
    }
  } catch (error) {
    console.log(`⬜ تعذّر دخول المستخدم (${error instanceof Error ? error.name : 'fetch'}).`);
  }
}

/**
 * خريطة الشاشة إلى مسارها. **ومسارٌ غائب يُعلن** لا يُتخطّى بصمت:
 * شاشةٌ في التصميم بلا مسارٍ مبنيّ هي أكبر فرقٍ ممكن.
 */
const ROUTES = {
  A1: '/admin', A2: '/admin?tab=ops', A3: '/admin?tab=finance',
  A4: '/admin/orders', A5: '/admin/users', A6: '/admin/service-requests',
  A7: '/admin/services', A8: '/admin/notifications', A9: '/admin/campaigns',
  A10: '/admin/push', A11: '/admin/integrations', A12: '/admin/catalog/brands',
  A13: '/admin/catalog/models', A14: '/admin/catalog/trims', A15: '/admin/listings',
  A16: '/admin/audit', A17: '/admin/disputes', A18: '/admin/identity',
  A19: '/admin/catalog/features', A20: '/admin/payments', A21: '/admin/tax',
  A22: '/admin/auctions', A23: '/admin/offers', A24: null,
  A25: '/admin/settlements', A26: '/admin/dealers', A27: '/admin/all-listings',
  A28: '/admin/providers', A29: '/admin/plans', A30: '/admin/ads',
  A31: '/admin/ads', A32: '/admin/auction-settings', A33: '/admin/faq',
  A34: '/admin/legal', A35: '/admin/team', A36: '/admin/exports',

  /**
   * **والشاشات الفرعية مساراتُها مبنيّة** — غيابُها من الخريطة خطأُ
   * قياسٍ لا نقصُ بناء. والمراجع من البذرة، فإن تغيّرت تُحدَّث هنا
   * (والبديل مسارٌ ثابت لا بيانات له، وهو أسوأ).
   */
  Wa: '/ar',
  Wb: '/ar/cars',
  Wc: '/ar/cars/ADS2026A0032',
  Wd: '/ar/cars/ADS2026A0002/inspection',
  We: '/ar/auctions/ADS2026A0051',
  Wf: '/ar/account',
  Wg: '/ar/dealers/al-nokhba',
  Wh: '/ar/sell',
  Wi: '/ar/services',
  /**
   * **وصفحةُ الطلب تُقاس بجلسة صاحبها.** غير طرفَي الطلب يرى ٤٠٤
   * (وجودُ الطلب نفسه معلومة)، فقياسُها بجلسةٍ أخرى يقول «صفر» وهي
   * مبنيّةٌ كاملة. و`AUDIT_ORDER` يُمرَّر من خارج.
   */
  Wj: process.env.AUDIT_ORDER ?? null,
  Wk: '/ar/auctions',
  Wl: '/ar/account/offers',
  Wm: '/ar/auth',
  Wn: '/ar/help',
  Wo: '/ar/legal/terms',
  Wp: '/ar/dealers',
  Wq: null, Wr: null,
  Ws: '/ar/account/offers', Wt: '/ar/account/listings', Wu: '/ar/account/favorites',
  Wv: '/ar/account/wallet', Wx: '/ar/services/inspection', Wy: '/ar/account/reports',
  Wz: '/ar/browse/riyadh/toyota',
  /** خطوات معالج البيع — شاشةٌ واحدة بحالاتٍ ثلاث، ومسارُها واحد. */
  Wh3: '/ar/sell', Wh3a: '/ar/sell', Wh3b: '/ar/sell',
};

/** شاشاتٌ أُجّلت بقرار المالك — تُستثنى ولا تُحسب دَينًا. */
const DEFERRED = new Set(['A24', 'Wq', 'Wr']);

/**
 * ═══ والمؤجَّل يظهر **داخل** شاشاتٍ قائمة ═══
 *
 * استثناء `Wq` كشاشةٍ لا يكفي: «حاسبة التمويل» و«الراجحي» و«البلاد»
 * مرسومةٌ في الرئيسية أيضًا، فتُحسب نقصًا فيها — والمالك أجّل التمويل.
 * فالرئيسية تُقرأ ٢٥٪ وربعُ نقصها قرارٌ لا دَين، **ويُرسَل القارئ
 * ليبني ما قيل له ألّا يبنيه**.
 */
const DEFERRED_SIGNALS = [
  /* التمويل — Wq، بعد الإطلاق */
  'حاسبة التمويل', 'بالتقسيط', 'التمويل', 'تمويل',
  /* أسماء الممولين في الحاسبة المؤجَّلة */
  'الراجحي', 'البلاد', 'الإنماء', 'الجزيرة', 'الأهلي', 'سامبا',
  'الرياض للتمويل', 'عبداللطيف جميل', 'إمكان', 'اعرف أكثر',
  /* اللوحات المميّزة — Wr، بعد الإطلاق */
  'لوحة مميّزة', 'اللوحات المميّزة', 'مزاد اللوحات',
];

/**
 * ═══ ونصٌّ يراه الزائر وهو في خاصّيّة ═══
 *
 * «ابحث عن سؤالك…» عنصرُ نائبٍ في حقل، و«تنزيل PDF» قد تكون
 * `aria-label` على أيقونة. وحذفُ الوسوم يبتلعها، فتُقرأ الشاشة ناقصةً
 * وهي تعرضها — و`Wn` قُرئت **صفرًا** وفيها الباحث مبنيّ.
 *
 * **ولا يكفي أن تُستخرج قبل الحذف**: أوّلُ محاولةٍ أبدلت الخاصّيّة
 * بقيمتها **داخل الوسم**، فحذفَها حذفُ الوسم بعد سطر. فتُجمع على حدة
 * وتُلحَق بالمتن.
 */
function attributeText(html) {
  const values = [];
  for (const match of html.matchAll(
    /\s(?:placeholder|aria-label|title|alt)="([^"]*)"/g,
  )) {
    values.push(match[1]);
  }
  return values.join(' ');
}

function stripTags(html) {
  return `${attributeText(html)} ${html}`
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/**
 * إشارات الشاشة من ترميزها — **العناوين والأزرار ورؤوس الجداول**.
 *
 * ويُستبعد ما يتكرّر في كل شاشة (الشريط الجانبي والترويسة): إشارةٌ
 * موجودةٌ في الكلّ لا تقيس شيئًا.
 */
function signalsOf(segment, navNoise) {
  const out = new Set();

  // عناوين الأقسام — خطٌّ ثخين بمقاسٍ كبير في ترميز التصميم
  for (const m of segment.matchAll(/font:\s*(?:700|800)\s*1[4-9](?:\.\d)?px[^"]*"[^>]*>\s*([^<]{4,40}?)\s*</g)) {
    out.add(m[1].trim());
  }
  // الأزرار — حوافّ دائرية أو مستطيلة بخطٍّ ثخين صغير
  for (const m of segment.matchAll(/border-radius:\s*(?:8|9|10|999)px[^"]*"[^>]*>\s*([^<]{3,24}?)\s*</g)) {
    out.add(m[1].trim());
  }
  // رؤوس الجداول
  for (const m of segment.matchAll(/opacity:\s*\.?[45]\d*[^"]*"[^>]*>\s*([^<]{3,20}?)\s*</g)) {
    out.add(m[1].trim());
  }

  return [...out].filter((s) => {
    if (navNoise.has(s)) return false;
    if (!/[؀-ۿ]/.test(s)) return false;   // العربية وحدها — الأرقام تتغيّر
    /**
     * ═══ وقيَم البيانات تُستبعَد ═══
     *
     * التصميم مليءٌ بأرقامٍ وأسماءٍ وهمية («٢٤٬٦٨٠ عميلًا» · «كامري
     * ٢٠٢٤» · «١٤٢ مزايدة آخر ساعة»). **ولن تطابق بياناتٍ حقيقية
     * أبدًا**، فعدُّها نقصًا يُضخّم الفرق ويُرسل القارئ خلف أشباح.
     *
     * فما يحمل رقمًا يُستبعَد، ويبقى **ما يقيس بنيةً**: عنوانُ قسم،
     * ونصُّ زرّ، ورأسُ عمود — وهي ما يفقده المستخدم حين يغيب.
     */
    if (/[٠-٩0-9]/.test(s)) return false;

    /**
     * **وأسماءُ الأماكن والأشخاص الوهمية تُستبعَد أيضًا.** التصميم
     * يكتب «حي الملقا» و«طريق الملك» و«معرض النخبة» — وهي بياناتٌ
     * مخترعة كالأرقام، لا بنيةٌ تُبنى. وعدُّها نقصًا يُرسل القارئ
     * ليزرع حيًّا بعينه في قاعدةٍ حقيقية.
     */
    if (/^(حي |طريق |شارع |معرض |صالة |مركز )/.test(s)) return false;
    if (CITY_NAMES.has(s)) return false;

    return s.length >= 4;
  });
}

async function main() {
  const wanted = process.argv.slice(2);
  const files = [
    ['design/Admin.dc.html', /id="(A\d{1,2})"/g],
    ['design/Front-end Web.dc.html', /id="(W[a-z]\d?[a-z]?\d?)"/g],
  ];

  const rows = [];

  for (const [path, re] of files) {
    const html = readFileSync(join(ROOT, path), 'utf8');
    const marks = [...html.matchAll(re)].map((m) => [m[1], m.index]);
    marks.sort((a, b) => a[1] - b[1]);

    // ضوضاء التنقّل: ما يظهر في أكثر من نصف الشاشات
    const counts = new Map();
    const segments = new Map();
    marks.forEach(([tag, start], i) => {
      const end = i + 1 < marks.length ? marks[i + 1][1] : html.length;
      const seg = html.slice(start, end);
      segments.set(tag, seg);
      for (const s of signalsOf(seg, new Set())) {
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    });
    const noise = new Set(
      [...counts.entries()].filter(([, n]) => n > marks.length / 2).map(([s]) => s),
    );

    for (const [tag] of marks) {
      if (wanted.length > 0 && !wanted.includes(tag)) continue;
      if (DEFERRED.has(tag)) continue;

      const route = ROUTES[tag];
      const signals = signalsOf(segments.get(tag), noise);
      if (signals.length === 0) continue;

      if (route === undefined || route === null) {
        rows.push({ tag, route: '—', total: signals.length, found: 0, missing: signals.slice(0, 6) });
        continue;
      }

      /**
       * ═══ والعامّة تُقاس خارجةً من الحساب ═══
       *
       * أرسلتُ كوكي المستخدم إلى كل مسار، فاختفت «تسجيل الدخول» من
       * الرئيسية — الترويسة تعرض الاسم لمن دخل. فقرأتُ نقصًا صنعه
       * القياس نفسه، وكدتُ أُصلح ترويسةً سليمة.
       *
       * فالجلسة لِما لا يُفتح بدونها وحده.
       */
      const needsUser = /^\/[a-z]{2}\/(account|sell|orders|inbox|checkout)\b/.test(route);

      /**
       * **وغيابُ الجلسة ليس «صفر مطابقة».** سقط الدخول بـ
       * `OTP_RATE_LIMITED` فقُرئت اثنتا عشرة شاشة حساب صفرًا — وهي
       * تعرض ما يطلبه التصميم، وأنا من لم يدخل. والقاعدة نفسها التي
       * فُصل بها فشلُ الجلب: ما لم يُقَس يخرج من المقام.
       */
      if (needsUser && USER_COOKIE === '') {
        rows.push({
          tag, route,
          total: signals.length,
          found: 0,
          failed: 'بلا جلسة',
          empty: false,
          missing: [],
        });
        continue;
      }

      if (route.startsWith('/admin') && ADMIN_COOKIE === '') {
        rows.push({
          tag, route,
          total: signals.length,
          found: 0,
          failed: 'بلا جلسة أدمن',
          empty: false,
          missing: [],
        });
        continue;
      }
      const cookie = route.startsWith('/admin')
        ? `carsell_admin=${ADMIN_COOKIE}`
        : needsUser
          ? `carsell_session=${USER_COOKIE}`
          : '';

      /**
       * ═══ وجلبٌ فاشل ليس «صفر مطابقة» ═══
       *
       * كان الفشل يُبتلع إلى `text = ''`، فتُحتسب الشاشة **صفرًا** —
       * ولا فرق في التقرير بين «الشاشة لا تطابق التصميم» و«لم أصل
       * إليها». وخادمُ تطويرٍ يُعيد البناء تحت حمل يردّ ٥٠٠ أو يتأخّر،
       * فقرأتُ ١٠٪ على شجرةٍ قِيست ٤٦٪ قبل ساعة — **والرقمان كلاهما
       * غير صالح**.
       *
       * والقياس الذي يكذب صامتًا أسوأ من غياب القياس: يُبنى عليه قرار.
       * فيُفصل الفشل ويُستثنى من المجموع ويُعلَن باسمه.
       *
       * وثلاث محاولات: أوّلُ طلبٍ لمسارٍ في Next يُصرَف في الترجمة،
       * فمهلةٌ قصيرة تُسقطه وهو سليم.
       */
      let text = null;
      /** الترميز الخام — تُقرأ منه العلامات التي لا تنجو من التجريد */
      let raw = null;
      let failure = null;

      for (let attempt = 1; attempt <= 3 && text === null; attempt += 1) {
        /**
         * **والمحاولات الثلاث كانت متلاصقة.** خادمُ تطويرٍ يترجم
         * ستّين مسارًا بالتتابع يرفض الاتّصال لحظةً، فثلاثُ محاولاتٍ
         * في جزءٍ من الثانية تفشل ثلاثتُها — وقرأتُ ٥٥ شاشة
         * «لم تُقَس» وهي تردّ ٢٠٠ بعد ثانية.
         */
        if (attempt > 1) await new Promise((done) => setTimeout(done, attempt * 2000));

        try {
          const res = await fetch(`${BASE}${route}`, {
            headers: { cookie },
            signal: AbortSignal.timeout(30_000),
          });
          if (res.ok) {
            raw = await res.text();
            text = stripTags(raw);
          } else {
            failure = `HTTP ${String(res.status)}`;
          }
        } catch (error) {
          failure = error instanceof Error ? error.name : 'fetch';
        }
      }

      if (text === null) {
        rows.push({
          tag, route,
          total: signals.length,
          found: 0,
          failed: failure ?? 'fetch',
          empty: false,
          missing: [],
        });
        continue;
      }

      /**
       * ═══ وخطوةٌ خلف المسار نفسه لا تُقاس بجلبه ═══
       *
       * `Wh` و`Wh3` و`Wh3a` و`Wh3b` أربعُ شاشاتٍ في التصميم ومسارُها
       * واحد: `/ar/sell`. فجلبُه يُعطي **الخطوة الأولى** أربع مرّات،
       * وتُحسب الثلاثُ الباقية أصفارًا — فيُقرأ «معالج البيع صفر٪»
       * وفيه كلُّ ما نقص، مكتوبًا في `ar.json` ومعروضًا بعد أوّل نقرة.
       *
       * **وصفرٌ كاذب يُرسل القارئ ليبني ما هو مبنيّ** — وهو الوجه
       * الآخر لإخراج الشاشة من المقام: ذاك يُخفي نقصًا، وهذا يخترع
       * نقصًا.
       *
       * فالأولى على المسار تُقاس، والباقيات تُعلَن «خطوة» وتخرج من
       * المقام — ويُقال ذلك في النتيجة لا يُسكَت عنه.
       */
      const first = Object.entries(ROUTES).find(([, value]) => value === route)?.[0];
      if (first !== undefined && first !== tag) {
        rows.push({
          tag, route, total: 0, found: 0, empty: false, step: first, missing: [],
        });
        continue;
      }

      /** المؤجَّل يخرج من البسط والمقام معًا — لا يُعدّ نقصًا ولا مطابقة. */
      const live = signals.filter(
        (signal) => !DEFERRED_SIGNALS.some((word) => signal.includes(word)),
      );
      const missing = live.filter((s) => !text.includes(s));

      /**
       * ═══ والحالة الفارغة ليست نقصًا ═══
       *
       * شاشةٌ بلا بيانات لا تُصيّر جدولها ولا أزرار صفوفها: «اقبل»
       * و«قابِل» موجودان في الشيفرة ويظهران مع أوّل عرض. وعدُّهما
       * نقصًا يُرسل القارئ ليبني ما هو مبنيّ.
       *
       * فتُعلَم الشاشة بأنها فارغة، ويُعلَن ذلك في النتيجة — **ولا
       * تُحتسب في المجموع**، لأن حاصلها لا يقيس مطابقةً بل بيانات.
       */
      /**
       * **والعلامة من المكوّن لا من الصياغة.** كان يُبحث عن «لا عروض»
       * ونحوها في نصّ الصفحة كلّه — فوسمُ صفٍّ واحد («لا عروض» تحت
       * إعلانٍ له مشاهدات) يُخرج الشاشة كلّها من المقام. وسبعُ شاشات
       * حسابٍ عامرةٍ كانت تُحسب «فارغة».
       *
       * و`EmptyState` تضع `data-empty` — فالفحص على ما يُصيَّر فعلًا.
       */
      const empty = raw !== null && raw.includes('data-empty="true"');

      rows.push({
        tag, route,
        total: live.length,
        found: live.length - missing.length,
        empty,
        missing: missing.slice(0, 6),
      });
    }
  }

  let totalSignals = 0;
  let totalFound = 0;
  const skipped = [];
  const steps = [];
  const unreachable = [];
  console.log('الشاشة  المسار                          مطابق   الناقص');
  for (const row of rows) {
    /** ما لم يُقَس لا يدخل المقام — ولا يُقرأ صفرًا. */
    if (row.failed !== undefined) {
      unreachable.push(`${row.tag} (${row.failed})`);
    } else if (row.step !== undefined) {
      // خطوةٌ خلف المسار نفسه — تُعلَن ولا تُحتسب
      steps.push(`${row.tag} ↪ ${row.step}`);
    } else if (row.empty === true) {
      skipped.push(row.tag);
    } else {
      totalSignals += row.total;
      totalFound += row.found;
    }
    const pct = row.total === 0 ? 100 : Math.round((row.found / row.total) * 100);
    const mark =
      row.failed !== undefined
        ? `✖ ${row.failed}`
        : row.route === '—'
          ? '⬜ لا مسار'
          : row.step !== undefined
            ? `↪ خطوة في ${row.step}`
            : row.empty === true
              ? '— فارغة'
              : `${String(pct).padStart(3)}٪`;
    console.log(
      `${row.tag.padEnd(7)} ${row.route.padEnd(32)} ${mark}   ${row.missing.join(' · ')}`,
    );
  }
  const overall = totalSignals === 0 ? 0 : Math.round((totalFound / totalSignals) * 100);
  console.log(`\nالمجموع: ${totalFound}/${totalSignals} إشارة — ${overall}٪`);
  if (skipped.length > 0) {
    console.log(
      `شاشاتٌ بلا بيانات (لا تُحتسب — حاصلُها يقيس بيانات لا مطابقة): ${skipped.join(' ')}`,
    );
  }
  if (steps.length > 0) {
    console.log(
      `خطواتٌ خلف مسارٍ واحد (لا تُقاس بجلبه — صفرُها كاذب): ${steps.join(' · ')}`,
    );
  }

  /**
   * **والرقم لا يُقرأ ما دامت شاشةٌ لم تُقَس.** مقامٌ ناقصٌ يُنتج نسبةً
   * تبدو صالحة، وفرقُها عن القياس السابق يُقرأ تحسّنًا أو انحدارًا —
   * وهو حالُ الخادم لا حالُ الشجرة. فيُعلَن صراحةً ويخرج بـ١.
   */
  if (unreachable.length > 0) {
    console.log(`\n✖ لم تُقَس ${String(unreachable.length)} شاشة: ${unreachable.join(' · ')}`);
    console.log('والرقم أعلاه ناقص المقام — أعِد القياس وخادمُ التطوير ساكن.');
    process.exitCode = 1;
  }
}

await signIn();
await main();
