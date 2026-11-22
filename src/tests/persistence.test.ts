import "fake-indexeddb/auto";
import {
  createDb,
  legacyKeys,
  loadWorkspace,
  migrateLegacyWorkspace,
  readLegacyWorkspace,
  saveWorkspacePatch,
  KeyValueStorage
} from "../store/persistence";

const memoryStorage = (initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k)
  };
};

let dbCounter = 0;
const freshDb = () => createDb(`formify-test-${++dbCounter}`);

const schemaJson = JSON.stringify({ formTitle: "Legacy", fields: [{ id: "a", type: "text", label: "A" }] });

describe("legacyKeys", () => {
  test("namespaces by workspace id, default has no suffix", () => {
    expect(legacyKeys("abc").schema).toBe("formify_schema_abc");
    expect(legacyKeys(undefined).schema).toBe("formify_schema");
    expect(legacyKeys("abc").fontScale).toBe("formify_font_scale_abc");
  });
});

describe("readLegacyWorkspace", () => {
  test("reads and parses every legacy key, ignoring corrupt JSON", () => {
    const k = legacyKeys("ws1");
    const storage = memoryStorage({
      [k.schema]: schemaJson,
      [k.submissions]: JSON.stringify([{ id: "s1" }]),
      [k.theme]: "{not json",
      [k.globalTheme]: "dark",
      [k.roomName]: "Room",
      [k.fontFamily]: "mono",
      [k.fontScale]: "1.2"
    });
    const out = readLegacyWorkspace("ws1", storage);
    expect(out.schemaJson).toBe(schemaJson);
    expect(out.submissions).toEqual([{ id: "s1" }]);
    expect(out.theme).toBeUndefined();
    expect(out.globalTheme).toBe("dark");
    expect(out.roomName).toBe("Room");
    expect(out.fontFamily).toBe("mono");
    expect(out.fontScale).toBe(1.2);
  });

  test("returns empty patch when nothing is stored", () => {
    expect(readLegacyWorkspace("none", memoryStorage())).toEqual({});
  });
});

describe("migrateLegacyWorkspace", () => {
  test("copies localStorage data into IndexedDB and leaves localStorage intact", async () => {
    const db = freshDb();
    const k = legacyKeys("ws1");
    const storage = memoryStorage({ [k.schema]: schemaJson, [k.roomName]: "Room" });

    expect(await migrateLegacyWorkspace("ws1", db, storage)).toBe(true);

    const rec = await db.workspaces.get("ws1");
    expect(rec?.schemaJson).toBe(schemaJson);
    expect(rec?.roomName).toBe("Room");
    expect(storage.getItem(k.schema)).toBe(schemaJson);
  });

  test("is one-time: never overwrites an existing IndexedDB record", async () => {
    const db = freshDb();
    const k = legacyKeys("ws1");
    const storage = memoryStorage({ [k.roomName]: "Old" });
    await migrateLegacyWorkspace("ws1", db, storage);

    storage.setItem(k.roomName, "Changed later in localStorage");
    expect(await migrateLegacyWorkspace("ws1", db, storage)).toBe(false);
    expect((await db.workspaces.get("ws1"))?.roomName).toBe("Old");
  });

  test("does nothing when there is no legacy data", async () => {
    const db = freshDb();
    expect(await migrateLegacyWorkspace("empty", db, memoryStorage())).toBe(false);
    expect(await db.workspaces.get("empty")).toBeUndefined();
  });

  test("uses the 'default' record id when no workspace id is given", async () => {
    const db = freshDb();
    const storage = memoryStorage({ [legacyKeys(undefined).roomName]: "D" });
    await migrateLegacyWorkspace(undefined, db, storage);
    expect((await db.workspaces.get("default"))?.roomName).toBe("D");
  });
});

describe("saveWorkspacePatch / loadWorkspace", () => {
  test("merges patches in IndexedDB and mirrors to legacy localStorage keys", async () => {
    const db = freshDb();
    const storage = memoryStorage();
    await saveWorkspacePatch("ws2", { roomName: "R", fontScale: 1.1 }, db, storage);
    await saveWorkspacePatch("ws2", { submissions: [{ id: "s" }] }, db, storage);

    const rec = await db.workspaces.get("ws2");
    expect(rec).toMatchObject({ roomName: "R", fontScale: 1.1, submissions: [{ id: "s" }] });

    const k = legacyKeys("ws2");
    expect(storage.getItem(k.roomName)).toBe("R");
    expect(storage.getItem(k.fontScale)).toBe("1.1");
    expect(JSON.parse(storage.getItem(k.submissions) as string)).toEqual([{ id: "s" }]);
  });

  test("loadWorkspace migrates legacy data on first load, then reads from IndexedDB", async () => {
    const db = freshDb();
    const storage = memoryStorage({ [legacyKeys("ws3").schema]: schemaJson });
    const rec = await loadWorkspace("ws3", db, storage);
    expect(rec?.schemaJson).toBe(schemaJson);
    expect(await loadWorkspace("missing", db, storage)).toBeUndefined();
  });
});
