import { describe, expect, test } from "bun:test";
import { collect, parseCache } from "../src/collect.ts";
import { githubRoute, gitlabRoute, NOW, PRIVATE_NAMES } from "./fixtures.ts";
import { mockFetch } from "./mock.ts";

const route = (base?: string) => {
  const gitlab = gitlabRoute(base);
  return mockFetch((call) => githubRoute(call) ?? gitlab(call)).fetch;
};

describe("collect", () => {
  test("combines both hosts", async () => {
    const { activity } = await collect({ githubToken: "a", gitlabToken: "b", fetch: route(), now: NOW });
    expect(activity.hosts.map((host) => host.host)).toEqual(["github", "gitlab"]);
    expect(activity.totals.contributions).toBe(30);
    expect(activity.totals.stars).toBe(8);
    expect(activity.days["2026-10-01"]).toBe(5);
    expect(Object.keys(activity.days)).toEqual([...Object.keys(activity.days)].sort());
    expect(activity.languages.Swift).toEqual({ size: 5500, repos: 2, color: "#F05138" });
    expect(activity.generatedAt).toBe(NOW.toISOString());
  });

  test("no private name reaches the activity data or the cache", async () => {
    const result = await collect({
      githubToken: "a",
      gitlabToken: "b",
      gitlabUrl: "https://git.secretcorp.internal",
      fetch: route("https://git.secretcorp.internal"),
      now: NOW,
    });
    const output = JSON.stringify({ activity: result.activity, cache: result.cache }).toLowerCase();
    for (const name of PRIVATE_NAMES) expect(output).not.toContain(name.toLowerCase());
    // GitHub: name and owner/name. GitLab: name (same as its path), both full paths, the hostname.
    expect(result.sensitive.size).toBe(6);
  });

  test("the cache round-trips", async () => {
    const first = await collect({ githubToken: "a", gitlabToken: "b", fetch: route(), now: NOW });
    const cache = parseCache(JSON.stringify(first.cache));
    expect(cache).toEqual(first.cache);
    const second = await collect({ githubToken: "a", gitlabToken: "b", fetch: route(), now: NOW, cache });
    expect(second.activity).toEqual(first.activity);
  });

  test("needs at least one token", async () => {
    await expect(collect({ fetch: route(), now: NOW })).rejects.toThrow("Set at least one of github-token and gitlab-token.");
  });
});

describe("parseCache", () => {
  test("starts fresh on missing, broken or old caches", () => {
    expect(parseCache(undefined)).toBeUndefined();
    expect(parseCache("{not json")).toBeUndefined();
    expect(parseCache(JSON.stringify({ version: 0 }))).toBeUndefined();
  });
});
