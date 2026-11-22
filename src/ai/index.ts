export * from "./types";
export * from "./patch";
export * from "./sanitize";
export * from "./modelManager";
export { Router } from "./router";
export { runPipeline, validateCandidate, PipelineError, MAX_AUTHOR_ATTEMPTS } from "./pipeline";
export { FakeProvider } from "./providers/fake";
export { OllamaProvider } from "./providers/ollama";
export { OpenAICompatibleProvider, keyStore } from "./providers/openaiCompatible";
export { WebLLMProvider } from "./providers/webllm";

/**
 * Feature flag. AI authoring is OFF unless `NEXT_PUBLIC_FORMIFY_AI=1` at build time
 * or the user sets localStorage `formify_ai=1` (handy for trying it without a rebuild).
 */
export function isAiEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_FORMIFY_AI === "1") return true;
  try {
    return typeof window !== "undefined" && window.localStorage.getItem("formify_ai") === "1";
  } catch {
    return false;
  }
}
