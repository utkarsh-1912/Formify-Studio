# Formify ML (Phase 5): evals, data, training

Everything needed to measure and (eventually) train a small open-weight model that turns a request into a Formify
form schema. See `OVERHAUL_PLAN.md` §5 and §8 for the why.

## Honest status

| Piece | State |
|---|---|
| Eval harness (`ml/eval`) | Built. 30 vitest tests pass offline. **Never run against a real model.** |
| 108 seed cases (`ml/eval/seeds.ts`) | Built, 18 domains. Every gold schema passes both the AJV schema and the app's `validateSchema`. Gold was written by hand/LLM-assisted and not reviewed by a domain expert. |
| HTTP adapters (Ollama, OpenAI-compatible, HF endpoint) | Request/response shapes tested with a fake `fetch` only. **Not tested against live servers.** The HF endpoint `response_format` style is unverified (two styles offered). |
| Dataset pipeline (`ml/data`) | Built and unit-tested end to end with a deterministic **mock teacher**. **No real teacher has been called; no real dataset exists.** Mock data is placeholder and the manifest tool refuses it. |
| Training (`ml/train`) | Config, data handling and reward function unit-tested. `sft.py`/`grpo.py` GPU paths, GGUF and MLC export **have never been run**. TRL/PEFT/MLC APIs drift; expect to adjust. |
| Model, results, benchmarks | **None.** Nothing here claims any model performance. Cards are templates full of `TODO`. |

## Layout

```
ml/
  eval/        TypeScript eval harness (tsx / vite-node / vitest)
  formify_ml/  Python lib: schema validation, JSON Patch, prompts, rewards, teacher client, rule-based edits
  data/        generate_synthetic.py -> filter_and_split.py -> manifest.py (+ dataset card template)
  train/       sft.py, grpo.py, export_gguf.py, export_mlc.py, YAML configs, model card template
  schema/      GENERATED from TS: formify.v1.schema.json, system_prompt.txt  (single source of truth)
  tests/       pytest suite
```

One source of truth: the JSON Schema comes from `src/utils/formifySchema.ts`, the system prompt from `ml/eval/prompt.ts`.
Regenerate after changing either (a vitest test fails if the committed copies are stale):

```powershell
npx vite-node ml/eval/write-artifacts.ts
```

## Run the tests (no network, no GPU)

```powershell
npx vitest run --config ml/vitest.config.ts      # eval harness (30 tests)
pip install -r ml/requirements.txt
python -m pytest ml/tests -q                     # data pipeline, rewards, patch, training helpers (43 tests)
npx tsc -p ml/tsconfig.json                      # typecheck the harness
```

Needs the repo's `npm ci` (for `ajv`, `vitest`). The app's own `npm test` is unaffected (it only includes `src/**`).

## Eval harness

```powershell
# offline smoke test, no model needed (modes: oracle, degraded, invalid-schema, garbage, chatty, error)
npx vite-node ml/eval/cli.ts -- --adapter mock --mode degraded

# real backends (with `npx tsx ml/eval/cli.ts ...` instead if you have tsx; arguments are the same)
npx vite-node ml/eval/cli.ts -- --adapter ollama --model qwen3:4b --limit 20
npx vite-node ml/eval/cli.ts -- --adapter openai --model <id> --base-url http://localhost:8000/v1      # vLLM, llama.cpp server, etc.
npx vite-node ml/eval/cli.ts -- --adapter hf --endpoint-url https://<id>.endpoints.huggingface.cloud   # HF_TOKEN from env
```

Useful flags: `--unconstrained` (do not send the JSON Schema; measures the model alone), `--domain`, `--limit`,
`--concurrency` (keep 1 for honest latency on one GPU), `--include-raw`, `--out`. Reports go to `ml/eval/reports/` (git-ignored).

**Metrics** (all per case, then averaged; aggregate and per domain in the JSON report):

- **parse rate / AJV-valid rate**: output contains a JSON object / it passes Formify schema v1 and has unique field ids.
- **field precision / recall / F1**: predicted vs gold fields, matched one-to-one by id, then label, then fuzzy label (token Jaccard >= 0.6).
- **type accuracy**: among matched fields, same `type` (micro-averaged).
- **constraint accuracy** (called "logic" in the plan): among matched fields, `required` agreement, plus option-set Jaccard for select/radio. Schema v1 has **no conditional logic**, so this is the closest available proxy; extend it when Phase 1 adds logic rules.
- **latency** mean / p50 / p95 and error count.

Known limits of these metrics: one gold answer per prompt (valid alternatives are penalised), small n, fuzzy matching can
over- or under-credit, and no semantic/UX judging. Treat differences of a few points on 108 cases as noise.

## Dataset pipeline

```powershell
pip install -r ml/requirements.txt

# 0) offline dry run of the whole pipeline (mock teacher = placeholder data, never train a release on it)
python ml/data/generate_synthetic.py --mock --n 200 --out ml/data/out/raw.jsonl
python ml/data/filter_and_split.py --in ml/data/out/raw.jsonl --out-dir ml/data/out/dataset
python ml/data/manifest.py --dir ml/data/out/dataset --dataset-license apache-2.0 --allow-mock --render-card

# 1) real run (OpenAI-compatible teacher; set TEACHER_API_KEY)
python ml/data/generate_synthetic.py --teacher-model <id> --teacher-base-url https://.../v1 `
    --teacher-license "<what you verified>" --n 20000 --edits-per-form 2 --edit-method mixed --out ml/data/out/raw.jsonl
```

- `generate` pairs: teacher ideates requests (about 50 domains x 5 styles), then writes the schema with the *same system prompt the student will see*.
- `edit` pairs: (schema + instruction) -> JSON Patch (`add`/`remove`/`replace` only), rule-based (exactly known) and/or teacher-written. Every patch is applied and the result re-validated; failures are dropped.
- Filtering: JSON Schema + semantic checks, length bounds, exact/token-set de-dup, and **decontamination**: anything whose prompt is >= 0.8 token-Jaccard to an eval seed, or whose schema equals an eval gold, is removed.
- Splits are deterministic and grouped by base form, so a form and its edits never straddle train/val/test.
- `manifest.py` writes hashes and provenance, and **refuses** mock rows or teacher rows without a declared license. It cannot verify licenses; a person must. Check the teacher's terms before training on its outputs.

## Training

Hardware: one 24 GB GPU (e.g. RTX 4090/3090/A5000) is the planned target for 4-bit QLoRA of a ~3-4B model at 2048 tokens
(batch 4 x accumulation 4). **This is an estimate, not measured here.** bitsandbytes needs CUDA (WSL2 on Windows). Throughput,
time and VRAM are unknown until a real run.

```powershell
pip install -r ml/requirements-train.txt
python ml/train/sft.py --config ml/train/configs/sft_qwen3_4b.yaml --dry-run   # validates config + data, no GPU
python ml/train/sft.py --config ml/train/configs/sft_qwen3_4b.yaml
# optional stage 2, only if the eval shows failures a reward can fix:
python ml/train/grpo.py --config ml/train/configs/grpo_qwen3_4b.yaml
# export
python ml/train/export_gguf.py --base Qwen/Qwen3-4B --adapter ml/train/outputs/formify-schema-4b-sft --llama-cpp-dir <llama.cpp> --out-dir ml/train/outputs/gguf --dry-run
python ml/train/export_mlc.py  --merged ml/train/outputs/gguf/merged --out-dir ml/train/outputs/mlc --conv-template <verify> --dry-run
```

- Loss is on the assistant answer only (prompt/completion format). Qwen3 is trained in non-thinking mode.
- GRPO reward (`formify_ml/rewards.py`): invalid output < 0.3 <= any valid output; valid adds a design rubric and field F1 vs gold.
- Hyperparameters are common QLoRA defaults, **untuned**.
- After export, re-run the eval harness on **each artifact** (full precision, GGUF via Ollama, MLC via WebLLM). Quantization can hurt structured output.

## Model-selection benchmark protocol

Goal: pick the base model(s) to fine-tune and the fallback tiers from the plan's shortlist, using evidence rather than reputation.

**Candidates** (from the plan; names/sizes come from web research and are unverified): Edge: SmolLM2-1.7B (+ smolstruct), Qwen3 0.6B/1.7B, Llama-3.2-1B. Local: Qwen3-4B, Qwen2.5-3B-Instruct, Llama-3.2-3B, Mistral-7B. Server: Qwen 3.6 27B / 35B-A3B, Gemma 4 26B-A4B.

**Before running anything, for each candidate record from its Hugging Face model card (do not trust this README):**
exact repo id, **commit SHA**, **license and use restrictions** (e.g. Qwen2.5-3B is, to my knowledge, not Apache-2.0), parameter count,
context length, and chat template behaviour (thinking mode). Drop candidates whose license blocks your intended release.

**Run:**
1. Freeze the eval: same `seeds.json` commit for every model; temperature 0.
2. For each model run twice: `--unconstrained` (raw model ability) and constrained (what the product will use). Constrained runs need a backend that supports schema-constrained decoding; record which backend/version and whether it accepted the schema (the schema uses `if/then`, which some grammar engines reject; if so, simplify the grammar and say so).
3. Run latency on the target hardware with `--concurrency 1`, 3 repeats, after a warm-up; record GPU/CPU, RAM/VRAM, quantization, backend and version.
4. Record per model: AJV-valid, field F1, type accuracy, constraint accuracy, p50/p95 latency, error count, plus the metadata above. Keep the JSON reports.
5. Report a table with all columns and caveats; do not collapse to a single score.

**Decision rules (from the plan; adjust deliberately, not after seeing results):**
- Candidate must reach >= 95% AJV-valid when constrained and >= 85% on the rubric/F1 bar the team sets *before* running (the plan's targets).
- A fine-tune must beat its un-tuned base and a 27B+ baseline on this eval before release, on a held-out set that was decontaminated against training data (the pipeline does this against `seeds.json`; if you tune on seeds, build a fresh eval).
- With n = 108 treat gaps under ~3-5 points as ties; prefer the cheaper/smaller model.

## Caveats worth knowing

- The seeds are the *only* eval. Once you iterate on prompts or models against them, they stop being held-out. Add a private second set before making release claims.
- WebLLM/MLC and GGUF paths are the riskiest: conversion flags, templates, and grammar-engine support vary by version.
- `formify_ml.schema` uses Python's `re` to check `validation.pattern`; some valid JavaScript regex syntax will be flagged as invalid and filtered out.
