/**
 * صياغة مفاتيح الخصائص — **في ملفٍ بلا `db`**.
 *
 * لأن `PlanTable` مكوّن عميل، واستيرادُه ثابتًا من وحدةٍ تستورد `db`
 * يجرّ Prisma إلى حزمة المتصفّح ويُسقط البناء. (البوابة `checkClientDbImports`.)
 */

export const ENTITLEMENT_LABEL: Record<string, string> = {
  can_direct_sale: 'البيع المباشر',
  can_negotiate: 'التفاوض بالعروض',
  can_auction: 'إنشاء مزاد',
  max_active_listings: 'سقف الإعلانات النشطة',
  featured_slots: 'مرات التمييز المجانية',
  bulk_upload: 'الرفع الجماعي',
  team_seats: 'مقاعد الفريق',
  commission_pct: 'نسبة العمولة',
  deposit_required: 'اشتراط العربون',
  priority_support: 'دعم ذو أولوية',
};

export const TYPE_LABEL: Record<string, string> = {
  bool: 'منطقي',
  int: 'عدد',
  percent: 'نسبة',
};

/**
 * نسبةٌ للعرض — **بلا أصفارٍ زائدة**.
 *
 * `0.00` من `Decimal(10,2)` تُعرض «٠٫٠٠٪» وهي «٠٪»، و`1.50` تُعرض
 * «١٫٥٠٪» وهي «١٫٥٪». والصفر الزائد يجعل القارئ يبحث عن فرقٍ ليس فيه.
 */
export function pctLabel(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  // `toArabicDigits` لا تمسّ الفاصلة، فتُبدَّل بالعربية هنا
  return String(number).replace('.', '٫');
}

/** «خيارات البيع» في جدول التصميم — ثلاث خصائص مجموعةً في خليّة. */
export function saleOptions(entitlements: readonly { key: string; value: string }[]): string {
  const on = (key: string): boolean =>
    entitlements.find((row) => row.key === key)?.value === 'true';

  const options = [
    on('can_direct_sale') ? 'مباشر' : null,
    on('can_negotiate') ? 'تفاوض' : null,
    on('can_auction') ? 'مزاد' : null,
  ].filter((label) => label !== null);

  // باقةٌ بلا خيار بيعٍ واحد لا تبيع شيئًا — والفراغ يُقرأ عطلًا
  if (options.length === 0) return 'لا شيء';

  const all = options.length === 3;
  const bulk = on('bulk_upload');

  if (all && bulk) return 'الكل + رفع جماعي';
  return options.join(' · ') + (bulk ? ' + رفع جماعي' : '');
}
