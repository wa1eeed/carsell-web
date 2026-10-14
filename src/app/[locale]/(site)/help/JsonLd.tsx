import { APP_URL } from '@/lib/env';

/**
 * ═══ البيانات المنظَّمة لمركز المساعدة ═══
 *
 * صفحةُ الأسئلة هي **أغنى مصدرٍ لـ`FAQPage`** في المنتج كلّه، وكانت
 * الوحيدة بلا بياناتٍ منظَّمة: صفحة المركبة تُصدِر `FAQPage` من ثماني
 * أسئلة، ومركزُ المساعدة — وكلُّه أسئلة — لا يُصدِر شيئًا. فالإجابات
 * التي كُتبت للناس لا تصل من يبحث عنها خارج الموقع.
 *
 * **والأجوبة في المصدر لا في تفاعل**: `<details>` مُصيَّرٌ من الخادم،
 * فما يُعلَن هنا هو ما يراه الزائر — وهو شرط `FAQPage` لا تحسينٌ له.
 *
 * والمسار يتبع ما تعرضه الصفحة: الموضوع عقدةٌ حين يُختار، فيصف الرابطُ
 * المُشارَك موضعَه لا جذرَ الموقع.
 */
export function HelpJsonLd({
  faq,
  locale,
  topic,
  topicLabel,
  homeLabel,
  helpLabel,
}: {
  faq: readonly { id: string; question: string; answer: string }[];
  locale: string;
  topic?: string | undefined;
  topicLabel?: string | undefined;
  homeLabel: string;
  helpLabel: string;
}) {
  const site = APP_URL;
  const helpUrl = `${site}/${locale}/help`;

  const faqPage =
    faq.length === 0
      ? null
      : {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faq.map((entry) => ({
            '@type': 'Question',
            name: entry.question,
            /** الرابط المباشر للجواب — هو نفسه ما ينسخه زرّ المشاركة. */
            url: `${helpUrl}?a=${encodeURIComponent(entry.id)}#q-${encodeURIComponent(entry.id)}`,
            acceptedAnswer: { '@type': 'Answer', text: entry.answer },
          })),
        };

  const trail = [
    { name: homeLabel, item: `${site}/${locale}` },
    { name: helpLabel, item: helpUrl },
    ...(topic === undefined || topicLabel === undefined
      ? []
      : [{ name: topicLabel, item: `${helpUrl}?topic=${encodeURIComponent(topic)}` }]),
  ];

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((entry, index) => ({
      '@type': 'ListItem',
      // check-9-ok: حقل آلة — schema.org يتطلّب أرقامًا لاتينية
      position: index + 1,
      name: entry.name,
      item: entry.item,
    })),
  };

  return (
    <>
      {[faqPage, breadcrumb].filter((block) => block !== null).map((block, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
    </>
  );
}
