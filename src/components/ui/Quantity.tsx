import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { formatNumber, formatPercent, type NumeralLocale } from '@/lib/arabic';
import { cn } from '@/lib/cn';

/** الوحدات المعدودة — تُضاف هنا لا تُكتب في شاشة. */
export type Unit =
  /**
   * ═══ المجرورُ صيغةٌ أخرى، والمثنّى وحده يُظهرها ═══
   *
   * «منذ يومان» و«أقل من ساعتان» خطأٌ نحويّ: حرفُ الجرّ يحكم ما بعده،
   * والمثنّى يصير «يومين» و«ساعتين». وسائرُ الصيغ لا تتغيّر، فالخطأ
   * يقع **عند اثنين وحده** — ويمرّ ما دام العدد غيرَه.
   *
   * و`Duration genitive` تختارها. والقاعدةُ المكتوبة «لا جارَّ خارج
   * صيغة الجمع» تُحفظ هكذا: الجارُّ خارجٌ، لكنّ الصيغة تعرف أنه هناك.
   */
  | 'minutesGenitive'
  | 'hoursGenitive'
  | 'daysGenitive'
  | 'weeksGenitive'
  | 'monthsGenitive'
  /** سنواتُ العضوية على المنصّة — «٥ سنوات في كارز». */
  | 'years'
  | 'yearsGenitive'
  /** بطاقاتُ الرئيسية — الاسمُ وحده، والرقمُ فوقه في عنصرٍ آخر. */
  | 'heroListings'
  | 'heroDealers'
  | 'heroFinance'
  | 'completedRequests'
  /** ما أنجزه مزوّدٌ من طلبات — سجلُّه في `Wx`. */
  | 'completedServices'
  | 'serviceConsents'
  | 'viewingsAwaiting'
  | 'weeks'
  | 'truncatedTemplates'
  /** قوالبُ الدفع المقيسة بالحدّ في A10 — «٥١ قالب دفع». */
  | 'pushTemplates'
  | 'orders'
  | 'taxRules'
  | 'activeRules'
  | 'awaitingRules'
  | 'creditNotes'
  | 'bidders'
  | 'bids'
  | 'deals'
  | 'days'
  | 'hours'
  | 'minutes'
  /** «١ س» — اختصار لا صيغة جمع: البطاقة تُمسَح بالعين ولا تُقرأ. */
  | 'hoursShort'
  | 'photos'
  | 'cars'
  | 'trims'
  | 'listings'
  | 'models'
  | 'features'
  | 'reviews'
  | 'auctions'
  | 'months'
  | 'financeProviders'
  | 'points'
  | 'services'
  | 'articles'
  | 'results'
  | 'seconds'
  | 'views'
  | 'offers'
  | 'exceeded'
  | 'accesses'
  | 'openRequests'
  | 'newCustomers'
  | 'buyers'
  | 'notifications'
  | 'transactionalNotifications'
  | 'characters'
  | 'smsSegments'
  | 'messages'
  | 'paymentPurposes'
  | 'gateways'
  | 'linkedGateways'
  | 'servableGateways'
  | 'blockedSettlements'
  | 'inFlight'
  | 'disputes'
  /** جولةُ التفاوض — عرضٌ ثم مقابلُه ثم مقابلُ مقابله. */
  | 'rounds'
  | 'approvals'
  | 'ads'
  /** مساحاتُ الإعلانات في A30 — «٧ مساحات». */
  | 'adSlots'
  /** سقفُ إعلانات الجلسة — «٤ إعلانات كحد أقصى في الجلسة». */
  | 'sessionAdCap'
  | 'cities'
  | 'steps'
  | 'deposits'
  | 'members'
  | 'attachments'
  /** بلاغاتُ الزوّار على إعلان — «٣ بلاغات». */
  | 'reports'
  /** المستنداتُ النظامية — «٨ مستندات». */
  | 'legalDocs'
  /** نسخُ المستندات القانونية في سجلّها — «٩ نسخ». */
  | 'legalVersions'
  /** حساباتُ المستخدمين — «١١ حسابًا قبلوا النسخة». */
  | 'accounts'
  /** ماركاتُ الكتالوج في مرشّح البحث — «اعرض ١٠ ماركات». */
  | 'brands'
  /** بنودُ ما تشمله خدمةٌ أو قالبُ فحص — «٥ بنود». */
  | 'items'
  /** طلباتُ خدمةٍ بلا وصفِ حالها — «٨ طلبات». */
  | 'serviceRequests'
  /** إجراءاتٌ في سجلّ التدقيق — «٤٠ إجراء». */
  | 'auditActions'
  | 'ledgerLines'
  /** طلباتٌ مالُها محجوز ينتظر ضغطةَ الإفراج (A25). */
  | 'awaitingRelease'
  /** أقسامُ مستندٍ أو بنكِ أسئلة — «موزّعة على ثلاثة أقسام». */
  | 'docSections'
  | 'events'
  | 'monthsRange'
  | 'seats'
  /** سلندراتُ المحرك — تُعرض في بطاقة الموروث من الفئة. */
  | 'cylinders'
  | 'stages'
  | 'banners'
  | 'plans'
  | 'subscribers'
  | 'providers'
  | 'breaches'
  | 'reportsReady'
  | 'rows'
  | 'sessions'
  | 'walletLines'
  | 'extensions'
  | 'campaignsLive'
  | 'inventory'
  | 'linkedServices'
  | 'endedAuctions'
  | 'uploadedImages'
  | 'ownedExports'
  | 'km';

/**
 * عدد + وحدته.
 *
 * **الجمع العربي ست حالات** (zero · one · two · few · many · other):
 * «طلب واحد» و«طلبان» و«٩ طلبات» و«١١ طلبًا». كتابة الوحدة يدويًا
 * تنتج «٩ طلب» — خطأ نحوي يتكرّر في كل شاشة. القواعد في `units`
 * بصيغة ICU، ولا وحدة تُكتب خارج هذا المكوّن.
 *
 * والنصّ كله مقطع معزول واحد: الرقم ووحدته لا يفترقان، فلا ينزلق
 * ما بينهما في RTL. ولا `font-num` هنا — سلسلة الخط العربية تضع
 * الأرقام في Arial تلقائيًا عبر `unicode-range`، وفرضها على النصّ
 * كله يضع الحروف العربية في Arial أيضًا.
 */
export function Quantity({
  unit,
  count,
  className,
}: {
  unit: Unit;
  count: number;
  className?: string;
}) {
  const t = useTranslations('units');
  const locale = useLocale() as NumeralLocale;
  /**
   * `count` للاختيار النحوي، و`n` للعرض.
   * `#` في ICU يطبع بـ`Intl.NumberFormat('ar')` وهو **لاتيني** —
   * فيخرج «9 طلبات». الرقم يُصاغ هنا ثم يُمرَّر جاهزًا.
   */
  return (
    <span className={cn('bidi-isolate', className)}>
      {t(unit, { count, n: formatNumber(count, locale) })}
    </span>
  );
}

/**
 * نسبة مئوية.
 * الإشارة والرقم وعلامة النسبة في **مقطع واحد** — تقسيمها إلى
 * ثلاثة عناصر يجعل الاتجاه يفرّقها فتُقرأ «٪ ٤٠ −».
 *
 * **و`signed` تُطلب للفرق وحده.** «+٥٠٪ اكتمال الملف» تقرأ المستوى
 * زيادةً، والتصميم يكتب الفروق بإشارةٍ والمستويات بلا — انظر
 * `formatPercent`.
 */
export function Percent({
  value,
  signed,
  className,
}: {
  value: number;
  /** فرقٌ لا مستوى: «+١٤٪» صعودًا و«−٣٪» هبوطًا */
  signed?: boolean;
  className?: string;
}) {
  const locale = useLocale() as NumeralLocale;
  return (
    <span className={cn('bidi-isolate', className)}>
      {formatPercent(value, locale, { signed })}
    </span>
  );
}
