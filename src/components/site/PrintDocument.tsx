'use client';

import { useTranslations } from 'next-intl';
import { ActionButton } from '@/components/ui/ActionLink';

/**
 * ═══ تنزيلُ وثيقةٍ قانونية ═══
 *
 * **وليست ورقةً مصمَّمة كتقرير الفحص.** ذاك مستندٌ له كرتُ مركبةٍ ورمزٌ
 * ومخطَّط، فيُبنى صفحةً مستقلّة. وهذه **نثرٌ يُقرأ ويُحفظ ويُطبع** —
 * وأنماطُ الطباعة تكفيها: تُخفى المِلاحةُ وفهرسُ الوثائق وشريطُ
 * الصفحات، ويبقى النصُّ بعنوانه ونسخته وتاريخ سريانه.
 *
 * ومن ضغط «تنزيل PDF» يجد في حوار الطباعة «حفظ بصيغة PDF» — وهو
 * الطريق نفسُه الذي يسلكه كلُّ متصفّح، بلا حزمةٍ تُضاف ولا خادمٍ
 * يُصيّر.
 */
export function PrintDocument({ className }: { className?: string }) {
  const t = useTranslations('legal');
  return (
    <ActionButton className={className} onClick={() => window.print()}>
      {t('downloadPdf')}
    </ActionButton>
  );
}
