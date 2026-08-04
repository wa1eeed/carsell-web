import type { ReportKey, ReportSchedule } from '@/lib/domain/report-catalog';

/**
 * تسميات التقارير (A36) — **هنا لا في النطاق** (البوابة ١٧).
 *
 * النطاق يعيد مفاتيح، والصياغة هنا. والملف بلا `db` عمدًا: الشاشات
 * تستورده، ووحدةٌ تستورد `db` تجرّ Prisma إلى حزمة المتصفّح.
 */

export const REPORT_NAME: Record<ReportKey, string> = {
  sales_commissions: 'المبيعات والعمولات',
  ledger: 'دفتر الأستاذ',
  inventory_aging: 'أعمار المخزون',
  auction_performance: 'أداء المزادات',
  service_requests: 'طلبات الخدمات والمزوّدين',
  customers: 'العملاء وسلوكهم',
};

/** عمود «المحتوى» في التصميم. */
export const REPORT_CONTENT: Record<ReportKey, string> = {
  sales_commissions: 'قيمة المبيعات · العمولة · الضريبة',
  ledger: 'القيود بطرفيها ومراجعها',
  inventory_aging: 'الإعلانات وأيام العرض',
  auction_performance: 'الرسوّ · العرابين · التمديد',
  service_requests: 'الإسناد والالتزام',
  customers: 'يحتوي بيانات شخصية',
};

export const REPORT_SCHEDULE_LABEL: Record<ReportSchedule, string> = {
  weekly_sunday: 'أسبوعيًّا — الأحد',
  weekly: 'أسبوعيًّا',
  monthly: 'شهريًّا',
  on_demand: 'عند الطلب',
};
