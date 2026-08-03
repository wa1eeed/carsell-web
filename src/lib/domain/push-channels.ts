import { db } from '@/lib/db';
import type { AdminUser } from '@/generated/prisma/client';

/**
 * A10 — إشعارات الدفع.
 *
 * ═══ معيار القبول ═══ **الإشعارات الحرِجة لا يمكن إيقافها.**
 *
 * والحراسة في المجال لا في الشاشة: مفتاحٌ معطَّل في الواجهة يُلتفّ
 * عليه بطلبٍ واحد، ومن يخسر مزادًا لأنه أطفأ إشعارًا ظنّه تسويقيًّا لا
 * يعنيه أين كان الفحص.
 */

export type ChannelRow = {
  key: string;
  nameAr: string;
  /** `false` للحرِجة — والمستخدم لا يراها مفتاحًا أصلًا. */
  userControllable: boolean;
  defaultOn: boolean;
  sort: number;
  /** كم مستخدمًا أوقفها فعلًا — محسوب من التفضيلات لا مخزَّنًا. */
  disabledBy: number;
};

export async function listChannels(): Promise<ChannelRow[]> {
  const [channels, disabled] = await Promise.all([
    db.pushChannel.findMany({ orderBy: [{ sort: 'asc' }, { key: 'asc' }] }),
    db.notificationPreference.groupBy({
      by: ['channelKey'],
      where: { enabled: false },
      _count: { _all: true },
    }),
  ]);

  return channels.map((channel) => ({
    key: channel.key,
    nameAr: channel.nameAr,
    userControllable: channel.userControllable,
    defaultOn: channel.defaultOn,
    sort: channel.sort,
    disabledBy: disabled.find((row) => row.channelKey === channel.key)?._count._all ?? 0,
  }));
}

export type PreferenceResult =
  | { ok: true; enabled: boolean }
  | { ok: false; reason: 'UNKNOWN_CHANNEL' | 'CRITICAL_CHANNEL' };

/**
 * ═══ معيار A10 ═══ **قناة حرِجة لا تُطفأ.**
 *
 * والرفض صريح باسمه (`CRITICAL_CHANNEL`) لا صامت: إطفاءٌ يُقبل ظاهرًا
 * ثم يُتجاهَل باطنًا يجعل المستخدم يظنّ أنه أطفأها، فيلوم المنصّة حين
 * تصله. والقاعدة تُشرَح له بدل أن تُخفى عنه.
 */
export async function setPreference(
  userId: string,
  channelKey: string,
  enabled: boolean,
): Promise<PreferenceResult> {
  const channel = await db.pushChannel.findUnique({ where: { key: channelKey } });
  if (channel === null) return { ok: false, reason: 'UNKNOWN_CHANNEL' };

  if (!channel.userControllable && !enabled) {
    return { ok: false, reason: 'CRITICAL_CHANNEL' };
  }

  await db.notificationPreference.upsert({
    where: { userId_channelKey: { userId, channelKey } },
    create: { userId, channelKey, enabled },
    update: { enabled },
  });

  return { ok: true, enabled };
}

/**
 * ما يصل المستخدمَ فعلًا على قناة.
 *
 * الحرِجة تصل دائمًا **بلا قراءة التفضيل أصلًا**: قراءتُه ثم تجاهله
 * تترك بابًا لخطأ في سطر واحد يُسكِت إشعار دفعٍ للجميع.
 */
export async function isChannelEnabled(userId: string, channelKey: string): Promise<boolean> {
  const channel = await db.pushChannel.findUnique({ where: { key: channelKey } });
  if (channel === null) return false;
  if (!channel.userControllable) return true;

  const preference = await db.notificationPreference.findUnique({
    where: { userId_channelKey: { userId, channelKey } },
  });
  return preference?.enabled ?? channel.defaultOn;
}

export type ChannelUpdate = { nameAr?: string; defaultOn?: boolean; sort?: number };

/**
 * تعديل قناة من اللوحة — **و`userControllable` ليست منها**.
 *
 * جعلُ قناةٍ حرجة قابلةً للإطفاء قرارُ منتَج لا إعدادُ تشغيل، وزرٌّ
 * يفعله في لوحة الأدمن يجعله يقع بضغطة في اجتماع.
 */
export async function updateChannel(
  admin: AdminUser,
  key: string,
  update: ChannelUpdate,
  ip: string | null,
  now = new Date(),
): Promise<{ ok: boolean }> {
  const before = await db.pushChannel.findUnique({ where: { key } });
  if (before === null) return { ok: false };

  const changed = Object.entries(update).some(
    ([field, value]) => (before as unknown as Record<string, unknown>)[field] !== value,
  );
  if (!changed) return { ok: true };

  await db.pushChannel.update({ where: { key }, data: update });
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'PushChannel',
      entityId: key,
      action: 'push.channel_updated',
      before: { nameAr: before.nameAr, defaultOn: before.defaultOn, sort: before.sort },
      after: { ...update },
      ip,
      createdAt: now,
    },
  });

  return { ok: true };
}

export type DeviceStats = {
  total: number;
  ios: number;
  android: number;
  /** لم يُرَ منذ ٩٠ يومًا — «رموز ميّتة» في الترميز. */
  stale: number;
};

export const STALE_TOKEN_DAYS = 90;

export async function deviceStats(now: Date = new Date()): Promise<DeviceStats> {
  const staleSince = new Date(now.getTime() - STALE_TOKEN_DAYS * 86_400_000);

  const [total, ios, android, stale] = await Promise.all([
    db.deviceToken.count(),
    db.deviceToken.count({ where: { platform: 'ios' } }),
    db.deviceToken.count({ where: { platform: 'android' } }),
    db.deviceToken.count({ where: { lastSeenAt: { lt: staleSince } } }),
  ]);

  return { total, ios, android, stale };
}

/** الحدّ الآمن لنصّ الإشعار (ترميز A10) — ما زاد يُقتطع على أندرويد. */
export const PUSH_TITLE_LIMIT = 40;
export const PUSH_BODY_LIMIT = 120;

export function pushFits(title: string, body: string): { title: boolean; body: boolean } {
  return {
    title: [...title].length <= PUSH_TITLE_LIMIT,
    body: [...body].length <= PUSH_BODY_LIMIT,
  };
}
