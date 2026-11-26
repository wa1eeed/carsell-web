import type { PublishFailure } from '@/lib/domain/publish';

/**
 * ═══ رسائلُ فشل النشر — تُكتب مرّة ═══
 *
 * كانت في `api/v1/listings/route.ts` وحده. ثمّ صار للمعرض مسارُ نشرٍ
 * من مخزونه (`D2b`)، **ونسخةٌ ثانيةٌ للرسائل تتباعد أوّلَ تعديل**:
 * فيقرأ الفردُ «أكمل ملفك» ويقرأ المعرضُ «تعذر النشر» عن السبب نفسِه.
 *
 * وموضعُها خارج المسار لأنّ البوابة تمنع مسارًا يُصدِّر غير معالجاته.
 */
export const LISTING_FAILURE: Record<
  PublishFailure,
  { ar: string; en: string; status: number }
> = {
  PROFILE_INCOMPLETE: {
    ar: 'أكمل ملفك — البريد وتوثيق الهوية والآيبان — قبل النشر.',
    en: 'Complete your profile — email, identity and IBAN — before publishing.',
    status: 428,
  },
  TAX_STATUS_REQUIRED: {
    ar: 'حدد وضعك الضريبي قبل النشر.',
    en: 'Set your tax status before publishing.',
    status: 428,
  },
  /**
   * **ولا يُقال «غير موجودة» لمركبةِ غيرك** — أن يعرف سائلٌ أنّ
   * المعرّف قائمٌ لسواه خبرٌ لا يُعطى. والجوابُ واحد في الحالين.
   */
  VEHICLE_NOT_FOUND: {
    ar: 'لم نجد هذه السيارة في سياراتك.',
    en: 'We could not find this car among yours.',
    status: 404,
  },
  VEHICLE_ALREADY_LISTED: {
    ar: 'هذه السيارة معروضة بالفعل — اسحب إعلانها القائم قبل عرضها من جديد.',
    en: 'This car is already listed — withdraw its current listing first.',
    status: 409,
  },
  VIN_ALREADY_LISTED: {
    ar: 'هذه المركبة معروضة بالفعل — اسحب الإعلان القائم أولا.',
    en: 'This vehicle is already listed — withdraw the existing listing first.',
    status: 409,
  },
  NO_IMAGES: { ar: 'أضف صورة واحدة على الأقل.', en: 'Add at least one photo.', status: 422 },
  IMAGE_NOT_UPLOADED: {
    ar: 'إحدى الصور لم ترفع أو ليست لك — أعد رفعها.',
    en: 'One of the photos was not uploaded or is not yours — upload it again.',
    status: 422,
  },
  PRICE_INVALID: { ar: 'أدخل سعرا صحيحا.', en: 'Enter a valid price.', status: 422 },
  TRIM_UNKNOWN: { ar: 'اختر فئة المركبة.', en: 'Choose the vehicle trim.', status: 422 },
  BRAND_OR_MODEL_UNKNOWN: {
    ar: 'الماركة أو الطراز غير معروف.',
    en: 'Unknown brand or model.',
    status: 422,
  },
  AUCTION_SETTINGS_REQUIRED: {
    ar: 'حدد مدة المزاد وموعد بدئه قبل النشر.',
    en: 'Set the auction duration and start time before publishing.',
    status: 422,
  },
  AUCTION_DURATION_INVALID: {
    ar: 'اختر مدة من المدد المتاحة.',
    en: 'Choose one of the available durations.',
    status: 422,
  },
  AUCTION_STARTS_IN_PAST: {
    ar: 'موعد البدء مضى — اختر وقتا قادما أو ابدأ فورا.',
    en: 'The start time has passed — pick a future time or start now.',
    status: 422,
  },
  AUCTION_RESERVE_INVALID: {
    ar: 'السعر الاحتياطي لا يقل عن سعر الافتتاح — وإلا بلغته أول مزايدة.',
    en: 'The reserve cannot be below the opening price — the first bid would meet it.',
    status: 422,
  },
  AUCTION_INCREMENT_TOO_SMALL: {
    ar: 'خطوة المزايدة أقل من الحد الأدنى المسموح.',
    en: 'The bid increment is below the allowed minimum.',
    status: 422,
  },
  AUCTION_DEPOSIT_INVALID: {
    ar: 'العربون خارج الحد — عالي يطرد المزايدين، ومنخفض يفقد المزايدة جديتها.',
    en: 'The deposit is out of range — too high drives bidders away, too low makes bidding costless.',
    status: 422,
  },
  AUCTION_BUY_NOW_INVALID: {
    ar: 'سعر «اشتر الآن» لا يقل عن الاحتياطي — وإلا بيعت السيارة بأقل مما قبلت به.',
    en: 'The buy-now price cannot be below the reserve — it would sell under your floor.',
    status: 422,
  },
  MIN_ACCEPT_INVALID: {
    ar: 'أقل سعر تقبله لا يعلو السعر المعلن — وإلا رفض كل عرض تلقائيا.',
    en: 'Your minimum cannot exceed the asking price — every offer would be auto-rejected.',
    status: 422,
  },
  /**
   * **والمنعُ يُقال بسببه لا بـ«غير مسموح»**: من يُمنع ولا يعرف لِمَ
   * يظنّه عطلًا فيعيد المحاولة، ومن يعرف يراجع باقته.
   */
  SALE_METHOD_NOT_ALLOWED: {
    ar: 'طريقة البيع هذه ليست ضمن باقتك — راجع خياراتك أو تواصل معنا.',
    en: 'This sale method is not included in your plan — review your options or contact us.',
    status: 403,
  },
  /**
   * **ويُقال ما ينقص ومن يفعله** — لا «غير مسموح». فالمعرضُ لم يُخطئ
   * في شيء: سجلُّه عندنا ننتظر مراجعتَه.
   */
  DEALER_NOT_VERIFIED: {
    ar: 'سجلك التجاري قيد المراجعة — جهز مخزونك الآن، ويفتح النشر فور اعتماده.',
    en: 'Your commercial register is under review — prepare your stock now; publishing opens once it is approved.',
    status: 403,
  },
  LISTING_LIMIT_REACHED: {
    ar: 'بلغت حد الإعلانات المعروضة في باقتك — اسحب إعلانا أو أوقفه لتنشر غيره.',
    en: 'You have reached your plan’s limit of live listings — withdraw or pause one to publish another.',
    status: 409,
  },
};

