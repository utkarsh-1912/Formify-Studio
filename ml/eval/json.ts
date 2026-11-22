/**
 * Pull the first top-level JSON object out of model output.
 * Handles <think>…</think> blocks (Qwen3), ```json fences, and surrounding prose.
 * Mirrored in Python by ml/formify_ml/text.py — keep behaviour in sync.
 */
export function extractJson(text: string): unknown {
  let s = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  const start = s.indexOf("{");
  if (start === -1) throw new Error("no JSON object found in output");

  // Scan for the matching closing brace, respecting strings and escapes.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(s.slice(start, i + 1));
    }
  }
  throw new Error("unterminated JSON object in output");
}
