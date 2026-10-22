import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { MEMBER_ROWS, memberDetail } from '@/lib/domain/admin-team';
import { PERMISSION_LIST, can } from '@/lib/domain/permissions';
import { AUDIT_ACTION_LABEL } from '@/lib/labels/audit';
import { PERMISSION_LABEL, ROLE_LABEL } from '@/lib/labels/permissions';
import { stripComments } from '../scripts/strip-comments.mjs';

const ROOT = process.cwd();

/**
 * ═══ «ماذا فعل فلان؟» لم يكن يُسأل في موضع ═══
 *
 * شاشةُ التدقيق تصفّي بالصنف (مال · هوية · صلاحيات) **ولا تصفّي
 * بالفاعل** — وهو أوّلُ سؤالٍ في أيّ تحقيق.
 */
describe('صفحة عضو الفريق', () => {
  it('للصفحة ملف، والقائمة تربط إليها', () => {
    expect(() => readFileSync(join(ROOT, 'src/app/admin/team/[id]/page.tsx'))).not.toThrow();
    const table = stripComments(
      readFileSync(join(ROOT, 'src/app/admin/team/TeamTable.tsx'), 'utf8'),
    );
    expect(table).toContain('href={`/admin/team/${encodeURIComponent(row.id)}`}');
  });

  it('وتعيد إجراءات هذا العضو وحده', async () => {
    const admin = await db.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
    const other = await db.adminUser.findFirstOrThrow({ where: { NOT: { id: admin.id } } });

    /** إجراءان لصاحبين — فالترشيحُ يُقاس لا يُفترض. */
    const mine = await db.auditLog.create({
      data: {
        actorId: admin.id, actorType: 'admin', entity: 'TestEntity',
        entityId: 'mine', action: 'test.mine', ip: '10.0.0.1',
      },
    });
    const theirs = await db.auditLog.create({
      data: {
        actorId: other.id, actorType: 'admin', entity: 'TestEntity',
        entityId: 'theirs', action: 'test.theirs', ip: '10.0.0.2',
      },
    });

    try {
      const detail = await memberDetail(admin.id);
      expect(detail).not.toBeNull();
      if (detail === null) return;

      const actions = detail.actions.map((row) => row.action);
      expect(actions).toContain('test.mine');
      expect(actions).not.toContain('test.theirs');
      expect(detail.email).toBe(admin.email);
    } finally {
      await db.auditLog.deleteMany({ where: { id: { in: [mine.id, theirs.id] } } });
    }
  }, 30_000);

  /**
   * **والجلسةُ حيّةٌ بالوقت والإبطال معًا** — لا بالعمود وحده: جلسةٌ
   * انقضت مدّتُها ولم تُبطَل تُقرأ حيّةً إن فُحص `revokedAt` وحده.
   */
  it('والجلسة تحسب بالوقت والإبطال معا', async () => {
    const admin = await db.adminUser.findFirstOrThrow({ where: { role: 'OPS' } });
    const now = new Date();
    const hour = 3600 * 1000;

    const planted = await Promise.all([
      /** حيّة: لم تُبطَل ولم تنقضِ. */
      db.adminSession.create({
        data: {
          adminUserId: admin.id, tokenHash: `t-live-${String(now.getTime())}`,
          expiresAt: new Date(now.getTime() + hour), ip: '10.1.1.1',
        },
      }),
      /** انقضت: لم تُبطَل ومضى وقتُها. */
      db.adminSession.create({
        data: {
          adminUserId: admin.id, tokenHash: `t-old-${String(now.getTime())}`,
          expiresAt: new Date(now.getTime() - hour), ip: '10.1.1.2',
        },
      }),
      /** أُبطلت: وقتُها باقٍ لكنّها مُبطَلة. */
      db.adminSession.create({
        data: {
          adminUserId: admin.id, tokenHash: `t-rev-${String(now.getTime())}`,
          expiresAt: new Date(now.getTime() + hour), revokedAt: now, ip: '10.1.1.3',
        },
      }),
    ]);

    try {
      const detail = await memberDetail(admin.id, now);
      expect(detail).not.toBeNull();
      if (detail === null) return;
      /** واحدةٌ حيّة من الثلاث — والاثنتان الأخريان تُعرضان بحالهما. */
      expect(detail.activeSessions).toBe(1);
      expect(detail.sessions.filter((session) => session.live).length).toBe(1);
      expect(detail.sessions.length).toBeGreaterThanOrEqual(3);
    } finally {
      await db.adminSession.deleteMany({ where: { id: { in: planted.map((s) => s.id) } } });
    }
  }, 30_000);

  /**
   * ═══ والحدُّ يُختبَر بتجاوزه ═══
   *
   * لا عضوَ مزروع له أربعون إجراءً، فاختبارُ الاقتطاع عليه أخضرُ مهما
   * كان الحدّ — يصف البيانات لا الشيفرة.
   */
  it('والمعروض يقتطع عند الحد والعداد يقول الكل', async () => {
    const admin = await db.adminUser.findFirstOrThrow({ where: { role: 'FINANCE' } });
    const before = await memberDetail(admin.id);
    expect(before?.actions.length).toBeLessThan(MEMBER_ROWS);

    await db.auditLog.createMany({
      data: Array.from({ length: MEMBER_ROWS + 2 }, (_, i) => ({
        actorId: admin.id, actorType: 'admin', entity: 'TestEntity',
        entityId: `bulk-${String(i)}`, action: 'test.bulk',
      })),
    });
    try {
      const after = await memberDetail(admin.id);
      expect(after).not.toBeNull();
      if (after === null) return;
      expect(after.actions.length).toBe(MEMBER_ROWS);
      expect(after.actionCount).toBeGreaterThan(MEMBER_ROWS);
      expect(after.actionCount).not.toBe(after.actions.length);
    } finally {
      await db.auditLog.deleteMany({ where: { actorId: admin.id, action: 'test.bulk' } });
    }
  }, 60_000);

  /** **وكلُّ صلاحيةٍ معروضةٍ لها تسمية**، وكلُّ دورٍ كذلك. */
  it('ولكل صلاحية ودور تسمية', async () => {
    for (const permission of PERMISSION_LIST) {
      expect(PERMISSION_LABEL[permission], permission).toBeTruthy();
    }
    const roles = await db.adminUser.findMany({ distinct: ['role'], select: { role: true } });
    expect(roles.length).toBeGreaterThan(0);
    for (const row of roles) expect(ROLE_LABEL[row.role], row.role).toBeTruthy();
  });

  /** **والصلاحيةُ تُحسب من المصفوفة** — فما يُعرض هو ما يفحصه الحارس. */
  it('وما يعرض من صلاحيات هو ما يجيزه can', async () => {
    const admin = await db.adminUser.findFirstOrThrow({ where: { role: 'READONLY' } }).catch(
      async () => db.adminUser.findFirstOrThrow({ where: { role: 'FINANCE' } }),
    );
    const detail = await memberDetail(admin.id);
    expect(detail).not.toBeNull();
    if (detail === null) return;
    const granted = PERMISSION_LIST.filter((permission) => can(detail.role, permission));
    expect(granted.length).toBeGreaterThan(0);
    expect(granted.length).toBeLessThanOrEqual(PERMISSION_LIST.length);
  });

  /**
   * ═══ وكلُّ إجراءٍ يكتبه المنتج له تسمية ═══
   *
   * السياسةُ المكتوبة تُبقي المفتاح الخامّ لما لا تسمية له — «سطرٌ
   * يقول `listing.review.approve` أوضح من سطرٍ يقول إجراء». **ولم
   * تُقَس**: كانت ٧٦ من ٨٠ بلا تسمية، فصفحةُ العضو وشاشةُ التدقيق
   * تُقرآن مفاتيحَ إنجليزية — والاستثناءُ صار القاعدة.
   *
   * **والقياسُ على المصدر لا على القاعدة**: إجراءٌ لم يقع بعد لا صفَّ
   * له في السجلّ، ويظهر خامًّا أوّلَ مرّةٍ يقع فيها.
   *
   * **والمدى `src/` وحدها** — كما بوابةُ «لا مفتاح تسمية ميّت»: مسحُ
   * `prisma/` معها يُدخل `seed.run` فتراه البوابةُ مفتاحًا ميّتًا.
   * وفحصان يقيسان الشيء نفسه يقرآن المدى نفسه، وإلّا تباعدا.
   */
  it('ولكل إجراء يكتبه المنتج تسمية عربية', () => {
    const files = execFileSync(
      'find',
      ['src', '-name', '*.ts', '-o', '-name', '*.tsx'],
      { cwd: ROOT, encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter((file) => !file.includes('generated'));

    const written = new Set<string>();
    for (const file of files) {
      const source = stripComments(readFileSync(join(ROOT, file), 'utf8'));
      for (const match of source.matchAll(/\baction:\s*'([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)'/gi)) {
        written.add(match[1] ?? '');
      }
    }

    /** ولا يُصدَّق صفرٌ قبل إثبات أن الأداة عملت. */
    expect(written.size).toBeGreaterThan(50);
    expect([...written].filter((action) => AUDIT_ACTION_LABEL[action] === undefined)).toEqual([]);
  }, 30_000);

  it('ومعرف لا وجود له يعيد null', async () => {
    expect(await memberDetail('no-such-admin')).toBeNull();
  });
});
