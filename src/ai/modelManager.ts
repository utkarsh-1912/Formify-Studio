import type { AiProvider } from "./types";

export interface Capabilities {
  webgpu: boolean;
  /** navigator.deviceMemory in GB (Chromium only; undefined elsewhere). */
  deviceMemoryGb?: number;
}

export function hasWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator && Boolean((navigator as any).gpu);
}

export function detectCapabilities(): Capabilities {
  const mem = typeof navigator !== "undefined" ? (navigator as any).deviceMemory : undefined;
  return { webgpu: hasWebGPU(), deviceMemoryGb: typeof mem === "number" ? mem : undefined };
}

export interface ModelInfo {
  /** Model id as understood by the engine (WebLLM prebuilt id, Ollama tag, …). */
  id: string;
  label: string;
  tier: "edge" | "local";
  /** Approximate download size in MB (quantized). Verify against the model card before shipping. */
  downloadMb: number;
  /** Approximate VRAM/RAM needed in MB. */
  vramMb: number;
}

/**
 * Starter catalog from OVERHAUL_PLAN.md §5. Sizes are rough estimates for 4-bit quantisation and
 * MUST be confirmed against each model card; model ids are WebLLM prebuilt names and may change.
 */
export const MODEL_CATALOG: ModelInfo[] = [
  { id: "Qwen3-0.6B-q4f16_1-MLC", label: "Qwen3 0.6B (fastest)", tier: "edge", downloadMb: 450, vramMb: 1400 },
  { id: "SmolLM2-1.7B-Instruct-q4f16_1-MLC", label: "SmolLM2 1.7B", tier: "edge", downloadMb: 1000, vramMb: 1800 },
  { id: "Qwen3-4B-q4f16_1-MLC", label: "Qwen3 4B (best quality)", tier: "local", downloadMb: 2400, vramMb: 3500 }
];

export type WarningLevel = "info" | "warn" | "block";

export interface ModelWarning {
  level: WarningLevel;
  message: string;
}

export function modelWarnings(model: ModelInfo, caps: Capabilities): ModelWarning[] {
  const out: ModelWarning[] = [];
  if (!caps.webgpu) {
    out.push({
      level: "block",
      message: "WebGPU is not available in this browser. Use Ollama or a remote model instead."
    });
  }
  if (model.downloadMb >= 1500) {
    out.push({
      level: "warn",
      message: `One-time download of about ${(model.downloadMb / 1000).toFixed(1)} GB. Use Wi-Fi.`
    });
  } else {
    out.push({ level: "info", message: `One-time download of about ${model.downloadMb} MB.` });
  }
  if (caps.deviceMemoryGb !== undefined && caps.deviceMemoryGb * 1024 < model.vramMb * 1.5) {
    out.push({
      level: "warn",
      message: `Needs roughly ${(model.vramMb / 1024).toFixed(1)} GB of memory; this device reports ${caps.deviceMemoryGb} GB.`
    });
  }
  return out;
}

/** Largest model that fits the device without a "warn"/"block" memory warning. */
export function recommendModel(caps: Capabilities, catalog: ModelInfo[] = MODEL_CATALOG): ModelInfo | null {
  if (!caps.webgpu) return null;
  const fits = catalog
    .filter((m) => caps.deviceMemoryGb === undefined || caps.deviceMemoryGb * 1024 >= m.vramMb * 1.5)
    .sort((a, b) => b.vramMb - a.vramMb);
  return fits[0] ?? catalog[0] ?? null;
}

/**
 * Fallback order: available local providers first (privacy), then available remote providers.
 * Order within a kind is preserved. Unavailable providers are dropped.
 */
export async function orderProviders(providers: AiProvider[], opts: { allowRemote?: boolean } = {}): Promise<AiProvider[]> {
  const { allowRemote = true } = opts;
  const checks = await Promise.all(
    providers.map(async (p) => ((await p.isAvailable().catch(() => false)) ? p : null))
  );
  const avail = checks.filter((p): p is AiProvider => p !== null);
  const local = avail.filter((p) => p.kind === "local");
  const remote = allowRemote ? avail.filter((p) => p.kind === "remote") : [];
  return [...local, ...remote];
}
