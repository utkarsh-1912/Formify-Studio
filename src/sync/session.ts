import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { WebrtcProvider } from "y-webrtc";
import { WebsocketProvider } from "y-websocket";
import { syncJsonIntoMap, yToJson } from "./jsonYjs";
import { SyncConfig } from "./config";

export type SyncStatus = "disconnected" | "connecting" | "connected" | "error";

export interface PeerPresence {
  clientId: number;
  name: string;
  color: string;
  isLocal: boolean;
}

/** Origin tag for transactions produced by this client (what the UndoManager tracks). */
export const LOCAL_ORIGIN = "formify-local";
const MAX_SUBMISSIONS = 200;

/** Minimal provider surface shared by y-webrtc and y-websocket. */
export interface ProviderLike {
  awareness: Awareness;
  destroy(): void;
  on(event: string, cb: (...args: any[]) => void): void;
  synced?: boolean;
  wsconnected?: boolean;
  connected?: boolean;
}

export interface SyncSessionOptions {
  room: string;
  config: SyncConfig;
  /** Remote changes to the shared state (never fired for our own edits). */
  onRemoteState?: (state: any) => void;
  onRemoteSubmission?: (submission: any) => void;
  /** Fired once after the first sync with the room, with the shared state at that moment. */
  onReady?: (sharedState: any, isEmpty: boolean) => void;
  onStatus?: (status: SyncStatus, detail?: string) => void;
  onPeers?: (peers: PeerPresence[]) => void;
  /** Edits closer together than this are undone as one step (default 500 ms). */
  undoCaptureMs?: number;
  /** Test seam: inject a provider instead of creating a network one. */
  providerFactory?: (doc: Y.Doc, opts: SyncSessionOptions) => ProviderLike;
}

const COLORS = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#e11d48", "#0891b2"];

function createProvider(doc: Y.Doc, opts: SyncSessionOptions): ProviderLike {
  const { config, room } = opts;
  if (config.transport === "websocket") {
    if (!config.wsUrl) throw new Error("WebSocket sync selected but no wsUrl configured.");
    return new WebsocketProvider(config.wsUrl, room, doc, {
      params: config.token ? { token: config.token } : {}
    }) as unknown as ProviderLike;
  }
  return new WebrtcProvider(`formify-${room}`, doc, {
    signaling: config.signaling,
    password: config.roomPassword,
    peerOpts: { config: { iceServers: config.iceServers } }
  }) as unknown as ProviderLike;
}

/**
 * Framework-free collaborative session around one Y.Doc.
 *  - doc.getMap("state")        shared form state (merged per-key / per-field)
 *  - doc.getArray("submissions") append-only recent submissions feed
 */
export class SyncSession {
  readonly doc = new Y.Doc();
  readonly state: Y.Map<any>;
  readonly submissions: Y.Array<any>;
  readonly undoManager: Y.UndoManager;
  private provider: ProviderLike | null = null;
  private opts: SyncSessionOptions;
  private destroyed = false;
  private ready = false; // true after the first sync so history is not replayed as "new"
  private statusValue: SyncStatus = "disconnected";

  constructor(opts: SyncSessionOptions) {
    this.opts = opts;
    this.state = this.doc.getMap("state");
    this.submissions = this.doc.getArray("submissions");
    this.undoManager = new Y.UndoManager(this.state, {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: opts.undoCaptureMs ?? 500
    });

    this.state.observeDeep((_events, tx) => {
      if (tx.origin === LOCAL_ORIGIN) return;
      // Remote update, or an undo/redo (origin = UndoManager): both should reach the app.
      this.opts.onRemoteState?.(yToJson(this.state));
    });

    this.submissions.observe((event, tx) => {
      if (!this.ready || tx.origin === LOCAL_ORIGIN) return;
      event.changes.added.forEach((item) => {
        item.content.getContent().forEach((entry: any) => this.opts.onRemoteSubmission?.(entry.data));
      });
    });
  }

  get status(): SyncStatus {
    return this.statusValue;
  }

  connect(): void {
    if (this.destroyed || this.provider) return;
    this.setStatus("connecting");
    try {
      const factory = this.opts.providerFactory ?? createProvider;
      const provider = factory(this.doc, this.opts);
      this.provider = provider;

      const name = this.opts.config.userName || `Guest-${this.doc.clientID % 1000}`;
      provider.awareness.setLocalStateField("user", {
        name,
        color: COLORS[this.doc.clientID % COLORS.length]
      });
      provider.awareness.on("change", () => this.emitPeers());

      provider.on("status", (e: { status: string }) => {
        if (e.status === "connected") this.setStatus("connected");
        else if (e.status === "disconnected") this.setStatus("connecting");
      });
      provider.on("synced", () => this.markReady());
      provider.on("connection-error", () => this.setStatus("error", "Connection error"));
      provider.on("connection-close", (e: any) => {
        // y-websocket closes with 4401/4403 when our token is rejected.
        if (e && (e.code === 4401 || e.code === 4403 || e.code === 1008)) {
          this.setStatus("error", e.reason || "Access denied");
        }
      });
      // y-webrtc has no 'synced' for the first peer; treat as ready after connecting.
      if (this.opts.config.transport === "webrtc") {
        setTimeout(() => this.markReady(), 1500);
      }
      this.emitPeers();
    } catch (err) {
      this.setStatus("error", (err as Error).message);
    }
  }

  private markReady() {
    if (this.destroyed || this.ready) return;
    this.ready = true;
    this.setStatus("connected");
    this.opts.onReady?.(this.getState(), this.state.size === 0);
  }

  /** Publish local state. Only differences are written, so concurrent edits merge. */
  setState(next: Record<string, any>): void {
    if (!next || typeof next !== "object") return;
    this.doc.transact(() => syncJsonIntoMap(this.state, next), LOCAL_ORIGIN);
  }

  getState(): any {
    return yToJson(this.state);
  }

  publishSubmission(data: any): void {
    this.doc.transact(() => {
      this.submissions.push([{ id: `${this.doc.clientID}-${Date.now()}`, ts: Date.now(), data }]);
      const overflow = this.submissions.length - MAX_SUBMISSIONS;
      if (overflow > 0) this.submissions.delete(0, overflow);
    }, LOCAL_ORIGIN);
  }

  undo(): void {
    this.undoManager.undo();
  }
  redo(): void {
    this.undoManager.redo();
  }

  peers(): PeerPresence[] {
    const awareness = this.provider?.awareness;
    if (!awareness) return [];
    const out: PeerPresence[] = [];
    awareness.getStates().forEach((s: any, clientId: number) => {
      if (s?.user) {
        out.push({
          clientId,
          name: s.user.name,
          color: s.user.color,
          isLocal: clientId === this.doc.clientID
        });
      }
    });
    return out;
  }

  setStatus(status: SyncStatus, detail?: string): void {
    this.statusValue = status;
    this.opts.onStatus?.(status, detail);
  }

  private emitPeers() {
    this.opts.onPeers?.(this.peers());
  }

  destroy(): void {
    this.destroyed = true;
    this.undoManager.destroy();
    this.provider?.destroy();
    this.provider = null;
    this.doc.destroy();
    this.setStatus("disconnected");
  }
}
