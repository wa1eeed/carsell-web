import type { AdminRole } from '@/generated/prisma/enums';
import type { Permission } from '@/lib/domain/permissions';

/**
 * ═══ المصفوفة بالعربية — **وإلّا فهي شيفرة معروضة** ═══
 *
 * شاشة A35 تقول في صدرها إن المصفوفة تُعرض «لأن من يراجع ‹من يستطيع
 * الإفراج عن ضمان› لا ينبغي أن يفتح ملف شيفرة ليعرف» — **وكانت تعرض
 * `escrow.release`**. فمن فتحها قرأ اثنين وعشرين مفتاحًا لاتينيًّا
 * بنقطةٍ في وسطها، أي فتح ملف الشيفرة في نافذةٍ أجمل.
 *
 * والتصميم يسمّي العمود «الوحدة» ويكتب صفوفه عربيّةً: «الإفراج عن
 * الضمان» · «توثيق الهوية — عرض المستند» · «الكتالوج والمميّزات».
 * فالتسمية هنا ليست تجميلًا — هي الشاشة نفسها.
 *
 * **والمفتاح يبقى تحت التسمية** صغيرًا: المراجعة بالعربية، ومن يصحّح
 * الشيفرة يحتاج الاسم الذي يُبحث عنه. والسطران يخدمان قارئين.
 */

/** المجموعات بترتيب عرضها — وهي أقسام الشريط الجانبي نفسها. */
export const PERMISSION_MODULES: readonly {
  title: string;
  permissions: readonly Permission[];
}[] = [
  {
    title: 'التشغيل',
    permissions: ['dashboard.view', 'orders.view', 'orders.changeStage', 'listings.review', 'reports.handle'],
  },
  {
    title: 'المال والضمان',
    permissions: ['finance.view', 'escrow.release', 'payouts.send', 'wallet.adjust'],
  },
  {
    title: 'العملاء والهوية',
    permissions: ['users.view', 'users.viewIdentity', 'users.suspend', 'identity.review'],
  },
  {
    title: 'المحتوى والخدمات',
    permissions: ['catalog.manage', 'catalog.uploadLogo', 'services.manage', 'serviceRequests.handle', 'notifications.manage'],
  },
  {
    title: 'النظام',
    permissions: ['integrations.view', 'integrations.rotateKeys', 'team.manage', 'audit.view'],
  },
];

/**
 * تسمية كل صلاحية — **بصيغة ما تُجيزه لا بصيغة اسمها**.
 *
 * «تدوير مفاتيح الربط» تقول للمراجع ما يقع إن مُنحت، و
 * `integrations.rotateKeys` تقول له أين يقرأ. والمراجعة حَوكمةٌ
 * فالأولى أوّلًا.
 */
export const PERMISSION_LABEL: Record<Permission, string> = {
  'dashboard.view': 'لوحة القيادة والأرقام',
  'orders.view': 'الطلبات',
  'orders.changeStage': 'تغيير مرحلة الطلب',
  'listings.review': 'مراجعة الإعلانات',
  'reports.handle': 'معالجة البلاغات',

  'finance.view': 'المدفوعات والضمان',
  'escrow.release': 'الإفراج عن الضمان',
  'payouts.send': 'تحويل مستحقّات البائع',
  'wallet.adjust': 'تسوية رصيد محفظة',

  'users.view': 'العملاء',
  'users.viewIdentity': 'توثيق الهوية — عرض المستند',
  'users.suspend': 'إيقاف حساب',
  'identity.review': 'مراجعة توثيق الهوية',

  'catalog.manage': 'الكتالوج والمميّزات',
  'catalog.uploadLogo': 'رفع شعار ماركة',
  'services.manage': 'الخدمات وأسعارها',
  'serviceRequests.handle': 'معالجة طلبات الخدمات',
  'notifications.manage': 'الإشعارات والقوالب',

  'integrations.view': 'التكاملات والمفاتيح',
  'integrations.rotateKeys': 'تدوير مفاتيح الربط',
  'team.manage': 'الفريق والصلاحيات',
  'audit.view': 'سجل التدقيق',
};

/**
 * ورأس العمود `SUPER` لا `SUPER_ADMIN` — كما في التصميم.
 *
 * وليس اختصارًا لضيق المكان: ستّة أعمدة في عرضٍ واحد، وأطولُ رأسٍ
 * يُضيّق الخمسة الباقية. والمعنى لا يضيع.
 */
export const ROLE_HEAD: Record<AdminRole, string> = {
  SUPER_ADMIN: 'SUPER',
  OPS: 'OPS',
  FINANCE: 'FINANCE',
  SUPPORT: 'SUPPORT',
  CONTENT: 'CONTENT',
  READONLY: 'READONLY',
};

/** وبالعربية حيث يُذكر الدور في جملة — لا في رأس عمود. */
export const ROLE_LABEL: Record<AdminRole, string> = {
  SUPER_ADMIN: 'مالك اللوحة',
  OPS: 'التشغيل',
  FINANCE: 'المالية',
  SUPPORT: 'الدعم',
  CONTENT: 'المحتوى',
  READONLY: 'قراءة فقط',
};
