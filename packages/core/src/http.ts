import type { Fetch } from "./model.ts";

export interface HttpOptions {
  fetch?: Fetch;
  /** Waits between retries. Replaced in tests. */
  sleep?: (ms: number) => Promise<void>;
  retries?: number;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * Fetches with retries on rate limits and server errors. Error messages carry
 * the status and the URL path only, never response bodies, which can name
 * private repos.
 */
export async function request(
  url: string,
  init: RequestInit,
  options: HttpOptions = {},
): Promise<Response> {
  const fetchFn = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const retries = options.retries ?? 3;

  for (let attempt = 0; ; attempt++) {
    const response = await fetchFn(url, init);
    if (response.ok) return response;

    if (attempt < retries && RETRY_STATUSES.has(response.status)) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000);
      continue;
    }

    throw new HttpError(response.status, `${init.method ?? "GET"} ${new URL(url).pathname} failed with HTTP ${response.status}`);
  }
}
