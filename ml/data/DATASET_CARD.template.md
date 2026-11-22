---
license: {{license}}
task_categories:
  - text-generation
language:
  - en
tags:
  - json
  - structured-output
  - forms
  - formify
size_categories:
  - 1K<n<100K
pretty_name: {{name}}
---

# {{name}}

Synthetic instruction data for generating and editing **Formify form schemas** (JSON, schema v1).
Created {{created_at}}. Schema SHA-256: `{{schema_sha256}}`.

> TEMPLATE: fill in every `TODO` before publishing. Do not publish without completing the license review below.

## Tasks

| Task | Input | Target |
|---|---|---|
| `generate` | natural-language request for a form | Formify schema v1 JSON |
| `edit` | current Formify schema + edit instruction | RFC 6902 JSON Patch (`add`/`remove`/`replace`) |

## Splits

| Split | Rows |
|---|---|
| train | {{train_rows}} |
| val | {{val_rows}} |
| test | {{test_rows}} |

Rows by task: `{{rows_by_task}}`. Rows by creation method: `{{rows_by_method}}`.
Splits are grouped by base form, so a form and its derived edits never straddle splits.

## Fields

`id`, `task`, `domain`, `messages` (chat format: system, user, assistant), `gold` (JSON string of the final valid schema),
`provenance` (method, teacher, declared teacher license, seed, script version, timestamp).

## How it was made

1. Request prompts ideated by a teacher model across ~50 domains and 5 writing styles.
2. Schemas authored by the teacher using the same system prompt the student sees (distillation).
3. Edits: rule-based (exactly known patch) and/or teacher-written; every patch is applied and the result re-validated.
4. Filtering: JSON Schema v1 validation, semantic checks (unique ids, compilable regex), length bounds, exact and token-set
   de-duplication, and removal of anything matching the evaluation seed prompts/schemas (token Jaccard >= 0.8 or identical schema).

Teacher model(s) and declared licenses: {{teachers}}.

## Licensing and provenance — TODO (human review required)

- [ ] Confirmed each teacher model's license / terms of service permit using its outputs to train and to release a derived model.
- [ ] Confirmed no third-party data was mixed in without a compatible license (list sources and licenses here: TODO).
- [ ] Dataset license above matches the above constraints.
- `MANIFEST.json` records file hashes and the licenses *declared by the operator*; it does not verify them.

## Limitations — TODO

- Synthetic and English-only; reflects the teacher's style and biases and ~50 hand-picked domains.
- Covers only the 8 field types in Formify v1 and no conditional logic.
- Gold schemas are one plausible answer, not the only correct one.
- Not suitable for anything outside generating/editing Formify forms.
