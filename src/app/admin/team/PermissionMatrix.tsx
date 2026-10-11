import type { AdminRole } from '@/generated/prisma/enums';
import { ADMIN_ROLES, PERMISSION_LIST, can, canWrite } from '@/lib/domain/permissions';
import { PERMISSION_LABEL, PERMISSION_MODULES, ROLE_HEAD } from '@/lib/labels/permissions';

/**
 * ═══ مصفوفة الصلاحيات — شبكةٌ كما في التصميم ═══
 *
 * والتصميم يرسم الخلايا **مفاتيح تبديل** (أخضر/رمادي)، ونحن نرسم
 * مفتاحًا بثلاث مواضع. وليس تجميلًا: مفتاحٌ بحالتين لا يقول «يرى ولا
 * يكتب» — وهي حالُ `OPS` في المالية و`SUPPORT` في الطلبات. وصفوفُ
 * التصميم وحداتٌ كبيرة فاستوى فيها الأمران، وصفوفُنا صلاحياتٌ مفردة
 * فلا يستويان.
 *
 * **ولا يُبدَّل منها شيء.** المصفوفة في `permissions.ts` شيفرةً
 * تُراجَع في مراجعة الشيفرة لا صفوفًا في قاعدة — ومفتاحٌ يُضغَط فلا
 * ينتقل أسوأ من مفتاحٍ لا يوجد. فهي معروضةٌ للقراءة، والعنوان يقول ذلك.
 */

const CELL = 'grid-cols-[1.7fr_repeat(6,1fr)] gap-3.5 px-5';

function Pill({ read, write }: { read: boolean; write: boolean }) {
  const track = write ? 'bg-accent' : read ? 'bg-accent-200' : 'bg-ink/15';
  const knob = write ? 'end-0.5' : read ? 'start-2.5' : 'start-0.5';
  const label = write ? 'قراءة وكتابة' : read ? 'قراءة فقط' : 'لا يرى البند أصلًا';

  return (
    <span className={`relative inline-block h-5 w-9 rounded-full ${track}`} title={label}>
      <span className={`absolute top-0.5 ${knob} size-4 rounded-full bg-bg`} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function PermissionMatrix() {
  /**
   * **وصلاحيةٌ بلا مجموعة تُعرض آخرًا لا تُحذف.** البوابة ٣٢ تفحص
   * الاتّحاد والقائمة والتسمية — ولا تفحص المجموعات. فما فُقد يظهر
   * تحت «أخرى» ويُرى، لا يسقط صامتًا من جردِ حَوكمة.
   */
  const grouped = new Set(PERMISSION_MODULES.flatMap((module) => module.permissions));
  const orphans = PERMISSION_LIST.filter((permission) => !grouped.has(permission));
  const modules = [
    ...PERMISSION_MODULES,
    ...(orphans.length === 0 ? [] : [{ title: 'أخرى', permissions: orphans }]),
  ];

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <div className="min-w-3xl">
        <div
          className={`grid ${CELL} border-b border-line bg-surface py-3 text-3xs font-bold opacity-55`}
        >
          <div>الوحدة</div>
          {ADMIN_ROLES.map((role) => (
            <div key={role} className="font-num">
              {ROLE_HEAD[role]}
            </div>
          ))}
        </div>

        {modules.map((module) => (
          <div key={module.title}>
            <div className="border-b border-line-2 bg-ink/5 px-5 py-2 text-3xs font-bold tracking-wider opacity-45">
              {module.title}
            </div>
            {module.permissions.map((permission) => (
              <div
                key={permission}
                className={`grid ${CELL} items-center border-b border-line-2 py-3 last:border-0`}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-2xs font-bold">{PERMISSION_LABEL[permission]}</span>
                  {/* والمفتاح تحتها لمن يصحّح الشيفرة — لا لمن يراجع */}
                  <span className="font-num text-3xs opacity-35">{permission}</span>
                </div>
                {ADMIN_ROLES.map((role: AdminRole) => (
                  <Pill key={role} read={can(role, permission)} write={canWrite(role, permission)} />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
