import { AiProvider, EmailAdapter, HttpClient, HttpRequest, HttpResponse, SecretVault, WriteAdapter } from "./types";

/** Checks an outbound URL against an allowlist. Empty/missing allowlist denies everything. */
export function checkOutboundUrl(rawUrl: string, allowed: string[] | undefined): { ok: boolean; reason?: string } {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, reason: `Invalid URL '${rawUrl}'` };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, reason: `Protocol '${u.protocol}' is not allowed` };
  if (u.username || u.password) return { ok: false, reason: "URLs with embedded credentials are not allowed" };
  if (!allowed || allowed.length === 0) return { ok: false, reason: "No outbound domains are allowlisted" };
  const host = u.hostname.toLowerCase();
  const ok = allowed.some((raw) => {
    const p = raw.trim().toLowerCase();
    if (p.indexOf("*.") === 0) {
      const suffix = p.slice(1); // ".example.com"
      return host.length > suffix.length && host.slice(host.length - suffix.length) === suffix;
    }
    return host === p;
  });
  return ok ? { ok } : { ok, reason: `Domain '${host}' is not in the outbound allowlist` };
}

/** Real HTTP client based on fetch. Redirects are refused so the allowlist can't be bypassed. */
export function createFetchHttpClient(fetchImpl: typeof fetch = fetch): HttpClient {
  return {
    async request(req: HttpRequest): Promise<HttpResponse> {
      const hasBody = req.body !== undefined && req.method !== "GET";
      const headers = { ...req.headers };
      if (hasBody && typeof req.body !== "string" && !Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) {
        headers["Content-Type"] = "application/json";
      }
      const res = await fetchImpl(req.url, {
        method: req.method,
        headers,
        body: hasBody ? (typeof req.body === "string" ? req.body : JSON.stringify(req.body)) : undefined,
        redirect: "error"
      });
      const text = await res.text();
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        /* keep text */
      }
      return { status: res.status, body };
    }
  };
}

// ---- Mock adapters (tests and the editor's test-run panel) ----

export interface MockCalls<T> {
  calls: T[];
}

export function createMockAi(respond?: (req: { prompt: string; system?: string; schema?: any }) => unknown): AiProvider & MockCalls<any> {
  const calls: any[] = [];
  return {
    calls,
    async generate(req) {
      calls.push(req);
      return respond ? respond(req) : { text: `[mock ai] ${req.prompt.slice(0, 80)}` };
    }
  };
}

export function createMockHttp(respond?: (req: HttpRequest) => HttpResponse): HttpClient & MockCalls<HttpRequest> {
  const calls: HttpRequest[] = [];
  return {
    calls,
    async request(req) {
      calls.push(req);
      return respond ? respond(req) : { status: 200, body: { mock: true, url: req.url } };
    }
  };
}

export function createMockEmail(): EmailAdapter & MockCalls<{ to: string; subject: string; body: string }> {
  const calls: any[] = [];
  return {
    calls,
    async send(msg) {
      calls.push(msg);
      return { queued: true };
    }
  };
}

export function createMockWrite(): WriteAdapter & MockCalls<{ target: string; data: unknown }> {
  const calls: any[] = [];
  return {
    calls,
    async write(req) {
      calls.push(req);
      return { written: true };
    }
  };
}

export function createMemoryVault(secrets: Record<string, string>): SecretVault {
  return {
    get(name) {
      return Object.prototype.hasOwnProperty.call(secrets, name) ? secrets[name] : undefined;
    }
  };
}
