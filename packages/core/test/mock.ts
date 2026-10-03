import type { Fetch } from "../src/model.ts";

export interface Call {
  url: URL;
  method: string;
  headers: Headers;
  body: any;
}

export type Route = (call: Call) => Response | undefined;

export function mockFetch(route: Route): { fetch: Fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: Fetch = async (input, init) => {
    const call: Call = {
      url: new URL(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const response = route(call);
    if (!response) throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    return response;
  };
  return { fetch, calls };
}

export function json(body: unknown, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

export const noSleep = async () => {};
