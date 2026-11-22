import type { AiProvider, GenerateOptions } from "../types";

/**
 * API keys are held ONLY in memory (module-level map) so they never reach localStorage,
 * logs, or serialized state. `rememberForSession` optionally mirrors to sessionStorage.
 */
const memoryKeys = new Map<string, string>();
const SESSION_PREFIX = "formify_ai_key_";

export const keyStore = {
  set(id: string, key: string, rememberForSession = false) {
    memoryKeys.set(id, key);
    if (rememberForSession) {
      try {
        sessionStorage.setItem(SESSION_PREFIX + id, key);
      } catch {
        /* storage unavailable: memory only */
      }
    }
  },
  get(id: string): string | undefined {
    const m = memoryKeys.get(id);
    if (m) return m;
    try {
      return sessionStorage.getItem(SESSION_PREFIX + id) ?? undefined;
    } catch {
      return undefined;
    }
  },
  clear(id: string) {
    memoryKeys.delete(id);
    try {
      sessionStorage.removeItem(SESSION_PREFIX + id);
    } catch {
      /* ignore */
    }
  }
};

export interface OpenAICompatibleOptions {
  /** e.g. https://api.openai.com/v1, a vLLM server, or an HF Inference Endpoint /v1 */
  baseUrl: string;
  model: string;
  /** Identifier under which the key is stored in `keyStore`. */
  keyId?: string;
  fetchImpl?: typeof fetch;
}

export class OpenAICompatibleProvider implements AiProvider {
  readonly kind = "remote" as const;
  readonly id: string;
  readonly label: string;
  private keyId: string;
  private f: typeof fetch;

  constructor(private opts: OpenAICompatibleOptions) {
    this.keyId = opts.keyId ?? opts.baseUrl;
    this.id = `openai:${opts.baseUrl}:${opts.model}`;
    this.label = `Remote · ${opts.model}`;
    this.f = opts.fetchImpl ?? ((...a) => fetch(...a));
  }

  async isAvailable() {
    return Boolean(keyStore.get(this.keyId));
  }

  async generate({ messages, jsonSchema, temperature = 0.2, signal }: GenerateOptions): Promise<string> {
    const key = keyStore.get(this.keyId);
    if (!key) throw new Error("No API key set for this provider.");
    const res = await this.f(`${this.opts.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: this.opts.model,
        messages,
        temperature,
        ...(jsonSchema
          ? { response_format: { type: "json_schema", json_schema: { name: "output", schema: jsonSchema } } }
          : {})
      })
    });
    // Never include the key or request body in thrown errors.
    if (!res.ok) throw new Error(`Remote model request failed (${res.status}).`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Remote model returned no content.");
    return content;
  }
}
