/**
 * ═══ تسمياتُ لوحة المزوّدين ═══
 *
 * والنطاق يعيد مفاتيح — `stepsFor` تُرجع `accept` و`start` و`complete`
 * و`fail`، والصياغة هنا (البوابة ١٧). فإضافةُ صنفٍ جديد لاحقًا تضيف
 * مفتاحًا وتسميةً، لا شاشةً.
 */
export const PROVIDER_STEP_LABEL: Record<string, string> = {
  accept: 'اقبل الطلب',
  start: 'ابدأ التنفيذ',
  complete: 'أكمِل',
  fail: 'تعذّر التنفيذ',
};

/** ما يقوله كل فعلٍ قبل أن يُضغط — فالمزوّد يعرف أثره لا اسمه. */
export const PROVIDER_STEP_NOTE: Record<string, string> = {
  accept: 'يصير الطلب لك وحدك، ويختفي من طابور بقيّة المزوّدين.',
  start: 'يعلم صاحب الطلب أن العمل بدأ.',
  complete: 'يُنهي الطلب ويُسلّم نتيجته.',
  fail: 'يُنهيه متعذّرًا بسببٍ مكتوب، ويراجعه فريق المنصّة.',
};

export const PROVIDER_REQUEST_STATUS: Record<string, string> = {
  NEW: 'معروض',
  ASSIGNED: 'مقبول — لم يبدأ',
  IN_PROGRESS: 'قيد التنفيذ',
  DONE: 'مكتمل',
  FAILED: 'متعذّر',
  REFUNDED: 'رُدّ مبلغه',
};

/**
 * ═══ حالُ حساب الدفع كما يُقرأ ═══
 *
 * **وثمانيةٌ لا اثنتان**: طيُّها في «مفعَّل/غير مفعَّل» يُخفي الفرق بين
 * «ينقصه مستند» و«مرفوض» — وهما إجراءان مختلفان تمامًا لمن يتابع.
 */
export const PROVIDER_ACCOUNT_STATUS: Record<string, string> = {
  NONE: 'لا حساب دفع بعد',
  PENDING: 'أُنشئ وينتظر استكمالًا',
  MISSING_DOCS: 'ينقصه مستند',
  UNDER_REVIEW: 'قيد مراجعة المزوّد',
  SEMI_ACTIVE: 'مفعَّل جزئيًّا',
  ACTIVE: 'مفعَّل',
  HOLD: 'موقوف مؤقّتًا',
  REJECTED: 'مرفوض',
  DISABLED: 'معطَّل',
};

/** وما يعنيه كلُّ حالٍ عمليًّا — فالمشغّل يعرف ما يفعل لا ما يُسمّى. */
export const PROVIDER_ACCOUNT_NOTE: Record<string, string> = {
  NONE: 'لن يدخل طابور الإسناد حتى يُفتح له حساب — فلا سبيل إلى دفع مستحقّه.',
  PENDING: 'أُنشئ لدى المزوّد وينتظر استكمال بياناته ومستنداته.',
  MISSING_DOCS: 'المزوّد يطلب مستندًا — راجع السبب أدناه وأرسله.',
  UNDER_REVIEW: 'قُدّم للمراجعة. لا إجراء مطلوب منّا حتى يردّ.',
  SEMI_ACTIVE: 'يقبض، ولا يستوفي كل وسائل الدفع بعد.',
  ACTIVE: 'يدخل طابور الإسناد ويصله مستحقّه مباشرةً من البوّابة.',
  HOLD: 'أوقفه المزوّد مؤقّتًا — لا تُسنَد إليه طلبات حتى يُرفع.',
  REJECTED: 'رُفض الحساب. راجع السبب، وقد يلزم إعادة التقديم.',
  DISABLED: 'أُغلق الحساب — ولا يصله مال.',
};

/** صفةُ المنشأة — وهي تحدّد ما تطلبه الجهة المنظِّمة من مستندات. */
export const ACCOUNT_KIND_LABEL: Record<string, string> = {
  FREELANCER: 'عمل حرّ',
  ESTABLISHMENT: 'مؤسّسة',
  COMPANY: 'شركة',
  GOVERNMENT: 'جهة حكومية',
  CHARITY: 'جهة خيرية',
};

export const ACCOUNT_SIGNATORY_LABEL: Record<string, string> = {
  OWNER: 'المالك',
  COMMERCIAL_CONTRACT: 'عقدٌ تجاريّ',
  POWER_OF_ATTORNEY: 'وكالة',
};

/** المستندات كما يسمّيها المزوّد — تُترجم ولا تُخترع. */
export const ACCOUNT_DOCUMENT_LABEL: Record<string, string> = {
  commercial_registration: 'السجل التجاري',
  owner_id: 'هوية المالك',
  bank_iban_certificate: 'شهادة الآيبان',
  freelance_certificate: 'وثيقة العمل الحرّ',
  power_of_attorney: 'الوكالة',
  commercial_contract: 'العقد التجاري',
  activity_license: 'ترخيص النشاط',
};

/**
 * ولمَ يُردّ فتحُ الحساب — **ولكلٍّ إجراءٌ مختلف**.
 *
 * فـ«اضبط المصفوفة» و«لا مفتاح للبوّابة» حالتان يفعل فيهما المشغّل
 * شيئين مختلفين، وطيُّهما في «تعذّر الفتح» يجعله يبحث.
 */
export const ACCOUNT_OPEN_FAILURE: Record<string, string> = {
  FILE_INCOMPLETE: 'أكمل ملفَّ التسجيل أوّلًا — الصفة والاسم الآليّ وعدد المُلّاك والتوقيع وبريد المدير.',
  NO_EMAIL: 'المزوّد بلا بريد — أضفه من قائمة المزوّدين.',
  NO_FEES: 'اضبط مصفوفة رسوم بوّابة المزوّدين من إعدادات الدفع قبل فتح أي حساب.',
  NOT_CONFIGURED: 'بوّابة المزوّدين بلا مفتاح — اضبطه من التكاملات.',
  ALREADY_OPEN: 'له حسابٌ مفتوح.',
  NO_ACCOUNT: 'لا حساب له بعد.',
  UPSTREAM: 'ردَّ المزوّد برفض — والسبب أدناه.',
  SLUG: 'الاسم الآليّ حروفٌ لاتينية صغيرة وأرقامٌ وشرطةٌ سفلية، من ثلاثة أحرف إلى أربعين.',
  ADMIN_EMAIL: 'بريد المدير غير صحيح.',
  OWNERS: 'عدد المُلّاك واحدٌ على الأقل.',
  SIGNATORY_COUNT: 'عدد الموقّعين مطلوبٌ حين لا يكون التوقيع للمالك.',
  WEBSITE: 'الموقع يبدأ بـhttp أو https — أو يُترك فارغًا.',
};
