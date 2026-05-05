import { api } from './client';
import { metaGet, metaSet } from '../db/schema';
import { outbox } from '../db/repos';
export async function runSync(user_id) {
    const ops = await outbox.drainBatch(200);
    const last_pulled_at = await metaGet('last_pulled_at');
    const res = await api.sync({
        user_id,
        ops: ops.map((o) => ({ op_id: o.op_id, entity: o.entity, entity_id: o.entity_id, op: o.op, payload: o.payload })),
        last_pulled_at,
    });
    await outbox.markApplied(res.applied);
    await metaSet('last_pulled_at', res.now);
    return res;
}
