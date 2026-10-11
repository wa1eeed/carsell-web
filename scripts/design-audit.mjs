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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3002';
const ADMIN_COOKIE = process.env.AUDIT_ADMIN ?? '';
const USER_COOKIE = process.env.AUDIT_USER ?? '';

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

function stripTags(html) {
  return html
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

      const cookie = route.startsWith('/admin')
        ? `carsell_admin=${ADMIN_COOKIE}`
        : `carsell_session=${USER_COOKIE}`;

      let text = '';
      try {
        const res = await fetch(`${BASE}${route}`, { headers: { cookie } });
        text = stripTags(await res.text());
      } catch {
        text = '';
      }

      const missing = signals.filter((s) => !text.includes(s));
      rows.push({
        tag, route,
        total: signals.length,
        found: signals.length - missing.length,
        missing: missing.slice(0, 6),
      });
    }
  }

  let totalSignals = 0;
  let totalFound = 0;
  console.log('الشاشة  المسار                          مطابق   الناقص');
  for (const row of rows) {
    totalSignals += row.total;
    totalFound += row.found;
    const pct = row.total === 0 ? 100 : Math.round((row.found / row.total) * 100);
    const mark = row.route === '—' ? '⬜ لا مسار' : `${String(pct).padStart(3)}٪`;
    console.log(
      `${row.tag.padEnd(7)} ${row.route.padEnd(32)} ${mark}   ${row.missing.join(' · ')}`,
    );
  }
  const overall = totalSignals === 0 ? 0 : Math.round((totalFound / totalSignals) * 100);
  console.log(`\nالمجموع: ${totalFound}/${totalSignals} إشارة — ${overall}٪`);
}

await main();
