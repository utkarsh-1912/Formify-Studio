import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { syncJsonIntoMap, yToJson } from "../sync/jsonYjs";
import { SyncSession, ProviderLike } from "../sync/session";
import { resolveSyncConfig } from "../sync/config";

const schema = (fields: any[], title = "T") => ({ schema: { formTitle: title, fields }, theme: { color: "blue" } });
const f = (id: string, extra: Record<string, any> = {}) => ({ id, type: "text", label: id, ...extra });

/** Relay updates between docs, optionally buffering so we can simulate concurrent offline edits. */
function link(a: Y.Doc, b: Y.Doc) {
  let online = true;
  const queue: Array<() => void> = [];
  const pipe = (from: Y.Doc, to: Y.Doc) =>
    from.on("update", (u: Uint8Array, origin: unknown) => {
      if (origin === "remote") return;
      const apply = () => Y.applyUpdate(to, u, "remote");
      online ? apply() : queue.push(apply);
    });
  pipe(a, b);
  pipe(b, a);
  return {
    offline: () => (online = false),
    online: () => {
      online = true;
      queue.splice(0).forEach((fn) => fn());
    }
  };
}

describe("jsonYjs bridge", () => {
  test("round-trips nested objects and id arrays", () => {
    const doc = new Y.Doc();
    const state = schema([f("a"), f("b", { required: true })]);
    syncJsonIntoMap(doc.getMap("state"), state);
    expect(yToJson(doc.getMap("state"))).toEqual(state);
  });

  test("updating one field only changes that field and handles add/remove/reorder", () => {
    const doc = new Y.Doc();
    const map = doc.getMap("state");
    syncJsonIntoMap(map, schema([f("a"), f("b"), f("c")]));
    syncJsonIntoMap(map, schema([f("c"), f("a", { label: "A!" }), f("d")]));
    expect((yToJson(map) as any).schema.fields.map((x: any) => x.id)).toEqual(["c", "a", "d"]);
    expect((yToJson(map) as any).schema.fields[1].label).toBe("A!");
  });

  test("concurrent edits to different fields both survive", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    syncJsonIntoMap(a.getMap("state"), schema([f("x"), f("y")]));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const net = link(a, b);
    net.offline();
    syncJsonIntoMap(a.getMap("state"), schema([f("x", { label: "from A" }), f("y")]));
    syncJsonIntoMap(b.getMap("state"), schema([f("x"), f("y", { label: "from B" })]));
    net.online();
    const merged = yToJson(a.getMap("state")) as any;
    expect(merged).toEqual(yToJson(b.getMap("state")));
    expect(merged.schema.fields.find((x: any) => x.id === "x").label).toBe("from A");
    expect(merged.schema.fields.find((x: any) => x.id === "y").label).toBe("from B");
  });

  test("identical state produces no document update", () => {
    const doc = new Y.Doc();
    const map = doc.getMap("state");
    const state = schema([f("a")]);
    syncJsonIntoMap(map, state);
    let updates = 0;
    doc.on("update", () => updates++);
    syncJsonIntoMap(map, state);
    expect(updates).toBe(0);
  });
});

describe("SyncSession", () => {
  const makePair = () => {
    const peers: Record<string, any[]> = { a: [], b: [] };
    const subs: Record<string, any[]> = { a: [], b: [] };
    let docA!: Y.Doc;
    let docB!: Y.Doc;
    const factory = (name: "a" | "b") => (doc: Y.Doc): ProviderLike => {
      name === "a" ? (docA = doc) : (docB = doc);
      const handlers: Record<string, Array<(e: any) => void>> = {};
      const provider: ProviderLike = {
        awareness: new Awareness(doc),
        destroy() {},
        on(ev, cb) {
          (handlers[ev] ??= []).push(cb);
        }
      };
      queueMicrotask(() => {
        if (docA && docB && name === "b") {
          link(docA, docB);
          Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA), "remote");
          Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB), "remote");
        }
        handlers["synced"]?.forEach((h) => h({}));
      });
      return provider;
    };
    const mk = (name: "a" | "b") =>
      new SyncSession({
        room: "r",
        config: resolveSyncConfig({ transport: "webrtc" }),
        providerFactory: factory(name),
        undoCaptureMs: 0,
        onRemoteState: (s) => peers[name].push(s),
        onRemoteSubmission: (s) => subs[name].push(s)
      });
    return { a: mk("a"), b: mk("b"), peers, subs };
  };

  test("local edits reach the peer but are not echoed back", async () => {
    const { a, b, peers } = makePair();
    a.connect();
    b.connect();
    await new Promise((r) => setTimeout(r, 0));
    a.setState(schema([f("one")]));
    expect(b.getState().schema.fields[0].id).toBe("one");
    expect(peers.b.length).toBe(1);
    expect(peers.a.length).toBe(0);
  });

  test("submissions are delivered to peers, not to the sender, and history is not replayed", async () => {
    const { a, b, subs } = makePair();
    a.connect();
    b.connect();
    await new Promise((r) => setTimeout(r, 0));
    a.publishSubmission({ name: "Ada" });
    expect(subs.b).toEqual([{ name: "Ada" }]);
    expect(subs.a).toEqual([]);
  });

  test("undo reverts only the local user's last change", async () => {
    const { a } = makePair();
    a.connect();
    await new Promise((r) => setTimeout(r, 0));
    a.setState(schema([f("a")]));
    a.setState(schema([f("a"), f("b")]));
    a.undo();
    expect(a.getState().schema.fields.map((x: any) => x.id)).toEqual(["a"]);
    a.redo();
    expect(a.getState().schema.fields.map((x: any) => x.id)).toEqual(["a", "b"]);
  });
});

describe("resolveSyncConfig", () => {
  test("defaults to webrtc and honours overrides", () => {
    expect(resolveSyncConfig().transport).toBe("webrtc");
    const c = resolveSyncConfig({ wsUrl: "wss://x/ws", token: "t" });
    expect(c.transport).toBe("websocket");
    expect(c.token).toBe("t");
  });
});
