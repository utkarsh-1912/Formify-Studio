<div align="center">

<img src="public/logo-long.png" alt="Formify Studio" height="56" />

# Formify Studio

**Build forms and workflows from one open JSON schema.**
Local-first. Visual and code editing in sync. Optional on-device AI.

[Source](https://github.com/utkarsh-1912/Formify-Studio) · [Roadmap](OVERHAUL_PLAN.md) · [Server docs](server/README.md) · [ML docs](ml/README.md)

</div>

---

## What it is

Formify Studio is a form and workflow studio built on Next.js 15 and React 19. A form is a versioned JSON document; the visual builder, the renderer, the code exports and the workflow engine all read that same document. Your forms and submissions live in your browser unless you opt into a server.

## Feature status

| Area | What you get | Status |
|---|---|---|
| **Builder** | Visual builder and CodeMirror JSON editor, kept in sync; templates gallery; 5 themes | Stable |
| **Form engine** | 17 field types (text, email, number, select, radio, checkbox, textarea, date, multiselect, rating, slider, file, phone, section, pagebreak, hidden, calculated), `visibleIf`/`requiredIf` expressions, calculated fields, multi-step forms, typed values, accessible renderer | Stable |
| **Validation** | Formal JSON Schema (v1, revision 1.1) checked with AJV, friendly error messages, `migrateSchema` for future versions | Stable |
| **Exports** | Standalone HTML, React + Tailwind, and a `<formify-form>` web component, all running the same logic as the studio | Stable |
| **Submissions** | Local log with structured and raw views, CSV/JSON export, analytics page | Stable |
| **Collaboration** | Yjs-based peer-to-peer sync (y-webrtc), per-field merging, presence, grouped undo | Beta |
| **AI assistant** | Plain-English requests become a reviewable JSON Patch diff; providers: WebLLM (on-device), Ollama, OpenAI-compatible endpoint | Beta, off by default |
| **Workflows** | Node canvas, branching, loops, webhooks with domain allowlist, approval pauses, test runs with mocks | Experimental |
| **Self-hosted server** | Hono + SQLite, JWT roles, validated submissions, signed webhooks, role-enforcing sync relay | Beta, see [server/README.md](server/README.md) |
| **Model pipeline** | Eval harness, dataset scripts, QLoRA/GRPO configs | Scripts only, nothing trained yet, see [ml/README.md](ml/README.md) |

## Quick start

Requires **Node.js 22** and npm.

```bash
git clone https://github.com/utkarsh-1912/Formify-Studio.git
cd Formify-Studio
npm install
npm run dev
```

Open <http://localhost:3000> and create a workspace.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run the Vitest suite (jsdom) |
| `npm run test:coverage` | Tests with coverage for `src/utils` |
| `npm run gen:runtime` | Regenerate the embedded engine used by HTML/React exports. Run it after editing `src/engine/core.ts`; a test fails if it is stale |

## Feature flags

Experimental features are hidden until enabled.

| Feature | Enable with |
|---|---|
| AI assistant tab | `NEXT_PUBLIC_FORMIFY_AI=1` at build time, or `localStorage.setItem("formify_ai", "1")` in the browser |
| Workflows page (`/ws/<id>/workflows`) | `NEXT_PUBLIC_FORMIFY_WORKFLOWS=1`, or the enable button on the page |

Collaboration can be pointed at your own infrastructure with `NEXT_PUBLIC_FORMIFY_SIGNALING` (comma-separated `wss://` signaling servers) and `NEXT_PUBLIC_FORMIFY_WS_URL` (y-websocket relay). See `src/sync/config.ts`.

## Example schema

```json
{
  "schemaVersion": 1,
  "formTitle": "Request a demo",
  "fields": [
    { "id": "email", "type": "email", "label": "Work email", "required": true },
    { "id": "isTeam", "type": "checkbox", "label": "I'm requesting for a team" },
    {
      "id": "seats",
      "type": "number",
      "label": "Team size",
      "visibleIf": "isTeam == true",
      "requiredIf": "isTeam == true"
    }
  ]
}
```

The schema is defined in [`src/utils/formifySchema.ts`](src/utils/formifySchema.ts). Expressions are parsed by a hand-written evaluator in `src/engine/`; no `eval` or `new Function` is used.

## Project layout

```
src/app/            Next.js routes: marketing pages and /ws/[id]/*
src/features/       Workspace UI by area (builder, submissions, share, settings)
src/store/          Zustand store + IndexedDB persistence (migrates old localStorage data)
src/engine/         Logic, validation and typed-value engine
src/sync/           Yjs collaboration layer
src/ai/             Providers, multi-agent pipeline, JSON Patch utilities
src/flow/           Workflow schema, executor and Web Worker wrapper
src/components/     Shared UI (renderer, editors, marketing, AI chat, flow canvas)
server/             Optional self-hostable backend
ml/                 Evaluation harness and training scripts
```

## Privacy and security

- Forms, themes and submissions are stored in your browser (IndexedDB, mirrored to `localStorage`). We do not run a database that receives them.
- Collaboration uses WebRTC after peers find each other through a signaling server. The default is the public `wss://signaling.yjs.dev`; configure your own for sensitive work.
- On-device AI downloads model files the first time. A remote AI endpoint receives your request and schema; your API key stays in memory for the session.
- **Edit and view-only links are a convenience, not access control.** Tokens live in the browser and are checked client-side. Enforced roles need the optional server.
- The server's threat model, including known gaps, is in [server/README.md](server/README.md). It has not been independently audited.

Full details: the in-app [privacy page](src/app/privacy/page.tsx).

## Contributing

Issues and pull requests are welcome. Before opening one:

```bash
npm run typecheck && npm test && npm run build
```

CI runs the same three checks on every push and pull request.

## License

No license file is included yet. Add one before accepting outside contributions or distributing builds.
