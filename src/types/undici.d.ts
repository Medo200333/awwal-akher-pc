declare module "node:undici" {
  export class Agent {
    constructor(opts?: { connect?: { rejectUnauthorized?: boolean } });
  }

  export function fetch(
    input: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      dispatcher?: Agent;
      signal?: AbortSignal;
    },
  ): Promise<{
    status: number;
    headers: { get(name: string): string | null };
    text(): Promise<string>;
  }>;
}
