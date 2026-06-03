import Dexie, { type Table } from 'dexie';

export type IdbModule = {
  id: string;
  user_id: string;
  name: string;
  module_type: 'year' | 'semester';
  updated_at: string;
};

export type IdbLearningUnit = {
  id: string;
  module_id: string;
  ordinal: number;
  topic: string;
};

export type IdbSubtopic = {
  id: string;
  learning_unit_id: string;
  ordinal: number;
  title: string;
  word_count: number;
  effort_score: number;
};

export type IdbAssessment = {
  id: string;
  module_id: string;
  title: string;
  due_date: string;
  weight: number;
  status: 'open' | 'submitted' | 'graded';
};

export type IdbSession = {
  id: string;
  user_id: string;
  module_id: string;
  unit_id: string;
  learning_unit_id?: string | null;
  subtopic_id?: string | null;
  session_date: string;
  planned_minutes: number;
  status: 'planned' | 'completed' | 'missed';
};

export type IdbSelection = {
  id: string;
  user_id: string;
  module_id: string;
  subtopic_ids: string[];
  ai_features: { summaries: boolean; subtopic_quiz: boolean; topic_quiz: boolean };
  low_data_mode: boolean;
  updated_at: string;
};

export type PackStatus = 'not_generated' | 'generating' | 'generated' | 'downloaded' | 'failed';

export type IdbPack = {
  id: string;
  module_id: string;
  user_id: string;
  selection_id: string;
  status: PackStatus;
  byte_size?: number | null;
  version: number;
  generated_at?: string | null;
  pinned?: boolean;
};

export type IdbPackBlob = {
  pack_id: string;
  bytes: Uint8Array; // gzipped JSON
  etag?: string;
  downloaded_at: string;
};

export type OutboxOp = {
  id?: number;
  op_id: string;
  user_id: string;
  entity: string;
  entity_id: string;
  op: string;
  payload: unknown;
  created_at: string;
};

export type MetaRow = { key: string; value: unknown };

export class StudyPartnerDB extends Dexie {
  modules!: Table<IdbModule, string>;
  learning_units!: Table<IdbLearningUnit, string>;
  subtopics!: Table<IdbSubtopic, string>;
  assessments!: Table<IdbAssessment, string>;
  sessions!: Table<IdbSession, string>;
  selections!: Table<IdbSelection, string>;
  packs!: Table<IdbPack, string>;
  pack_blobs!: Table<IdbPackBlob, string>;
  outbox!: Table<OutboxOp, number>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('studypartner');

    // ───────────────────────────────────────────────────────────────
    // Schema versioning
    //
    // Dexie keeps the LAST version's stores definition as the live
    // schema; every prior version block stays so that an existing
    // IndexedDB on an older app build can be migrated forward without
    // wiping data. Without the older blocks, Dexie 4 throws
    // SchemaError on first open of a v1 DB after we bump to v2 — a
    // hard regression for any user with cached data.
    //
    // Add a NEW .version(N) block below for every schema change;
    // do NOT mutate the existing v1 stores definition.
    //
    // Pattern for additive index changes:
    //   this.version(2).stores({
    //     modules: 'id, user_id, name, created_at',  // +created_at
    //   });
    //
    // Pattern for data migrations:
    //   this.version(3).stores({...}).upgrade(async (tx) => {
    //     await tx.table('subtopics').toCollection().modify((row) => {
    //       row.normalised_title = row.title.toLowerCase();
    //     });
    //   });
    // ───────────────────────────────────────────────────────────────

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

export async function metaGet<T = unknown>(key: string): Promise<T | undefined> {
  const row = await db.meta.get(key);
  return row?.value as T | undefined;
}

export async function metaSet(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
