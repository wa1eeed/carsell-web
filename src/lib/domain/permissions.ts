import type { AdminRole } from '@/generated/prisma/enums';

/**
 * مصفوفة الصلاحيات — DESIGN-DECISIONS ٣٤.
 *
 * **الكود يسأل عن الصلاحية لا عن الدور.** `can(role, 'finance.view')`
 * لا `role === 'FINANCE'` — وإلا انتشر شرط الدور في عشرين موضعًا
 * وصار تعديل المصفوفة تعديلًا في عشرين ملفًا.
 */

export type Permission =
  | 'dashboard.view'
  | 'finance.view'
  | 'orders.view'
  | 'orders.changeStage'
  | 'escrow.release'
  | 'users.view'
  | 'users.viewIdentity'
  | 'users.suspend'
  | 'identity.review'
  | 'listings.review'
  | 'reports.handle'
  | 'catalog.manage'
  | 'catalog.uploadLogo'
  | 'services.manage'
  | 'serviceRequests.handle'
  | 'notifications.manage'
  | 'integrations.view'
  | 'integrations.rotateKeys'
  | 'audit.view'
  | 'team.manage';

/** `true` كامل · `'read'` عرض بلا تعديل · غياب المفتاح = ممنوع. */
export type Grant = true | 'read';

/**
 * إجراءات لا يكفيها دور واحد ولو كان الأعلى: تُنشئ `ApprovalRequest`
 * ويوافق عليها عضو ثانٍ (`SUPER_ADMIN` أو `FINANCE`).
 */
export const DUAL_APPROVAL: ReadonlySet<Permission> = new Set([
  'escrow.release',
  'integrations.rotateKeys',
]);

const MATRIX: Readonly<Record<AdminRole, Partial<Record<Permission, Grant>>>> = {
  SUPER_ADMIN: {
    'dashboard.view': true, 'finance.view': true, 'orders.view': true,
    'orders.changeStage': true, 'escrow.release': true, 'users.view': true,
    'users.viewIdentity': true, 'users.suspend': true, 'identity.review': true,
    'listings.review': true, 'reports.handle': true, 'catalog.manage': true,
    'catalog.uploadLogo': true, 'services.manage': true,
    'serviceRequests.handle': true, 'notifications.manage': true,
    'integrations.view': true, 'integrations.rotateKeys': true,
    'audit.view': true, 'team.manage': true,
  },
  OPS: {
    'dashboard.view': true, 'orders.view': true, 'orders.changeStage': true,
    'users.view': true, 'users.suspend': true, 'identity.review': true,
    'listings.review': true, 'reports.handle': true, 'services.manage': true,
    'serviceRequests.handle': true, 'integrations.view': true,
    'audit.view': 'read',
  },
  FINANCE: {
    'dashboard.view': true, 'finance.view': true, 'orders.view': true,
    'escrow.release': true, 'services.manage': true, 'audit.view': 'read',
  },
  SUPPORT: {
    'dashboard.view': true, 'orders.view': true, 'users.view': true,
    'users.viewIdentity': true, 'identity.review': true, 'reports.handle': true,
    'serviceRequests.handle': true,
  },
  CONTENT: {
    'listings.review': true, 'catalog.manage': true, 'catalog.uploadLogo': true,
    'notifications.manage': true,
  },
  /**
   * READONLY لا يرى المالية ولا الهوية إطلاقًا — القاعدة ٢ فوق المصفوفة.
   */
  READONLY: {
    'dashboard.view': 'read', 'orders.view': 'read', 'users.view': 'read',
    'listings.review': 'read', 'reports.handle': 'read',
    'catalog.manage': 'read', 'services.manage': 'read',
    'serviceRequests.handle': 'read', 'notifications.manage': 'read',
    'audit.view': 'read',
  },
};

/** هل يملك الدور هذه الصلاحية بأي مستوى؟ */
export function can(role: AdminRole, permission: Permission): boolean {
  return MATRIX[role][permission] !== undefined;
}

/** هل يملكها بالكتابة؟ `'read'` يعني العرض وحده. */
export function canWrite(role: AdminRole, permission: Permission): boolean {
  return MATRIX[role][permission] === true;
}

/** هل يلزم هذا الإجراء موافقة عضو ثانٍ؟ */
export function needsDualApproval(permission: Permission): boolean {
  return DUAL_APPROVAL.has(permission);
}

/**
 * أي وجهة غير مذكورة: `SUPER_ADMIN` وحده — القاعدة ٤ فوق المصفوفة.
 * لذلك تُقرأ من المصفوفة لا من قائمة استثناءات.
 */
export function permissionsOf(role: AdminRole): Permission[] {
  return Object.keys(MATRIX[role]) as Permission[];
}
