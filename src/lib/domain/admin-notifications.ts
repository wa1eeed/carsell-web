import { db } from '@/lib/db';
import type { AdminUser } from '@/generated/prisma/client';
import {
  SMS_COST_PER_SEGMENT,
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
  groupOf,
  renderTemplate,
  smsMetrics,
  undeclaredVariables,
  usedVariables,
} from './notification-text';

export type TemplateRow = {
  key: string;
  group: string;
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
  byChannel: { channel: string; templates: number }[];
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
      { channel: 'email', templates: templates.filter((t) => t.channelEmail).length },
      { channel: 'sms', templates: smsTemplates.length },
      { channel: 'push', templates: templates.filter((t) => t.channelPush).length },
      { channel: 'inApp', templates: templates.filter((t) => t.channelInApp).length },
    ],
  };
}

export type NotificationLogRow = {
  id: string;
  templateKey: string;
  /** العنوان العربيّ للقالب — و`null` لمفتاحٍ لا قالبَ له (البوابة ٣٤). */
  subjectAr: string | null;
  priority: string;
  recipientName: string;
  recipientPhone: string;
  entityType: string | null;
  entityId: string | null;
  at: string;
  /** أقرأه صاحبُه — وهو أقربُ ما عندنا إلى «وصل». */
  readAt: string | null;
};

export const NOTIFICATION_LOG_ROWS = 60;

/**
 * ═══ سجلّ الإرسال — A8 ═══
 *
 * النِّسَب تقول **كم**، ولا شيء يقول **لمن**. وسؤالُ المشغّل حين يكتب
 * له مستخدم «لم يصلني إشعار» ليس نسبةً: هو صفٌّ باسمه ووقته.
 *
 * وهذا السجلّ غيرُ سجلّ A10: ذاك `PushSend` — ما خرج إلى جهاز، وصفوفُه
 * صفرٌ بلا تطبيق. وهذا `Notification` — ما كُتب في جرس المستخدم، وهو
 * يُكتب اليوم لمستخدمين حقيقيّين.
 *
 * **و«أقرأه» أقربُ ما عندنا إلى «وصل»**: لا مزوّدَ يردّ إيصالًا، فلا
 * يُقال «سُلّم» عمّا لا نعرفه.
 */
export async function notificationLog(
  filter: { templateKey?: string } = {},
): Promise<NotificationLogRow[]> {
  const rows = await db.notification.findMany({
    where: filter.templateKey === undefined ? {} : { templateKey: filter.templateKey },
    orderBy: { createdAt: 'desc' },
    take: NOTIFICATION_LOG_ROWS,
    select: {
      id: true,
      templateKey: true,
      priority: true,
      entityType: true,
      entityId: true,
      createdAt: true,
      readAt: true,
      user: { select: { name: true, phone: true } },
    },
  });

  const keys = [...new Set(rows.map((row) => row.templateKey))];
  const templates = await db.notificationTemplate.findMany({
    where: { key: { in: keys } },
    select: { key: true, subjectAr: true },
  });
  const subject = new Map(templates.map((row) => [row.key, row.subjectAr]));

  return rows.map((row) => ({
    id: row.id,
    templateKey: row.templateKey,
    subjectAr: subject.get(row.templateKey) ?? null,
    priority: row.priority,
    recipientName: row.user.name ?? row.user.phone,
    recipientPhone: row.user.phone,
    entityType: row.entityType,
    entityId: row.entityId,
    at: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  }));
}
