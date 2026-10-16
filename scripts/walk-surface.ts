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
async function params(viewerId: string | null): Promise<Record<string, string>> {
  /** مقاطعُ الحساب تُملأ بصفوف من دخل — وإلّا قِيس ٤٠٤ على ملكيّةٍ سليمة. */
  const mine = viewerId === null ? {} : { userId: viewerId };
  const [listing, order, serviceRequest, provider, user, service, brand, dispute, payout, dealer, trim, offer, report, legal, auction] =
    await Promise.all([
      db.listing.findFirst({ where: { status: 'PUBLISHED' }, select: { ref: true } }),
      db.order.findFirst({ where: { buyerId: viewerId ?? undefined }, select: { ref: true } }),
      db.serviceRequest.findFirst({ where: mine, select: { ref: true } }),
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

  return {
    locale: LOCALE,
    ref: listing?.ref ?? 'ADS2026A0001',
    listingRef: listing?.ref ?? 'ADS2026A0001',
    orderRef: order?.ref ?? 'ORD-2026-1001',
    serviceRef: serviceRequest?.ref ?? 'SRV-2026-3000',
    id: provider?.id ?? 'unknown',
    userId: user?.id ?? 'unknown',
    /** **وخدمةُ الدليل غير كلِّ خدمة**: ما ليس في `guide` لا صفحةَ له بالتصميم. */
    key: service?.key ?? 'inspection',
    legalKey: legal?.key ?? 'terms',
    dealerSlug: dealer?.slug ?? 'al-safwa',
    dealerId: dealer?.id ?? 'unknown',
    trimId: trim?.id ?? 'unknown',
    offerId: offer?.id ?? 'unknown',
    reportRef: report?.ref ?? 'RPT-2026-100',
    auctionRef: auction?.listing.ref ?? 'ADS2026A0001',
    slug: brand?.slug ?? 'toyota',
    disputeId: dispute?.id ?? 'unknown',
    payoutId: payout?.id ?? 'unknown',
  };
}

/**
 * يملأ المقاطع المتغيّرة. ويُسمّى المقطع بما يناسبه: `[ref]` تحت
 * `/admin/orders` مرجعُ طلب، وتحت `/admin/listings` مرجعُ إعلان.
 */
function fill(route: string, p: Record<string, string>): string | null {
  const parts = route.split('/').filter((part) => part !== '');
  const out: string[] = [];

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i] ?? '';
    if (!part.startsWith('[')) {
      out.push(part);
      continue;
    }
    /** `[...slug]` و`[[...slug]]` تُترك — لا شكل واحد لها. */
    if (part.includes('...')) return null;

    const name = part.replace(/[[\]]/g, '');
    const parent = out[out.length - 1] ?? '';
    const grand = out[out.length - 2] ?? '';
    const value =
      {
        locale: LOCALE,
        orders: p.orderRef,
        'service-requests': p.serviceRef,
        listings: p.listingRef,
        cars: p.listingRef,
        auctions: p.auctionRef,
        provider: p.serviceRef,
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
      }[parent] ??
      p[name] ??
      null;
    if (value === null || value === undefined) return null;
    out.push(encodeURIComponent(value));
  }
  return `/${out.join('/')}`;
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

  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  console.log(
    `الجلسات: أدمن=${cookies.carsell_admin === undefined ? 'لا' : 'نعم'} · مستخدم=${cookies.carsell_session === undefined ? 'لا' : 'نعم'}\n`,
  );

  const p = await params(signedInUserId);
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
  for (const route of defined) {
    const url = fill(route, p);
    if (url === null) {
      skipped.push(route);
      continue;
    }
    await visit(url, null);
  }

  /* ٢ ─ وكلُّ رابطٍ في صفحةٍ فُتحت */
  const pages = [...visited.values()].filter((row) => row.status === 200).map((row) => row.url);
  for (const page of pages) {
    const html = await fetch(`${BASE}${page}`, { headers: { cookie } })
      .then((r) => r.text())
      .catch(() => '');
    for (const href of links(html)) await visit(href, page);
  }

  /* ─ التقرير ─ */
  const all = [...visited.values()];
  const broken = all.filter((row) => row.status >= 400 || row.status === 0);
  const redirects = all.filter((row) => row.status >= 300 && row.status < 400);

  console.log(`وجهات معرَّفة: ${String(defined.length)} · مُقاسة: ${String(all.length)}`);
  console.log(`٢٠٠: ${String(all.filter((r) => r.status === 200).length)}`);
  console.log(`تحويل: ${String(redirects.length)} · ساقطة: ${String(broken.length)}\n`);

  if (skipped.length > 0) console.log(`تُخطّيت (مقاطع مفتوحة): ${skipped.join(' · ')}\n`);

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
