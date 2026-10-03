import { expect, test } from "bun:test";
import { HttpError, request } from "../src/http.ts";
import { json, mockFetch } from "./mock.ts";

test("retries rate limits, honouring retry-after", async () => {
  const waits: number[] = [];
  let attempts = 0;
  const { fetch } = mockFetch(() => (++attempts < 3 ? json({}, { "retry-after": "2" }, 429) : json({ ok: true })));
  const response = await request("https://example.com/x", {}, { fetch, sleep: async (ms) => void waits.push(ms) });
  expect(await response.json()).toEqual({ ok: true });
  expect(waits).toEqual([2000, 2000]);
});

test("gives up after the retry limit", async () => {
  const { fetch, calls } = mockFetch(() => json({}, {}, 503));
  await expect(request("https://example.com/x", {}, { fetch, sleep: async () => {}, retries: 2 })).rejects.toThrow(HttpError);
  expect(calls).toHaveLength(3);
});

test("errors name the path and status but not the response body", async () => {
  const { fetch } = mockFetch(() => json({ message: "project acme/secret not found" }, {}, 404));
  const error = (await request("https://example.com/api/v4/projects/9?x=1", {}, { fetch }).catch((e) => e)) as HttpError;
  expect(error.status).toBe(404);
  expect(error.message).toBe("GET /api/v4/projects/9 failed with HTTP 404");
});
