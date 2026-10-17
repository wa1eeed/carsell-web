import type { ViewingFailure } from '@/lib/domain/viewings';

/**
 * ═══ رسائلُ أعطال المعاينة — ومسارٌ لا يُصدِّر غير معالجاته ═══
 *
 * كانت هنا داخل `app/api/v1/viewings/route.ts` ويستوردها مسارُ
 * `[ref]` — **وNext يرفض من مسارٍ أيَّ تصدير غير المعالجات**:
 * `tsc --noEmit` على مصادرنا يمرّ، وأنواعُ `.next` المولَّدة ترفض،
 * **وبناءُ الإنتاج يسقط**. و`verify` لا يبني، فيبقى العطل غير مرئيّ.
 *
 * فموضعُها وحدةٌ مشتركة، والمساران يقرآنها.
 */
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
  NOT_COUNTERED: {
    ar: 'لا اقتراحَ ينتظر قبولك على هذا الموعد.',
    en: 'There is no counter-proposal awaiting you on this viewing.',
    status: 409,
  },
  ALREADY_CLOSED: { ar: 'انتهى هذا الموعد.', en: 'This viewing is closed.', status: 409 },
};

