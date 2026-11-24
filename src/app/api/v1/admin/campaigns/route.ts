import type { NextRequest } from 'next/server';
import { fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { createCampaign } from '@/lib/domain/admin-campaigns';

export const runtime = 'nodejs';

const MESSAGE: Record<string, string> = {
  NAME_REQUIRED: 'اكتب اسم الحملة.',
  NO_BODY: 'اكتب نص الرسالة.',
  NO_CHANNEL: 'اختر قناة واحدة على الأقل.',
  SEGMENT_NOT_FOUND: 'لا شريحة بهذا المعرف.',
  PAST_SCHEDULE: 'الموعد مضى — اختر وقتا قادما.',
};

/** `POST /api/v1/admin/campaigns` — حملة جديدة (A9). */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, 'notifications.manage');
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as {
    nameAr?: unknown;
    channels?: unknown;
    segmentId?: unknown;
    subjectAr?: unknown;
    bodyAr?: unknown;
    scheduledAt?: unknown;
  } | null;

  /** **والتاريخ يُفحص قبل أن يُبنى منه `Date`** — «abc» تُنتج `Invalid Date`. */
  const raw = typeof body?.scheduledAt === 'string' ? body.scheduledAt.trim() : '';
  const scheduledAt = raw === '' ? null : new Date(raw);
  if (scheduledAt !== null && Number.isNaN(scheduledAt.getTime())) {
    return fail(
      { code: 'BAD_SCHEDULE', messageAr: 'موعد غير صالح.', messageEn: 'Invalid date.' },
      422,
    );
  }

  const result = await createCampaign({
    nameAr: typeof body?.nameAr === 'string' ? body.nameAr : '',
    channels: Array.isArray(body?.channels)
      ? body.channels.filter((entry): entry is string => typeof entry === 'string')
      : [],
    segmentId: typeof body?.segmentId === 'string' ? body.segmentId : '',
    subjectAr: typeof body?.subjectAr === 'string' ? body.subjectAr : null,
    bodyAr: typeof body?.bodyAr === 'string' ? body.bodyAr : '',
    scheduledAt,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) {
    return fail(
      {
        code: result.reason,
        messageAr: MESSAGE[result.reason] ?? 'تعذر الإنشاء.',
        messageEn: 'Could not create the campaign.',
      },
      422,
    );
  }

  return ok({ campaignId: result.campaignId, status: result.status });
}
