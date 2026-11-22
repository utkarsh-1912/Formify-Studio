import type { GenerateRequest, GenerateResult, ModelAdapter } from "../types";
import { postJson, trimSlash, type FetchLike } from "./http";

export interface OllamaOptions {
  model: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  temperature?: number;
}

/** Ollama native /api/chat. Constrained decoding via the `format` field (JSON Schema). */
export function ollamaAdapter(opts: OllamaOptions): ModelAdapter {
  const baseUrl = trimSlash(opts.baseUrl ?? process.env.OLLAMA_HOST ?? "http://localhost:11434");
  const fetchImpl = opts.fetchImpl ?? (fetch as FetchLike);
  return {
    name: "ollama",
    model: opts.model,
    async generate(req: GenerateRequest): Promise<GenerateResult> {
      const json = await postJson(fetchImpl, `${baseUrl}/api/chat`, {
        model: opts.model,
        stream: false,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user }
        ],
        ...(req.jsonSchema ? { format: req.jsonSchema } : {}),
        options: { temperature: opts.temperature ?? 0 }
      });
      const text = json?.message?.content;
      if (typeof text !== "string") throw new Error("Ollama response missing message.content");
      return { text, usage: { promptTokens: json.prompt_eval_count, completionTokens: json.eval_count } };
    }
  };
}
