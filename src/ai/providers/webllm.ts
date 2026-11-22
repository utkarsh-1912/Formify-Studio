import type { AiProvider, GenerateOptions } from "../types";
import { hasWebGPU } from "../modelManager";

/** Minimal slice of the @mlc-ai/web-llm engine we rely on (lets tests inject a fake). */
export interface WebLLMEngineLike {
  chat: {
    completions: {
      create(req: {
        messages: { role: string; content: string }[];
        temperature?: number;
        response_format?: { type: "json_object"; schema?: string };
      }): Promise<{ choices: { message: { content: string | null } }[] }>;
    };
  };
}

export type EngineLoader = (
  modelId: string,
  onProgress?: (p: { progress: number; text: string }) => void
) => Promise<WebLLMEngineLike>;

/**
 * The real loader. `import()` is lazy, so the (large) library is only fetched in the browser
 * when the user actually picks the on-device model — never during SSR or the initial bundle.
 */
export const defaultEngineLoader: EngineLoader = async (modelId, onProgress) => {
  if (typeof window === "undefined") throw new Error("WebLLM can only run in the browser.");
  const mod = await import("@mlc-ai/web-llm");
  return (await mod.CreateMLCEngine(modelId, {
    initProgressCallback: (r: { progress: number; text: string }) => onProgress?.(r)
  })) as unknown as WebLLMEngineLike;
};

export interface WebLLMOptions {
  modelId: string;
  loader?: EngineLoader;
  onProgress?: (p: { progress: number; text: string }) => void;
  /** Override for tests. */
  webgpuCheck?: () => boolean;
}

/** On-device provider (WebGPU). JSON Schema is enforced by WebLLM's grammar engine (XGrammar/WASM). */
export class WebLLMProvider implements AiProvider {
  readonly kind = "local" as const;
  readonly id: string;
  readonly label: string;
  private engine: Promise<WebLLMEngineLike> | null = null;

  constructor(private opts: WebLLMOptions) {
    this.id = `webllm:${opts.modelId}`;
    this.label = `On-device · ${opts.modelId}`;
  }

  async isAvailable() {
    return (this.opts.webgpuCheck ?? hasWebGPU)();
  }

  private getEngine() {
    if (!this.engine) {
      const load = this.opts.loader ?? defaultEngineLoader;
      this.engine = load(this.opts.modelId, this.opts.onProgress).catch((e) => {
        this.engine = null; // allow retry after a failed download
        throw e;
      });
    }
    return this.engine;
  }

  async generate({ messages, jsonSchema, temperature = 0.2, signal }: GenerateOptions): Promise<string> {
    if (signal?.aborted) throw new Error("Aborted.");
    const engine = await this.getEngine();
    const res = await engine.chat.completions.create({
      messages,
      temperature,
      response_format: jsonSchema
        ? { type: "json_object", schema: JSON.stringify(jsonSchema) }
        : { type: "json_object" }
    });
    const content = res.choices[0]?.message?.content;
    if (!content) throw new Error("On-device model returned no content.");
    return content;
  }
}
