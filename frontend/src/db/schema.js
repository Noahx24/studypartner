import Dexie from 'dexie';
export class StudyPartnerDB extends Dexie {
    modules;
    learning_units;
    subtopics;
    assessments;
    sessions;
    selections;
    packs;
    pack_blobs;
    outbox;
    meta;
    constructor() {
        super('studypartner');
        this.version(1).stores({
            modules: 'id, user_id, name',
            learning_units: 'id, module_id, ordinal',
            subtopics: 'id, learning_unit_id, ordinal',
            assessments: 'id, module_id, due_date',
            sessions: 'id, [user_id+session_date], module_id, learning_unit_id',
            selections: 'id, module_id',
            packs: 'id, module_id, status',
            pack_blobs: 'pack_id',
            outbox: '++id, op_id, created_at',
            meta: 'key',
        });
    }
}
export const db = new StudyPartnerDB();
export async function metaGet(key) {
    const row = await db.meta.get(key);
    return row?.value;
}
export async function metaSet(key, value) {
    await db.meta.put({ key, value });
}
