import type { GenerateRequest, GenerateResult, ModelAdapter } from "../types";
import { postJson, trimSlash, type FetchLike } from "./http";

export interface OpenAICompatOptions {
  model: string;
  /** e.g. https://api.openai.com/v1, http://localhost:8000/v1 (vLLM), http://localhost:11434/v1 (Ollama). */
  baseUrl?: string;
  apiKey?: string;
  fetchImpl?: FetchLike;
  temperature?: number;
  /** Adapter label shown in reports. */
  name?: string;
}

/**
 * Any OpenAI-compatible /chat/completions server (OpenAI, vLLM, SGLang, llama.cpp server, LM Studio…).
 * Constrained decoding via response_format json_schema; server support varies, so verify per backend.
 */
export function openaiCompatAdapter(opts: OpenAICompatOptions): ModelAdapter {
  const baseUrl = trimSlash(opts.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1");
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
  const fetchImpl = opts.fetchImpl ?? (fetch as FetchLike);
  return {
    name: opts.name ?? "openai-compatible",
    model: opts.model,
    async generate(req: GenerateRequest): Promise<GenerateResult> {
      const json = await postJson(
        fetchImpl,
        `${baseUrl}/chat/completions`,
        {
          model: opts.model,
          temperature: opts.temperature ?? 0,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user }
          ],
          ...(req.jsonSchema
            ? { response_format: { type: "json_schema", json_schema: { name: "formify_form", schema: req.jsonSchema } } }
            : {})
        },
        apiKey ? { authorization: `Bearer ${apiKey}` } : {}
      );
      const text = json?.choices?.[0]?.message?.content;
      if (typeof text !== "string") throw new Error("Response missing choices[0].message.content");
      return { text, usage: { promptTokens: json.usage?.prompt_tokens, completionTokens: json.usage?.completion_tokens } };
    }
  };
}
