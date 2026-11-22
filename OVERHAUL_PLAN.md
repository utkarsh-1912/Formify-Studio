# Formify Studio — Overhaul & Upgrade Plan

Status: proposal. Nothing in `src/` has been changed. Written from a review of the current codebase (~7.9k LOC, Next.js 15 / React 19) plus web research on open-weight models.

---

## 1. Product vision (PM view)

**Today:** local-first JSON ⇄ visual form builder with WebRTC sync, themes, code export, localStorage submissions.

**Target:** *the local-first, AI-native form + workflow platform for developers* — "Typeform/Tally UX, JSON-schema-native core, runs fully in your browser or on your own infra, with a workflow engine behind every form."

### Who it's for
| Persona | Job to be done | Today's gap |
|---|---|---|
| Developer | Generate a form from a schema/prompt, export React/HTML, own the data | Only 8 field types, no logic, export only |
| Founder / ops | Collect leads, route them, get notified | No backend, no integrations, no workflows |
| Privacy-sensitive team | Forms with AI but data never leaves device | No AI at all |

### "True competitor" — positioning
| Competitor | Their strength | Our wedge |
|---|---|---|
| Typeform / Tally | Polish, conversational UX | Open schema, local-first, self-host, AI on-device |
| Google Forms | Free, ubiquitous | Real conditional logic + workflows + code export |
| SurveyJS / Form.io / JSON Forms / RJSF | Schema-driven, developer friendly | Visual builder + AI authoring + workflow engine in one |
| Formbricks / Fillout | Integrations, analytics | Privacy-first, BYO model, P2P collab |

**Moat:** (1) open JSON schema as the single source of truth, (2) private/on-device AI, (3) workflow engine that shares that schema, (4) bring-your-own open-weight model.

---

## 2. Current-state findings (architect view)

Verified in the repo:

1. **`src/App.tsx` is 1,323 lines with ~40 `localStorage`/`useState`/fetch touch-points** — monolithic; state, persistence, P2P, and UI are tangled.
2. **No backend, no persistence beyond localStorage.** Submissions, schemas and tokens are per-browser. Edit "tokens" (`?token=tok_xxxx`) are client-side only — the README calls them "cryptographic" but without a server they cannot enforce access. This claim should be fixed or backed by real signing.
3. **Validation is hand-rolled** (`schemaValidation.ts`, 8 field types) even though `ajv` is already a dependency. There is no formal JSON Schema for Formify's own format.
4. **P2P (`p2pSync.ts`)** syncs whole schemas last-write-wins over PeerJS's public `0.peerjs.com` broker + Google STUN; no CRDT, no TURN (fails behind symmetric NAT), CDN script fallback loads unpinned-origin code at runtime.
5. **Form engine** (`FormGenerator`) reads raw `FormData` → everything is a string; no conditional logic, multi-step, file upload, calculated fields, or i18n. `react-hook-form` is a dependency but the renderer doesn't use it.
6. **Tests are thin** (3 files, ~190 lines); no Jest/Vitest/Playwright in `package.json` scripts or devDependencies, so `npm test` doesn't exist.
7. **Duplicate/stale files**: `src/App.tsx` + `src/app/*` (CRA remnants: `App.css`, `App.test.tsx`, `index.css` ×2).

---

## 3. Target architecture

```
┌────────────────────────── Browser (local-first) ──────────────────────────┐
│ UI shell (Next.js App Router)                                              │
│  ├─ Builder: Visual • JSON • AI Chat • Workflow Canvas                    │
│  ├─ Renderer (headless core + themed skins)                               │
│  └─ Zustand store ── Dexie/IndexedDB ── Yjs CRDT doc (sync + history)     │
│                                                                            │
│ @formify/core   schema (Zod/JSON Schema), logic engine, validators        │
│ @formify/flow   workflow runtime (DAG executor, runs in Worker)          │
│ @formify/ai     agent orchestrator + model providers                      │
│     ├─ Provider: WebLLM (WebGPU, on-device, GBNF/JSON-schema constrained) │
│     ├─ Provider: Ollama / vLLM / llama.cpp server (local or self-hosted)  │
│     ├─ Provider: HF Inference Endpoints / OpenAI-compatible API (BYO key) │
└────────────────────────────────────────────────────────────────────────────┘
          │ optional                                   │ optional
┌─────────▼──────────┐                     ┌───────────▼───────────┐
│ Sync relay (y-websocket / y-webrtc +     │ Edge runtime for      │
│ self-hostable TURN) + auth (signed JWT)  │ workflows (webhooks,  │
│ + Postgres/SQLite for shared submissions │ email, cron)          │
└──────────────────┘                     └───────────────────────┘
```

Principles: schema is the single source of truth; every feature works offline; server is optional and self-hostable; every AI output is validated against the schema before it touches the user's form.

### Repo restructure
Monorepo (pnpm workspaces): `apps/studio`, `packages/core`, `packages/flow`, `packages/ai`, `packages/renderer`, `packages/export`. Break `App.tsx` into feature modules (`features/builder`, `features/submissions`, `features/share`, `features/settings`).

---

## 4. Multi-agent AI design

Form authoring is a pipeline of narrow agents, each constrained by the schema — better and cheaper than one big prompt, and it lets small on-device models do real work.

| Agent | Input → Output | Model tier |
|---|---|---|
| **Intent Planner** | "Onboarding form for a dental clinic" → structured brief (sections, required data, compliance flags) | small (1–4B) |
| **Schema Author** | brief → Formify JSON, **grammar-constrained** to the Formify JSON Schema | small, fine-tuned (§5) |
| **Logic Agent** | schema → conditional rules, calculated fields, validation regexes | small–medium |
| **UX Critic** | schema → issues (too long, unclear labels, a11y, ordering) + patch ops | medium |
| **Validator (non-LLM)** | AJV + custom rules; failure → loop back with error text (max 3 retries) | deterministic |
| **Workflow Designer** | "email me when budget > 10k, add to Notion" → workflow DAG JSON | medium |
| **Data Analyst** | submissions → insights, anomaly/spam flags, summaries | medium |
| **Router** | picks cheapest capable provider per step; falls back local → remote | deterministic + heuristics |

Mechanics:
- Output is always a **JSON Patch** against the current schema (diffable, undoable, shown to user as "accept/reject changes") — never a blind overwrite.
- Constrained decoding (JSON Schema/grammar) removes structural failures; the validator + critic address semantic quality. Research found small models fully fix structural validity with constrained decoding but retain a semantic gap that scales with model size ([arXiv 2609.23742](https://arxiv.org/pdf/2609.23742)). That is why the Critic + Validator loop exists.
- Evals gate every model/prompt change (§8).

---

## 5. Open-weight model research (Hugging Face)

**Caveat on evidence:** web search surfaced papers and a few model cards, not a clean leaderboard. Treat the picks below as a *shortlist to benchmark on our own eval set*, not final answers. I could not verify download counts, licenses or current revisions — confirm each model card before adoption.

### Findings
- **Constrained decoding matters more than model choice** for valid JSON; common stacks are Outlines (any HF model; JSON Schema, regex, CFG), and vLLM/SGLang with XGrammar for production ([InsiderLLM guide](https://insiderllm.com/guides/structured-output-local-llms/), [techsy ranking](https://techsy.io/en/blog/best-llm-structured-output-libraries)).
- **Browser:** WebLLM supports JSON-Schema and CFG-constrained generation via a WASM grammar engine on WebGPU ([paper](https://arxiv.org/abs/2412.15803v1)). I found no evidence of equivalent constrained decoding in Transformers.js → use WebLLM for on-device generation.
- **Fine-tuning small models works for this task:** STAGE fine-tunes Qwen3-4B, Qwen2.5-3B and Llama-3.2 1B/3B on text→JSON artifacts ([arXiv 2606.20072](https://arxiv.org/pdf/2606.20072)); SLOT reports a fine-tuned Mistral-7B + constrained decoding as its best setup ([arXiv 2505.04016](https://arxiv.org/pdf/2505.04016)); RL on schema adherence is an option ([arXiv 2502.14905](https://arxiv.org/pdf/2502.14905)).
- **Existing HF artifacts to start from:** [smolstruct-1.7b](https://huggingface.co/tugrulkaya/smolstruct-1.7b) (LoRA on SmolLM2-1.7B for schema-guided extraction / function calling); dataset [ChristianAzinn/json-training](https://huggingface.co/datasets/ChristianAzinn/json-training/raw/main/README.md). A 2026 guide names Qwen 3.6 (27B / 35B-A3B) and Gemma 4 26B-A4B as strong local structured-output models (single secondary source, unverified).
- **Gap:** I found **no public model or dataset for text → *form* schema.** That's an opportunity: we can publish the first one.

### Shortlist to benchmark
| Tier | Where it runs | Candidates | Use |
|---|---|---|---|
| Edge (≤2B) | Browser WebGPU | SmolLM2-1.7B (+smolstruct), Qwen3 0.6–1.7B, Llama-3.2-1B | Planner, quick edits |
| Local (3–8B) | Laptop / Ollama | Qwen3-4B / Qwen2.5-3B-Instruct, Llama-3.2-3B, Mistral-7B | Schema Author (fine-tuned) |
| Server (14–35B) | vLLM / HF Endpoints | Qwen 3.6 27B / 35B-A3B, Gemma 4 26B-A4B | Critic, Workflow Designer, Analyst |

### Our own fine-tune ("formify-schema-4b")
1. **Data:** synthesize 20–50k (prompt → Formify schema) pairs with a large teacher model; augment from existing public form/JSON-schema datasets (check licenses); add negatives and edit-instruction pairs (schema + "make email required" → patch).
2. **Train:** QLoRA SFT on Qwen3-4B (or Qwen2.5-3B), then optional GRPO with reward = AJV-valid + rubric score ([arXiv 2502.14905](https://arxiv.org/pdf/2502.14905)).
3. **Ship:** GGUF (Ollama/llama.cpp) + MLC build (WebLLM) + HF model card + dataset card.
4. **Gate:** must beat the un-tuned base and a 27B+ baseline on our eval (§8) before release.

---

## 6. Custom workflow engine

**Model:** a workflow is a DAG stored as JSON next to the form schema.

- **Triggers:** form submitted, field changed, schedule, webhook, manual.
- **Nodes:** Condition/branch, Transform (JSONata/JS sandbox), AI step (any provider, schema-constrained output), HTTP/Webhook, Email, Delay, Human approval, Write (Notion/Sheets/DB), Loop.
- **Runtime:** pure TS executor in `@formify/flow`; runs in a Web Worker locally, same code on edge server for headless runs. Each run logged with per-node input/output for replay/debugging.
- **Editor:** node canvas (React Flow / xyflow), live test with sample submission, "describe it in English" → Workflow Designer agent proposes the DAG as a patch.
- **Safety:** sandboxed transforms (QuickJS-WASM), secrets in encrypted vault, outbound-domain allowlist, human approval node before irreversible actions.

---

## 7. Product upgrade roadmap

### Phase 0 — Foundations (1–2 wks)
- Delete CRA remnants; add Vitest + Testing Library + Playwright; CI (lint, typecheck, test, build).
- Define **Formify JSON Schema v1** (versioned), replace hand-rolled validator with AJV; add migration function per version.
- Split `App.tsx` into feature modules; introduce Zustand + IndexedDB (Dexie) replacing scattered localStorage.
- Fix README security claims (tokens are not cryptographic without a server).

### Phase 1 — Competitive form engine (3–4 wks)
- Field types: multi-select, rating, slider, file upload, address, phone, signature, matrix, section/page break, rich text, hidden, calculated.
- Conditional logic (show/hide/skip/require), multi-step with progress, partial save, i18n, a11y (WCAG 2.2 AA), spam protection.
- Renderer rewritten on react-hook-form + AJV resolver with typed values (not all strings).
- Exports: React/Vue/HTML plus **embeddable `<script>` widget** and Web Component.

### Phase 2 — AI authoring (3–4 wks)
- `@formify/ai` provider abstraction; WebLLM on-device provider with schema-constrained decoding; Ollama + OpenAI-compatible providers.
- Chat-to-form panel with patch review UI; "improve this form" (Critic); import from screenshot/PDF/CSV (vision model, opt-in).
- Model manager UI: download/size/VRAM warnings, WebGPU capability check, graceful fallback.

### Phase 3 — Workflows (4 wks)
- Flow runtime + canvas editor + 10 core nodes + run history; AI workflow designer; templates ("lead → Slack + CRM").

### Phase 4 — Collaboration & backend (3–4 wks)
- Replace LWW P2P with **Yjs** (y-webrtc and y-websocket), add TURN, version history/undo across peers, comments, presence.
- Optional self-host server (SQLite/Postgres): real auth (signed JWT roles), shared submissions, webhook delivery, retention controls. Docker one-liner.

### Phase 5 — Own model & ecosystem (ongoing)
- Train/publish formify-schema-4b + dataset; public eval leaderboard; template marketplace; plugin API for nodes and field types; analytics (funnel/drop-off per field).

---

## 8. Quality, evals & risk

**Eval harness (build in Phase 0/2):** 300+ prompts with gold schemas; metrics: AJV-valid %, field-recall/precision vs gold, logic correctness, LLM-judge rubric (UX, a11y), latency, tokens. Run per model, per prompt change, in CI nightly.

**Testing pyramid:** unit (core, logic, flow executor), property tests (schema round-trip, patch apply/invert), component tests, Playwright e2e (build → share → fill → workflow fires), a11y (axe).

| Risk | Mitigation |
|---|---|
| Small model semantic errors | Critic + validator loop, patch-review UX, never auto-apply |
| Prompt injection via submissions into AI steps/analyst | Treat submission data as untrusted; schema-constrained outputs; no tool access in analyst; approval node for side effects |
| WebGPU unavailable / big downloads | Capability detect, size warnings, remote/Ollama fallback |
| Model licenses | License check per model before bundling; recommend not bundling weights |
| Scope creep | Phase gates with measurable exit criteria |
| Privacy claims | Honest docs; "AI runs on-device" badge only when provider is local |

**Success metrics:** time-to-first-form < 60 s with AI; ≥ 95 % AJV-valid and ≥ 85 % rubric pass on eval for the default local model; ≥ 30 % of forms use logic; workflow run success ≥ 99 %.

---

## 9. Suggested first PRs
1. Cleanup + test tooling + CI.
2. Formify JSON Schema v1 + AJV validator + migrations.
3. `App.tsx` decomposition + store.
4. `@formify/ai` skeleton with WebLLM provider and one-agent "prompt → form" behind a flag.
5. Eval harness with 50 seed prompts.

## 10. Open questions for you
- Target audience first: developers (open-source) or non-technical teams (SaaS)?
- Is a hosted backend in scope, or must everything stay local/self-hosted?
- GPU budget for fine-tuning (a single 24 GB GPU suffices for QLoRA on a 4B model)?
- Licensing intent for the project and for the published model/dataset?
