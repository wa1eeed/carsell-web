'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { DataTable } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { Sheet } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { toLatinDigits } from '@/lib/arabic';
import type { ServiceRow } from '@/lib/domain/admin-services';

const CATEGORY_LABEL: Record<string, string> = {
  PRE_PURCHASE: 'قبل الشراء',
  POST_PURCHASE: 'بعد الشراء',
  SELLER: 'للبائعين',
};

const PLACEMENT_LABEL: Record<string, string> = {
  home_services: 'دليل الخدمات',
  listing_banner: 'بنر في صفحة المركبة',
  guide: 'الدليل',
  vehicle_page: 'صفحة المركبة',
  order_page: 'صفحة الطلب',
  pricing: 'التسعير',
};

const PLACEMENTS = Object.keys(PLACEMENT_LABEL);

type Filter = 'all' | 'PRE_PURCHASE' | 'POST_PURCHASE' | 'SELLER' | 'hidden';

type Draft = {
  key: string;
  isNew: boolean;
  category: string;
  active: boolean;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  price: string;
  slaHours: string;
  placements: string[];
};

function draftOf(service: ServiceRow): Draft {
  return {
    key: service.key,
    isNew: false,
    category: service.category,
    active: service.active,
    nameAr: service.nameAr,
    nameEn: service.nameEn,
    descAr: service.descAr,
    descEn: service.descEn,
    price: service.price,
    slaHours: service.slaHours === null ? '' : String(service.slaHours),
    placements: [...service.placements],
  };
}

const BLANK: Draft = {
  key: '',
  isNew: true,
  category: 'PRE_PURCHASE',
  active: false,
  nameAr: '',
  nameEn: '',
  descAr: '',
  descEn: '',
  price: '0',
  slaHours: '',
  placements: [],
};

/**
 * A7 — الخدمات وأسعارها.
 *
 * **التحرير في لوح لا في الجدول** (ترميز A7): الجدول يُقرأ مسحًا، وحقلُ
 * إدخال في كل صفّ يجعل كل سطر قابلًا للتغيير بضغطة خاطئة. والسعر خاصّةً
 * يستحقّ خطوةً مقصودة.
 */
export function ServicesTable({
  services,
  canEdit,
}: {
  services: readonly ServiceRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [draft, setDraft] = useState<Draft | null>(null);
  /** وضع الترتيب منفصل عن القراءة — سهمان في كل صفّ دائمًا ضجيج. */
  const [ordering, setOrdering] = useState(false);

  const counts = useMemo(
    () => ({
      all: services.length,
      PRE_PURCHASE: services.filter((s) => s.category === 'PRE_PURCHASE').length,
      POST_PURCHASE: services.filter((s) => s.category === 'POST_PURCHASE').length,
      SELLER: services.filter((s) => s.category === 'SELLER').length,
      hidden: services.filter((s) => !s.active).length,
    }),
    [services],
  );

  const shown = useMemo(() => {
    /**
     * الترتيب يبدّل موضعين متجاورين في القائمة كلّها — لا في المرشَّح.
     * ولو رُتِّب داخل مرشِّح لقفز الصفّ فوق صفوف لا يراها المحرّر.
     */
    if (ordering || filter === 'all') return services;
    if (filter === 'hidden') return services.filter((s) => !s.active);
    return services.filter((s) => s.category === filter);
  }, [services, filter, ordering]);

  const patch = (key: string, body: unknown, done: (data: unknown) => string): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/services/${key}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setToast('تعذّر الحفظ.');
        return;
      }
      const payload = (await response.json()) as { data?: unknown };
      setToast(done(payload.data));
      router.refresh();
    });
  };

  const save = (): void => {
    if (draft === null) return;
    const price = Number(toLatinDigits(draft.price).replace(/\D/g, '') || '0');
    const sla = toLatinDigits(draft.slaHours).replace(/\D/g, '');
    const body = {
      nameAr: draft.nameAr,
      nameEn: draft.nameEn,
      descAr: draft.descAr,
      descEn: draft.descEn,
      slaHours: sla === '' ? null : Number(sla),
      placements: draft.placements,
      price,
    };

    if (draft.isNew) {
      start(async () => {
        const response = await fetch('/api/v1/admin/services', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...body, key: draft.key, category: draft.category }),
        });
        setToast(
          response.ok
            ? 'أُنشئت مخفيّة — انشرها حين تكتمل.'
            : 'تعذّر الإنشاء: راجع المفتاح والاسم.',
        );
        if (response.ok) router.refresh();
      });
      setDraft(null);
      return;
    }

    patch(draft.key, body, (data) => {
      const untouched = (data as { untouchedRequests?: number } | undefined)?.untouchedRequests;
      return untouched === undefined || untouched === 0
        ? 'حُفظ.'
        : `حُفظ — و${String(untouched)} طلبًا قائمًا بقي بسعره.`;
    });
    setDraft(null);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <p className="flex-1 text-2xs opacity-55">
          <Quantity unit="services" count={counts.all - counts.hidden} /> منشورة · تظهر في دليل
          الخدمات وصفحة المركبة
        </p>
        {!canEdit ? null : (
          <>
            <Button
              size="sm"
              variant={ordering ? 'primary' : 'outline'}
              onClick={() => setOrdering(!ordering)}
            >
              ترتيب العرض
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDraft(BLANK)}>
              + خدمة جديدة
            </Button>
          </>
        )}
      </div>

      {!ordering ? null : (
        <p className="mb-3 text-2xs opacity-55">
          الترتيب يحكم ظهورها في دليل الخدمات — والمرشِّح معطَّل ما دمتَ ترتّب.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(
          [
            ['all', 'الكل', counts.all],
            ['PRE_PURCHASE', CATEGORY_LABEL.PRE_PURCHASE, counts.PRE_PURCHASE],
            ['POST_PURCHASE', CATEGORY_LABEL.POST_PURCHASE, counts.POST_PURCHASE],
            ['SELLER', CATEGORY_LABEL.SELLER, counts.SELLER],
            ['hidden', 'مخفيّة', counts.hidden],
          ] as const
        ).map(([id, label, count]) => (
          <Chip
            key={id}
            active={!ordering && filter === id}
            disabled={ordering}
            onClick={() => setFilter(id as Filter)}
            count={count}
          >
            {label ?? ''}
          </Chip>
        ))}
      </div>

      <DataTable
        rows={shown}
        rowKey={(service) => service.key}
        columns={[
          {
            id: 'name',
            header: 'الخدمة',
            cell: (service) => (
              <span className="flex flex-col gap-0.5">
                <span className="bidi-isolate font-bold">{service.nameAr}</span>
                <span className="font-num text-3xs opacity-45">{service.key}</span>
              </span>
            ),
          },
          {
            id: 'category',
            header: 'المجموعة',
            cell: (service) => (
              <Badge tone="neutral">{CATEGORY_LABEL[service.category] ?? service.category}</Badge>
            ),
          },
          {
            id: 'price',
            header: 'السعر',
            numeric: true,
            sortable: true,
            /* «مجانًا» لا «٠» — الصفر رقمٌ يُقرأ سعرًا مفقودًا */
            cell: (service) =>
              Number(service.price) === 0 ? (
                <span className="opacity-60">مجانًا</span>
              ) : (
                <Money amount={service.price} />
              ),
          },
          {
            id: 'provider',
            header: 'المزوّد',
            cell: (service) =>
              service.providerName !== null ? (
                <span className="bidi-isolate">{service.providerName}</span>
              ) : service.isAutomated ? (
                <Badge tone="neutral">تكامل آلي</Badge>
              ) : (
                <span className="text-2xs opacity-45">بلا مزوّد</span>
              ),
          },
          {
            id: 'requests',
            header: 'الطلبات',
            numeric: true,
            sortable: true,
            cell: (service) => (
              <span className="flex flex-col items-end gap-0.5">
                <ArabicNumber value={service.totalRequests} />
                {/* الأثر قبل الضغط: كم طلبًا يبقى بالسعر القديم */}
                {service.openRequests > 0 ? (
                  <span className="text-3xs opacity-50">
                    <Quantity unit="openRequests" count={service.openRequests} />
                  </span>
                ) : null}
              </span>
            ),
          },
          {
            id: 'revenue',
            header: 'الإيراد',
            numeric: true,
            sortable: true,
            cell: (service) => <Money amount={service.revenue} />,
          },
          {
            id: 'placements',
            header: 'الظهور',
            /*
              الأوّل ثم «+n»: ثلاثة مواضع مكتوبة بالكامل تلفّ الصفّ إلى
              أربعة أسطر، فيصير العمود الأطول في الجدول وهو أقلّه أهمّية.
            */
            cell: (service) => {
              const [first, ...rest] = service.placements;
              if (first === undefined) return <span className="text-2xs opacity-45">لا تظهر</span>;
              return (
                <span
                  className="flex items-center gap-1.5 text-2xs opacity-70"
                  title={service.placements
                    .map((placement) => PLACEMENT_LABEL[placement] ?? placement)
                    .join(' · ')}
                >
                  <span className="truncate">{PLACEMENT_LABEL[first] ?? first}</span>
                  {rest.length === 0 ? null : (
                    <span className="shrink-0 opacity-55">
                      +<ArabicNumber value={rest.length} grouped={false} />
                    </span>
                  )}
                </span>
              );
            },
          },
          {
            id: 'active',
            header: 'الحالة',
            cell: (service) => (
              <Badge tone={service.active ? 'accent' : 'neutral'}>
                {service.active ? 'منشورة' : 'مخفيّة'}
              </Badge>
            ),
          },
          {
            id: 'actions',
            header: '',
            cell: (service) =>
              !canEdit ? null : ordering ? (
                /*
                  سهمان بدل السحب: السحب يحتاج مؤشِّرًا، والسهم يعمل
                  بلوحة المفاتيح ويقرؤه قارئ الشاشة.
                */
                <span className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="حرّك لأعلى"
                    disabled={pending}
                    onClick={() => patch(service.key, { move: 'up' }, () => 'تغيّر الترتيب.')}
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="حرّك لأسفل"
                    disabled={pending}
                    onClick={() => patch(service.key, { move: 'down' }, () => 'تغيّر الترتيب.')}
                  >
                    ↓
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setDraft(draftOf(service))}>
                  تحرير
                </Button>
              ),
          },
        ]}
        empty={{ title: 'لا خدمات في هذه المجموعة' }}
      />

      <Sheet
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft === null ? '' : draft.isNew ? 'خدمة جديدة' : draft.nameAr}
        footer={
          <div className="flex items-center gap-2.5">
            <Button onClick={save} disabled={pending}>
              حفظ
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              إلغاء
            </Button>
            <span className="flex-1" />
            {draft === null || draft.isNew ? null : (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  patch(draft.key, { active: !draft.active }, () =>
                    draft.active ? 'أُخفيت.' : 'نُشرت.',
                  );
                  setDraft(null);
                }}
              >
                {draft.active ? 'إخفاء' : 'نشر'}
              </Button>
            )}
          </div>
        }
      >
        {draft === null ? null : (
          <div className="flex flex-col gap-4">
            {!draft.isNew ? null : (
              <>
                <Field
                  label="المفتاح"
                  ltr
                  value={draft.key}
                  onChange={(key) =>
                    setDraft({ ...draft, key: key.toLowerCase().replace(/[^a-z0-9_]/g, '') })
                  }
                  hint="حروف لاتينية صغيرة وأرقام وشرطة سفلية — يدخل في المسارات ولا يتغيّر بعدها."
                />
                <label className="flex flex-col gap-1.5">
                  <span className="text-2xs font-bold opacity-55">المجموعة</span>
                  <select
                    value={draft.category}
                    onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                    className="w-full rounded-sm border border-line bg-bg px-3 py-2 text-sm outline-none"
                  >
                    {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <Field
              label="الاسم بالعربية"
              value={draft.nameAr}
              onChange={(nameAr) => setDraft({ ...draft, nameAr })}
            />
            <Field
              label="الاسم بالإنجليزية"
              ltr
              value={draft.nameEn}
              onChange={(nameEn) => setDraft({ ...draft, nameEn })}
            />
            <Field
              label="الوصف بالعربية"
              multiline
              value={draft.descAr}
              onChange={(descAr) => setDraft({ ...draft, descAr })}
            />
            <Field
              label="الوصف بالإنجليزية"
              ltr
              multiline
              value={draft.descEn}
              onChange={(descEn) => setDraft({ ...draft, descEn })}
            />
            <Field
              label="السعر بالريال"
              ltr
              numeric
              value={draft.price}
              onChange={(price) => setDraft({ ...draft, price })}
              hint={
                (services.find((s) => s.key === draft.key)?.openRequests ?? 0) > 0
                  ? 'الطلبات القائمة تبقى بسعرها — السعر لقطةٌ وقت الطلب.'
                  : undefined
              }
            />
            <Field
              label="مهلة التنفيذ بالساعات"
              ltr
              numeric
              value={draft.slaHours}
              onChange={(slaHours) => setDraft({ ...draft, slaHours })}
            />

            <div className="flex flex-col gap-2">
              <span className="text-2xs font-bold opacity-55">مواضع الظهور</span>
              <div className="flex flex-wrap gap-1.5">
                {PLACEMENTS.map((placement) => {
                  const on = draft.placements.includes(placement);
                  return (
                    <Chip
                      key={placement}
                      active={on}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          placements: on
                            ? draft.placements.filter((entry) => entry !== placement)
                            : [...draft.placements, placement],
                        })
                      }
                    >
                      {PLACEMENT_LABEL[placement] ?? placement}
                    </Chip>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Sheet>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  ltr = false,
  numeric = false,
  multiline = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ltr?: boolean;
  numeric?: boolean;
  multiline?: boolean;
  hint?: string;
}) {
  const className =
    'w-full rounded-sm border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-ink/40';

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-2xs font-bold opacity-55">{label}</span>
      {multiline ? (
        <textarea
          dir={ltr ? 'ltr' : undefined}
          rows={2}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={className}
        />
      ) : (
        <input
          // `dir="ltr"` على ما يُنسخ من مصدر لاتيني ويُقارَن خانةً بخانة
          dir={ltr ? 'ltr' : undefined}
          inputMode={numeric ? 'numeric' : undefined}
          value={value}
          onChange={(event) =>
            // الحقل يقبل كل صيغة لصق ويطبّعها — والأرقام العربية-الهندية منها
            onChange(numeric ? toLatinDigits(event.target.value).replace(/\D/g, '') : event.target.value)
          }
          className={`${className} ${numeric ? 'font-num text-end' : ''}`}
        />
      )}
      {hint === undefined ? null : <span className="text-3xs opacity-50">{hint}</span>}
    </label>
  );
}
