import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUserFromCookies } from '@/lib/domain/account';
import { requestViewing, type ViewingFailure } from '@/lib/domain/viewings';

export const runtime = 'nodejs';

const Body = z.object({
  listingRef: z.string().min(1).max(40),
  /** `yyyy-mm-dd` — واليومُ وفترتُه لا ساعةٌ بالدقيقة */
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period: z.enum(['MORNING', 'NOON', 'AFTERNOON', 'EVENING']),
  note: z.string().max(500).nullable(),
});

export const VIEWING_MESSAGES: Record<ViewingFailure, { ar: string; en: string; status: number }> = {
  LISTING_NOT_FOUND: { ar: 'لم نجد هذا الإعلان.', en: 'Listing not found.', status: 404 },
  NOT_PUBLISHED: {
    ar: 'هذا الإعلان غير معروض الآن.',
    en: 'This listing is not on sale right now.',
    status: 409,
  },
  OWN_LISTING: {
    ar: 'هذه مركبتك — ولا معاينة لصاحبها.',
    en: 'This is your own car.',
    status: 409,
  },
  DATE_IN_PAST: { ar: 'اختر موعدًا لم يمضِ بعد.', en: 'Pick a slot that has not passed.', status: 422 },
  /**
   * **والعددُ لا يُقحَم في جملة**: `${n} يومًا` تُخرج رقمًا لاتينيًّا
   * وجمعًا يُصيب حالةً من ستّ. والمدّةُ تُعرض في النموذج بـ`Quantity`،
   * والرسالةُ هنا تقول ما وقع لا كم المسموح.
   */
  DATE_TOO_FAR: {
    ar: 'هذا الموعد أبعد من المدّة المتاحة للحجز.',
    en: 'That slot is beyond the booking window.',
    status: 422,
  },
  ALREADY_OPEN: {
    ar: 'لك طلبُ معاينةٍ قائمٌ على هذا الإعلان.',
    en: 'You already have an open viewing on this listing.',
    status: 409,
  },
  VIEWING_NOT_FOUND: { ar: 'لم نجد هذا الموعد.', en: 'Viewing not found.', status: 404 },
  NOT_YOURS: { ar: 'هذا الموعد ليس لك.', en: 'This viewing is not yours.', status: 403 },
  NOT_PENDING: {
    ar: 'لم يعد هذا الطلب ينتظر ردًّا.',
    en: 'This request is no longer awaiting a reply.',
    status: 409,
  },
  REASON_REQUIRED: {
    ar: 'اكتب سبب الاعتذار — فمن رُفض بلا سببٍ لا يعرف أيعيد الطلب أم يبحث عن غيرها.',
    en: 'Write why, so the buyer knows whether to try again.',
    status: 422,
  },
  MEETING_POINT_REQUIRED: {
    ar: 'اكتب نقطة اللقاء — أين يقابلك؟',
    en: 'Write the meeting point.',
    status: 422,
  },
  ALREADY_CLOSED: { ar: 'انتهى هذا الموعد.', en: 'This viewing is closed.', status: 409 },
};

/**
 * `POST /api/v1/viewings` — طلبُ معاينة.
 *
 * **والمعاينةُ ليست خدمةَ مزوّد**: لقاءٌ بين مشترٍ وبائع، فلا مال ولا
 * طرفَ ثالث ولا رسوم.
 */
export async function POST(request: NextRequest) {
  const user = await currentUserFromCookies();
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  const result = await requestViewing({ ...parsed.data, buyerId: user.id });
  if (!result.ok) {
    const message = VIEWING_MESSAGES[result.reason];
    return fail(
      { code: result.reason, messageAr: message.ar, messageEn: message.en },
      message.status,
    );
  }
  return ok({ ref: result.value.ref });
}
