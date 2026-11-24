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
    console.log(
      `⬜ تعذّر دخول الأدمن على ${BASE} (${error instanceof Error ? error.message : 'fetch'}) — شاشاته لن تُقاس.`,
    );
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
const BUYER_FILE = join(tmpdir(), 'carsell-design-audit-buyer');

/**
 * ═══ ولا بائعَ في البذرة يشتري ═══
 *
 * قِيس: من ٢٠٠ حساب، **لا واحد** له إعلانٌ وطلبٌ معًا — البائعون
 * يبيعون والمشترون يشترون. فجلسةٌ واحدة لا تبلغ `Wj` و`Wt` معًا مهما
 * اختيرت، وليست علّة أداة بل حالُ البيانات.
 *
 * فجلستان: بائعٌ لشاشات الحساب، ومشترٍ لصفحة الطلب وحدها. و**الطلب
 * يُكتشف من الشاشة** لا يُكتب ثابتًا — مرجعٌ مكتوبٌ في أداة قياس
 * يتعفّن مع أوّل بذرة.
 */
let BUYER_COOKIE = '';
/** شاشاتٌ تُقاس بجلسة المشتري — وما عداها بجلسة البائع. */
const BUYER_SCREENS = new Set(['Wj']);

/** دخولٌ برقمٍ واحد — يُعيد الكوكي أو `null`، ولا يبتلع سببًا. */
async function signInPhone(phone) {
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
    if (typeof challengeId !== 'string' || typeof code !== 'string') return null;

    const verified = await fetch(`${BASE}/api/v1/auth/otp/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId, code }),
      signal: AbortSignal.timeout(30_000),
    });
    return (
      (verified.headers.getSetCookie?.() ?? [])
        .map((line) => /(?:^|;\s*)carsell_session=([^;]+)/.exec(line)?.[1])
        .find((value) => value !== undefined) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * **والشرط يُصنَع لا يُنتظَر.** حسابٌ بلا طلبٍ يُخرج `Wj` «لا مسار»
 * وهي مبنيّة — فتُجرَّب حساباتُ المشترين حتى يُوجد من له طلب، ويُقال
 * إن لم يوجد.
 */
async function findOrderRoute() {
  /**
   * ═══ والشاشة تُقاس في الحال التي يرسمها التصميم ═══
   *
   * `Wj` مرسومٌ عند **مرحلة الدفع**: «قيد الدفع» و«المستحق الآن»
   * و«ادفع الآن». وأوّلُ طلبٍ في القائمة قد يكون مكتملًا أو ملغًى —
   * فتُقاس شاشةٌ تُخفي زرَّ الدفع بحقّ، ويُقرأ ذلك نقصًا فيها.
   *
   * فتُجرَّب طلباتُ الحساب ويُفضَّل ما يحمل زرَّ الدفع، ويُرجَع إلى
   * الأوّل إن لم يوجد — ولا يُسكَت عن الفرق.
   */
  const probe = async (cookie) => {
    const res = await fetch(`${BASE}/ar/account/orders`, {
      headers: { cookie: `carsell_session=${cookie}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const refs = [
      ...new Set(
        [...(await res.text()).matchAll(/href="(\/ar\/account\/orders\/[A-Za-z0-9-]+)"/g)].map(
          (match) => match[1],
        ),
      ),
    ];
    if (refs.length === 0) return null;

    for (const path of refs.slice(0, 6)) {
      const page = await fetch(`${BASE}${path}`, {
        headers: { cookie: `carsell_session=${cookie}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (!page.ok) continue;
      if ((await page.text()).includes('ادفع الآن')) return { path, payable: true };
    }
    return { path: refs[0], payable: false };
  };

  /** أفضلُ ما وُجد حتى الآن — ويُستبدَل بأوّل طلبٍ يحمل زرّ الدفع. */
  let fallback = null;

  try {
    const cached = readFileSync(BUYER_FILE, 'utf8').trim();
    if (cached !== '') {
      const found = await probe(cached);
      if (found !== null) {
        BUYER_COOKIE = cached;
        if (found.payable) return found.path;
        fallback = { cookie: cached, path: found.path };
      }
    }
  } catch {
    /* لا جلسة محفوظة */
  }

  /**
   * **ورقمٌ مُمرَّر يُجرَّب مرّةً لا أربعًا.** مهلةُ الرمز ثلاثون ثانية،
   * فإعادةُ المحاولة على الرقم نفسِه تصطدم بها أربع مرّات ثمّ تُعلن
   * «لا حساب له طلب» — وهو موجود.
   */
  const fixed = process.env.AUDIT_BUYER_PHONE;
  const tries = fixed === undefined ? 4 : 1;
  for (let i = 0; i < tries; i += 1) {
    const phone = fixed ?? `+9665${String(30000000 + i).padStart(8, '0')}`;
    const cookie = await signInPhone(phone);
    if (cookie === null) continue;
    const found = await probe(cookie);
    if (found === null) continue;

    if (found.payable) {
      BUYER_COOKIE = cookie;
      try {
        writeFileSync(BUYER_FILE, cookie, 'utf8');
      } catch {
        /* الحفظ تحسينٌ لا شرط */
      }
      return found.path;
    }
    fallback ??= { cookie, path: found.path };
  }

  if (fallback !== null) {
    BUYER_COOKIE = fallback.cookie;
    /** **ويُقال إنّ الحال ليست المرسومة** — وإلّا قُرئ نقصُ حالٍ نقصَ بناء. */
    console.log('⬜ لا طلبَ عند مرحلة الدفع — تُقاس Wj على حالٍ أخرى، وزرُّ الدفع غائبٌ بحقّ.');
    return fallback.path;
  }

  console.log('⬜ لا حسابَ مشترٍ له طلب — صفحة الطلب (Wj) لن تُقاس.');
  return null;
}

/** كم قسمًا من أقسام `Wf` يعرضه هذا الحساب؟ — صفرٌ إلى ثلاثة. */
async function accountRichness(cookie) {
  try {
    const res = await fetch(`${BASE}/ar/account`, {
      headers: { cookie: `carsell_session=${cookie}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return 0;
    const html = await res.text();
    /**
     * **والعلامةُ من محتوى القسم لا من اسمه.** «طلباتي» و«تقارير
     * الفحص» أسماءٌ في قائمة «أقسام حسابي» تظهر لكلّ حساب، فعدُّها
     * يُعطي ثلاثةً لحسابٍ فارغ — واخترتُ به أفقرَ الحسابات.
     */
    return ['سعرك المعلن', 'تفاصيل', 'INS-'].filter((mark) => html.includes(mark)).length;
  } catch {
    return 0;
  }
}

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
      if (probe.status === 200 && (await accountRichness(cached)) > 0) {
        USER_COOKIE = cached;
        return;
      }
    }
  } catch {
    /* لا جلسة محفوظة — يُطلب رمزٌ جديد */
  }

  /**
   * ═══ والحسابُ يُختار بما يعرضه لا برقمه ═══
   *
   * `Wf` يرسم صفحةً فيها «طلباتي» و«العروض الواردة على مركباتك»
   * و«تقارير الفحص». وحسابٌ ثابتٌ في الأداة قد لا يملك واحدًا منها،
   * فتُقاس شاشةٌ تُخفي أقسامَها **بحقّ** ويُقرأ ذلك نقصَ بناء.
   *
   * فتُجرَّب حساباتُ البائعين ويُؤخذ أغناها بما يرسمه التصميم.
   */
  if (process.env.AUDIT_PHONE === undefined) {
    let best = { cookie: '', score: 0 };
    for (let i = 0; i < 5; i += 1) {
      const candidate = await signInPhone(`+9665${String(10000000 + i).padStart(8, '0')}`);
      if (candidate === null) continue;
      const score = await accountRichness(candidate);
      if (score > best.score) best = { cookie: candidate, score };
      /** الثلاثةُ كلُّها ⇒ لا حاجة إلى المزيد. */
      if (best.score >= 3) break;
    }
    if (best.cookie !== '') {
      USER_COOKIE = best.cookie;
      try {
        writeFileSync(SESSION_FILE, best.cookie, 'utf8');
      } catch {
        /* الحفظ تحسينٌ لا شرط */
      }
      if (best.score < 3) {
        console.log(
          `⬜ أغنى حساب يعرض ${String(best.score)} من ثلاثة أقسام — وما لا يُزرع لا يُقاس.`,
        );
      }
      return;
    }
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
    console.log(
      `⬜ تعذّر دخول المستخدم على ${BASE} (${error instanceof Error ? error.message : 'fetch'}) — شاشاته لن تُقاس.`,
    );
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

  /** لوحة التاجر — §40b، لا مسار بعد. تُملأ شاشةً شاشةً وهي تُبنى. */
  D1: null, D2: null, D3: null, D4: null, D5: null, D6: null,
  D7: null, D8: null, D9: null, D10: null, D11: null,
};

/**
 * ═══ المصمَّم الذي لم يُبنَ ═══
 *
 * يُفصل عن المؤجَّل: المؤجَّل قرارُ مالكٍ يخرج من الحساب كلّه، وهذا
 * **دَينٌ معلوم** — يُعدّ ويُسمّى ولا يُخلط بنسبة المطابقة، فتبقى
 * النسبة جوابَ سؤالٍ واحد.
 */
/**
 * ═══ وما لا يصله الجلب لا يُقرأ صفرًا ═══
 *
 * `Wh` معالجُ البيع: خطواتُه تُصيَّر في العميل، فنصوصُها في الحمولة
 * لا في الترميز — و`stripTags` تُسقط الحمولة بحقّ. فقُرئت **٠٪**
 * وفيها «الغلاف» و«احفظ كمسودة» و«طريقة البيع» كلُّها مبنيّة
 * (قِيست في `ar.json` وفي الحمولة).
 *
 * و`A14` محرّرُ الفئة: مسارُه `/admin/catalog/trims/<معرّف>`، ولا
 * معرّفَ في صفحة الطرازات — الشجرة تُجلب بعد نقرة. فقُرئت **٤٠٤**.
 *
 * **والبحث في الحمولة الخام ليس علاجًا**: ظهورُ الاسم لا يعني أنّ
 * أحدًا يراه، وهو الفخّ الذي أُغلق في البوابتين ٥٠ و٥٢. فتُعلَنان
 * «تُمشى» وتخرجان من النسبة — والمشي بالمتصفّح هو قياسُهما.
 */
const WALK_ONLY = new Set(['Wh', 'A14']);

const NOT_BUILT = new Set([
  'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11',
]);

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
  /**
   * المقارنة و٣٦٠° والمراسلة — **أُزيلت بقرار المصمّم ١٨**
   * (`DESIGN-DECISIONS.md`): «المراسلة تحتاج إشرافًا وسياسة محتوى —
   * لا تُفتح بزر». فعدُّها نقصًا يُرسل القارئ ليعيد ما حُذف عمدًا.
   */
  'راسلـه', 'راسل البائع', 'قارن', 'المقارنة', '٣٦٠',
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

/**
 * ═══ ويُقارَن بعد التطبيع — وإلّا قِيس قرارٌ لا نقص ═══
 *
 * قُرئت `A10` **١٣٪** ففتحتُها، فإذا هي الشاشة كاملةً: جدولُ القنوات
 * بأعمدته، ومعاينةُ الجهاز بحدودها، وقائمةُ القواعد. وإنما فشلت
 * المطابقة على فروقٍ **كلُّها قرارٌ مسجَّل**:
 *
 *   · **التشكيل** — التصميم «حرِجة» والمنتج «حرجة» (القرار ١٥،
 *     ٢٠٢٦-١٠-١٨: يُمسح من كل شاشة). و١٤٪ من نصوص التصميم مشكولة.
 *   · **الأرقام** — التصميم «٤٠ حرفًا» والمنتج «40 حرفا»
 *     (قرارُ ٢٠٢٦-١٠-١٢: تُوحَّد لاتينيّةً).
 *   · **الاسم** — التصميم `carsell.one` والمنتج `CARZ`.
 *
 * فكان المقياس يعدّ قراراتِ المالك نقصًا في التنفيذ، **ويُرسل قارئَه
 * ليعيد ما نُقض عمدًا**. والرقمُ الناتج لا يقيس مطابقةً فلا يُبنى عليه.
 *
 * والتطبيع على **الطرفين** — ولو طُبّع أحدهما لصار الفحص أعمى من جهة.
 */
export function normalizeText(value) {
  return value
    /* التشكيل — القرار ١٥ */
    .replace(/[ً-ْٰ]/g, '')
    /* الأرقام — قرار ٢٠٢٦-١٠-١٢، والفواصل معها */
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٬/g, ',')
    .replace(/٫/g, '.')
    /* الاسم بعد تغيير العلامة */
    .replace(/carsell\.one/gi, 'CARZ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * **وإشارةٌ كلُّها رقمٌ قيمةُ بياناتٍ لا بنية.** «٩٬٣٢٠ جهازًا مسجّلًا»
 * رقمٌ في ترميز التصميم، ولا يُطابقه إلا أن تحمل قاعدتُنا العدد نفسَه.
 * فعدُّه نقصًا يقيس البذرة لا الشاشة.
 */
export function isDataValue(signal) {
  const bare = normalizeText(signal).replace(/[\d,.\s٪%]/g, '');
  return bare.length <= 3;
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

/**
 * ═══ ومركبةٌ محجوزة لا تُقاس عليها صفحةُ الشراء ═══
 *
 * `Wc` كان يُقاس على `ADS2026A0032` ثابتًا — **وهو اليوم محجوزٌ بطلبٍ
 * قائم**. فالصفحة تُخفي «اشترِ الآن» و«قدّم عرضك» بحقّ وتقول «محجوزة»،
 * ويُقرأ ذلك نقصًا في المطابقة: ٤١٪ وناقصُها فعلا الشراء.
 *
 * **ومرجعٌ ثابتٌ في أداة قياسٍ يتعفّن مع البيانات.** فيُؤخذ من الموقع
 * نفسه: أوّل مركبةٍ في نتائج البحث معروضةٌ بالضرورة.
 */
async function liveRefs(base, cookie) {
  const out = {};
  const grab = async (listPath, into) => {
    try {
      const res = await fetch(`${base}${listPath}`, {
        headers: { cookie },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return;
      const html = await res.text();
      const found = [
        ...html.matchAll(/href="(\/ar\/cars\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+\/[A-Z0-9]+)"/g),
      ].map((m) => m[1]);

      /**
       * **ومركبةٌ عليها طلبٌ قائم تبقى في النتائج** (قرارُ منتَج: قد
       * يسقط الطلب فتعود) — وصفحتُها تُخفي «اشترِ الآن» بحقّ وتقول
       * «محجوزة». فأوّلُ نتيجةٍ قد تكون محجوزة، وقياسُ صفحة الشراء
       * عليها يُخرج نقصًا ليس فيها.
       */
      for (const path of [...new Set(found)].slice(0, 8)) {
        const page = await fetch(`${base}${path}`, {
          headers: { cookie },
          signal: AbortSignal.timeout(30_000),
        });
        if (!page.ok) continue;
        if (!(await page.text()).includes('طلبٌ قائم')) {
          out[into] = path;
          return;
        }
      }
    } catch {
      // تعذّر الجلب — يبقى المرجع الثابت
    }
  };
  await grab('/ar/cars', 'Wc');
  await grab('/ar/auctions', 'We');
  return out;
}

async function main() {
  const wanted = process.argv.slice(2);
  const files = [
    ['design/Admin.dc.html', /id="(A\d{1,2})"/g],
    ['design/Front-end Web.dc.html', /id="(W[a-z]\d?[a-z]?\d?)"/g],
    /**
     * ═══ وما لا يقرؤه المقياس لا يعدّه ═══
     *
     * لوحةُ التاجر إحدى عشرة شاشة مرسومة، وكان الملفّ خارج القائمة
     * أصلًا — فالتقرير يقول «المجموع ٨٧٪» ولا يذكر أنّ **ربع ما
     * صُمِّم ليس فيه**. وهو صنفُ البوابة ٦١ نفسُه: تحرس ما تقرؤه لا
     * ما تظنّ أنها تحرسه.
     *
     * فتُقرأ، وتُعلَن في سطرها، وتخرج من نسبة المطابقة — السؤالان
     * مختلفان: «أيطابق المبنيُّ تصميمَه؟» و«أبُني كلُّ ما صُمِّم؟».
     */
    ['design/Dealer.dc.html', /id="(D\d{1,2})"/g],
  ];

  const rows = [];
  /** مراجعُ حيّة من الموقع — تُغني عن ثابتٍ يتعفّن مع البيانات */
  const liveRoutes = await liveRefs(BASE, '');
  /**
   * وصفحةُ الطلب مرجعُها من حساب مشترٍ له طلب — يُكتشف لا يُكتب.
   *
   * **و`AUDIT_ORDER` يُبدّل المرجعَ لا الجلسة.** كتبتُها أوّلًا
   * `AUDIT_ORDER ?? findOrderRoute()`، فتمريرُ مرجعٍ بيدٍ يتخطّى دخولَ
   * المشتري — فتُطلب صفحةُ طلبٍ بجلسة بائع وتردّ ٤٠٤ بحقّ، ويُقرأ ذلك
   * «الصفحة ساقطة». فالدخول يقع دائمًا، والمتغيّر يختار المرجع بعده.
   */
  const discovered = await findOrderRoute();
  const orderRoute = process.env.AUDIT_ORDER ?? discovered;
  if (typeof orderRoute === 'string' && orderRoute !== '') liveRoutes.Wj = orderRoute;

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

      const route = liveRoutes[tag] ?? ROUTES[tag];
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
        : BUYER_SCREENS.has(tag) && BUYER_COOKIE !== ''
          ? `carsell_session=${BUYER_COOKIE}`
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
      const normalized = normalizeText(text);
      const missing = live.filter(
        (s) => !isDataValue(s) && !normalized.includes(normalizeText(s)),
      );

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

      const counted = live.filter((s) => !isDataValue(s));
      rows.push({
        tag, route,
        total: counted.length,
        found: counted.length - missing.length,
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
  const notBuilt = [];
  const walkOnly = [];
  console.log('الشاشة  المسار                          مطابق   الناقص');
  for (const row of rows) {
    /** ما لم يُقَس لا يدخل المقام — ولا يُقرأ صفرًا. */
    if (NOT_BUILT.has(row.tag)) {
      notBuilt.push(row.tag);
    } else if (WALK_ONLY.has(row.tag)) {
      walkOnly.push(row.tag);
    } else if (row.failed !== undefined) {
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
      NOT_BUILT.has(row.tag)
        ? '⬜ مصمَّمة ولم تُبنَ'
        : WALK_ONLY.has(row.tag)
        ? '↪ تُمشى بالمتصفّح'
        : row.failed !== undefined
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
  if (walkOnly.length > 0) {
    console.log(
      `تُقاس بالمشي لا بالجلب (محتواها خلف نقرة): ${walkOnly.join(' · ')}`,
    );
  }
  if (notBuilt.length > 0) {
    console.log(
      `مصمَّمةٌ ولم تُبنَ بعد (§40b — دَينٌ لا نقصُ مطابقة): ${String(notBuilt.length)} شاشة · ${notBuilt.join(' ')}`,
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
