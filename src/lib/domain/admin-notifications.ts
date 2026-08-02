import { db } from '@/lib/db';
import type { AdminUser } from '@/generated/prisma/client';
import {
  SMS_COST_PER_SEGMENT,
  groupLabel,
  groupOf,
  smsMetrics,
  undeclaredVariables,
} from './notification-text';

/**
 * A8 — الإشعارات والقوالب.
 *
 * القالب نصٌّ فيه متغيّرات: `{first_name}` و`{amount}`. والمتغيّر الذي
 * لا يعرفه المُرسِل يصل المستخدم **كما كُتب** — «مرحبًا {frist_name}».
 * فالتصريح بالمتغيّرات ليس توثيقًا: هو ما يُقاس عليه النصّ قبل الحفظ.
 *
 * والدوالّ الخالصة في `notification-text.ts` لأن المحرّر في المتصفّح
 * يحتاجها — و`db` لا يعبر ذلك الحدّ.
 */

// يُعاد تصديرها ليبقى للشاشة والاختبار مدخلٌ واحد
export {
  SMS_COST_PER_SEGMENT,
  groupLabel,
  groupOf,
  renderTemplate,
  smsMetrics,
  undeclaredVariables,
  usedVariables,
} from './notification-text';

export type TemplateRow = {
  key: string;
  group: string;
  groupLabel: string;
  subjectAr: string | null;
  bodyAr: string | null;
  bodyEn: string | null;
  subjectEn: string | null;
  smsAr: string | null;
  smsEn: string | null;
  channels: { email: boolean; sms: boolean; push: boolean; inApp: boolean };
  priority: string;
  variables: string[];
  active: boolean;
  /** **كم أُرسل فعلًا** — محسوب من `Notification` لا عمودًا في القالب. */
  sent: number;
  /** لا يمكن للمستخدم إيقافه (ترميز A8): OTP والدفع والمزاد الذي يشارك فيه. */
  critical: boolean;
};

export async function listTemplates(since?: Date): Promise<TemplateRow[]> {
  const [templates, counts] = await Promise.all([
    db.notificationTemplate.findMany({ orderBy: { key: 'asc' } }),
    db.notification.groupBy({
      by: ['templateKey'],
      ...(since === undefined ? {} : { where: { createdAt: { gte: since } } }),
      _count: { _all: true },
    }),
  ]);

  return templates.map((template) => ({
    key: template.key,
    group: groupOf(template.key),
    groupLabel: groupLabel(groupOf(template.key)),
    subjectAr: template.subjectAr,
    subjectEn: template.subjectEn,
    bodyAr: template.bodyAr,
    bodyEn: template.bodyEn,
    smsAr: template.smsAr,
    smsEn: template.smsEn,
    channels: {
      email: template.channelEmail,
      sms: template.channelSms,
      push: template.channelPush,
      inApp: template.channelInApp,
    },
    priority: template.priority,
    variables: template.variables,
    active: template.active,
    sent: counts.find((row) => row.templateKey === template.key)?._count._all ?? 0,
    critical: template.priority === 'critical',
  }));
}

export type TemplateEdit = {
  subjectAr?: string | null;
  subjectEn?: string | null;
  bodyAr?: string | null;
  bodyEn?: string | null;
  smsAr?: string | null;
  smsEn?: string | null;
  variables?: string[];
  channelEmail?: boolean;
  channelSms?: boolean;
  channelPush?: boolean;
  channelInApp?: boolean;
  priority?: string;
  active?: boolean;
};

export type SaveResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: 'NOT_FOUND' | 'UNDECLARED_VARIABLES'; variables?: string[] };

export async function saveTemplate(
  admin: AdminUser,
  key: string,
  edit: TemplateEdit,
  ip: string | null,
  now = new Date(),
): Promise<SaveResult> {
  const before = await db.notificationTemplate.findUnique({ where: { key } });
  if (before === null) return { ok: false, reason: 'NOT_FOUND' };

  const merged = {
    subjectAr: edit.subjectAr ?? before.subjectAr,
    subjectEn: edit.subjectEn ?? before.subjectEn,
    bodyAr: edit.bodyAr ?? before.bodyAr,
    bodyEn: edit.bodyEn ?? before.bodyEn,
    smsAr: edit.smsAr ?? before.smsAr,
    smsEn: edit.smsEn ?? before.smsEn,
  };

  /**
   * الفحص على **النصّ المدموج** لا على المُرسَل وحده: تعديلُ قائمة
   * المتغيّرات وحدها قد يُبطل نصًّا محفوظًا من قبل، وحفظُه بلا فحص
   * يترك القالب مكسورًا بلا أن يُلمَس نصّه.
   */
  const undeclared = undeclaredVariables(merged, edit.variables ?? before.variables);
  if (undeclared.length > 0) {
    return { ok: false, reason: 'UNDECLARED_VARIABLES', variables: undeclared };
  }

  const data = { ...edit, ...merged };
  const changed = Object.entries(data).some(([field, value]) => {
    const old = (before as unknown as Record<string, unknown>)[field];
    return Array.isArray(value) || Array.isArray(old)
      ? JSON.stringify(value) !== JSON.stringify(old)
      : value !== old;
  });
  if (!changed) return { ok: true, changed: false };

  await db.notificationTemplate.update({ where: { key }, data });
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'NotificationTemplate',
      entityId: key,
      action: 'notification.template_saved',
      before: {
        subjectAr: before.subjectAr, bodyAr: before.bodyAr, smsAr: before.smsAr,
        subjectEn: before.subjectEn, bodyEn: before.bodyEn, smsEn: before.smsEn,
        variables: before.variables, priority: before.priority, active: before.active,
        channels: [before.channelEmail, before.channelSms, before.channelPush, before.channelInApp],
      },
      after: {
        subjectAr: data.subjectAr, bodyAr: data.bodyAr, smsAr: data.smsAr,
        subjectEn: data.subjectEn, bodyEn: data.bodyEn, smsEn: data.smsEn,
        variables: edit.variables ?? before.variables,
        priority: edit.priority ?? before.priority,
        active: edit.active ?? before.active,
      },
      ip,
      createdAt: now,
    },
  });

  return { ok: true, changed: true };
}

export type ChannelStats = {
  sentThisMonth: number;
  smsSegments: number;
  smsCost: string;
  byChannel: { channel: string; label: string; templates: number }[];
};

export async function channelStats(since: Date): Promise<ChannelStats> {
  const [sent, templates] = await Promise.all([
    db.notification.count({ where: { createdAt: { gte: since } } }),
    db.notificationTemplate.findMany({
      where: { active: true },
      select: { channelEmail: true, channelSms: true, channelPush: true, channelInApp: true, smsAr: true },
    }),
  ]);

  /**
   * تكلفة الرسائل **تقديرٌ معلنٌ أنه تقدير**: عدد ما أُرسل مضروبًا في
   * مقاطع نصّ القالب. ولا مزوّد بعد، فالرقم الحقيقي لا وجود له —
   * وعرضُه رقمًا نهائيًا أسوأ من عرضه تقديرًا.
   */
  const smsTemplates = templates.filter((template) => template.channelSms);
  const averageSegments =
    smsTemplates.length === 0
      ? 0
      : smsTemplates.reduce((total, template) => total + smsMetrics(template.smsAr ?? '').segments, 0) /
        smsTemplates.length;

  const smsSegments = Math.round(sent * averageSegments);

  return {
    sentThisMonth: sent,
    smsSegments,
    smsCost: (smsSegments * SMS_COST_PER_SEGMENT).toFixed(2),
    byChannel: [
      { channel: 'email', label: 'بريد', templates: templates.filter((t) => t.channelEmail).length },
      { channel: 'sms', label: 'رسالة', templates: smsTemplates.length },
      { channel: 'push', label: 'دفع', templates: templates.filter((t) => t.channelPush).length },
      { channel: 'inApp', label: 'داخل التطبيق', templates: templates.filter((t) => t.channelInApp).length },
    ],
  };
}
