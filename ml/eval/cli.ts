/**
 * Eval CLI.
 *   npx tsx ml/eval/cli.ts --adapter mock --mode degraded
 *   npx tsx ml/eval/cli.ts --adapter ollama --model qwen3:4b --limit 20
 *   npx tsx ml/eval/cli.ts --adapter openai --model my-model --base-url http://localhost:8000/v1
 *   npx tsx ml/eval/cli.ts --adapter hf --endpoint-url https://xxx.endpoints.huggingface.cloud
 * Offline alternative that needs no extra install (vitest ships vite-node):
 *   npx vite-node ml/eval/cli.ts -- --adapter mock
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { hfEndpointAdapter } from "./adapters/hf";
import { mockAdapter, type MockMode } from "./adapters/mock";
import { ollamaAdapter } from "./adapters/ollama";
import { openaiCompatAdapter } from "./adapters/openai";
import { formatSummary, runEval } from "./runner";
import { SEED_CASES } from "./seeds";
import type { ModelAdapter } from "./types";

const { values } = parseArgs({
  options: {
    adapter: { type: "string", default: "mock" },
    model: { type: "string" },
    mode: { type: "string", default: "oracle" },
    "base-url": { type: "string" },
    "endpoint-url": { type: "string" },
    "grammar-style": { type: "string" },
    limit: { type: "string" },
    domain: { type: "string" },
    concurrency: { type: "string", default: "1" },
    unconstrained: { type: "boolean", default: false },
    "include-raw": { type: "boolean", default: false },
    out: { type: "string" }
  }
});

function buildAdapter(): ModelAdapter {
  const model = values.model;
  switch (values.adapter) {
    case "mock":
      return mockAdapter(SEED_CASES, values.mode as MockMode);
    case "ollama":
      if (!model) throw new Error("--model is required for ollama");
      return ollamaAdapter({ model, baseUrl: values["base-url"] });
    case "openai":
      if (!model) throw new Error("--model is required for openai");
      return openaiCompatAdapter({ model, baseUrl: values["base-url"] });
    case "hf":
      if (!values["endpoint-url"]) throw new Error("--endpoint-url is required for hf");
      return hfEndpointAdapter({
        endpointUrl: values["endpoint-url"],
        model,
        grammarStyle: values["grammar-style"] as "json_schema" | "tgi_value" | undefined
      });
    default:
      throw new Error(`unknown adapter: ${values.adapter}`);
  }
}

async function main(): Promise<void> {
  let cases = SEED_CASES;
  if (values.domain) cases = cases.filter((c) => c.domain === values.domain);
  if (values.limit) cases = cases.slice(0, Number(values.limit));
  if (cases.length === 0) throw new Error("no cases selected");

  const adapter = buildAdapter();
  const report = await runEval({
    adapter,
    cases,
    concurrency: Number(values.concurrency),
    constrained: !values.unconstrained,
    includeRaw: values["include-raw"],
    onProgress: (done, total) => {
      if (done % 10 === 0 || done === total) process.stderr.write(`  ${done}/${total}\n`);
    }
  });

  const stamp = report.meta.startedAt.replace(/[:.]/g, "-");
  const out = resolve(values.out ?? `ml/eval/reports/${adapter.name}-${adapter.model.replace(/[^\w.-]+/g, "_")}-${stamp}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(formatSummary(report));
  console.log(`report: ${out}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
