import { db } from './schema';
const uuid = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
export const outbox = {
    async enqueue(op) {
        await db.outbox.add({
            ...op,
            op_id: op.op_id ?? uuid(),
            created_at: new Date().toISOString(),
        });
    },
    async drainBatch(limit = 200) {
        return db.outbox.orderBy('created_at').limit(limit).toArray();
    },
    async markApplied(op_ids) {
        if (!op_ids.length)
            return;
        await db.outbox.where('op_id').anyOf(op_ids).delete();
    },
};
export const packsRepo = {
    async upsertMeta(pack) {
        await db.packs.put(pack);
    },
    async setStatus(id, status) {
        const p = await db.packs.get(id);
        if (p)
            await db.packs.put({ ...p, status });
    },
    async saveBlob(blob) {
        await db.pack_blobs.put(blob);
    },
    async loadBlob(pack_id) {
        return db.pack_blobs.get(pack_id);
    },
    async listForModule(module_id) {
        return db.packs.where('module_id').equals(module_id).toArray();
    },
};
export const modulesRepo = {
    async upsertMany(modules) {
        const now = new Date().toISOString();
        await db.modules.bulkPut(modules.map((m) => ({ ...m, updated_at: now })));
    },
    async listForUser(user_id) {
        return db.modules.where('user_id').equals(user_id).toArray();
    },
};
export const structureRepo = {
    async replace(module_id, lus) {
        await db.transaction('rw', db.learning_units, db.subtopics, async () => {
            await db.learning_units.where('module_id').equals(module_id).delete();
            const allSubs = (await db.subtopics.toArray()).filter((s) => lus.some((lu) => lu.id === s.learning_unit_id));
            await db.subtopics.bulkDelete(allSubs.map((s) => s.id));
            await db.learning_units.bulkPut(lus.map((lu) => ({ id: lu.id, module_id, ordinal: lu.ordinal, topic: lu.topic })));
            await db.subtopics.bulkPut(lus.flatMap((lu) => lu.subtopics.map((s) => ({
                id: s.id,
                learning_unit_id: lu.id,
                ordinal: s.ordinal,
                title: s.title,
                word_count: s.word_count,
                effort_score: s.effort_score,
            }))));
        });
    },
    async getForModule(module_id) {
        const lus = await db.learning_units.where('module_id').equals(module_id).sortBy('ordinal');
        const result = await Promise.all(lus.map(async (lu) => ({
            ...lu,
            subtopics: await db.subtopics.where('learning_unit_id').equals(lu.id).sortBy('ordinal'),
        })));
        return result;
    },
};
