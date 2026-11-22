import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ARTIFACTS } from "./artifacts";

// Paths are relative to the repo root; run from there.
for (const [rel, content] of ARTIFACTS()) {
  const p = resolve(rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  console.log(`wrote ${rel}`);
}
