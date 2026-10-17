/**
 * ═══ أسماءُ حقول الإنجاز ═══
 *
 * المخطّط في `src/lib/domain/completion-schema.ts` يحمل مفاتيح لاتينية،
 * والصياغة هنا (البوابة ١٧). ومفتاحٌ بلا اسمٍ هنا يُعرض خامًا —
 * و`tests/completion.test.ts` يفحص أنّ لكل حقلٍ في المخطّط اسمًا.
 */
export const COMPLETION_FIELD: Record<string, string> = {
  /** مشترك */
  notes: 'ملاحظات',

  /** نقلُ المركبة */
  carrier: 'الناقل',
  trackingNo: 'رقم البوليصة',
  pickedUpAt: 'تاريخ الاستلام',
  deliveredAt: 'تاريخ التسليم',
  receivedBy: 'استلمها',
  odometerKm: 'قراءة العدّاد عند التسليم',

  /** التأمين */
  insurer: 'شركة التأمين',
  policyNo: 'رقم الوثيقة',
  coverage: 'نوع التغطية',
  startsAt: 'بداية السريان',
  endsAt: 'نهاية السريان',
  premium: 'قسط التأمين',

  /** نقلُ الملكية */
  transferNo: 'رقم معاملة النقل',
  plateNo: 'رقم اللوحة',
  transferredAt: 'تاريخ النقل',
  newOwnerName: 'المالك الجديد',
  transferFees: 'رسوم النقل',

  /** التهيئة */
  workDone: 'ما أُنجز',
  hours: 'ساعات العمل',

  /** التصوير */
  shotCount: 'عدد الصور',
  albumUrl: 'رابط الألبوم',

  /** التمويل */
  lender: 'جهة التمويل',
  applicationNo: 'رقم الطلب لدى الجهة',
  decision: 'القرار',
  approvedAmount: 'المبلغ المعتمد',
  tenorMonths: 'مدّة السداد بالأشهر',
  rejectionReason: 'سبب الرفض',

  /** غيرُ المصنَّف */
  summary: 'وصفُ ما أُنجز',
};

/** خياراتُ حقول `SELECT` — ومفاتيحُها في المخطّط */
export const COMPLETION_OPTION: Record<string, string> = {
  THIRD_PARTY: 'ضدّ الغير',
  COMPREHENSIVE: 'شامل',
  APPROVED: 'موافقة',
  CONDITIONAL: 'موافقة مشروطة',
  REJECTED: 'رفض',
};

/**
 * ═══ ووحدةُ الحقل تُقال، وإلّا قرأ الرقمُ بلا معنى ═══
 *
 * «قراءة العدّاد ١٢٠٬٤٠٠» بلا «كم» تُقرأ ريالًا، و«المدّة ٦٠» بلا
 * «شهرًا» تُقرأ أيّامًا. والوحدةُ ليست زينةً في شاشةِ عملٍ.
 */
export const COMPLETION_UNIT: Record<string, string> = {
  odometerKm: 'كم',
  hours: 'ساعة',
  tenorMonths: 'شهرًا',
  shotCount: 'صورة',
};

/**
 * ═══ ونصُّ الإنجاز يختلف باختلاف الصنف ═══
 *
 * `SERVICE_REQUEST_NEXT.DONE` كان «التقرير جاهز» **لكل صنف** — فناقلٌ
 * أوصل مركبةً ومصوّرٌ سلّم صورًا يقول لصاحبهما إنّ تقريرًا جاهز، ولا
 * تقريرَ في الدنيا. والنصُّ المعروض وعدٌ لا وصف.
 */
export const SERVICE_DONE_BY_TYPE: Record<string, string> = {
  INSPECTION: 'التقرير جاهز',
  SHIPPING: 'سُلّمت المركبة',
  INSURANCE: 'صدرت الوثيقة',
  TRANSFER: 'نُقلت الملكية',
  DETAILING: 'انتهى العمل',
  PHOTOGRAPHY: 'سُلّمت الصور',
  FINANCE: 'صدر القرار',
  OTHER: 'اكتمل',
};

/**
 * عنوانُ نموذج الإنجاز في لوحة المزوّد — فعلُ الصنف لا «أنهِ» عامّة.
 *
 * **وبلا حركةِ إعراب**: العنوانُ يُقرأ في موضعين — عنوانًا للصفحة
 * (مرفوع) وبعد «افتح» في الزرّ (منصوب). فحركةٌ مكتوبة تُصيب أحدهما
 * وتُخطئ الآخر: «افتح إثباتُ نقل الملكية» خطأٌ ظاهر لمن يقرأ.
 */
export const COMPLETION_FORM_TITLE: Record<string, string> = {
  SHIPPING: 'إثبات التسليم',
  INSURANCE: 'بيانات الوثيقة',
  TRANSFER: 'إثبات نقل الملكية',
  DETAILING: 'وصف العمل المُنجَز',
  PHOTOGRAPHY: 'تسليم الصور',
  FINANCE: 'قرار التمويل',
  OTHER: 'إثبات الإنجاز',
};
