export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** POST JSON and return parsed JSON; throws a descriptive error on non-2xx. */
export async function postJson(
  fetchImpl: FetchLike,
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  timeoutMs = 120_000
): Promise<any> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 300)}`);
  }
}

export const trimSlash = (u: string): string => u.replace(/\/+$/, "");
