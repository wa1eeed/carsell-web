import { db } from '@/lib/db';

/**
 * ═══ الردودُ الجاهزة — `D5` ═══
 *
 * **والقالبُ يُحفظ بمتغيّراته لا بناتجها.** `{price}` تُستبدل **وقت
 * الإرسال**: قالبٌ استُبدل وقت الحفظ يجمّد سعرًا تغيّر بعده، فيَعِد
 * المعرضُ بما لم يعد قائمًا.
 */
export const REPLY_VARIABLES = ['price', 'branch', 'score'] as const;

export type ReplyVariable = (typeof REPLY_VARIABLES)[number];

export type DealerReplyRow = {
  id: string;
  body: string;
  /** المتغيّراتُ التي يحملها — تُعرض بجواره فيُعرف بم يُملأ. */
  variables: ReplyVariable[];
};

const MIN = 10;
const MAX = 400;

export type ReplyFailure = 'TOO_SHORT' | 'TOO_LONG' | 'UNKNOWN_VARIABLE' | 'NOT_FOUND';

function variablesIn(body: string): ReplyVariable[] {
  const found = [...body.matchAll(/\{([a-z]+)\}/g)].map((match) => match[1] ?? '');
  return REPLY_VARIABLES.filter((name) => found.includes(name));
}

export async function dealerReplies(dealerId: string): Promise<DealerReplyRow[]> {
  const rows = await db.dealerReply.findMany({
    where: { dealerId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, body: true },
  });
  return rows.map((row) => ({ ...row, variables: variablesIn(row.body) }));
}

/**
 * **والمتغيّرُ المجهول يُردّ لا يُبتلع.** `{discount}` تُرسل حرفيًّا إلى
 * المشتري فيقرأ قوسين — ومن كتبها ظنّ أنها تُملأ.
 */
export async function createReply(input: {
  dealerId: string;
  body: string;
  actorId: string;
}): Promise<{ ok: true; id: string } | { ok: false; reason: ReplyFailure }> {
  const body = input.body.trim();
  if (body.length < MIN) return { ok: false, reason: 'TOO_SHORT' };
  if (body.length > MAX) return { ok: false, reason: 'TOO_LONG' };

  const names = [...body.matchAll(/\{([a-z]+)\}/g)].map((match) => match[1] ?? '');
  if (names.some((name) => !REPLY_VARIABLES.includes(name as ReplyVariable))) {
    return { ok: false, reason: 'UNKNOWN_VARIABLE' };
  }

  const count = await db.dealerReply.count({ where: { dealerId: input.dealerId } });
  const created = await db.dealerReply.create({
    data: {
      dealerId: input.dealerId,
      body,
      /**
       * **والترتيبُ من الأعلى لا من العدد** (قاعدةٌ مسجَّلة): صفٌّ
       * يُحذف يترك فجوةً، فالتالي يصطدم بترتيبٍ قائم.
       */
      sortOrder:
        count === 0
          ? 0
          : ((
              await db.dealerReply.findFirst({
                where: { dealerId: input.dealerId },
                orderBy: { sortOrder: 'desc' },
                select: { sortOrder: true },
              })
            )?.sortOrder ?? 0) + 1,
      createdBy: input.actorId,
    },
    select: { id: true },
  });

  return { ok: true, id: created.id };
}

export async function removeReply(
  dealerId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: ReplyFailure }> {
  /** **والحذفُ محصورٌ في الاستعلام** — فلا معرّفٌ من معرضٍ آخر يُحذف. */
  const removed = await db.dealerReply.deleteMany({ where: { id, dealerId } });
  return removed.count === 0 ? { ok: false, reason: 'NOT_FOUND' } : { ok: true };
}
