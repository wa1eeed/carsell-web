'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { DataTable, type Column, type SortState } from '@/components/ui/DataTable';
import { Modal, Sheet } from '@/components/ui/Sheet';
import { Tabs } from '@/components/ui/Tabs';
import { Money } from '@/components/ui/Money';
import { Badge } from '@/components/ui/Badge';
import { ArabicNumber } from '@/components/ui/ArabicNumber';

/** الحالات التي تحتاج تفاعلًا — تُعرض جنبًا إلى جنب مع الساكنة. */

type OrderRow = {
  ref: string;
  buyer: string;
  amount: number;
  stage: string;
  days: number;
};

const ROWS: OrderRow[] = [
  { ref: 'ORD-2026-1184', buyer: 'خالد العتيبي', amount: 145_000, stage: 'دفع', days: 2 },
  { ref: 'ORD-2026-1185', buyer: 'ريم القحطاني', amount: 98_500, stage: 'فحص', days: 5 },
  { ref: 'ORD-2026-1186', buyer: 'فهد الدوسري', amount: 212_000, stage: 'نقل ملكية', days: 11 },
];

const COLUMNS: readonly Column<OrderRow>[] = [
  { id: 'ref', header: 'رقم الطلب', cell: (r) => <span className="bidi-ltr font-num font-semibold">{r.ref}</span> },
  { id: 'buyer', header: 'المشتري', sortable: true, cell: (r) => r.buyer },
  { id: 'amount', header: 'المبلغ', numeric: true, sortable: true, cell: (r) => <Money amount={r.amount} size="sm" /> },
  { id: 'stage', header: 'المرحلة', cell: (r) => <Badge tone="accent">{r.stage}</Badge> },
  {
    id: 'days',
    header: 'مدة البقاء',
    numeric: true,
    sortable: true,
    cell: (r) => (
      <span className={r.days > 7 ? 'font-bold text-warn-700' : ''}>
        <ArabicNumber value={r.days} /> يوم
      </span>
    ),
  },
];

const TABS = [
  { id: 'all', label: 'الكل', count: 38 },
  { id: 'payment', label: 'دفع', count: 9 },
  { id: 'transfer', label: 'نقل ملكية', count: 4 },
  { id: 'done', label: 'مكتملة' },
];

function Case({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-line-2 p-4">
      <p className="text-3xs font-bold tracking-[0.14em] opacity-45">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export function DevInteractive() {
  const [tab, setTab] = useState('all');
  const [chips, setChips] = useState(['تويوتا', 'كامري', 'الرياض']);
  const [sort, setSort] = useState<SortState>({ columnId: 'amount', direction: 'desc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState(false);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Case label="Button — primary · outline · ghost · danger · icon · بعدّاد">
          <Button>احفظ</Button>
          <Button variant="outline">إلغاء</Button>
          <Button variant="ghost">تخطّي</Button>
          <Button variant="danger">حذف</Button>
          <Button
            variant="icon"
            icon={
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.75} strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            }
          />
          <Button variant="outline" count={38}>
            الطلبات
          </Button>
          <Button size="sm">صغير</Button>
          <Button disabled>معطّل</Button>
        </Case>

        <Case label="Chip — فلتر · نشط · بعدّاد · قابل للإزالة · معطّل">
          <Chip onClick={() => undefined}>مباشر</Chip>
          <Chip active onClick={() => undefined}>
            تفاوض
          </Chip>
          <Chip count={11} onClick={() => undefined}>
            مفحوصة
          </Chip>
          <Chip disabled onClick={() => undefined}>
            معطّل
          </Chip>
          {chips.map((c) => (
            <Chip key={c} active onRemove={() => setChips(chips.filter((x) => x !== c))}>
              {c}
            </Chip>
          ))}
        </Case>
      </div>

      <Case label="Tabs — بعدّاد في دائرة، والنشط داكن">
        <div className="w-full">
          <Tabs items={TABS} active={tab} onChange={setTab} />
        </div>
      </Case>

      <Case label="DataTable — فرز · تحديد جماعي · تحميل · حالة فارغة">
        <div className="flex w-full flex-col gap-3">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setLoading(!loading)}>
              {loading ? 'أوقف التحميل' : 'اعرض التحميل'}
            </Button>
            <span className="flex items-center gap-1.5 text-2xs opacity-55">
              المحدَّد: <ArabicNumber value={selected.size} />
            </span>
          </div>
          <DataTable
            columns={COLUMNS}
            rows={ROWS}
            rowKey={(r) => r.ref}
            loading={loading}
            sort={sort}
            onSortChange={setSort}
            selectable
            selected={selected}
            onSelectedChange={setSelected}
          />
          <DataTable
            columns={COLUMNS}
            rows={[]}
            rowKey={(r) => r.ref}
            empty={{
              title: 'لا طلبات في هذه المرحلة',
              description: 'ستظهر هنا فور وصول أول طلب.',
            }}
          />
        </div>
      </Case>

      <Case label="Sheet و Modal — الطبقات العائمة (الظل مسموح هنا وحدها)">
        <Button variant="outline" onClick={() => setSheet(true)}>
          افتح اللوح
        </Button>
        <Button variant="outline" onClick={() => setModal(true)}>
          افتح الحوار
        </Button>
        <Sheet
          open={sheet}
          onClose={() => setSheet(false)}
          title="الفلاتر"
          footer={
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setSheet(false)}>
                اعرض النتائج
              </Button>
              <Button variant="ghost" onClick={() => setSheet(false)}>
                مسح
              </Button>
            </div>
          }
        >
          <div className="flex flex-wrap gap-2">
            <Chip onClick={() => undefined}>تويوتا</Chip>
            <Chip onClick={() => undefined}>نيسان</Chip>
            <Chip active onClick={() => undefined}>
              لكزس
            </Chip>
          </div>
        </Sheet>
        <Modal
          open={modal}
          onClose={() => setModal(false)}
          title="تأكيد الحذف"
          footer={
            <>
              <Button variant="ghost" onClick={() => setModal(false)}>
                تراجع
              </Button>
              <Button variant="danger" onClick={() => setModal(false)}>
                احذف
              </Button>
            </>
          }
        >
          <p className="text-base opacity-70">
            سيُحذف هذا الإعلان نهائيًا. لا يمكن التراجع بعد التأكيد.
          </p>
        </Modal>
      </Case>
    </div>
  );
}
