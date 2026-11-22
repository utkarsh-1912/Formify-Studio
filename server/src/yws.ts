import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import type { Config } from "./config.js";
import type { DB } from "./db.js";
import { roleAtLeast, verifyToken, type Role } from "./auth.js";

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
// y-protocols sync sub-messages: 0 = step1 (request state), 1 = step2 (reply), 2 = update.
const SYNC_STEP1 = 0;

const MAX_MESSAGE_BYTES = 256 * 1024;
const MAX_DOC_BYTES = 5 * 1024 * 1024;
const PERSIST_DEBOUNCE_MS = 2000;

interface Room {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, { role: Role; awarenessIds: Set<number> }>;
  timer: NodeJS.Timeout | null;
}

/**
 * y-websocket compatible relay with role enforcement:
 *  - viewers may request state and share presence, but their document updates are DROPPED
 *  - editors/owners may write
 * Documents persist to SQLite (workspaces.yjs_state), debounced.
 *
 * Limit: the server cannot validate the *semantics* of CRDT updates, only who may send them.
 * An editor can write any JSON into the shared doc; REST `PUT /schema` is the validated path.
 */
export function attachYjsServer(server: Server, config: Config, db: DB) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const rooms = new Map<string, Room>();

  const persist = (id: string, room: Room) => {
    const state = Y.encodeStateAsUpdate(room.doc);
    if (state.byteLength > MAX_DOC_BYTES) return; // refuse to store a runaway doc
    db.prepare("UPDATE workspaces SET yjs_state = ? WHERE id = ?").run(Buffer.from(state), id);
  };

  const getRoom = (id: string): Room => {
    let room = rooms.get(id);
    if (room) return room;
    const doc = new Y.Doc();
    const row = db.prepare("SELECT yjs_state FROM workspaces WHERE id = ?").get(id) as { yjs_state: Buffer | null } | undefined;
    if (row?.yjs_state) Y.applyUpdate(doc, new Uint8Array(row.yjs_state));
    const awareness = new awarenessProtocol.Awareness(doc);
    awareness.setLocalState(null); // the server itself has no presence
    room = { doc, awareness, conns: new Map(), timer: null };
    const r = room;

    doc.on("update", (update: Uint8Array) => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      syncProtocol.writeUpdate(enc, update);
      const msg = encoding.toUint8Array(enc);
      r.conns.forEach((_, ws) => send(ws, msg));
      if (r.timer) clearTimeout(r.timer);
      r.timer = setTimeout(() => persist(id, r), PERSIST_DEBOUNCE_MS);
    });
    awareness.on("update", ({ added, updated, removed }: any, origin: unknown) => {
      const changed = added.concat(updated, removed);
      if (origin instanceof WebSocket) r.conns.get(origin)?.awarenessIds && added.concat(updated).forEach((cid: number) => r.conns.get(origin)!.awarenessIds.add(cid));
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_AWARENESS);
      encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, changed));
      const msg = encoding.toUint8Array(enc);
      r.conns.forEach((_, ws) => send(ws, msg));
    });
    rooms.set(id, room);
    return room;
  };

  const send = (ws: WebSocket, msg: Uint8Array) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg, (err) => err && ws.close());
  };

  const closeRoomIfEmpty = (id: string, room: Room) => {
    if (room.conns.size > 0) return;
    if (room.timer) clearTimeout(room.timer);
    persist(id, room);
    room.awareness.destroy();
    room.doc.destroy();
    rooms.delete(id);
  };

  const originAllowed = (req: IncomingMessage) => {
    const origin = req.headers.origin;
    if (!origin) return true; // non-browser clients; auth still required
    return config.allowedOrigins.includes(origin);
  };

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const m = /^\/ws\/([a-zA-Z0-9_-]{3,64})$/.exec(url.pathname);
    if (!m) {
      socket.destroy();
      return;
    }
    if (!originAllowed(req)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const room = m[1];
    const token = url.searchParams.get("token") ?? "";
    wss.handleUpgrade(req, socket, head, async (ws) => {
      // Authenticate after upgrade so we can close with an application code the client can read.
      const claims = await verifyToken(config.jwtSecret, db, token);
      if (!claims) return ws.close(4401, "Unauthorized");
      if (claims.ws !== room) return ws.close(4403, "Token not valid for this workspace");
      if (!db.prepare("SELECT 1 FROM workspaces WHERE id = ?").get(room)) return ws.close(4404, "Unknown workspace");
      handleConnection(ws, room, claims.role);
    });
  });

  const handleConnection = (ws: WebSocket, id: string, role: Role) => {
    const room = getRoom(id);
    room.conns.set(ws, { role, awarenessIds: new Set() });
    const canWrite = roleAtLeast(role, "editor");

    ws.on("message", (raw: Buffer) => {
      try {
        const data = new Uint8Array(raw);
        const decoder = decoding.createDecoder(data);
        const type = decoding.readVarUint(decoder);

        if (type === MSG_SYNC) {
          // Peek the sub-type so viewers can only ever *ask* for state.
          const peek = decoding.createDecoder(data);
          decoding.readVarUint(peek);
          const sub = decoding.readVarUint(peek);
          if (!canWrite && sub !== SYNC_STEP1) return;

          const enc = encoding.createEncoder();
          encoding.writeVarUint(enc, MSG_SYNC);
          syncProtocol.readSyncMessage(decoder, enc, room.doc, ws);
          if (encoding.length(enc) > 1) send(ws, encoding.toUint8Array(enc));
        } else if (type === MSG_AWARENESS) {
          awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), ws);
        }
      } catch {
        ws.close(1003, "Malformed message");
      }
    });

    ws.on("close", () => {
      const info = room.conns.get(ws);
      room.conns.delete(ws);
      if (info) awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(info.awarenessIds), null);
      closeRoomIfEmpty(id, room);
    });

    // Initial handshake: our state vector (step1) + current presence.
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeSyncStep1(enc, room.doc);
    send(ws, encoding.toUint8Array(enc));
    const states = room.awareness.getStates();
    if (states.size > 0) {
      const aenc = encoding.createEncoder();
      encoding.writeVarUint(aenc, MSG_AWARENESS);
      encoding.writeVarUint8Array(aenc, awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys())));
      send(ws, encoding.toUint8Array(aenc));
    }
  };

  return {
    wss,
    rooms,
    close() {
      rooms.forEach((room, id) => {
        if (room.timer) clearTimeout(room.timer);
        persist(id, room);
      });
      wss.clients.forEach((c) => c.close());
      wss.close();
    }
  };
}
