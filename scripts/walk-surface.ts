/**
 * ═══ مشيُ السطح — كلُّ وجهةٍ وكلُّ رابطٍ فيها ═══
 *
 * **الاختبارات لا تفتح شاشة.** وكلُّ عطلٍ من صنف «صفحةٌ ناقصة» في هذا
 * المستودع وُجد بالنقر أو بـ`curl`، لا باختبار: نتائجُ بحثٍ بلا روابط،
 * وستُّ صفحات حساب كانت ٤٠٤ والحساب يربط إليها، و`/admin/ledger` تردّ
 * ٥٠٠ منذ بُنيت، وعدّادٌ يربط إلى أربع صفحاتٍ كلُّها ٤٠٤.
 *
 * فهذه تمشي السطح كلَّه في دقيقة: كلُّ `page.tsx` وجهةٌ تُطلَب، وكلُّ
 * رابطٍ داخليّ في صفحةٍ ردّت ٢٠٠ يُطلَب بدوره. والنتيجة قائمةٌ بما
 * يسقط ومن يربط إليه.
 *
 * ═══ وما لا تقيسه ═══
 *
 * زرٌّ لا ينادي شيئًا، واستمارةٌ تنقص حقلًا يطلبه الخادم: تلك تُقاس
 * بالنقر. وهذه تكشف الصنف الأوسع — **وجهةٌ لا تُفتح** — وهو الذي
 * تكرّر أكثر.
 *
 * ═══ وما تقيسه يتبع من دخل ═══
 *
 * **الأداةُ التي تُنذر كاذبًا تُعلّم قارئها تجاهُلَها.** كانت تملأ
 * المقاطع بأوّل صفٍّ في القاعدة أيًّا كان صاحبُه، فتطلب طلبَ غيرِ من
 * دخل وتُسجّل ٤٠٤ — **وهو الردّ الصحيح**: ألّا يعرف أحدٌ أنّ مرجعًا
 * قائمٌ لسواه. فأنذرت على سلامةٍ مرّتين في كل تشغيل.
 *
 * فصارت تدخل أوّلًا، ثمّ تملأ المقاطع بصفوف من دخل. **وتختار أغنى
 * الحسابات**: حسابٌ بلا طلبٍ ولا تقرير يُخطّي صفحاتِهما، فيمشي المشي
 * ويقول «سليم» عمّا لم يفتحه — وفرقُ ذلك ٤٦٧ وجهةً مقيسة بدل ٣١٢.
 *
 *   npx tsx scripts/walk-surface.ts            ← على المنفذ ٣٠٠٢
 *   npx tsx scripts/walk-surface.ts 3000       ← منفذٌ آخر
 *
 * **ويحمّل `.env` بنفسه**: كان يعمل حين تصادف البيئةُ أن تكون محمَّلة
 * في الصَّدفة ويسقط حين لا — وأداةٌ تعمل بالصدفة يُقرأ سقوطُها على
 * أنه عطلٌ فيما تقيسه.
 */
import './env-load';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { db } from '../src/lib/db';
import { landingCombinations } from '../src/lib/domain/landing';

const ROOT = process.cwd();
const PORT = process.argv[2] ?? '3002';
const BASE = `http://localhost:${PORT}`;
const LOCALE = 'ar';

type Visit = { url: string; status: number; from: string | null };

/** كلُّ `page.tsx` تحت `src/app` — بمساره كما يراه المتصفّح. */
function routes(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry === 'page.tsx') {
        const rel = relative(join(ROOT, 'src', 'app'), dir).split(sep).join('/');
        /** مجموعاتُ المسار `(site)` لا تظهر في العنوان. */
        const path = rel
          .split('/')
          .filter((part) => part !== '' && !part.startsWith('('))
          .join('/');
        out.push(`/${path}`);
      }
    }
  };
  walk(join(ROOT, 'src', 'app'));
  return [...new Set(out)].sort();
}

/** قيمٌ حقيقية للمقاطع المتغيّرة — من القاعدة لا من الخيال. */
async function params(
  viewerId: string | null,
  providerId: string | null,
): Promise<Record<string, string>> {
  /** مقاطعُ الحساب تُملأ بصفوف من دخل — وإلّا قِيس ٤٠٤ على ملكيّةٍ سليمة. */
  const mine = viewerId === null ? {} : { userId: viewerId };
  const [listing, order, docOrder, serviceRequest, anyServiceRequest, landing, providerRequest, provider, user, service, brand, dispute, payout, dealer, trim, offer, report, legal, auction] =
    await Promise.all([
      db.listing.findFirst({ where: { status: 'PUBLISHED' }, select: { ref: true } }),
      db.order.findFirst({ where: { buyerId: viewerId ?? undefined }, select: { ref: true } }),
      /**
       * ═══ ووثيقةُ الطلب تلزمها **صفقةٌ بلغت وثيقتَها** ═══
       *
       * `documents/[kind]` تردّ ٤٠٤ على طلبٍ في مرحلة «طلب» — **وهو
       * الصواب**: لا عقدَ قبل النقل. فمرجعُ طلبٍ عامّ يجعل الوجهة
       * «ساقطة» في كل تشغيل، وإنذارٌ دائمٌ يُعلَّم تجاهُله.
       */
      db.order.findFirst({
        where: { buyerId: viewerId ?? undefined, agreement: { isNot: null } },
        select: { ref: true },
      }),
      db.serviceRequest.findFirst({ where: mine, select: { ref: true } }),
      /** **وللأدمن أيُّ طلب** — صلاحيّتُه ليست ملكيّة، فتقييدُه بمن دخل يُخفي شاشته. */
      db.serviceRequest.findFirst({ orderBy: { createdAt: 'desc' }, select: { ref: true } }),
      /**
       * ═══ ومقاطعُ صفحة الهبوط من **تركيباتها** هي ═══
       *
       * `browse/[city]/[brand]` لا توجد لأيّ مدينةٍ وعلامة، بل لما
       * بلغ الحدّ (`MIN_LISTINGS`). فمدينةٌ من إعلانٍ وعلامةٌ من
       * جدولها تُنتجان مسارًا **سليمًا رمزيًّا و٤٠٤ فعلًا** — والقياسُ
       * يقرؤه عطلًا. وكان المقطعان بلا معاملٍ أصلًا، فلم تُقَس الصفحتان
       * قطّ.
       */
      landingCombinations(),
      /**
       * ═══ ومرجعُ لوحة المزوّد يخصّ **المزوّدَ الذي دخلت به** ═══
       *
       * كان يُملأ من «أيّ طلبٍ لمزوّدٍ له مستخدمون» والجلسةُ تُفتح
       * بأوّل مستخدمٍ على حدة — **فالاقترانُ حظّ**. وأوّلُ تبديلٍ في
       * البذرة (أُضيف مزوّدُ نقل ملكية، فتغيّر ترتيب الأسماء) جعل
       * الجلسة لمزوّدٍ والطلبَ لآخر: ثلاثُ ٤٠٤ **وكلُّها الصواب**
       * («ولا يراه مزوّدٌ لا شأن له به»)، تُقرأ عطلًا.
       *
       * **وقياسٌ يكذب أسوأ من غيابه**: عطلٌ حقيقيّ يختبئ بين سلاماتٍ
       * تُسجَّل سقوطًا.
       */
      providerId === null
        ? null
        : db.serviceRequest.findFirst({
            where: { providerId, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
            orderBy: { createdAt: 'desc' },
            select: { ref: true, providerId: true },
          }),
      db.serviceProvider.findFirst({ select: { id: true } }),
      db.user.findFirst({ where: { role: 'USER' }, select: { id: true } }),
      db.service.findFirst({
        where: { active: true, placements: { has: 'guide' } },
        select: { key: true },
      }),
      db.brand.findFirst({ select: { slug: true } }),
      db.dispute.findFirst({ select: { id: true } }),
      db.payout.findFirst({ select: { id: true } }),
      db.dealer.findFirst({ select: { id: true, slug: true } }),
      db.trim.findFirst({ select: { id: true } }),
      db.offer.findFirst({ select: { id: true } }),
      /** **وبلاغُ الإساءة غيرُ تقرير الفحص** — و`/admin/reports` للأوّل. */
      db.report.findFirst({ select: { ref: true } }),
      /** **ومفتاحُ الدليل غير مفتاح الخدمة** — فصفحةٌ قانونية مفتاحُها هي. */
      db.legalDocument.findFirst({ select: { key: true } }),
      db.auction.findFirst({ select: { id: true, listing: { select: { ref: true } } } }),
    ]);

  /**
   * ═══ وما لا صفَّ له **يُتخطّى ولا يُختلق** ═══
   *
   * كانت المراجع المملوكة تسقط إلى مرجعٍ مكتوبٍ (`'SRV-2026-3000'`)
   * حين لا يجد الاستعلامُ صفًّا — **وهو ٤٠٤ مضمون**: الصفُّ إمّا غيرُ
   * موجود وإمّا ليس لمن دخل. فيُسجَّل عطلٌ لا وجود له، ويختبئ تحته
   * عطلٌ حقيقيّ.
   *
   * و`fill` تُسقط الوجهةَ حين تكون القيمةُ `null`، والتقريرُ يقول كم
   * تُخطّي ولماذا — **فلا صمتَ عن تغطيةٍ نقصت**.
   */
  const deepest = landing.find((entry) => entry.modelSlug !== null) ?? landing[0];

  return {
    locale: LOCALE,
    ref: listing?.ref ?? '',
    listingRef: listing?.ref ?? '',
    orderRef: order?.ref ?? '',
    docOrderRef: docOrder?.ref ?? '',
    serviceRef: serviceRequest?.ref ?? '',
    anyServiceRef: anyServiceRequest?.ref ?? '',
    /**
     * **والتركيبةُ المختارة هي التي تحمل طرازًا** — فصفحةُ الطراز
     * تُقاس. وأوّلُ تركيبةٍ قد تكون على مستوى العلامة وحدها، فيبقى
     * المستوى الأدقّ — **وهو ما يكتبه الباحث** — بلا قياسٍ قطّ.
     */
    city: deepest?.citySlug ?? '',
    brand: deepest?.brandSlug ?? '',
    model: deepest?.modelSlug ?? '',
    /** **ونوعُ الوثيقة من قائمتها** — وهي ثابتة في الشاشة لا في القاعدة */
    kind: 'agreement',
    providerRef: providerRequest?.ref ?? '',
    id: provider?.id ?? '',
    userId: user?.id ?? '',
    /** **وخدمةُ الدليل غير كلِّ خدمة**: ما ليس في `guide` لا صفحةَ له بالتصميم. */
    key: service?.key ?? '',
    legalKey: legal?.key ?? '',
    dealerSlug: dealer?.slug ?? '',
    dealerId: dealer?.id ?? '',
    trimId: trim?.id ?? '',
    offerId: offer?.id ?? '',
    reportRef: report?.ref ?? '',
    auctionRef: auction?.listing.ref ?? '',
    slug: brand?.slug ?? '',
    disputeId: dispute?.id ?? '',
    payoutId: payout?.id ?? '',
  };
}

/**
 * يملأ المقاطع المتغيّرة. ويُسمّى المقطع بما يناسبه: `[ref]` تحت
 * `/admin/orders` مرجعُ طلب، وتحت `/admin/listings` مرجعُ إعلان.
 */
type Filled = { url: string } | { skip: 'CATCH_ALL' | 'NO_ROW'; segment: string };

function fill(route: string, p: Record<string, string>): Filled {
  const parts = route.split('/').filter((part) => part !== '');
  const out: string[] = [];

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i] ?? '';
    if (!part.startsWith('[')) {
      out.push(part);
      continue;
    }
    /** `[...slug]` و`[[...slug]]` تُترك — لا شكل واحد لها. */
    if (part.includes('...')) return { skip: 'CATCH_ALL', segment: part };

    const name = part.replace(/[[\]]/g, '');
    const parent = out[out.length - 1] ?? '';
    const grand = out[out.length - 2] ?? '';
    /** وما يليه يُميّز: مرجعُ طلبٍ تحته `documents` يلزمه عقدٌ فعليّ */
    const next = parts[i + 1] ?? '';
    const value =
      {
        locale: LOCALE,
        orders: next === 'documents' ? p.docOrderRef : p.orderRef,
        /** **وشاشةُ الأدمن تفتح أيَّ طلب** لا طلبَ من دخل بحسابه */
        'service-requests': p.anyServiceRef,
        listings: p.listingRef,
        cars: p.listingRef,
        auctions: p.auctionRef,
        provider: p.providerRef,
        users: p.userId,
        services: p.key,
        legal: p.legalKey,
        dealers: grand === 'admin' ? p.dealerId : p.dealerSlug,
        trims: p.trimId,
        offers: p.offerId,
        reports: parent === 'account' || grand === 'account' ? p.serviceRef : p.reportRef,
        providers: p.id,
        disputes: p.disputeId,
        payouts: p.payoutId,
        browse: p.city,
        documents: p.kind,
      }[parent] ??
      /** **و`[brand]` تحت مدينةٍ أبوها قيمةٌ لا اسمُ مقطع** — فاللقطُ بالاسم */
      { brand: p.brand, model: p.model, city: p.city, kind: p.kind }[name] ??
      p[name] ??
      null;
    /**
     * **وقيمةٌ لا صفَّ لها تُتخطّى باسمها** — ولا تُختلق. والتقرير
     * يفرّق بين «لا شكل لها» و«لا صفّ في القاعدة»: الأولى تصميمٌ،
     * والثانية **تغطيةٌ نقصت** وقد تكون بذرةً ناقصة.
     */
    if (value === null || value === undefined || value === '') {
      return { skip: 'NO_ROW', segment: `${parent}/${part}` };
    }
    out.push(encodeURIComponent(value));
  }
  return { url: `/${out.join('/')}` };
}

/** الروابط الداخلية في صفحة — بلا مرساةٍ ولا بروتوكول خارجيّ. */
function links(html: string): string[] {
  const found = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1] ?? '');
  return [
    ...new Set(
      found
        .filter((href) => href.startsWith('/'))
        .filter((href) => !href.startsWith('//'))
        .map((href) => href.split('#')[0] ?? '')
        .filter((href) => href !== '')
        /**
         * الملفّات الثابتة ليست وجهات — **ولا ما يحقنه خادم التطوير**.
         * `webpack.js?v=…` يحمل استعلامًا فيفلت من فحص الامتداد،
         * فيُعدّ «وجهةً ساقطة» وهو أثرُ الأداة لا عطلُ المنتج.
         */
        .filter((href) => !href.startsWith('/_next/'))
        .filter((href) => !/\.(png|jpg|jpeg|svg|webp|ico|css|js|xml|txt|json)(\?|$)/i.test(href)),
    ),
  ];
}

/**
 * ═══ تفاعليّ داخل تفاعليّ — **في الشجرة المُصيَّرة** ═══
 *
 * البوابة ٤٨ تمنع `<a><button>` **في ملفّ واحد**، وأفلتَ منها ما يعبر
 * حدَّ المكوّن: `AccountRow` كان يلفّ الصفَّ كلَّه في `<Link>`،
 * و«اطلب خدمة» رابطٌ يبعثه النداء في خاصّية — فصار `<a>` داخل `<a>`
 * على أربع شاشات حساب. وHTML لا يجيزه، فيعيد المتصفّح بناء الشجرة
 * ويسقط التصيير بـ«Hydration failed».
 *
 * **ولا يُقاس نصًّا**: اللافُّ في ملفّ والملفوفُ في ملفٍّ آخر، ولا
 * يلتقيان إلّا في الصفحة المُصيَّرة. فالقياس هنا — حيث HTML أمامنا.
 *
 * ومسحٌ بمكدّسٍ على الوسوم الأربعة يكفي: `<a>` و`<button>` لا يتداخل
 * أيٌّ منها في أيّ.
 */
function nestedInteractive(html: string): string[] {
  const found: string[] = [];
  const stack: string[] = [];
  for (const match of html.matchAll(/<(\/?)(a|button)\b([^>]*)>/g)) {
    const [, closing, tag = '', attrs = ''] = match;
    if (closing === '/') {
      const at = stack.lastIndexOf(tag);
      if (at !== -1) stack.splice(at, 1);
      continue;
    }
    /** الوسمُ المغلَق على نفسه لا يفتح شيئًا. */
    if (attrs.endsWith('/')) continue;
    if (stack.length > 0) {
      const href = /href="([^"]*)"/.exec(attrs)?.[1] ?? '';
      found.push(`<${stack[stack.length - 1] ?? ''}> ⊃ <${tag}${href === '' ? '' : ` href="${href}"`}>`);
    }
    stack.push(tag);
  }
  return [...new Set(found)];
}

async function main(): Promise<void> {
  const cookies: Record<string, string> = {};

  /* ─ أدمن ─ */
  const adminLogin = await fetch(`${BASE}/api/v1/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL ?? 'super@carsell.one',
      password: process.env.SEED_PASSWORD ?? 'CarSell!dev2026',
    }),
  });
  const adminCookie = /carsell_admin=([^;]+)/.exec(adminLogin.headers.get('set-cookie') ?? '');
  if (adminCookie !== null) cookies.carsell_admin = adminCookie[1] ?? '';

  /* ─ مستخدم: بالرمز، فلا كلمةَ لأحدٍ في الزرع ─ */
  /** **ومهلةُ الرمز تمنع رقمًا لا كلَّ الأرقام** — فتُجرَّب عدّةٌ منها. */
  /**
   * **وأغنى الحسابات أوسعُها قياسًا.** حسابٌ بلا طلبٍ ولا تقرير يُخطّي
   * صفحاتِهما، فيمشي المشي ويقول «سليم» عمّا لم يفتحه. فيُقدَّم من
   * يملك الاثنين، ثمّ من يملك أحدهما، ثمّ الأحدث.
   */
  const ranked = [
    { ordersAsBuyer: { some: {} }, serviceRequests: { some: {} } },
    { ordersAsBuyer: { some: {} } },
    {},
  ];
  const candidates: { id: string; phone: string }[] = [];
  for (const where of ranked) {
    const rows = await db.user.findMany({
      where: { role: 'USER', ...where },
      select: { id: true, phone: true },
      orderBy: { createdAt: 'desc' },
      take: 4,
    });
    for (const row of rows) {
      if (!candidates.some((seen) => seen.id === row.id)) candidates.push(row);
    }
  }
  /**
   * **ومن دخل يُذكَر.** كان المشي يملأ المقاطع بأوّل صفٍّ في القاعدة
   * أيًّا كان صاحبُه، فيطلب طلبَ غيره ويُسجّل ٤٠٤ — **وهو الردّ
   * الصحيح**: ألّا يعرف أحدٌ أنّ مرجعًا قائمٌ لسواه. فأنذرت الأداة
   * على سلامةٍ مرّتين في كل تشغيل، وإنذارٌ كاذبٌ يُعلّم قارئه
   * تجاهُلَ القائمة كلِّها.
   */
  let signedInUserId: string | null = null;
  for (const candidate of candidates) {
    const asked = await fetch(`${BASE}/api/v1/auth/otp/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: candidate.phone }),
    });
    const body = (await asked.json().catch(() => null)) as {
      data?: { challengeId?: string; devCode?: string };
    } | null;
    const challengeId = body?.data?.challengeId;
    const code = body?.data?.devCode;
    if (typeof challengeId !== 'string' || typeof code !== 'string') continue;

    const verified = await fetch(`${BASE}/api/v1/auth/otp/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId, code }),
    });
    const session = /carsell_session=([^;]+)/.exec(verified.headers.get('set-cookie') ?? '');
    if (session !== null) {
      cookies.carsell_session = session[1] ?? '';
      signedInUserId = candidate.id;
      break;
    }
  }

  /* ─ مزوّد: بكلمة البذرة، فلوحتُه لا تُقاس بلا جلسة ─ */
  /**
   * **والمشي بلا جلسةِ مزوّد يقيس تحويلًا لا شاشة.** أربعُ وجهاتٍ في
   * `/provider` كانت تُسجَّل «٣٠٧» — وهي بابُ الدخول لا عطلًا، لكنّ
   * اللوحة نفسَها تبقى بلا قياس. وكلمةُ البذرة هي نفسُها للأدمن.
   */
  let signedInProviderId: string | null = null;
  const providerUser = await db.providerUser.findFirst({
    where: { active: true, provider: { active: true } },
    orderBy: { createdAt: 'asc' },
    select: { email: true, providerId: true },
  });
  if (providerUser !== null) {
    const entered = await fetch(`${BASE}/api/v1/provider/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: providerUser.email,
        password: process.env.SEED_PASSWORD ?? 'CarSell!dev2026',
      }),
    });
    const session = /carsell_provider=([^;]+)/.exec(entered.headers.get('set-cookie') ?? '');
    if (session !== null) {
      cookies.carsell_provider = session[1] ?? '';
      /** **وهويّةُ الجلسة تُمرَّر إلى المعاملات** — وإلّا فالاقتران حظّ */
      signedInProviderId = providerUser.providerId;
    }
  }

  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  console.log(
    `الجلسات: أدمن=${cookies.carsell_admin === undefined ? 'لا' : 'نعم'}`
      + ` · مستخدم=${cookies.carsell_session === undefined ? 'لا' : 'نعم'}`
      + ` · مزوّد=${cookies.carsell_provider === undefined ? 'لا' : 'نعم'}\n`,
  );

  const p = await params(signedInUserId, signedInProviderId);
  const visited = new Map<string, Visit>();

  /**
   * **ووصلةٌ تنقطع ليست وجهةً سليمة.** `ECONNRESET` من خادم التطوير
   * يعني أنّ الصفحة أسقطت العامل — وهو عطلٌ يُسجَّل لا سببٌ لإيقاف
   * المشي كلّه.
   */
  async function visit(url: string, from: string | null): Promise<string | null> {
    const seen = visited.get(url);
    if (seen !== undefined) return null;
    /**
     * **وأوّلُ طلبٍ لوجهةٍ يبنيها خادمُ التطوير** — فيطول حتى ينقطع.
     * ومهلةٌ قصيرة تجعل التقرير يقول «ساقطة» عن صفحةٍ سليمة كانت
     * تُترجَم. ثلاثُ محاولاتٍ بمهلةٍ واسعة، ثمّ يُسجَّل الانقطاع.
     */
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(`${BASE}${url}`, {
          headers: { cookie, 'accept-language': 'ar' },
          redirect: 'manual',
          signal: AbortSignal.timeout(90_000),
        });
        visited.set(url, { url, status: response.status, from });
        if (response.status !== 200) return null;
        return await response.text();
      } catch {
        if (attempt === 2) visited.set(url, { url, status: 0, from });
        else await new Promise((resolve) => setTimeout(resolve, 1_500));
      }
    }
    return null;
  }

  /* ١ ─ كلُّ وجهةٍ معرَّفة */
  const defined = routes();
  const skipped: string[] = [];
  const unseeded: string[] = [];
  for (const route of defined) {
    const filled = fill(route, p);
    if ('skip' in filled) {
      (filled.skip === 'CATCH_ALL' ? skipped : unseeded).push(`${route}  (${filled.segment})`);
      continue;
    }
    await visit(filled.url, null);
  }

  /* ٢ ─ وكلُّ رابطٍ في صفحةٍ فُتحت */
  const pages = [...visited.values()].filter((row) => row.status === 200).map((row) => row.url);
  const nested = new Map<string, string[]>();
  for (const page of pages) {
    const html = await fetch(`${BASE}${page}`, { headers: { cookie } })
      .then((r) => r.text())
      .catch(() => '');
    const inside = nestedInteractive(html);
    if (inside.length > 0) nested.set(page, inside);
    for (const href of links(html)) await visit(href, page);
  }

  /* ─ التقرير ─ */
  const all = [...visited.values()];
  const broken = all.filter((row) => row.status >= 400 || row.status === 0);
  const redirects = all.filter((row) => row.status >= 300 && row.status < 400);

  /**
   * ═══ **والخادمُ البارد يُنقص العدد لا يُسقط شيئًا** ═══
   *
   * الوجهاتُ المعرَّفة تُزار كلُّها دائمًا، **والزحفُ على الروابط
   * انتهازيّ**: خادم التطوير يُصيّر على مراحل، فصفحةٌ تُقرأ أثناء
   * ترجمتها تُعطي روابط أقلّ. فقُرئ تشغيلٌ بعد `db:generate` ‹١٥٦
   * مُقاسة› وقُرئ تاليه ‹٤٧٠›، **والفرقُ الخادمُ لا المنتج**.
   *
   * فشغّله مرّتين واقرأ الثانية، أو أحمِ الخادمَ قبل القياس.
   */
  console.log(`وجهات معرَّفة: ${String(defined.length)} · مُقاسة: ${String(all.length)}`);
  console.log(`٢٠٠: ${String(all.filter((r) => r.status === 200).length)}`);
  console.log(`تحويل: ${String(redirects.length)} · ساقطة: ${String(broken.length)}\n`);

  if (nested.size === 0) {
    console.log('لا عنصرَ تفاعليّ داخل تفاعليّ في أيّ صفحة.\n');
  } else {
    console.log(`تفاعليّ داخل تفاعليّ — ${String(nested.size)} صفحة:`);
    for (const [page, inside] of nested) console.log(`  ${page}  ${inside.join(' · ')}`);
    console.log('');
  }

  if (skipped.length > 0) {
    console.log(`تُخطّيت (مقاطع مفتوحة): ${skipped.join(' · ')}\n`);
  }
  /**
   * **وتغطيةٌ نقصت تُقال.** وجهةٌ لا تُقاس لأنّ القاعدة لا تحمل صفًّا
   * لمقطعها ليست سليمة — هي غيرُ مقيسة، وقد تكون بذرةً ناقصة.
   */
  if (unseeded.length > 0) {
    console.log('═══ لم تُقَس — لا صفَّ لمقطعها ═══');
    for (const row of unseeded) console.log(`  ${row}`);
    console.log('');
  }

  if (broken.length > 0) {
    console.log('═══ ساقطة ═══');
    for (const row of broken.sort((a, b) => a.url.localeCompare(b.url))) {
      console.log(`  ${String(row.status)}  ${row.url}${row.from === null ? '' : `   ← ${row.from}`}`);
    }
    console.log();
  }

  if (redirects.length > 0) {
    console.log('═══ تحويل ═══');
    for (const row of redirects.sort((a, b) => a.url.localeCompare(b.url))) {
      console.log(`  ${String(row.status)}  ${row.url}${row.from === null ? '' : `   ← ${row.from}`}`);
    }
  }

  writeFileSync(
    join(ROOT, '.surface-walk.json'),
    JSON.stringify({ visited: all, skipped }, null, 2),
  );
  await db.$disconnect();
  process.exit(broken.length > 0 ? 1 : 0);
}

void main();
