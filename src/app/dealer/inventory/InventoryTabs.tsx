import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * ═══ ألسنةُ المخزون — قرار المالك ٢٠٢٦-١١-٢٦ ═══
 *
 * «الاضافه الجماعيه تخص المخزون لذلك اعتقد لو تكون زر او قسم فرعي داخل
 * المخزون». فالمخزونُ قسمٌ واحد وأبوابُ إدخاله ألسنةٌ فيه، لا بنودًا
 * متجاورةً في الشريط: بابٌ يُستعمل مرّةً في الشهر لا يزاحم ما يُفتح
 * كلَّ يوم.
 *
 * **والمسارُ لا يتغيّر** — `/dealer/import` كما هو، فروابطُ من حفظه
 * تعمل. وإعادةُ ترتيبٍ تكسر روابطَ المستخدم ليست إعادةَ ترتيب.
 */
export function InventoryTabs({ active }: { active: 'stock' | 'import' }) {
  const tabs = [
    { key: 'stock', href: '/dealer/inventory', label: 'المركبات' },
    { key: 'import', href: '/dealer/import', label: 'الإضافة الجماعية' },
  ] as const;

  return (
    <nav className="mb-5 flex gap-1 border-b border-line" aria-label="أقسام المخزون">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? 'page' : undefined}
          className={cn(
            'relative -mb-px border-b-2 px-3.5 py-2.5 text-2xs',
            tab.key === active
              ? 'border-ink font-bold'
              : 'border-transparent opacity-65 hover:opacity-100',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
