import type { PublicAuction } from './auctions';

/**
 * ═══ سجلُّ المزايدات ملفًّا ═══
 *
 * التصميم يضع زرَّ تنزيلٍ فوق السجلّ ولا مسارَ تحته. ومن يتابع إغلاقًا
 * يحتاج الصفوف ليحسبها — لا لقطةَ شاشة.
 *
 * **ويحمل ما تحمله الشاشة بالضبط**: الاسمُ المستعار والوقتُ والفرقُ
 * والنوعُ والمبلغ. ولا `bidderId` ولا هويّة — فما لا يدخل الكائن لا
 * يتسرّب منه، وهو مسلك `reservePrice` نفسه.
 */

/**
 * **والفاصلة تُهرَّب لا تُحذف.** حقلٌ فيه فاصلةٌ يزيح الأعمدة كلَّها،
 * فيُقرأ المبلغُ في خانة النوع. والاقتباسُ المزدوج يُضاعَف داخله.
 */
function cell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * **و`﻿` في أوّل الملفّ**: إكسل على ويندوز يقرأ CSV بترميز
 * النظام لا بـUTF-8 ما لم يجد العلامة — فيفتح «مزايد» حروفًا
 * مقطّعة، ويظنّ القارئُ أنّ عندنا عطلًا.
 */
const BOM = '﻿';

export function bidLogCsv(auction: PublicAuction): string {
  const header = ['bidder', 'at', 'step', 'type', 'status', 'amount'];

  const rows = auction.bids.map((bid, index) => [
    `#U-${bid.alias}`,
    bid.at,
    bid.step ?? '',
    bid.isAuto ? 'auto' : 'manual',
    index === 0 ? 'top' : 'outbid',
    bid.amount,
  ]);

  /**
   * **والتمديدُ صفٌّ في الملفّ كما هو سطرٌ في الشاشة.** ملفٌّ يُظهر
   * مزايدةً عند ٢١:٥٩ وإغلاقًا عند ٢٢:٠٥ بلا سببٍ بينهما يُقرأ عطلًا
   * في البيانات لا تمديدًا في المزاد.
   */
  const events = auction.events.map((event) => [
    '',
    event.at,
    '',
    'extended',
    String(event.seconds ?? ''),
    '',
  ]);

  const body = [...rows, ...events].sort((a, b) => (a[1] ?? '') < (b[1] ?? '') ? 1 : -1);

  return BOM + [header, ...body].map((row) => row.map(cell).join(',')).join('\n') + '\n';
}
