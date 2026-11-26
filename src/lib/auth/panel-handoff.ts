import type { NextResponse } from 'next/server';
import { DEALER_COOKIE, dealerCookieOptions } from '@/lib/auth/dealer-session';
import { openDealerSession, DEALER_SESSION_HOURS } from '@/lib/domain/dealer-auth';
import type { DealerMembership } from '@/lib/domain/dealer-membership';

/**
 * ═══ تسليمُ اللوحة عند الدخول — وجلسةٌ قديمة لا تنجو منه ═══
 *
 * **وكوكي اللوحة كان يبقى بعد دخولِ شخصٍ آخر.** قِيس بالنقر: دخلتُ
 * بحساب مندوبٍ جديد في المتصفّح نفسِه، فأخذني إلى `/dealer` وفُتحت
 * اللوحة **بجلسة المالك** — بندُ الفواتير والتسويات والفريق كلُّها
 * ظاهرة، وهي لا تُعرض لمندوب. ولا جلسةَ لوحةٍ جديدة في القاعدة أصلًا:
 * الكوكي القديم خدم الطلب.
 *
 * وعلى حاسوبٍ مشترك في معرضٍ — وهو الشائع — يعني ذلك أنّ موظّفًا يعمل
 * بصلاحية زميله، **والأثرُ يُكتب باسم زميله**. فالدخولُ فعلُ هويّة:
 * ما كان من جلساتٍ قبله يسقط به.
 *
 * ═══ ولمَ تُفتح الجلسةُ هنا لا بنقرةٍ أخرى ═══
 *
 * `POST /dealer/auth/session` يفتحها معتمدًا على **جلسةِ متجرٍ أقدم**،
 * وهنا الهويّةُ أُثبتت قبل سطرٍ واحد برمزٍ أو كلمة. فالفتحُ هنا أقوى
 * سندًا، ويُغني عن صفحةٍ تقول «ادخل لوحتك» لمن دخل توًّا.
 */
export type PanelHandoff = { token: string } | null;

/** يفتح جلسةَ اللوحة لعضوٍ معتمد — و`null` لمن ليس كذلك أو تعذّر فتحُها. */
export async function openPanel(
  userId: string,
  membership: DealerMembership,
): Promise<PanelHandoff> {
  if (membership.state !== 'MEMBER') return null;
  const opened = await openDealerSession(userId);
  /**
   * **وتعذّرُ الفتح لا يمنع الدخول**: الحسابُ دخل متجرَه، وغايةُ ما
   * يقع ألّا تُسلَّم اللوحة — فيصل `/dealer/enter` ويقرأ السبب هناك.
   */
  return opened.ok ? { token: opened.token } : null;
}

/** وجهةُ من فُتحت له — تُعلَن في الجواب فلا تَعِد الشاشةُ بما لم يُفتح. */
export const PANEL_PATH = '/dealer';

/**
 * يكتب كوكي اللوحة على جواب الدخول.
 *
 * **والمسحُ يقع ولو لم تُفتح جلسة** — وهو أصلُ العلاج: من دخل بحسابٍ
 * ليس عضوًا، أو بعضويّةٍ في معرضٍ موقوف، لا يبقى في يده مفتاحُ لوحةِ
 * من سبقه على الجهاز.
 */
export function attachPanel(response: NextResponse, handoff: PanelHandoff): void {
  response.cookies.set(
    DEALER_COOKIE,
    handoff?.token ?? '',
    dealerCookieOptions(handoff === null ? 0 : DEALER_SESSION_HOURS * 3_600),
  );
}
