---
# TODO: set after license review of the base model and training data
license: TODO
base_model: TODO   # e.g. Qwen/Qwen3-4B (verify the exact repo id and revision)
library_name: transformers
pipeline_tag: text-generation
tags:
  - json
  - structured-output
  - forms
  - formify
  - lora
datasets:
  - TODO   # your dataset repo id
---

# formify-schema (TEMPLATE)

> TEMPLATE: this card contains no results. Do not publish until every TODO is filled with measured, reproducible numbers
> and the license checklist is complete.

A fine-tune of **TODO base model** (revision `TODO`) that turns a natural-language request into a
[Formify](https://github.com/utkarsh-1912/formify-json) form schema (JSON, schema v1), and optionally edits an existing schema via JSON Patch.

## Intended use

- Draft forms from a prompt inside Formify Studio, with the output **validated against the schema and reviewed by a human** before use.
- Not intended for: general chat, safety-critical decisions, or generating forms that collect sensitive data without review.

## Prompt format

Use the system prompt in `ml/schema/system_prompt.txt` and user message `Create a form: <request>`.
For edits, use the edit prompt in `ml/formify_ml/prompts.py`. Non-thinking mode (Qwen3: `enable_thinking=False`).
Best results with JSON-Schema-constrained decoding (Ollama `format`, vLLM/XGrammar, WebLLM grammar engine).

## Training

- Method: QLoRA SFT (TODO: optional GRPO), config `TODO`, commit `TODO`.
- Data: `TODO dataset repo` (see its card for provenance and licenses). Hardware: TODO. Wall-clock: TODO.

## Evaluation — TODO (measured, not estimated)

Harness: `ml/eval` at commit `TODO`, 108 seed prompts, temperature 0, constrained and unconstrained.

| Model | Constrained | AJV-valid | Field F1 | Type acc | Constraint acc | p50 latency | Hardware/backend |
|---|---|---|---|---|---|---|---|
| base | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| this model | TODO | TODO | TODO | TODO | TODO | TODO | TODO |

Known metric limits: single gold per prompt (valid alternatives are penalised), fuzzy label matching, and no
conditional-logic scoring because schema v1 has none.

## Limitations and risks — TODO

- Trained on synthetic English data; may over-produce generic fields and under-use select/radio options.
- Quantization (GGUF Q4 / MLC q4f16) may change structured-output reliability; re-evaluate each artifact.

## License checklist

- [ ] Base model license read and compatible with this release (revision pinned).
- [ ] Training data license/provenance reviewed (teacher outputs allowed for training?).
- [ ] Quantized artifacts (GGUF, MLC) carry the same license notices.
