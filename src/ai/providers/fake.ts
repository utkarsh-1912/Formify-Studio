import type { AiProvider, GenerateOptions, ProviderKind } from "../types";

type Responder = string | ((opts: GenerateOptions, call: number) => string | Promise<string>);

/** Deterministic provider for tests and demos. Never touches the network. */
export class FakeProvider implements AiProvider {
  readonly calls: GenerateOptions[] = [];
  available = true;

  constructor(
    private responders: Responder | Responder[],
    readonly id = "fake",
    readonly kind: ProviderKind = "local",
    readonly label = "Fake provider"
  ) {}

  async isAvailable() {
    return this.available;
  }

  async generate(opts: GenerateOptions): Promise<string> {
    const n = this.calls.push(opts) - 1;
    const r = Array.isArray(this.responders)
      ? this.responders[Math.min(n, this.responders.length - 1)]
      : this.responders;
    return typeof r === "function" ? r(opts, n) : r;
  }
}
