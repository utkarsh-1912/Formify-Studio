export type SyncTransport = "webrtc" | "websocket";

export interface SyncConfig {
  transport: SyncTransport;
  /** y-webrtc signaling servers (wss://...). */
  signaling: string[];
  /** ICE servers; include a TURN server here for peers behind symmetric NAT. */
  iceServers: RTCIceServer[];
  /** y-websocket base URL, e.g. wss://formify.example.com/ws */
  wsUrl: string;
  /** Bearer token for the self-hosted server (role-enforced). */
  token?: string;
  /** Optional shared password to derive a y-webrtc room encryption key (webrtc only). */
  roomPassword?: string;
  userName?: string;
}

const DEFAULT_ICE: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

// NOTE: no public signaling default is baked in on purpose. y-webrtc's demo servers are
// best-effort and not for production; set NEXT_PUBLIC_FORMIFY_SIGNALING to your own.
const DEFAULT_SIGNALING = ["wss://signaling.yjs.dev"];

const parseList = (v: string | undefined): string[] =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const parseIce = (v: string | undefined): RTCIceServer[] => {
  if (!v) return DEFAULT_ICE;
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_ICE;
  } catch {
    return DEFAULT_ICE;
  }
};

/**
 * Resolve config from NEXT_PUBLIC_* env vars, then apply caller overrides.
 *   NEXT_PUBLIC_FORMIFY_SYNC_TRANSPORT = webrtc | websocket
 *   NEXT_PUBLIC_FORMIFY_SIGNALING      = wss://a,wss://b
 *   NEXT_PUBLIC_FORMIFY_ICE_SERVERS    = JSON array of RTCIceServer (add TURN here)
 *   NEXT_PUBLIC_FORMIFY_WS_URL         = wss://host/ws
 */
export function resolveSyncConfig(overrides: Partial<SyncConfig> = {}): SyncConfig {
  const env = typeof process !== "undefined" ? process.env : ({} as NodeJS.ProcessEnv);
  const wsUrl = overrides.wsUrl ?? env.NEXT_PUBLIC_FORMIFY_WS_URL ?? "";
  const envTransport = env.NEXT_PUBLIC_FORMIFY_SYNC_TRANSPORT as SyncTransport | undefined;
  const signaling = parseList(env.NEXT_PUBLIC_FORMIFY_SIGNALING);

  return {
    transport: overrides.transport ?? envTransport ?? (wsUrl ? "websocket" : "webrtc"),
    signaling: overrides.signaling ?? (signaling.length ? signaling : DEFAULT_SIGNALING),
    iceServers: overrides.iceServers ?? parseIce(env.NEXT_PUBLIC_FORMIFY_ICE_SERVERS),
    wsUrl,
    token: overrides.token,
    roomPassword: overrides.roomPassword,
    userName: overrides.userName
  };
}
