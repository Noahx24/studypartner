import { toast } from 'sonner';

import { api } from './client';
import { metaGet, metaSet } from '../db/schema';
import { outbox } from '../db/repos';

export type SyncResult = {
  applied: string[];
  conflicts: { op_id: string | null; reason?: string; server_value?: unknown }[];
  changes_since: Array<{ op_id: string; entity: string; entity_id: string; op: string; payload: unknown; applied_at: string }>;
  now: string;
};

export async function runSync(user_id: string): Promise<SyncResult> {
  const ops = await outbox.drainBatch(200);
  const last_pulled_at = await metaGet<string>('last_pulled_at');

  const res = await api.sync({
    user_id,
    ops: ops.map((o) => ({ op_id: o.op_id, entity: o.entity, entity_id: o.entity_id, op: o.op, payload: o.payload })),
    last_pulled_at,
  });

  await outbox.markApplied(res.applied);

  // Conflicts: the server rejected one or more queued ops because the
  // server-side state had moved on. Drop them from the outbox so we
  // don't loop, and surface a single toast to the user with the count
  // and the first reason. The user's local view of the offending
  // entity will be reconciled on the next pull.
  if (res.conflicts && res.conflicts.length) {
    const conflictIds = res.conflicts
      .map((c) => c.op_id)
      .filter((id): id is string => !!id);
    if (conflictIds.length) {
      await outbox.dropConflicted(conflictIds);
    }
    const sample = res.conflicts[0]?.reason ?? 'concurrent edit';
    toast.error(
      `${res.conflicts.length} change${res.conflicts.length === 1 ? '' : 's'} couldn't sync (${sample}). The server's version is now the source of truth.`,
    );
  }

  await metaSet('last_pulled_at', res.now);
  return res;
}
