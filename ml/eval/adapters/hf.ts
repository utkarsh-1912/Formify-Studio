import type { GenerateRequest, GenerateResult, ModelAdapter } from "../types";
import { postJson, trimSlash, type FetchLike } from "./http";

export interface HfEndpointOptions {
  /** Dedicated Inference Endpoint base URL (https://xxxx.endpoints.huggingface.cloud). */
  endpointUrl: string;
  /** Model label for reports; TGI endpoints ignore the `model` request field. */
  model?: string;
  token?: string;
  fetchImpl?: FetchLike;
  temperature?: number;
  /**
   * How to pass the schema to a Text Generation Inference (TGI) backend.
   * - "json_schema": OpenAI-style response_format {type:"json_schema", json_schema:{…}}
   * - "tgi_value":   TGI grammar style response_format {type:"json", value: <schema>}
   * UNVERIFIED against a live endpoint: TGI versions differ, so check your endpoint's docs and pick one.
   */
  grammarStyle?: "json_schema" | "tgi_value";
}

/** Hugging Face Inference Endpoint exposing the OpenAI-compatible Messages API (TGI / vLLM images). */
export function hfEndpointAdapter(opts: HfEndpointOptions): ModelAdapter {
  const base = trimSlash(opts.endpointUrl);
  const token = opts.token ?? process.env.HF_TOKEN;
  const fetchImpl = opts.fetchImpl ?? (fetch as FetchLike);
  const style = opts.grammarStyle ?? "json_schema";
  return {
    name: "hf-endpoint",
    model: opts.model ?? "tgi",
    async generate(req: GenerateRequest): Promise<GenerateResult> {
      let responseFormat: object | undefined;
      if (req.jsonSchema) {
        responseFormat =
          style === "tgi_value"
            ? { type: "json", value: req.jsonSchema }
            : { type: "json_schema", json_schema: { name: "formify_form", schema: req.jsonSchema } };
      }
      const json = await postJson(
        fetchImpl,
        `${base}/v1/chat/completions`,
        {
          model: opts.model ?? "tgi",
          temperature: opts.temperature ?? 0,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user }
          ],
          ...(responseFormat ? { response_format: responseFormat } : {})
        },
        token ? { authorization: `Bearer ${token}` } : {}
      );
      const text = json?.choices?.[0]?.message?.content;
      if (typeof text !== "string") throw new Error("Response missing choices[0].message.content");
      return { text, usage: { promptTokens: json.usage?.prompt_tokens, completionTokens: json.usage?.completion_tokens } };
    }
  };
}
