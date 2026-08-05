import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { sendCampaign } from '@/lib/domain/admin-campaigns';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/admin/campaigns/{id}/send` — إرسال حملة.
 *
 * **ولم يكن له باب.** `sendCampaign` مبنيّة ومختبَرة: تحوسب الشريحة
 * الآن، وتحترم سقف الشهر وتهدئة الاثنتين والسبعين ساعة، وتكتب
 * `CampaignSend` لمن يصلهم فعلًا — **ولا ينادِيها شيء**. والشاشة تعرض
 * الحملات جدولًا للقراءة، فحملةٌ في `DRAFT` تبقى فيه إلى الأبد.
 *
 * ═══ ولا شريحة ⇒ لا إرسال ═══
 *
 * `NO_AUDIENCE` تُقال صراحةً: حملةٌ تُرسَل إلى صفر شخص تُسجَّل «مُرسَلة»
 * فيقرأ صاحبها نجاحًا ولم يصل أحدًا — والقواعد التي حجبت الجمهور هي ما
 * يحتاج أن يعرفه، لا كلمة «تعذّر».
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  /**
   * **`notifications.manage` — ولا صلاحية جديدة.**
   *
   * الحملة إشعارٌ صادر إلى عملاء، وهي الصلاحية التي تحكم الصادر كلّه
   * (`/admin/notifications` و`/admin/push`). واختراع `campaigns.send`
   * يعني مفتاحًا يُضاف إلى مصفوفة الأدوار السبعة — ونسيانُ صفٍّ فيها
   * هو بالضبط شكل «نصف النصاب» الذي أُغلق ببوابة ١٩.
   */
  const guard = await requireAdmin(request, 'notifications.manage');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const result = await sendCampaign(guard.admin, id, guard.ip);

  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(
      {
        code: result.reason,
        messageAr:
          result.reason === 'NO_AUDIENCE'
            ? 'لا أحد يطابق الشريحة بعد سقف الشهر والتهدئة — لن تصل أحدًا.'
            : 'هذه الحملة أُرسلت أو أُلغيت — ولا تُرسَل مرّتين.',
        messageEn:
          result.reason === 'NO_AUDIENCE'
            ? 'Nobody matches this segment after the monthly cap and cooldown.'
            : 'This campaign was already sent or cancelled.',
      },
      409,
    );
  }

  return ok(result);
}
