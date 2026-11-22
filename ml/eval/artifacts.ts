/**
 * TypeScript-owned artifacts the Python pipeline consumes, so there is one source of truth:
 *   ml/schema/formify.v1.schema.json  – JSON Schema (from src/utils/formifySchema.ts)
 *   ml/schema/system_prompt.txt       – shared system prompt
 *   ml/eval/seeds.json                – eval cases (used for train/eval decontamination)
 * Regenerate with:  npx tsx ml/eval/write-artifacts.ts   (or: npx vite-node ml/eval/write-artifacts.ts)
 * A vitest test fails if the committed files are stale.
 */
import { formifySchemaV1 } from "../../src/utils/formifySchema";
import { SYSTEM_PROMPT } from "./prompt";
import { SEED_CASES } from "./seeds";

export const ARTIFACTS = (): Array<[string, string]> => [
  ["ml/schema/formify.v1.schema.json", JSON.stringify(formifySchemaV1, null, 2) + "\n"],
  ["ml/schema/system_prompt.txt", SYSTEM_PROMPT + "\n"],
  ["ml/eval/seeds.json", JSON.stringify(SEED_CASES, null, 2) + "\n"]
];
