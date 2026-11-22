import type { AiProvider, GenerateOptions } from "../types";

export interface OllamaOptions {
  baseUrl?: string;
  model: string;
  fetchImpl?: typeof fetch;
}

/** Local Ollama server. `format` accepts a JSON Schema → grammar-constrained output. */
export class OllamaProvider implements AiProvider {
  readonly kind = "local" as const;
  readonly id: string;
  readonly label: string;
  private baseUrl: string;
  private model: string;
  private f: typeof fetch;

  constructor(opts: OllamaOptions) {
    this.baseUrl = (opts.baseUrl ?? "http://localhost:11434").replace(/\/+$/, "");
    this.model = opts.model;
    this.f = opts.fetchImpl ?? ((...a) => fetch(...a));
    this.id = `ollama:${opts.model}`;
    this.label = `Ollama · ${opts.model}`;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const r = await this.f(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(1500) });
      return r.ok;
    } catch {
      return false;
    }
  }

  async generate({ messages, jsonSchema, temperature = 0.2, signal }: GenerateOptions): Promise<string> {
    const res = await this.f(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        format: jsonSchema ?? "json",
        options: { temperature }
      })
    });
    if (!res.ok) throw new Error(`Ollama request failed (${res.status}).`);
    const data = await res.json();
    const content = data?.message?.content;
    if (typeof content !== "string") throw new Error("Ollama returned no message content.");
    return content;
  }
}
