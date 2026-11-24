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
/** حروفُ وصلٍ لا تحمل معنًى في مطابقة الأسماء. */
const FILLER = new Set(['في', 'من', 'إلى', 'على', 'و', 'أو', 'مستعملة', 'جديدة', 'سيارات']);

/**
 * أسماءُ الماركات والطرازات — **تُملأ من المنتج عند أوّل قياس**، فلا
 * تتقادم كقائمةٍ مكتوبة بيد.
 */
const CATALOGUE_NAMES = new Set();

/**
 * أقلُّ عددِ إشاراتٍ تُقرأ منه نسبةٌ — ودونَه يُعلَّم السطر.
 *
 * **ثمانٍ ليست عتبةَ جودة بل عتبةَ معنى**: على أربعٍ يساوي غيابُ واحدةٍ
 * خمسةً وعشرين بالمئة، فتتحرّك النسبةُ بصفٍّ في القاعدة لا ببناءٍ في
 * الشاشة.
 */
const SIGNAL_FLOOR = 8;

/**
 * **والبابُ بابُ المشروع.** كان الافتراضيّ ٣٠٠٢ و`.claude/launch.json`
 * يُشغّل الخادم على ٣٠٠٠، فتطرق الأداةُ بابًا مغلقًا وتطبع «٠/٠ — ٠٪»
 * — سطرٌ يُقرأ نتيجةً وهو غيابُ نتيجة. فيُقرأ المنفذ من إعداد المشروع،
 * و`AUDIT_BASE` تبقى تتقدّم عليه لمن يقيس بناءً آخر.
 */
const LAUNCH_PORT = (() => {
  try {
    const launch = JSON.parse(readFileSync('.claude/launch.json', 'utf8'));
    const port = launch.configurations?.find((entry) => entry.port != null)?.port;
    return typeof port === 'number' ? port : 3000;
  } catch {
    return 3000;
  }
})();
const BASE = process.env.AUDIT_BASE ?? `http://localhost:${String(LAUNCH_PORT)}`;
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
    /**
     * **والعلاماتُ لا تتساوى.** عدٌّ مجرَّد يجعل حسابًا فيه «تفاصيل»
     * و«INS-» يساوي حسابًا فيه «سعرك المعلن» و«تفاصيل» — فيُؤخذ أوّلُهما
     * ويُقرأ `Wf` ٥٦٪، **وأربعٌ من نواقصها الخمس من كتلة العروض وحدها**
     * (سعرك المعلن · اقبل · عرض مقابل · دون الاحتياطي). فتُرجَّح بما
     * تفتحه من إشارات.
     */
    const marks = [
      ['سعرك المعلن', 2],
      ['تفاصيل', 1],
      ['INS-', 1],
    ];
    return marks.reduce((sum, [mark, weight]) => sum + (html.includes(mark) ? weight : 0), 0);
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
      /**
       * **والمحفوظُ يُقبل إن كان أغنى ما يُرجى لا إن كان غيرَ فارغ.**
       * `> 0` تُبقي جلسةً ترسم قسمًا واحدًا بينما في القاعدة حسابٌ يرسم
       * الثلاثة — فتُقرأ `Wf` ناقصةً والنقصُ في الحساب المختار. وبعد كلّ
       * زرعٍ جديد تتبدّل الحسابات، فيصير المحفوظُ أفقرَ بلا أن يقول.
       */
      /**
       * **وثلاثٌ كافية، وأربعٌ نادرة.** اشتراطُ الكمال يرفض كلَّ جلسةٍ
       * محفوظة فيُعاد مسحُ اثني عشر حسابًا بـOTP في كلّ تشغيل — حتى
       * يردّ حدُّ الطلبات، فتُقاس شاشاتُ الحساب «بلا جلسة» ويخرج
       * القياسُ ناقصَ المقام. وثلاثٌ تعني كتلةَ العروض (نقطتان) وقسمًا
       * آخر — وهي أغنى ما تبلغه البذرة.
       */
      if (probe.status === 200 && (await accountRichness(cached)) >= 3) {
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
    /**
     * **ويُوسَّع المسح حتى يوجد الغنيّ.** خمسةُ حساباتٍ قد لا يكون في
     * أيٍّ منها عرضٌ وارد، فتُقاس `Wf` على أفقر ما وُجد وتُقرأ ٥٦٪ —
     * وكانت ٨٩٪ قبل زرعٍ بدّل ترتيب الحسابات. والبحثُ يقف عند أوّل
     * حسابٍ يرسم الثلاثة، فتوسيعُه لا يكلّف شيئًا حين يوجد مبكّرًا.
     */
    let best = { cookie: '', score: 0 };
    for (let i = 0; i < 12; i += 1) {
      const candidate = await signInPhone(`+9665${String(10000000 + i).padStart(8, '0')}`);
      if (candidate === null) continue;
      const score = await accountRichness(candidate);
      if (score > best.score) best = { cookie: candidate, score };
      /** كتلةُ العروض وقسمٌ آخر ⇒ لا حاجة إلى المزيد. */
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
          `⬜ أغنى حساب يبلغ ${String(best.score)} من أربع (كتلة العروض بنقطتين) — وما لا يُزرع لا يُقاس.`,
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
  /**
   * ═══ والشاشةُ تُقاس في الحال التي رُسمت فيها ═══
   *
   * ترميز `Wb` عنوانُه «نتائج البحث — **فلاتر مرافقة**»، وكلُّ ما
   * يميّزه لا يوجد إلّا في بحثٍ مُجرى: شارات الفلاتر المفعّلة، وشريط
   * «فُهم كالتالي»، والعنوان المركَّب («سيارات تويوتا كامري مستعملة في
   * الرياض»)، وكتلةُ «عن أسعار…» وبحوثُها الشقيقة — وكلُّها مبنيّ.
   *
   * وكان يُقاس على `/ar/cars` عاريًا فخرج **٤٤٪**: فهرسٌ بلا بحث،
   * تختفي فيه نصفُ الشاشة بحقّ. وهو خطأُ القياس الذي سجّلناه في
   * `A10`: **مقياسٌ يَعُدّ حالةً أخرى نقصًا**.
   *
   * ═══ والجملةُ تُختار بسعتها لا بنصّها ═══
   *
   * أخذتُ جملةَ الترميز حرفيًّا («كامري مستعملة في الرياض») فردّت
   * **سيارتين** على بياناتنا — فاختفت بطاقةُ المموّل (موضعُها «بعد كل
   * ٦ نتائج») واختفى «أعلى مزايدة» إذ لا مزادَ فيهما. **فقِيست شاشةٌ
   * في حالةٍ لا تسعها.**
   *
   * فالجملةُ أوسع، والشرطُ أن تُخرج ما يُخرجه الترميز: شاراتِ فلترٍ
   * مفعَّل، وشريطَ فهم، وعنوانًا مركَّبًا، ونتائجَ تتجاوز موضعَ
   * المموّل، ومزادًا بينها.
   */
  Wb: `/ar/cars?q=${encodeURIComponent('مستعملة في الرياض')}`,
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
  /**
   * **ومسارُ `Wz` مسارُ الطراز لا الماركة.** ترميزُها يرسم المسار
   * «الرئيسية › تصفّح السيارات › تويوتا › **كامري** › الرياض»
   * وعنوانَها «سيارات تويوتا كامري مستعملة في الرياض»، وفيها شرائحُ
   * فئاتِ الطراز. وصفحةُ الماركة أعمُّ منها ولا فئاتِ فيها — فقُرئت
   * «كل الفئات» ناقصةً وهي على الصفحة التي تخصّها.
   */
  Wz: '/ar/browse/riyadh/toyota/camry',
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

/**
 * ═══ إشاراتٌ خلف نقرةٍ في شاشةٍ تُجلَب ═══
 *
 * بعضُ الشاشات تُجلَب حالتُها الأولى ويبقى بعضُ ترميزها خلف فعل:
 * `Wm` يرسم حقلَ الجوال **وحالةَ رمز التحقّق معًا** في كتلةٍ واحدة،
 * والثانيةُ لا تظهر إلّا بعد «أرسل رمز التحقق». فجلبُ المسار يقرؤها
 * ناقصةً إلى الأبد مهما بُنيت.
 *
 * و`WALK_ONLY` لا تصلح لها: تُخرج الشاشةَ كلَّها من المقام، فتذهب
 * حالتُها الأولى المقيسة معها.
 *
 * **والخطرُ أن تصير هذه القائمةُ مخبأً** — فكلُّ ما فيها يُطبع في ذيل
 * التقرير بصاحبه، ولا يُسكَت عنه. ولا يدخلها إلّا ما **مُشي بالمتصفّح
 * وشوهد**: هذه الثلاثُ قِيست في ٢٠٢٦-١١-٢٤ بطلب رمزٍ وقراءة الشاشة.
 */
const BEHIND_CLICK = {
  Wm: ['الخطوة التالية', 'إعادة الإرسال بعد'],
};

/**
 * ═══ ما قُرّر ألّا يُبنى — خامسُ الانحرافات ═══
 *
 * `A35` تُقرأ ٥٦٪ وأربعُ «نواقصها» كلُّها **قراراتٌ مسجَّلة** في
 * `docs/DESIGN-DEVIATIONS.md`: الثنائيةُ أُلغيت بقرار المصمّم، والتعيينُ
 * من `ADMIN_TEAM` عند الإقلاع قرارٌ أمنيّ (فمن سرق جلسةً لا يصنع لنفسه
 * حسابًا ثانيًا)، ولا نموذجَ `Invite` فبطاقةُ الدعوات لا تقرأ إلّا صفرًا.
 *
 * **ورقمٌ يعدّ هذه نقصًا يُرسل قارئَه ليبني ما قيل له ألّا يبنيه** — وهو
 * عينُ ما وقع في `A10` و`A3`: المقياس يقرأ القرار عيبًا. وكِدتُ أنا أبني
 * «أضف عضوًا» حتى قرأتُ السجلّ.
 *
 * والمطابقةُ **تامّة** لا احتواء، والقائمةُ تُطبع في ذيل التقرير بأسبابها
 * فلا تصير مخبأً — و`tests/design-deviations.test.ts` يشترط أن يكون لكلّ
 * مُدخَلٍ هنا سطرٌ في السجلّ، فلا يُستثنى شيءٌ بلا سببٍ مكتوب.
 */
const DECIDED_AGAINST = {
  A35: [
    ['TOTP مسجَّل', 'أُلغيت المصادقة الثنائية بقرار المصمّم'],
    ['إلزاميّ بلا استثناء', 'من بطاقة TOTP نفسها'],
    ['أضف عضوًا', 'التعيين من ADMIN_TEAM عند الإقلاع — قرار أمنيّ'],
    ['دعوات معلّقة', 'لا نموذج Invite — بطاقةٌ لا تقرأ إلّا صفرًا'],
  ],
};

/**
 * ═══ شاشاتٌ عامّةُ المسار يرسمها التصميم داخل الحساب ═══
 *
 * الجلسةُ تُرسَل إلى ما لا يُفتح بدونه — والقاعدة صحيحة: أرسلتُها إلى
 * كل مسارٍ مرّةً فاختفت «تسجيل الدخول» من الرئيسية، فقرأتُ نقصًا صنعه
 * القياس. **لكنّ المِصفاة بالبادئة تُخطئ في الاتّجاه الآخر**: `Wx`
 * مسارُها عامّ ويرسمها التصميم بزائرٍ داخل حسابه ومركبةٍ مختارة.
 *
 * فقُرئت ٤٠٪، وثلاثةٌ من خمس «ناقصة» **مبنيّةٌ كلُّها** — تظهر لمن
 * يدخل. والقائمةُ تُطبع في الذيل فلا تصير مخبأً.
 */
const SIGNED_IN_SCREENS = new Set(['Wx']);

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
/**
 * ═══ مصطلحاتُ اللوحة — رابعُ الانحرافات بقرار المالك ═══
 *
 * قرارُ ٢٠٢٦-١٠-١١: «بعض العبارات والكلمات غير مفهوم المقصد منها مثلًا
 * مدرج». فـ«مدرج الطيران» و«نسبة الأخذ» و«LTV / CAC» ترجماتٌ لمصطلحاتٍ
 * استثمارية يعرفها من قرأ أدبيّات الشركات الناشئة بالإنجليزية ولا
 * يعرفها مشغّلُ اللوحة — **وكلُّها مكتوبةٌ في التصميم حرفيًّا**.
 *
 * فكان المقياس يقرأ القرارَ نقصًا، كما كان يفعل بالتشكيل والأرقام
 * والعلامة. والجدولُ الكامل في `docs/NOTES.md` تحت «مصطلحات اللوحة».
 *
 * **ولا يُخفي غيابًا**: الخريطةُ تُبدّل نصَّ **التصميم** إلى صياغتنا
 * ثمّ يُبحث عنها في الشاشة — فبطاقةٌ محذوفةٌ تبقى ناقصة.
 */
const OWNER_TERMS = [
  ['تكلفة الاكتساب CAC', 'تكلفة جلب العميل'],
  ['القيمة الدائمة LTV', 'ما يدره العميل'],
  ['LTV / CAC', 'ما يدره العميل مقابل تكلفته'],
  ['نسبة الأخذ', 'حصة المنصة'],
  ['فترة الاسترداد', 'كم شهرا حتى يغطي العميل تكلفته'],
  ['مدرج الطيران', 'النقد يكفي'],
  ['صافي الحرق', 'العجز الشهري'],
  ['رسوم عبور', 'رسوم تمر إلى غيرنا'],
  ['هامش المساهمة', 'ما يبقى من العميل بعد كلفته'],
];

export function normalizeText(value) {
  return value
    /* التشكيل — القرار ١٥ */
    .replace(/[ً-ْٰ]/g, '')
    /* الأرقام — قرار ٢٠٢٦-١٠-١٢، والفواصل معها */
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٬/g, ',')
    .replace(/٫/g, '.')
    /*
     * ═══ الاسم بعد تغيير العلامة — **وله رسمان** ═══
     *
     * التصميم يكتب `carsell.one` حيثما وقع. والمنتج بعد الرِّدَّة
     * يكتب `CARZ` في السياق اللاتينيّ **و«كارز» في النثر العربيّ**
     * («ليه تشتري من كارز؟» · «فريق كارز») — وهو الرسمُ الصحيح، إذ
     * لاتينيٌّ داخل جملةٍ عربية يقطعها.
     *
     * فكان المقياس يعرف واحدًا، فيقرأ «في كارز» نقصًا عن
     * «في carsell.one» — **وهو الاسمُ نفسُه بحروفه**.
     */
    .replace(/carsell\.one/gi, 'CARZ')
    .replace(/\u0643\u0627\u0631\u0632/g, 'CARZ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** يُبدّل مصطلحَ التصميم بصياغة المالك — على نصّ التصميم وحده. */
export function ownerWording(value) {
  let out = value;
  for (const [design, ours] of OWNER_TERMS) out = out.split(design).join(ours);
  return out;
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
    /*
     * ═══ والموضعُ قيمةٌ ولو تركّب ═══
     *
     * الفحصُ كان على **بداية** الإشارة وعلى اسم المدينة **وحده**،
     * فمرّت «الرياض · حي الملقا» و«الدمام · الكورنيش»: تبدأ بمدينةٍ
     * لا بـ«حي»، وليست اسمَ مدينةٍ مجرّدًا. وهي عناوينُ معارضَ اخترعها
     * التصميم — ستُّ إشاراتٍ من عشر في `Wp`، **فقُرئت الشاشةُ ٤٠٪ وهي
     * مبنيّةٌ كاملة**.
     *
     * فالقاعدةُ على الأجزاء: إشارةٌ **كلُّ أجزائها** موضعٌ هي موضع.
     * وجزءٌ واحدٌ بنيويّ يُبقيها مقيسة («الرياض ١٨» لو لم تحمل رقمًا).
     */
    const PLACE = /^(حي |طريق |شارع |معرض |صالة |مركز )/;
    const isPlace = (part) => {
      const word = part.trim();
      return word !== '' && (PLACE.test(word) || CITY_NAMES.has(word));
    };
    const parts = s.split('·').map((part) => part.trim());
    if (parts.every((part) => isPlace(part))) return false;

    /*
     * **والمدينةُ تُرسي ما بعدها.** «الكورنيش» و«العزيزية» و«قربان»
     * أحياءٌ بلا كلمة «حي»، فلا نمطَ يعرفها — ولا تُكتب في قائمةٍ
     * بيدٍ تتقادم. لكنّ ما قبلها يُعرف: بطاقةُ `Wp` تطبع «مدينة ·
     * حيّ»، **فمدينةٌ معروفة يتلوها جزءٌ واحد موضعٌ**.
     */
    if (parts.length === 2 && CITY_NAMES.has(parts[0] ?? '')) return false;

    /**
     * ═══ والزمنُ النسبيّ قيمةٌ وإن لم يحمل رقمًا ═══
     *
     * «قبل يومين» و«قبل أسبوعين» و«قبل شهر» تمرّ من مرشّح الأرقام
     * **لأنّ العربية تسمّي المثنّى والمفرد بالحروف** — فعُدَّت بنيةً،
     * وهي ناتجُ `<Duration>` على تاريخِ صفّ. ولن تطابق أبدًا: نُشر
     * إعلانُ التصميم «قبل يومين» ونُشر إعلانُنا قبل ثلاثة أسابيع.
     */
    if (/^(قبل|منذ|خلال|بعد)\s/.test(s)) return false;

    /**
     * ═══ وأسماءُ الكتالوج بياناتٌ كأسماء المدن ═══
     *
     * «كامري هايبرد» و«تويوتا أفالون الرياض» و«لكزس ES الرياض» عناوينُ
     * بحوثٍ شقيقة **تُبنى من ماركاتِ القاعدة وطرازاتها**: التصميم
     * اخترع كتالوجَه، ونحن نبني من كتالوجنا. فمطابقتُها حرفًا بحرف
     * تقيس تطابقَ قائمتي سيارات لا تطابقَ شاشتين.
     *
     * **والقائمةُ تُجلَب من المنتج لا تُكتب بيد** — فلا تتقادم مع
     * الكتالوج (وقد اتّسع من ٧٣ طرازًا إلى ٢٣٠).
     */
    if (CATALOGUE_NAMES.size > 0) {
      const words = normalizeText(s).split(/\s+/).filter((w) => w !== '');
      if (words.length > 0 && words.every((w) => CATALOGUE_NAMES.has(w) || CITY_NAMES.has(w) || FILLER.has(w))) {
        return false;
      }
    }

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
      /**
       * **وتُختار الحالُ التي يرسمها الترميز لا أوّلُ ما وُجد.** `Wc`
       * يرسم مركبةً تُشترى **وتُفاوَض** معًا، وأوّلُ نتيجةٍ قد تكون
       * `DIRECT` بلا تفاوض — فيُقرأ «قدّم عرضك» نقصًا وهو غائبٌ بحقّ
       * عن إعلانٍ لا يقبل العروض. فتُجرَّب المرشّحات ويُؤخذ أغناها
       * بما يرسمه التصميم، كما في اختيار حساب `Wf`.
       */
      let best = { path: '', score: -1 };
      for (const path of [...new Set(found)].slice(0, 8)) {
        const page = await fetch(`${base}${path}`, {
          headers: { cookie },
          signal: AbortSignal.timeout(30_000),
        });
        if (!page.ok) continue;
        /**
         * **ويُطبَّع الطرفان هنا كما يُطبَّعان في المطابقة.** كُتب فحصُ
         * «طلبٌ قائم» بالتشكيل الذي يكتبه التصميم، والمنتج يمسحه (قرار
         * ١٥) فيعرض «طلب قائم» — **فما كان الفحص يُمسك مركبةً محجوزة
         * قطّ** منذ نفاذ القرار، وتُقاس صفحةُ الشراء على مركبةٍ تُخفي
         * زرَّيها بحقّ فتُقرأ ٥٠٪.
         */
        const seen = normalizeText(stripTags(await page.text()));
        if (seen.includes(normalizeText('طلبٌ قائم'))) continue;

        const score = ['اشترِ الآن عبر الضمان', 'قدّم عرضك', 'من البائع'].filter((mark) =>
          seen.includes(normalizeText(mark)),
        ).length;
        if (score > best.score) best = { path, score };
        if (best.score === 3) break;
      }
      if (best.path !== '') {
        out[into] = best.path;
        return;
      }
    } catch {
      // تعذّر الجلب — يبقى المرجع الثابت
    }
  };
  await grab('/ar/cars', 'Wc');
  await grab('/ar/auctions', 'We');
  return out;
}

/**
 * ═══ أسماءُ الكتالوج من المنتج نفسِه ═══
 *
 * «كامري هايبرد» و«تويوتا أفالون الرياض» عناوينُ بحوثٍ شقيقة تُبنى من
 * ماركاتِ القاعدة وطرازاتها. ومطابقتُها حرفًا بحرف تقيس **تطابقَ
 * كتالوجين** لا تطابقَ شاشتين: التصميم اخترع سياراته، ونحن نعرض ما في
 * قاعدتنا.
 *
 * **والقائمةُ تُجلَب من المنتج لا تُكتب بيد** — فلا تتقادم مع الكتالوج
 * (وقد اتّسع من ٧٣ طرازًا إلى ٢٣٠ في جلسةٍ واحدة).
 *
 * وفشلُ الجلب يترك المجموعة فارغة والمرشّحُ يتخطّى نفسَه — فلا يسكت
 * القياسُ عن إشارةٍ حقيقية بسبب شبكةٍ متعثّرة.
 */
async function fillCatalogueNames(base) {
  if (ADMIN_COOKIE === '') return;
  const headers = { cookie: `carsell_admin=${ADMIN_COOKIE}` };
  const add = (name) => {
    for (const word of String(name).trim().split(/\s+/)) {
      if (word !== '') CATALOGUE_NAMES.add(normalizeText(word));
    }
  };

  try {
    const res = await fetch(`${base}/api/v1/admin/brands`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return;
    const body = await res.json();
    const brands = Array.isArray(body?.data) ? body.data : [];

    for (const brand of brands) {
      add(brand.nameAr ?? '');
      add(brand.nameEn ?? '');
    }

    /* والطرازاتُ لكلّ ماركة — ولا مسار يسردها كلَّها دفعةً. */
    const models = await Promise.all(
      brands.map(async (brand) => {
        try {
          const page = await fetch(
            `${base}/api/v1/admin/models?brandId=${encodeURIComponent(String(brand.id))}`,
            { headers, signal: AbortSignal.timeout(30_000) },
          );
          if (!page.ok) return [];
          const json = await page.json();
          return Array.isArray(json?.data) ? json.data : [];
        } catch {
          return [];
        }
      }),
    );

    for (const row of models.flat()) {
      add(row.nameAr ?? '');
      add(row.nameEn ?? '');
    }


    /*
     * ═══ ولا تُحصَد المفرداتُ من ترميز الصفحة ═══
     *
     * جرّبتُ أن أقرأ أسماءَ الفئات من عناوين البطاقات (`<h3>`) لأبلغ
     * «هايبرد» بلا نداءٍ لكلّ طراز — **فالتقطت عناوينَ الفلاتر**:
     * «حالة المركبة» و«السعر» و«الماركة والطراز» و«سنة الصنع».
     *
     * وهي الإشاراتُ التي يقيسها هذا المقياس بعينها. فكنتُ أُسقطها من
     * المقام باسم «بيانات» — **مقياسٌ يُعمي نفسَه ويُخرج نسبةً أعلى**،
     * وهو أسوأ من مقياسٍ ناقص. و`/api/v1/trims` يشترط `modelId` فجلبُه
     * مئتا نداء، فتبقى أسماءُ الفئات غيرَ مُدرَكة ويبقى ذلك مُعلنًا.
     */
  } catch {
    // تعذّر الجلب — المرشّح يتخطّى نفسه
  }
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
  await fillCatalogueNames(BASE);
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
      /**
       * **وليست كلُّ شاشةٍ تحتاج جلسةً تحت هذه البادئات.** `Wx`
       * مسارُها `/ar/services/{key}` — عامٌّ بحقّ — **والتصميم يرسمها
       * داخل الحساب**: اسمُ الزائر في الترويسة، ومركبةٌ مختارة، ثمّ
       * «الموقع والموعد» و«ادفع واطلب». فجلبُها خارجَ الحساب يُعيد
       * الحالةَ الفارغة («لا مركبة في حسابك بعد») — وقُرئت ٤٠٪ **وما
       * نقص منها مبنيٌّ كلُّه**.
       *
       * والقائمةُ مطبوعةٌ في ذيل التقرير كـ`BEHIND_CLICK`: قائمةٌ
       * تُقرَّر فيها حالُ القياس لا تُترك مخبأً.
       */
      const needsUser =
        /^\/[a-z]{2}\/(account|sell|orders|inbox|checkout)\b/.test(route)
        || SIGNED_IN_SCREENS.has(tag);

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
      /** وكذلك ما يقع خلف نقرةٍ في شاشةٍ تُجلَب حالتُها الأولى وحدها. */
      const behind = BEHIND_CLICK[tag] ?? [];
      const decided = (DECIDED_AGAINST[tag] ?? []).map(([word]) => word);
      const live = signals.filter(
        (signal) =>
          !DEFERRED_SIGNALS.some((word) => signal.includes(word)) &&
          !decided.some((word) => normalizeText(word) === normalizeText(signal)) &&
          /*
           * **والمطابقةُ تامّة لا احتواء.** كتبتُ «رمز التحقق» في
           * القائمة فابتلعت **«أرسل رمز التحقق»** — وهو زرُّ الحالة
           * **الأولى**، أي الإشارةُ الوحيدة التي كانت تُقاس في هذه
           * الشاشة. فصار المقامُ صفرًا و«لا إشارات تُقاس»، والآليّةُ
           * التي وُضعت لتصحيح القياس أخفت ما كانت تقيسه.
           *
           * فالاحتواءُ يجعل كلَّ مُدخَلٍ قصيرٍ مِصْيَدةً لما يطوله.
           */
          !behind.some((word) => normalizeText(word) === normalizeText(signal)),
      );
      const normalized = normalizeText(text);
      const missing = live.filter(
        (s) =>
          !isDataValue(s) && !normalized.includes(normalizeText(ownerWording(s))),
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
  const unmeasured = [];
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
    } else if (row.total === 0) {
      /*
       * ═══ ومقامٌ صفرٌ ليس مطابقةً تامّة ═══
       *
       * كان `total === 0` يُقرأ **١٠٠٪**: شاشةٌ لا يستخرج منها المقياسُ
       * إشارةً — أو خرجت كلُّها مؤجَّلةً أو خلف نقرة — تُعلَن مطابقةً
       * كاملة. وهو أسوأ من رقمٍ ناقص: **الصفرُ في المقام يقول «لم
       * أقِس»، والتقريرُ كان يقول «تمام»**.
       *
       * ووقعت على `Wm` فورَ إعلان «خلف نقرة»: ثلاثُ إشاراتٍ كلُّها
       * خلفها، فبقي المقامُ صفرًا وقُرئ مئةً.
       */
      unmeasured.push(row.tag);
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
              : row.total === 0
                ? '⬜ لا إشارات تُقاس'
              : /*
                   ═══ ونسبةٌ من مقامٍ ضيّق ليست نسبة ═══

                   استخراجُ الإشارات يقرأ عناوينَ الأقسام والأزرار
                   ورؤوسَ الجداول بأنماطِ ترميزٍ بعينها. وشاشةٌ رُسمت
                   بأنماطٍ أخرى تُخرج أربع إشاراتٍ لا أربعين — فيصير
                   كلُّ غيابٍ ربعَ الشاشة، و«٢٥٪» تقرأ كأنّها قياس.

                   فيُعلَّم المقام الضيّق في سطره، ولا يُترك رقمًا
                   يُصدَّق. (وقِيس: `Wb` تُقرأ على أربع إشارات، وهي من
                   أغنى شاشات الموقع.)
                 */
                `${String(pct).padStart(3)}٪${row.total < SIGNAL_FLOOR ? ' ⚠' : ''}`;
    console.log(
      `${row.tag.padEnd(7)} ${row.route.padEnd(32)} ${mark}   ${row.missing.join(' · ')}`,
    );
  }
  const thin = rows.filter(
    (row) =>
      row.failed === undefined &&
      row.step === undefined &&
      row.empty !== true &&
      !NOT_BUILT.has(row.tag) &&
      !WALK_ONLY.has(row.tag) &&
      row.total > 0 &&
      row.total < SIGNAL_FLOOR,
  );

  const overall = totalSignals === 0 ? 0 : Math.round((totalFound / totalSignals) * 100);
  console.log(`\nالمجموع: ${totalFound}/${totalSignals} إشارة — ${overall}٪`);
  /**
   * **وما خرج خلف نقرةٍ يُقال بصاحبه** — وإلّا صارت القائمةُ مخبأً
   * يُنقص المقامَ بلا أن يعلم القارئ.
   */
  if (unmeasured.length > 0) {
    console.log(
      'لم تُقَس (لا إشارةَ يستخرجها المقياس من ترميزها — تُحكَم بقراءة الترميز): '
        + unmeasured.join(' '),
    );
  }

  if (SIGNED_IN_SCREENS.size > 0) {
    console.log(
      'قِيست داخل الحساب (يرسمها التصميم كذلك): ' + [...SIGNED_IN_SCREENS].join(' · '),
    );
  }

  const behindRows = Object.entries(BEHIND_CLICK);
  if (behindRows.length > 0) {
    console.log(
      'خلف نقرة (مُشيت بالمتصفّح وشوهدت — خارج المقام): '
        + behindRows.map(([tag, list]) => `${tag} (${list.join(' · ')})`).join(' · '),
    );
  }

  const decidedRows = Object.entries(DECIDED_AGAINST);
  if (decidedRows.length > 0) {
    console.log(
      'قُرّر ألّا يُبنى (خارج المقام — والسبب في DESIGN-DEVIATIONS): '
        + decidedRows
            .map(([tag, list]) => `${tag} (${list.map(([word]) => word).join(' · ')})`)
            .join(' · '),
    );
  }

  if (thin.length > 0) {
    console.log(
      `⚠ مقامٌ ضيّق (دون ${String(SIGNAL_FLOOR)} إشارات — النسبة تُقرأ ولا يُبنى عليها): `
        + thin.map((row) => `${row.tag} (${String(row.total)})`).join(' · '),
    );
  }
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
