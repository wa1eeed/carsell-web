import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { checkConnection } from '@/lib/domain/admin-integrations';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/admin/integrations/{key}/check` — فحص الاتصال.
 *
 * **ولم يكن له باب.** `checkConnection` مبنيّة ومختبَرة، ولا ينادِيها
 * شيء — فمن يضبط سرًّا لا يملك طريقةً واحدة ليعرف أوصل أم لا إلّا أن
 * يُجري معاملةً حقيقية بمال حقيقيّ.
 *
 * ═══ و`view` تكفي ═══
 *
 * الفحص **لا يكتب سرًّا ولا يبدّل بيئة**: يقرأ أثمّة سرٌّ مضبوط،
 * ويسجّل وقت الفحص وأثرَه. واشتراط `rotateKeys` عليه يمنع من يراقب
 * من أن يعرف حال ما يراقبه.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const guard = await requireAdmin(request, 'integrations.view');
  if (!guard.ok) return guard.response;

  const { key } = await params;
  const result = await checkConnection(guard.admin, key, guard.ip);

  /**
   * **و`NO_SECRET` ليست خطأ خادم.** تكاملٌ مؤجَّل بلا مفاتيح هو الحال
   * المتوقَّعة، فردُّها ٤٠٤ أو ٥٠٠ يجعل الشاشة تصرخ على ما هو طبيعيّ.
   * تخرج ٢٠٠ ومعها الحال، والشاشة تصوغها سطرًا رماديًّا.
   */
  if (!result.ok && result.result === 'NO_SECRET') {
    const known = await checkedIntegrationExists(key);
    if (!known) return fail(ERRORS.NOT_FOUND, 404);
  }

  /**
   * **و`ok` تقول «جرى الفحص» لا «المفاتيح موجودة».** ربطتُهما أوّلًا،
   * فردّ تكاملٌ بلا مفاتيح `configured: true` — وهي الحال التي بُني
   * الفحص ليكشفها.
   *
   * و`UNTESTED` أمانةٌ لا نقص: المفاتيح مضبوطة **ولم يُنادَ المزوّد
   * فعلًا**. ونداءٌ حقيقيّ هنا يعني معاملةً في حسابٍ حيّ لمجرّد فحص.
   */
  return ok({ configured: result.result === 'UNTESTED', result: result.result });
}

/** تمييز «تكاملٌ لا وجود له» عن «تكاملٌ بلا سرّ» — والأول وحده ٤٠٤. */
async function checkedIntegrationExists(key: string): Promise<boolean> {
  const { db } = await import('@/lib/db');
  const row = await db.integration.findUnique({ where: { key }, select: { key: true } });
  return row !== null;
}
