# Formify Server (optional)

A small, self-hostable backend. The Formify app works fully without it (local-first). Run this when you need
**enforceable permissions**, **shared submissions**, **webhooks**, or a **persistent sync relay**.

- Hono + SQLite (better-sqlite3), JWT auth (`jose`, HS256), Yjs relay compatible with `y-websocket` clients.
- Validates schemas with the same AJV schema as the app (`src/utils/formifySchema.ts`).

## Run

```bash
cd server && npm install
cp .env.example .env        # set JWT_SECRET (>=32 chars) and ADMIN_API_KEY
node --env-file=.env --import tsx src/index.ts
# or: docker compose -f server/docker-compose.yml up --build   (from repo root)
```

Point the app at it (`.env.local` of the Next app):

```
NEXT_PUBLIC_FORMIFY_SYNC_TRANSPORT=websocket
NEXT_PUBLIC_FORMIFY_WS_URL=wss://your-host/ws
```

and pass `{ token }` as the 6th argument of `useP2PSync` (a viewer/editor/owner token from this server).

## API (all JSON; `Authorization: Bearer <token>` unless noted)

| Method & path | Role | Notes |
|---|---|---|
| `POST /api/workspaces` | `x-admin-key` (or `OPEN_SIGNUP=true`) | returns `ownerToken` (90 d) |
| `GET /api/workspaces/:id` | viewer+ | |
| `PUT /api/workspaces/:id/schema` | editor+ | AJV-validated; this is the *published* schema submissions are checked against |
| `PUT /api/workspaces/:id/settings` | owner | `retentionDays` (1–3650 or null), `publicSubmissions` |
| `POST /api/workspaces/:id/tokens` | owner | mint `editor`/`viewer` tokens, ttl 60 s–30 d |
| `DELETE /api/workspaces/:id/tokens/:jti` | owner | revoke |
| `POST /api/workspaces/:id/submissions` | public (or viewer+ if `publicSubmissions=false`) | validated, rate-limited, 64 KB cap |
| `GET /api/workspaces/:id/submissions` | editor+ | paginated |
| `GET /api/workspaces/:id/submissions/export?format=csv` | editor+ | formula-injection-safe |
| `DELETE /api/workspaces/:id/submissions/:sid` | owner | |
| `POST/GET/DELETE /api/workspaces/:id/webhooks` | owner | secret shown once |
| `POST /api/admin/purge` | `x-admin-key` | run retention now (also runs hourly) |
| `WS /ws/:workspaceId?token=…` | viewer+ | Yjs sync; viewers are read-only |

### Webhook signatures
`X-Formify-Signature: t=<unix>,v1=<hex>` where `v1 = HMAC_SHA256(secret, "<t>.<raw body>")`. Reject if `t` is more than
~5 minutes old (replay protection) and compare in constant time. Delivery: up to 6 attempts, exponential backoff
(30 s → 1 h), 5 s timeout, redirects not followed, non-2xx = failure. Delivery is **at-least-once**: dedupe on
`X-Formify-Delivery`.

## Threat model (what this does and does not protect)

**Protects against**
- Unauthenticated reads/writes of workspace data: every non-public route needs a signed token scoped to one workspace
  and a minimum role; algorithm pinned to HS256 (no `alg:none`), issuer checked, revocation list honoured.
- Viewers writing to the shared doc: viewer WebSocket sync updates are dropped server-side.
- Cross-workspace access with a valid token for another workspace (403).
- Junk/abusive submissions: schema validation, unknown keys rejected, 64 KB body cap, per-IP rate limits.
- CSV formula injection in exports.
- Webhook SSRF (private/loopback/link-local/metadata ranges blocked, https only, no redirects, URL credentials
  rejected), forged webhooks (HMAC), and secret leakage (secrets never listed after creation).
- Cross-site WebSocket hijacking: browser `Origin` must be in `ALLOWED_ORIGINS`.

**Does NOT protect against — be aware**
- **Editors are trusted.** The server enforces *who* may send CRDT updates, not *what* they contain. An editor can write
  arbitrary JSON into the live Yjs document. Only `PUT /schema` is validated. The app should validate a document before
  publishing it.
- **DNS rebinding on webhooks.** The resolved address is checked before each delivery, but not pinned to the socket.
  Use an egress proxy/firewall if webhook targets are untrusted.
- **Regex DoS.** Field `validation.pattern` is author-supplied. Length caps reduce but do not eliminate pathological cases.
- **Tokens in WebSocket URLs.** Browsers cannot set headers on WebSockets, so the token travels in the query string and
  can appear in reverse-proxy logs. Use short-lived tokens and scrub `token=` from access logs.
- **Single process.** Rate limits and the delivery worker are in-memory/per-process; do not run replicas without a shared
  store. SQLite is a single-writer database.
- **Secret handling.** `JWT_SECRET` is a symmetric key: anyone holding it can mint owner tokens. Rotation invalidates all
  tokens. There is no refresh-token flow, user accounts, password login, or SSO.
- **No TLS termination.** Run behind a reverse proxy (Caddy/nginx/Traefik) with HTTPS; set `TRUST_PROXY=true` only then.
- **No encryption at rest** of the SQLite file; submissions are stored as plaintext JSON. Use disk encryption.
- Respondent data may be personal data: you are responsible for retention settings, consent and deletion requests.
- Not independently audited or penetration tested.

## Tests

```bash
cd server && npm test      # in-memory SQLite; API (Hono app.request) + real WebSocket relay tests
```
