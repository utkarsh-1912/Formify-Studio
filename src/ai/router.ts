import type { AiProvider, GenerateOptions } from "./types";
import { orderProviders } from "./modelManager";

export interface RouterOptions {
  /** Remote providers receive form content; require explicit opt-in. Default false. */
  allowRemote?: boolean;
}

export interface RoutedResult {
  text: string;
  provider: AiProvider;
}

/**
 * Picks the first available provider (local before remote) and falls back to the next one
 * if a call throws. Deterministic: no model is used to route.
 */
export class Router {
  constructor(
    private providers: AiProvider[],
    private opts: RouterOptions = {}
  ) {}

  setAllowRemote(v: boolean) {
    this.opts = { ...this.opts, allowRemote: v };
  }

  async generate(req: GenerateOptions): Promise<RoutedResult> {
    const ordered = await orderProviders(this.providers, { allowRemote: this.opts.allowRemote ?? false });
    if (ordered.length === 0) {
      throw new Error(
        this.providers.length === 0
          ? "No AI provider is configured."
          : "No AI provider is available. Check WebGPU/Ollama, or allow a remote model."
      );
    }
    let lastError: unknown;
    for (const provider of ordered) {
      if (req.signal?.aborted) throw new Error("Aborted.");
      try {
        return { text: await provider.generate(req), provider };
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("All AI providers failed.");
  }
}
