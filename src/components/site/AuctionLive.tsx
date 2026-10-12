'use client';

import { useEffect, useRef } from 'react';
import { auctionChannel } from '@/lib/realtime/channels';
import { subscribeToChannel } from '@/lib/realtime/connection';
import type { PublicAuction } from '@/lib/domain/auctions';

/**
 * ═══ المزاد يتحرّك بلا تحديث ═══
 *
 * الخادم يبثّ `bid.placed` على `auction:{id}` منذ بُني مسار المزايدة
 * — **ولا مشترِك له في المتصفّح**. فمزايدةُ غيرك لا تصلك حتى تُحدّث
 * الصفحة بيدك، وهو أسوأ ما يقع في شاشةٍ عاجلة: تقرأ «أعلى مزايدة
 * ٨٤٬٠٠٠» وقد صارت ٨٧٬٥٠٠ منذ دقيقة، فتزايد بأقلّ من الحدّ ويردّك
 * الخادم — فتظنّ العطل فيك.
 *
 * ═══ والرسالة تقول «تغيّر» ولا تحمل الحال ═══
 *
 * `docs/architecture/realtime.md`: اللقطة من REST والرسالة إشارة.
 * فعند كل رسالة تُجلب `GET /api/v1/auctions/{ref}` — ولا يُبنى الحال
 * من حمولةٍ قد تصل مكرّرةً أو خارج ترتيبها.
 *
 * ═══ والاستطلاع أرضية لا تُنزع ═══
 *
 * لا Redis في التطوير، ولا تذكرة لزائرٍ بلا جلسة، وقد تسقط الخدمة.
 * فالاستطلاع يعمل دائمًا — **ويتباطأ حين يُفتح اتّصالٌ مصادَق**، فلا
 * يُثقَل الخادم بما يصله بثًّا.
 */

/** بلا بثّ: كلُّ هذه الثواني. ومعه: الأبطأ — والبثّ يسبقه. */
const POLL_MS = 15_000;
const POLL_WITH_SOCKET_MS = 60_000;

export function AuctionLive({
  listingRef,
  auctionId,
  live,
  onSnapshot,
}: {
  listingRef: string;
  auctionId: string;
  /** محسوبة من الحالة **والوقت** معًا — ومنتهٍ لا يُستطلَع. */
  live: boolean;
  onSnapshot: (auction: PublicAuction) => void;
}) {
  /**
   * ═══ حالُ الاتّصال في مرجع لا في حالة ═══
   *
   * وضعُه في `useState` يضعه في اعتماديّات الأثر، **فكلُّ تغيّرٍ في
   * الاتّصال يُعيد تركيبه**: يُلغى الاشتراك ويُفتح غيره، ويُرفع علم
   * `cancelled` على كل جلبةٍ طائرة فلا تصل أبدًا.
   *
   * وقِيس: خمسُ جلباتٍ في مئةٍ وخمسين مللي ثانية، وكلُّها تُهمل
   * جوابَها — فالشاشة لا تتحرّك والشبكة تعمل.
   */
  const connected = useRef(false);
  /** والرادّ في مرجعٍ كذلك — فتغيّرُه لا يُعيد تركيب الأثر. */
  const emit = useRef(onSnapshot);
  emit.current = onSnapshot;

  useEffect(() => {
    if (!live) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pull = async (): Promise<void> => {
      try {
        const response = await fetch(`/api/v1/auctions/${encodeURIComponent(listingRef)}`, {
          cache: 'no-store',
        });
        if (!response.ok) return;
        const body = (await response.json()) as { data?: PublicAuction };
        if (!stopped && body.data !== undefined) emit.current(body.data);
      } catch {
        /** **وفشلُ جلبةٍ لا يوقف ما بعدها** — شبكةٌ تتعثّر لا تُجمّد شاشة. */
      }
    };

    /**
     * **والدورة تُجدوِل نفسها بعد وصول الجواب** لا على فترةٍ ثابتة:
     * `setInterval` على شبكةٍ بطيئة يُكدّس الطلبات بعضها فوق بعض.
     */
    const loop = (): void => {
      if (stopped) return;
      timer = setTimeout(() => {
        void pull().finally(loop);
      }, connected.current ? POLL_WITH_SOCKET_MS : POLL_MS);
    };
    loop();

    const release = subscribeToChannel(
      auctionChannel(auctionId),
      (message) => {
        /** مزايدةٌ أو تمديد — وما عداهما لا يغيّر اللقطة. */
        if (message.type === 'bid.placed' || message.type === 'auction.extended') {
          void pull();
        }
      },
      (value) => {
        connected.current = value;
      },
    );

    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      release();
    };
  }, [listingRef, auctionId, live]);

  return null;
}
