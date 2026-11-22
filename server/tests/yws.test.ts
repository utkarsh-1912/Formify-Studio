import { describe, test, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { openDb, type DB } from "../src/db";
import { attachYjsServer } from "../src/yws";
import { signToken } from "../src/auth";
import type { Config } from "../src/config";

const SECRET = "z".repeat(48);
const config: Config = {
  port: 0,
  databasePath: ":memory:",
  jwtSecret: SECRET,
  adminApiKey: "a".repeat(20),
  openSignup: false,
  trustProxy: false,
  allowedOrigins: ["http://localhost:3000"],
  allowPrivateWebhooks: false,
  allowHttpWebhooks: false
};

let db: DB;
let server: http.Server;
let handle: ReturnType<typeof attachYjsServer>;
let port: number;

beforeAll(async () => {
  db = openDb(":memory:");
  db.prepare("INSERT INTO workspaces (id, name, created_at) VALUES ('room1', 'r', 0)").run();
  server = http.createServer();
  handle = attachYjsServer(server, config, db);
  await new Promise<void>((r) => server.listen(0, r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => {
  handle.close();
  server.close();
});

/** Minimal y-websocket protocol client. */
async function client(token: string, room = "room1") {
  const doc = new Y.Doc();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/${room}?token=${token}`);
  const closed = new Promise<{ code: number }>((r) => ws.on("close", (code) => r({ code })));
  let synced: () => void;
  const ready = new Promise<void>((r) => (synced = r));
  ws.on("message", (raw: Buffer) => {
    const dec = decoding.createDecoder(new Uint8Array(raw));
    if (decoding.readVarUint(dec) !== 0) return;
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, 0);
    const sub = syncProtocol.readSyncMessage(dec, enc, doc, "server");
    if (encoding.length(enc) > 1) ws.send(encoding.toUint8Array(enc));
    if (sub === syncProtocol.messageYjsSyncStep2) synced();
  });
  doc.on("update", (u: Uint8Array, origin: unknown) => {
    if (origin === "server" || ws.readyState !== WebSocket.OPEN) return;
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, 0);
    syncProtocol.writeUpdate(enc, u);
    ws.send(encoding.toUint8Array(enc));
  });
  await new Promise<void>((r) => ws.on("open", () => r()));
  // Ask the server for its state.
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, 0);
  syncProtocol.writeSyncStep1(enc, doc);
  ws.send(encoding.toUint8Array(enc));
  return { doc, ws, closed, ready };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("y-websocket relay", () => {
  test("rejects missing/invalid tokens and wrong-room tokens with app close codes", async () => {
    const bad = await client("garbage");
    expect((await bad.closed).code).toBe(4401);

    const other = (await signToken(SECRET, "someone-else", "owner", 60)).token;
    const wrong = await client(other);
    expect((await wrong.closed).code).toBe(4403);
  });

  test("editor writes propagate to viewers; viewer writes are dropped", async () => {
    const editorTok = (await signToken(SECRET, "room1", "editor", 60)).token;
    const viewerTok = (await signToken(SECRET, "room1", "viewer", 60)).token;
    const editor = await client(editorTok);
    const viewer = await client(viewerTok);
    await Promise.all([editor.ready, viewer.ready]);

    editor.doc.getMap("state").set("title", "from editor");
    await wait(200);
    expect(viewer.doc.getMap("state").get("title")).toBe("from editor");

    // Viewer tries to tamper: applied locally on their side only.
    viewer.doc.getMap("state").set("title", "tampered");
    await wait(200);
    expect(editor.doc.getMap("state").get("title")).toBe("from editor");

    // A fresh joiner sees the untampered server state.
    const late = await client(editorTok);
    await late.ready;
    await wait(100);
    expect(late.doc.getMap("state").get("title")).toBe("from editor");

    [editor, viewer, late].forEach((c) => c.ws.close());
  });

  test("rejects browser origins that are not allow-listed", async () => {
    const tok = (await signToken(SECRET, "room1", "viewer", 60)).token;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/room1?token=${tok}`, { origin: "https://evil.example" });
    const outcome = await new Promise<string>((r) => {
      ws.on("unexpected-response", (_req, res) => r(`http-${res.statusCode}`));
      ws.on("error", () => r("error"));
      ws.on("open", () => r("open"));
    });
    expect(outcome).not.toBe("open");
  });
});
