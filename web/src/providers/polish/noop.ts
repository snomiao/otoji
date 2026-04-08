import type { PolishProvider } from "../types";

export class NoopPolishProvider implements PolishProvider {
  readonly id = "noop";
  readonly name = "No polish";
  isAvailable(): boolean { return true; }
  async polish(text: string): Promise<string> { return text; }
}
