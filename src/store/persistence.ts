import Dexie, { Table } from "dexie";

/**
 * Persistence layer: IndexedDB (via Dexie) is the source of truth for workspace data.
 *
 * Legacy compatibility: pages outside the studio (share / view / analytics) still read the
 * original `formify_*` localStorage keys synchronously. Every write is therefore mirrored
 * ("write-through") to those keys, and existing localStorage data is migrated into IndexedDB
 * exactly once per workspace so users lose nothing.
 */

export interface WorkspaceRecord {
  id: string;
  /** Raw JSON text of the form schema, preserved exactly as the user typed / saved it. */
  schemaJson?: string;
  submissions?: any[];
  theme?: any;
  globalTheme?: string;
  roomName?: string;
  fontFamily?: string;
  fontScale?: number;
  updatedAt: number;
}

export type WorkspacePatch = Partial<Omit<WorkspaceRecord, "id" | "updatedAt">>;

class FormifyDB extends Dexie {
  workspaces!: Table<WorkspaceRecord, string>;

  constructor(name = "formify") {
    super(name);
    this.version(1).stores({ workspaces: "id, updatedAt" });
  }
}

export type { FormifyDB };

let sharedDb: FormifyDB | null = null;

/** Lazily create the shared DB (browser only; never touched during SSR). */
export function getDb(): FormifyDB {
  if (!sharedDb) sharedDb = new FormifyDB();
  return sharedDb;
}

/** Create an isolated DB (used by tests). */
export function createDb(name: string): FormifyDB {
  return new FormifyDB(name);
}

/** Minimal Storage surface we depend on (lets tests pass a fake). */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const suffix = (workspaceId: string) => (workspaceId ? `_${workspaceId}` : "");

/** Legacy localStorage key names for a workspace (`default` workspace has no suffix). */
export function legacyKeys(workspaceId?: string) {
  const s = suffix(workspaceId || "");
  return {
    schema: `formify_schema${s}`,
    submissions: `formify_submissions${s}`,
    theme: `formify_theme${s}`,
    globalTheme: `formify_global_theme${s}`,
    roomName: `formify_room_name${s}`,
    fontFamily: `formify_font_fam${s}`,
    fontScale: `formify_font_scale${s}`
  };
}

const safeParse = (raw: string | null) => {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

/** Read whatever legacy localStorage data exists for a workspace. */
export function readLegacyWorkspace(workspaceId: string | undefined, storage: KeyValueStorage): WorkspacePatch {
  const k = legacyKeys(workspaceId);
  const patch: WorkspacePatch = {};

  const schema = storage.getItem(k.schema);
  if (schema) patch.schemaJson = schema;

  const submissions = safeParse(storage.getItem(k.submissions));
  if (Array.isArray(submissions)) patch.submissions = submissions;

  const theme = safeParse(storage.getItem(k.theme));
  if (theme && typeof theme === "object") patch.theme = theme;

  const globalTheme = storage.getItem(k.globalTheme);
  if (globalTheme) patch.globalTheme = globalTheme;

  const roomName = storage.getItem(k.roomName);
  if (roomName) patch.roomName = roomName;

  const fontFamily = storage.getItem(k.fontFamily);
  if (fontFamily) patch.fontFamily = fontFamily;

  const scale = storage.getItem(k.fontScale);
  if (scale) {
    const n = parseFloat(scale);
    if (!Number.isNaN(n)) patch.fontScale = n;
  }
  return patch;
}

/**
 * One-time migration: copy legacy localStorage data into IndexedDB when the workspace has no
 * IndexedDB record yet. Never overwrites existing IndexedDB data. Leaves localStorage intact.
 * Returns true if a record was created.
 */
export async function migrateLegacyWorkspace(
  workspaceId: string | undefined,
  db: FormifyDB,
  storage: KeyValueStorage
): Promise<boolean> {
  const id = workspaceId || "default";
  if (await db.workspaces.get(id)) return false;
  const legacy = readLegacyWorkspace(workspaceId, storage);
  if (Object.keys(legacy).length === 0) return false;
  await db.workspaces.put({ id, ...legacy, updatedAt: Date.now() });
  return true;
}

/** Load a workspace record, migrating legacy data first if needed. */
export async function loadWorkspace(
  workspaceId: string | undefined,
  db: FormifyDB,
  storage: KeyValueStorage
): Promise<WorkspaceRecord | undefined> {
  await migrateLegacyWorkspace(workspaceId, db, storage);
  return db.workspaces.get(workspaceId || "default");
}

/** Mirror a patch to the legacy localStorage keys. */
export function mirrorToLegacy(workspaceId: string | undefined, patch: WorkspacePatch, storage: KeyValueStorage) {
  const k = legacyKeys(workspaceId);
  try {
    if (patch.schemaJson !== undefined) storage.setItem(k.schema, patch.schemaJson);
    if (patch.submissions !== undefined) storage.setItem(k.submissions, JSON.stringify(patch.submissions));
    if (patch.theme !== undefined) storage.setItem(k.theme, JSON.stringify(patch.theme));
    if (patch.globalTheme !== undefined) storage.setItem(k.globalTheme, patch.globalTheme);
    if (patch.roomName !== undefined) storage.setItem(k.roomName, patch.roomName);
    if (patch.fontFamily !== undefined) storage.setItem(k.fontFamily, patch.fontFamily);
    if (patch.fontScale !== undefined) storage.setItem(k.fontScale, patch.fontScale.toString());
  } catch (e) {
    console.error("Formify: failed to mirror workspace to localStorage", e);
  }
}

/** Merge a patch into the workspace record (IndexedDB) and mirror it to legacy keys. */
export async function saveWorkspacePatch(
  workspaceId: string | undefined,
  patch: WorkspacePatch,
  db: FormifyDB,
  storage: KeyValueStorage
): Promise<void> {
  // Mirror first and synchronously so legacy readers (share/view/analytics pages) see it immediately.
  mirrorToLegacy(workspaceId, patch, storage);
  const id = workspaceId || "default";
  await db.transaction("rw", db.workspaces, async () => {
    const existing = await db.workspaces.get(id);
    await db.workspaces.put({ ...(existing ?? { id }), ...patch, id, updatedAt: Date.now() });
  });
}
