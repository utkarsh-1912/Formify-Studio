import { useState, useEffect, useRef, useCallback } from "react";
import { SyncSession, PeerPresence, SyncStatus } from "../sync/session";
import { resolveSyncConfig, SyncConfig } from "../sync/config";

/**
 * Collaboration hook backed by Yjs (CRDT).
 *
 * Backwards compatible with the previous PeerJS hook: same arguments, same returned
 * fields (status / peerId / errorMessage / connectedPeers / initPeerJS / disconnect /
 * push / submitForm). Differences worth knowing:
 *  - There is no "host" any more. `status` is "hosting" for a connected editor and
 *    "joined" for a connected guest, purely so existing UI keeps working.
 *  - Edits merge per field (concurrent edits to different fields no longer overwrite
 *    each other). Guests (isGuest) are strictly read-only and never write.
 *  - Extra returned fields: undo/redo/canUndo/canRedo, peers (presence), canWrite.
 *  - Optional 6th argument selects the transport (webrtc | websocket) and token.
 */

export type P2PStatus = "disconnected" | "connecting" | "hosting" | "joined" | "error";

export interface UseP2PSyncOptions extends Partial<SyncConfig> {}

const mapStatus = (s: SyncStatus, isGuest: boolean): P2PStatus => {
  switch (s) {
    case "connected":
      return isGuest ? "joined" : "hosting";
    case "connecting":
      return "connecting";
    case "error":
      return "error";
    default:
      return "disconnected";
  }
};

export function useP2PSync(
  workspaceId: string,
  localSchema: any,
  onRemoteSchema: (schema: any) => void,
  onRemoteSubmission?: (submission: any) => void,
  isGuest = false,
  options: UseP2PSyncOptions = {}
) {
  const [status, setStatus] = useState<P2PStatus>("disconnected");
  const [peerId, setPeerId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [peers, setPeers] = useState<PeerPresence[]>([]);
  const [undoState, setUndoState] = useState({ canUndo: false, canRedo: false });

  const sessionRef = useRef<SyncSession | null>(null);
  const readyRef = useRef(false);

  // Always call the latest callbacks / state without re-creating the session.
  const latest = useRef({ localSchema, onRemoteSchema, onRemoteSubmission, isGuest, options });
  latest.current = { localSchema, onRemoteSchema, onRemoteSubmission, isGuest, options };

  const disconnect = useCallback(() => {
    sessionRef.current?.destroy();
    sessionRef.current = null;
    readyRef.current = false;
    setPeers([]);
    setStatus("disconnected");
  }, []);

  const connect = useCallback(() => {
    if (sessionRef.current) return;
    const guest = latest.current.isGuest;
    setErrorMessage("");
    setStatus("connecting");

    const session = new SyncSession({
      room: workspaceId,
      config: resolveSyncConfig(latest.current.options),
      onRemoteState: (state) => latest.current.onRemoteSchema(state),
      onRemoteSubmission: (sub) => latest.current.onRemoteSubmission?.(sub),
      onReady: (shared, isEmpty) => {
        readyRef.current = true;
        if (isEmpty) {
          // Fresh room: the first editor seeds it. Guests never write.
          const local = latest.current.localSchema;
          if (!latest.current.isGuest && local && Object.keys(local).length > 0) session.setState(local);
        } else {
          // Existing room: adopt shared state rather than clobbering it with our local copy.
          latest.current.onRemoteSchema(shared);
        }
      },
      onStatus: (s, detail) => {
        setStatus(mapStatus(s, guest));
        if (s === "error") setErrorMessage(detail || "Sync connection error");
      },
      onPeers: setPeers
    });
    session.undoManager.on("stack-item-added", () =>
      setUndoState({ canUndo: session.undoManager.canUndo(), canRedo: session.undoManager.canRedo() })
    );
    session.undoManager.on("stack-item-popped", () =>
      setUndoState({ canUndo: session.undoManager.canUndo(), canRedo: session.undoManager.canRedo() })
    );
    sessionRef.current = session;
    setPeerId(String(session.doc.clientID));
    session.connect();
  }, [workspaceId]);

  // Publish local edits (editors only, and only after the initial sync decided who seeds).
  useEffect(() => {
    const session = sessionRef.current;
    if (!session || !readyRef.current || isGuest) return;
    if (!localSchema || Object.keys(localSchema).length === 0) return;
    session.setState(localSchema);
  }, [localSchema, isGuest]);

  useEffect(() => () => disconnect(), [disconnect]);

  const push = useCallback(() => {
    const { localSchema: s, isGuest: g } = latest.current;
    if (!g && s && Object.keys(s).length > 0) sessionRef.current?.setState(s);
  }, []);

  const submitForm = useCallback((submissionData: any) => {
    sessionRef.current?.publishSubmission(submissionData);
  }, []);

  return {
    status,
    peerId,
    errorMessage,
    /** Remote peers only (previous versions returned peer id strings). */
    connectedPeers: peers.filter((p) => !p.isLocal).map((p) => String(p.clientId)),
    initPeerJS: connect, // legacy name
    connect,
    disconnect,
    push,
    submitForm,
    // --- new in the Yjs layer ---
    peers,
    canWrite: !isGuest,
    undo: () => sessionRef.current?.undo(),
    redo: () => sessionRef.current?.redo(),
    canUndo: undoState.canUndo,
    canRedo: undoState.canRedo
  };
}
