import './env-load';
import { db } from '@/lib/db';
async function main() {
  const rows = await db.approvalRequest.groupBy({
    by: ['kind', 'status', 'requiredApprovals'],
    _count: { id: true },
  });
  for (const r of rows) {
    console.log(`${r.kind} · ${r.status} · نصاب=${String(r.requiredApprovals)} · ${String(r._count.id)}`);
  }
  console.log('معلَّقة بنصابٍ > 1:', await db.approvalRequest.count({
    where: { requiredApprovals: { gt: 1 }, status: 'PENDING' },
  }));
  console.log('المجموع:', await db.approvalRequest.count());
}
void main().then(() => process.exit(0));
