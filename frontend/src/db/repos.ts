import { db, type IdbPack, type IdbPackBlob, type OutboxOp } from './schema';

const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const outbox = {
  async enqueue(op: Omit<OutboxOp, 'id' | 'op_id' | 'created_at'> & { op_id?: string }) {
    await db.outbox.add({
      ...op,
      op_id: op.op_id ?? uuid(),
      created_at: new Date().toISOString(),
    });
  },

  async drainBatch(limit = 200): Promise<OutboxOp[]> {
    return db.outbox.orderBy('created_at').limit(limit).toArray();
  },

  async markApplied(op_ids: string[]): Promise<void> {
    if (!op_ids.length) return;
    await db.outbox.where('op_id').anyOf(op_ids).delete();
  },

  /**
   * Drop ops the server rejected with a conflict reason so we don't
   * resubmit them in a hot loop. The caller is responsible for
   * surfacing the reason to the user (e.g. via a toast) — this is
   * just the persistence-layer half.
   */
  async dropConflicted(op_ids: string[]): Promise<void> {
    if (!op_ids.length) return;
    await db.outbox.where('op_id').anyOf(op_ids).delete();
  },
};

export const packsRepo = {
  async upsertMeta(pack: IdbPack): Promise<void> {
    await db.packs.put(pack);
  },

  async setStatus(id: string, status: IdbPack['status']): Promise<void> {
    const p = await db.packs.get(id);
    if (p) await db.packs.put({ ...p, status });
  },

  async saveBlob(blob: IdbPackBlob): Promise<void> {
    await db.pack_blobs.put(blob);
  },

  async loadBlob(pack_id: string): Promise<IdbPackBlob | undefined> {
    return db.pack_blobs.get(pack_id);
  },

  async listForModule(module_id: string): Promise<IdbPack[]> {
    return db.packs.where('module_id').equals(module_id).toArray();
  },
};

export const modulesRepo = {
  async upsertMany(modules: { id: string; user_id: string; name: string; module_type: 'year' | 'semester' }[]): Promise<void> {
    const now = new Date().toISOString();
    await db.modules.bulkPut(modules.map((m) => ({ ...m, updated_at: now })));
  },
  async listForUser(user_id: string) {
    return db.modules.where('user_id').equals(user_id).toArray();
  },
};

export const structureRepo = {
  async replace(module_id: string, lus: { id: string; ordinal: number; topic: string; subtopics: { id: string; ordinal: number; title: string; word_count: number; effort_score: number }[] }[]) {
    await db.transaction('rw', db.learning_units, db.subtopics, async () => {
      await db.learning_units.where('module_id').equals(module_id).delete();
      const allSubs = (await db.subtopics.toArray()).filter((s) => lus.some((lu) => lu.id === s.learning_unit_id));
      await db.subtopics.bulkDelete(allSubs.map((s) => s.id));

      await db.learning_units.bulkPut(lus.map((lu) => ({ id: lu.id, module_id, ordinal: lu.ordinal, topic: lu.topic })));
      await db.subtopics.bulkPut(
        lus.flatMap((lu) =>
          lu.subtopics.map((s) => ({
            id: s.id,
            learning_unit_id: lu.id,
            ordinal: s.ordinal,
            title: s.title,
            word_count: s.word_count,
            effort_score: s.effort_score,
          })),
        ),
      );
    });
  },

  async getForModule(module_id: string) {
    const lus = await db.learning_units.where('module_id').equals(module_id).sortBy('ordinal');
    const result = await Promise.all(
      lus.map(async (lu) => ({
        ...lu,
        subtopics: await db.subtopics.where('learning_unit_id').equals(lu.id).sortBy('ordinal'),
      })),
    );
    return result;
  },
};
