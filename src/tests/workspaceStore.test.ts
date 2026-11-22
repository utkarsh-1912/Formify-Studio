import "fake-indexeddb/auto";
import { createWorkspaceStore, cleanDefaultSchema, defaultTheme } from "../store/workspaceStore";
import { createDb, legacyKeys, KeyValueStorage } from "../store/persistence";

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  const storage: KeyValueStorage & { data: Map<string, string> } = {
    data,
    getItem: (k) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k)
  };
  return storage;
};

let n = 0;
const setup = (initial: Record<string, string> = {}) => {
  const db = createDb(`store-test-${++n}`);
  const storage = memoryStorage(initial);
  const useStore = createWorkspaceStore({ getDb: () => db, getStorage: () => storage });
  return { db, storage, useStore };
};

const validSchema = { formTitle: "T", fields: [{ id: "a", type: "text", label: "A" }] };
const flush = () => new Promise((r) => setTimeout(r, 20));

describe("workspace store", () => {
  test("hydrate on a fresh workspace keeps defaults and marks it uninitialized", async () => {
    const { useStore } = setup();
    await useStore.getState().hydrate("fresh");
    const s = useStore.getState();
    expect(s.hydrated).toBe(true);
    expect(s.schema).toEqual(cleanDefaultSchema);
    expect(s.themeSettings).toEqual(defaultTheme);
    expect(s.isWorkspaceInitialized).toBe(false);
  });

  test("hydrate migrates legacy localStorage data, stamps schemaVersion, preserves raw JSON text", async () => {
    const k = legacyKeys("old");
    const raw = JSON.stringify(validSchema);
    const { useStore } = setup({
      [k.schema]: raw,
      [k.roomName]: "Legacy Room",
      [k.globalTheme]: "dark",
      [k.fontScale]: "1.3",
      [k.submissions]: JSON.stringify([{ id: "s1", timestamp: "t", data: {} }])
    });
    await useStore.getState().hydrate("old");
    const s = useStore.getState();
    expect(s.schema.formTitle).toBe("T");
    expect(s.schema.schemaVersion).toBe(1);
    expect(s.jsonSchema).toBe(raw);
    expect(s.roomName).toBe("Legacy Room");
    expect(s.globalTheme).toBe("dark");
    expect(s.fontScale).toBe(1.3);
    expect(s.submissions).toHaveLength(1);
    expect(s.isWorkspaceInitialized).toBe(true);
  });

  test("a schema from a newer version is not loaded (defaults kept)", async () => {
    const k = legacyKeys("future");
    const { useStore } = setup({ [k.schema]: JSON.stringify({ ...validSchema, schemaVersion: 99 }) });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await useStore.getState().hydrate("future");
    spy.mockRestore();
    expect(useStore.getState().schema).toEqual(cleanDefaultSchema);
  });

  test("setJson validates, updates schema and persists only valid input", async () => {
    const { useStore, db, storage } = setup();
    await useStore.getState().hydrate("w");

    useStore.getState().setJson("");
    expect(useStore.getState().error).toBe("Schema cannot be empty.");

    useStore.getState().setJson("{bad");
    expect(useStore.getState().error).toBeTruthy();
    expect(storage.getItem(legacyKeys("w").schema)).toBeNull();

    const text = JSON.stringify(validSchema);
    useStore.getState().setJson(text);
    await flush();
    expect(useStore.getState().error).toBeNull();
    expect(useStore.getState().schema.formTitle).toBe("T");
    expect(useStore.getState().isWorkspaceInitialized).toBe(true);
    expect((await db.workspaces.get("w"))?.schemaJson).toBe(text);
    expect(storage.getItem(legacyKeys("w").schema)).toBe(text);
  });

  test("setVisual keeps json text in sync and persists", async () => {
    const { useStore, db } = setup();
    await useStore.getState().hydrate("w");
    useStore.getState().setVisual(validSchema);
    await flush();
    expect(JSON.parse(useStore.getState().jsonSchema)).toEqual(validSchema);
    expect((await db.workspaces.get("w"))?.schemaJson).toBe(JSON.stringify(validSchema, null, 2));
  });

  test("submissions: add (newest first), delete, clear", async () => {
    const { useStore, db } = setup();
    await useStore.getState().hydrate("w");
    useStore.getState().addSubmission({ a: "1" });
    useStore.getState().addSubmission({ a: "2" });
    expect(useStore.getState().submissions.map((s) => s.data.a)).toEqual(["2", "1"]);

    const id = useStore.getState().submissions[0].id;
    useStore.getState().deleteSubmission(id);
    expect(useStore.getState().submissions).toHaveLength(1);
    await flush();
    expect((await db.workspaces.get("w"))?.submissions).toHaveLength(1);

    useStore.getState().clearSubmissions();
    await flush();
    expect(useStore.getState().submissions).toEqual([]);
    expect((await db.workspaces.get("w"))?.submissions).toEqual([]);
  });

  test("applyAppearance and settings persist together", async () => {
    const { useStore, db } = setup();
    await useStore.getState().hydrate("w");
    useStore.getState().applyAppearance({ globalTheme: "matrix", fontFamily: "mono", fontScale: 1.4 });
    await flush();
    expect(await db.workspaces.get("w")).toMatchObject({ globalTheme: "matrix", fontFamily: "mono", fontScale: 1.4 });
  });

  test("applyRemoteState updates state and persists theme/submissions but flags invalid schemas", async () => {
    const { useStore, db } = setup();
    await useStore.getState().hydrate("w");
    useStore.getState().applyRemoteState({
      schema: { formTitle: "Remote", fields: [{ id: "x", type: "bogus", label: "X" }] },
      theme: { ...defaultTheme, primaryColor: "rose" },
      submissions: []
    });
    await flush();
    expect(useStore.getState().error).toMatch(/invalid type/);
    expect(useStore.getState().themeSettings.primaryColor).toBe("rose");
    expect((await db.workspaces.get("w"))?.theme.primaryColor).toBe("rose");
  });

  test("addRemoteSubmission fills in missing id/timestamp", async () => {
    const { useStore } = setup();
    await useStore.getState().hydrate("w");
    useStore.getState().addRemoteSubmission({ name: "Bob" });
    const [entry] = useStore.getState().submissions;
    expect(entry.id).toMatch(/^sub_/);
    expect(entry.data).toEqual({ name: "Bob" });
    expect(entry.timestamp).toBeTruthy();
  });

  test("a stale hydrate for a previous workspace is ignored", async () => {
    const k = legacyKeys("a");
    const { useStore } = setup({ [k.roomName]: "Room A" });
    const first = useStore.getState().hydrate("a");
    const second = useStore.getState().hydrate("b");
    await Promise.all([first, second]);
    expect(useStore.getState().workspaceId).toBe("b");
    expect(useStore.getState().roomName).toBe("My Form Workspace");
  });
});
